import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { pushMetaFor } from '../notifications/notification-push-meta';

/**
 * Anticipos con aprobación: quién puede cada paso y a quién le llega cada aviso.
 * Reglas del 01-11-2026: aprueba quien autoriza OC (dirección general), paga quien marca OC pagadas.
 */
describe('FinanceController · anticipos', () => {
  const ORG = 'org-arta';
  const event = { id: 'ev-1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };
  const people = [
    { id: 'u-dir', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'], permissions: [] as string[] },
    { id: 'u-dir2', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'], permissions: [] as string[] },
    // Ve Arta, pero ya no aprueba ni paga.
    { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'], permissions: [] as string[] },
    { id: 'u-pide', roleKey: 'logistica', entities: ['ARTA'], permissions: [] as string[] },
    // Aprueba y paga por permiso extra, pero en el otro negocio.
    { id: 'u-auditorio', roleKey: 'dir_auditorio', entities: ['EXPLANADA'], permissions: ['po.authorize', 'po.mark_paid'] },
    { id: 'u-gob', roleKey: 'enlace_gobierno', entities: ['ARTA'], permissions: [] as string[] },
    { id: 'u-paula', roleKey: 'contabilidad', entities: ['ARTA', 'EXPLANADA'], permissions: [] as string[] },
  ];
  const user = (id: string) => {
    const p = people.find((x) => x.id === id)!;
    return { ...p, fullName: 'Arturo Taja', organizationId: ORG };
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
    expect(sent().map((i: any) => i.userId).sort()).toEqual(['u-dir', 'u-dir2']);
    expect(sent()[0]).toEqual(
      expect.objectContaining({ type: 'advance.requested', linkUrl: '/advances?advance=adv-new', actorId: 'u-pide' }),
    );
    expect(audits[0]).toEqual(expect.objectContaining({ action: 'advance.request', resource: 'PaymentProof' }));
  });

  it('si quien solicita también aprueba, a él no le llega su propio aviso', async () => {
    await controller.createAdvance({ user: user('u-dir') } as never, { eventId: 'ev-1', label: 'Hospedaje', amount: 5000 });
    expect(sent().map((i: any) => i.userId)).toEqual(['u-dir2']);
  });

  it('solicitar sin monto es 400', async () => {
    await expect(
      controller.createAdvance({ user: user('u-pide') } as never, { eventId: 'ev-1', label: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aprobar avisa a quien pidió y a quien paga, nunca al que aprobó', async () => {
    proofs.push(advance());
    const updated = await controller.approveAdvance({ user: user('u-dir') } as never, 'adv-1');
    expect(updated).toEqual(expect.objectContaining({ advanceStatus: 'APPROVED', decidedById: 'u-dir' }));
    const items = sent();
    expect(items.find((i: any) => i.userId === 'u-pide')).toEqual(
      expect.objectContaining({ type: 'advance.approved', linkUrl: '/advances?advance=adv-1' }),
    );
    expect(items.filter((i: any) => i.type === 'advance.to_pay').map((i: any) => i.userId).sort()).toEqual([
      'u-dir2',
      'u-gob',
      'u-paula',
    ]);
    expect(items.some((i: any) => i.userId === 'u-dir')).toBe(false);
    // La gerencia ya no paga: no recibe nada.
    expect(items.some((i: any) => i.userId === 'u-gerente')).toBe(false);
  });

  it('nadie aprueba su propia solicitud', async () => {
    proofs.push(advance({ uploadedById: 'u-dir' }));
    await expect(controller.approveAdvance({ user: user('u-dir') } as never, 'adv-1')).rejects.toThrow(
      'No puedes aprobar tu propia solicitud',
    );
    await expect(
      controller.rejectAdvance({ user: user('u-dir') } as never, 'adv-1', { reason: 'no procede' }),
    ).rejects.toThrow('No puedes resolver tu propia solicitud');
    expect(proofs[0].advanceStatus).toBe('PENDING');
  });

  it.each(['u-gob', 'u-gerente', 'u-paula'])('quien no autoriza OC no aprueba anticipos: %s', async (id) => {
    proofs.push(advance());
    await expect(controller.approveAdvance({ user: user(id) } as never, 'adv-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      controller.rejectAdvance({ user: user(id) } as never, 'adv-1', { reason: 'no procede' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(proofs[0].advanceStatus).toBe('PENDING');
  });

  it('quien no marca OC pagadas no paga anticipos: la gerencia, por ejemplo', async () => {
    proofs.push(advance({ advanceStatus: 'APPROVED', decidedById: 'u-dir' }));
    await expect(controller.markAdvancePaid({ user: user('u-gerente') } as never, 'adv-1', {})).rejects.toThrow(
      'No puedes marcar anticipos como pagados',
    );
    expect(proofs[0].advanceStatus).toBe('APPROVED');
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
    await expect(controller.approveAdvance({ user: user('u-dir') } as never, 'adv-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      controller.rejectAdvance({ user: user('u-dir') } as never, 'adv-1', { reason: 'tarde' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('marcar pagado desde aprobado guarda el comprobante y avisa a quien pidió', async () => {
    proofs.push(advance({ advanceStatus: 'APPROVED', decidedById: 'u-dir' }));
    const updated = await controller.markAdvancePaid({ user: user('u-paula') } as never, 'adv-1', {
      proofUrl: '/uploads/pago.pdf',
    });
    expect(updated).toEqual(
      expect.objectContaining({ advanceStatus: 'PAID', paidById: 'u-paula', paidProofUrl: '/uploads/pago.pdf' }),
    );
    expect(sent()).toEqual([expect.objectContaining({ userId: 'u-pide', type: 'advance.paid' })]);
    expect(audits.map((a) => a.action)).toEqual(['advance.pay']);
  });

  it('«por resolver» trae lo que apruebo (no lo mío) y lo que pago', async () => {
    proofs.push(
      advance({ id: 'a-otro' }),
      advance({ id: 'a-mio', uploadedById: 'u-dir' }),
      advance({ id: 'a-pagar', advanceStatus: 'APPROVED' }),
    );
    const mine = await controller.pendingAdvances({ user: user('u-dir') } as never);
    expect(mine.map((r) => r.id)).toEqual(['a-otro', 'a-pagar']);
    const payer = await controller.pendingAdvances({ user: user('u-gob') } as never);
    expect(payer.map((r) => r.id)).toEqual(['a-pagar']);
    const paula = await controller.pendingAdvances({ user: user('u-paula') } as never);
    expect(paula.map((r) => r.id)).toEqual(['a-pagar']);
    expect(await controller.pendingAdvances({ user: user('u-pide') } as never)).toEqual([]);
    // La gerencia ya no aprueba ni paga: nada le queda por resolver.
    expect(await controller.pendingAdvances({ user: user('u-gerente') } as never)).toEqual([]);
  });

  it('canal y prioridad de cada aviso', () => {
    expect(pushMetaFor('advance.requested')).toEqual({ channel: 'approvals', priority: 'high' });
    expect(pushMetaFor('advance.to_pay')).toEqual({ channel: 'finance', priority: 'high' });
    expect(pushMetaFor('advance.rejected')).toEqual({ channel: 'finance', priority: 'high' });
    expect(pushMetaFor('advance.approved')).toEqual({ channel: 'finance', priority: 'normal' });
    expect(pushMetaFor('advance.paid')).toEqual({ channel: 'finance', priority: 'normal' });
  });
});
