import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EntityKey, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveProvider, type ZoneSold } from './providers/arema.provider';

const SOLD_MILESTONES = [50, 75, 90, 100];

/** Porcentaje vendido de todas las zonas con aforo (0 si no hay aforo capturado). */
export function soldPct(zones: Array<{ aforo?: unknown; sold?: unknown }>): number {
  let cap = 0;
  let sold = 0;
  for (const z of zones) {
    const a = Number(z.aforo) || 0;
    if (a <= 0) continue;
    cap += a;
    sold += Math.min(Number(z.sold) || 0, a);
  }
  return cap > 0 ? (sold / cap) * 100 : 0;
}

/** El hito más alto que se cruzó entre antes y después (o null si no cruzó ninguno). */
export function crossedMilestone(before: number, after: number): number | null {
  const crossed = SOLD_MILESTONES.filter((m) => before < m && after >= m);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

@Injectable()
export class TicketingSyncService {
  private readonly log = new Logger(TicketingSyncService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  /** Venta que cruza 50/75/90 % o se agota: al equipo del evento, una vez por hito y día. */
  async notifyMilestone(
    event: { id: string; name: string; organizationId: string | null; entity: EntityKey },
    milestone: number,
  ) {
    if (!this.notifications) return;
    const soldOut = milestone >= 100;
    const audience = await this.notifications.eventAudience(event.id);
    for (const userId of audience) {
      await this.notifications.notifyOncePerDay({
        userId,
        organizationId: event.organizationId,
        type: soldOut ? 'ticketing.sold_out' : 'ticketing.milestone',
        title: soldOut ? '¡Boletos agotados!' : `Boletera al ${milestone}% vendido`,
        body: event.name,
        linkUrl: `/events/${event.id}?tab=ticketing&hito=${milestone}`,
        entity: event.entity,
      });
    }
  }

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
        include: { event: { select: { id: true, name: true, organizationId: true, entity: true } } },
      });

      let updated = 0;
      let failed = 0;
      const errors: Array<{ setupId: string; error: string }> = [];

      // Each setup does a real network call (live provider: up to 3 retries ×
      // 12s timeout) — fully serial would make this cron's runtime scale
      // linearly with total setups across every org. Bounded concurrency caps
      // that without hammering the boletera provider(s).
      const SYNC_CONCURRENCY = 8;
      for (let i = 0; i < setups.length; i += SYNC_CONCURRENCY) {
        const batch = setups.slice(i, i + SYNC_CONCURRENCY);
        await Promise.allSettled(
          batch.map(async (s) => {
            const zones = (Array.isArray(s.zonesJson) ? s.zonesJson : []) as ZoneSold[];
            if (!zones.length) return;
            const provider = resolveProvider(s.boletera);
            try {
              const next = await provider.fetchSold({
                boletera: s.boletera,
                eventName: s.event.name,
                eventId: s.event.id,
                zones,
              });
              const changed = JSON.stringify(zones) !== JSON.stringify(next);
              if (!changed) return;
              await this.prisma.ticketingSetup.update({
                where: { id: s.id },
                data: { zonesJson: next as unknown as Prisma.InputJsonValue },
              });
              updated += 1;
              const milestone = crossedMilestone(soldPct(zones), soldPct(next));
              if (milestone) {
                await this.notifyMilestone(s.event, milestone).catch((err) =>
                  this.log.warn(`Ticketing milestone notify setup=${s.id}: ${String(err)}`),
                );
              }
            } catch (e) {
              failed += 1;
              const msg = e instanceof Error ? e.message : String(e);
              errors.push({ setupId: s.id, error: msg });
              this.log.warn(`Ticketing sync setup=${s.id}: ${msg}`);
            }
          }),
        );
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
