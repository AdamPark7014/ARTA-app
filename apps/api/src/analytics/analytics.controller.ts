import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChecklistTemplateKey, EntityKey } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  PERMISSIONS,
  type EntityKey as EK,
  type RoleKey,
} from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';
import { AnalyticsService } from './analytics.service';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  private resolveEntity(user: AuthUser, entity?: EntityKey): EntityKey {
    const allowed = eventOpsEntities(user.entities as EK[], user.roleKey as RoleKey);
    if (!allowed.length) {
      throw new ForbiddenException('Sin acceso a operación de eventos');
    }
    if (entity) {
      if (!allowed.includes(entity as EK)) {
        throw new ForbiddenException(`Sin acceso a ${entity}`);
      }
      return entity;
    }
    return allowed[0] as EntityKey;
  }

  @Get('overview')
  async overview(@Req() req: { user: AuthUser }, @Query('entity') entity?: EntityKey) {
    const ent = this.resolveEntity(req.user, entity);
    return this.analytics.overview(ent, tenantIdOf(req.user));
  }

  @Get('finance')
  async finance(@Req() req: { user: AuthUser }, @Query('entity') entity?: EntityKey) {
    const ent = this.resolveEntity(req.user, entity);
    return this.analytics.finance(ent, tenantIdOf(req.user));
  }

  @Get('purchase-orders')
  async purchaseOrders(@Req() req: { user: AuthUser }, @Query('entity') entity?: EntityKey) {
    const ent = this.resolveEntity(req.user, entity);
    return this.analytics.purchaseOrders(ent, tenantIdOf(req.user));
  }

  @Get('ops')
  async ops(
    @Req() req: { user: AuthUser },
    @Query('entity') entity?: EntityKey,
    @Query('keys') keys?: string,
  ) {
    const ent = this.resolveEntity(req.user, entity);
    const list = (keys || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean) as ChecklistTemplateKey[];
    if (!list.length) {
      throw new BadRequestException('keys requerido (template keys separados por coma)');
    }
    const valid = new Set(Object.values(ChecklistTemplateKey));
    for (const k of list) {
      if (!valid.has(k)) throw new BadRequestException(`Template key inválido: ${k}`);
    }
    return this.analytics.opsDiscipline(ent, list, tenantIdOf(req.user));
  }

  @Get('users')
  async users(@Req() req: { user: AuthUser }) {
    if (
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección ve métricas de usuarios');
    }
    return this.analytics.usersGovernance(tenantIdOf(req.user));
  }

  @Get('ticketing')
  async ticketing(@Req() req: { user: AuthUser }, @Query('entity') entity?: EntityKey) {
    const ent = this.resolveEntity(req.user, entity);
    return this.analytics.ticketing(ent, tenantIdOf(req.user));
  }

  @Get('audit')
  async audit(@Req() req: { user: AuthUser }, @Query('take') take?: string) {
    if (
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección ve inteligencia de auditoría');
    }
    return this.analytics.auditIntel(Number(take) || 200, tenantIdOf(req.user));
  }

  /** Lightweight ACL probe for folders-only users */
  @Get('access')
  access(@Req() req: { user: AuthUser }, @Query('entity') entity?: EntityKey) {
    const allowed = eventOpsEntities(req.user.entities as EK[], req.user.roleKey as RoleKey);
    const ent = entity || allowed[0];
    return {
      eventOps: ent
        ? canAccessEventOps(req.user.entities as EK[], req.user.roleKey as RoleKey, ent as EK)
        : false,
      allowedEntities: allowed,
    };
  }
}
