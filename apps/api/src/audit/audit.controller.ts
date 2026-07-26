import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: { user: { roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Query('resource') resource?: string,
    @Query('take') take?: string,
  ) {
    if (
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección ve audit log');
    }
    const limit = Math.min(Number(take) || 100, 300);
    // AuditLog no tiene organizationId propio; se acota por el org del autor.
    // super_admin ve todo (incluye eventos de sistema con userId null).
    const isSuper = req.user.roleKey === 'super_admin';
    return this.prisma.auditLog.findMany({
      where: {
        ...(resource ? { resource } : {}),
        ...(isSuper ? {} : { user: { organizationId: tenantIdOf(req.user) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
