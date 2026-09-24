import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import { initSentry, captureException } from './common/sentry';
import { JwtService } from '@nestjs/jwt';
import { isDirectionRole } from './common/rbac/roles';
import { DirectionService } from './common/rbac/direction.service';
import type { JwtPayload } from './auth/jwt.strategy';
import { configureApp } from './bootstrap-config';

/**
 * Browser traffic in prod/dev always reaches the API same-origin (Traefik/Next
 * rewrite proxy /api → this service), so this allowlist is defense-in-depth
 * for direct cross-origin callers (Swagger on another port, future clients),
 * not the primary access path. Never reflect an arbitrary Origin with
 * credentials:true (OWASP CORS misconfiguration).
 */
function corsOrigins(): (string | RegExp)[] {
  const configured = (process.env.WEB_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production') return configured;
  return [...configured, /^https?:\/\/localhost:\d+$/, /^https?:\/\/127\.0\.0\.1:\d+$/];
}

async function bootstrap() {
  const sentryOn = initSentry();
  const logger = new JsonLogger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger,
  });
  await configureApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('ARTA API')
    .setDescription('Ops platform · eventos, checklists, OC, analytics, automations, multi-org')
    .setVersion('1.3')
    .addCookieAuth('arta_access')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.API_PORT || 4000);
  await app.listen(port);
  logger.log(
    `ARTA API on http://localhost:${port} · OpenAPI /docs · health /health · ready /ready` +
      (sentryOn ? ' · Sentry on' : ''),
  );
}

bootstrap().catch((err) => {
  captureException(err, { phase: 'bootstrap' });
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
