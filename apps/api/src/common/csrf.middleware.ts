import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Paths that must work before CSRF cookie exists (login / public). */
const EXEMPT_PREFIXES = [
  '/auth/login',
  '/auth/2fa/verify-login',
  '/auth/handoff/consume',
  '/vendor/login',
  '/vendor/logout',
  '/invites',
  '/studio/public',
  '/docs',
  '/uploads',
  '/billing/webhook',
  '/health',
  '/healthz',
  '/ready',
];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (SAFE.has(req.method.toUpperCase())) return next();

    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return next();
    }

    // Only enforce when a staff session cookie is present
    const hasSession = !!req.cookies?.arta_access || req.cookies?.arta_session === '1';

    if (!hasSession) return next();

    const cookieToken = req.cookies?.arta_csrf as string | undefined;
    const headerToken = (req.headers['x-csrf-token'] as string | undefined) || '';

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('CSRF token inválido');
    }
    return next();
  }
}
