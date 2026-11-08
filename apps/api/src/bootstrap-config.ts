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
import { chatRuleFor } from './chat/chat-attachments';
import { PrismaService } from './common/prisma/prisma.service';
import { isPublicUpload, resolveUploadViewer } from './uploads/static-access';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

function corsOrigins(): (string | RegExp)[] {
  const configured = (process.env.WEB_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production') return configured;
  return [...configured, /^https?:\/\/localhost:\d+$/, /^https?:\/\/127\.0\.0\.1:\d+$/];
}

export async function configureApp(app: INestApplication | NestExpressApplication) {
  const nest = app as NestExpressApplication;
  nest.enableCors({ origin: corsOrigins(), credentials: true });
  nest.use(cookieParser());

  const jwt = nest.get(JwtService);
  const direction = nest.get(DirectionService);
  const prisma = nest.get(PrismaService);
  nest.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/uploads/')) {
      // Fotos sueltas del sitio público: sin sesión. Lo demás pide sesión (static-access.ts).
      if (!isPublicUpload(req.path)) {
        const viewer = await resolveUploadViewer(req, jwt, prisma);
        if (!viewer) {
          res.status(401).send('Inicia sesión para ver este archivo');
          return;
        }
        // Ruta decodificada: `%2Exlsx` o `chat%2F..` no deben saltarse la regla de originales.
        let decoded = req.path;
        try {
          decoded = decodeURIComponent(req.path);
        } catch {
          res.status(400).send('Ruta inválida');
          return;
        }
        const ext = decoded.toLowerCase().split('.').pop() || '';
        // Lo compartido en el chat ya lo pueden ver todos los miembros de la conversación.
        const isEditable =
          (ext === 'xlsx' || ext === 'xls' || ext === 'docx') && !(decoded.startsWith('/uploads/chat/') && !decoded.includes('..'));
        if (isEditable) {
          let ok = false;
          if (viewer.kind === 'staff') {
            const p = viewer.payload;
            ok = await direction
              .isDirection({ id: p.sub!, roleKey: p.roleKey || '' }, p.organizationId || null)
              .catch(() => false);
          }
          if (!ok) {
            res.status(403).send('Solo dirección puede descargar originales');
            return;
          }
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
    // HEIC, m4a, opus… no siempre están en la tabla de `send`; sin tipo, los reproductores nativos los rechazan.
    setHeaders: (res, filePath) => {
      const rule = chatRuleFor(filePath);
      if (rule) res.setHeader('Content-Type', rule.mime.startsWith('text/') ? `${rule.mime}; charset=utf-8` : rule.mime);
    },
  });

  // Swagger: solo fuera de producción (publica el mapa completo de la API).
  // En producción se puede encender a propósito con SWAGGER_ENABLED=1.
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === '1') {
    const swagger = new DocumentBuilder()
      .setTitle('ARTA API')
      .setDescription('Ops platform · eventos, checklists, OC, analytics, automations, multi-org')
      .setVersion('1.3')
      .addCookieAuth('arta_access')
      .build();
    SwaggerModule.setup('docs', nest, SwaggerModule.createDocument(nest, swagger));
  }
}
