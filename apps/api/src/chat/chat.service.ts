import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatChannelKind, ChatMessageKind, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { tenantIdOf } from '../common/tenant';
import { ALL_ROLES, isDirectionRole } from '../common/rbac/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { shortName } from '../notifications/notification-push-meta';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  chatPreview,
  dmKeyOf,
  groupDmKeyOf,
  mentionedUserIds,
  mentionsChannel,
  PREVIEW_MAX,
  pushText,
  slugify,
} from './chat-text';
import { chatMimeFor } from './chat-attachments';

/**
 * Chat tipo Slack (portado de NEXARA y ajustado a ARTA):
 * canales públicos y privados, directos 1:1 y de grupo, canal por evento, hilos,
 * reacciones, fijados, edición, borrado, búsqueda, menciones, silenciar, adjuntos,
 * responder citando y mensajes guardados.
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
/** Directo de grupo: de 2 a 8 personas además de quien lo crea. */
export const GROUP_DM_MAX = 8;

/** Reportes y bloqueos (docs/chat-reportar-bloquear.md, Apple guía 1.2). */
export const REPORT_REASONS = ['SPAM', 'ACOSO', 'OFENSIVO', 'OTRO'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_DETAILS_MAX = 1000;
export const BLOCKED_DM_MESSAGE = 'No puedes enviar mensajes a esta persona';
const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam',
  ACOSO: 'Acoso o intimidación',
  OFENSIVO: 'Contenido ofensivo o inapropiado',
  OTRO: 'Otro',
};
const DIRECTION_ROLES = ALL_ROLES.filter((r) => isDirectionRole(r));

const authorSelect = { id: true, fullName: true, title: true } as const;

const messageInclude = {
  sender: { select: authorSelect },
  reactions: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, fullName: true } } },
  },
  replyTo: {
    select: {
      id: true,
      senderId: true,
      kind: true,
      body: true,
      attachmentUrl: true,
      attachmentName: true,
      deletedAt: true,
      sender: { select: { id: true, fullName: true } },
    },
  },
  _count: { select: { replies: { where: { deletedAt: null } } } },
} satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

export type ChatQuoteDto = {
  id: string;
  authorId: string;
  authorName: string;
  /** Cuerpo a ≤140 caracteres, menciones ya como `@Nombre`. */
  excerpt: string;
  kind: ChatMessageKind;
  attachmentName: string | null;
  deleted: boolean;
};

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
  replyTo: ChatQuoteDto | null;
  /** Borrado que se conserva porque tiene hilo: el cliente pinta «Mensaje eliminado». */
  deleted: boolean;
  /** Guardado por quien pide; no viaja en los eventos del canal (es personal). */
  saved?: boolean;
};

export type PostMessageInput = {
  body?: string | null;
  parentId?: string | null;
  replyToId?: string | null;
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
  isGroupDm: boolean;
  eventId: string | null;
  postingRestricted: boolean;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
};

function serializeQuote(q: NonNullable<MessageRow['replyTo']>): ChatQuoteDto {
  const deleted = Boolean(q.deletedAt);
  return {
    id: q.id,
    authorId: q.senderId,
    authorName: q.sender.fullName,
    excerpt: deleted ? '' : chatPreview(q.body, PREVIEW_MAX),
    kind: q.kind,
    attachmentName: deleted || !q.attachmentUrl ? null : q.attachmentName,
    deleted,
  };
}

export function serializeMessage(m: MessageRow, savedIds?: Set<string>): ChatMessageDto {
  const reactions = new Map<string, ChatMessageDto['reactions'][number]>();
  for (const r of m.reactions) {
    const cur = reactions.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [], users: [] };
    cur.count += 1;
    cur.userIds.push(r.userId);
    cur.users.push({ id: r.user.id, fullName: r.user.fullName });
    reactions.set(r.emoji, cur);
  }
  const deleted = Boolean(m.deletedAt);
  return {
    id: m.id,
    channelId: m.channelId,
    parentId: m.parentId,
    kind: m.kind,
    body: deleted ? '' : m.body,
    attachment:
      m.attachmentUrl && !deleted
        ? { url: m.attachmentUrl, name: m.attachmentName, mime: m.attachmentMime, size: m.attachmentSize }
        : null,
    pinnedAt: m.pinnedAt?.toISOString() ?? null,
    editedAt: m.editedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    author: { id: m.sender.id, fullName: m.sender.fullName, title: m.sender.title ?? null },
    replyCount: m._count.replies,
    reactions: [...reactions.values()],
    replyTo: m.replyTo ? serializeQuote(m.replyTo) : null,
    deleted,
    ...(savedIds ? { saved: savedIds.has(m.id) } : {}),
  };
}

