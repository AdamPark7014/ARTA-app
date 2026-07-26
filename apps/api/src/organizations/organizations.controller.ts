import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { OrgPlan } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import {
  assertTenantAdminAccess,
  DEFAULT_ORG_ID,
  isPlatformAdmin,
  tenantIdOf,
  type TenantUser,
} from '../common/tenant';

class CreateOrgDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
}

class PatchOrgDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsEnum(OrgPlan) plan?: OrgPlan;
  /** Enterprise/compliance policy: require every user in the org to enroll 2FA. */
  @IsOptional() @IsBoolean() require2fa?: boolean;
}

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: { roleKey: string; permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección gestiona organizaciones');
    }
  }

  @Get('me')
  async me(@Req() req: { user: { id: string; organizationId?: string | null; roleKey: string } }) {
    const id = tenantIdOf(req.user);
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, events: true, memberships: true } },
      },
    });
    return org || { id: DEFAULT_ORG_ID, name: 'Default', slug: 'arta', plan: 'ENTERPRISE' };
  }

  @Get()
  async list(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    this.assertAdmin(req.user);
    if (isPlatformAdmin(req.user)) {
      return this.prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { users: true, events: true } } },
      });
    }
    const id = tenantIdOf(req.user);
    return this.prisma.organization.findMany({
      where: { id },
      include: { _count: { select: { users: true, events: true } } },
    });
  }

  @Post()
  async create(
    @Req() req: { user: TenantUser & { permissions: string[] } },
    @Body() body: CreateOrgDto,
  ) {
    this.assertAdmin(req.user);
    if (!isPlatformAdmin(req.user)) {
      throw new ForbiddenException('Solo platform admin puede crear organizaciones');
    }
    const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException('Slug ya existe');
    return this.prisma.organization.create({
      data: {
        name: body.name,
        slug,
        plan: 'TRIAL',
        active: true,
        settingsJson: { entities: ['ARTA', 'EXPLANADA'] },
      },
    });
  }

  @Patch(':id')
  async patch(
    @Req() req: { user: TenantUser & { permissions: string[] } },
    @Param('id') id: string,
    @Body() body: PatchOrgDto,
  ) {
    this.assertAdmin(req.user);
    assertTenantAdminAccess(req.user, id);
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Organización no encontrada');
    // Plan changes are platform-level (pre-Stripe); org admins may toggle name/active/2FA.
    if (body.plan !== undefined && !isPlatformAdmin(req.user)) {
      throw new ForbiddenException('Solo platform admin puede cambiar el plan');
    }
    const settingsJson =
      body.require2fa !== undefined
        ? { ...((existing.settingsJson as object) || {}), require2fa: body.require2fa }
        : undefined;
    return this.prisma.organization.update({
      where: { id },
      data: {
        name: body.name,
        active: body.active,
        plan: body.plan,
        settingsJson,
      },
    });
  }

  @Get(':id/stats')
  async stats(
    @Req() req: { user: TenantUser & { permissions: string[] } },
    @Param('id') id: string,
  ) {
    this.assertAdmin(req.user);
    assertTenantAdminAccess(req.user, id);
    const [users, events, activeEvents, pos] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: id } }),
      this.prisma.event.count({ where: { organizationId: id } }),
      this.prisma.event.count({ where: { organizationId: id, status: 'ACTIVE' } }),
      this.prisma.purchaseOrder.count({ where: { event: { organizationId: id } } }),
    ]);
    return { users, events, activeEvents, purchaseOrders: pos };
  }
}
