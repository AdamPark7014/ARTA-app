import { Injectable, Logger, Optional } from '@nestjs/common';
import { EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushDispatchService, type PushPayload } from '../devices/push-dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { pushMetaFor } from './notification-push-meta';
import {
  canAccessEventOps,
  hasPermission,
  isDirectionRole,
  type EntityKey as RbacEntity,
  type Permission,
  type RoleKey,
} from '../common/rbac/roles';

/** Recordatorios repetitivos: una vez por persona y enlace en esta ventana (cron diario u horario). */
const ONCE_PER_DAY_MS = 20 * 60 * 60 * 1000;

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

  /** El mismo aviso a varias personas (sin repetidos ni el actor). Nunca lanza. */
  async notifyUsers(userIds: Array<string | null | undefined>, input: Omit<NotifyInput, 'userId'>) {
    const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== input.actorId))];
    return this.notifyMany(ids.map((userId) => ({ ...input, userId })));
  }

  /**
   * Recordatorios de cron: si esa persona ya tiene hoy un aviso del mismo tipo y
   * enlace, no se repite (sin tabla extra: la campana es el registro).
   */
  async notifyOncePerDay(input: NotifyInput) {
    if (!input.userId) return null;
    try {
      const since = new Date(Date.now() - ONCE_PER_DAY_MS);
      const existing = await this.prisma.notification.findFirst({
        where: { userId: input.userId, type: input.type, linkUrl: input.linkUrl ?? null, createdAt: { gte: since } },
        select: { id: true },
      });
      if (existing) return null;
    } catch (err) {
      this.logger.warn(`No se pudo revisar avisos previos ${input.type}: ${String(err)}`);
      return null;
    }
    return this.notify(input);
  }

  /**
   * Personas activas de la organización que pueden actuar en una entidad: con el
   * permiso pedido o, sin permiso, dirección y la gerencia de esa entidad.
   */
  async whoCan(opts: {
    organizationId?: string | null;
    entity?: EntityKey | RbacEntity | null;
    permission?: Permission;
    /** Solo dirección (super_admin, dir_general, dir_adjunta), sin gerencias. */
    directionOnly?: boolean;
    /** Cualquier rol con acceso operativo a la entidad (equipo completo). */
    anyRole?: boolean;
    exclude?: string | null;
  }): Promise<string[]> {
    try {
      const people = await this.prisma.user.findMany({
        where: { active: true, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
        select: { id: true, roleKey: true, entities: true, permissions: true },
      });
      const entity = (opts.entity ?? null) as RbacEntity | null;
      return people
        .filter((p) => {
          if (p.id === opts.exclude) return false;
          const role = p.roleKey as RoleKey;
          if (entity && !canAccessEventOps(p.entities as RbacEntity[], role, entity)) return false;
          if (opts.anyRole) return true;
          if (opts.permission) return hasPermission(role, p.permissions ?? [], opts.permission);
          if (isDirectionRole(role)) return true;
          if (opts.directionOnly) return false;
          if (role === 'gerente_arta') return entity !== 'EXPLANADA';
          if (role === 'dir_auditorio') return entity === 'EXPLANADA';
          return false;
        })
        .map((p) => p.id);
    } catch (err) {
      this.logger.warn(`No se pudo resolver a quién avisar: ${String(err)}`);
      return [];
    }
  }

  /**
   * Equipo de un evento (no hay tabla de equipo): quien lo creó, quien tiene tareas
   * en él y los miembros de su canal de chat. Solo personas activas.
   */
  async eventAudience(eventId: string, excludeUserId?: string | null): Promise<string[]> {
    const [event, tasks, channel] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: eventId }, select: { createdById: true } }),
      // Responsables principales y corresponsables (una tarea puede ser de varias personas).
      this.prisma.taskAssignment.findMany({
        where: { eventId, OR: [{ assigneeId: { not: null } }, { coAssignees: { some: {} } }] },
        select: { assigneeId: true, coAssignees: { select: { userId: true } } },
      }),
      this.prisma.chatChannel.findUnique({
        where: { eventId },
        select: { members: { select: { userId: true } } },
      }),
    ]);
    const ids = new Set<string>();
    if (event?.createdById) ids.add(event.createdById);
    for (const t of tasks) {
      if (t.assigneeId) ids.add(t.assigneeId);
      for (const c of t.coAssignees ?? []) ids.add(c.userId);
    }
    for (const m of channel?.members ?? []) ids.add(m.userId);
    if (excludeUserId) ids.delete(excludeUserId);
    if (ids.size === 0) return [];
    const active = await this.prisma.user.findMany({
      where: { id: { in: [...ids] }, active: true },
      select: { id: true },
    });
    return active.map((u) => u.id);
  }

  /** Aviso a todo el equipo del evento menos a quien hizo el cambio. Nunca lanza. */
  async notifyEventTeam(eventId: string, input: Omit<NotifyInput, 'userId'>, extraUserIds: string[] = []) {
    try {
      const audience = new Set(await this.eventAudience(eventId, input.actorId));
      for (const id of extraUserIds) if (id && id !== input.actorId) audience.add(id);
      return await this.notifyMany([...audience].map((userId) => ({ ...input, userId })));
    } catch (err) {
      this.logger.warn(`No se pudo avisar al equipo del evento ${eventId}: ${String(err)}`);
      return [];
    }
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

  /**
   * Leído en un dispositivo: los demás quitan el aviso de la bandeja y ajustan el
   * globo. `notificationId` nulo = se marcaron todos.
   */
  async syncRead(userId: string, notificationId: string | null) {
    const unread = await this.unreadCount(userId).catch(() => null);
    if (unread != null) this.realtime?.emitToUser(userId, 'notification:read', { notificationId, unread });
    await this.pushOnly(userId, {
      title: '',
      body: '',
      type: 'notification.read',
      kind: 'event',
      silent: true,
      notificationId,
      tag: notificationId ? `arta-${notificationId}` : undefined,
    });
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
    const chat = chatLinkParts(row.linkUrl);
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
      // Un aviso que apunta a un mensaje se apila con su conversación y deja responder.
      threadId: chat ? `chat-${chat.channelId}` : row.linkUrl ? `link:${row.linkUrl.split('?')[0]}` : null,
      channelId: chat?.channelId ?? null,
      messageId: chat?.messageId ?? null,
    });
  }
}

/** `/chat?channel=<id>&msg=<id>` → ids de conversación y mensaje; cualquier otra ruta → null. */
export function chatLinkParts(linkUrl?: string | null): { channelId: string; messageId: string | null } | null {
  if (!linkUrl || !linkUrl.startsWith('/chat?')) return null;
  const params = new URLSearchParams(linkUrl.slice('/chat?'.length));
  const channelId = params.get('channel');
  if (!channelId) return null;
  return { channelId, messageId: params.get('msg') };
}
