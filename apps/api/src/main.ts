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
  app.enableCors({ origin: corsOrigins(), credentials: true });
  // PDFs/images under /uploads are embedded in the panel via iframe/object.
  // Helmet's full CSP (object-src 'none', etc.) on those responses breaks
  // Chrome's built-in PDF viewer; keep only frame-ancestors for embeds.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/uploads/')) {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return next();
    }
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          frameAncestors: ["'self'"],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'"],
          mediaSrc: ["'self'", 'blob:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })(req, res, next);
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads/' });

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
