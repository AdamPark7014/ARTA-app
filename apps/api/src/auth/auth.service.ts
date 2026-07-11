import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { hasPermission, type Permission, type RoleKey } from '../common/rbac/roles';

/** Solo para emails que no existen en DB (anti-enumeración / brute force). */
const unknownFails = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 8;
const LOCK_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

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

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const payload = {
      sub: user.id,
      email: user.email,
      roleKey: user.roleKey,
      entities: user.entities,
      permissions: user.permissions,
      fullName: user.fullName,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.publicUser(user),
    };
  }

  publicUser(user: {
    id: string;
    email: string;
    fullName: string;
    title?: string | null;
    roleKey: string;
    entities: string[];
    permissions: string[];
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      title: user.title ?? null,
      roleKey: user.roleKey,
      entities: user.entities,
      permissions: user.permissions,
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  userCan(user: { roleKey: string; permissions: string[] }, needed: Permission) {
    return hasPermission(user.roleKey as RoleKey, user.permissions, needed);
  }
}
