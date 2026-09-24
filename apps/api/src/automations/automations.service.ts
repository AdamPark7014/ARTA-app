import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { VISIBLE_CHECKLIST_WHERE } from '../checklists/checklist-visibility';

@Injectable()
export class AutomationsService implements OnModuleInit {
  private readonly log = new Logger(AutomationsService.name);

  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
  ) {}

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

    const [agingPos, events, pendingAuth] = await Promise.all([
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['PENDING_AUTH', 'AUTHORIZED'] },
          createdAt: { lt: day7 },
          event: { organizationId },
        },
      }),
      this.prisma.event.findMany({
        where: { status: { in: ['ACTIVE', 'DRAFT'] }, organizationId },
        select: {
          id: true,
          name: true,
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
    const risky: Array<{ id: string; name: string; avg: number }> = [];
    for (const e of events) {
      const n = e.checklists.length;
      const avg = n ? e.checklists.reduce((s, c) => s + c.progressPct, 0) / n : 0;
      const days = e.startsAt
        ? Math.round((e.startsAt.getTime() - now.getTime()) / 86_400_000)
        : null;
      if (avg < 40 || (days != null && days <= 7 && avg < 70)) {
        eventRisk += 1;
        risky.push({ id: e.id, name: e.name, avg: Math.round(avg) });
      }
    }

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
    }

    return { poAging: agingPos, eventRisk, sigBacklog: pendingAuth, organizationId };
  }
}
