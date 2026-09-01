import { financeTotals, safeAmount, withServerTotals } from './finance-totals';

/**
 * El agujero que cierra esto: `PATCH /finance/:id` con
 * `{ dataJson: { totalIncome: 99999999 } }` —sin `rows`— persistía esa cifra
 * y el dashboard de dirección se la creía.
 */
describe('finance-totals', () => {
  it('suma ingresos y egresos de los renglones', () => {
    const data = {
      rows: [
        { type: 'income', concept: 'Taquilla', amount: 100000 },
        { type: 'income', concept: 'Patrocinios', amount: 50000 },
        { type: 'expense', concept: 'Audio', amount: 20000 },
      ],
    };
    expect(financeTotals(data)).toEqual({ income: 150000, expense: 20000, net: 130000 });
  });

  it('ignora los totales que manda el cliente cuando no hay renglones', () => {
    const inyectado = { totalIncome: 99999999, totalExpense: 0 };
    expect(financeTotals(inyectado)).toEqual({ income: 0, expense: 0, net: 0 });

    const saneado = withServerTotals(inyectado);
    expect(saneado.totalIncome).toBe(0);
    expect(saneado.totalExpense).toBe(0);
    expect(saneado.rows).toEqual([]);
  });

  it('recalcula aunque el cliente mande totales que no cuadran', () => {
    const saneado = withServerTotals({
      rows: [{ type: 'income', concept: 'Taquilla', amount: 10 }],
      totalIncome: 999,
      totalExpense: 888,
    });
    expect(saneado.totalIncome).toBe(10);
    expect(saneado.totalExpense).toBe(0);
  });

  it('no se envenena con NaN ni Infinity', () => {
    expect(safeAmount('abc')).toBe(0);
    expect(safeAmount('1e400')).toBe(0);
    expect(safeAmount(null)).toBe(0);
    expect(safeAmount(undefined)).toBe(0);
    expect(safeAmount('1500')).toBe(1500);
    expect(safeAmount(-250)).toBe(-250);

    const data = {
      rows: [
        { type: 'income', amount: '1e400' as unknown as number },
        { type: 'income', amount: 'abc' as unknown as number },
        { type: 'income', amount: 100 },
      ],
    };
    expect(financeTotals(data).income).toBe(100);
  });

  it('aguanta payloads corruptos', () => {
    expect(financeTotals(null)).toEqual({ income: 0, expense: 0, net: 0 });
    expect(financeTotals(undefined)).toEqual({ income: 0, expense: 0, net: 0 });
    expect(financeTotals({ rows: 'no soy una lista' })).toEqual({ income: 0, expense: 0, net: 0 });
    expect(withServerTotals({ rows: undefined }).rows).toEqual([]);
  });

  it('un renglón sin tipo no cuenta ni como ingreso ni como egreso', () => {
    const data = { rows: [{ concept: 'Sin clasificar', amount: 5000 }] };
    expect(financeTotals(data)).toEqual({ income: 0, expense: 0, net: 0 });
  });

  it('el neto puede ser negativo', () => {
    const data = {
      rows: [
        { type: 'income', amount: 1000 },
        { type: 'expense', amount: 2500 },
      ],
    };
    expect(financeTotals(data).net).toBe(-1500);
  });
});
