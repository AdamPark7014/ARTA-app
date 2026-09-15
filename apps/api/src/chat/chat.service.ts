import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { tenantIdOf } from '../common/tenant';

/**
 * Chat interno (junta 11-09-2026): un canal «General» por organización y
 * mensajes personales 1:1 entre gente del mismo tenant.
 *
 * Conversación = `threadKey`: "general" o "dm:<idDeLaOtraPersona>".
 */

export type ChatUser = {
  id: string;
  roleKey: string;
  organizationId?: string | null;
  fullName?: string;
};

export const GENERAL_THREAD = 'general';
const DM_PREFIX = 'dm:';
export const MAX_BODY = 4000;
/** Historial inicial al abrir una conversación. */
const PAGE_SIZE = 200;
/** Tope por sondeo incremental (`after`). */
const AFTER_BATCH = 500;
/** Sin marcador de lectura no tiene caso contar miles; la UI muestra «99+». */
const UNREAD_CAP = 100;
const PREVIEW_LEN = 160;

type Thread =
  | { kind: 'general'; key: string }
  | { kind: 'dm'; key: string; other: { id: string; fullName: string } };

const messageSelect = Prisma.validator<Prisma.ChatMessageSelect>()({
  id: true,
  body: true,
  createdAt: true,
  sender: { select: { id: true, fullName: true } },
});

const previewSelect = Prisma.validator<Prisma.ChatMessageSelect>()({
  body: true,
  createdAt: true,
  senderId: true,
  recipientId: true,
  sender: { select: { fullName: true } },
});

type MessageRow = Prisma.ChatMessageGetPayload<{ select: typeof messageSelect }>;
type PreviewRow = Prisma.ChatMessageGetPayload<{ select: typeof previewSelect }>;

export type ChatMessageDto = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string };
};

export type ChatThreadDto = {
  key: string;
  kind: 'general' | 'dm';
  title: string;
  subtitle: string | null;
  userId: string | null;
  lastMessage: { body: string; at: string; senderId: string; senderName: string } | null;
  unread: number;
};

function toDto(row: MessageRow): ChatMessageDto {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    sender: { id: row.sender.id, fullName: row.sender.fullName },
  };
}

function toPreview(row: PreviewRow | null | undefined): ChatThreadDto['lastMessage'] {
  if (!row) return null;
  return {
    body: row.body.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LEN),
    at: row.createdAt.toISOString(),
    senderId: row.senderId,
    senderName: row.sender.fullName,
  };
}

