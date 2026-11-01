import { NotificationsService, chatLinkParts } from './notifications.service';
import { pushMetaFor } from './notification-push-meta';

describe('NotificationsService · push de un aviso que apunta a un mensaje', () => {
  it('extrae conversación y mensaje solo de /chat?channel=…', () => {
    expect(chatLinkParts('/chat?channel=c1&msg=m9')).toEqual({ channelId: 'c1', messageId: 'm9' });
    expect(chatLinkParts('/chat?channel=c1')).toEqual({ channelId: 'c1', messageId: null });
    expect(chatLinkParts('/events/e1?tab=tasks')).toBeNull();
    expect(chatLinkParts(null)).toBeNull();
  });

  it('manda channelId, messageId y thread chat-<id> para que se apile con la conversación', async () => {
    const created = {
      id: 'n1',
      userId: 'ana',
      type: 'chat.mention',
      title: 'Te mencionaron',
      body: 'hola',
      linkUrl: '/chat?channel=c1&msg=m9',
      actorId: 'beto',
      createdAt: new Date(),
      actor: { id: 'beto', fullName: 'Beto' },
    };
    const prisma = {
      notification: { create: jest.fn().mockResolvedValue(created), count: jest.fn().mockResolvedValue(1) },
    };
    const push = { sendToUser: jest.fn().mockResolvedValue(1) };
    const service = new NotificationsService(prisma as never, push as never);
    await service.notify({ userId: 'ana', actorId: 'beto', type: 'chat.mention', title: 'x', linkUrl: created.linkUrl });
    await new Promise((r) => setImmediate(r));
    expect(push.sendToUser).toHaveBeenCalledWith(
      'ana',
      expect.objectContaining({ channelId: 'c1', messageId: 'm9', threadId: 'chat-c1', channel: 'chat' }),
    );
  });
});

describe('NotificationsService · equipo del evento', () => {
  const prisma = {
    event: { findUnique: jest.fn() },
    taskAssignment: { findMany: jest.fn() },
    chatChannel: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    notification: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  };
  const service = new NotificationsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.findUnique.mockResolvedValue({ createdById: 'creador' });
    prisma.taskAssignment.findMany.mockResolvedValue([{ assigneeId: 'ana' }, { assigneeId: 'actor' }]);
    prisma.chatChannel.findUnique.mockResolvedValue({ members: [{ userId: 'beto' }, { userId: 'ana' }] });
    prisma.user.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((id) => id !== 'beto').map((id) => ({ id })),
    );
  });

  it('junta creador, tareas y canal del evento, sin repetidos, sin el actor ni inactivos', async () => {
    const ids = await service.eventAudience('e1', 'actor');
    expect(ids.sort()).toEqual(['ana', 'creador']);
  });

  it('cuenta también a los corresponsables de una tarea', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([{ assigneeId: 'ana', coAssignees: [{ userId: 'carla' }] }]);
    prisma.chatChannel.findUnique.mockResolvedValue(null);
    expect((await service.eventAudience('e1')).sort()).toEqual(['ana', 'carla', 'creador']);
  });

  it('evento sin canal ni tareas: solo quien lo creó', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([]);
    prisma.chatChannel.findUnique.mockResolvedValue(null);
    expect(await service.eventAudience('e1')).toEqual(['creador']);
  });

  it('notifyEventTeam crea un aviso por persona y suma los extra', async () => {
    const notifyMany = jest.spyOn(service, 'notifyMany').mockResolvedValue([]);
    await service.notifyEventTeam('e1', { actorId: 'actor', type: 'event.cancelled', title: 'x' }, ['finanzas', 'actor']);
    const users = notifyMany.mock.calls[0][0].map((n) => n.userId).sort();
    expect(users).toEqual(['ana', 'creador', 'finanzas']);
  });

  it('cancelar o reprogramar suena como urgente; cerrar no', () => {
    expect(pushMetaFor('event.cancelled')).toEqual({ channel: 'events', priority: 'high' });
    expect(pushMetaFor('event.rescheduled').priority).toBe('high');
    expect(pushMetaFor('event.closed').priority).toBe('normal');
    expect(pushMetaFor('finance.advance').channel).toBe('finance');
    expect(pushMetaFor('po.proof').channel).toBe('finance');
  });
});

