import { NotificationsService } from './notifications.service';
import { pushMetaFor } from './notification-push-meta';

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
