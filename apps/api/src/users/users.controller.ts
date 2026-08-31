import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ASSIGNABLE_PERMISSIONS,
  ALL_ROLES,
  hasPermission,
  PERMISSIONS,
  ROLE_LABELS,
  type RoleKey,
} from '../common/rbac/roles';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertUserSeatAvailable } from '../common/plan-limits';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() fullName!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() roleKey!: string;
  entities!: EntityKey[];
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsArray() permissions?: string[];
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  private assertUsersManage(user: { roleKey: string; permissions?: string[] }) {
    if (!hasPermission(user.roleKey as RoleKey, user.permissions || [], PERMISSIONS.USERS_MANAGE)) {
      throw new ForbiddenException('Solo Arturo y José Luis (dirección) gestionan usuarios');
    }
  }

  private assertAssignableRole(actorRole: string, roleKey: string) {
    if (!ALL_ROLES.includes(roleKey as RoleKey)) {
      throw new ForbiddenException('Rol inválido');
    }
    if (roleKey === 'super_admin' && actorRole !== 'super_admin') {
      throw new ForbiddenException('Solo super_admin puede otorgar ese rol');
    }
  }

  /**
   * Directorio para asignar tareas (cualquier autenticado).
   *
   * Junta 2026-08-28: se asignan tareas «entre todos los integrantes de la
   * organización», así que aquí NO se filtra por entidad — un logístico de
   * Arta puede pedirle apoyo a alguien que solo opera el Auditorio.
   */
  @Get('directory')
  directory(
    @Req() req: { user: { entities: string[]; roleKey: string; organizationId?: string | null } },
  ) {
    return this.prisma.user.findMany({
      where: {
        active: true,
        organizationId: tenantIdOf(req.user),
      },
      select: { id: true, fullName: true, email: true, title: true, roleKey: true, entities: true },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get()
  async list(
    @Req()
    req: {
      user: { id: string; roleKey: string; permissions: string[]; organizationId?: string | null };
    },
  ) {
    this.assertUsersManage(req.user);
    const users = await this.prisma.user.findMany({
      where: { organizationId: tenantIdOf(req.user) },
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
        organizationId: true,
      },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({
      ...u,
      roleLabel: ROLE_LABELS[u.roleKey as RoleKey] ?? u.roleKey,
    }));
  }

  @Post()
  async create(
    @Req() req: { user: { id: string; roleKey: string; permissions: string[] } },
    @Body() dto: CreateUserDto,
  ) {
    this.assertUsersManage(req.user);
    this.assertAssignableRole(req.user.roleKey, dto.roleKey);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const actor = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { organizationId: true },
    });
    const orgId = actor?.organizationId || 'org_arta_internal';
    await assertUserSeatAvailable(this.prisma, orgId);
    const allowed = new Set(ASSIGNABLE_PERMISSIONS as string[]);
    const permissions = (dto.permissions || []).filter((p) => allowed.has(p));
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        title: dto.title,
        roleKey: dto.roleKey,
        entities: dto.entities,
        permissions,
        passwordHash,
        active: true,
        organizationId: orgId,
        memberships: {
          create: { organizationId: orgId, roleKey: dto.roleKey },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        title: true,
        roleKey: true,
        entities: true,
        permissions: true,
        active: true,
        organizationId: true,
      },
    });
  }

  @Get('roles')
  roles(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertUsersManage(req.user);
    const keys =
      req.user.roleKey === 'super_admin' ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'super_admin');
    return keys.map((r) => ({ key: r, label: ROLE_LABELS[r] }));
  }

  @Get('permissions/catalog')
  permissionsCatalog(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertUsersManage(req.user);
    return ASSIGNABLE_PERMISSIONS.map((key) => ({
      key,
      label: key
        .split('.')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' · '),
    }));
  }

  @Patch(':id')
  async update(
    @Req()
    req: {
      user: { id: string; roleKey: string; permissions: string[]; organizationId?: string | null };
    },
    @Param('id') id: string,
    @Body()
    body: {
      email?: string;
      fullName?: string;
      title?: string;
      roleKey?: string;
      entities?: EntityKey[];
      active?: boolean;
      password?: string;
      permissions?: string[];
    },
  ) {
    this.assertUsersManage(req.user);
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { organizationId: true, roleKey: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    assertSameTenant(req.user, target.organizationId);
    if (body.roleKey) this.assertAssignableRole(req.user.roleKey, body.roleKey);
    if (
      target.roleKey === 'super_admin' &&
      req.user.roleKey !== 'super_admin' &&
      (body.roleKey || body.active === false || body.permissions)
    ) {
      throw new ForbiddenException('No puedes modificar un super_admin');
    }

    const data: Record<string, unknown> = {
      fullName: body.fullName,
      title: body.title,
      roleKey: body.roleKey,
      entities: body.entities,
      active: body.active,
    };
    if (body.email?.trim()) {
      data.email = body.email.trim().toLowerCase();
    }
    if (body.permissions) {
      const allowed = new Set(ASSIGNABLE_PERMISSIONS as string[]);
      data.permissions = body.permissions.filter((p) => allowed.has(p));
    }
    if (body.password && body.password.length >= 6) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        title: true,
        roleKey: true,
        entities: true,
        permissions: true,
        active: true,
      },
    });
    if (body.roleKey && target.organizationId) {
      await this.prisma.orgMembership.updateMany({
        where: { userId: id, organizationId: target.organizationId },
        data: { roleKey: body.roleKey },
      });
    }
    if (body.password || body.active === false) {
      await this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ...updated, roleLabel: ROLE_LABELS[updated.roleKey as RoleKey] ?? updated.roleKey };
  }

  /**
   * Eliminar acceso: desactiva + cierra sesiones.
   * Conserva el row (historial de auditoría / tareas).
   */
  @Delete(':id')
  async remove(
    @Req()
    req: {
      user: { id: string; roleKey: string; permissions: string[]; organizationId?: string | null };
    },
    @Param('id') id: string,
  ) {
    this.assertUsersManage(req.user);
    if (id === req.user.id) {
      throw new ForbiddenException('No puedes eliminarte a ti mismo');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { organizationId: true, roleKey: true, fullName: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    assertSameTenant(req.user, target.organizationId);
    if (target.roleKey === 'super_admin' && req.user.roleKey !== 'super_admin') {
      throw new ForbiddenException('No puedes eliminar un super_admin');
    }
    await this.prisma.user.update({
      where: { id },
      data: { active: false },
    });
    await this.prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'user.deactivate',
        resource: 'User',
        resourceId: id,
        metaJson: { fullName: target.fullName },
      },
    });
    return { ok: true, id, active: false };
  }

  @Get('me/summary')
  async mySummary(@Req() req: { user: { id: string } }) {
    return this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        title: true,
        roleKey: true,
        entities: true,
        permissions: true,
      },
    });
  }
}
