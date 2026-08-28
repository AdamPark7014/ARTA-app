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

/** Etiqueta de `EventFile.module` para los adjuntos de campaña. */
export const CAMPAIGN_MODULE = 'campaign';

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

  /**
   * Junta 2026-08-28: la campaña debe poder expandirse para ver el Excel y/o
   * PDF sin salir de la sección, así que la lista viaja con sus archivos.
   */
  private campaignFiles(eventIds: string[]) {
    return this.prisma.eventFile.findMany({
      where: { eventId: { in: eventIds }, module: CAMPAIGN_MODULE },
      orderBy: { createdAt: 'desc' },
    });
  }

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
    const eventIds = events.map((e) => e.id);
    const [campaigns, files] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { eventId: { in: eventIds } },
        include: {
          event: { select: { id: true, name: true, entity: true, artist: true, status: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.campaignFiles(eventIds),
    ]);
    const byEvent = new Map<string, typeof files>();
    for (const f of files) {
      if (!f.eventId) continue;
      const list = byEvent.get(f.eventId) || [];
      list.push(f);
      byEvent.set(f.eventId, list);
    }
    return campaigns.map((c) => ({ ...c, files: byEvent.get(c.eventId) || [] }));
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    const [campaign, files] = await Promise.all([
      this.prisma.campaign.findUnique({ where: { eventId } }),
      this.campaignFiles([eventId]),
    ]);
    return { ...(campaign || null), files, eventId };
  }

  /** Solo los archivos — para refrescar tras subir o reemplazar. */
  @Get('event/:eventId/files')
  async files(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    return this.campaignFiles([eventId]);
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
      throw new ForbiddenException('Solo el equipo de campaña edita la campaña');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);

    const authorized = body.authorized;
    // Autorizar campaña: gerencia de Arta + dirección
    if (authorized === true) {
      const canAuth =
        req.user.roleKey === 'gerente_arta' ||
        req.user.roleKey === 'dir_general' ||
        req.user.roleKey === 'super_admin';
      if (!canAuth) throw new ForbiddenException('Solo gerencia de Arta o dirección autoriza campaña');
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
