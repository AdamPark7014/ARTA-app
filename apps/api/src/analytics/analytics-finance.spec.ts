import { AnalyticsService } from './analytics.service';

/**
 * Finanzas decía $0 de egresos junto a $50,280 pagados en órdenes de compra (recorrido 11-11-2026).
 * Lo pagado en OC va aparte (no se suma: la corrida puede traer ya ese gasto) y se avisa cuando un
 * evento pagó órdenes y su corrida no tiene ni un egreso.
 */
describe('AnalyticsService.finance · órdenes de compra pagadas', () => {
  const run = (rows: Array<{ type: string; amount: number }>) => ({
    id: 'r',
    title: 'Corrida',
    locked: false,
    dataJson: { rows },
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  });
  const event = (id: string, financeRuns: unknown[]) => ({
    id,
    name: id,
    artist: null,
    status: 'ACTIVE',
    startsAt: null,
    financeRuns,
  });

  function service(events: unknown[], paid: unknown[]) {
    const groupBy = jest.fn().mockResolvedValue(paid);
    const prisma = { event: { findMany: jest.fn().mockResolvedValue(events) }, purchaseOrder: { groupBy } };
    return { svc: new AnalyticsService(prisma as never), groupBy };
  }

  it('pone lo pagado en OC por evento, sin sumarlo a los egresos de la corrida', async () => {
    const { svc, groupBy } = service(
      [event('a', [run([{ type: 'income', amount: 1000 }, { type: 'expense', amount: 400 }])]), event('b', [])],
      [{ eventId: 'a', _sum: { amount: 300 }, _count: { _all: 2 } }],
    );
    const out = await svc.finance('ARTA' as never, 'org');

    expect(groupBy.mock.calls[0][0].where).toEqual({ status: 'PAID', event: { entity: 'ARTA', organizationId: 'org' } });
    const a = out.rows.find((r) => r.eventId === 'a')!;
    expect(a).toMatchObject({ expense: 400, net: 600, poPaid: 300, poPaidCount: 2 });
    expect(out.rows.find((r) => r.eventId === 'b')).toMatchObject({ poPaid: 0, poPaidCount: 0 });
    expect(out.totals).toMatchObject({ expense: 400, poPaid: 300, poWithoutExpense: 0 });
    expect(out.alerts.some((x) => /órdenes de compra/.test(x.message))).toBe(false);
  });

  it('avisa cuando un evento pagó órdenes y su corrida no tiene egresos', async () => {
    const { svc } = service(
      [event('a', [run([{ type: 'income', amount: 1000 }])])],
      [{ eventId: 'a', _sum: { amount: 50280 }, _count: { _all: 3 } }],
    );
    const out = await svc.finance('ARTA' as never, 'org');
    expect(out.totals.poWithoutExpense).toBe(1);
    expect(out.alerts).toContainEqual({
      severity: 'warning',
      message: 'Un evento pagó órdenes de compra y su corrida no tiene egresos capturados',
    });
  });
});
