import {
  BadRequestException,
  Body,
  ConflictException,
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
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_DEFAULT_ENTITIES,
  ROLE_HINTS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
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
    const allowed = new Set(ASSIGNABLE_PERMISSIONS as string[]);
    const permissions = (dto.permissions || []).filter((p) => allowed.has(p));
    const email = dto.email.toLowerCase().trim();
    const entities =
      dto.entities?.length > 0
        ? dto.entities
        : ROLE_DEFAULT_ENTITIES[dto.roleKey as RoleKey] || (['ARTA'] as EntityKey[]);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, active: true, organizationId: true },
    });
    if (existing) {
      if (existing.organizationId && existing.organizationId !== orgId) {
        throw new ConflictException('Ese email pertenece a otra organización');
      }
      if (existing.active) {
        throw new ConflictException('Ya existe un usuario activo con ese email');
      }
      // Reactivar baja anterior con los datos nuevos
      const revived = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: dto.fullName,
          title: dto.title,
          roleKey: dto.roleKey,
          entities,
          permissions,
          passwordHash,
          active: true,
          failedLoginCount: 0,
          lockedUntil: null,
          organizationId: orgId,
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
      await this.prisma.orgMembership.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId: existing.id } },
        create: { organizationId: orgId, userId: existing.id, roleKey: dto.roleKey },
        update: { roleKey: dto.roleKey },
      });
      await this.prisma.userSession.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return {
        ...revived,
        roleLabel: ROLE_LABELS[revived.roleKey as RoleKey] ?? revived.roleKey,
        reactivated: true,
      };
    }

    await assertUserSeatAvailable(this.prisma, orgId);
    const created = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName,
        title: dto.title,
        roleKey: dto.roleKey,
        entities,
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
    return {
      ...created,
      roleLabel: ROLE_LABELS[created.roleKey as RoleKey] ?? created.roleKey,
      reactivated: false,
    };
  }

  @Get('roles')
  roles(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertUsersManage(req.user);
    const keys =
      req.user.roleKey === 'super_admin' ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'super_admin');
    return keys.map((r) => ({
      key: r,
      label: ROLE_LABELS[r],
      hint: ROLE_HINTS[r],
      defaultEntities: ROLE_DEFAULT_ENTITIES[r],
      permissions: ROLE_PERMISSIONS[r] || [],
    }));
  }

  @Get('permissions/catalog')
  permissionsCatalog(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    this.assertUsersManage(req.user);
    return ASSIGNABLE_PERMISSIONS.map((key) => ({
      key,
      label: PERMISSION_LABELS[key] || key,
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
      /** Limpia bloqueo por intentos fallidos de login */
      unlock?: boolean;
    },
  ) {
    this.assertUsersManage(req.user);
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { organizationId: true, roleKey: true, email: true },
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
      const nextEmail = body.email.trim().toLowerCase();
      if (nextEmail !== target.email) {
        const clash = await this.prisma.user.findUnique({
          where: { email: nextEmail },
          select: { id: true },
        });
        if (clash) throw new BadRequestException('Ese email ya está en uso');
      }
      data.email = nextEmail;
    }
    if (body.permissions) {
      const allowed = new Set(ASSIGNABLE_PERMISSIONS as string[]);
      data.permissions = body.permissions.filter((p) => allowed.has(p));
    }
    if (body.password && body.password.length >= 6) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }
    if (body.unlock || body.active === true) {
      data.failedLoginCount = 0;
      data.lockedUntil = null;
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
