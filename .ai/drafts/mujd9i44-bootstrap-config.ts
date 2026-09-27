import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtService } from '@nestjs/jwt';
import { DirectionService } from './common/rbac/direction.service';
import type { JwtPayload } from './auth/jwt.strategy';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

function corsOrigins(): (string | RegExp)[] {
  const configured = (process.env.WEB_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production') return configured;
  return [...configured, /^https?:\/\/localhost:\d+$/, /^https?:\/\/127\.0\.0\.1:\d+$/];
}

function chatMimeFor(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case 'heic':
    case 'heif':
      return 'image/heif';
    case 'm4a':
    case 'opus':
    case 'aac':
    case 'mov':
    case 'webm':
      return 'video/' + ext;
    default:
      return undefined;
  }
}

export async function configureApp(app: INestApplication | NestExpressApplication) {
  const nest = app as NestExpressApplication;
  nest.enableCors({ origin: corsOrigins(), credentials: true });
  nest.use(cookieParser());

  const jwt = nest.get(JwtService);
  const direction = nest.get(DirectionService);
  nest.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/uploads/')) {
      const ext = req.path.toLowerCase().split('.').pop() || '';
      const isEditable = ext === 'xlsx' || ext === 'xls' || ext === 'docx';
      if (isEditable) {
        const token = req.cookies?.arta_access || '';
        let ok = false;
        if (token) {
          try {
            const payload = await jwt.verifyAsync<JwtPayload>(token);
            if (payload?.sub) {
              ok = await direction.isDirection(
                { id: payload.sub, roleKey: payload.roleKey },
                payload.organizationId || null,
              );
            }
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          res.status(403).send('Solo dirección puede descargar originales');
          return;
        }
      }
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

  nest.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
  nest.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
    setHeaders: (res, path, stat) => {
      const ext = path.toLowerCase().split('.').pop() || '';
      const mime = chatMimeFor(ext);
      if (mime) {
        res.setHeader('Content-Type', mime);
      }
    },
  });

  // Swagger (dev/test)
  const swagger = new DocumentBuilder()
    .setTitle('ARTA API')
    .setDescription('Ops platform · eventos, checklists, OC, analytics, automations, multi-org')
    .setVersion('1.3')
    .addCookieAuth('arta_access')
    .build();
  SwaggerModule.setup('docs', nest, SwaggerModule.createDocument(nest, swagger));
}