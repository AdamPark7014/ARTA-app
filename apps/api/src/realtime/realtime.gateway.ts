import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../common/prisma/prisma.service';
import { sha256Hex } from '../common/crypto';
import { tenantIdOf } from '../common/tenant';
import type { JwtPayload } from '../auth/jwt.strategy';

type SocketData = {
  userId?: string;
  orgId?: string;
  fullName?: string;
};

const PRESENCE_GRACE_MS = 20_000;

function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Apps nativas no mandan Origin; el navegador sí y se valida contra WEB_ORIGIN. */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return allowedOrigins().includes(origin);
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      const raw = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/**
 * Tiempo real (Socket.IO) para chat, avisos y contadores.
 *
 * - Misma sesión que HTTP: cookie `arta_access` + sesión viva en `UserSession`.
 *   Detrás de Traefik el cliente conecta a `/api/socket.io` (se quita `/api`).
 * - Salas: `user:<id>` (avisos personales), `org:<id>` (presencia) y
 *   `chat:<canal>` (mensajes, escribiendo…), esta última solo con acceso real al canal.
 */
@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, isOriginAllowed(origin)),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  /** Presencia en memoria: sockets vivos por persona (un solo proceso del API). */
  private readonly presence = new Map<string, { orgId: string | null; sockets: Set<string> }>();
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server?: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    // La identidad se resuelve en el handshake: un socket sin sesión nunca se establece.
    server.use(async (client: Socket, next: (err?: Error) => void) => {
      try {
        const identity = await this.resolveIdentity(client);
        if (!identity) return next(new Error('unauthorized'));
        Object.assign(client.data as SocketData, identity);
        return next();
      } catch {
        return next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    const data = client.data as SocketData;
    if (!data.userId) {
      client.disconnect(true);
      return;
    }
    client.join(this.userRoom(data.userId));
    if (data.orgId) client.join(this.orgRoom(data.orgId));
    this.markConnected(data.userId, data.orgId ?? null, client.id);
  }

  handleDisconnect(client: Socket) {
    const data = client.data as SocketData;
    if (data.userId) this.markDisconnected(data.userId, client.id);
  }

  /** Primer socket = en línea. Si venía de cerrar (dentro de la gracia) no se vuelve a anunciar. */
  markConnected(userId: string, orgId: string | null, socketId: string) {
    const pending = this.offlineTimers.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.offlineTimers.delete(userId);
    }
    const entry = this.presence.get(userId);
    if (entry) {
      entry.sockets.add(socketId);
      return;
    }
    this.presence.set(userId, { orgId, sockets: new Set([socketId]) });
    if (orgId) this.emitToOrg(orgId, 'chat:presence', { userId, online: true });
  }

  /** Último socket cerrado: 20 s de gracia (recargas, cambio de red) antes de marcar desconectado. */
  markDisconnected(userId: string, socketId: string) {
    const entry = this.presence.get(userId);
    if (!entry) return;
    entry.sockets.delete(socketId);
    if (entry.sockets.size > 0 || this.offlineTimers.has(userId)) return;
    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      const current = this.presence.get(userId);
      if (!current || current.sockets.size > 0) return;
      this.presence.delete(userId);
      if (current.orgId) this.emitToOrg(current.orgId, 'chat:presence', { userId, online: false });
    }, PRESENCE_GRACE_MS);
    timer.unref?.();
    this.offlineTimers.set(userId, timer);
  }

  /** Personas de la organización con al menos un socket (o dentro de la gracia). */
  onlineUserIds(orgId: string): string[] {
    return [...this.presence.entries()].filter(([, e]) => e.orgId === orgId).map(([id]) => id);
  }

  @SubscribeMessage('chat:join')
  async handleChatJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId?: string }) {
    const data = client.data as SocketData;
    const channelId = typeof body?.channelId === 'string' ? body.channelId : '';
    if (!data.userId || !channelId) return { ok: false };
    if (!(await this.canJoinChannel(data.userId, data.orgId ?? null, channelId))) {
      this.logger.warn(`chat:join denegado (user=${data.userId}, canal=${channelId})`);
      return { ok: false };
    }
    client.join(this.chatRoom(channelId));
    return { ok: true, channelId };
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId?: string }) {
    const channelId = typeof body?.channelId === 'string' ? body.channelId : '';
    if (!channelId) return { ok: false };
    client.leave(this.chatRoom(channelId));
    return { ok: true, channelId };
  }

  @SubscribeMessage('chat:typing')
  handleChatTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId?: string }) {
    const data = client.data as SocketData;
    const channelId = typeof body?.channelId === 'string' ? body.channelId : '';
    // Solo quien pasó el control de `chat:join` está en la sala.
    if (!data.userId || !channelId || !client.rooms.has(this.chatRoom(channelId))) return { ok: false };
    client.to(this.chatRoom(channelId)).emit('chat:typing', {
      channelId,
      userId: data.userId,
      fullName: data.fullName || 'Alguien',
      at: Date.now(),
    });
    return { ok: true };
  }

  @SubscribeMessage('chat:presence')
  handlePresence(@ConnectedSocket() client: Socket, @MessageBody() body: { status?: string }) {
    const data = client.data as SocketData;
    if (!data.userId || !data.orgId) return { ok: false };
    this.emitToOrg(data.orgId, 'chat:presence', {
      userId: data.userId,
      status: body?.status === 'away' ? 'away' : 'online',
      online: body?.status !== 'away',
      at: Date.now(),
    });
    return { ok: true };
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    if (!this.server || userIds.length === 0) return;
    this.server.to(userIds.map((id) => this.userRoom(id))).emit(event, payload);
  }

  emitToChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(this.chatRoom(channelId)).emit(event, payload);
  }

  emitToOrg(orgId: string, event: string, payload: unknown) {
    this.server?.to(this.orgRoom(orgId)).emit(event, payload);
  }

  private userRoom(id: string) {
    return `user:${id}`;
  }

  private orgRoom(id: string) {
    return `org:${id}`;
  }

  private chatRoom(id: string) {
    return `chat:${id}`;
  }

  /** Miembro del canal, o canal público de su organización. Falla cerrado. */
  private async canJoinChannel(userId: string, orgId: string | null, channelId: string) {
    try {
      const channel = await this.prisma.chatChannel.findUnique({
        where: { id: channelId },
        select: {
          kind: true,
          organizationId: true,
          isArchived: true,
          members: { where: { userId }, select: { id: true }, take: 1 },
        },
      });
      if (!channel || channel.isArchived) return false;
      if (orgId && channel.organizationId !== orgId) return false;
      return channel.members.length > 0 || channel.kind === 'PUBLIC';
    } catch (err) {
      this.logger.error(`No se pudo validar acceso al canal ${channelId}: ${String(err)}`);
      return false;
    }
  }

  private async resolveIdentity(client: Socket): Promise<SocketData | null> {
    const token = readCookie(client.handshake?.headers?.cookie, 'arta_access');
    if (!token) return null;
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    if (!payload?.sub || !payload.jti) return null;
    const session = await this.prisma.userSession.findFirst({
      where: { tokenHash: sha256Hex(payload.jti) },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    return {
      userId: payload.sub,
      orgId: tenantIdOf({ roleKey: payload.roleKey, organizationId: payload.organizationId }),
      fullName: payload.fullName,
    };
  }
}
