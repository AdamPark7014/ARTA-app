import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export type JwtPayload = {
  sub: string;
  email: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  fullName: string;
  organizationId?: string;
  jti?: string;
};

/** Cookie-only session extraction — Bearer JWTs are rejected for staff auth. */
export function fromAccessCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.arta_access || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: fromAccessCookie,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'change-me-arta-prod-secret',
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      roleKey: payload.roleKey,
      entities: payload.entities,
      permissions: payload.permissions,
      fullName: payload.fullName,
      organizationId: payload.organizationId || null,
    };
  }
}