describe('NotificationsService.markSeen: acuse de visto', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'n1',
    type: 'task.assigned',
    title: 'Ana R. te asignó: Cotizar luces',
    linkUrl: '/tasks?task=t1',
    actorId: 'ana',
    organizationId: 'org',
    entity: 'ARTA',
    targetKind: 'task',
    targetId: 't1',
    createdAt: new Date(),
    ...over,
  });

  function setup(rows: unknown[]) {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue(rows),
        updateMany: jest.fn().mockResolvedValue({ count: rows.length }),
        create: jest.fn().mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'acuse', ...(data as object), actor: null })),
        count: jest.fn().mockResolvedValue(0),
      },
      taskAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Beto Soto' }) },
    };
    const realtime = { emitToUser: jest.fn() };
    const service = new NotificationsService(prisma as never, undefined, realtime as never);
    return { service, prisma, realtime };
  }

  it('avisa a quien lo mandó, con el mismo destino, y apaga «sin abrir» de la tarea', async () => {
    const { service, prisma, realtime } = setup([row()]);
    await expect(service.markSeen('beto', ['n1'])).resolves.toBe(1);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1'] }, seenAt: null },
      data: { seenAt: expect.any(Date) },
    });
    expect(prisma.taskAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1'] }, seenAt: null },
      data: { seenAt: expect.any(Date) },
    });
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'ana', actorId: 'beto', type: 'notice.seen', linkUrl: '/tasks?task=t1', targetKind: 'task', targetId: 't1' });
    expect(data.title).toBe('Beto S. ya vio tu aviso');
    expect(data.body).toContain('Cotizar luces');
    expect(realtime.emitToUser).toHaveBeenCalledWith('ana', 'notification:seen', expect.objectContaining({ notificationIds: ['n1'], userId: 'beto' }));
  });

  it('varios avisos de la misma persona: un solo acuse, que lleva a Enviados', async () => {
    const { service, prisma } = setup([row(), row({ id: 'n2', title: 'Ana R. te mencionó en #general', type: 'chat.mention', targetKind: 'message' })]);
    await service.markSeen('beto', ['n1', 'n2']);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
      title: 'Beto S. ya vio 2 de tus avisos',
      linkUrl: '/notifications?tab=enviados',
    });
  });

  it('cada quien que mandó algo recibe el suyo', async () => {
    const { service, prisma } = setup([row(), row({ id: 'n2', actorId: 'luis' })]);
    await service.markSeen('beto', ['n1', 'n2']);
    const to = prisma.notification.create.mock.calls.map((call: Array<{ data: { userId: string } }>) => call[0].data.userId);
    expect(to.sort()).toEqual(['ana', 'luis']);
  });

  it('sin acuse: lo que solo informa, lo que mandó el sistema y el propio acuse', async () => {
    const { service, prisma } = setup([
      row({ type: 'file.uploaded' }),
      row({ id: 'n2', actorId: null }),
      row({ id: 'n3', type: 'notice.seen' }),
    ]);
    await expect(service.markSeen('beto', ['n1', 'n2', 'n3'])).resolves.toBe(3);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('lo ya visto no vuelve a avisar y sin ids no consulta', async () => {
    const { service, prisma } = setup([]);
    await expect(service.markSeen('beto', ['n1'])).resolves.toBe(0);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    await expect(service.markSeen('beto', [])).resolves.toBe(0);
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.sentBy: Enviados', () => {
  it('el mismo aviso a varias personas va en una fila con quién lo vio', async () => {
    const at = new Date('2026-11-01T12:00:00Z');
    const seen = new Date('2026-11-01T12:05:00Z');
    const base = { type: 'task.assigned', title: 'Ana R. te asignó: Luces', body: null, linkUrl: '/tasks?task=t1', createdAt: at, readAt: null };
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          { ...base, id: 'n1', seenAt: seen, user: { id: 'beto', fullName: 'Beto' } },
          { ...base, id: 'n2', seenAt: null, user: { id: 'luis', fullName: 'Luis' } },
          { ...base, id: 'n3', seenAt: null, title: 'Otro', user: { id: 'luis', fullName: 'Luis' } },
        ]),
      },
    };
    const service = new NotificationsService(prisma as never);
    const rows = await service.sentBy('ana', { entities: ['ARTA'] });
    expect(rows).toHaveLength(2);
    expect(rows[0].recipients).toEqual([
      { id: 'beto', fullName: 'Beto', seenAt: seen, readAt: null },
      { id: 'luis', fullName: 'Luis', seenAt: null, readAt: null },
    ]);
    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.actorId).toBe('ana');
  });
});
