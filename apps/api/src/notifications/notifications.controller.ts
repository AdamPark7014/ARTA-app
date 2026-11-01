import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { entityScope } from '../common/entity-scope';
import { NotificationsService } from './notifications.service';
import { normalizePrefs } from './notification-prefs';

type AuthUser = { id: string; roleKey: string; entities?: string[] | null };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Avisos de las entidades de la persona (ARTA / Auditorio, docs/entidades-arta-auditorio.md).
   * Los avisos sin entidad (chat directo, cuenta) se ven en las dos.
   */
  private scopeWhere(user: AuthUser, entity?: string): Prisma.NotificationWhereInput {
    const scope = entityScope(user, entity);
    return { OR: [{ entity: null }, { entity: { in: scope } }] };
  }

  /** Qué llega al teléfono: categorías apagadas y horario silencioso. La campana recibe todo. */
  @Get('preferences')
  async preferences(@Req() req: { user: AuthUser }) {
    const row = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notificationPrefs: true },
    });
    return normalizePrefs(row?.notificationPrefs);
  }

  @Patch('preferences')
  async savePreferences(@Req() req: { user: AuthUser }, @Body() body: unknown) {
    const prefs = normalizePrefs(body);
    await this.prisma.user.update({
      where: { id: req.user.id },
      data: { notificationPrefs: prefs as unknown as Prisma.InputJsonValue },
    });
    return prefs;
  }

  /**
   * Bandeja del usuario. `unread=1` deja solo lo no leído; `entity=` solo esa
   * entidad; `before=<fecha>` trae la siguiente página de la lista.
   */
  @Get()
  list(
    @Req() req: { user: AuthUser },
    @Query('unread') unread?: string,
    @Query('take') take?: string,
    @Query('entity') entity?: string,
    @Query('before') before?: string,
  ) {
    const limit = Math.min(Math.max(Number(take) || 30, 1), 100);
    const beforeDate = before ? new Date(before) : null;
    return this.prisma.notification.findMany({
      where: {
        userId: req.user.id,
        ...(unread === '1' || unread === 'true' ? { readAt: null } : {}),
        ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
        ...this.scopeWhere(req.user, entity),
      },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  @Get('unread-count')
  async unreadCount(@Req() req: { user: AuthUser }, @Query('entity') entity?: string) {
    const count = await this.prisma.notification.count({
      where: { userId: req.user.id, readAt: null, ...this.scopeWhere(req.user, entity) },
    });
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const found = await this.prisma.notification.findUnique({ where: { id } });
    if (!found || found.userId !== req.user.id) throw new NotFoundException('Aviso no encontrado');
    if (found.readAt) return found;
    const updated = await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    void this.notifications.syncRead(req.user.id, id).catch(() => undefined);
    return updated;
  }

  /** «Marcar todo como leído»; con `entity=`, solo lo de esa entidad (y lo que no tiene). */
  @Post('read-all')
  async markAllRead(@Req() req: { user: AuthUser }, @Query('entity') entity?: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null, ...this.scopeWhere(req.user, entity) },
      data: { readAt: new Date() },
    });
    if (res.count > 0) void this.notifications.syncRead(req.user.id, null).catch(() => undefined);
    return { ok: true, updated: res.count };
  }
}