/** Nombre de un grupo: nombres de pila de quienes lo forman. */
export function groupDmName(people: Array<{ fullName: string }>): string {
  const names = people.map((p) => p.fullName.trim().split(/\s+/)[0]).filter(Boolean);
  const name = names.join(', ');
  return (name.length > 80 ? `${name.slice(0, 79)}…` : name) || 'Grupo';
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

  /** No leídos por canal en una sola consulta (desde lastReadAt, o desde que entró; sin bloqueados). */
  private async unreadByChannel(userId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ channelId: string; n: number }>>`
      SELECT m."channelId" AS "channelId", COUNT(*)::int AS n
      FROM "ChatMessage" m
      JOIN "ChatChannelMember" mm ON mm."channelId" = m."channelId" AND mm."userId" = ${userId}
      WHERE m."deletedAt" IS NULL
        AND m."parentId" IS NULL
        AND m."senderId" <> ${userId}
        AND m."createdAt" > COALESCE(mm."lastReadAt", mm."joinedAt")
        AND NOT EXISTS (
          SELECT 1 FROM "ChatUserBlock" b WHERE b."blockerId" = ${userId} AND b."blockedId" = m."senderId"
        )
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
        AND (mm."mutedUntil" IS NULL OR mm."mutedUntil" < now())
        AND NOT EXISTS (
          SELECT 1 FROM "ChatUserBlock" b WHERE b."blockerId" = ${user.id} AND b."blockedId" = m."senderId"
        )`;
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
          isGroupDm: ch.isGroupDm,
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
      isGroupDm: channel.isGroupDm,
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
    await this.notifyAdded(user, { id: channel.id, name, isGroupDm: false, organizationId: orgId }, extra);
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

  /** Campana + push a quien entra a un canal o grupo (no a quien lo agregó). */
  private async notifyAdded(
    user: ChatUser,
    channel: { id: string; name: string; isGroupDm: boolean; organizationId: string },
    userIds: string[],
  ) {
    if (!userIds.length) return;
    const author = user.fullName || 'Alguien';
    await this.notifications.notifyMany(
      userIds.map((uid) => ({
        userId: uid,
        organizationId: channel.organizationId,
        actorId: user.id,
        type: 'chat.added',
        title: channel.isGroupDm ? 'Nuevo grupo' : `Te agregaron a #${channel.name}`,
        body: channel.isGroupDm ? `${author} te agregó a ${channel.name}` : `${author} te agregó al canal`,
        linkUrl: `/chat?channel=${channel.id}`,
      })),
    );
  }

  async openDirect(user: ChatUser, otherId: string) {
    if (!otherId || otherId === user.id) throw new BadRequestException('Elige a otra persona');
    const other = await this.assertColleague(user, otherId);
    if (await this.blockedBetween(user.id, other.id)) throw new ForbiddenException(BLOCKED_DM_MESSAGE);
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

  /**
   * Directo de grupo (canal privado con `isGroupDm`). La llave `g:<ids ordenados>`
   * evita duplicados: con las mismas personas se devuelve el grupo que ya existe.
   */
  async openGroupDm(user: ChatUser, userIds: string[]) {
    const wanted = [...new Set((userIds ?? []).filter((id) => typeof id === 'string' && id && id !== user.id))];
    if (wanted.length < 2 || wanted.length > GROUP_DM_MAX) {
      throw new BadRequestException(`Un grupo es de 2 a ${GROUP_DM_MAX} personas además de ti`);
    }
    const orgId = tenantIdOf(user);
    const people = await this.prisma.user.findMany({
      where: { id: { in: wanted }, active: true, ...this.orgUserWhere(orgId) },
      select: { id: true, fullName: true },
    });
    if (people.length !== wanted.length) throw new BadRequestException('Elige solo personas activas de tu organización');
    const dmKey = groupDmKeyOf([user.id, ...wanted]);
    const where = { organizationId_dmKey: { organizationId: orgId, dmKey } };
    const reopen = async (id: string) => {
      await this.prisma.chatChannel.update({ where: { id }, data: { isArchived: false } });
      await this.prisma.chatChannelMember.createMany({
        data: [user.id, ...wanted].map((uid) => ({ channelId: id, userId: uid })),
        skipDuplicates: true,
      });
      return this.getChannel(user, id);
    };

    const existing = await this.prisma.chatChannel.findUnique({ where, select: { id: true } });
    if (existing) return reopen(existing.id);

    const name = groupDmName([{ fullName: user.fullName || '' }, ...people].filter((p) => p.fullName));
    let channelId: string;
    try {
      const created = await this.prisma.chatChannel.create({
        data: {
          organizationId: orgId,
          kind: ChatChannelKind.PRIVATE,
          isGroupDm: true,
          dmKey,
          name,
          createdById: user.id,
          members: { create: [{ userId: user.id, role: 'owner' }, ...wanted.map((id) => ({ userId: id }))] },
        },
        select: { id: true },
      });
      channelId = created.id;
    } catch (e) {
      // Dos clics a la vez: el otro ya lo creó.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const raced = await this.prisma.chatChannel.findUniqueOrThrow({ where, select: { id: true } });
      return reopen(raced.id);
    }
    this.realtime.emitToUsers(wanted, 'chat:members-changed', { channelId });
    await this.notifyAdded(user, { id: channelId, name, isGroupDm: true, organizationId: orgId }, wanted);
    return this.getChannel(user, channelId);
  }

  /** Al cambiar quién está en un grupo, la llave sigue a las personas (o se suelta si ya hay otro igual). */
  private async syncGroupKey(channelId: string, orgId: string) {
    const members = await this.prisma.chatChannelMember.findMany({ where: { channelId }, select: { userId: true } });
    const dmKey = groupDmKeyOf(members.map((m) => m.userId));
    const taken = await this.prisma.chatChannel.findFirst({
      where: { organizationId: orgId, dmKey, id: { not: channelId } },
      select: { id: true },
    });
    await this.prisma.chatChannel.update({ where: { id: channelId }, data: { dmKey: taken ? null : dmKey } });
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
    const already = await this.prisma.chatChannelMember.findMany({
      where: { channelId, userId: { in: ids } },
      select: { userId: true },
    });
    const inside = new Set(already.map((m) => m.userId));
    const added = ids.filter((id) => !inside.has(id));
    if (channel.isGroupDm && added.length) {
      const count = await this.prisma.chatChannelMember.count({ where: { channelId } });
      if (count + added.length > GROUP_DM_MAX + 1) {
        throw new BadRequestException(`Un grupo admite hasta ${GROUP_DM_MAX + 1} personas; crea un canal privado`);
      }
    }
    await this.prisma.chatChannelMember.createMany({
      data: added.map((id) => ({ channelId, userId: id })),
      skipDuplicates: true,
    });
    if (channel.isGroupDm && added.length) {
      await this.syncGroupKey(channelId, channel.organizationId).catch(() => undefined);
    }
    this.realtime.emitToChannel(channelId, 'chat:members-changed', { channelId });
    this.realtime.emitToUsers(ids, 'chat:members-changed', { channelId });
    await this.notifyAdded(user, channel, added);
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
    const removed = await this.prisma.chatChannelMember.deleteMany({ where: { channelId, userId: targetId } });
    if (channel.isGroupDm && removed.count) {
      await this.syncGroupKey(channelId, channel.organizationId).catch(() => undefined);
    }
    this.realtime.emitToChannel(channelId, 'chat:members-changed', { channelId });
    this.realtime.emitToUser(targetId, 'chat:members-changed', { channelId, removed: true });
    if (targetId !== user.id && removed.count) {
      // Sin enlace al canal: ya no tiene acceso.
      await this.notifications.notify({
        userId: targetId,
        organizationId: channel.organizationId,
        actorId: user.id,
        type: 'chat.removed',
        title: channel.isGroupDm ? `Te quitaron del grupo ${channel.name}` : `Te quitaron de #${channel.name}`,
        body: `${user.fullName || 'Alguien'} te quitó de la conversación`,
        linkUrl: '/chat',
      });
    }
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

  private async savedIdsOf(userId: string, messageIds: string[]): Promise<Set<string>> {
    if (!messageIds.length) return new Set();
    const rows = await this.prisma.chatSavedMessage.findMany({
      where: { userId, messageId: { in: messageIds } },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  private async serializeFor(userId: string, rows: MessageRow[]): Promise<ChatMessageDto[]> {
    const saved = await this.savedIdsOf(userId, rows.map((r) => r.id));
    return rows.map((r) => serializeMessage(r, saved));
  }

  /**
   * Página de mensajes (ascendente). Cursores por mensaje: `before` (más viejos),
   * `after` (lo nuevo tras reconectar) o `around` (saltar a un mensaje de búsqueda o aviso).
   */
  async listMessages(
    user: ChatUser,
    channelId: string,
    opts: { before?: string; after?: string; around?: string; limit?: number; parentId?: string | null } = {},
  ) {
    const [, blocked] = await Promise.all([this.access(user, channelId), this.blockedIdsOf(user.id)]);
    const limit = Math.min(Math.max(Number(opts.limit) || PAGE_DEFAULT, 1), PAGE_MAX);
    const base: Prisma.ChatMessageWhereInput = {
      channelId,
      parentId: opts.parentId ?? null,
      // Un borrado con hilo vivo se queda como «Mensaje eliminado» para no perder las respuestas.
      OR: [{ deletedAt: null }, { replies: { some: { deletedAt: null } } }],
      ...this.notFromBlocked(blocked),
    };

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
        messages: await this.serializeFor(user.id, [...older.reverse(), ...newer]),
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
      return { messages: await this.serializeFor(user.id, rows), hasMore: false, hasNewer: rows.length === limit };
    }

    const c = await cursorOf(opts.before);
    const rows = await this.prisma.chatMessage.findMany({
      where: c ? { AND: [base, olderThan(c)] } : base,
      include: messageInclude,
      orderBy: desc,
      take: limit,
    });
    return { messages: await this.serializeFor(user.id, rows.reverse()), hasMore: rows.length === limit, hasNewer: false };
  }

  /** Un hilo completo: mensaje raíz (aunque se haya borrado) + respuestas. */
  async getThread(user: ChatUser, messageId: string): Promise<{ root: ChatMessageDto; replies: ChatMessageDto[] }> {
    const blocked = await this.blockedIdsOf(user.id);
    const found = await this.findMessage(user, messageId, { includeDeleted: true });
    const root = found.parentId ? await this.findMessage(user, found.parentId, { includeDeleted: true }) : found;
    // El hilo de alguien que bloqueé no se abre (su mensaje raíz tampoco aparece en el canal).
    if (blocked.includes(root.senderId)) throw new NotFoundException('Mensaje no encontrado');
    const replies = await this.prisma.chatMessage.findMany({
      where: { parentId: root.id, deletedAt: null, ...this.notFromBlocked(blocked) },
      include: messageInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE_MAX,
    });
    const [rootDto, ...replyDtos] = await this.serializeFor(user.id, [root, ...replies]);
    return { root: rootDto, replies: replyDtos };
  }

  private async findMessage(user: ChatUser, messageId: string, opts: { includeDeleted?: boolean } = {}) {
    return (await this.findMessageIn(user, messageId, opts)).message;
  }

  /** Mensaje de un canal al que tengo acceso, junto con ese canal. */
  private async findMessageIn(user: ChatUser, messageId: string, opts: { includeDeleted?: boolean } = {}) {
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
        channel: { organizationId: tenantIdOf(user) },
      },
      include: messageInclude,
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    const { channel } = await this.access(user, message.channelId);
    return { message, channel };
  }

  async postMessage(user: ChatUser, channelId: string, input: PostMessageInput) {
    const { channel } = await this.access(user, channelId, { write: true });
    if (channel.kind === ChatChannelKind.DIRECT) await this.assertDirectOpen(user, channelId);
    const body = (input.body ?? '').replace(/\r\n?/g, '\n').trim();
    const attachmentUrl = input.attachmentUrl?.trim() || null;
    if (!body && !attachmentUrl) throw new BadRequestException('Escribe un mensaje');
    if (body.length > MAX_BODY) throw new BadRequestException(`El mensaje admite hasta ${MAX_BODY} caracteres`);
    if (attachmentUrl && !/^\/uploads\/(chat\/)?[\w.-]+$/.test(attachmentUrl)) {
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

    const replyToId: string | null = input.replyToId || null;
    if (replyToId) {
      const quoted = await this.prisma.chatMessage.findFirst({
        where: { id: replyToId, channelId, deletedAt: null },
        select: { id: true },
      });
      if (!quoted) throw new BadRequestException('El mensaje que citas no existe en esta conversación');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId,
        organizationId: channel.organizationId,
        senderId: user.id,
        parentId,
        replyToId,
        kind: attachmentUrl && !body ? ChatMessageKind.FILE : ChatMessageKind.TEXT,
        body,
        attachmentUrl,
        attachmentName: input.attachmentName?.slice(0, 200) || null,
        attachmentMime: attachmentUrl ? chatMimeFor(attachmentUrl, input.attachmentMime) : null,
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

    // Recién creado: nadie lo ha guardado todavía.
    const payload = { ...serializeMessage(message, new Set()), clientId: input.clientId ?? null };
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
   * - push tipo WhatsApp a miembros que no silenciaron (en hilos, a quienes participan
   *   y a quien escribió el mensaje raíz);
   * - aviso en la campana + push a mencionados y, con `@canal`, a todos (aunque silenciaron).
   * Quien bloqueó al autor no recibe nada de eso (solo el socket que actualiza su lista).
   */
  private async fanOut(user: ChatUser, channel: ChannelRow, message: MessageRow) {
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId: channel.id, user: { active: true } },
      select: { userId: true, mutedUntil: true },
    });
    const memberIds = members.map((m) => m.userId);
    const preview = pushText(message);

    const blockers = new Set(
      (
        await this.prisma.chatUserBlock.findMany({
          where: { blockedId: user.id, blockerId: { in: memberIds } },
          select: { blockerId: true },
        })
      ).map((b) => b.blockerId),
    );
    const now = Date.now();
    const isMuted = (m: { mutedUntil: Date | null }) => Boolean(m.mutedUntil && m.mutedUntil.getTime() > now);
    const memberSet = new Set(memberIds.filter((id) => !blockers.has(id)));
    const mentioned = new Set([...mentionedUserIds(message.body, user.id)].filter((id) => memberSet.has(id)));
    const everyone = mentionsChannel(message.body) && channel.kind !== ChatChannelKind.DIRECT && this.canModerate(user)
      ? [...memberSet].filter((id) => id !== user.id)
      : [];
    for (const id of everyone) mentioned.add(id);

    const direct = channel.kind === ChatChannelKind.DIRECT;
    const channelLabel = direct ? '' : channel.isGroupDm ? channel.name : `#${channel.name}`;

    // `notify`: el navegador con la pestaña oculta muestra aviso de escritorio. No a quien
    // silenció, ni en hilos, ni a mencionados (a ellos ya les llega por la campana).
    const activity = {
      channelId: channel.id,
      messageId: message.id,
      parentId: message.parentId,
      preview,
      senderId: user.id,
      senderName: user.fullName || message.sender.fullName || null,
      channelName: direct ? null : channel.name,
      at: message.createdAt.toISOString(),
    };
    const reachable = members.filter((m) => m.userId !== user.id && !isMuted(m) && !blockers.has(m.userId));
    const loud = new Set(
      message.parentId ? [] : reachable.filter((m) => !mentioned.has(m.userId)).map((m) => m.userId),
    );
    this.realtime.emitToUsers(memberIds.filter((id) => loud.has(id)), 'chat:channel-activity', { ...activity, notify: true });
    this.realtime.emitToUsers(memberIds.filter((id) => !loud.has(id)), 'chat:channel-activity', { ...activity, notify: false });

    let audience = reachable.map((m) => m.userId);
    if (message.parentId) {
      const [root, participants] = await Promise.all([
        this.prisma.chatMessage.findUnique({ where: { id: message.parentId }, select: { senderId: true } }),
        this.prisma.chatMessage.findMany({
          where: { parentId: message.parentId, deletedAt: null },
          select: { senderId: true },
          distinct: ['senderId'],
        }),
      ]);
      const inThread = new Set(participants.map((p) => p.senderId));
      if (root) inThread.add(root.senderId);
      audience = audience.filter((id) => inThread.has(id));
    }
    audience = audience.filter((id) => !mentioned.has(id));

    const author = user.fullName || message.sender.fullName || 'Alguien';
    const url = `/chat?channel=${channel.id}&msg=${message.id}`;
    const body = message.parentId ? `Respuesta en hilo: ${preview}` : preview;

    await Promise.all(
      audience.map(async (uid) =>
        this.notifications.pushOnly(uid, {
          title: direct ? shortName(author) || author : `${shortName(author) || author} en ${channelLabel}`,
          body,
          url,
          type: message.parentId ? 'chat.thread_reply' : 'chat.message',
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
    this.realtime.emitToChannel(updated.channelId, 'chat:message-updated', serializeMessage(updated));
    return (await this.serializeFor(user.id, [updated]))[0];
  }

  /**
   * Borrado suave: autor o dirección. Si tiene hilo, el evento lleva el mensaje ya
   * vacío (`deleted: true`) para que el cliente deje «Mensaje eliminado» en su lugar.
   */
  async deleteMessage(user: ChatUser, messageId: string) {
    const message = await this.findMessage(user, messageId);
    if (message.senderId !== user.id && !isDirectionRole(user.roleKey)) {
      throw new ForbiddenException('Solo puedes borrar tus mensajes');
    }
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), pinnedAt: null, pinnedById: null },
      include: messageInclude,
    });
    await this.refreshPreview(message.channelId);
    const keep = (updated?._count?.replies ?? 0) > 0;
    this.realtime.emitToChannel(message.channelId, 'chat:message-deleted', {
      channelId: message.channelId,
      messageId,
      parentId: message.parentId,
      ...(keep ? { message: serializeMessage(updated) } : {}),
    });
    return { ok: true };
  }

  private async refreshPreview(channelId: string) {
    const latest = await this.prisma.chatMessage.findFirst({
      where: { channelId, deletedAt: null, parentId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { body: true, attachmentUrl: true, attachmentName: true, attachmentMime: true, createdAt: true },
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
    this.realtime.emitToChannel(message.channelId, 'chat:message-updated', serializeMessage(refreshed));
    if (
      !existing &&
      message.senderId !== user.id &&
      message.kind !== ChatMessageKind.SYSTEM &&
      !(await this.isBlockedBy(message.senderId, user.id))
    ) {
      const author = user.fullName || 'Alguien';
      // Solo push con etiqueta por mensaje: varias reacciones reemplazan la misma tarjeta (sin fila en la campana).
      void this.notifications
        .pushOnly(message.senderId, {
          title: `${shortName(author) || author} reaccionó ${emoji}`,
          body: pushText(message),
          url: `/chat?channel=${message.channelId}&msg=${messageId}`,
          type: 'chat.reaction',
          kind: 'event',
          channel: 'chat',
          priority: 'normal',
          tag: `chat-reaction-${messageId}`,
          senderId: user.id,
          senderName: author,
          channelId: message.channelId,
          messageId,
        })
        .catch(() => undefined);
    }
    return (await this.serializeFor(user.id, [refreshed]))[0];
  }

  async togglePin(user: ChatUser, messageId: string) {
    const message = await this.findMessage(user, messageId);
    await this.access(user, message.channelId, { write: true });
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: message.pinnedAt ? { pinnedAt: null, pinnedById: null } : { pinnedAt: new Date(), pinnedById: user.id },
      include: messageInclude,
    });
    this.realtime.emitToChannel(message.channelId, 'chat:message-updated', serializeMessage(updated));
    return (await this.serializeFor(user.id, [updated]))[0];
  }

  async listPins(user: ChatUser, channelId: string) {
    const [, blocked] = await Promise.all([this.access(user, channelId), this.blockedIdsOf(user.id)]);
    const rows = await this.prisma.chatMessage.findMany({
      where: { channelId, deletedAt: null, pinnedAt: { not: null }, ...this.notFromBlocked(blocked) },
      include: messageInclude,
      orderBy: { pinnedAt: 'desc' },
      take: 50,
    });
    return { messages: await this.serializeFor(user.id, rows) };
  }

  // ─── Guardados ───────────────────────────────────────────────────────────

  /** Alterna el marcador personal; mis otros dispositivos se enteran por socket. */
  async toggleSaved(user: ChatUser, messageId: string): Promise<{ saved: boolean }> {
    await this.findMessage(user, messageId);
    const key = { userId_messageId: { userId: user.id, messageId } };
    const existing = await this.prisma.chatSavedMessage.findUnique({ where: key, select: { id: true } });
    if (existing) {
      await this.prisma.chatSavedMessage.deleteMany({ where: { userId: user.id, messageId } });
    } else {
      await this.prisma.chatSavedMessage.upsert({ where: key, create: { userId: user.id, messageId }, update: {} });
    }
    const saved = !existing;
    this.realtime.emitToUser(user.id, 'chat:saved', { messageId, saved });
    return { saved };
  }

  async listSaved(user: ChatUser, opts: { limit?: number; before?: string } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit) || PAGE_DEFAULT, 1), PAGE_MAX);
    const before = opts.before ? new Date(opts.before) : null;
    const blocked = await this.blockedIdsOf(user.id);
    const rows = await this.prisma.chatSavedMessage.findMany({
      where: {
        userId: user.id,
        ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
        message: {
          deletedAt: null,
          ...this.notFromBlocked(blocked),
          channel: {
            organizationId: tenantIdOf(user),
            isArchived: false,
            OR: [{ kind: ChatChannelKind.PUBLIC }, { members: { some: { userId: user.id } } }],
          },
        },
      },
      include: {
        message: {
          include: {
            ...messageInclude,
            channel: {
              select: {
                id: true,
                name: true,
                kind: true,
                isGroupDm: true,
                members: {
                  where: { userId: { not: user.id } },
                  select: { user: { select: { fullName: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    const savedIds = new Set(rows.map((r) => r.messageId));
    return {
      items: rows.map((r) => {
        const ch = r.message.channel;
        return {
          savedAt: r.createdAt.toISOString(),
          message: serializeMessage(r.message, savedIds),
          channel: {
            id: ch.id,
            name: ch.kind === ChatChannelKind.DIRECT ? (ch.members[0]?.user.fullName ?? ch.name) : ch.name,
            kind: ch.kind,
            isGroupDm: ch.isGroupDm,
          },
        };
      }),
    };
  }

  // ─── Presencia y preferencias ────────────────────────────────────────────

  presence(user: ChatUser): { online: string[] } {
    return { online: this.realtime.onlineUserIds(tenantIdOf(user)) };
  }

  async getPrefs(user: ChatUser): Promise<{ dndUntil: string | null }> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { chatDndUntil: true } });
    const until = row?.chatDndUntil ?? null;
    return { dndUntil: until && until.getTime() > Date.now() ? until.toISOString() : null };
  }

  /** No molestar hasta una fecha; `null` (o una fecha pasada) lo apaga. */
  async setPrefs(user: ChatUser, input: { dndUntil?: string | null }): Promise<{ dndUntil: string | null }> {
    let until: Date | null = null;
    if (input.dndUntil) {
      until = new Date(input.dndUntil);
      if (Number.isNaN(until.getTime())) throw new BadRequestException('Fecha de «No molestar» inválida');
      if (until.getTime() <= Date.now()) until = null;
      else if (until > MUTE_FOREVER) until = MUTE_FOREVER;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { chatDndUntil: until } });
    const result = { dndUntil: until?.toISOString() ?? null };
    this.realtime.emitToUser(user.id, 'chat:prefs', result);
    return result;
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
      })
      .catch(() => undefined);
    return { ok: true, lastReadAt: at };
  }

  async searchMessages(user: ChatUser, rawQuery: string, channelId?: string) {
    const q = (rawQuery ?? '').trim().slice(0, 100);
    if (q.length < 2) return { messages: [] };
    if (channelId) await this.access(user, channelId);
    const blocked = await this.blockedIdsOf(user.id);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        body: { contains: q, mode: 'insensitive' },
        kind: { not: ChatMessageKind.SYSTEM },
        ...this.notFromBlocked(blocked),
        channel: channelId
          ? { id: channelId }
          : {
              organizationId: tenantIdOf(user),
              isArchived: false,
              OR: [{ kind: ChatChannelKind.PUBLIC }, { members: { some: { userId: user.id } } }],
            },
      },
      include: { ...messageInclude, channel: { select: { id: true, name: true, kind: true, isGroupDm: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const saved = await this.savedIdsOf(user.id, rows.map((m) => m.id));
    return { messages: rows.map((m) => ({ ...serializeMessage(m, saved), channel: m.channel })) };
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

  // ─── Bloqueos y reportes (Apple 1.2, docs/chat-reportar-bloquear.md) ─────

  /** Personas que bloqueé: una consulta por petición, luego `senderId notIn`. */
  private async blockedIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.chatUserBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    });
    return rows.map((r) => r.blockedId);
  }

  private notFromBlocked(blocked: string[]): Prisma.ChatMessageWhereInput {
    return blocked.length ? { senderId: { notIn: blocked } } : {};
  }

  private async isBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    const row = await this.prisma.chatUserBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { blockerId: true },
    });
    return Boolean(row);
  }

  /** Bloqueo en cualquier dirección entre dos personas. */
  private async blockedBetween(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.chatUserBlock.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { blockerId: true },
    });
    return Boolean(row);
  }

  /** En un directo nadie escribe si alguno de los dos bloqueó al otro. */
  private async assertDirectOpen(user: ChatUser, channelId: string) {
    const row = await this.prisma.chatUserBlock.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blocked: { chatMemberships: { some: { channelId } } } },
          { blockedId: user.id, blocker: { chatMemberships: { some: { channelId } } } },
        ],
      },
      select: { blockerId: true },
    });
    if (row) throw new ForbiddenException(BLOCKED_DM_MESSAGE);
  }

  /** Idempotente; solo gente de mi organización (aunque ya esté dada de baja). */
  async blockUser(user: ChatUser, targetId: string) {
    if (!targetId || targetId === user.id) throw new BadRequestException('No puedes bloquearte a ti mismo');
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, ...this.orgUserWhere(tenantIdOf(user)) },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Persona no encontrada');
    await this.prisma.chatUserBlock.createMany({
      data: [{ blockerId: user.id, blockedId: target.id }],
      skipDuplicates: true,
    });
    return { ok: true as const };
  }

  async unblockUser(user: ChatUser, targetId: string) {
    await this.prisma.chatUserBlock.deleteMany({ where: { blockerId: user.id, blockedId: targetId } });
    return { ok: true as const };
  }

  /** Las personas que YO bloqueé (Más › Usuarios bloqueados). */
  async listBlocks(user: ChatUser) {
    const rows = await this.prisma.chatUserBlock.findMany({
      where: { blockerId: user.id },
      include: { blocked: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ id: r.blocked.id, name: r.blocked.fullName, blockedAt: r.createdAt.toISOString() }));
  }

  /**
   * Reporta un mensaje ajeno de un canal que puedo ver. Un mismo reporte abierto no
   * se repite (no se vuelve a avisar); dirección y quien administra el canal reciben
   * «Reporte en el chat».
   */
  async reportMessage(user: ChatUser, messageId: string, input: { reason?: string | null; details?: string | null }) {
    const reason = String(input.reason ?? '').trim().toUpperCase() as ReportReason;
    if (!REPORT_REASONS.includes(reason)) throw new BadRequestException('Motivo de reporte inválido');
    const details = (input.details ?? '').trim();
    if (details.length > REPORT_DETAILS_MAX) {
      throw new BadRequestException(`Los detalles admiten hasta ${REPORT_DETAILS_MAX} caracteres`);
    }
    const { message, channel } = await this.findMessageIn(user, messageId);
    if (message.senderId === user.id) throw new BadRequestException('No puedes reportar tu propio mensaje');

    const open = await this.prisma.chatReport.findFirst({
      where: { reporterId: user.id, messageId: message.id, status: 'OPEN' },
      select: { id: true },
    });
    if (open) return { ok: true as const, reportId: open.id };

    const report = await this.prisma.chatReport.create({
      data: {
        organizationId: channel.organizationId,
        reporterId: user.id,
        messageId: message.id,
        reportedUserId: message.senderId,
        reason,
        details: details || null,
      },
      select: { id: true },
    });
    await this.notifyReport(user, channel, message, reason).catch(() => undefined);
    return { ok: true as const, reportId: report.id };
  }

  private async notifyReport(user: ChatUser, channel: ChannelRow, message: MessageRow, reason: ReportReason) {
    const direction = await this.prisma.user.findMany({
      where: { active: true, roleKey: { in: DIRECTION_ROLES }, ...this.orgUserWhere(channel.organizationId) },
      select: { id: true },
    });
    const directionIds = direction.map((d) => d.id);
    // Dueños del canal + qué miembros de dirección están dentro (para saber a quién enlazar al mensaje).
    const inside = await this.prisma.chatChannelMember.findMany({
      where: {
        channelId: channel.id,
        user: { active: true },
        OR: [{ role: 'owner' }, { userId: { in: directionIds } }],
      },
      select: { userId: true },
    });
    const members = new Set(inside.map((m) => m.userId));
    // Ni quien reporta ni la persona reportada.
    const recipients = [...new Set([...directionIds, ...members])].filter(
      (id) => id !== user.id && id !== message.senderId,
    );
    if (!recipients.length) return;
    const author = message.sender.fullName;
    const body = `${REPORT_REASON_LABELS[reason]} · ${shortName(author) || author}: «${chatPreview(pushText(message), 100)}»`;
    const messageUrl = `/chat?channel=${channel.id}&msg=${message.id}`;
    await this.notifications.notifyMany(
      recipients.map((uid) => ({
        userId: uid,
        organizationId: channel.organizationId,
        actorId: user.id,
        type: 'chat.report',
        title: 'Reporte en el chat',
        body,
        // Un privado o directo ajeno no se abre: el enlace queda en el chat.
        linkUrl: channel.kind === ChatChannelKind.PUBLIC || members.has(uid) ? messageUrl : '/chat',
      })),
    );
  }

  private assertModerator(user: ChatUser) {
    if (!isDirectionRole(user.roleKey)) throw new ForbiddenException('Solo dirección atiende los reportes');
  }

  async listReports(user: ChatUser, rawStatus?: string | null) {
    this.assertModerator(user);
    const status = (rawStatus ?? '').trim().toUpperCase() as ReportStatus | '';
    if (status && !REPORT_STATUSES.includes(status)) throw new BadRequestException('Estado de reporte inválido');
    const rows = await this.prisma.chatReport.findMany({
      where: { organizationId: tenantIdOf(user), ...(status ? { status } : {}) },
      include: {
        reporter: { select: { id: true, fullName: true } },
        reportedUser: { select: { id: true, fullName: true } },
        message: { select: { id: true, body: true, channelId: true, channel: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_MAX,
    });
    return rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reporter: { id: r.reporter.id, name: r.reporter.fullName },
      reportedUser: r.reportedUser ? { id: r.reportedUser.id, name: r.reportedUser.fullName } : null,
      message: r.message
        ? { id: r.message.id, body: r.message.body, channelId: r.message.channelId, channelName: r.message.channel.name }
        : null,
    }));
  }

  /** `RESOLVED` lo cierra (quién y cuándo); `OPEN` lo reabre. */
  async updateReport(user: ChatUser, reportId: string, input: { status?: string | null }) {
    this.assertModerator(user);
    const status = String(input.status ?? '').trim().toUpperCase() as ReportStatus;
    if (!REPORT_STATUSES.includes(status)) throw new BadRequestException('Estado de reporte inválido');
    const report = await this.prisma.chatReport.findFirst({
      where: { id: reportId, organizationId: tenantIdOf(user) },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    await this.prisma.chatReport.update({
      where: { id: report.id },
      data:
        status === 'RESOLVED'
          ? { status, resolvedAt: new Date(), resolvedById: user.id }
          : { status, resolvedAt: null, resolvedById: null },
    });
    return { ok: true as const };
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
    const blocked = await this.blockedIdsOf(user.id);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        parentId: null,
        ...this.notFromBlocked(blocked),
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
