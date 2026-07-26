import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { EntityKey } from '@prisma/client';
import { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { hasPermission, type Permission, type RoleKey } from '../common/rbac/roles';
import { DEFAULT_ORG_ID } from '../common/tenant';

const unknownFails = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 8;
const LOCK_MS = 5 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;
const ACCESS_COOKIE = 'arta_access';
const SESSION_COOKIE = 'arta_session';
const CSRF_COOKIE = 'arta_csrf';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function deviceLabel(ua?: string | null) {
  if (!ua) return 'Desconocido';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'Móvil';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Navegador';
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  cookieNames() {
    return { access: ACCESS_COOKIE, session: SESSION_COOKIE, csrf: CSRF_COOKIE };
  }

  setAuthCookies(res: Response, accessToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge,
      path: '/',
    });
    res.cookie(SESSION_COOKIE, '1', {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProd,
      maxAge,
      path: '/',
    });
    // Double-submit CSRF (readable by JS; compared to X-CSRF-Token on mutations)
    res.cookie(CSRF_COOKIE, randomBytes(24).toString('hex'), {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProd,
      maxAge,
      path: '/',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  private assertUnknownNotLocked(email: string) {
    const row = unknownFails.get(email);
    if (row && row.until > Date.now()) {
      throw new UnauthorizedException('Demasiados intentos. Espera unos minutos.');
    }
  }

  private registerUnknownFail(email: string) {
    const prev = unknownFails.get(email) || { count: 0, until: 0 };
    const count = prev.count + 1;
    unknownFails.set(email, {
      count,
      until: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    });
  }

  async validateUser(email: string, password: string) {
    const normalized = email.toLowerCase().trim();
    this.assertUnknownNotLocked(normalized);

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.active) {
      this.registerUnknownFail(normalized);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Demasiados intentos. Espera unos minutos.');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const count = (user.failedLoginCount || 0) + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: count,
          lockedUntil: count >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null,
        },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return user;
  }

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ip?: string },
    res?: Response,
  ) {
    const user = await this.validateUser(email, password);

    if (user.totpEnabled && user.totpSecret) {
      const challenge = randomBytes(24).toString('hex');
      await this.prisma.totpChallenge.create({
        data: {
          userId: user.id,
          codeHash: hash(challenge),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return {
        requires2fa: true,
        challengeId: challenge,
        user: { id: user.id, email: user.email, fullName: user.fullName },
      };
    }

    if (await this.orgRequires2fa(user.organizationId)) {
      const enrollToken = await this.jwt.signAsync(
        { sub: user.id, scope: 'totp-enroll' },
        { expiresIn: '10m' },
      );
      return {
        requiresTotpEnrollment: true,
        enrollToken,
        user: { id: user.id, email: user.email, fullName: user.fullName },
      };
    }

    return this.issueSession(user, meta, res);
  }

  /** Org policy: settingsJson.require2fa. Missing/unset org (incl. legacy default) → not required. */
  private async orgRequires2fa(organizationId?: string | null): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId || DEFAULT_ORG_ID },
      select: { settingsJson: true },
    });
    const settings = (org?.settingsJson as { require2fa?: boolean } | null) || null;
    return !!settings?.require2fa;
  }

  async verifyTotpLogin(
    challengeId: string,
    code: string,
    meta?: { userAgent?: string; ip?: string },
    res?: Response,
  ) {
    const row = await this.prisma.totpChallenge.findUnique({
      where: { codeHash: hash(challengeId) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Challenge 2FA expirado');
    }
    if (!row.user.totpSecret || !row.user.totpEnabled) {
      throw new BadRequestException('2FA no configurado');
    }
    const ok = verifySync({ token: code.replace(/\s/g, ''), secret: row.user.totpSecret }).valid;
    if (!ok) throw new UnauthorizedException('Código 2FA inválido');

    await this.prisma.totpChallenge.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    return this.issueSession(row.user, meta, res);
  }

  private async issueSession(
    user: {
      id: string;
      email: string;
      fullName: string;
      title?: string | null;
      roleKey: string;
      entities: EntityKey[];
      permissions: string[];
      organizationId?: string | null;
      totpEnabled?: boolean;
    },
    meta?: { userAgent?: string; ip?: string },
    res?: Response,
  ) {
    const jti = randomBytes(16).toString('hex');
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const payload = {
      sub: user.id,
      email: user.email,
      roleKey: user.roleKey,
      entities: user.entities,
      permissions: user.permissions,
      fullName: user.fullName,
      organizationId: user.organizationId || DEFAULT_ORG_ID,
      jti,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash: hash(jti),
          userAgent: meta?.userAgent?.slice(0, 400) || null,
          ip: meta?.ip?.slice(0, 80) || null,
          deviceLabel: deviceLabel(meta?.userAgent),
          expiresAt,
        },
      }),
    ]);

    if (res) this.setAuthCookies(res, accessToken);

    return {
      expiresIn,
      requires2fa: false,
      session: { deviceLabel: deviceLabel(meta?.userAgent) },
      user: this.publicUser(user),
    };
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabled: false, totpVerifiedAt: null },
    });
    const otpauth = generateURI({
      issuer: 'ARTA Ops',
      label: user.email,
      secret,
    });
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    return { secret, otpauth, qrDataUrl };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new BadRequestException('Primero inicia setup 2FA');
    if (!verifySync({ token: code.replace(/\s/g, ''), secret: user.totpSecret }).valid) {
      throw new UnauthorizedException('Código inválido');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { userId, action: 'auth.2fa.enable', resource: 'User', resourceId: userId },
    });
    return { ok: true, totpEnabled: true };
  }

  /**
   * Completes a login that was interrupted for forced enrollment (org policy):
   * verifies the just-scanned TOTP code, flips totpEnabled on, and — unlike
   * enableTotp (used by an already-logged-in user) — issues the real session,
   * since the caller had only a scope-limited enroll token until now.
   */
  async completeTotpEnrollment(
    userId: string,
    code: string,
    meta?: { userAgent?: string; ip?: string },
    res?: Response,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new BadRequestException('Primero inicia setup 2FA');
    if (!verifySync({ token: code.replace(/\s/g, ''), secret: user.totpSecret }).valid) {
      throw new UnauthorizedException('Código inválido');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'auth.2fa.enable',
        resource: 'User',
        resourceId: userId,
        metaJson: { enforcedByOrgPolicy: true },
      },
    });
    return this.issueSession({ ...user, totpEnabled: true }, meta, res);
  }

  async disableTotp(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new ForbiddenException('Password incorrecto');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null },
    });
    await this.prisma.auditLog.create({
      data: { userId, action: 'auth.2fa.disable', resource: 'User', resourceId: userId },
    });
    return { ok: true, totpEnabled: false };
  }

  async createHandoff(opts: {
    userId: string;
    entity: EntityKey;
    path?: string;
  }) {
    const code = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
    await this.prisma.authHandoff.create({
      data: {
        codeHash: hash(code),
        userId: opts.userId,
        entity: opts.entity,
        path: opts.path || '/dashboard',
        // Deprecated column: session is re-issued on consume (cookie rotation).
        token: '',
        expiresAt,
      },
    });
    return { code, expiresAt, path: opts.path || '/dashboard', entity: opts.entity };
  }

  async consumeHandoff(code: string, res?: Response) {
    if (!code || code.length < 16) throw new BadRequestException('Código inválido');
    const row = await this.prisma.authHandoff.findUnique({
      where: { codeHash: hash(code) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Handoff expirado o inválido');
    }
    if (!row.user.active) throw new UnauthorizedException();

    await this.prisma.authHandoff.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    // Rotate: mint a fresh HttpOnly session on the target host (never trust query JWT).
    const session = await this.issueSession(row.user, undefined, res);

    return {
      entity: row.entity,
      path: row.path,
      user: session.user,
    };
  }

  async listSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  publicUser(user: {
    id: string;
    email: string;
    fullName: string;
    title?: string | null;
    roleKey: string;
    entities: string[];
    permissions: string[];
    organizationId?: string | null;
    totpEnabled?: boolean;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      title: user.title ?? null,
      roleKey: user.roleKey,
      entities: user.entities,
      permissions: user.permissions,
      organizationId: user.organizationId || DEFAULT_ORG_ID,
      totpEnabled: !!user.totpEnabled,
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  /** Used by invite accept (and similar onboarding) after user row exists. */
  async issueSessionForUserId(
    userId: string,
    meta?: { userAgent?: string; ip?: string },
    res?: Response,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    return this.issueSession(user, meta, res);
  }

  userCan(user: { roleKey: string; permissions: string[] }, needed: Permission) {
    return hasPermission(user.roleKey as RoleKey, user.permissions, needed);
  }
}
