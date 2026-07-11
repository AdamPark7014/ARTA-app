import * as XLSX from 'xlsx';

export type FinanceRow = { concept: string; type: 'income' | 'expense'; amount: number };
export type FinanceData = { rows: FinanceRow[]; totalIncome: number; totalExpense: number };

function normalizeHeader(h: unknown): string {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseAmount(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/[$,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function detectType(raw: unknown, amount: number): 'income' | 'expense' {
  const t = normalizeHeader(raw);
  if (/ingreso|income|taquilla|patroc|venta|revenue/.test(t)) return 'income';
  if (/egreso|expense|gasto|costo|cost|pago/.test(t)) return 'expense';
  // signed amounts: negative → expense
  if (amount < 0) return 'expense';
  return 'expense';
}

/** Importa filas desde Excel/CSV. Espera columnas Concepto / Tipo / Monto (o primeras 3). */
export async function importFinanceFromFile(file: File): Promise<FinanceData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Excel vacío');

  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as Array<Array<string | number>>;

  if (!matrix.length) throw new Error('Sin filas');

  const header = matrix[0].map(normalizeHeader);
  let conceptIdx = header.findIndex((h) => /concepto|concept|descripcion|description|rubro|item/.test(h));
  let typeIdx = header.findIndex((h) => /tipo|type|clase|naturaleza/.test(h));
  let amountIdx = header.findIndex((h) => /monto|amount|importe|total|precio|valor/.test(h));

  const hasHeader = conceptIdx >= 0 || amountIdx >= 0 || typeIdx >= 0;
  if (!hasHeader) {
    conceptIdx = 0;
    typeIdx = 1;
    amountIdx = 2;
  } else {
    if (conceptIdx < 0) conceptIdx = 0;
    if (amountIdx < 0) amountIdx = header.length > 2 ? 2 : 1;
  }

  const start = hasHeader ? 1 : 0;
  const rows: FinanceRow[] = [];

  for (let i = start; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const concept = String(row[conceptIdx] ?? '').trim();
    if (!concept) continue;
    let amount = parseAmount(row[amountIdx]);
    const typeRaw = typeIdx >= 0 ? row[typeIdx] : '';
    let type = detectType(typeRaw, amount);
    // If type column says income/expense explicitly, prefer that and use abs amount
    const tNorm = normalizeHeader(typeRaw);
    if (/ingreso|income/.test(tNorm)) {
      type = 'income';
      amount = Math.abs(amount);
    } else if (/egreso|expense|gasto/.test(tNorm)) {
      type = 'expense';
      amount = Math.abs(amount);
    } else if (amount < 0) {
      type = 'expense';
      amount = Math.abs(amount);
    }
    rows.push({ concept, type, amount });
  }

  if (!rows.length) throw new Error('No se encontraron filas válidas (Concepto / Monto)');

  const totalIncome = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const totalExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  return { rows, totalIncome, totalExpense };
}
