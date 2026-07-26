import { Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { isPlatformAdmin, tenantIdOf, type TenantUser } from '../common/tenant';
import { AutomationsService } from './automations.service';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private automations: AutomationsService) {}

  @Get('status')
  status() {
    return {
      workers: 'nestjs-schedule',
      hooks: ['boot.scan', 'cron.hourly', 'manual.scan'],
      webhooks: [
        'automation.alert',
        'event.risk',
        'po.aging',
        'checklist.signature_backlog',
        'system.scan',
      ],
      tenantScoped: true,
    };
  }

  @Post('scan')
  async scan(@Req() req: { user: TenantUser & { permissions: string[] } }) {
    const can =
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE) ||
      hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING);
    if (!can) throw new ForbiddenException();

    const orgId = isPlatformAdmin(req.user) ? undefined : tenantIdOf(req.user);
    return this.automations.evaluateAndAudit(true, orgId);
  }
}
