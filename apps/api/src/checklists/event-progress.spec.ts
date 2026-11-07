import { completeDoneEvents, recalcEventChecklists } from './event-progress';

/** Adam, 07-11-2026: al concluir un evento o pasar su fecha, sus formatos cuentan 100 %. */
describe('avance de los formatos de un evento terminado', () => {
  const now = new Date('2026-11-07T18:00:00Z');

  it('pone al 100 % solo los formatos que se enseñan de eventos cerrados o pasados', async () => {
    const updateMany = jest.fn(async () => ({ count: 3 }));
    const db = { checklistInstance: { updateMany }, event: {} } as never;
    await expect(completeDoneEvents(db, { eventId: 'ev-1', now })).resolves.toBe(3);
    const args = (updateMany.mock.calls[0] as unknown as [{ where: any; data: any }])[0];
    expect(args.data).toEqual({ progressPct: 100 });
    expect(args.where.progressPct).toEqual({ lt: 100 });
    expect(args.where.AND).toHaveLength(1);
    expect(args.where.event.id).toBe('ev-1');
    expect(args.where.event.OR[0]).toEqual({ status: 'CLOSED' });
  });

  it('al reabrir, cada formato regresa a su avance real; lo mandado sigue en 100 %', async () => {
    const update = jest.fn(async () => ({}));
    const half = { sections: [{ id: 's', items: [{ id: 'a', type: 'text', value: 'x' }, { id: 'b', type: 'text' }] }] };
    const db = {
      event: { findUnique: async () => ({ status: 'ACTIVE', startsAt: new Date('2026-12-01T03:00:00Z'), endsAt: null }) },
      checklistInstance: {
        findMany: async () => [
          { id: 'c1', dataJson: half, progressPct: 100, status: 'DRAFT', deliveredAt: null, authorizedAt: null, deliveredSignature: null, authorizedSignature: null },
          { id: 'c2', dataJson: half, progressPct: 100, status: 'REVIEW', deliveredAt: null, authorizedAt: null, deliveredSignature: null, authorizedSignature: null },
        ],
        update,
      },
    } as never;
    await expect(recalcEventChecklists(db, 'ev-1', now)).resolves.toBe(1);
    expect(update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { progressPct: 50 } });
  });

  it('si la fecha ya pasó, reabrir no le quita el 100 %', async () => {
    const update = jest.fn(async () => ({}));
    const db = {
      event: { findUnique: async () => ({ status: 'ACTIVE', startsAt: new Date('2026-10-01T03:00:00Z'), endsAt: null }) },
      checklistInstance: {
        findMany: async () => [
          { id: 'c1', dataJson: { sections: [] }, progressPct: 100, status: 'DRAFT', deliveredAt: null, authorizedAt: null, deliveredSignature: null, authorizedSignature: null },
        ],
        update,
      },
    } as never;
    await expect(recalcEventChecklists(db, 'ev-1', now)).resolves.toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
