import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export type PushPlatform = 'android' | 'ios' | 'web';

/**
 * Teléfonos registrados para avisos push. Un token FCM pertenece a un solo
 * teléfono: si otra persona inicia sesión en ese mismo equipo, el token cambia
 * de dueño (upsert por `fcmToken`) y la anterior deja de recibir sus avisos.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerFcmToken(
    userId: string,
    rawToken: string,
    platform?: PushPlatform,
    meta?: { deviceName?: string | null; appVersion?: string | null },
  ) {
    const token = (rawToken || '').trim();
    if (!token) return { ok: false as const, reason: 'empty_token' };

    const data = {
      userId,
      platform: platform ?? null,
      deviceName: meta?.deviceName?.slice(0, 120) || null,
      appVersion: meta?.appVersion?.slice(0, 40) || null,
      lastSeenAt: new Date(),
    };
    const row = await this.prisma.userPushEndpoint.upsert({
      where: { fcmToken: token },
      create: { fcmToken: token, ...data },
      update: data,
    });
    this.logger.log(`Push token registrado (usuario ${userId}, ${platform ?? 'sin plataforma'})`);
    return { ok: true as const, id: row.id };
  }

  /** Sin token quita todos los teléfonos de la persona (cerrar sesión en todos lados). */
  async removeFcmToken(userId: string, token?: string | null) {
    const clean = token?.trim();
    const { count } = await this.prisma.userPushEndpoint.deleteMany({
      where: clean ? { userId, fcmToken: clean } : { userId },
    });
    return { ok: true as const, removed: count };
  }

  listForUser(userId: string) {
    return this.prisma.userPushEndpoint.findMany({
      where: { userId },
      select: { id: true, platform: true, deviceName: true, appVersion: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
