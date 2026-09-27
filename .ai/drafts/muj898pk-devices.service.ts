import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prismaService: PrismaService) {}

  async registerFcmToken(
    userId: string,
    token: string,
    platform?: 'android' | 'ios',
    meta?: { deviceName?: string; appVersion?: string },
  ) {
    const userPushEndpoint = await this.prismaService.userPushEndpoint.upsert({
      where: { fcmToken: token },
      create: {
        fcmToken: token,
        userId,
        platform,
        deviceName: meta?.deviceName,
        appVersion: meta?.appVersion,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform,
        deviceName: meta?.deviceName,
        appVersion: meta?.appVersion,
        lastSeenAt: new Date(),
      },
    });
    return { ok: true, id: userPushEndpoint.id };
  }

  async removeFcmToken(userId: string, token?: string) {
    const deleted = await this.prismaService.userPushEndpoint.deleteMany({
      where: {
        userId,
        fcmToken: token,
      },
    });
    return { ok: true, id: deleted.count };
  }
}