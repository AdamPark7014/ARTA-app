import { Controller, Get, Post, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { isPlatformAdmin, tenantIdOf, type TenantUser } from '../common/tenant';
import { DigestsService } from './digests.service';

@Controller('digests')
@UseGuards(JwtAuthGuard)
export class DigestsController {
  constructor(private digests: DigestsService) {}

  private assertAdmin(user: { roleKey: string; permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException();
    }
  }

  /** Platform admins see all tenants; org admins only their own jobs/outbox. */
  private scopeOrgId(user: TenantUser): string | null {
    return isPlatformAdmin(user) ? null : tenantIdOf(user);
  }

  @Get('jobs')
  jobs(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    this.assertAdmin(req.user);
    return this.digests.recentJobs(this.scopeOrgId(req.user));
  }

  @Get('outbox')
  outbox(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    this.assertAdmin(req.user);
    return this.digests.recentOutbox(this.scopeOrgId(req.user));
  }

  @Post('run-daily')
  async run(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    this.assertAdmin(req.user);
    if (isPlatformAdmin(req.user)) {
      await this.digests.dailyDigest();
    } else {
      await this.digests.runDigestForOrg(tenantIdOf(req.user));
    }
    return { ok: true };
  }

  @Post('flush-outbox')
  flush(@Req() req: { user: TenantUser & { permissions: string[]; roleKey: string } }) {
    this.assertAdmin(req.user);
    const globalFlush =
      isPlatformAdmin(req.user) &&
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING);
    return this.digests.flushOutbox(globalFlush ? null : tenantIdOf(req.user));
  }
}
