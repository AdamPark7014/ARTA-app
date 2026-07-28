import { createHash, createHmac, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { assertPublicHttpUrl } from '../common/url-safety';

export type WebhookEventName =
  | 'automation.alert'
  | 'event.risk'
  | 'po.aging'
  | 'checklist.signature_backlog'
  | 'system.scan';

@Injectable()
export class WebhooksService {
  private readonly log = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async dispatch(
    event: WebhookEventName,
    payload: Record<string, unknown>,
    organizationId?: string,
  ) {
    const orgId = organizationId || (payload.organizationId as string | undefined);
    // Never fan out to every tenant — missing org scope is a no-op.
    if (!orgId) {
      this.log.warn(`webhook.dispatch skipped for ${event}: missing organizationId`);
      return { delivered: 0, skipped: true as const };
    }
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        active: true,
        events: { has: event },
        organizationId: orgId,
      },
    });
    if (!endpoints.length) return { delivered: 0 };

    let delivered = 0;
    const body = JSON.stringify({
      id: randomBytes(8).toString('hex'),
      event,
      createdAt: new Date().toISOString(),
      data: payload,
    });

    for (const ep of endpoints) {
      const ok = await this.deliverOnce(ep.id, ep.url, ep.secret, event, body);
      if (ok) delivered += 1;
    }

    return { delivered, endpoints: endpoints.length };
  }

  private async deliverOnce(
    endpointId: string,
    url: string,
    secret: string,
    event: string,
    body: string,
    priorAttempts = 0,
  ) {
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    let success = false;
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Arta-Event': event,
          'X-Arta-Signature': `sha256=${signature}`,
          'User-Agent': 'ARTA-Webhooks/1.0',
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      statusCode = res.status;
      success = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'dispatch failed';
    }

    await this.prisma.webhookDelivery.create({
      data: {
        endpointId,
        event,
        payloadJson: JSON.parse(body) as Prisma.InputJsonValue,
        statusCode: statusCode ?? undefined,
        success,
        error: error ?? undefined,
        attempts: priorAttempts + 1,
      },
    });
    return success;
  }

  /** Retry recent failed deliveries (max 3 attempts). */
  async retryFailedDeliveries(take = 15) {
    const failed = await this.prisma.webhookDelivery.findMany({
      where: { success: false, attempts: { lt: 3 } },
      take,
      orderBy: { createdAt: 'asc' },
      include: { endpoint: true },
    });
    let retried = 0;
    for (const d of failed) {
      if (!d.endpoint.active) continue;
      const body = JSON.stringify(d.payloadJson);
      const ok = await this.deliverOnce(
        d.endpointId,
        d.endpoint.url,
        d.endpoint.secret,
        d.event,
        body,
        d.attempts,
      );
      if (ok) retried += 1;
    }
    if (retried) this.log.log(`Webhook retries succeeded: ${retried}`);
    return { retried, scanned: failed.length };
  }

  async listEndpoints(organizationId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true } },
      },
    });
  }

  async createEndpoint(data: {
    name: string;
    url: string;
    events: string[];
    entity?: 'ARTA' | 'EXPLANADA' | null;
    organizationId?: string;
  }) {
    assertPublicHttpUrl(data.url);
    const secret = randomBytes(24).toString('hex');
    return this.prisma.webhookEndpoint.create({
      data: {
        organizationId: data.organizationId || DEFAULT_ORG_ID,
        name: data.name,
        url: data.url,
        secret,
        events: data.events,
        entity: data.entity ?? null,
        active: true,
      },
    });
  }

  async recentDeliveries(organizationId: string, take = 40) {
    return this.prisma.webhookDelivery.findMany({
      where: { endpoint: { organizationId } },
      orderBy: { createdAt: 'desc' },
      take,
      include: { endpoint: { select: { name: true, url: true } } },
    });
  }
}

export function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}
