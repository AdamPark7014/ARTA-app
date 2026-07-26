import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../common/prisma/prisma.service';
import { isStripeConfigured } from '../billing/billing.util';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  /** Liveness — process is up. */
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'arta-api',
      ts: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    };
  }

  /** Alias for probes that expect /healthz */
  @Get('healthz')
  healthz() {
    return this.health();
  }

  /** Readiness — DB reachable (+ feature flags). */
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { database: 'fail' },
      });
    }
    return {
      status: 'ready',
      checks: {
        database: 'ok',
        stripe: isStripeConfigured() ? 'configured' : 'optional_missing',
        sentry: process.env.SENTRY_DSN ? 'configured' : 'optional_missing',
        ticketing:
          (process.env.TICKETING_SYNC_MODE || 'stub') === 'live'
            ? process.env.TICKETING_SYNC_URL
              ? 'live'
              : 'live_misconfigured'
            : 'stub',
      },
      ts: new Date().toISOString(),
    };
  }
}
