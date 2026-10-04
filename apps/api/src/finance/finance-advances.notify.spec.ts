import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { pushMetaFor } from '../notifications/notification-push-meta';

/** Anticipos con aprobación: quién puede cada paso y a quién le llega cada aviso. */
describe('FinanceController · anticipos', () => {
  const ORG = 'org-arta';
  const event = { id: 'ev-1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };
  const people = [
    { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'], permissions: [] },
    { id: 'u-dir', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'], permissions: [] },
    { id: 'u-pide', roleKey: 'logistica', entities: ['ARTA'], permissions: [] },
    { id: 'u-auditorio', roleKey: 'dir_auditorio', entities: ['EXPLANADA'], permissions: [] },
    { id: 'u-gob', roleKey: 'enlace_gobierno', entities: ['ARTA'], permissions: [] },
  ];
  const user = (id: string) => {
    const p = people.find((x) => x.id === id)!;
    return { ...p, fullName: 'Gerencia Arta', organizationId: ORG };
  };

  let proofs: Array<Record<string, any>>;
  let audits: Array<Record<string, any>>;
  let notifyMany: jest.Mock;
  let controller: FinanceController;

  const advance = (over: Record<string, any> = {}) => ({
    id: 'adv-1',
    purchaseOrderId: null,
    eventId: 'ev-1',
    label: 'Hospedaje',
    amount: 5000,
    fileUrl: null,
    note: null,
    uploadedById: 'u-pide',
    advanceStatus: 'PENDING',
    createdAt: new Date('2026-10-04T18:00:00.000Z'),
    ...over,
  });

  beforeEach(() => {
    proofs = [];
    audits = [];
    const prisma = {
      event: {
        findUnique: async () => event,
        findMany: async () => [event],
      },
      paymentProof: {
        create: async ({ data }: any) => {
          const row = { id: 'adv-new', purchaseOrderId: null, createdAt: new Date(), ...data };
          proofs.push(row);
          return row;
        },
        findUnique: async ({ where }: any) => proofs.find((p) => p.id === where.id) ?? null,
        findMany: async () => proofs,
        updateMany: async ({ where, data }: any) => {
          const row = proofs.find((p) => p.id === where.id && p.advanceStatus === where.advanceStatus);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
      auditLog: { create: async ({ data }: any) => audits.push(data) },
      user: { findMany: async () => people },
    };
    notifyMany = jest.fn(async () => []);
    controller = new FinanceController(prisma as never, {} as never, { notifyMany } as never);
  });

  const sent = () => notifyMany.mock.calls.flatMap((c) => c[0]);

  it('solicitar nace pendiente, sin archivo, y avisa a quien aprueba en la entidad (nunca a quien pidió)', async () => {
    const created = await controller.createAdvance({ user: user('u-pide') } as never, {
      eventId: 'ev-1',
      label: 'Hospedaje',
      amount: 5000,
      note: 'Hotel del staff',
    });
    expect(created).toEqual(
      expect.objectContaining({ advanceStatus: 'PENDING', fileUrl: null, note: 'Hotel del staff', event: expect.objectContaining({ id: 'ev-1' }) }),
    );
    expect(sent().map((i: any) => i.userId).sort()).toEqual(['u-dir', 'u-gerente']);
    expect(sent()[0]).toEqual(
      expect.objectContaining({ type: 'advance.requested', linkUrl: '/advances?advance=adv-new', actorId: 'u-pide' }),
    );
    expect(audits[0]).toEqual(expect.objectContaining({ action: 'advance.request', resource: 'PaymentProof' }));
  });

  it('solicitar sin monto es 400', async () => {
    await expect(
      controller.createAdvance({ user: user('u-pide') } as never, { eventId: 'ev-1', label: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aprobar avisa a quien pidió y a quien paga, nunca al que aprobó', async () => {
    proofs.push(advance());
    const updated = await controller.approveAdvance({ user: user('u-gerente') } as never, 'adv-1');
    expect(updated).toEqual(expect.objectContaining({ advanceStatus: 'APPROVED', decidedById: 'u-gerente' }));
    const items = sent();
    expect(items.find((i: any) => i.userId === 'u-pide')).toEqual(
      expect.objectContaining({ type: 'advance.approved', linkUrl: '/advances?advance=adv-1' }),
    );
    expect(items.filter((i: any) => i.type === 'advance.to_pay').map((i: any) => i.userId).sort()).toEqual([
      'u-dir',
      'u-gob',
    ]);
    expect(items.some((i: any) => i.userId === 'u-gerente')).toBe(false);
  });

  it('nadie aprueba su propia solicitud', async () => {
    proofs.push(advance({ uploadedById: 'u-gerente' }));
    await expect(controller.approveAdvance({ user: user('u-gerente') } as never, 'adv-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('quien no autoriza OC no aprueba anticipos', async () => {
    proofs.push(advance({ uploadedById: 'u-gerente' }));
    await expect(controller.approveAdvance({ user: user('u-gob') } as never, 'adv-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechazar pide motivo y se lo manda a quien pidió', async () => {
    proofs.push(advance());
    await expect(
      controller.rejectAdvance({ user: user('u-dir') } as never, 'adv-1', { reason: ' ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const updated = await controller.rejectAdvance({ user: user('u-dir') } as never, 'adv-1', {
      reason: 'Ya se pagó por OC',
    });
    expect(updated).toEqual(expect.objectContaining({ advanceStatus: 'REJECTED', rejectReason: 'Ya se pagó por OC' }));
    expect(sent()).toEqual([
      expect.objectContaining({ userId: 'u-pide', type: 'advance.rejected', body: expect.stringContaining('Motivo: Ya se pagó por OC') }),
    ]);
  });

  it('transiciones inválidas son 409', async () => {
    proofs.push(advance());
    await expect(controller.markAdvancePaid({ user: user('u-gob') } as never, 'adv-1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    proofs[0].advanceStatus = 'PAID';
    await expect(controller.approveAdvance({ user: user('u-gerente') } as never, 'adv-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      controller.rejectAdvance({ user: user('u-gerente') } as never, 'adv-1', { reason: 'tarde' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('marcar pagado desde aprobado guarda el comprobante y avisa a quien pidió', async () => {
    proofs.push(advance({ advanceStatus: 'APPROVED', decidedById: 'u-gerente' }));
    const updated = await controller.markAdvancePaid({ user: user('u-gob') } as never, 'adv-1', {
      proofUrl: '/uploads/pago.pdf',
    });
    expect(updated).toEqual(
      expect.objectContaining({ advanceStatus: 'PAID', paidById: 'u-gob', paidProofUrl: '/uploads/pago.pdf' }),
    );
    expect(sent()).toEqual([expect.objectContaining({ userId: 'u-pide', type: 'advance.paid' })]);
    expect(audits.map((a) => a.action)).toEqual(['advance.pay']);
  });

  it('«por resolver» trae lo que apruebo (no lo mío) y lo que pago', async () => {
    proofs.push(
      advance({ id: 'a-otro' }),
      advance({ id: 'a-mio', uploadedById: 'u-gerente' }),
      advance({ id: 'a-pagar', advanceStatus: 'APPROVED' }),
    );
    const mine = await controller.pendingAdvances({ user: user('u-gerente') } as never);
    expect(mine.map((r) => r.id)).toEqual(['a-otro', 'a-pagar']);
    const payer = await controller.pendingAdvances({ user: user('u-gob') } as never);
    expect(payer.map((r) => r.id)).toEqual(['a-pagar']);
    expect(await controller.pendingAdvances({ user: user('u-pide') } as never)).toEqual([]);
  });

  it('canal y prioridad de cada aviso', () => {
    expect(pushMetaFor('advance.requested')).toEqual({ channel: 'approvals', priority: 'high' });
    expect(pushMetaFor('advance.to_pay')).toEqual({ channel: 'finance', priority: 'high' });
    expect(pushMetaFor('advance.rejected')).toEqual({ channel: 'finance', priority: 'high' });
    expect(pushMetaFor('advance.approved')).toEqual({ channel: 'finance', priority: 'normal' });
    expect(pushMetaFor('advance.paid')).toEqual({ channel: 'finance', priority: 'normal' });
  });
});
