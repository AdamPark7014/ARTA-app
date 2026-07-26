import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { DigestsService } from '../digests/digests.service';
import { TicketingSyncService } from '../ticketing/ticketing-sync.service';
import { WebhooksService } from '../webhooks/webhooks.service';

/**
 * Durable job worker on Postgres JobRun + NotificationOutbox.
 * Retries failed work with backoff without requiring Redis/BullMQ.
 */
@Injectable()
export class JobsService {
  private readonly log = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private digests: DigestsService,
    private ticketingSync: TicketingSyncService,
    private webhooks: WebhooksService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    try {
      const outbox = await this.digests.flushOutbox(30);
      if (outbox.sent) this.log.log(`Outbox flush: ${outbox.sent} (${outbox.mode || 'n/a'})`);
    } catch (e) {
      this.log.warn(`Outbox flush: ${e instanceof Error ? e.message : e}`);
    }

    try {
      await this.retryFailedOutbox();
    } catch (e) {
      this.log.warn(`Outbox retry: ${e instanceof Error ? e.message : e}`);
    }

    try {
      await this.retryFailedJobs();
    } catch (e) {
      this.log.warn(`Job retry: ${e instanceof Error ? e.message : e}`);
    }

    try {
      await this.webhooks.retryFailedDeliveries();
    } catch (e) {
      this.log.warn(`Webhook retry: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Re-queue failed emails with attempts < 5 (exponential-ish delay via age). */
  async retryFailedOutbox() {
    const maxAttempts = 5;
    const failed = await this.prisma.notificationOutbox.findMany({
      where: { status: 'failed', attempts: { lt: maxAttempts }, channel: 'email' },
      take: 20,
      orderBy: { createdAt: 'asc' },
    });
    if (!failed.length) return { requeued: 0 };

    await this.prisma.notificationOutbox.updateMany({
      where: { id: { in: failed.map((f) => f.id) } },
      data: { status: 'pending', error: null },
    });
    await this.digests.flushOutbox(failed.length);
    return { requeued: failed.length };
  }

  async retryFailedJobs() {
    const failed = await this.prisma.jobRun.findMany({
      where: {
        status: 'failed',
        attempts: { lt: 4 },
        kind: { in: ['digest.daily', 'ticketing.sync', 'webhook.retry'] },
      },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });

    let n = 0;
    for (const job of failed) {
      const ageMs = Date.now() - job.createdAt.getTime();
      const backoffMs = Math.min(60 * 60_000, 5 * 60_000 * Math.max(1, job.attempts));
      if (ageMs < backoffMs) continue;

      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: { status: 'pending', error: null, attempts: { increment: 1 } },
      });

      try {
        if (job.kind === 'digest.daily') {
          await this.digests.dailyDigest();
        } else if (job.kind === 'ticketing.sync') {
          await this.ticketingSync.syncAll();
        }
        await this.prisma.jobRun.update({
          where: { id: job.id },
          data: { status: 'done', finishedAt: new Date() },
        });
        n += 1;
      } catch (e) {
        await this.prisma.jobRun.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: e instanceof Error ? e.message : 'retry failed',
          },
        });
      }
    }
    return { retried: n };
  }
}
