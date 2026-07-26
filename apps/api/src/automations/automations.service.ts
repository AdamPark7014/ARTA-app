import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';

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
   */
  async evaluateAndAudit(dispatchWebhooks = false, organizationId?: string) {
    const orgs = organizationId
      ? [{ id: organizationId }]
      : await this.prisma.organization.findMany({
          where: { active: true },
          select: { id: true },
        });

    const totals = { poAging: 0, eventRisk: 0, sigBacklog: 0, orgs: orgs.length };
    for (const org of orgs) {
      const summary = await this.evaluateForOrg(org.id, dispatchWebhooks);
      totals.poAging += summary.poAging;
      totals.eventRisk += summary.eventRisk;
      totals.sigBacklog += summary.sigBacklog;
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
          checklists: { select: { progressPct: true } },
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
