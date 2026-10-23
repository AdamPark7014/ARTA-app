import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { VISIBLE_CHECKLIST_WHERE } from '../checklists/checklist-visibility';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../common/rbac/roles';
import { eventRiskNotice, poAgingNotice, taskNotice } from '../notifications/notification-text';

/** OC abierta hace más de 7 días (para el recordatorio diario de quien autoriza). */
type AgingPo = {
  status: string;
  amount: unknown;
  vendorName: string | null;
  createdAt: Date;
  event?: { name: string } | null;
};

/** Una tarea vencida hace más de esto deja de recordarse cada día (ya es ruido, no aviso). */
const OVERDUE_REMINDER_DAYS = 30;

@Injectable()
export class AutomationsService implements OnModuleInit {
  private readonly log = new Logger(AutomationsService.name);

  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  /** 8:00 de CDMX: a cada responsable, sus tareas que vencen en 24 h y las vencidas (una vez al día). */
  @Cron('0 8 * * *', { timeZone: 'America/Mexico_City' })
  async dailyTaskReminders() {
    try {
      const sent = await this.remindTasks();
      this.log.log(`Task reminders: ${sent}`);
    } catch (e) {
      this.log.warn(`Task reminders failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async remindTasks(now = new Date()) {
    if (!this.notifications) return 0;
    const in24h = new Date(now.getTime() + 86_400_000);
    const oldest = new Date(now.getTime() - OVERDUE_REMINDER_DAYS * 86_400_000);
    const tasks = await this.prisma.taskAssignment.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
        dueAt: { gte: oldest, lte: in24h },
        OR: [{ eventId: null }, { event: { status: { in: ['ACTIVE', 'DRAFT'] } } }],
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        eventId: true,
        organizationId: true,
        assigneeId: true,
        coAssignees: { select: { userId: true } },
        event: { select: { name: true, entity: true } },
      },
      take: 2000,
    });
    let sent = 0;
    for (const t of tasks) {
      const overdue = !!t.dueAt && t.dueAt.getTime() < now.getTime();
      const text = taskNotice(overdue ? 'overdue' : 'due_soon', { task: t, event: t.event, now });
      const linkUrl = t.eventId ? `/events/${t.eventId}?tab=tasks&task=${t.id}` : `/tasks?task=${t.id}`;
      const ids = new Set([t.assigneeId, ...t.coAssignees.map((c) => c.userId)].filter((x): x is string => !!x));
      for (const userId of ids) {
        const row = await this.notifications.notifyOncePerDay({
          userId,
          organizationId: t.organizationId,
          type: overdue ? 'task.overdue' : 'task.due_soon',
          title: text.title,
          body: text.body,
          linkUrl,
          entity: t.event?.entity ?? null,
        });
        if (row) sent += 1;
      }
    }
    return sent;
  }

  /** Alertas del escaneo también en la campana de dirección: una vez al día por evento u organización. */
  private async notifyScanAlerts(
    organizationId: string,
    risky: Array<{ id: string; name: string; avg: number; entity: string; days?: number | null }>,
    agingPos: number | AgingPo[],
    pendingAuth: number,
  ) {
    const n = this.notifications;
    if (!n) return;
    for (const e of risky.slice(0, 20)) {
      const people = await n.whoCan({ organizationId, entity: e.entity as 'ARTA' | 'EXPLANADA' });
      for (const userId of people) {
        await n.notifyOncePerDay({
          userId,
          organizationId,
          type: 'event.risk',
          ...eventRiskNotice({ name: e.name, avg: e.avg, days: e.days ?? null }),
          linkUrl: `/events/${e.id}?tab=checklists`,
          entity: e.entity as 'ARTA' | 'EXPLANADA',
        });
      }
    }
    const aging = Array.isArray(agingPos) ? agingPos : [];
    const agingCount = Array.isArray(agingPos) ? agingPos.length : agingPos;
    if (agingCount > 0) {
      // Cuántas, cuánto y en qué paso: «3 sin autorizar ($54,000) · 1 autorizada sin pagar…».
      const sum = (rows: AgingPo[]) => rows.reduce((s, o) => s + Number(o.amount || 0), 0);
      const unauthorized = aging.filter((o) => o.status !== 'AUTHORIZED');
      const unpaid = aging.filter((o) => o.status === 'AUTHORIZED');
      const oldest = [...aging].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      const text = aging.length
        ? poAgingNotice({
            unauthorized: { count: unauthorized.length, amount: sum(unauthorized) },
            unpaid: { count: unpaid.length, amount: sum(unpaid) },
            oldest: oldest
              ? {
                  vendorName: oldest.vendorName,
                  eventName: oldest.event?.name,
                  days: Math.floor((Date.now() - oldest.createdAt.getTime()) / 86_400_000),
                }
              : null,
          })
        : poAgingNotice({ unauthorized: { count: agingCount, amount: 0 }, unpaid: { count: 0, amount: 0 } });
      for (const userId of await n.whoCan({ organizationId, permission: PERMISSIONS.PO_AUTHORIZE })) {
        await n.notifyOncePerDay({
          userId,
          organizationId,
          type: 'po.aging',
          title: text.title,
          body: text.body,
          linkUrl: '/purchase-orders',
        });
      }
    }
    if (pendingAuth > 5) {
      for (const userId of await n.whoCan({ organizationId, directionOnly: true })) {
        await n.notifyOncePerDay({
          userId,
          organizationId,
          type: 'checklist.signature_backlog',
          title: `${pendingAuth} formatos esperan firma de autorización`,
          body: 'Ya se entregaron y nadie los ha autorizado. Fírmalos como «Autorizado» en Formatos.',
          linkUrl: '/checklists',
        });
      }
    }
  }

  async onModuleInit() {
    try {
      const recent = await this.prisma.auditLog.findFirst({
        where: { action: 'automation.scan' },
        orderBy: { createdAt: 'desc' },
      });
      if (recent && Date.now() - recent.createdAt.getTime() < 6 * 3600_000) {
        this.log.log('Boot scan skipped (recent scan < 6h)');
        return;
      }
      const summary = await this.evaluateAndAudit(true);
      this.log.log(
        `Boot scan: ${summary.poAging} OC aging · ${summary.eventRisk} eventos en riesgo · ${summary.sigBacklog} firmas pendientes`,
      );
    } catch (e) {
      this.log.warn(`Boot scan skipped: ${e instanceof Error ? e.message : e}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourlyScan() {
    try {
      const summary = await this.evaluateAndAudit(true);
      this.log.log(
        `Hourly scan: risk=${summary.eventRisk} aging=${summary.poAging} sig=${summary.sigBacklog}`,
      );
    } catch (e) {
      this.log.warn(`Hourly scan failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * Scan one org or every active org. Webhook fan-out always carries organizationId
   * so deliveries never cross tenants.
   *
   * Runs orgs in bounded-concurrency batches rather than one at a time — at
   * "thousands of orgs" scale, a fully sequential loop (each doing 3 queries +
   * up to 4 webhook fetches with an 8s timeout) would make this hourly cron
   * take unboundedly long. Each org is isolated in try/catch so one org's
   * failure (bad webhook, transient DB error) can't abort the rest of the scan.
   */
  private static readonly SCAN_CONCURRENCY = 10;

  async evaluateAndAudit(dispatchWebhooks = false, organizationId?: string) {
    const orgs = organizationId
      ? [{ id: organizationId }]
      : await this.prisma.organization.findMany({
          where: { active: true },
          select: { id: true },
        });

    const totals = { poAging: 0, eventRisk: 0, sigBacklog: 0, orgs: orgs.length, failed: 0 };
    for (let i = 0; i < orgs.length; i += AutomationsService.SCAN_CONCURRENCY) {
      const batch = orgs.slice(i, i + AutomationsService.SCAN_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((org) => this.evaluateForOrg(org.id, dispatchWebhooks)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          totals.poAging += r.value.poAging;
          totals.eventRisk += r.value.eventRisk;
          totals.sigBacklog += r.value.sigBacklog;
        } else {
          totals.failed += 1;
          this.log.warn(`Org scan failed: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
        }
      }
    }
    return totals;
  }

  async evaluateForOrg(organizationId: string, dispatchWebhooks = false) {
    const now = new Date();
    const day7 = new Date(now.getTime() - 7 * 86_400_000);

    const [agingRows, events, pendingAuth] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: {
          status: { in: ['PENDING_AUTH', 'AUTHORIZED'] },
          createdAt: { lt: day7 },
          event: { organizationId },
        },
        select: { status: true, amount: true, vendorName: true, createdAt: true, event: { select: { name: true } } },
      }),
      this.prisma.event.findMany({
        where: { status: { in: ['ACTIVE', 'DRAFT'] }, organizationId },
        select: {
          id: true,
          name: true,
          entity: true,
          startsAt: true,
          checklists: { where: VISIBLE_CHECKLIST_WHERE, select: { progressPct: true } },
        },
      }),
      this.prisma.checklistInstance.count({
        where: {
          deliveredAt: { not: null },
          authorizedAt: null,
          event: { organizationId },
        },
      }),
    ]);

    let eventRisk = 0;
    const risky: Array<{ id: string; name: string; avg: number; entity: string; days: number | null }> = [];
    for (const e of events) {
      const n = e.checklists.length;
      const avg = n ? e.checklists.reduce((s, c) => s + c.progressPct, 0) / n : 0;
      const days = e.startsAt
        ? Math.round((e.startsAt.getTime() - now.getTime()) / 86_400_000)
        : null;
      if (avg < 40 || (days != null && days <= 7 && avg < 70)) {
        eventRisk += 1;
        risky.push({ id: e.id, name: e.name, avg: Math.round(avg), entity: e.entity, days });
      }
    }
    const agingPos = agingRows.length;

    await this.prisma.auditLog.create({
      data: {
        action: 'automation.scan',
        resource: 'System',
        metaJson: {
          organizationId,
          poAging: agingPos,
          eventRisk,
          sigBacklog: pendingAuth,
          at: now.toISOString(),
        },
      },
    });

    if (dispatchWebhooks) {
      if (eventRisk > 0) {
        await this.webhooks.dispatch(
          'event.risk',
          { organizationId, count: eventRisk, events: risky.slice(0, 10) },
          organizationId,
        );
      }
      if (agingPos > 0) {
        await this.webhooks.dispatch('po.aging', { organizationId, count: agingPos }, organizationId);
      }
      if (pendingAuth > 5) {
        await this.webhooks.dispatch(
          'checklist.signature_backlog',
          { organizationId, count: pendingAuth },
          organizationId,
        );
      }
      if (eventRisk || agingPos || pendingAuth > 5) {
        await this.webhooks.dispatch(
          'automation.alert',
          {
            organizationId,
            eventRisk,
            poAging: agingPos,
            sigBacklog: pendingAuth,
          },
          organizationId,
        );
      }
      await this.notifyScanAlerts(organizationId, risky, agingRows, pendingAuth).catch((e) =>
        this.log.warn(`Scan alerts failed: ${e instanceof Error ? e.message : e}`),
      );
    }

    return { poAging: agingPos, eventRisk, sigBacklog: pendingAuth, organizationId };
  }
}
