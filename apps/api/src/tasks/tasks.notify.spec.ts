import { TasksController, taskLink } from './tasks.controller';

/**
 * Avisos del flujo de tareas: cada paso le llega a quien le toca, con el enlace
 * que la app abre como tarea nativa, y nunca a quien hizo el cambio.
 */
describe('TasksController · avisos', () => {
  const ORG = 'org1';
  const asUser = (id: string, roleKey = 'logistica') =>
    ({ user: { id, roleKey, entities: ['ARTA'], fullName: id.toUpperCase(), organizationId: ORG } }) as any;

  function setup(overrides: Record<string, unknown> = {}) {
    let task: any = {
      id: 't1',
      title: 'Rider de audio',
      eventId: 'e1',
      organizationId: ORG,
      status: 'OPEN',
      createdById: 'pide',
      assigneeId: 'ana',
      coAssignees: [{ userId: 'carla' }],
      dueAt: null,
      detail: null,
      event: { id: 'e1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG },
      evidences: [],
      ...overrides,
    };
    const prisma = {
      event: { findUnique: jest.fn(async () => task.event) },
      taskAssignment: {
        findUnique: jest.fn(async () => ({
          ...task,
          assignee: task.assigneeId ? { id: task.assigneeId, fullName: task.assigneeId } : null,
          coAssignees: task.coAssignees.map((c: any) => ({ ...c, user: { id: c.userId, fullName: c.userId } })),
        })),
        update: jest.fn(async ({ data }: any) => {
          task = { ...task, ...data };
          return { ...task, coAssignees: task.coAssignees.map((c: any) => ({ ...c, user: { id: c.userId, fullName: c.userId } })) };
        }),
        delete: jest.fn(async () => ({})),
      },
      taskEvidence: { count: jest.fn(async () => 1), createMany: jest.fn(), create: jest.fn() },
      taskActivity: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      user: {
        findUnique: jest.fn(async () => ({ active: true })),
      },
    };
    const notifications = {
      notify: jest.fn(async () => null),
      notifyUsers: jest.fn(async () => []),
      whoCan: jest.fn(async () => ['dir']),
    };
    const controller = new TasksController(prisma as never, notifications as never);
    return { controller, prisma, notifications };
  }

  it('el enlace sigue el contrato móvil (tarea nativa)', () => {
    expect(taskLink('e1', 't1')).toBe('/events/e1?tab=tasks&task=t1');
    expect(taskLink(null, 't1')).toBe('/tasks?task=t1');
  });

  it('entregar avisa a quien la pidió para revisión', async () => {
    const { controller, notifications } = setup();
    await controller.submit(asUser('ana'), 't1', { completionNote: 'Listo' });
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['pide'],
      expect.objectContaining({ type: 'task.submitted', actorId: 'ana', linkUrl: '/events/e1?tab=tasks&task=t1' }),
    );
  });

  it('si quien la pidió ya no está activo, la revisión le llega a dirección', async () => {
    const { controller, prisma, notifications } = setup();
    prisma.user.findUnique.mockResolvedValue({ active: false });
    await controller.submit(asUser('ana'), 't1', { completionNote: 'Listo' });
    expect(notifications.whoCan).toHaveBeenCalledWith(expect.objectContaining({ directionOnly: true, exclude: 'ana' }));
    expect(notifications.notifyUsers).toHaveBeenCalledWith(['dir'], expect.objectContaining({ type: 'task.submitted' }));
  });

  it('aprobar avisa a cada responsable y corresponsable', async () => {
    const { controller, notifications } = setup({ status: 'PENDING_APPROVAL' });
    await controller.approve(asUser('pide'), 't1');
    const calls = notifications.notify.mock.calls.map((c: any[]) => c[0]);
    expect(calls.map((c: any) => c.userId).sort()).toEqual(['ana', 'carla']);
    expect(calls.every((c: any) => c.type === 'task.approved' && c.linkUrl === '/events/e1?tab=tasks&task=t1')).toBe(true);
  });

  it('devolver avisa a los responsables con el motivo', async () => {
    const { controller, notifications } = setup({ status: 'PENDING_APPROVAL' });
    await controller.reject(asUser('pide'), 't1', { note: 'Falta la firma' });
    const calls = notifications.notify.mock.calls.map((c: any[]) => c[0]);
    expect(calls.map((c: any) => c.userId).sort()).toEqual(['ana', 'carla']);
    expect(calls[0]).toEqual(expect.objectContaining({ type: 'task.rejected', body: 'Rider de audio: Falta la firma' }));
  });

  it('reabrir avisa a los responsables', async () => {
    const { controller, notifications } = setup({ status: 'DONE' });
    await controller.update(asUser('pide'), 't1', { status: 'IN_PROGRESS' });
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['ana', 'carla'],
      expect.objectContaining({ type: 'task.reopened', actorId: 'pide' }),
    );
  });

  it('cambiar la fecha avisa task.due_changed a los responsables', async () => {
    const { controller, notifications } = setup();
    await controller.update(asUser('pide'), 't1', { dueAt: '2026-10-10T18:00:00.000Z' });
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['ana', 'carla'],
      expect.objectContaining({ type: 'task.due_changed' }),
    );
  });

  it('borrar avisa a responsables y a quien la pidió', async () => {
    const { controller, notifications } = setup();
    await controller.remove(asUser('dir', 'dir_general'), 't1');
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['ana', 'carla', 'pide'],
      expect.objectContaining({ type: 'task.deleted' }),
    );
  });
});
