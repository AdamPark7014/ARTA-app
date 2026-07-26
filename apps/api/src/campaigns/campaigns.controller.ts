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
import { CampaignType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: { user: AuthUser }) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    if (!allowed.length) return [];
    const isSuper = req.user.roleKey === 'super_admin';
    const events = await this.prisma.event.findMany({
      where: {
        entity: { in: allowed },
        ...(isSuper ? {} : { organizationId: tenantIdOf(req.user) }),
      },
      select: { id: true },
    });
    return this.prisma.campaign.findMany({
      where: { eventId: { in: events.map((e) => e.id) } },
      include: {
        event: { select: { id: true, name: true, entity: true, artist: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    return this.prisma.campaign.findUnique({ where: { eventId } });
  }

  @Post('event/:eventId')
  async upsert(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Body()
    body: {
      type?: CampaignType;
      authorized?: boolean;
      notes?: string;
      dataJson?: object;
    },
  ) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.CAMPAIGN_EDIT)) {
      throw new ForbiddenException('Solo Melissa y Williams editan campaña');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);

    const authorized = body.authorized;
    // Autorizar campaña: Melissa (tema campaña) + dirs
    if (authorized === true) {
      const canAuth =
        req.user.roleKey === 'gerente_arta' ||
        req.user.roleKey === 'dir_general' ||
        req.user.roleKey === 'super_admin';
      if (!canAuth) throw new ForbiddenException('Solo Melissa (o dirección) autoriza campaña');
    }

    return this.prisma.campaign.upsert({
      where: { eventId },
      create: {
        eventId,
        type: body.type ?? event.campaignType ?? 'INTERNAL',
        authorized: authorized ?? false,
        authorizedAt: authorized ? new Date() : undefined,
        notes: body.notes,
        dataJson: body.dataJson,
      },
      update: {
        type: body.type,
        notes: body.notes,
        dataJson: body.dataJson,
        ...(authorized !== undefined
          ? { authorized, authorizedAt: authorized ? new Date() : null }
          : {}),
      },
    });
  }
}
