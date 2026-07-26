import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import { initSentry, captureException } from './common/sentry';

async function bootstrap() {
  const sentryOn = initSentry();
  const logger = new JsonLogger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger,
  });
  app.enableCors({ origin: true, credentials: true });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
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
