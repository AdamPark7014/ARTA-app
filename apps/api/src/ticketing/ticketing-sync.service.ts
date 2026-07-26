import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { resolveProvider, type ZoneSold } from './providers/arema.provider';

@Injectable()
export class TicketingSyncService {
  private readonly log = new Logger(TicketingSyncService.name);

  constructor(private prisma: PrismaService) {}

  /** Every 6 hours — sync sold from boletera provider (stub or live URL). */
  @Cron('0 */6 * * *')
  async cronSync() {
    try {
      const result = await this.syncAll();
      this.log.log(
        `Ticketing sync: updated=${result.updated} failed=${result.failed} setups=${result.total}`,
      );
    } catch (e) {
      this.log.warn(`Ticketing sync failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async syncAll(organizationId?: string) {
    const job = await this.prisma.jobRun.create({
      data: {
        organizationId: organizationId || null,
        kind: 'ticketing.sync',
        status: 'running',
        startedAt: new Date(),
        attempts: 1,
        payloadJson: {
          organizationId: organizationId || null,
          mode: process.env.TICKETING_SYNC_MODE || 'stub',
        },
      },
    });

    try {
      const setups = await this.prisma.ticketingSetup.findMany({
        where: organizationId ? { event: { organizationId } } : undefined,
        include: { event: { select: { id: true, name: true, organizationId: true } } },
      });

      let updated = 0;
      let failed = 0;
      const errors: Array<{ setupId: string; error: string }> = [];

      for (const s of setups) {
        const zones = (Array.isArray(s.zonesJson) ? s.zonesJson : []) as ZoneSold[];
        if (!zones.length) continue;
        const provider = resolveProvider(s.boletera);
        try {
          const next = await provider.fetchSold({
            boletera: s.boletera,
            eventName: s.event.name,
            eventId: s.event.id,
            zones,
          });
          const changed = JSON.stringify(zones) !== JSON.stringify(next);
          if (!changed) continue;
          await this.prisma.ticketingSetup.update({
            where: { id: s.id },
            data: { zonesJson: next as unknown as Prisma.InputJsonValue },
          });
          updated += 1;
        } catch (e) {
          failed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ setupId: s.id, error: msg });
          this.log.warn(`Ticketing sync setup=${s.id}: ${msg}`);
        }
      }

      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: failed && !updated ? 'failed' : 'done',
          finishedAt: new Date(),
          error: failed ? `${failed} setup(s) failed` : null,
          resultJson: { updated, failed, total: setups.length, errors: errors.slice(0, 20) },
        },
      });
      return { updated, failed, total: setups.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), error: msg },
      });
      throw e;
    }
  }
}
