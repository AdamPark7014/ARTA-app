import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BLOCKED_DM_MESSAGE, ChatService, serializeMessage, type ChatUser } from './chat.service';
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
    chatChannel: {
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    chatChannelMember: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatSavedMessage: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    chatMessageReaction: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    chatMessage: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    chatUserBlock: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatReport: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ n: 3 }]),
  };
  const notifications = {
    pushOnly: jest.fn().mockResolvedValue(1),
    notifyMany: jest.fn().mockResolvedValue([]),
    notify: jest.fn().mockResolvedValue(null),
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
      expect.objectContaining({ title: 'Ana R. en #general', kind: 'chat', threadId: 'chat-c1' }),
    );
    // El globo lo calcula PushDispatch (chat + avisos), no el chat.
    expect(notifications.pushOnly.mock.calls[0][1].badge).toBeUndefined();
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

describe('Chat v2', () => {
  const quote = (over: Record<string, unknown> = {}) => ({
    id: 'q1',
    senderId: 'u4',
    kind: 'TEXT',
    body: 'Ve con [@Luis Pérez](user:u4) al foro',
    attachmentUrl: null,
    attachmentName: null,
    deletedAt: null,
    sender: { id: 'u4', fullName: 'Luis Pérez' },
    ...over,
  });

  it('la cita lleva el extracto con menciones como @Nombre y ≤140 caracteres', () => {
    const dto = serializeMessage(messageRow({ replyTo: quote() }) as never);
    expect(dto.replyTo).toEqual({
      id: 'q1',
      authorId: 'u4',
      authorName: 'Luis Pérez',
      excerpt: 'Ve con @Luis Pérez al foro',
      kind: 'TEXT',
      attachmentName: null,
      deleted: false,
    });
    const long = serializeMessage(messageRow({ replyTo: quote({ body: 'x'.repeat(500) }) }) as never);
    expect(long.replyTo!.excerpt.length).toBeLessThanOrEqual(140);
    const gone = serializeMessage(messageRow({ replyTo: quote({ deletedAt: new Date() }) }) as never);
    expect(gone.replyTo).toEqual(expect.objectContaining({ excerpt: '', deleted: true }));
    expect(serializeMessage(messageRow() as never).replyTo).toBeNull();
  });

  it('responder citando exige un mensaje del mismo canal', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    await expect(service.postMessage(ana, 'c1', { body: 'va', replyToId: 'de-otro-canal' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'de-otro-canal', channelId: 'c1' }) }),
    );
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('guardar alterna el marcador personal', async () => {
    const { service, prisma, realtime } = setup();
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow());
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatSavedMessage.findUnique.mockResolvedValueOnce(null);
    await expect(service.toggleSaved(ana, 'msg1')).resolves.toEqual({ saved: true });
    expect(prisma.chatSavedMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'u1', messageId: 'msg1' } }),
    );
    prisma.chatSavedMessage.findUnique.mockResolvedValueOnce({ id: 's1' });
    await expect(service.toggleSaved(ana, 'msg1')).resolves.toEqual({ saved: false });
    expect(prisma.chatSavedMessage.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', messageId: 'msg1' } });
    expect(realtime.emitToUser).toHaveBeenLastCalledWith('u1', 'chat:saved', { messageId: 'msg1', saved: false });
  });

  it('un mensaje borrado con hilo se queda vacío y marcado como eliminado', async () => {
    const dto = serializeMessage(messageRow({ deletedAt: new Date(), _count: { replies: 2 } }) as never);
    expect(dto).toEqual(expect.objectContaining({ body: '', deleted: true, replyCount: 2, attachment: null }));

    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    await service.listMessages(ana, 'c1');
    expect(prisma.chatMessage.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ OR: [{ deletedAt: null }, { replies: { some: { deletedAt: null } } }] }),
    );
  });

  it('el grupo usa la llave g:<ids ordenados> con quien crea y no se duplica', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u3', fullName: 'Pepe Gómez' },
      { id: 'u2', fullName: 'Luis Pérez' },
    ]);
    prisma.chatChannel.findUnique.mockResolvedValue({ id: 'g1' });
    prisma.chatChannel.findFirst.mockResolvedValue(
      channel({ id: 'g1', kind: 'PRIVATE', slug: null, isGroupDm: true, name: 'Ana, Pepe, Luis' }),
    );
    const dto = await service.openGroupDm(ana, ['u3', 'u2', 'u3']);
    expect(prisma.chatChannel.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId_dmKey: { organizationId: ORG, dmKey: 'g:u1:u2:u3' } } }),
    );
    expect(prisma.chatChannel.create).not.toHaveBeenCalled();
    expect(dto.isGroupDm).toBe(true);
    await expect(service.openGroupDm(ana, ['u2'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('grupo nuevo: nombres de pila y aviso «Nuevo grupo» a los demás', async () => {
    const { service, prisma, notifications } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', fullName: 'Luis Pérez' },
      { id: 'u3', fullName: 'Pepe Gómez' },
    ]);
    prisma.chatChannel.findUnique.mockResolvedValue(null);
    prisma.chatChannel.create.mockResolvedValue({ id: 'g2' });
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ id: 'g2', kind: 'PRIVATE', slug: null, isGroupDm: true }));
    await service.openGroupDm(ana, ['u2', 'u3']);
    expect(prisma.chatChannel.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ kind: 'PRIVATE', isGroupDm: true, dmKey: 'g:u1:u2:u3', name: 'Ana, Luis, Pepe' }),
    );
    expect(notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u2', type: 'chat.added', title: 'Nuevo grupo', linkUrl: '/chat?channel=g2' }),
      expect.objectContaining({ userId: 'u3', type: 'chat.added' }),
    ]);
  });

  it('agregar a un grupo funciona y avisa solo a quien entra', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ kind: 'PRIVATE', slug: null, isGroupDm: true, name: 'Ana, Luis' }));
    prisma.user.findMany.mockResolvedValue([{ id: 'u5' }, { id: 'u2' }]);
    prisma.chatChannelMember.findMany.mockResolvedValueOnce([{ userId: 'u2' }]);
    prisma.chatChannelMember.count.mockResolvedValue(3);
    await service.addMembers(ana, 'c1', ['u5', 'u2']);
    expect(prisma.chatChannelMember.createMany).toHaveBeenCalledWith({
      data: [{ channelId: 'c1', userId: 'u5' }],
      skipDuplicates: true,
    });
    expect(notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u5', type: 'chat.added', title: 'Nuevo grupo' }),
    ]);
  });

  it('las menciones en un grupo avisan con enlace al mensaje', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(
      channel({ kind: 'PRIVATE', slug: null, isGroupDm: true, name: 'Ana, Luis, Pepe' }),
    );
    const body = 'Revisa esto [@Luis](user:u4)';
    prisma.chatMessage.create.mockResolvedValue(messageRow({ body }));
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u1', mutedUntil: null },
      { userId: 'u4', mutedUntil: null },
      { userId: 'u5', mutedUntil: null },
    ]);
    await service.postMessage(ana, 'c1', { body });
    await flush();
    expect(notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'u4',
        type: 'chat.mention',
        title: 'Ana R. te mencionó en Ana, Luis, Pepe',
        linkUrl: '/chat?channel=c1&msg=msg1',
      }),
    ]);
    expect(notifications.pushOnly.mock.calls.map((c) => c[0])).toEqual(['u5']);
    expect(notifications.pushOnly.mock.calls[0][1].title).toBe('Ana R. en Ana, Luis, Pepe');
  });

  it('la respuesta en hilo llega al autor del mensaje raíz aunque no haya respondido', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'root', parentId: null });
    prisma.chatMessage.create.mockResolvedValue(messageRow({ parentId: 'root' }));
    prisma.chatMessage.findUnique.mockResolvedValue(messageRow({ id: 'root', senderId: 'u7' }));
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u1', mutedUntil: null },
      { userId: 'u7', mutedUntil: null },
      { userId: 'u5', mutedUntil: null },
    ]);
    prisma.chatMessage.findMany.mockResolvedValue([{ senderId: 'u1' }]);
    await service.postMessage(ana, 'c1', { body: 'va', parentId: 'root' });
    await flush();
    expect(notifications.pushOnly.mock.calls.map((c) => c[0])).toEqual(['u7']);
    expect(notifications.pushOnly.mock.calls[0][1].type).toBe('chat.thread_reply');
  });

  it('una reacción avisa al autor con push etiquetado por mensaje (sin campana)', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow({ senderId: 'u2' }));
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatMessageReaction.findUnique.mockResolvedValue(null);
    prisma.chatMessage.findUniqueOrThrow.mockResolvedValue(messageRow({ senderId: 'u2' }));
    await service.toggleReaction(ana, 'msg1', '🔥');
    expect(notifications.pushOnly).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({ type: 'chat.reaction', kind: 'event', tag: 'chat-reaction-msg1' }),
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('quitar a alguien le avisa sin enlace al canal', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(
      channel({ kind: 'PRIVATE', slug: null, name: 'produccion', members: [{ id: 'm', userId: 'u9', role: 'owner', mutedUntil: null, lastReadAt: null }] }),
    );
    await service.removeMember(director, 'c1', 'u2');
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', type: 'chat.removed', title: 'Te quitaron de #produccion', linkUrl: '/chat' }),
    );
  });
});

