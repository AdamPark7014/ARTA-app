import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatChannelKind, ChatMessageKind, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { tenantIdOf } from '../common/tenant';
import { isDirectionRole } from '../common/rbac/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { shortName } from '../notifications/notification-push-meta';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  chatPreview,
  dmKeyOf,
  mentionedUserIds,
  mentionsChannel,
  pushText,
  slugify,
} from './chat-text';

/**
 * Chat tipo Slack (portado de NEXARA y ajustado a ARTA):
 * canales públicos y privados, directos 1:1, canal por evento, hilos, reacciones,
 * fijados, edición, borrado, búsqueda, menciones, silenciar y adjuntos.
 *
 * Cada mensaje sale en tiempo real (socket) y como push tipo WhatsApp a quien no
 * lo silenció. Las menciones y `@canal` avisan aunque la conversación esté silenciada.
 */

export type ChatUser = {
  id: string;
  roleKey: string;
  organizationId?: string | null;
  fullName?: string;
};

export const GENERAL_SLUG = 'general';
export const ANNOUNCEMENTS_SLUG = 'anuncios';
const LEGACY_GENERAL = 'general';
const LEGACY_DM_PREFIX = 'dm:';
export const MAX_BODY = 8000;
const EDIT_WINDOW_MS = 60 * 60 * 1000;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;
/** Silenciado «siempre» (como WhatsApp). */
const MUTE_FOREVER = new Date('2099-12-31T00:00:00.000Z');
const DEFAULTS_TTL_MS = 60_000;
/** Adjuntos del chat: fotos y PDF (los Office se reservan a dirección en /uploads). */
export const CHAT_ATTACHMENT_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

const authorSelect = { id: true, fullName: true, title: true } as const;

const messageInclude = {
  sender: { select: authorSelect },
  reactions: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, fullName: true } } },
  },
  _count: { select: { replies: { where: { deletedAt: null } } } },
} satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

export type ChatMessageDto = {
  id: string;
  channelId: string;
  parentId: string | null;
  kind: ChatMessageKind;
  body: string;
  attachment: { url: string; name: string | null; mime: string | null; size: number | null } | null;
  pinnedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; fullName: string; title: string | null };
  replyCount: number;
  reactions: Array<{ emoji: string; count: number; userIds: string[]; users: Array<{ id: string; fullName: string }> }>;
};

export type PostMessageInput = {
  body?: string | null;
  parentId?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  /** Id temporal del cliente para reconciliar el mensaje optimista. */
  clientId?: string | null;
};

type ChannelRow = {
  id: string;
  organizationId: string;
  kind: ChatChannelKind;
  slug: string | null;
  name: string;
  topic: string | null;
  description: string | null;
  isArchived: boolean;
  eventId: string | null;
  postingRestricted: boolean;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
};

export function serializeMessage(m: MessageRow): ChatMessageDto {
  const reactions = new Map<string, ChatMessageDto['reactions'][number]>();
  for (const r of m.reactions) {
    const cur = reactions.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [], users: [] };
    cur.count += 1;
    cur.userIds.push(r.userId);
    cur.users.push({ id: r.user.id, fullName: r.user.fullName });
    reactions.set(r.emoji, cur);
  }
  return {
    id: m.id,
    channelId: m.channelId,
    parentId: m.parentId,
    kind: m.kind,
    body: m.deletedAt ? '' : m.body,
    attachment:
      m.attachmentUrl && !m.deletedAt
        ? { url: m.attachmentUrl, name: m.attachmentName, mime: m.attachmentMime, size: m.attachmentSize }
        : null,
    pinnedAt: m.pinnedAt?.toISOString() ?? null,
    editedAt: m.editedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    author: { id: m.sender.id, fullName: m.sender.fullName, title: m.sender.title ?? null },
    replyCount: m._count.replies,
    reactions: [...reactions.values()],
  };
}

@Injectable()
export class ChatService {
  private readonly defaultsCheckedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ─── Canales de la organización ──────────────────────────────────────────

  /** #general (todos escriben) y #anuncios (solo dirección); toda la gente activa es miembro. */
  async ensureDefaults(orgId: string, force = false) {
    const last = this.defaultsCheckedAt.get(orgId) ?? 0;
    if (!force && Date.now() - last < DEFAULTS_TTL_MS) return;
    const defaults = [
      {
        slug: GENERAL_SLUG,
        name: 'general',
        topic: 'Conversación del equipo',
        description: 'Canal abierto para toda la organización',
        postingRestricted: false,
      },
      {
        slug: ANNOUNCEMENTS_SLUG,
        name: 'anuncios',
        topic: 'Avisos importantes de dirección',
        description: 'Comunicados oficiales; solo dirección publica',
        postingRestricted: true,
      },
    ];
    const users = await this.prisma.user.findMany({
      where: { active: true, ...this.orgUserWhere(orgId) },
      select: { id: true },
    });
    for (const d of defaults) {
      const channel = await this.prisma.chatChannel.upsert({
        where: { organizationId_slug: { organizationId: orgId, slug: d.slug } },
        create: { organizationId: orgId, kind: ChatChannelKind.PUBLIC, ...d },
        update: { isArchived: false },
        select: { id: true },
      });
      if (users.length) {
        await this.prisma.chatChannelMember.createMany({
          data: users.map((u) => ({ channelId: channel.id, userId: u.id })),
          skipDuplicates: true,
        });
      }
    }
    this.defaultsCheckedAt.set(orgId, Date.now());
  }

