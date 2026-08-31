import {
  Body,
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
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ASSIGNABLE_PERMISSIONS, ALL_ROLES, hasPermission, PERMISSIONS, ROLE_LABELS, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertUserSeatAvailable } from '../common/plan-limits';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() fullName!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() roleKey!: string;
  entities!: EntityKey[];
  @IsString() @MinLength(6) password!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

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
    @Req() req: { user: { id: string; roleKey: string; permissions: string[]; organizationId?: string | null } },
  ) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE)) {
      throw new ForbiddenException('Solo Arturo y Chacho gestionan usuarios');
    }
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
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE)) {
      throw new ForbiddenException();
    }
    if (!ALL_ROLES.includes(dto.roleKey as RoleKey)) {
      throw new ForbiddenException('Rol inválido');
    }
    if (dto.roleKey === 'super_admin' && req.user.roleKey !== 'super_admin') {
      throw new ForbiddenException('Solo super_admin puede otorgar ese rol');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const actor = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { organizationId: true },
    });
    const orgId = actor?.organizationId || 'org_arta_internal';
    await assertUserSeatAvailable(this.prisma, orgId);
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        title: dto.title,
        roleKey: dto.roleKey,
        entities: dto.entities,
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
        active: true,
        organizationId: true,
      },
    });
  }

  @Get('roles')
  roles(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE)) {
      throw new ForbiddenException();
    }
    return ALL_ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] }));
  }

  @Get('permissions/catalog')
  permissionsCatalog(@Req() req: { user: { roleKey: string; permissions: string[] } }) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE)) {
      throw new ForbiddenException();
    }
    return ASSIGNABLE_PERMISSIONS.map((key) => ({ key, label: key }));
  }

  @Patch(':id')
  async update(
    @Req() req: { user: { roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Param('id') id: string,
    @Body()
    body: {
      fullName?: string;
      title?: string;
      roleKey?: string;
      entities?: EntityKey[];
      active?: boolean;
      password?: string;
      permissions?: string[];
    },
  ) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE)) {
      throw new ForbiddenException();
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    assertSameTenant(req.user, target.organizationId);
    if (body.roleKey) {
      if (!ALL_ROLES.includes(body.roleKey as RoleKey)) {
        throw new ForbiddenException('Rol inválido');
      }
      if (body.roleKey === 'super_admin' && req.user.roleKey !== 'super_admin') {
        throw new ForbiddenException('Solo super_admin puede otorgar ese rol');
      }
    }
    const data: Record<string, unknown> = {
      fullName: body.fullName,
      title: body.title,
      roleKey: body.roleKey,
      entities: body.entities,
      active: body.active,
    };
    if (body.permissions) {
      const allowed = new Set(ASSIGNABLE_PERMISSIONS as string[]);
      data.permissions = body.permissions.filter((p) => allowed.has(p));
    }
    if (body.password && body.password.length >= 6) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }
    return this.prisma.user.update({
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
