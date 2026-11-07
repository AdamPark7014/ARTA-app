import { EventsController } from './events.controller';

/**
 * `GET /events` trae por evento cuántos formatos ya se entregaron y nadie ha firmado como «Autorizado»
 * (`pendingAuthorizedChecklists`): la lista filtra «por revisar» con eso y el aviso de firmas pendientes
 * aterriza ahí. Se cuenta en una sola consulta para todos los eventos listados, no una por evento.
 */
describe('EventsController · lista con formatos pendientes de autorizar', () => {
  const ORG = 'org_arta_internal';
  const arturo = {
    id: 'u-dir',
    roleKey: 'dir_general',
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [] as string[],
    fullName: 'Arturo Taja',
    organizationId: ORG,
  };
  const events = [
    { id: 'ev-1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG, _count: { checklists: 5, purchaseOrders: 0, tasks: 0 } },
    { id: 'ev-2', name: 'Feria', entity: 'EXPLANADA', status: 'ACTIVE', organizationId: ORG, _count: { checklists: 3, purchaseOrders: 0, tasks: 0 } },
    { id: 'ev-3', name: 'Obra', entity: 'ARTA', status: 'DRAFT', organizationId: ORG, _count: { checklists: 0, purchaseOrders: 0, tasks: 0 } },
  ];

  function setup(rows = events) {
    const prisma = {
      event: { findMany: jest.fn(async () => rows) },
      checklistInstance: {
        groupBy: jest.fn(async (_args: Record<string, any>) => [
          { eventId: 'ev-1', _count: { _all: 2 } },
          { eventId: 'ev-2', _count: { _all: 1 } },
        ]),
      },
    };
    const controller = new EventsController(prisma as never, {} as never, {} as never);
    return { controller, prisma };
  }

  it('cada evento trae su número; sin pendientes es 0', async () => {
    const { controller, prisma } = setup();
    const res = (await controller.list({ user: arturo } as never, undefined, 'active')) as Array<Record<string, unknown>>;
    expect(res.map((e) => [e.id, e.pendingAuthorizedChecklists])).toEqual([
      ['ev-1', 2],
      ['ev-2', 1],
      ['ev-3', 0],
    ]);
    // Lo demás de la fila sigue igual (el conteo de formatos visibles, por ejemplo).
    expect(res[0]._count).toEqual({ checklists: 5, purchaseOrders: 0, tasks: 0 });
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
  });

  it('cuenta en una sola consulta: entregados, sin autorizar y solo los formatos que se enseñan', async () => {
    const { controller, prisma } = setup();
    await controller.list({ user: arturo } as never);
    expect(prisma.checklistInstance.groupBy).toHaveBeenCalledTimes(1);
    const args = prisma.checklistInstance.groupBy.mock.calls[0][0];
    expect(args.by).toEqual(['eventId']);
    expect(args._count).toEqual({ _all: true });
    expect(args.where.eventId).toEqual({ in: ['ev-1', 'ev-2', 'ev-3'] });
    expect(args.where.authorizedAt).toBeNull();
    expect(args.where.status).toEqual({ notIn: ['SEALED', 'APPROVED'] });
    // Los formatos vacíos de plantillas retiradas no cuentan (mismo filtro que la lista de formatos),
    // y cuenta lo entregado o en revisión: el mismo criterio que la pestaña «Por autorizar» de la web.
    expect(args.where.AND).toEqual([
      expect.objectContaining({ OR: expect.any(Array) }),
      { OR: [{ deliveredAt: { not: null } }, { status: 'REVIEW' }] },
    ]);
  });

  it('sin eventos no consulta formatos', async () => {
    const { controller, prisma } = setup([]);
    await expect(controller.list({ user: arturo } as never)).resolves.toEqual([]);
    expect(prisma.checklistInstance.groupBy).not.toHaveBeenCalled();
  });

  it('quien no opera eventos no llega a la base', async () => {
    const { controller, prisma } = setup();
    const practicante = { ...arturo, id: 'u-prac', roleKey: 'practicante' };
    await expect(controller.list({ user: practicante } as never)).resolves.toEqual([]);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.checklistInstance.groupBy).not.toHaveBeenCalled();
  });
});