  /** La org por defecto también agrupa a quien no tiene organización asignada. */
  private orgUserWhere(orgId: string): Prisma.UserWhereInput {
    return orgId === tenantIdOf({ roleKey: '', organizationId: null })
      ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
      : { organizationId: orgId };
  }

  private async assertColleague(user: ChatUser, otherId: string) {
    const other = await this.prisma.user.findFirst({
      where: { id: otherId, active: true, ...this.orgUserWhere(tenantIdOf(user)) },
      select: authorSelect,
    });
    if (!other) throw new NotFoundException('Persona no encontrada');
    return other;
  }

  private canModerate(user: ChatUser, role?: string | null) {
    return isDirectionRole(user.roleKey) || role === 'owner';
  }

  /**
   * Acceso a un canal de mi organización. Los públicos admiten a cualquiera (se
   * une solo al abrirlo); privados y directos exigen ser miembro.
   */
  private async access(user: ChatUser, channelId: string, opts: { write?: boolean } = {}) {
    const orgId = tenantIdOf(user);
    const channel = await this.prisma.chatChannel.findFirst({
      where: { id: channelId, organizationId: orgId },
      include: { members: { where: { userId: user.id }, take: 1 } },
    });
    if (!channel || channel.isArchived) throw new NotFoundException('Conversación no encontrada');
    let membership = channel.members[0] ?? null;
    if (!membership) {
      if (channel.kind !== ChatChannelKind.PUBLIC) {
        throw new ForbiddenException('No tienes acceso a esta conversación');
      }
      membership = await this.prisma.chatChannelMember.upsert({
        where: { channelId_userId: { channelId, userId: user.id } },
        create: { channelId, userId: user.id },
        update: {},
      });
    }
    if (opts.write && channel.postingRestricted && !this.canModerate(user, membership.role)) {
      throw new ForbiddenException('Solo dirección publica en este canal');
    }
    return { channel: channel as ChannelRow, membership };
  }

