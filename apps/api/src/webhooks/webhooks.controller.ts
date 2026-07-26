import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { EntityKey } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';
import { WebhooksService } from './webhooks.service';

class CreateWebhookDto {
  @IsString() name!: string;
  @IsUrl({ require_tld: false }) url!: string;
  @IsArray() @IsString({ each: true }) events!: string[];
  @IsOptional() @IsEnum(EntityKey) entity?: EntityKey;
}

type AuthUser = {
  roleKey: string;
  permissions: string[];
  organizationId?: string | null;
};

@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private webhooks: WebhooksService) {}

  private assertAdmin(user: { roleKey: string; permissions: string[] }) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección gestiona webhooks');
    }
  }

  @Get()
  list(@Req() req: { user: AuthUser }) {
    this.assertAdmin(req.user);
    return this.webhooks.listEndpoints(tenantIdOf(req.user));
  }

  @Post()
  create(@Req() req: { user: AuthUser }, @Body() body: CreateWebhookDto) {
    this.assertAdmin(req.user);
    return this.webhooks.createEndpoint({
      ...body,
      organizationId: tenantIdOf(req.user),
    });
  }

  @Get('deliveries')
  deliveries(@Req() req: { user: AuthUser }, @Query('take') take?: string) {
    this.assertAdmin(req.user);
    return this.webhooks.recentDeliveries(tenantIdOf(req.user), Number(take) || 40);
  }

  @Post('test')
  async test(@Req() req: { user: AuthUser }) {
    this.assertAdmin(req.user);
    const organizationId = tenantIdOf(req.user);
    return this.webhooks.dispatch('system.scan', { source: 'manual.test', organizationId }, organizationId);
  }
}
