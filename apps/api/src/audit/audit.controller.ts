import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Req() req: { user: { roleKey: string; permissions: string[] } },
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
    return this.prisma.auditLog.findMany({
      where: resource ? { resource } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
