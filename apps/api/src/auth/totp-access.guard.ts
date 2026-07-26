import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

type EnrollPayload = { sub: string; scope: 'totp-enroll' };
type SessionPayload = {
  sub: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  fullName: string;
  organizationId?: string;
};

/**
 * Accepts EITHER a cookie session OR a short-lived totp-enroll token in the body.
 * Staff Bearer JWTs are not accepted (cookie-only policy).
 */
@Injectable()
export class TotpAccessGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown; cookies?: Record<string, string> }>();

    const accessToken = req.cookies?.arta_access;
    if (accessToken) {
      try {
        const payload = await this.jwt.verifyAsync<SessionPayload & { scope?: string }>(accessToken);
        if (!payload.scope) {
          req.user = {
            id: payload.sub,
            roleKey: payload.roleKey,
            entities: payload.entities,
            permissions: payload.permissions,
            fullName: payload.fullName,
            organizationId: payload.organizationId,
          };
          return true;
        }
      } catch {
        // fall through to enroll-token check
      }
    }

    const enrollToken = (req.body as { enrollToken?: string } | undefined)?.enrollToken;
    if (enrollToken) {
      try {
        const payload = await this.jwt.verifyAsync<EnrollPayload>(enrollToken);
        if (payload.scope === 'totp-enroll') {
          req.user = { id: payload.sub };
          return true;
        }
      } catch {
        // falls through to the throw below
      }
    }

    throw new UnauthorizedException();
  }
}

/** Enroll-token-only guard for completing a forced 2FA enrollment mid-login. */
@Injectable()
export class TotpEnrollGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = (req.body as { enrollToken?: string } | undefined)?.enrollToken;
    if (!token) throw new UnauthorizedException('Falta enrollToken');
    try {
      const payload = await this.jwt.verifyAsync<EnrollPayload>(token);
      if (payload.scope !== 'totp-enroll') throw new Error('bad scope');
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Enroll token inválido o expirado');
    }
  }
}
