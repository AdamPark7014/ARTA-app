import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { VISIBLE_CHECKLIST_WHERE } from '../checklists/checklist-visibility';

@Injectable()
export class DigestsService {
  private readonly log = new Logger(DigestsService.name);

  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
  ) {}

  /** Bounded concurrency so this scales past a handful of orgs — see automations.service.ts for the same pattern. */
  private static readonly DIGEST_CONCURRENCY = 10;

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async dailyDigest() {
    const orgs = await this.prisma.organization.findMany({
      where: { active: true },
      select: { id: true, name: true, slug: true },
    });
    for (let i = 0; i < orgs.length; i += DigestsService.DIGEST_CONCURRENCY) {
      const batch = orgs.slice(i, i + DigestsService.DIGEST_CONCURRENCY);
      await Promise.allSettled(batch.map((org) => this.runDigestForOrg(org.id, org.name)));
    }
  }

  async runDigestForOrg(organizationId: string, orgName?: string) {
    const job = await this.prisma.jobRun.create({
      data: {
        organizationId,
        kind: 'digest.daily',
        status: 'running',
        startedAt: new Date(),
        attempts: 1,
        payloadJson: { organizationId, orgName: orgName || null },
      },
    });

    try {
      const summary = await this.buildOpsSummary(organizationId);
      const directors = await this.prisma.user.findMany({
        where: {
          active: true,
          organizationId,
          roleKey: { in: ['dir_general', 'dir_adjunta', 'super_admin', 'gerente_arta', 'dir_auditorio'] },
        },
        select: { id: true, email: true, fullName: true },
      });

      const label = orgName || organizationId;
      for (const d of directors) {
        await this.prisma.notificationOutbox.create({
          data: {
            organizationId,
            channel: 'email',
            toAddr: d.email,
            subject: `[${label}] digest · riesgo ${summary.eventRisk} · OC aging ${summary.poAging}`,
            bodyText: this.formatBody(d.fullName, summary, label),
            metaJson: { ...summary, organizationId } as Prisma.InputJsonValue,
            status: process.env.SMTP_HOST ? 'pending' : 'sent',
            sentAt: process.env.SMTP_HOST ? undefined : new Date(),
          },
        });
      }

      await this.webhooks.dispatch(
        'automation.alert',
        { kind: 'digest.daily', organizationId, ...summary },
        organizationId,
      );

      await this.flushOutbox(organizationId);

      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: 'done',
          finishedAt: new Date(),
          resultJson: { recipients: directors.length, organizationId, ...summary },
        },
      });
      this.log.log(`Daily digest org=${organizationId} → ${directors.length} directors`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), error: msg },
      });
      this.log.warn(`Daily digest failed org=${organizationId}: ${msg}`);
    }
  }

  async buildOpsSummary(organizationId: string) {
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
        select: { id: true, name: true, startsAt: true, checklists: { where: VISIBLE_CHECKLIST_WHERE, select: { progressPct: true } } },
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
    for (const e of events) {
      const n = e.checklists.length;
      const avg = n ? e.checklists.reduce((s, c) => s + c.progressPct, 0) / n : 0;
      const days = e.startsAt
        ? Math.round((e.startsAt.getTime() - now.getTime()) / 86_400_000)
        : null;
      if (avg < 40 || (days != null && days <= 7 && avg < 70)) eventRisk += 1;
    }

    return {
      eventRisk,
      poAging: agingPos,
      sigBacklog: pendingAuth,
      activeEvents: events.length,
      at: now.toISOString(),
    };
  }

  formatBody(
    name: string,
    s: { eventRisk: number; poAging: number; sigBacklog: number; activeEvents: number },
    orgLabel: string,
  ) {
    return [
      `Hola ${name},`,
      '',
      `Resumen operativo ${orgLabel}:`,
      `· Eventos activos/draft: ${s.activeEvents}`,
      `· Shows en riesgo: ${s.eventRisk}`,
      `· OC con aging >7d: ${s.poAging}`,
      `· Firmas pendientes de autorización: ${s.sigBacklog}`,
      '',
      'Abre el centro de comando para drill-down.',
      '— ARTA Automations',
    ].join('\n');
  }

  /** Flush pending email outbox (SMTP via nodemailer when configured). */
  async flushOutbox(organizationId?: string | null, limit = 50) {
    const pending = await this.prisma.notificationOutbox.findMany({
      where: {
        status: 'pending',
        channel: 'email',
        ...(organizationId ? { organizationId } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
    if (!pending.length) return { sent: 0 };

    const host = process.env.SMTP_HOST;
    if (!host) {
      await this.prisma.notificationOutbox.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { status: 'sent', sentAt: new Date(), error: 'SMTP not configured — logged only' },
      });
      for (const row of pending) {
        this.log.log(`[outbox:log] → ${row.toAddr} · ${row.subject}`);
      }
      return { sent: pending.length, mode: 'log-only' };
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@arta.local';

    let sent = 0;
    for (const row of pending) {
      try {
        await transporter.sendMail({
          from,
          to: row.toAddr,
          subject: row.subject,
          text: row.bodyText,
        });
        await this.prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: new Date(), attempts: { increment: 1 }, error: null },
        });
        sent += 1;
      } catch (e) {
        await this.prisma.notificationOutbox.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            attempts: { increment: 1 },
            error: e instanceof Error ? e.message : 'send failed',
          },
        });
      }
    }
    return { sent, mode: 'smtp' };
  }

  async recentJobs(organizationId: string | null, take = 30) {
    return this.prisma.jobRun.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async recentOutbox(organizationId: string | null, take = 30) {
    return this.prisma.notificationOutbox.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