function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /** Gente activa de mi organización, sin mí. */
  private teammates(user: ChatUser) {
    return this.prisma.user.findMany({
      where: { active: true, organizationId: tenantIdOf(user), id: { not: user.id } },
      select: { id: true, fullName: true, title: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * Valida la conversación. En un DM la otra persona debe ser de mi tenant;
   * para escribirle, además, debe seguir activa.
   */
  private async resolveThread(
    user: ChatUser,
    raw: unknown,
    opts: { requireActive?: boolean } = {},
  ): Promise<Thread> {
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (key === GENERAL_THREAD) return { kind: 'general', key };
    if (key.startsWith(DM_PREFIX)) {
      const otherId = key.slice(DM_PREFIX.length);
      if (!otherId || otherId === user.id) {
        throw new BadRequestException('Conversación no válida');
      }
      const other = await this.prisma.user.findFirst({
        where: {
          id: otherId,
          organizationId: tenantIdOf(user),
          ...(opts.requireActive ? { active: true } : {}),
        },
        select: { id: true, fullName: true },
      });
      if (!other) throw new NotFoundException('Persona no encontrada');
      return { kind: 'dm', key: `${DM_PREFIX}${other.id}`, other };
    }
    throw new BadRequestException('Conversación no válida');
  }

  private threadWhere(user: ChatUser, thread: Thread): Prisma.ChatMessageWhereInput {
    if (thread.kind === 'general') {
      return { organizationId: tenantIdOf(user), recipientId: null };
    }
    return {
      OR: [
        { senderId: user.id, recipientId: thread.other.id },
        { senderId: thread.other.id, recipientId: user.id },
      ],
    };
  }

  /** No leídos: General (de otros, después de mi marcador) y DMs por remitente. */
  private async unreadState(user: ChatUser, mateIds: string[]) {
    const markers = await this.prisma.chatReadMarker.findMany({
      where: { userId: user.id },
      select: { threadKey: true, lastReadAt: true },
    });
    const readAt = new Map(markers.map((m) => [m.threadKey, m.lastReadAt]));
    const generalMarker = readAt.get(GENERAL_THREAD);

    const general = await this.prisma.chatMessage.count({
      where: {
        organizationId: tenantIdOf(user),
        recipientId: null,
        senderId: { not: user.id },
        ...(generalMarker ? { createdAt: { gt: generalMarker } } : {}),
      },
      take: UNREAD_CAP,
    });

    const dm = new Map<string, number>();
    if (mateIds.length) {
      const groups = await this.prisma.chatMessage.groupBy({
        by: ['senderId'],
        where: {
          recipientId: user.id,
          OR: mateIds.map((id) => {
            const at = readAt.get(`${DM_PREFIX}${id}`);
            return at ? { senderId: id, createdAt: { gt: at } } : { senderId: id };
          }),
        },
        _count: { _all: true },
      });
      for (const g of groups) dm.set(g.senderId, Math.min(g._count._all, UNREAD_CAP));
    }

    return { general, dm };
  }

  async threads(user: ChatUser): Promise<{ threads: ChatThreadDto[] }> {
    const tid = tenantIdOf(user);
    const mates = await this.teammates(user);
    const ids = mates.map((m) => m.id);

    const unread = await this.unreadState(user, ids);

    const generalLast = await this.prisma.chatMessage.findFirst({
      where: { organizationId: tid, recipientId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: previewSelect,
    });

    // Último mensaje por DM en dos consultas: el máximo por dirección y luego esas filas.
    const dmLast = new Map<string, PreviewRow>();
    if (ids.length) {
      const pairs = await this.prisma.chatMessage.groupBy({
        by: ['senderId', 'recipientId'],
        where: {
          OR: [
            { senderId: user.id, recipientId: { in: ids } },
            { recipientId: user.id, senderId: { in: ids } },
          ],
        },
        _max: { createdAt: true },
      });
      const wanted: Prisma.ChatMessageWhereInput[] = [];
      for (const p of pairs) {
        if (p._max.createdAt) {
          wanted.push({
            senderId: p.senderId,
            recipientId: p.recipientId,
            createdAt: p._max.createdAt,
          });
        }
      }
      if (wanted.length) {
        const rows = await this.prisma.chatMessage.findMany({
          where: { OR: wanted },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: previewSelect,
        });
        for (const r of rows) {
          const other = r.senderId === user.id ? r.recipientId : r.senderId;
          if (other && !dmLast.has(other)) dmLast.set(other, r);
        }
      }
    }

    const general: ChatThreadDto = {
      key: GENERAL_THREAD,
      kind: 'general',
      title: 'General',
      subtitle: 'Todo el equipo',
      userId: null,
      lastMessage: toPreview(generalLast),
      unread: unread.general,
    };

    const dms: ChatThreadDto[] = mates.map((m) => ({
      key: `${DM_PREFIX}${m.id}`,
      kind: 'dm',
      title: m.fullName,
      subtitle: m.title ?? null,
      userId: m.id,
      lastMessage: toPreview(dmLast.get(m.id)),
      unread: unread.dm.get(m.id) ?? 0,
    }));

    dms.sort((a, b) => {
      const at = a.lastMessage?.at ?? '';
      const bt = b.lastMessage?.at ?? '';
      if (at !== bt) return at > bt ? -1 : 1;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    });

    return { threads: [general, ...dms] };
  }

  async messages(user: ChatUser, rawThread: unknown, rawAfter?: string): Promise<ChatMessageDto[]> {
    const thread = await this.resolveThread(user, rawThread);
    const where = this.threadWhere(user, thread);
    const after = parseDate(rawAfter);

    if (after) {
      const rows = await this.prisma.chatMessage.findMany({
        where: { AND: [where, { createdAt: { gt: after } }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: AFTER_BATCH,
        select: messageSelect,
      });
      return rows.map(toDto);
    }

    const rows = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE,
      select: messageSelect,
    });
    return rows.reverse().map(toDto);
  }

  async send(user: ChatUser, rawThread: unknown, rawBody: unknown): Promise<ChatMessageDto> {
    const body = typeof rawBody === 'string' ? rawBody.replace(/\r\n?/g, '\n').trim() : '';
    if (!body) throw new BadRequestException('Escribe un mensaje');
    if (body.length > MAX_BODY) {
      throw new BadRequestException(`El mensaje admite hasta ${MAX_BODY} caracteres`);
    }
    const thread = await this.resolveThread(user, rawThread, { requireActive: true });
    const row = await this.prisma.chatMessage.create({
      data: {
        organizationId: tenantIdOf(user),
        senderId: user.id,
        recipientId: thread.kind === 'dm' ? thread.other.id : null,
        body,
      },
      select: messageSelect,
    });
    return toDto(row);
  }

  async markRead(user: ChatUser, rawThread: unknown): Promise<{ ok: true }> {
    const thread = await this.resolveThread(user, rawThread);

    // Nunca antes del último mensaje visible: evita que un desfase de reloj
    // entre API y base deje un mensaje ya leído marcado como pendiente.
    const latest = await this.prisma.chatMessage.findFirst({
      where: this.threadWhere(user, thread),
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const now = new Date();
    const lastReadAt = latest && latest.createdAt > now ? latest.createdAt : now;

    const where = { userId_threadKey: { userId: user.id, threadKey: thread.key } };
    try {
      await this.prisma.chatReadMarker.upsert({
        where,
        create: { userId: user.id, threadKey: thread.key, lastReadAt },
        update: { lastReadAt },
      });
    } catch (e) {
      // Dos pestañas marcando a la vez: el segundo `create` choca con el único.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        await this.prisma.chatReadMarker.update({ where, data: { lastReadAt } });
      } else {
        throw e;
      }
    }
    return { ok: true };
  }

  async unreadTotal(user: ChatUser): Promise<{ total: number }> {
    const mates = await this.prisma.user.findMany({
      where: { active: true, organizationId: tenantIdOf(user), id: { not: user.id } },
      select: { id: true },
    });
    const state = await this.unreadState(
      user,
      mates.map((m) => m.id),
    );
    let total = state.general;
    state.dm.forEach((n) => {
      total += n;
    });
    return { total };
  }
}
