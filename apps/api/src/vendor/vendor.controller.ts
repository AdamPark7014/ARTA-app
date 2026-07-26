import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  hasPermission,
  canAccessEventOps,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { assertSameTenant } from '../common/tenant';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

type VendorJwt = {
  typ: 'vendor';
  pinId: string;
  eventId: string;
  scopes: string[];
  label: string;
};

class CreatePinDto {
  @IsString() eventId!: string;
  @IsString() label!: string;
  @IsString() @MinLength(4) pin!: string;
  @IsOptional() @IsArray() scopes?: string[];
  @IsOptional() @IsString() expiresAt?: string;
}

class VendorLoginDto {
  @IsString() pinId!: string;
  @IsString() pin!: string;
}

const VENDOR_COOKIE = 'arta_vendor';
const ALLOWED_SCOPES = new Set(['files', 'checklists', 'hospitality']);

function normalizeScopes(scopes?: string[]) {
  const list = (scopes || []).map((s) => s.trim().toLowerCase()).filter((s) => ALLOWED_SCOPES.has(s));
  return list.length ? [...new Set(list)] : ['files', 'checklists'];
}

@Controller('vendor')
export class VendorController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private setVendorCookie(res: Response, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(VENDOR_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearVendorCookie(res: Response) {
    res.clearCookie(VENDOR_COOKIE, { path: '/' });
  }

  private async loadPortalPayload(pin: {
    id: string;
    eventId: string;
    label: string;
    scopes: string[];
    event: {
      id: string;
      name: string;
      artist: string | null;
      venue: string | null;
      city: string | null;
      entity: string;
      status: string;
      startsAt: Date | null;
    };
  }) {
    const scopes = pin.scopes;
    const files = scopes.includes('files')
      ? await this.prisma.eventFile.findMany({
          where: { eventId: pin.eventId },
          orderBy: { createdAt: 'desc' },
          take: 60,
          select: { id: true, fileName: true, url: true, kind: true, createdAt: true },
        })
      : [];

    const checklists = scopes.includes('checklists')
      ? await this.prisma.checklistInstance.findMany({
          where: { eventId: pin.eventId },
          select: {
            id: true,
            title: true,
            progressPct: true,
            pdfUrl: true,
            template: { select: { key: true } },
          },
          orderBy: { title: 'asc' },
        })
      : [];

    let hospitality: typeof checklists = [];
    let hospitalityFiles: typeof files = [];
    if (scopes.includes('hospitality')) {
      const hospCandidates = await this.prisma.checklistInstance.findMany({
        where: {
          eventId: pin.eventId,
          OR: [
            { title: { contains: 'hospital', mode: 'insensitive' } },
            { title: { contains: 'rider', mode: 'insensitive' } },
            { title: { contains: 'catering', mode: 'insensitive' } },
            { title: { contains: 'hospedaje', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          progressPct: true,
          pdfUrl: true,
          template: { select: { key: true } },
        },
        orderBy: { title: 'asc' },
        take: 40,
      });
      const byKey = await this.prisma.checklistInstance.findMany({
        where: { eventId: pin.eventId },
        select: {
          id: true,
          title: true,
          progressPct: true,
          pdfUrl: true,
          template: { select: { key: true } },
        },
        orderBy: { title: 'asc' },
        take: 80,
      });
      const keyHit = byKey.filter((c) => {
        const k = String(c.template?.key || '').toUpperCase();
        return k.includes('HOSP') || k.includes('RIDER') || k.includes('CATER');
      });
      const map = new Map<string, (typeof checklists)[number]>();
      for (const c of [...hospCandidates, ...keyHit]) map.set(c.id, c);
      hospitality = Array.from(map.values());

      hospitalityFiles = await this.prisma.eventFile.findMany({
        where: {
          eventId: pin.eventId,
          OR: [
            { fileName: { contains: 'rider', mode: 'insensitive' } },
            { fileName: { contains: 'hospital', mode: 'insensitive' } },
            { fileName: { contains: 'catering', mode: 'insensitive' } },
            { kind: { contains: 'hospital', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { id: true, fileName: true, url: true, kind: true, createdAt: true },
      });
    }

    return {
      event: pin.event,
      scopes,
      label: pin.label,
      pinId: pin.id,
      files,
      checklists,
      hospitality: { checklists: hospitality, files: hospitalityFiles },
    };
  }

  private async resolveVendorToken(req: {
    cookies?: Record<string, string>;
    headers: { authorization?: string };
  }): Promise<VendorJwt> {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const raw = bearer || req.cookies?.[VENDOR_COOKIE];
    if (!raw) throw new ForbiddenException('Sesión vendor requerida');
    try {
      const payload = await this.jwt.verifyAsync<VendorJwt>(raw);
      if (payload?.typ !== 'vendor' || !payload.pinId) throw new Error('bad');
      return payload;
    } catch {
      throw new ForbiddenException('Sesión vendor inválida o expirada');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    assertSameTenant(req.user, event.organizationId);
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.vendorPin.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        scopes: true,
        expiresAt: true,
        active: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('pins')
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreatePinDto) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.VENDOR_PIN)) {
      throw new ForbiddenException('Sin permiso para generar PIN vendor');
    }
    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException();
    assertSameTenant(req.user, event.organizationId);
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    const scopes = normalizeScopes(dto.scopes);
    const pinHash = await bcrypt.hash(dto.pin, 10);
    const created = await this.prisma.vendorPin.create({
      data: {
        eventId: dto.eventId,
        label: dto.label,
        pinHash,
        scopes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        createdById: req.user.id,
      },
    });
    return {
      id: created.id,
      label: created.label,
      scopes: created.scopes,
      expiresAt: created.expiresAt,
      portalPath: `/v/${created.id}`,
      pin: dto.pin,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('pins/:id/rotate')
  async rotate(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { pin: string },
  ) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.VENDOR_PIN)) {
      throw new ForbiddenException();
    }
    if (!body?.pin || body.pin.length < 4) throw new ForbiddenException('PIN mínimo 4');
    const pin = await this.prisma.vendorPin.findUnique({ where: { id }, include: { event: true } });
    if (!pin) throw new NotFoundException();
    assertSameTenant(req.user, pin.event.organizationId);
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        pin.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    const pinHash = await bcrypt.hash(body.pin, 10);
    await this.prisma.vendorPin.update({
      where: { id },
      data: { pinHash, active: true },
    });
    return { id, pin: body.pin, portalPath: `/v/${id}` };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('pins/:id')
  async deactivate(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.VENDOR_PIN)) {
      throw new ForbiddenException();
    }
    const pin = await this.prisma.vendorPin.findUnique({ where: { id }, include: { event: true } });
    if (!pin) throw new NotFoundException();
    assertSameTenant(req.user, pin.event.organizationId);
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        pin.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    await this.prisma.vendorPin.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  /** Público: login con PIN → cookie HttpOnly + payload */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: VendorLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pin = await this.prisma.vendorPin.findUnique({
      where: { id: dto.pinId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            artist: true,
            venue: true,
            city: true,
            entity: true,
            status: true,
            startsAt: true,
          },
        },
      },
    });
    if (!pin || !pin.active) throw new ForbiddenException('PIN inválido');
    if (pin.expiresAt && pin.expiresAt < new Date()) throw new ForbiddenException('PIN expirado');
    const ok = await bcrypt.compare(dto.pin, pin.pinHash);
    if (!ok) throw new ForbiddenException('PIN incorrecto');

    await this.prisma.vendorPin.update({ where: { id: pin.id }, data: { lastUsedAt: new Date() } });

    const token = await this.jwt.signAsync(
      {
        typ: 'vendor',
        pinId: pin.id,
        eventId: pin.eventId,
        scopes: pin.scopes,
        label: pin.label,
      } satisfies VendorJwt,
      { expiresIn: '12h' },
    );
    this.setVendorCookie(res, token);

    const payload = await this.loadPortalPayload(pin);
    return { ...payload, token };
  }

  @Get('session')
  async session(
    @Req() req: { cookies?: Record<string, string>; headers: { authorization?: string } },
  ) {
    const claims = await this.resolveVendorToken(req);
    const pin = await this.prisma.vendorPin.findUnique({
      where: { id: claims.pinId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            artist: true,
            venue: true,
            city: true,
            entity: true,
            status: true,
            startsAt: true,
          },
        },
      },
    });
    if (!pin || !pin.active) throw new ForbiddenException('PIN desactivado');
    if (pin.expiresAt && pin.expiresAt < new Date()) throw new ForbiddenException('PIN expirado');
    return this.loadPortalPayload(pin);
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    this.clearVendorCookie(res);
    return { ok: true };
  }
}