  /** No leídos por canal en una sola consulta (desde lastReadAt, o desde que entró). */
  private async unreadByChannel(userId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ channelId: string; n: number }>>`
      SELECT m."channelId" AS "channelId", COUNT(*)::int AS n
      FROM "ChatMessage" m
      JOIN "ChatChannelMember" mm ON mm."channelId" = m."channelId" AND mm."userId" = ${userId}
      WHERE m."deletedAt" IS NULL
        AND m."parentId" IS NULL
        AND m."senderId" <> ${userId}
        AND m."createdAt" > COALESCE(mm."lastReadAt", mm."joinedAt")
      GROUP BY m."channelId"`;
    return new Map(rows.map((r) => [r.channelId, Number(r.n)]));
  }

  /** Total para el globo del menú y del ícono de la app (sin conversaciones silenciadas). */
  async unreadTotal(user: ChatUser): Promise<{ total: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM "ChatMessage" m
      JOIN "ChatChannelMember" mm ON mm."channelId" = m."channelId" AND mm."userId" = ${user.id}
      JOIN "ChatChannel" c ON c."id" = m."channelId" AND c."isArchived" = false
      WHERE m."deletedAt" IS NULL
        AND m."parentId" IS NULL
        AND m."senderId" <> ${user.id}
        AND m."createdAt" > COALESCE(mm."lastReadAt", mm."joinedAt")
        AND (mm."mutedUntil" IS NULL OR mm."mutedUntil" < now())`;
    return { total: Number(rows[0]?.n ?? 0) };
  }

  async listChannels(user: ChatUser) {
    const orgId = tenantIdOf(user);
    await this.ensureDefaults(orgId);
    const channels = await this.prisma.chatChannel.findMany({
      where: {
        organizationId: orgId,
        isArchived: false,
        OR: [{ kind: ChatChannelKind.PUBLIC }, { members: { some: { userId: user.id } } }],
      },
      include: {
        members: {
          where: { user: { active: true } },
          include: { user: { select: authorSelect } },
        },
      },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    });
    const unread = await this.unreadByChannel(user.id);
    const now = Date.now();

    return channels
      // Un directo sin mensajes no estorba en la lista (se abre desde «Nuevo mensaje»).
      .filter((ch) => ch.kind !== ChatChannelKind.DIRECT || ch.lastMessageAt)
      .map((ch) => {
        const membership = ch.members.find((m) => m.userId === user.id) ?? null;
        const peer =
          ch.kind === ChatChannelKind.DIRECT
            ? (ch.members.find((m) => m.userId !== user.id)?.user ?? null)
            : null;
        return {
          id: ch.id,
          kind: ch.kind,
          slug: ch.slug,
          name: peer?.fullName ?? ch.name,
          topic: ch.topic,
          eventId: ch.eventId,
          peer,
          isMember: Boolean(membership),
          memberCount: ch.members.length,
          postingRestricted: ch.postingRestricted,
          canPost: !ch.postingRestricted || this.canModerate(user, membership?.role),
          lastMessageAt: ch.lastMessageAt?.toISOString() ?? null,
          lastMessagePreview: ch.lastMessagePreview,
          unreadCount: membership ? (unread.get(ch.id) ?? 0) : 0,
          muted: Boolean(membership?.mutedUntil && membership.mutedUntil.getTime() > now),
          mutedUntil: membership?.mutedUntil?.toISOString() ?? null,
        };
      });
  }

  async getChannel(user: ChatUser, channelId: string) {
    const { channel, membership } = await this.access(user, channelId);
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId, user: { active: true } },
      include: { user: { select: authorSelect } },
      orderBy: { joinedAt: 'asc' },
      take: 500,
    });
    const peer =
      channel.kind === ChatChannelKind.DIRECT
        ? (members.find((m) => m.userId !== user.id)?.user ?? null)
        : null;
    return {
      id: channel.id,
      kind: channel.kind,
      slug: channel.slug,
      name: peer?.fullName ?? channel.name,
      topic: channel.topic,
      description: channel.description,
      eventId: channel.eventId,
      peer,
      postingRestricted: channel.postingRestricted,
      canPost: !channel.postingRestricted || this.canModerate(user, membership.role),
      canManage: this.canModerate(user, membership.role),
      muted: Boolean(membership.mutedUntil && membership.mutedUntil.getTime() > Date.now()),
      mutedUntil: membership.mutedUntil?.toISOString() ?? null,
      lastReadAt: membership.lastReadAt?.toISOString() ?? null,
      memberCount: members.length,
      // lastReadAt de cada quien = palomitas de «leído» (✓✓) en el cliente.
      members: members.map((m) => ({
        id: m.user.id,
        fullName: m.user.fullName,
        title: m.user.title ?? null,
        role: m.role,
        lastReadAt: m.lastReadAt?.toISOString() ?? null,
      })),
    };
  }

  async createChannel(
    user: ChatUser,
    input: { name?: string; kind?: 'PUBLIC' | 'PRIVATE'; topic?: string; description?: string; memberIds?: string[] },
  ) {
    const orgId = tenantIdOf(user);
    const name = (input.name ?? '').trim().replace(/^#/, '').slice(0, 80);
    if (name.length < 2) throw new BadRequestException('Nombre de canal inválido');
    const kind = input.kind === 'PRIVATE' ? ChatChannelKind.PRIVATE : ChatChannelKind.PUBLIC;
    const slug = kind === ChatChannelKind.PUBLIC ? slugify(name) || `canal-${Date.now()}` : null;
    if (slug) {
      const exists = await this.prisma.chatChannel.findFirst({ where: { organizationId: orgId, slug } });
      if (exists) throw new BadRequestException('Ya existe un canal con ese nombre');
    }
    const extra = await this.validColleagueIds(user, input.memberIds);
    const channel = await this.prisma.chatChannel.create({
      data: {
        organizationId: orgId,
        kind,
        slug,
        name,
        topic: input.topic?.trim().slice(0, 250) || null,
        description: input.description?.trim().slice(0, 1000) || null,
        createdById: user.id,
        members: {
          create: [{ userId: user.id, role: 'owner' }, ...extra.map((id) => ({ userId: id }))],
        },
      },
      select: { id: true },
    });
    await this.systemMessage(channel.id, user, `${user.fullName ?? 'Alguien'} creó el canal #${name}`);
    this.realtime.emitToUsers(extra, 'chat:members-changed', { channelId: channel.id });
    return this.getChannel(user, channel.id);
  }

  private async validColleagueIds(user: ChatUser, ids?: string[] | null): Promise<string[]> {
    const wanted = [...new Set((ids ?? []).filter((id) => typeof id === 'string' && id && id !== user.id))];
    if (!wanted.length) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: wanted.slice(0, 200) }, active: true, ...this.orgUserWhere(tenantIdOf(user)) },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async openDirect(user: ChatUser, otherId: string) {
    if (!otherId || otherId === user.id) throw new BadRequestException('Elige a otra persona');
    const other = await this.assertColleague(user, otherId);
    const orgId = tenantIdOf(user);
    const dmKey = dmKeyOf(user.id, other.id);
    const channel = await this.prisma.chatChannel.upsert({
      where: { organizationId_dmKey: { organizationId: orgId, dmKey } },
      create: {
        organizationId: orgId,
        kind: ChatChannelKind.DIRECT,
        dmKey,
        name: 'Mensaje directo',
        topic: 'Mensaje directo',
        createdById: user.id,
        members: { create: [{ userId: user.id }, { userId: other.id }] },
      },
      update: {},
      select: { id: true },
    });
    // Si alguno salió o el canal es del backfill, se asegura que ambos sigan dentro.
    await this.prisma.chatChannelMember.createMany({
      data: [
        { channelId: channel.id, userId: user.id },
        { channelId: channel.id, userId: other.id },
      ],
      skipDuplicates: true,
    });
    return this.getChannel(user, channel.id);
  }

  /** Canal del evento: la conversación de producción vive junto al show. */
  async openEventChannel(user: ChatUser, eventId: string) {
    const orgId = tenantIdOf(user);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, OR: [{ organizationId: orgId }, ...(this.isDefaultOrg(orgId) ? [{ organizationId: null }] : [])] },
      select: { id: true, name: true, artist: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const existing = await this.prisma.chatChannel.findUnique({ where: { eventId }, select: { id: true } });
    if (existing) return this.getChannel(user, existing.id);

    const label = (event.artist ? `${event.artist} · ${event.name}` : event.name).slice(0, 80);
    const slug = `evento-${slugify(label, 40) || 'show'}-${event.id.slice(-6)}`;
    const channel = await this.prisma.chatChannel.create({
      data: {
        organizationId: orgId,
        kind: ChatChannelKind.PUBLIC,
        slug,
        name: label,
        topic: 'Producción del evento',
        eventId,
        createdById: user.id,
        members: { create: [{ userId: user.id, role: 'owner' }] },
      },
      select: { id: true },
    });
    await this.systemMessage(channel.id, user, `${user.fullName ?? 'Alguien'} abrió el canal del evento`);
    return this.getChannel(user, channel.id);
  }

  private isDefaultOrg(orgId: string) {
    return orgId === tenantIdOf({ roleKey: '', organizationId: null });
  }

  async updateChannel(user: ChatUser, channelId: string, input: { name?: string; topic?: string; description?: string }) {
    const { channel } = await this.access(user, channelId, { write: true });
    if (channel.kind === ChatChannelKind.DIRECT) throw new BadRequestException('Un directo no se renombra');
    const data: Prisma.ChatChannelUpdateInput = {};
    if (input.topic !== undefined) data.topic = input.topic.trim().slice(0, 250) || null;
    if (input.description !== undefined) data.description = input.description.trim().slice(0, 1000) || null;
    if (input.name !== undefined && channel.slug !== GENERAL_SLUG && channel.slug !== ANNOUNCEMENTS_SLUG) {
      const name = input.name.trim().replace(/^#/, '').slice(0, 80);
      if (name.length < 2) throw new BadRequestException('Nombre de canal inválido');
      data.name = name;
    }
    await this.prisma.chatChannel.update({ where: { id: channelId }, data });
    this.realtime.emitToChannel(channelId, 'chat:channel-updated', { channelId });
    return this.getChannel(user, channelId);
  }

  async addMembers(user: ChatUser, channelId: string, userIds: string[]) {
    const { channel } = await this.access(user, channelId, { write: true });
    if (channel.kind === ChatChannelKind.DIRECT) {
      throw new BadRequestException('Un directo es entre dos personas; crea un canal privado');
    }
    const ids = await this.validColleagueIds(user, userIds);
    if (!ids.length) throw new BadRequestException('Elige al menos a una persona de tu organización');
    await this.prisma.chatChannelMember.createMany({
      data: ids.map((id) => ({ channelId, userId: id })),
      skipDuplicates: true,
    });
    this.realtime.emitToChannel(channelId, 'chat:members-changed', { channelId });
    this.realtime.emitToUsers(ids, 'chat:members-changed', { channelId });
    return this.getChannel(user, channelId);
  }

  async removeMember(user: ChatUser, channelId: string, targetId: string) {
    const { channel, membership } = await this.access(user, channelId);
    if (targetId !== user.id && !this.canModerate(user, membership.role)) {
      throw new ForbiddenException('Solo quien administra el canal quita personas');
    }
    if (channel.kind === ChatChannelKind.DIRECT) throw new BadRequestException('No puedes salir de un directo');
    if (channel.slug === GENERAL_SLUG || channel.slug === ANNOUNCEMENTS_SLUG) {
      throw new BadRequestException('Los canales de la organización incluyen a todo el equipo');
    }
    await this.prisma.chatChannelMember.deleteMany({ where: { channelId, userId: targetId } });
    this.realtime.emitToChannel(channelId, 'chat:members-changed', { channelId });
    this.realtime.emitToUser(targetId, 'chat:members-changed', { channelId, removed: true });
    return { ok: true };
  }

  async archiveChannel(user: ChatUser, channelId: string) {
    const { channel, membership } = await this.access(user, channelId);
    if (!this.canModerate(user, membership.role)) throw new ForbiddenException('Solo quien administra el canal lo archiva');
    if (channel.kind === ChatChannelKind.DIRECT || channel.slug === GENERAL_SLUG || channel.slug === ANNOUNCEMENTS_SLUG) {
      throw new BadRequestException('Esta conversación no se archiva');
    }
    await this.prisma.chatChannel.update({ where: { id: channelId }, data: { isArchived: true } });
    this.realtime.emitToChannel(channelId, 'chat:channel-updated', { channelId, archived: true });
    return { ok: true };
  }

  /** Silenciar 8 h, 1 semana o siempre (`hours` vacío); `muted:false` lo reactiva. */
  async setMuted(user: ChatUser, channelId: string, muted: boolean, hours?: number | null) {
    await this.access(user, channelId);
    const mutedUntil = !muted
      ? null
      : hours && hours > 0
        ? new Date(Date.now() + Math.min(hours, 24 * 365) * 3600_000)
        : MUTE_FOREVER;
    await this.prisma.chatChannelMember.update({
      where: { channelId_userId: { channelId, userId: user.id } },
      data: { mutedUntil },
    });
    this.realtime.emitToUser(user.id, 'chat:unread', await this.unreadTotal(user));
    return { ok: true, muted, mutedUntil: mutedUntil?.toISOString() ?? null };
  }

  // ─── Mensajes ────────────────────────────────────────────────────────────

  /**
   * Página de mensajes (ascendente). Cursores por mensaje: `before` (más viejos),
   * `after` (lo nuevo tras reconectar) o `around` (saltar a un mensaje de búsqueda o aviso).
   */
  async listMessages(
    user: ChatUser,
    channelId: string,
    opts: { before?: string; after?: string; around?: string; limit?: number; parentId?: string | null } = {},
  ) {
    await this.access(user, channelId);
    const limit = Math.min(Math.max(Number(opts.limit) || PAGE_DEFAULT, 1), PAGE_MAX);
    const base: Prisma.ChatMessageWhereInput = { channelId, deletedAt: null, parentId: opts.parentId ?? null };

    const cursorOf = async (id?: string) => {
      if (!id) return null;
      const row = await this.prisma.chatMessage.findFirst({
        where: { id, channelId },
        select: { id: true, createdAt: true },
      });
      if (!row) throw new NotFoundException('Mensaje no encontrado');
      return row;
    };
    const olderThan = (c: { id: string; createdAt: Date }, inclusive = false): Prisma.ChatMessageWhereInput => ({
      OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: inclusive ? { lte: c.id } : { lt: c.id } }],
    });
    const newerThan = (c: { id: string; createdAt: Date }): Prisma.ChatMessageWhereInput => ({
      OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: c.id } }],
    });
    const desc = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const asc = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

    if (opts.around) {
      const c = await cursorOf(opts.around);
      const half = Math.max(1, Math.floor(limit / 2));
      const [older, newer] = await Promise.all([
        this.prisma.chatMessage.findMany({ where: { AND: [base, olderThan(c!, true)] }, include: messageInclude, orderBy: desc, take: half + 1 }),
        this.prisma.chatMessage.findMany({ where: { AND: [base, newerThan(c!)] }, include: messageInclude, orderBy: asc, take: half }),
      ]);
      return {
        messages: [...older.reverse(), ...newer].map(serializeMessage),
        hasMore: older.length === half + 1,
        hasNewer: newer.length === half,
      };
    }

    if (opts.after) {
      const c = await cursorOf(opts.after);
      const rows = await this.prisma.chatMessage.findMany({
        where: { AND: [base, newerThan(c!)] },
        include: messageInclude,
        orderBy: asc,
        take: limit,
      });
      return { messages: rows.map(serializeMessage), hasMore: false, hasNewer: rows.length === limit };
    }

    const c = await cursorOf(opts.before);
    const rows = await this.prisma.chatMessage.findMany({
      where: c ? { AND: [base, olderThan(c)] } : base,
      include: messageInclude,
      orderBy: desc,
      take: limit,
    });
    return { messages: rows.reverse().map(serializeMessage), hasMore: rows.length === limit, hasNewer: false };
  }

  /** Un hilo completo: mensaje raíz + respuestas. */
  async getThread(user: ChatUser, messageId: string): Promise<{ root: ChatMessageDto; replies: ChatMessageDto[] }> {
    const found = await this.findMessage(user, messageId);
    const root = found.parentId ? await this.findMessage(user, found.parentId) : found;
    const replies = await this.prisma.chatMessage.findMany({
      where: { parentId: root.id, deletedAt: null },
      include: messageInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE_MAX,
    });
    return { root: serializeMessage(root), replies: replies.map(serializeMessage) };
  }

  private async findMessage(user: ChatUser, messageId: string) {
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null, channel: { organizationId: tenantIdOf(user) } },
      include: messageInclude,
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    await this.access(user, message.channelId);
    return message;
  }

  async postMessage(user: ChatUser, channelId: string, input: PostMessageInput) {
    const { channel } = await this.access(user, channelId, { write: true });
    const body = (input.body ?? '').replace(/\r\n?/g, '\n').trim();
    const attachmentUrl = input.attachmentUrl?.trim() || null;
    if (!body && !attachmentUrl) throw new BadRequestException('Escribe un mensaje');
    if (body.length > MAX_BODY) throw new BadRequestException(`El mensaje admite hasta ${MAX_BODY} caracteres`);
    if (attachmentUrl && !/^\/uploads\/[\w.-]+$/.test(attachmentUrl)) {
      throw new BadRequestException('Adjunto no válido');
    }

    let parentId: string | null = input.parentId || null;
    if (parentId) {
      const parent = await this.prisma.chatMessage.findFirst({
        where: { id: parentId, channelId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new BadRequestException('El hilo ya no existe');
      parentId = parent.parentId ?? parent.id;
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId,
        organizationId: channel.organizationId,
        senderId: user.id,
        parentId,
        kind: attachmentUrl && !body ? ChatMessageKind.FILE : ChatMessageKind.TEXT,
        body,
        attachmentUrl,
        attachmentName: input.attachmentName?.slice(0, 200) || null,
        attachmentMime: input.attachmentMime?.slice(0, 100) || null,
        attachmentSize: input.attachmentSize ?? null,
      },
      include: messageInclude,
    });

    const now = new Date();
    if (!parentId) {
      await this.prisma.chatChannel.update({
        where: { id: channelId },
        data: { lastMessageAt: message.createdAt, lastMessagePreview: pushText(message).slice(0, 140) },
      });
    }
    await this.prisma.chatChannelMember.updateMany({ where: { channelId, userId: user.id }, data: { lastReadAt: now } });

    const payload = { ...serializeMessage(message), clientId: input.clientId ?? null };
    this.realtime.emitToChannel(channelId, parentId ? 'chat:thread-reply' : 'chat:message', payload);
    if (parentId) {
      const parent = await this.prisma.chatMessage.findUnique({ where: { id: parentId }, include: messageInclude });
      if (parent) this.realtime.emitToChannel(channelId, 'chat:message-updated', serializeMessage(parent));
    }

    void this.fanOut(user, channel, message).catch(() => undefined);
    return payload;
  }

  /**
   * Avisos del mensaje:
   * - lista de conversaciones de todos los miembros (socket `chat:channel-activity`);
   * - push tipo WhatsApp a miembros que no silenciaron (en hilos, solo a quienes participan);
   * - aviso en la campana + push a mencionados y, con `@canal`, a todos (aunque silenciaron).
   */
  private async fanOut(user: ChatUser, channel: ChannelRow, message: MessageRow) {
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId: channel.id, user: { active: true } },
      select: { userId: true, mutedUntil: true },
    });
    const memberIds = members.map((m) => m.userId);
    const preview = pushText(message);
    this.realtime.emitToUsers(memberIds, 'chat:channel-activity', {
      channelId: channel.id,
      messageId: message.id,
      parentId: message.parentId,
      preview,
      senderId: user.id,
      at: message.createdAt.toISOString(),
    });

    const now = Date.now();
    const isMuted = (m: { mutedUntil: Date | null }) => Boolean(m.mutedUntil && m.mutedUntil.getTime() > now);
    const memberSet = new Set(memberIds);
    const mentioned = new Set([...mentionedUserIds(message.body, user.id)].filter((id) => memberSet.has(id)));
    const everyone = mentionsChannel(message.body) && channel.kind !== ChatChannelKind.DIRECT && this.canModerate(user)
      ? memberIds.filter((id) => id !== user.id)
      : [];
    for (const id of everyone) mentioned.add(id);

    let audience = members.filter((m) => m.userId !== user.id && !isMuted(m)).map((m) => m.userId);
    if (message.parentId) {
      const participants = await this.prisma.chatMessage.findMany({
        where: { OR: [{ id: message.parentId }, { parentId: message.parentId }], deletedAt: null },
        select: { senderId: true },
        distinct: ['senderId'],
      });
      const inThread = new Set(participants.map((p) => p.senderId));
      audience = audience.filter((id) => inThread.has(id));
    }
    audience = audience.filter((id) => !mentioned.has(id));

    const author = user.fullName || message.sender.fullName || 'Alguien';
    const direct = channel.kind === ChatChannelKind.DIRECT;
    const channelLabel = direct ? '' : `#${channel.name}`;
    const url = `/chat?channel=${channel.id}&msg=${message.id}`;
    const body = message.parentId ? `Respuesta en hilo: ${preview}` : preview;

    await Promise.all(
      audience.map(async (uid) =>
        this.notifications.pushOnly(uid, {
          title: direct ? shortName(author) || author : `${shortName(author) || author} en ${channelLabel}`,
          body,
          url,
          type: 'chat.message',
          kind: 'chat',
          channel: 'chat',
          priority: 'high',
          tag: `chat-${channel.id}`,
          senderId: user.id,
          senderName: author,
          threadId: `chat-${channel.id}`,
          threadTitle: channelLabel,
          channelId: channel.id,
          messageId: message.id,
          badge: (await this.unreadTotal({ ...user, id: uid })).total,
        }),
      ),
    );

    await this.notifications.notifyMany(
      [...mentioned].map((uid) => ({
        userId: uid,
        organizationId: channel.organizationId,
        actorId: user.id,
        type: 'chat.mention',
        title: direct
          ? `${shortName(author) || author} te mencionó`
          : `${shortName(author) || author} te mencionó en ${channelLabel}`,
        body: preview,
        linkUrl: url,
      })),
    );
  }

  private async systemMessage(channelId: string, user: ChatUser, body: string) {
    const message = await this.prisma.chatMessage.create({
      data: { channelId, organizationId: tenantIdOf(user), senderId: user.id, kind: ChatMessageKind.SYSTEM, body },
      include: messageInclude,
    });
    await this.prisma.chatChannel.update({
      where: { id: channelId },
      data: { lastMessageAt: message.createdAt, lastMessagePreview: chatPreview(body) },
    });
    this.realtime.emitToChannel(channelId, 'chat:message', serializeMessage(message));
  }

  async editMessage(user: ChatUser, messageId: string, rawBody: string) {
    const message = await this.findMessage(user, messageId);
    if (message.senderId !== user.id) throw new ForbiddenException('Solo puedes editar tus mensajes');
    if (message.kind === ChatMessageKind.SYSTEM) throw new BadRequestException('Este mensaje no se edita');
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ForbiddenException('Los mensajes se editan durante la primera hora');
    }
    const body = (rawBody ?? '').replace(/\r\n?/g, '\n').trim();
    if (!body && !message.attachmentUrl) throw new BadRequestException('Escribe un mensaje');
    if (body.length > MAX_BODY) throw new BadRequestException(`El mensaje admite hasta ${MAX_BODY} caracteres`);
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      include: messageInclude,
    });
    await this.refreshPreview(updated.channelId);
    const payload = serializeMessage(updated);
    this.realtime.emitToChannel(updated.channelId, 'chat:message-updated', payload);
    return payload;
  }

  /** Borrado suave: autor o dirección. Queda el hueco «Mensaje eliminado» en el cliente. */
  async deleteMessage(user: ChatUser, messageId: string) {
    const message = await this.findMessage(user, messageId);
    if (message.senderId !== user.id && !isDirectionRole(user.roleKey)) {
      throw new ForbiddenException('Solo puedes borrar tus mensajes');
    }
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), pinnedAt: null, pinnedById: null },
    });
    await this.refreshPreview(message.channelId);
    this.realtime.emitToChannel(message.channelId, 'chat:message-deleted', {
      channelId: message.channelId,
      messageId,
      parentId: message.parentId,
    });
    return { ok: true };
  }

  private async refreshPreview(channelId: string) {
    const latest = await this.prisma.chatMessage.findFirst({
      where: { channelId, deletedAt: null, parentId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { body: true, attachmentUrl: true, attachmentName: true, createdAt: true },
    });
    await this.prisma.chatChannel.update({
      where: { id: channelId },
      data: {
        lastMessagePreview: latest ? pushText(latest).slice(0, 140) : null,
        lastMessageAt: latest?.createdAt ?? null,
      },
    });
  }

  async toggleReaction(user: ChatUser, messageId: string, rawEmoji: string) {
    const emoji = (rawEmoji ?? '').trim().slice(0, 32);
    if (!emoji) throw new BadRequestException('Emoji inválido');
    const message = await this.findMessage(user, messageId);
    const key = { messageId_userId_emoji: { messageId, userId: user.id, emoji } };
    const existing = await this.prisma.chatMessageReaction.findUnique({ where: key });
    if (existing) {
      await this.prisma.chatMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.chatMessageReaction.create({ data: { messageId, userId: user.id, emoji } });
    }
    const refreshed = await this.prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    const payload = serializeMessage(refreshed);
    this.realtime.emitToChannel(message.channelId, 'chat:message-updated', payload);
    return payload;
  }

  async togglePin(user: ChatUser, messageId: string) {
    const message = await this.findMessage(user, messageId);
    await this.access(user, message.channelId, { write: true });
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: message.pinnedAt ? { pinnedAt: null, pinnedById: null } : { pinnedAt: new Date(), pinnedById: user.id },
      include: messageInclude,
    });
    const payload = serializeMessage(updated);
    this.realtime.emitToChannel(message.channelId, 'chat:message-updated', payload);
    return payload;
  }

  async listPins(user: ChatUser, channelId: string) {
    await this.access(user, channelId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { channelId, deletedAt: null, pinnedAt: { not: null } },
      include: messageInclude,
      orderBy: { pinnedAt: 'desc' },
      take: 50,
    });
    return { messages: rows.map(serializeMessage) };
  }

  /** Leído: guarda el marcador, avisa ✓✓ al canal y limpia el globo en mis otros dispositivos. */
  async markRead(user: ChatUser, channelId: string) {
    await this.access(user, channelId);
    const latest = await this.prisma.chatMessage.findFirst({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    // Nunca antes del último mensaje: un desfase de reloj no deja nada como pendiente.
    const now = new Date();
    const lastReadAt = latest && latest.createdAt > now ? latest.createdAt : now;
    await this.prisma.chatChannelMember.update({
      where: { channelId_userId: { channelId, userId: user.id } },
      data: { lastReadAt },
    });
    const at = lastReadAt.toISOString();
    this.realtime.emitToChannel(channelId, 'chat:read', { channelId, userId: user.id, at });
    const unread = await this.unreadTotal(user);
    this.realtime.emitToUser(user.id, 'chat:unread', { ...unread, channelId, readAt: at });
    // Push silencioso: el teléfono quita los avisos de esta conversación (leído en otro lado).
    void this.notifications
      .pushOnly(user.id, {
        title: '',
        body: '',
        type: 'chat.read',
        kind: 'chat',
        channel: 'chat',
        silent: true,
        threadId: `chat-${channelId}`,
        channelId,
        badge: unread.total,
      })
      .catch(() => undefined);
    return { ok: true, lastReadAt: at };
  }

  async searchMessages(user: ChatUser, rawQuery: string, channelId?: string) {
    const q = (rawQuery ?? '').trim().slice(0, 100);
    if (q.length < 2) return { messages: [] };
    if (channelId) await this.access(user, channelId);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        body: { contains: q, mode: 'insensitive' },
        kind: { not: ChatMessageKind.SYSTEM },
        channel: channelId
          ? { id: channelId }
          : {
              organizationId: tenantIdOf(user),
              isArchived: false,
              OR: [{ kind: ChatChannelKind.PUBLIC }, { members: { some: { userId: user.id } } }],
            },
      },
      include: { ...messageInclude, channel: { select: { id: true, name: true, kind: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    return { messages: rows.map((m) => ({ ...serializeMessage(m), channel: m.channel })) };
  }

  /** Gente de mi organización para directos, menciones e invitaciones. */
  listColleagues(user: ChatUser, rawQuery?: string) {
    const q = (rawQuery ?? '').trim().slice(0, 100);
    return this.prisma.user.findMany({
      where: {
        active: true,
        id: { not: user.id },
        ...this.orgUserWhere(tenantIdOf(user)),
        ...(q
          ? { AND: [{ OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }] }
          : {}),
      },
      select: { id: true, fullName: true, title: true, email: true },
      orderBy: { fullName: 'asc' },
      take: 60,
    });
  }

  // ─── Compatibilidad: chat de la junta 11-09 (web actual) ─────────────────

  private async legacyChannelId(user: ChatUser, rawThread: unknown): Promise<string> {
    const key = typeof rawThread === 'string' ? rawThread.trim() : '';
    if (key === LEGACY_GENERAL) {
      const orgId = tenantIdOf(user);
      await this.ensureDefaults(orgId);
      const general = await this.prisma.chatChannel.findUniqueOrThrow({
        where: { organizationId_slug: { organizationId: orgId, slug: GENERAL_SLUG } },
        select: { id: true },
      });
      return general.id;
    }
    if (key.startsWith(LEGACY_DM_PREFIX)) {
      const channel = await this.openDirect(user, key.slice(LEGACY_DM_PREFIX.length));
      return channel.id;
    }
    throw new BadRequestException('Conversación no válida');
  }

  /** `GET /chat/threads`: General + una conversación por persona activa. */
  async legacyThreads(user: ChatUser) {
    const [channels, mates] = await Promise.all([this.listChannels(user), this.listColleagues(user)]);
    const general = channels.find((c) => c.slug === GENERAL_SLUG);
    const byPeer = new Map(channels.filter((c) => c.peer).map((c) => [c.peer!.id, c]));
    const last = async (channelId?: string) => {
      if (!channelId) return null;
      const m = await this.prisma.chatMessage.findFirst({
        where: { channelId, deletedAt: null, parentId: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { body: true, createdAt: true, senderId: true, sender: { select: { fullName: true } } },
      });
      return m
        ? { body: chatPreview(m.body, 160), at: m.createdAt.toISOString(), senderId: m.senderId, senderName: m.sender.fullName }
        : null;
    };
    const dms = await Promise.all(
      mates.map(async (m) => {
        const ch = byPeer.get(m.id);
        return {
          key: `${LEGACY_DM_PREFIX}${m.id}`,
          kind: 'dm' as const,
          title: m.fullName,
          subtitle: m.title ?? null,
          userId: m.id,
          lastMessage: await last(ch?.id),
          unread: ch?.unreadCount ?? 0,
        };
      }),
    );
    dms.sort((a, b) => {
      const at = a.lastMessage?.at ?? '';
      const bt = b.lastMessage?.at ?? '';
      if (at !== bt) return at > bt ? -1 : 1;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    });
    return {
      threads: [
        {
          key: LEGACY_GENERAL,
          kind: 'general' as const,
          title: 'General',
          subtitle: 'Todo el equipo',
          userId: null,
          lastMessage: await last(general?.id),
          unread: general?.unreadCount ?? 0,
        },
        ...dms,
      ],
    };
  }

  async legacyMessages(user: ChatUser, rawThread: unknown, rawAfter?: string) {
    const channelId = await this.legacyChannelId(user, rawThread);
    const after = rawAfter ? new Date(rawAfter) : null;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        parentId: null,
        ...(after && !Number.isNaN(after.getTime()) ? { createdAt: { gt: after } } : {}),
      },
      orderBy: after ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: after ? 500 : 200,
      select: { id: true, body: true, createdAt: true, sender: { select: { id: true, fullName: true } } },
    });
    const ordered = after ? rows : rows.reverse();
    return ordered.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      sender: r.sender,
    }));
  }

  async legacySend(user: ChatUser, rawThread: unknown, body: unknown) {
    const channelId = await this.legacyChannelId(user, rawThread);
    const saved = await this.postMessage(user, channelId, { body: typeof body === 'string' ? body : '' });
    return { id: saved.id, body: saved.body, createdAt: saved.createdAt, sender: { id: saved.author.id, fullName: saved.author.fullName } };
  }

  async legacyMarkRead(user: ChatUser, rawThread: unknown) {
    const channelId = await this.legacyChannelId(user, rawThread);
    await this.markRead(user, channelId);
    return { ok: true as const };
  }
}
