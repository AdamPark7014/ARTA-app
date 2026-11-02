import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { hasPermission, PERMISSIONS, ROLE_DEFAULT_ENTITIES, type RoleKey } from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';

type AuthUser = {
  id: string;
  roleKey: string;
  permissions?: string[] | null;
  organizationId?: string | null;
};

class CreatePracticanteDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  /** Sin correo se le arma un usuario propio de la temporada. */
  @IsOptional() @IsEmail() email?: string;
  @IsDateString() expiresAt!: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsBoolean() canPublish?: boolean;
}

class UpdatePracticanteDto {
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsBoolean() canPublish?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

const SELECT = {
  id: true,
  email: true,
  fullName: true,
  active: true,
  permissions: true,
  accessExpiresAt: true,
  accessLabel: true,
  createdAt: true,
  sessions: { orderBy: { lastSeenAt: 'desc' as const }, take: 1, select: { lastSeenAt: true } },
} as const;

function newPassword() {
  return randomBytes(9).toString('base64url');
}

function slug(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30);
}

function present(row: {
  permissions: string[];
  sessions?: Array<{ lastSeenAt: Date }>;
  accessExpiresAt: Date | null;
  active: boolean;
  [k: string]: unknown;
}) {
  const { sessions, permissions, ...rest } = row;
  return {
    ...rest,
    canPublish: permissions.includes(PERMISSIONS.STUDIO_PUBLISH),
    lastSeenAt: sessions?.[0]?.lastSeenAt ?? null,
    expired: !!row.accessExpiresAt && row.accessExpiresAt.getTime() < Date.now(),
  };
}

/**
 * Perfiles de practicante por temporada (01-11-2026), desde Studio: se generan con vigencia, se
 * desactivan y se renuevan. Editan el sitio y suben testigos de publicidad. La contraseña se enseña
 * una sola vez, al generarla; aquí no se guarda en claro.
 */
@Controller('practicantes')
@UseGuards(JwtAuthGuard)
export class PracticantesController {
  constructor(private readonly prisma: PrismaService) {}

  private assertManage(user: AuthUser) {
    if (!hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.PRACTICANTES_MANAGE)) {
      throw new ForbiddenException('Los perfiles de practicante los generan Chacho o Arturo');
    }
  }

  private async find(user: AuthUser, id: string) {
    const row = await this.prisma.user.findFirst({
      where: { id, roleKey: 'practicante', organizationId: tenantIdOf(user as never) },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Perfil no encontrado');
    return row;
  }

  private async closeSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private futureDate(raw: string) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida');
    // La vigencia cubre el último día completo.
    date.setUTCHours(23, 59, 59, 999);
    if (date.getTime() < Date.now()) throw new BadRequestException('La vigencia tiene que ser una fecha futura');
    return date;
  }

  @Get()
  async list(@Req() req: { user: AuthUser }) {
    this.assertManage(req.user);
    const rows = await this.prisma.user.findMany({
      where: { roleKey: 'practicante', organizationId: tenantIdOf(req.user as never) },
      select: SELECT,
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(present);
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreatePracticanteDto) {
    this.assertManage(req.user);
    const organizationId = tenantIdOf(req.user as never);
    const accessExpiresAt = this.futureDate(dto.expiresAt);
    const email =
      dto.email?.toLowerCase().trim() ||
      `practicante.${slug(dto.fullName)}.${randomBytes(2).toString('hex')}@artaproducciones.com`;
    const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new ConflictException('Ya existe un usuario con ese correo');
    const password = newPassword();
    const created = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        title: 'Practicante',
        roleKey: 'practicante',
        entities: ROLE_DEFAULT_ENTITIES.practicante,
        permissions: dto.canPublish === false ? [] : [PERMISSIONS.STUDIO_PUBLISH],
        passwordHash: await bcrypt.hash(password, 12),
        active: true,
        organizationId,
        accessExpiresAt,
        accessLabel: dto.label?.trim() || null,
        memberships: { create: { organizationId, roleKey: 'practicante' } },
      },
      select: SELECT,
    });
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'practicante.create', resource: 'User', resourceId: created.id, metaJson: { accessExpiresAt } },
    });
    return { ...present(created), password };
  }

  /** Renovar, cambiar la temporada, dar o quitar publicar, desactivar y reactivar. */
  @Patch(':id')
  async update(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() dto: UpdatePracticanteDto) {
    this.assertManage(req.user);
    const current = await this.find(req.user, id);
    const permissions =
      dto.canPublish === undefined
        ? undefined
        : dto.canPublish
          ? [...new Set([...current.permissions, PERMISSIONS.STUDIO_PUBLISH])]
          : current.permissions.filter((p) => p !== PERMISSIONS.STUDIO_PUBLISH);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.expiresAt ? { accessExpiresAt: this.futureDate(dto.expiresAt) } : {}),
        ...(dto.label !== undefined ? { accessLabel: dto.label.trim() || null } : {}),
        ...(permissions ? { permissions } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: SELECT,
    });
    // El permiso de publicar viaja en la sesión, y quien se desactiva sale de inmediato.
    if (dto.active === false || permissions) await this.closeSessions(id);
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'practicante.update', resource: 'User', resourceId: id, metaJson: { ...dto } },
    });
    return present(updated);
  }

  @Post(':id/password')
  async resetPassword(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.assertManage(req.user);
    await this.find(req.user, id);
    const password = newPassword();
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12), failedLoginCount: 0, lockedUntil: null },
    });
    await this.closeSessions(id);
    await this.prisma.auditLog.create({
      data: { userId: req.user.id, action: 'practicante.password', resource: 'User', resourceId: id },
    });
    return { password };
  }
}
