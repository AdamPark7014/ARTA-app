import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService, type ChatUser } from './chat.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { PrismaService } from '../common/prisma/prisma.service';

const ORG = 'org_arta_internal';
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));
};

function channel(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    organizationId: ORG,
    kind: 'PUBLIC',
    slug: 'general',
    name: 'general',
    topic: null,
    description: null,
    isArchived: false,
    eventId: null,
    postingRestricted: false,
    lastMessageAt: null,
    lastMessagePreview: null,
    members: [{ id: 'm-u1', userId: 'u1', role: 'member', mutedUntil: null, lastReadAt: null }],
    ...over,
  };
}

function messageRow(over: Record<string, unknown> = {}) {
  return {
    id: 'msg1',
    channelId: 'c1',
    organizationId: ORG,
    parentId: null,
    kind: 'TEXT',
    body: 'hola',
    attachmentUrl: null,
    attachmentName: null,
    attachmentMime: null,
    attachmentSize: null,
    pinnedAt: null,
    pinnedById: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    senderId: 'u1',
    recipientId: null,
    sender: { id: 'u1', fullName: 'Ana Ruiz', title: null },
    reactions: [],
    _count: { replies: 0 },
    ...over,
  };
}

function setup() {
  const prisma = {
    chatChannel: { findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn(), findUnique: jest.fn() },
    chatChannelMember: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ n: 3 }]),
  };
  const notifications = {
    pushOnly: jest.fn().mockResolvedValue(1),
    notifyMany: jest.fn().mockResolvedValue([]),
  };
  const realtime = { emitToChannel: jest.fn(), emitToUsers: jest.fn(), emitToUser: jest.fn() };
  const service = new ChatService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    realtime as unknown as RealtimeGateway,
  );
  return { service, prisma, notifications, realtime };
}

const ana: ChatUser = { id: 'u1', roleKey: 'logistica', organizationId: null, fullName: 'Ana Ruiz' };
const director: ChatUser = { id: 'u9', roleKey: 'dir_general', organizationId: null, fullName: 'Arturo Taja' };

describe('ChatService', () => {
  it('en #anuncios solo publica dirección', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ slug: 'anuncios', postingRestricted: true }));
    await expect(service.postMessage(ana, 'c1', { body: 'hola' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('un canal privado no se abre sin ser miembro', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ kind: 'PRIVATE', slug: null, members: [] }));
    await expect(service.getChannel(ana, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un canal público une solo a quien lo abre', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ members: [] }));
    prisma.chatChannelMember.upsert.mockResolvedValue({ id: 'm-new', userId: 'u1', role: 'member', mutedUntil: null, lastReadAt: null });
    await service.listPins(ana, 'c1');
    expect(prisma.chatChannelMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { channelId: 'c1', userId: 'u1' } }),
    );
  });

  it('push tipo WhatsApp: sin el autor ni silenciados; los mencionados reciben aviso aparte', async () => {
    const { service, prisma, notifications, realtime } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    const body = 'Junta a las 5 [@Luis](user:u4)';
    prisma.chatMessage.create.mockResolvedValue(messageRow({ body }));
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u1', mutedUntil: null },
      { userId: 'u2', mutedUntil: null },
      { userId: 'u3', mutedUntil: new Date(Date.now() + 3600_000) },
      { userId: 'u4', mutedUntil: new Date(Date.now() + 3600_000) },
    ]);

    const saved = await service.postMessage(ana, 'c1', { body, clientId: 'tmp-1' });
    await flush();

    expect(saved.clientId).toBe('tmp-1');
    expect(realtime.emitToChannel).toHaveBeenCalledWith('c1', 'chat:message', expect.objectContaining({ id: 'msg1' }));
    const pushed = notifications.pushOnly.mock.calls.map((c) => c[0]);
    expect(pushed).toEqual(['u2']);
    expect(notifications.pushOnly.mock.calls[0][1]).toEqual(
      expect.objectContaining({ title: 'Ana R. en #general', kind: 'chat', threadId: 'chat-c1', badge: 3 }),
    );
    expect(notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u4', type: 'chat.mention', linkUrl: '/chat?channel=c1&msg=msg1' }),
    ]);
  });

  it('en un directo el título del push es quien escribe', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ kind: 'DIRECT', slug: null, name: 'Mensaje directo' }));
    prisma.chatMessage.create.mockResolvedValue(messageRow());
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u1', mutedUntil: null },
      { userId: 'u2', mutedUntil: null },
    ]);
    await service.postMessage(ana, 'c1', { body: 'hola' });
    await flush();
    expect(notifications.pushOnly.mock.calls[0][1]).toEqual(expect.objectContaining({ title: 'Ana R.', threadTitle: '' }));
  });

  it('@canal solo lo usa dirección y avisa aunque esté silenciado', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ members: [{ id: 'm', userId: 'u9', role: 'member', mutedUntil: null, lastReadAt: null }] }));
    prisma.chatMessage.create.mockResolvedValue(messageRow({ body: '@canal mañana no hay junta', senderId: 'u9' }));
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u9', mutedUntil: null },
      { userId: 'u3', mutedUntil: new Date(Date.now() + 3600_000) },
    ]);
    await service.postMessage(director, 'c1', { body: '@canal mañana no hay junta' });
    await flush();
    expect(notifications.pushOnly).not.toHaveBeenCalled();
    expect(notifications.notifyMany).toHaveBeenCalledWith([expect.objectContaining({ userId: 'u3' })]);
  });

  it('las respuestas de hilo solo avisan a quien participa', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'root', parentId: null });
    prisma.chatMessage.create.mockResolvedValue(messageRow({ parentId: 'root' }));
    prisma.chatMessage.findUnique.mockResolvedValue(messageRow({ id: 'root', senderId: 'u2' }));
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u1', mutedUntil: null },
      { userId: 'u2', mutedUntil: null },
      { userId: 'u5', mutedUntil: null },
    ]);
    prisma.chatMessage.findMany.mockResolvedValue([{ senderId: 'u2' }, { senderId: 'u1' }]);
    await service.postMessage(ana, 'c1', { body: 'va', parentId: 'root' });
    await flush();
    expect(notifications.pushOnly.mock.calls.map((c) => c[0])).toEqual(['u2']);
    expect(notifications.pushOnly.mock.calls[0][1].body).toBe('Respuesta en hilo: hola');
  });

  it('solo se edita durante la primera hora', async () => {
    const { service, prisma } = setup();
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow({ createdAt: new Date(Date.now() - 2 * 3600_000) }));
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    await expect(service.editMessage(ana, 'msg1', 'otro')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no se borra el mensaje de otra persona (salvo dirección)', async () => {
    const { service, prisma } = setup();
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow({ senderId: 'u2' }));
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    await expect(service.deleteMessage(ana, 'msg1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no abre un directo contigo mismo', async () => {
    const { service } = setup();
    await expect(service.openDirect(ana, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza adjuntos fuera de /uploads', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    await expect(
      service.postMessage(ana, 'c1', { attachmentUrl: 'https://evil.example/x.jpg' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
