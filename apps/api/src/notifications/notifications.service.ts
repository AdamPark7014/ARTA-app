import { Injectable, Logger, Optional } from '@nestjs/common';
import { EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushDispatchService, type PushPayload } from '../devices/push-dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  pushActionsFor,
  pushCategoryFor,
  pushMetaFor,
  RECEIPT_REF_PREFIX,
  RECEIPT_TYPE_LIST,
  targetFromLink,
  wantsReceipt,
  type PushTarget,
  type PushTargetKind,
} from './notification-push-meta';
import { seenReceiptNotice } from './notification-text';
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
/** Avisos iguales de la misma persona en esta ventana se juntan en una sola tarjeta. */
const BUNDLE_WINDOW_MS = 10 * 60 * 1000;

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
  /** De qué trata, si no se deduce de la liga (el aviso abre un mensaje pero habla de una tarea). */
  target?: PushTarget | { kind: string; id: string } | null;
  /**
   * Avisos en ráfaga (cinco archivos subidos seguidos): en vez de cinco vibraciones,
   * una tarjeta que se va actualizando en el mismo lugar, sin volver a sonar.
   * Recibe cuántos lleva ya y devuelve el texto de la tarjeta.
   */
  bundle?: (count: number) => { title: string; body?: string | null };
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
      if (input.bundle) {
        const merged = await this.mergeIntoBundle(input);
        if (merged) return merged;
      }
      const target = input.target ?? targetFromLink(input.linkUrl);
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
          targetKind: target?.kind,
          targetId: target?.id,
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

  /** Suma a la tarjeta sin leer de la misma ráfaga, si la hay. */
  private async mergeIntoBundle(input: NotifyInput) {
    const open = await this.prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        linkUrl: input.linkUrl ?? null,
        actorId: input.actorId ?? null,
        readAt: null,
        createdAt: { gte: new Date(Date.now() - BUNDLE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, bundleCount: true },
    });
    if (!open || !input.bundle) return null;
    const count = open.bundleCount + 1;
    const text = input.bundle(count);
    const row = await this.prisma.notification.update({
      where: { id: open.id },
      data: { title: text.title, body: text.body ?? null, bundleCount: count },
      include: { actor: { select: { id: true, fullName: true } } },
    });
    void this.deliver(row, { quiet: true }).catch((err) =>
      this.logger.warn(`No se pudo entregar el aviso ${input.type}: ${String(err)}`),
    );
    return row;
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
      this.prisma.event.findUnique({ where: { id: eventId }, select: { createdById: true, entity: true } }),
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
      select: { id: true, roleKey: true, entities: true },
    });
    // ARTA y Auditorio van separados: del equipo, solo quien todavía opera la entidad del evento.
    const entity = (event?.entity ?? null) as RbacEntity | null;
    return active
      .filter((u) => !entity || canAccessEventOps(u.entities as RbacEntity[], u.roleKey as RoleKey, entity))
      .map((u) => u.id);
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

  /**
   * La persona abrió la campana con estos avisos a la vista. A quien se los mandó le llega el
   * acuse, sin sonar: uno por cada quien mandó, aunque sean varios avisos. Nunca lanza.
   */
  async markSeen(userId: string, ids: string[]) {
    if (ids.length === 0) return 0;
    try {
      const rows = await this.prisma.notification.findMany({
        where: { userId, id: { in: ids }, seenAt: null },
        select: {
          id: true,
          type: true,
          title: true,
          linkUrl: true,
          actorId: true,
          organizationId: true,
          entity: true,
          targetKind: true,
          targetId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (rows.length === 0) return 0;
      const at = new Date();
      await this.prisma.notification.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, seenAt: null },
        data: { seenAt: at },
      });

      // «Sin abrir» de la tarea se apaga: quien la pidió ya sabe que la vieron.
      const tasks = rows.filter((r) => r.targetKind === 'task' && r.targetId && wantsReceipt(r.type));
      if (tasks.length) {
        await this.prisma.taskAssignment.updateMany({
          where: { id: { in: tasks.map((r) => r.targetId as string) }, seenAt: null },
          data: { seenAt: at },
        });
      }

      const bySender = new Map<string, typeof rows>();
      for (const row of rows) {
        if (!row.actorId || row.actorId === userId || !wantsReceipt(row.type)) continue;
        bySender.set(row.actorId, [...(bySender.get(row.actorId) ?? []), row]);
      }
      if (bySender.size === 0) return rows.length;

      const viewer = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      for (const [senderId, seen] of bySender) {
        const one = seen.length === 1 ? seen[0] : null;
        const entities = new Set(seen.map((r) => r.entity ?? null));
        await this.notify({
          userId: senderId,
          actorId: userId,
          organizationId: seen[0].organizationId,
          type: 'notice.seen',
          ...seenReceiptNotice({ viewer: viewer?.fullName, titles: seen.map((r) => r.title) }),
          linkUrl: one?.linkUrl ?? '/notifications?tab=enviados',
          entity: entities.size === 1 ? (seen[0].entity ?? null) : null,
          target: one?.targetKind && one.targetId ? { kind: one.targetKind, id: one.targetId } : null,
        });
        this.realtime?.emitToUser(senderId, 'notification:seen', {
          notificationIds: seen.map((r) => r.id),
          userId,
          at: at.toISOString(),
        });
      }
      return rows.length;
    } catch (err) {
      this.logger.warn(`No se pudo registrar lo visto: ${String(err)}`);
      return 0;
    }
  }

  /**
   * «Enviados»: lo que esta persona mandó y quién ya lo vio. El mismo aviso a varias personas va
   * en una fila; solo lo que pide acuse.
   */
  async sentBy(userId: string, opts: { take?: number; entities?: EntityKey[] } = {}) {
    const rows = await this.prisma.notification.findMany({
      where: {
        actorId: userId,
        OR: [{ type: { in: RECEIPT_TYPE_LIST } }, { type: { startsWith: RECEIPT_REF_PREFIX } }],
        ...(opts.entities ? { AND: [{ OR: [{ entity: null }, { entity: { in: opts.entities } }] }] } : {}),
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        linkUrl: true,
        createdAt: true,
        seenAt: true,
        readAt: true,
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const groups = new Map<
      string,
      {
        key: string;
        type: string;
        title: string;
        body: string | null;
        linkUrl: string | null;
        createdAt: Date;
        recipients: Array<{ id: string; fullName: string; seenAt: Date | null; readAt: Date | null }>;
      }
    >();
    for (const row of rows) {
      const key = `${row.type}|${row.linkUrl ?? ''}|${row.title}`;
      const group =
        groups.get(key) ??
        { key, type: row.type, title: row.title, body: row.body, linkUrl: row.linkUrl, createdAt: row.createdAt, recipients: [] };
      group.recipients.push({ id: row.user.id, fullName: row.user.fullName, seenAt: row.seenAt, readAt: row.readAt });
      groups.set(key, group);
    }
    return [...groups.values()].slice(0, Math.min(Math.max(opts.take ?? 60, 1), 100));
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

  /** `quiet`: actualiza una tarjeta que ya está en el teléfono, sin volver a sonar. */
  private async deliver(
    row: {
      id: string;
      userId: string;
      type: string;
      title: string;
      body: string | null;
      linkUrl: string | null;
      actorId: string | null;
      entity?: EntityKey | null;
      targetKind?: string | null;
      targetId?: string | null;
      createdAt: Date;
      actor: { id: string; fullName: string } | null;
    },
    opts: { quiet?: boolean } = {},
  ) {
    const unread = await this.unreadCount(row.userId);
    this.realtime?.emitToUser(row.userId, 'notification:new', { notification: row, unread });
    if (!this.push) return;
    const meta = pushMetaFor(row.type);
    const chat = chatLinkParts(row.linkUrl);
    const target =
      row.targetKind && row.targetId
        ? { kind: row.targetKind as PushTargetKind, id: row.targetId }
        : targetFromLink(row.linkUrl);
    const actions = pushActionsFor(row.type, target);
    await this.push.sendToUser(row.userId, {
      title: row.title,
      body: row.body || '',
      url: row.linkUrl,
      type: row.type,
      kind: 'event',
      channel: meta.channel,
      priority: opts.quiet ? 'normal' : meta.priority,
      passive: opts.quiet,
      entity: row.entity ?? null,
      tag: `arta-${row.id}`,
      notificationId: row.id,
      senderId: row.actorId,
      senderName: row.actor?.fullName ?? null,
      // Un aviso que apunta a un mensaje se apila con su conversación y deja responder.
      threadId: chat ? `chat-${chat.channelId}` : row.linkUrl ? `link:${row.linkUrl.split('?')[0]}` : null,
      channelId: chat?.channelId ?? null,
      messageId: chat?.messageId ?? null,
      actions,
      category: pushCategoryFor(actions),
      targetKind: target?.kind ?? null,
      targetId: target?.id ?? null,
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
