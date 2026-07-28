import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { sha256Hex } from '../common/crypto';

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

/** Session freshness (lastSeenAt) is best-effort UI info, not a security boundary — throttle writes. */
const LAST_SEEN_TOUCH_MS = 5 * 60 * 1000;

/** Cookie-only session extraction — Bearer JWTs are rejected for staff auth. */
export function fromAccessCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.arta_access || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: fromAccessCookie,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.jti) throw new UnauthorizedException('Sesión inválida');

    const session = await this.prisma.userSession.findFirst({
      where: { tokenHash: sha256Hex(payload.jti) },
      select: { id: true, revokedAt: true, expiresAt: true, lastSeenAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión revocada o expirada');
    }

    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_TOUCH_MS) {
      this.prisma.userSession
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }

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
