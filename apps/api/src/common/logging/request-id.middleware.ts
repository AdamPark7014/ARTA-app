import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = (req.headers['x-request-id'] as string | undefined)?.trim();
    const requestId = incoming && incoming.length <= 64 ? incoming : randomBytes(8).toString('hex');
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const started = Date.now();
    res.on('finish', () => {
      if ((process.env.LOG_HTTP || '1') === '0') return;
      const line = {
        ts: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        service: 'arta-api',
        type: 'http',
        requestId,
        method: req.method,
        path: (req.originalUrl || req.url || '').split('?')[0],
        status: res.statusCode,
        durationMs: Date.now() - started,
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(line));
    });

    next();
  }
}
