import { Injectable, Logger, Optional } from '@nestjs/common';
import { EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushDispatchService, type PushPayload } from '../devices/push-dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { pushMetaFor } from './notification-push-meta';

export type NotifyInput = {
  /** Destinatario. Si es el propio actor, no se crea nada. */
  userId: string;
  organizationId?: string | null;
  /** task.assigned | task.reassigned | task.unassigned | task.done | task.reopened */
  type: string;
  title: string;
  body?: string | null;
  /** Ruta interna del panel, p. ej. /tasks o /events/<id>?tab=tasks */
  linkUrl?: string | null;
  actorId?: string | null;
  entity?: EntityKey | null;
};

/**
 * Avisos dentro de la plataforma (junta 2026-08-28: "la persona a quien se le
 * asigne una tarea deberá recibir una notificación dentro de la plataforma").
 *
 * Cada aviso también sale al teléfono (push) y a las pantallas abiertas (socket),
 * así todos los procesos que avisan aquí llegan como en WhatsApp.
 *
 * Nunca lanza: un aviso que falla no puede tumbar la operación que lo originó.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private push?: PushDispatchService,
    @Optional() private realtime?: RealtimeGateway,
  ) {}

  async notify(input: NotifyInput) {
    if (!input.userId) return null;
    // No te avisas a ti mismo de lo que tú acabas de hacer.
    if (input.actorId && input.actorId === input.userId) return null;
    try {
      const row = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId || undefined,
          type: input.type,
          title: input.title,
          body: input.body || undefined,
          linkUrl: input.linkUrl || undefined,
          actorId: input.actorId || undefined,
          entity: input.entity || undefined,
        },
        include: { actor: { select: { id: true, fullName: true } } },
      });
      void this.deliver(row).catch((err) =>
        this.logger.warn(`No se pudo entregar el aviso ${input.type}: ${String(err)}`),
      );
      return row;
    } catch (err) {
      this.logger.warn(`No se pudo crear la notificación ${input.type}: ${String(err)}`);
      return null;
    }
  }

  async notifyMany(inputs: NotifyInput[]) {
    return Promise.all(inputs.map((i) => this.notify(i)));
  }

  /**
   * Solo teléfono, sin fila en la campana: mensajes de chat (el mensaje ya vive
   * en su conversación, igual que WhatsApp no lo duplica en otra bandeja).
   */
  async pushOnly(userId: string, payload: PushPayload) {
    if (!this.push || !userId) return 0;
    try {
      return await this.push.sendToUser(userId, payload);
    } catch (err) {
      this.logger.warn(`Push falló (${payload.type ?? 'sin tipo'}): ${String(err)}`);
      return 0;
    }
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  private async deliver(row: {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string | null;
    linkUrl: string | null;
    actorId: string | null;
    createdAt: Date;
    actor: { id: string; fullName: string } | null;
  }) {
    const unread = await this.unreadCount(row.userId);
    this.realtime?.emitToUser(row.userId, 'notification:new', { notification: row, unread });
    if (!this.push) return;
    const meta = pushMetaFor(row.type);
    await this.push.sendToUser(row.userId, {
      title: row.title,
      body: row.body || '',
      url: row.linkUrl,
      type: row.type,
      kind: 'event',
      channel: meta.channel,
      priority: meta.priority,
      tag: `arta-${row.id}`,
      notificationId: row.id,
      senderId: row.actorId,
      senderName: row.actor?.fullName ?? null,
      threadId: row.linkUrl ? `link:${row.linkUrl.split('?')[0]}` : null,
      badge: unread - 1, // Remove explicit badge
    });
  }

  async syncRead(userId: string, notificationId: string | null) {
    if (!this.push) return;
    try {
      await this.push.sendToUser(userId, {
        type: 'notification.read',
        kind: 'event',
        title: '',
        body: '',
        silent: true,
        notificationId,
        tag: `arta-${notificationId}`,
      });
    } catch (err) {
      this.logger.warn(`Sync read push failed: ${String(err)}`);
    }
  }
}