/**
 * Totales de la corrida — implementación única, siempre del lado del servidor.
 *
 * Antes cada sitio los calculaba por su cuenta y, si `rows` venía vacío, se
 * creía los `totalIncome`/`totalExpense` que mandaba el cliente: bastaba un
 * PATCH sin renglones para inyectar cifras inventadas en los KPIs de dirección.
 * Sin renglones no hay dinero registrado.
 */

export type FinanceRow = { type?: string; amount?: number | string | null; concept?: string };

export type FinancePayload = {
  rows?: FinanceRow[];
  totalIncome?: number;
  totalExpense?: number;
};

/** `"abc"` daba NaN y `"1e400"` Infinity; cualquiera de los dos envenenaba el total. */
export function safeAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function financeTotals(dataJson: unknown): {
  income: number;
  expense: number;
  net: number;
} {
  const data = (dataJson || {}) as FinancePayload;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const income = rows
    .filter((r) => r?.type === 'income')
    .reduce((s, r) => s + safeAmount(r.amount), 0);
  const expense = rows
    .filter((r) => r?.type === 'expense')
    .reduce((s, r) => s + safeAmount(r.amount), 0);
  return { income, expense, net: income - expense };
}

/** El payload con los totales recalculados — nunca los que llegaron del cliente. */
export function withServerTotals(dataJson: FinancePayload): FinancePayload {
  const rows = Array.isArray(dataJson?.rows) ? dataJson.rows : [];
  const { income, expense } = financeTotals({ ...dataJson, rows });
  return { ...dataJson, rows, totalIncome: income, totalExpense: expense };
}
