import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Campaign, CampaignType, Event, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { NotificationsService } from '../notifications/notifications.service';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  isDirectionRole,
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
  fullName?: string;
  organizationId?: string | null;
};

/**
 * Junta 11-09-2026: la campaña se «envía a revisión», se autoriza y se marca
 * «Pagada». Lo mismo, por separado, la campaña de convenios.
 */
export const REVIEW_STATUSES = ['DRAFT', 'REVIEW', 'AUTHORIZED', 'PAID'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
type Scope = 'campaign' | 'convenios';

/** Quién autoriza: gerencia de Arta y dirección (misma regla que antes). */
function isApprover(user: AuthUser) {
  return user.roleKey === 'gerente_arta' || isDirectionRole(user.roleKey);
}

function asStatus(value: unknown): ReviewStatus | null {
  return typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value)
    ? (value as ReviewStatus)
    : null;
}

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Junta 2026-08-28: la campaña debe poder expandirse para ver el Excel y/o
   * PDF sin salir de la sección, así que la lista viaja con sus archivos.
   */
  private campaignFiles(eventIds: string[]) {
    return this.prisma.eventFile.findMany({
      where: { eventId: { in: eventIds }, module: CAMPAIGN_MODULE, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  private assertCampaignView(user: AuthUser) {
    if (
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.CAMPAIGN_VIEW) &&
      !hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.CAMPAIGN_EDIT)
    ) {
      throw new ForbiddenException('Sin permiso para ver campañas');
    }
  }

  private async eventFor(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(user, event.organizationId);
    return event;
  }

  /**
   * Avisos del recorrido: al enviar a revisión le llega a quien autoriza; al
   * autorizar, regresar o pagar, a quien la mandó a revisión. Sin esto la
   * campaña se quedaba «En revisión» hasta que alguien entrara a mirar.
   */
  private async notifyMove(
    user: AuthUser,
    event: Event,
    campaign: Campaign,
    scope: Scope,
    to: ReviewStatus,
  ) {
    const tab = scope === 'convenios' ? 'sponsors' : 'campaign';
    const what = scope === 'convenios' ? 'la campaña de convenios' : 'la campaña';
    const linkUrl = `/events/${event.id}?tab=${tab}`;
    const who = user.fullName || 'Alguien del equipo';
    const organizationId = event.organizationId ?? tenantIdOf(user);

    if (to === 'REVIEW') {
      const approvers = await this.prisma.user.findMany({
        where: { active: true, organizationId, roleKey: { in: ['dir_general', 'dir_adjunta', 'gerente_arta'] } },
        select: { id: true, roleKey: true, entities: true },
      });
      await this.notifications.notifyMany(
        approvers
          .filter((a) => a.roleKey === 'dir_general' || a.entities.includes(event.entity))
          .map((a) => ({
            userId: a.id,
            organizationId,
            actorId: user.id,
            type: `${scope}.review`,
            title: `${who} envió a revisión ${what}`,
            body: event.name,
            linkUrl,
            entity: event.entity,
          })),
      );
      return;
    }

    const sent = await this.prisma.auditLog.findFirst({
      where: {
        resource: 'Campaign',
        resourceId: campaign.id,
        action: `${scope}.status`,
        metaJson: { path: ['to'], equals: 'REVIEW' },
      },
      orderBy: { createdAt: 'desc' },
      select: { userId: true },
    });
    if (!sent?.userId) return;
    const verb = to === 'AUTHORIZED' ? 'autorizó' : to === 'PAID' ? 'marcó como pagada' : 'regresó a borrador';
    await this.notifications.notify({
      userId: sent.userId,
      organizationId,
      actorId: user.id,
      type: `${scope}.${to.toLowerCase()}`,
      title: `${who} ${verb} ${what}`,
      body: event.name,
      linkUrl,
      entity: event.entity,
    });
  }

  @Get()
  async list(@Req() req: { user: AuthUser }) {
    this.assertCampaignView(req.user);
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
          event: {
            select: {
              id: true,
              name: true,
              entity: true,
              artist: true,
              status: true,
              startsAt: true,
              endsAt: true,
              venue: true,
            },
          },
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
    this.assertCampaignView(req.user);
    await this.eventFor(req.user, eventId);
    const [campaign, files] = await Promise.all([
      this.prisma.campaign.findUnique({ where: { eventId } }),
      this.campaignFiles([eventId]),
    ]);
    return { ...(campaign || null), files, eventId };
  }

  /** Solo los archivos — para refrescar tras subir o reemplazar. */
  @Get('event/:eventId/files')
  async files(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    this.assertCampaignView(req.user);
    await this.eventFor(req.user, eventId);
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
      dataJson?: Record<string, unknown>;
    },
  ) {
    if (!hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.CAMPAIGN_EDIT)) {
      throw new ForbiddenException('Solo el equipo de campaña edita la campaña');
    }
    const event = await this.eventFor(req.user, eventId);
    assertEventNotClosed(event.status);

    const authorized = body.authorized;
    // Autorizar campaña: gerencia de Arta + dirección
    if (authorized === true && !isApprover(req.user)) {
      throw new ForbiddenException('Solo gerencia de Arta o dirección autoriza campaña');
    }

    const existing = await this.prisma.campaign.findUnique({ where: { eventId } });

    /*
     * Lo que ya está en revisión o autorizado no se mueve por debajo: sin este
     * candado, cualquiera con la tabla abierta cambiaba precios de una campaña
     * que dirección ya había aprobado.
     */
    const incoming = body.dataJson && typeof body.dataJson === 'object' ? body.dataJson : null;
    if (incoming && existing) {
      const locked = (key: 'concepts' | 'convenios', status: string) =>
        key in incoming && asStatus(status) !== null && asStatus(status) !== 'DRAFT';
      if (locked('concepts', existing.status) || locked('convenios', existing.convenioStatus)) {
        throw new BadRequestException('Está en revisión o autorizada: regrésala a borrador para editarla');
      }
    }

    /*
     * `dataJson` se FUSIONA por llave.
     *
     * Ahora dos pestañas escriben en la misma campaña —los conceptos desde
     * Campaña y los convenios desde Convenios—; reemplazar el JSON entero hacía
     * que guardar una borrara la otra.
     */
    const mergedData = incoming
      ? ({
          ...((existing?.dataJson as Record<string, unknown> | null) || {}),
          ...incoming,
        } as Prisma.InputJsonValue)
      : undefined;

    // El atajo legado `authorized` sigue funcionando y mueve también el estado.
    const statusFromAuth =
      authorized === true ? 'AUTHORIZED' : authorized === false ? 'DRAFT' : undefined;

    return this.prisma.campaign.upsert({
      where: { eventId },
      create: {
        eventId,
        type: body.type ?? (event.campaignType !== 'NONE' ? event.campaignType : 'INTERNAL'),
        authorized: authorized ?? false,
        authorizedAt: authorized ? new Date() : undefined,
        status: statusFromAuth ?? 'DRAFT',
        notes: body.notes,
        dataJson: mergedData,
      },
      update: {
        type: body.type,
        notes: body.notes,
        dataJson: mergedData,
        ...(authorized !== undefined
          ? {
              authorized,
              authorizedAt: authorized ? new Date() : null,
              status: statusFromAuth,
            }
          : {}),
      },
    });
  }

  /**
   * Mueve la campaña (o la campaña de convenios) por su recorrido:
   *
   *   Borrador → En revisión → Autorizada → Pagada
   *
   * - Enviar a revisión (y regresarla a borrador): quien edita campañas.
   * - Autorizar, reabrir o deshacer el pago: gerencia de Arta y dirección.
   * - Marcar pagada: quien marca OC pagadas, o quien autoriza.
   */
  @Post('event/:eventId/status')
  async setStatus(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Body() body: { status?: string; scope?: string },
  ) {
    const next = asStatus(body.status);
    if (!next) throw new BadRequestException('Estado inválido');
    const scope: Scope = body.scope === 'convenios' ? 'convenios' : 'campaign';

    const role = req.user.roleKey as RoleKey;
    const canEdit = hasPermission(role, req.user.permissions, PERMISSIONS.CAMPAIGN_EDIT);
    if (!canEdit && !isApprover(req.user)) {
      throw new ForbiddenException('Sin permiso para mover la campaña');
    }
    const event = await this.eventFor(req.user, eventId);
    assertEventNotClosed(event.status);

    const campaign =
      (await this.prisma.campaign.findUnique({ where: { eventId } })) ||
      (await this.prisma.campaign.create({
        data: {
          eventId,
          type: event.campaignType !== 'NONE' ? event.campaignType : 'INTERNAL',
        },
      }));

    const current = (asStatus(scope === 'convenios' ? campaign.convenioStatus : campaign.status) ||
      (campaign.authorized ? 'AUTHORIZED' : 'DRAFT')) as ReviewStatus;
    if (current === next) return campaign;

    const allowed: Record<ReviewStatus, ReviewStatus[]> = {
      DRAFT: ['REVIEW'],
      REVIEW: ['DRAFT', 'AUTHORIZED'],
      AUTHORIZED: ['PAID', 'REVIEW', 'DRAFT'],
      PAID: ['AUTHORIZED'],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException('Ese cambio de estado no está permitido');
    }

    const approverMove =
      next === 'AUTHORIZED' || (current === 'AUTHORIZED' && next !== 'PAID') || current === 'PAID';
    if (approverMove && !isApprover(req.user)) {
      throw new ForbiddenException('Solo gerencia de Arta o dirección autoriza o reabre');
    }
    if (next === 'PAID') {
      const canPay =
        isApprover(req.user) || hasPermission(role, req.user.permissions, PERMISSIONS.PO_MARK_PAID);
      if (!canPay) throw new ForbiddenException('Sin permiso para marcar pagada');
    }
    if ((next === 'REVIEW' || (current === 'REVIEW' && next === 'DRAFT')) && !canEdit && !isApprover(req.user)) {
      throw new ForbiddenException('Sin permiso para enviar a revisión');
    }

    const now = new Date();
    const data: Prisma.CampaignUpdateInput =
      scope === 'convenios'
        ? {
            convenioStatus: next,
            ...(next === 'REVIEW' ? { convenioSubmittedAt: now } : {}),
          }
        : {
            status: next,
            authorized: next === 'AUTHORIZED' || next === 'PAID',
            ...(next === 'REVIEW' ? { submittedAt: now } : {}),
            ...(next === 'AUTHORIZED' && current !== 'PAID' ? { authorizedAt: now } : {}),
            ...(next === 'DRAFT' || next === 'REVIEW' ? { authorizedAt: null } : {}),
            ...(next === 'PAID' ? { paidAt: now } : {}),
            ...(current === 'PAID' ? { paidAt: null } : {}),
          };

    const updated = await this.prisma.campaign.update({ where: { eventId }, data });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: event.organizationId ?? req.user.organizationId ?? null,
        action: `${scope}.status`,
        resource: 'Campaign',
        resourceId: campaign.id,
        metaJson: { eventId, from: current, to: next },
      },
    });
    // Un aviso que falla no deshace el cambio de estado.
    await this.notifyMove(req.user, event, campaign, scope, next).catch(() => undefined);
    return updated;
  }
}
