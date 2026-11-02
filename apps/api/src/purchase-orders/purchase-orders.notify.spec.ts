import { ForbiddenException } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';

/**
 * Avisos de OC: quién se entera de cada paso y a dónde lo lleva el enlace.
 * Reglas del 01-11-2026: la hace compras, la autoriza dirección general y la paga contabilidad.
 */
describe('PurchaseOrdersController · avisos', () => {
  const ORG = 'org-arta';
  const MONDAY = new Date('2026-09-14T18:00:00.000Z');
  const BOTH = ['ARTA', 'EXPLANADA'];
  const basePeople = () => [
    { id: 'u-dir', roleKey: 'dir_general', entities: BOTH, permissions: [] as string[] },
    { id: 'u-dir2', roleKey: 'dir_general', entities: BOTH, permissions: [] as string[] },
    { id: 'u-pide', roleKey: 'compras', entities: BOTH, permissions: [] as string[] },
    { id: 'u-paula', roleKey: 'contabilidad', entities: BOTH, permissions: [] as string[] },
    { id: 'u-gob', roleKey: 'enlace_gobierno', entities: ['ARTA'], permissions: [] as string[] },
    // Leida y Sol ya no autorizan ni pagan: no les suena nada de esto.
    { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'], permissions: [] as string[] },
    // Autoriza por permiso extra, en su negocio.
    { id: 'u-extra', roleKey: 'logistica', entities: ['ARTA'], permissions: ['po.authorize'] },
    // Autoriza y paga por permiso extra, pero en el otro negocio.
    { id: 'u-auditorio', roleKey: 'dir_auditorio', entities: ['EXPLANADA'], permissions: ['po.authorize', 'po.mark_paid'] },
  ];
  const user = (id: string, roleKey: string, permissions: string[] = []) => ({
    id,
    roleKey,
    fullName: 'Arturo Taja',
    permissions,
    entities: ['ARTA'],
    organizationId: ORG,
  });
  const arturo = () => user('u-dir', 'dir_general');
  const auditorioEvent = { id: 'ev-1', name: 'Concierto', entity: 'EXPLANADA', status: 'ACTIVE', organizationId: ORG };

  let people: ReturnType<typeof basePeople>;
  let order: Record<string, any>;
  let notifyMany: jest.Mock;
  let notifyUsers: jest.Mock;
  let controller: PurchaseOrdersController;

  const sentTo = (items: any[], type: string) =>
    items
      .filter((i) => i.type === type)
      .map((i) => i.userId)
      .sort();

  beforeEach(() => {
    jest.useFakeTimers({ now: MONDAY, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    people = basePeople();
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
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    expect(items.find((i: any) => i.userId === 'u-pide')).toEqual(
      expect.objectContaining({ type: 'po.authorized', linkUrl: '/events/ev-1?tab=ocs', actorId: 'u-dir' }),
    );
    expect(items.find((i: any) => i.userId === 'u-paula')).toEqual(
      expect.objectContaining({ type: 'po.to_transfer', linkUrl: '/purchase-orders?po=po-1', actorId: 'u-dir' }),
    );
    expect(items.some((i: any) => i.userId === 'u-dir')).toBe(false);
    // Y a nadie más.
    expect(items.map((i: any) => i.userId).sort()).toEqual(['u-paula', 'u-pide']);
  });

  it.each(['TRANSFERENCIA', 'ADENDUM'])('%s: el aviso de pagar le llega solo a contabilidad', async (paymentMethod) => {
    order.paymentMethod = paymentMethod;
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    expect(sentTo(items, 'po.to_transfer')).toEqual(['u-paula']);
    expect(sentTo(items, 'po.to_pay')).toEqual([]);
  });

  it.each(['EFECTIVO', 'CHEQUE'])('%s: sigue siendo po.to_pay para todos los que pagan en esa entidad', async (paymentMethod) => {
    order.paymentMethod = paymentMethod;
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    expect(sentTo(items, 'po.to_pay')).toEqual(['u-dir2', 'u-gob', 'u-paula']);
    expect(sentTo(items, 'po.to_transfer')).toEqual([]);
  });

  it('sin contabilidad en la organización, la transferencia le toca a quien puede pagar', async () => {
    people = people.filter((p) => p.roleKey !== 'contabilidad');
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    expect(sentTo(notifyMany.mock.calls[0][0], 'po.to_transfer')).toEqual(['u-dir2', 'u-gob']);
  });

  it('si contabilidad no opera ese negocio, el aviso de pagar no se pierde', async () => {
    people.find((p) => p.roleKey === 'contabilidad')!.entities = ['ARTA'];
    order.event = auditorioEvent;
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    expect(sentTo(notifyMany.mock.calls[0][0], 'po.to_transfer')).toEqual(['u-auditorio', 'u-dir2']);
  });

  it('si la forma de pago cambia al autorizar, el aviso sigue a la forma nueva', async () => {
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
      paymentMethod: 'CHEQUE' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    expect(sentTo(items, 'po.to_pay')).toEqual(['u-dir2', 'u-gob', 'u-paula']);
    expect(sentTo(items, 'po.to_transfer')).toEqual([]);
  });

  it('quedar pagada avisa a quien la pidió y a quienes autorizan en esa entidad, nunca al que pagó', async () => {
    order.status = 'AUTHORIZED';
    order.proofs = [{ id: 'pf-1' }];
    await controller.setStatus({ user: user('u-paula', 'contabilidad') } as never, 'po-1', {
      status: 'PAID' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    expect(sentTo(items, 'po.paid')).toEqual(['u-dir', 'u-dir2', 'u-extra', 'u-pide']);
    expect(items.find((i: any) => i.userId === 'u-pide').linkUrl).toBe('/events/ev-1?tab=ocs');
    expect(items.find((i: any) => i.userId === 'u-dir').linkUrl).toBe('/purchase-orders?po=po-1');
    expect(items.some((i: any) => i.userId === 'u-paula')).toBe(false);
    expect(items.every((i: any) => i.type === 'po.paid')).toBe(true);
  });

  it('cambiar monto de una OC por autorizar avisa a quien autoriza en esa entidad (Aprobaciones)', async () => {
    await controller.update({ user: user('u-pide', 'compras') } as never, 'po-1', {
      lines: [{ concept: 'Bocinas', qty: 2, unitPrice: 10000 }],
    });
    const items = notifyMany.mock.calls[0][0];
    expect(items.map((i: any) => i.userId).sort()).toEqual(['u-dir', 'u-dir2', 'u-extra']);
    expect(items[0]).toEqual(expect.objectContaining({ type: 'po.updated', linkUrl: '/purchase-orders?po=po-1' }));
  });

  it('una OC del Auditorio no le llega a la gerencia de Arta, ni con el permiso extra', async () => {
    order.event = auditorioEvent;
    people.push({ id: 'u-gerente2', roleKey: 'gerente_arta', entities: BOTH, permissions: ['po.authorize'] });
    await controller.update({ user: { ...user('u-pide', 'compras'), entities: BOTH } } as never, 'po-1', {
      lines: [{ concept: 'Bocinas', qty: 2, unitPrice: 10000 }],
    });
    expect(notifyMany.mock.calls[0][0].map((i: any) => i.userId).sort()).toEqual(['u-auditorio', 'u-dir', 'u-dir2']);
  });

  it('una OC de Arta no le llega a Rodrigo, ni con Arta asignado y el permiso extra', async () => {
    people.push({ id: 'u-rodrigo', roleKey: 'dir_auditorio', entities: BOTH, permissions: ['po.authorize'] });
    await controller.update({ user: user('u-pide', 'compras') } as never, 'po-1', {
      lines: [{ concept: 'Bocinas', qty: 2, unitPrice: 10000 }],
    });
    expect(notifyMany.mock.calls[0][0].map((i: any) => i.userId).sort()).toEqual(['u-dir', 'u-dir2', 'u-extra']);
  });

  it('regresar a «Por autorizar» le avisa a quien la pidió', async () => {
    order.status = 'REJECTED';
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'PENDING_AUTH' as never,
    });
    expect(notifyMany.mock.calls[0][0]).toEqual([expect.objectContaining({ userId: 'u-pide', type: 'po.reverted' })]);
  });

  it('el aviso dice qué OC, cuánto, de qué evento y qué falta (junta 23-10)', async () => {
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const items = notifyMany.mock.calls[0][0];
    const mine = items.find((i: any) => i.userId === 'u-pide');
    expect(mine.title).toBe('Arturo T. autorizó tu OC PO-1');
    expect(mine.body).toBe(
      'Audio Puebla · $18,000 · Concierto. Falta el comprobante de transferencia y pagarla hoy, día de cobro.',
    );
    const toTransfer = items.find((i: any) => i.type === 'po.to_transfer');
    expect(toTransfer.title).toBe('Arturo T. autorizó la OC PO-1: falta la transferencia');
    expect(toTransfer.body).toContain('Haz el pago y sube el comprobante');
  });

  it('el aviso del adendum dice adendum; el de cheque, que falta pagarla', async () => {
    order.paymentMethod = 'ADENDUM';
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const adendum = notifyMany.mock.calls[0][0].find((i: any) => i.type === 'po.to_transfer');
    expect(adendum.title).toBe('Arturo T. autorizó la OC PO-1: falta el adendum');

    order.paymentMethod = 'CHEQUE';
    notifyMany.mockClear();
    await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    const toPay = notifyMany.mock.calls[0][0].find((i: any) => i.type === 'po.to_pay');
    expect(toPay.title).toBe('Arturo T. autorizó la OC PO-1: falta pagarla');
    expect(toPay.body).toContain('Sube el comprobante');
  });

  it('las respuestas traen `state`: qué le falta a la orden', async () => {
    const res: any = await controller.setStatus({ user: arturo() } as never, 'po-1', {
      status: 'AUTHORIZED' as never,
    });
    expect(res.state).toEqual(
      expect.objectContaining({ key: 'no_proof', label: 'Autorizada · sin comprobante', section: 'pay' }),
    );
  });

  it('borrar una OC avisa a quien la pidió', async () => {
    // Otro que puede borrarla: dirección general solo con el permiso extra.
    await controller.remove({ user: user('u-dir', 'dir_general', ['po.edit']) } as never, 'po-1');
    expect(notifyUsers).toHaveBeenCalledWith(['u-pide'], expect.objectContaining({ type: 'po.deleted' }));
  });

  it('dirección general sin el permiso extra no borra OC y nadie recibe aviso', async () => {
    await expect(controller.remove({ user: arturo() } as never, 'po-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
