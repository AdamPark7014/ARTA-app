import { PurchaseOrdersController } from './purchase-orders.controller';

/** Avisos de OC: quién se entera de cada paso y a dónde lo lleva el enlace. */
describe('PurchaseOrdersController · avisos', () => {
  const ORG = 'org-arta';
  const MONDAY = new Date('2026-09-14T18:00:00.000Z');
  const people = [
    { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'], permissions: [] },
    { id: 'u-dir', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'], permissions: [] },
    { id: 'u-pide', roleKey: 'logistica', entities: ['ARTA'], permissions: [] },
    { id: 'u-auditorio', roleKey: 'dir_auditorio', entities: ['EXPLANADA'], permissions: [] },
  ];
  const user = (id: string, roleKey: string) => ({
    id,
    roleKey,
    fullName: 'Gerencia Arta',
    permissions: [] as string[],
    entities: ['ARTA'],
    organizationId: ORG,
  });

  let order: Record<string, any>;
  let notifyMany: jest.Mock;
  let notifyUsers: jest.Mock;
  let controller: PurchaseOrdersController;

  beforeEach(() => {
    jest.useFakeTimers({ now: MONDAY, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    order = {
      id: 'po-1',
      eventId: 'ev-1',
      rubro: 'audio',
      vendorName: 'Audio Puebla',
      amount: 18000,
      status: 'PENDING_AUTH',
      paymentMethod: 'TRANSFERENCIA',
      payeeType: 'PROVEEDOR',
      withIva: false,
      createdById: 'u-pide',
      lines: [],
      proofs: [],
      event: { id: 'ev-1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG },
    };
    const prisma = {
      purchaseOrder: {
        findUnique: async () => order,
        update: async ({ data }: any) => ({ ...order, ...data }),
        delete: async () => order,
      },
      purchaseOrderLine: { deleteMany: async () => ({ count: 0 }) },
      auditLog: { create: async ({ data }: any) => data },
      event: { findUnique: async () => order.event },
      organization: { findUnique: async () => ({ settingsJson: {} }) },
      user: { findMany: async () => people },
    };
    notifyMany = jest.fn(async () => []);
    notifyUsers = jest.fn(async () => []);
    controller = new PurchaseOrdersController(
      prisma as never,
      { notify: jest.fn(), notifyMany, notifyUsers } as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('autorizar avisa a quien la pidió y a quien la paga, nunca al que autorizó', async () => {
    await controller.setStatus({ user: user('u-gerente', 'gerente_arta') } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    expect(items.find((i: any) => i.userId === 'u-pide')).toEqual(
      expect.objectContaining({ type: 'po.authorized', linkUrl: '/events/ev-1?tab=ocs', actorId: 'u-gerente' }),
    );
    expect(items.filter((i: any) => i.type === 'po.to_pay').map((i: any) => i.userId)).toEqual(['u-dir']);
    expect(items.some((i: any) => i.userId === 'u-gerente')).toBe(false);
  });

  it('cambiar monto de una OC por autorizar avisa a quien autoriza en esa entidad (Aprobaciones)', async () => {
    await controller.update({ user: user('u-pide', 'logistica') } as never, 'po-1', {
      lines: [{ concept: 'Bocinas', qty: 2, unitPrice: 10000 }],
    });
    const items = notifyMany.mock.calls[0][0];
    expect(items.map((i: any) => i.userId).sort()).toEqual(['u-dir', 'u-gerente']);
    expect(items[0]).toEqual(expect.objectContaining({ type: 'po.updated', linkUrl: '/purchase-orders?po=po-1' }));
  });

  it('regresar a «Por autorizar» le avisa a quien la pidió', async () => {
    order.status = 'REJECTED';
    await controller.setStatus({ user: user('u-gerente', 'gerente_arta') } as never, 'po-1', {
      status: 'PENDING_AUTH' as never,
    });
    expect(notifyMany.mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 'u-pide', type: 'po.reverted' })]);
  });

  it('borrar una OC avisa a quien la pidió', async () => {
    await controller.remove({ user: user('u-dir', 'dir_general') } as never, 'po-1');
    expect(notifyUsers).toHaveBeenCalledWith(['u-pide'], expect.objectContaining({ type: 'po.deleted' }));
  });
});
