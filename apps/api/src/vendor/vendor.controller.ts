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
  UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canAccessEventOps,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';

type AuthUser = { id: string; roleKey: string; entities: string[]; permissions: string[] };

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

@Controller('vendor')
export class VendorController {
  constructor(private prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
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
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    const pinHash = await bcrypt.hash(dto.pin, 10);
    const created = await this.prisma.vendorPin.create({
      data: {
        eventId: dto.eventId,
        label: dto.label,
        pinHash,
        scopes: dto.scopes?.length ? dto.scopes : ['files', 'checklists'],
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
      pin: dto.pin, // one-time reveal
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('pins/:id')
  async deactivate(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.VENDOR_PIN)) {
      throw new ForbiddenException();
    }
    const pin = await this.prisma.vendorPin.findUnique({ where: { id }, include: { event: true } });
    if (!pin) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, pin.event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    await this.prisma.vendorPin.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  /** Público: login con PIN */
  @Post('login')
  async login(@Body() dto: VendorLoginDto) {
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
          },
        },
      },
    });
    if (!pin || !pin.active) throw new ForbiddenException('PIN inválido');
    if (pin.expiresAt && pin.expiresAt < new Date()) throw new ForbiddenException('PIN expirado');
    const ok = await bcrypt.compare(dto.pin, pin.pinHash);
    if (!ok) throw new ForbiddenException('PIN incorrecto');

    await this.prisma.vendorPin.update({ where: { id: pin.id }, data: { lastUsedAt: new Date() } });

    const files = pin.scopes.includes('files')
      ? await this.prisma.eventFile.findMany({
          where: { eventId: pin.eventId },
          orderBy: { createdAt: 'desc' },
          take: 40,
          select: { id: true, fileName: true, url: true, kind: true, createdAt: true },
        })
      : [];

    const checklists = pin.scopes.includes('checklists')
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

    return {
      token: `vendor:${pin.id}`,
      event: pin.event,
      scopes: pin.scopes,
      label: pin.label,
      files,
      checklists,
    };
  }
}
