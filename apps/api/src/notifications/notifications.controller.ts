import {
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
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type AuthUser = { id: string };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  /** Bandeja del usuario. `unread=1` deja solo lo no leído. */
  @Get()
  list(
    @Req() req: { user: AuthUser },
    @Query('unread') unread?: string,
    @Query('take') take?: string,
  ) {
    const limit = Math.min(Math.max(Number(take) || 30, 1), 100);
    return this.prisma.notification.findMany({
      where: {
        userId: req.user.id,
        ...(unread === '1' || unread === 'true' ? { readAt: null } : {}),
      },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  @Get('unread-count')
  async unreadCount(@Req() req: { user: AuthUser }) {
    const count = await this.prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const found = await this.prisma.notification.findUnique({ where: { id } });
    if (!found || found.userId !== req.user.id) throw new NotFoundException('Aviso no encontrado');
    if (found.readAt) return found;
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  @Post('read-all')
  async markAllRead(@Req() req: { user: AuthUser }) {
    const res = await this.prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: res.count };
  }
}