describe('Reportar y bloquear', () => {
  const luis = { id: 'u2', fullName: 'Luis Pérez', title: null };

  it('no se reporta un mensaje propio ni con un motivo fuera del catálogo', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow({ senderId: 'u1' }));
    await expect(service.reportMessage(ana, 'msg1', { reason: 'SPAM' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reportMessage(ana, 'msg1', { reason: 'FEO' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reportMessage(ana, 'msg1', { reason: 'OTRO', details: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chatReport.create).not.toHaveBeenCalled();
  });

  it('reportar guarda la organización y avisa a dirección y a quien administra el canal', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel({ kind: 'PRIVATE', slug: null, name: 'produccion' }));
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow({ senderId: 'u2', sender: luis, body: 'eres un inútil' }));
    prisma.user.findMany.mockResolvedValue([{ id: 'u9' }, { id: 'u2' }]);
    prisma.chatChannelMember.findMany.mockResolvedValueOnce([{ userId: 'u7' }]);

    const res = await service.reportMessage(ana, 'msg1', { reason: 'acoso', details: '  me insulta  ' });

    expect(res).toEqual({ ok: true, reportId: 'r1' });
    expect(prisma.chatReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: ORG,
          reporterId: 'u1',
          messageId: 'msg1',
          reportedUserId: 'u2',
          reason: 'ACOSO',
          details: 'me insulta',
        },
      }),
    );
    const sent = notifications.notifyMany.mock.calls[0][0] as Array<Record<string, string>>;
    // Ni quien reporta ni la persona reportada (aunque sea de dirección).
    expect(sent.map((n) => n.userId)).toEqual(['u9', 'u7']);
    expect(sent[0]).toEqual(
      expect.objectContaining({ type: 'chat.report', title: 'Reporte en el chat', organizationId: ORG, linkUrl: '/chat' }),
    );
    expect(sent[0].body).toContain('Acoso o intimidación');
    expect(sent[0].body).toContain('eres un inútil');
    // Quien administra el canal sí entra: el aviso lleva al mensaje.
    expect(sent[1].linkUrl).toBe('/chat?channel=c1&msg=msg1');
  });

  it('un reporte abierto del mismo mensaje no se repite', async () => {
    const { service, prisma, notifications } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow({ senderId: 'u2', sender: luis }));
    prisma.chatReport.findFirst.mockResolvedValue({ id: 'r0' });
    await expect(service.reportMessage(ana, 'msg1', { reason: 'SPAM' })).resolves.toEqual({ ok: true, reportId: 'r0' });
    expect(prisma.chatReport.create).not.toHaveBeenCalled();
    expect(notifications.notifyMany).not.toHaveBeenCalled();
  });

  it('bloquear oculta sus mensajes y desbloquear los regresa', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatUserBlock.findMany.mockResolvedValueOnce([{ blockedId: 'u2' }]);
    await service.listMessages(ana, 'c1');
    expect(prisma.chatUserBlock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { blockerId: 'u1' } }));
    expect(prisma.chatMessage.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ senderId: { notIn: ['u2'] } }),
    );

    await expect(service.unblockUser(ana, 'u2')).resolves.toEqual({ ok: true });
    expect(prisma.chatUserBlock.deleteMany).toHaveBeenCalledWith({ where: { blockerId: 'u1', blockedId: 'u2' } });
    await service.listMessages(ana, 'c1');
    expect(prisma.chatMessage.findMany.mock.calls[1][0].where).not.toHaveProperty('senderId');
  });

  it('fijados, guardados y búsqueda tampoco muestran a quien bloqueé', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatUserBlock.findMany.mockResolvedValue([{ blockedId: 'u2' }]);
    await service.listPins(ana, 'c1');
    await service.searchMessages(ana, 'hola');
    expect(prisma.chatMessage.findMany.mock.calls[0][0].where.senderId).toEqual({ notIn: ['u2'] });
    expect(prisma.chatMessage.findMany.mock.calls[1][0].where.senderId).toEqual({ notIn: ['u2'] });
    await service.listSaved(ana);
    expect(prisma.chatSavedMessage.findMany.mock.calls[0][0].where.message.senderId).toEqual({ notIn: ['u2'] });
  });

  it('el hilo de alguien que bloqueé no se abre y sus respuestas se ocultan', async () => {
    const { service, prisma } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    prisma.chatUserBlock.findMany.mockResolvedValue([{ blockedId: 'u2' }]);
    prisma.chatMessage.findFirst.mockResolvedValueOnce(messageRow({ senderId: 'u2', sender: luis }));
    await expect(service.getThread(ana, 'msg1')).rejects.toThrow('Mensaje no encontrado');

    prisma.chatMessage.findFirst.mockResolvedValueOnce(messageRow());
    await service.getThread(ana, 'msg1');
    expect(prisma.chatMessage.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ parentId: 'msg1', senderId: { notIn: ['u2'] } }),
    );
  });

  it('con bloqueo en cualquier dirección no se abre ni se escribe un directo (403)', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(luis);
    prisma.chatUserBlock.findFirst.mockResolvedValue({ blockerId: 'u2' });
    await expect(service.openDirect(ana, 'u2')).rejects.toThrow(new ForbiddenException(BLOCKED_DM_MESSAGE));
    expect(prisma.chatUserBlock.findFirst.mock.calls[0][0].where).toEqual({
      OR: [
        { blockerId: 'u1', blockedId: 'u2' },
        { blockerId: 'u2', blockedId: 'u1' },
      ],
    });
    expect(prisma.chatChannel.upsert).not.toHaveBeenCalled();

    prisma.chatChannel.findFirst.mockResolvedValue(channel({ kind: 'DIRECT', slug: null, name: 'Mensaje directo' }));
    const err = await service.postMessage(ana, 'c1', { body: 'hola' }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toBe(BLOCKED_DM_MESSAGE);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it('quien bloqueó al autor no recibe push ni mención', async () => {
    const { service, prisma, notifications, realtime } = setup();
    prisma.chatChannel.findFirst.mockResolvedValue(channel());
    const body = 'Ojo [@Pepe](user:u3)';
    prisma.chatMessage.create.mockResolvedValue(messageRow({ body }));
    prisma.chatChannelMember.findMany.mockResolvedValue([
      { userId: 'u1', mutedUntil: null },
      { userId: 'u2', mutedUntil: null },
      { userId: 'u3', mutedUntil: null },
    ]);
    prisma.chatUserBlock.findMany.mockResolvedValue([{ blockerId: 'u3' }]);
    await service.postMessage(ana, 'c1', { body });
    await flush();
    expect(prisma.chatUserBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blockedId: 'u1', blockerId: { in: ['u1', 'u2', 'u3'] } } }),
    );
    expect(notifications.pushOnly.mock.calls.map((c) => c[0])).toEqual(['u2']);
    expect(notifications.notifyMany).toHaveBeenCalledWith([]);
    expect(realtime.emitToUsers).toHaveBeenCalledWith(['u2'], 'chat:channel-activity', expect.objectContaining({ notify: true }));
  });

  it('bloquear: no a sí mismo, solo de la organización e idempotente', async () => {
    const { service, prisma } = setup();
    await expect(service.blockUser(ana, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.blockUser(ana, 'u-otra-org')).rejects.toThrow('Persona no encontrada');
    prisma.user.findFirst.mockResolvedValue({ id: 'u2' });
    await expect(service.blockUser(ana, 'u2')).resolves.toEqual({ ok: true });
    expect(prisma.chatUserBlock.createMany).toHaveBeenCalledWith({
      data: [{ blockerId: 'u1', blockedId: 'u2' }],
      skipDuplicates: true,
    });
  });

  it('los reportes solo los ven y cierran dirección, de su organización', async () => {
    const { service, prisma } = setup();
    await expect(service.listReports(ana, 'OPEN')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateReport(ana, 'r1', { status: 'RESOLVED' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatReport.findMany).not.toHaveBeenCalled();

    prisma.chatReport.findMany.mockResolvedValue([
      {
        id: 'r1',
        reason: 'SPAM',
        details: null,
        status: 'OPEN',
        createdAt: new Date('2026-10-06T12:00:00Z'),
        reporter: { id: 'u1', fullName: 'Ana Ruiz' },
        reportedUser: { id: 'u2', fullName: 'Luis Pérez' },
        message: { id: 'msg1', body: 'compra ya', channelId: 'c1', channel: { name: 'general' } },
      },
    ]);
    await expect(service.listReports(director, 'open')).resolves.toEqual([
      {
        id: 'r1',
        reason: 'SPAM',
        details: null,
        status: 'OPEN',
        createdAt: '2026-10-06T12:00:00.000Z',
        reporter: { id: 'u1', name: 'Ana Ruiz' },
        reportedUser: { id: 'u2', name: 'Luis Pérez' },
        message: { id: 'msg1', body: 'compra ya', channelId: 'c1', channelName: 'general' },
      },
    ]);
    expect(prisma.chatReport.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG, status: 'OPEN' });

    prisma.chatReport.findFirst.mockResolvedValue({ id: 'r1' });
    await expect(service.updateReport(director, 'r1', { status: 'RESOLVED' })).resolves.toEqual({ ok: true });
    expect(prisma.chatReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', organizationId: ORG } }),
    );
    expect(prisma.chatReport.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ status: 'RESOLVED', resolvedById: 'u9', resolvedAt: expect.any(Date) }),
    });
  });
});
