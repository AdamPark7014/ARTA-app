import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { sha256Hex } from 'fast-sha256';

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService, private prisma: PrismaService) {}

  afterInit(server: Server) {
    server.use(async (socket: Socket, next) => {
      const authCookie = socket.handshake.headers.cookie?.split(';').find(c => c.trim().startsWith('arta_access='));
      if (!authCookie) {
        return next(new Error('Authentication required'));
      }
      const token = authCookie.split('=')[1];
      try {
        const payload = this.jwtService.verify(token);
        const userSession = await this.prisma.userSession.findUnique({
          where: { id: payload.jti },
          select: { revoked: true }
        });
        if (userSession && userSession.revoked) {
          return next(new Error('User session revoked'));
        }
        socket.data.user = payload;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }

  handleConnection(socket: Socket) {
    if (socket.data.user) {
      socket.join(`user:${socket.data.user.id}`);
      socket.join(`org:${socket.data.user.orgId}`);
    }
  }

  handleDisconnect(socket: Socket) {
    socket.leaveAll();
  }

  emitToUser(userId: number, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToRoom(roomId: string, event: string, data: any) {
    this.server.to(roomId).emit(event, data);
  }

  emitToOrg(orgId: number, event: string, data: any) {
    this.server.to(`org:${orgId}`).emit(event, data);
  }

  @SubscribeMessage('chat:join')
  async handleChatJoin(client: Socket, data: { channelId: number }) {
    const channelMember = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId: data.channelId, userId: client.data.user.id } }
    });
    if (!channelMember && data.channelId !== 1) { // Assuming 1 is the public channel
      return client.emit('error', 'Not authorized');
    }
    client.join(`channel:${data.channelId}`);
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(client: Socket, data: { channelId: number }) {
    client.leave(`channel:${data.channelId}`);
  }

  @SubscribeMessage('chat:typing')
  handleChatTyping(client: Socket, data: { channelId: number }) {
    client.to(`channel:${data.channelId}`).emit('chat:typing', { userId: client.data.user.id });
  }
}