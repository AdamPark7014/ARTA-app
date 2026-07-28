import {
  BadRequestException,
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
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { EntityKey } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { DigestsService } from '../digests/digests.service';
import { ALL_ROLES, hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { assertTenantAdminAccess } from '../common/tenant';
import { assertUserSeatAvailable } from '../common/plan-limits';

class CreateInviteDto {
  @IsEmail() email!: string;
  @IsString() roleKey!: string;
  @IsArray() entities!: string[];
  @IsOptional() @IsArray() permissions?: string[];
}

class AcceptInviteDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() title?: string;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** WEB_ORIGIN may be a comma-separated CORS allowlist (see main.ts corsOrigins) — use the first entry as the canonical link target. */
function webOrigin() {
  const raw =
    process.env.WEB_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_WEB_URL ||
    'http://localhost:3000';
  return raw.split(',')[0].trim().replace(/\/$/, '');
}

@Controller()
export class OrgInvitesController {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private digests: DigestsService,
  ) {}

  private assertAdmin(user: { roleKey: string; permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección gestiona invitaciones');
    }
  }

  private assertOrgAccess(
    user: { roleKey: string; permissions: string[]; organizationId?: string | null },
    orgId: string,
  ) {
    this.assertAdmin(user);
    // Only super_admin crosses tenants — dir_general is scoped to their org.
    assertTenantAdminAccess(user, orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:id/members')
  async members(
    @Req() req: { user: { roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Param('id') id: string,
  ) {
    this.assertOrgAccess(req.user, id);
    return this.prisma.user.findMany({
      where: { organizationId: id },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        title: true,
        roleKey: true,
        entities: true,
        permissions: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:id/invites')
  async listInvites(
    @Req() req: { user: { roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Param('id') id: string,
  ) {
    this.assertOrgAccess(req.user, id);
    return this.prisma.orgInvite.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true,
        email: true,
        roleKey: true,
        entities: true,
        permissions: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        invitedById: true,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:id/invites')
  async createInvite(
    @Req()
    req: {
      user: { id: string; roleKey: string; permissions: string[]; organizationId?: string | null };
    },
    @Param('id') id: string,
    @Body() body: CreateInviteDto,
  ) {
    this.assertOrgAccess(req.user, id);
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org || !org.active) throw new NotFoundException('Organización no encontrada');

    const email = body.email.trim().toLowerCase();
    if (!ALL_ROLES.includes(body.roleKey as RoleKey)) {
      throw new BadRequestException('Rol inválido');
    }
    const entities = (body.entities || []).filter((e) => e === 'ARTA' || e === 'EXPLANADA') as EntityKey[];
    if (!entities.length) throw new BadRequestException('Elige al menos una entidad');

    await assertUserSeatAvailable(this.prisma, id);

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser?.organizationId === id) {
      throw new BadRequestException('Ese email ya es miembro de la organización');
    }

    const open = await this.prisma.orgInvite.findFirst({
      where: {
        organizationId: id,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (open) throw new BadRequestException('Ya hay una invitación pendiente para ese email');

    const rawToken = randomBytes(32).toString('hex');
    const invite = await this.prisma.orgInvite.create({
      data: {
        organizationId: id,
        email,
        roleKey: body.roleKey,
        entities,
        permissions: body.permissions || [],
        tokenHash: hashToken(rawToken),
        invitedById: req.user.id,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    const acceptUrl = `${webOrigin()}/invite/${rawToken}`;
    await this.prisma.notificationOutbox.create({
      data: {
        organizationId: id,
        channel: 'email',
        toAddr: email,
        subject: `Invitación a ${org.name} · ARTA Ops`,
        bodyText: [
          `Te invitaron a ${org.name} en ARTA Ops.`,
          `Rol: ${body.roleKey}`,
          `Entidades: ${entities.join(', ')}`,
          '',
          `Acepta aquí (válido 7 días):`,
          acceptUrl,
          '',
          `Si no esperabas este correo, ignóralo.`,
        ].join('\n'),
        metaJson: { kind: 'org.invite', inviteId: invite.id, organizationId: id },
        status: 'pending',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'org.invite.create',
        resource: 'OrgInvite',
        resourceId: invite.id,
        metaJson: { email, organizationId: id, roleKey: body.roleKey },
      },
    });

    let emailFlushed = false;
    try {
      const flushed = await this.digests.flushOutbox(5);
      emailFlushed = (flushed?.sent ?? 0) > 0;
    } catch {
      emailFlushed = false;
    }

    return {
      id: invite.id,
      email: invite.email,
      roleKey: invite.roleKey,
      entities: invite.entities,
      expiresAt: invite.expiresAt,
      // The token proves the recipient controls that inbox — echoing it back to
      // whoever *created* the invite (a different tenant's admin, in the SaaS
      // multi-org case) would let them complete the accept flow themselves
      // without ever touching the target inbox. Only expose it out-of-band
      // (email) in production; keep it in the response for local/dev/test
      // flows that have no mail transport configured.
      acceptUrl: process.env.NODE_ENV === 'production' ? undefined : acceptUrl,
      outbox: true,
      emailFlushed,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('organizations/:id/invites/:inviteId')
  async revokeInvite(
    @Req() req: { user: { id: string; roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    this.assertOrgAccess(req.user, id);
    const invite = await this.prisma.orgInvite.findFirst({
      where: { id: inviteId, organizationId: id },
    });
    if (!invite) throw new NotFoundException();
    if (invite.acceptedAt) throw new BadRequestException('Ya fue aceptada');
    await this.prisma.orgInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('invites/:token')
  async preview(@Param('token') token: string) {
    const invite = await this.prisma.orgInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { id: true, name: true, slug: true, plan: true } } },
    });
    if (!invite || invite.revokedAt) throw new NotFoundException('Invitación no válida');
    if (invite.acceptedAt) throw new BadRequestException('Invitación ya aceptada');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invitación expirada');

    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });

    return {
      email: invite.email,
      roleKey: invite.roleKey,
      entities: invite.entities,
      expiresAt: invite.expiresAt,
      organization: invite.organization,
      existingAccount: !!existing,
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invites/:token/accept')
  async accept(
    @Param('token') token: string,
    @Body() body: AcceptInviteDto,
    @Req() req: { headers: { 'user-agent'?: string }; ip?: string; socket?: { remoteAddress?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const invite = await this.prisma.orgInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite || invite.revokedAt) throw new NotFoundException('Invitación no válida');
    if (invite.acceptedAt) throw new BadRequestException('Invitación ya aceptada');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invitación expirada');

    await assertUserSeatAvailable(this.prisma, invite.organizationId, {
      excludeInviteId: invite.id,
    });

    const email = invite.email;
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      if (user.organizationId === invite.organizationId) {
        throw new BadRequestException('Ya eres miembro');
      }
      // Re-home account to invited org (SaaS v1: un tenant primario)
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          organizationId: invite.organizationId,
          roleKey: invite.roleKey,
          entities: invite.entities,
          permissions: invite.permissions,
          fullName: body.fullName || user.fullName,
          title: body.title ?? user.title,
          active: true,
          passwordHash: await bcrypt.hash(body.password, 10),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: body.fullName,
          title: body.title || null,
          passwordHash: await bcrypt.hash(body.password, 10),
          roleKey: invite.roleKey,
          entities: invite.entities,
          permissions: invite.permissions,
          organizationId: invite.organizationId,
          active: true,
        },
      });
    }

    await this.prisma.orgMembership.upsert({
      where: {
        organizationId_userId: { organizationId: invite.organizationId, userId: user.id },
      },
      create: {
        organizationId: invite.organizationId,
        userId: user.id,
        roleKey: invite.roleKey,
      },
      update: { roleKey: invite.roleKey },
    });

    await this.prisma.orgInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'org.invite.accept',
        resource: 'OrgInvite',
        resourceId: invite.id,
        metaJson: { organizationId: invite.organizationId, email },
      },
    });

    const ip = req.ip || req.socket?.remoteAddress;
    return this.auth.issueSessionForUserId(
      user.id,
      { userAgent: req.headers['user-agent'], ip },
      res,
    );
  }
}
