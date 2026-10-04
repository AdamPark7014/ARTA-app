/**
 * Insertar y eliminar filas o columnas en una hoja SIN desordenarla.
 *
 * Correcciones 30-09-2026 (Campañas): «no permite agregar columnas ni filas de
 * manera sencilla sin que mueva todo el orden». El editor solo movía los
 * valores: el formato, las celdas combinadas y las fórmulas se quedaban donde
 * estaban, así que la banda negra de TOTAL acababa sobre un concepto y la suma
 * apuntaba a la fila equivocada. Aquí está la regla que siguen los dos lados,
 * igual que Excel:
 *
 * - Lo que queda en o después del punto de inserción se recorre `count`.
 * - Un rango que cruza el punto de inserción crece; uno que queda entero en lo
 *   eliminado desaparece (`#REF!` en una fórmula) y uno que lo toca se encoge.
 * - Insertar justo entre un rango y la fórmula que lo suma (un concepto nuevo
 *   arriba de TOTAL) o justo al inicio del rango (un concepto nuevo antes del
 *   primero) hace crecer el rango: la fila nueva entra en el total. Excel aquí
 *   la dejaría fuera; para quien captura una campaña eso es un total mal hecho.
 *
 * ESTE ARCHIVO ESTÁ DUPLICADO a propósito, idéntico, en:
 *   apps/api/src/uploads/sheet-ops.ts  → lo aplica el servidor sobre el .xlsx real
 *   apps/web/lib/sheet-ops.ts          → lo aplica el editor en pantalla
 * `sheet-ops.spec.ts` falla si dejan de ser iguales. Sin imports: función pura.
 */

export type SheetOpKind = 'insertRows' | 'deleteRows' | 'insertCols' | 'deleteCols';

export type SheetOp = {
  sheet: string;
  kind: SheetOpKind;
  /** Primera fila o columna afectada, contando desde 1 (como Excel). */
  at: number;
  count: number;
  /** De dónde toma el formato lo insertado: la fila/columna anterior, la siguiente o ninguna. */
  styleFrom?: 'before' | 'after' | 'none';
};

/** Tope defensivo por operación. */
export const MAX_OP_COUNT = 500;

/** Una fórmula y la celda donde vive (antes de la operación). */
export type FormulaCell = { sheet: string; row: number; col: number };

export function isRowOp(op: Pick<SheetOp, 'kind'>): boolean {
  return op.kind === 'insertRows' || op.kind === 'deleteRows';
}

export function isInsertOp(op: Pick<SheetOp, 'kind'>): boolean {
  return op.kind === 'insertRows' || op.kind === 'insertCols';
}

/** `A` → 1, `Z` → 26, `AA` → 27. */
export function colToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 1 → `A`, 27 → `AA`. */
export function numberToCol(n: number): string {
  let out = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
}

/** Nueva posición (desde 1) de una fila o columna; `null` si se eliminó. */
export function shiftIndex(index: number, op: Pick<SheetOp, 'kind' | 'at' | 'count'>): number | null {
  if (isInsertOp(op)) return index >= op.at ? index + op.count : index;
  const last = op.at + op.count - 1;
  if (index < op.at) return index;
  if (index > last) return index - op.count;
  return null;
}

/** Nuevo tramo `[inicio, fin]`; `null` si quedó entero dentro de lo eliminado. */
export function shiftSpan(
  start: number,
  end: number,
  op: Pick<SheetOp, 'kind' | 'at' | 'count'>,
): [number, number] | null {
  const s0 = Math.min(start, end);
  const e0 = Math.max(start, end);
  if (isInsertOp(op)) {
    return [s0 >= op.at ? s0 + op.count : s0, e0 >= op.at ? e0 + op.count : e0];
  }
  const last = op.at + op.count - 1;
  if (s0 >= op.at && e0 <= last) return null;
  const s = s0 < op.at ? s0 : s0 > last ? s0 - op.count : op.at;
  const e = e0 < op.at ? e0 : e0 > last ? e0 - op.count : op.at - 1;
  return s > e ? null : [s, e];
}

const CELL = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;

/** `B12` → `{ col: 2, row: 12 }`. */
export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = CELL.exec(ref.trim());
  if (!m) return null;
  return { col: colToNumber(m[1]), row: Number(m[2]) };
}

export function cellRef(col: number, row: number): string {
  return `${numberToCol(col)}${row}`;
}

/** Dirección de una celda de la hoja tras la operación; `null` si se eliminó. */
export function shiftCellRef(ref: string, op: SheetOp): string | null {
  const cell = parseCellRef(ref);
  if (!cell) return ref;
  if (isRowOp(op)) {
    const row = shiftIndex(cell.row, op);
    return row === null ? null : cellRef(cell.col, row);
  }
  const col = shiftIndex(cell.col, op);
  return col === null ? null : cellRef(col, cell.row);
}

/** Rango `A1:B5` (o una celda) de la hoja tras la operación; `null` si desaparece. */
export function shiftRangeRef(range: string, op: SheetOp): string | null {
  const [a, b = a] = range.split(':');
  const from = parseCellRef(a);
  const to = parseCellRef(b);
  if (!from || !to) return range;
  let r1 = Math.min(from.row, to.row);
  let r2 = Math.max(from.row, to.row);
  let c1 = Math.min(from.col, to.col);
  let c2 = Math.max(from.col, to.col);
  if (isRowOp(op)) {
    const span = shiftSpan(r1, r2, op);
    if (!span) return null;
    [r1, r2] = span;
  } else {
    const span = shiftSpan(c1, c2, op);
    if (!span) return null;
    [c1, c2] = span;
  }
  const start = cellRef(c1, r1);
  const end = cellRef(c2, r2);
  return start === end && !range.includes(':') ? start : `${start}:${end}`;
}

/** Lista de rangos separados por espacio (formato condicional, validaciones). */
export function shiftSqref(sqref: string, op: SheetOp): string | null {
  const parts = sqref
    .split(/\s+/)
    .filter(Boolean)
    .map((r) => shiftRangeRef(r, op))
    .filter((r): r is string => !!r);
  return parts.length ? parts.join(' ') : null;
}

/* ── Referencias dentro de una fórmula ──────────────────────────────────── */

type Ref =
  | { kind: 'cell'; cAbs: string; col: number; rAbs: string; row: number }
  | {
      kind: 'area';
      c1Abs: string;
      c1: number;
      r1Abs: string;
      r1: number;
      c2Abs: string;
      c2: number;
      r2Abs: string;
      r2: number;
    }
  | { kind: 'cols'; c1Abs: string; c1: number; c2Abs: string; c2: number }
  | { kind: 'rows'; r1Abs: string; r1: number; r2Abs: string; r2: number };

/**
 * Hoja opcional (`'Mi hoja'!` o `Hoja1!`) y luego celda, área, columnas
 * completas (`A:C`) o filas completas (`1:5`).
 */
const REF_RE =
  /(?:('(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!)?(?:(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?|(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})|(\$?)(\d+):(\$?)(\d+))/uy;
/** Lo que no puede ir pegado antes de una referencia (sería parte de otro nombre). */
const BEFORE = /[\p{L}\p{N}_.$]/u;
/** Lo que no puede ir después (nombre de función como `LOG10(` o un nombre definido). */
const AFTER = /[\p{L}\p{N}_(!]/u;

function sheetNameOf(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
}

function writeRef(prefix: string, ref: Ref): string {
  switch (ref.kind) {
    case 'cell':
      return `${prefix}${ref.cAbs}${numberToCol(ref.col)}${ref.rAbs}${ref.row}`;
    case 'area':
      return `${prefix}${ref.c1Abs}${numberToCol(ref.c1)}${ref.r1Abs}${ref.r1}:${ref.c2Abs}${numberToCol(ref.c2)}${ref.r2Abs}${ref.r2}`;
    case 'cols':
      return `${prefix}${ref.c1Abs}${numberToCol(ref.c1)}:${ref.c2Abs}${numberToCol(ref.c2)}`;
    case 'rows':
      return `${prefix}${ref.r1Abs}${ref.r1}:${ref.r2Abs}${ref.r2}`;
  }
}

/**
 * Recorre la fórmula y deja que `fn` reescriba cada referencia. Los textos
 * entre comillas no se tocan. `fn` devuelve la referencia nueva o `null` para
 * `#REF!`.
 */
function rewriteRefs(formula: string, fn: (ref: Ref, sheet: string | null) => Ref | null): string {
  let out = '';
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < formula.length) {
        if (formula[j] === '"') {
          if (formula[j + 1] === '"') {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += formula.slice(i, j);
      i = j;
      continue;
    }
    const prev = i > 0 ? formula[i - 1] : '';
    if (!prev || !BEFORE.test(prev)) {
      REF_RE.lastIndex = i;
      const m = REF_RE.exec(formula);
      const end = m ? i + m[0].length : 0;
      if (m && m[0] && (end >= formula.length || !AFTER.test(formula[end]))) {
        const prefix = m[1] ? `${m[1]}!` : '';
        let ref: Ref;
        if (m[3]) {
          ref = m[7]
            ? {
                kind: 'area',
                c1Abs: m[2],
                c1: colToNumber(m[3]),
                r1Abs: m[4],
                r1: Number(m[5]),
                c2Abs: m[6],
                c2: colToNumber(m[7]),
                r2Abs: m[8],
                r2: Number(m[9]),
              }
            : { kind: 'cell', cAbs: m[2], col: colToNumber(m[3]), rAbs: m[4], row: Number(m[5]) };
        } else if (m[11]) {
          ref = { kind: 'cols', c1Abs: m[10], c1: colToNumber(m[11]), c2Abs: m[12], c2: colToNumber(m[13]) };
        } else {
          ref = { kind: 'rows', r1Abs: m[14], r1: Number(m[15]), r2Abs: m[16], r2: Number(m[17]) };
        }
        const next = fn(ref, sheetNameOf(m[1]));
        out += next ? writeRef(prefix, next) : '#REF!';
        i = end;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Reescribe las referencias de una fórmula que apuntan a la hoja de la
 * operación. `cell` es dónde vive la fórmula ANTES de la operación (su hoja
 * decide a qué hoja apuntan las referencias sin prefijo).
 */
export function shiftFormula(formula: string, op: SheetOp, cell: FormulaCell): string {
  const target = op.sheet.toLowerCase();
  const rows = isRowOp(op);
  const insert = isInsertOp(op);
  const onSheet = cell.sheet.toLowerCase() === target;
  const along = rows ? cell.row : cell.col;
  const across = rows ? cell.col : cell.row;
  /** Una fórmula de total: en la misma hoja, después del rango y en su misma franja. */
  const totals = (start: number, end: number, crossStart: number, crossEnd: number) =>
    insert && onSheet && start < end && along > end && across >= crossStart && across <= crossEnd;
  // Concepto nuevo justo arriba del TOTAL (o columna nueva justo antes de la de totales).
  const grows = (start: number, end: number, crossStart: number, crossEnd: number) =>
    totals(start, end, crossStart, crossEnd) && end === op.at - 1 && along === op.at;
  // Concepto nuevo antes del primero: el rango se queda donde empezaba y crece.
  const keepsStart = (start: number, end: number, crossStart: number, crossEnd: number) =>
    totals(start, end, crossStart, crossEnd) && start === op.at;

  return rewriteRefs(formula, (ref, sheet) => {
    if ((sheet ?? cell.sheet).toLowerCase() !== target) return ref;
    switch (ref.kind) {
      case 'cell': {
        const idx = shiftIndex(rows ? ref.row : ref.col, op);
        if (idx === null) return null;
        return rows ? { ...ref, row: idx } : { ...ref, col: idx };
      }
      case 'area': {
        const [a1, a2, x1, x2] = rows ? [ref.r1, ref.r2, ref.c1, ref.c2] : [ref.c1, ref.c2, ref.r1, ref.r2];
        const span = shiftSpan(a1, a2, op);
        if (!span) return null;
        const lo = Math.min(a1, a2);
        const hi = Math.max(a1, a2);
        const xlo = Math.min(x1, x2);
        const xhi = Math.max(x1, x2);
        const start = keepsStart(lo, hi, xlo, xhi) ? lo : span[0];
        const end = grows(lo, hi, xlo, xhi) ? span[1] + op.count : span[1];
        return rows ? { ...ref, r1: start, r2: end } : { ...ref, c1: start, c2: end };
      }
      case 'cols': {
        if (rows) return ref;
        const span = shiftSpan(ref.c1, ref.c2, op);
        return span ? { ...ref, c1: span[0], c2: span[1] } : null;
      }
      case 'rows': {
        if (!rows) return ref;
        const span = shiftSpan(ref.r1, ref.r2, op);
        return span ? { ...ref, r1: span[0], r2: span[1] } : null;
      }
    }
  });
}

/**
 * Copiar y pegar (o duplicar una fila): las referencias relativas se mueven
 * lo mismo que la celda; las que llevan `$` se quedan.
 */
export function translateFormula(formula: string, dRow: number, dCol: number): string {
  if (!dRow && !dCol) return formula;
  const r = (abs: string, n: number) => (abs ? n : n + dRow);
  const c = (abs: string, n: number) => (abs ? n : n + dCol);
  return rewriteRefs(formula, (ref) => {
    let next: Ref;
    switch (ref.kind) {
      case 'cell':
        next = { ...ref, row: r(ref.rAbs, ref.row), col: c(ref.cAbs, ref.col) };
        return next.row < 1 || next.col < 1 ? null : next;
      case 'area':
        next = {
          ...ref,
          r1: r(ref.r1Abs, ref.r1),
          r2: r(ref.r2Abs, ref.r2),
          c1: c(ref.c1Abs, ref.c1),
          c2: c(ref.c2Abs, ref.c2),
        };
        return next.r1 < 1 || next.r2 < 1 || next.c1 < 1 || next.c2 < 1 ? null : next;
      case 'cols':
        next = { ...ref, c1: c(ref.c1Abs, ref.c1), c2: c(ref.c2Abs, ref.c2) };
        return next.c1 < 1 || next.c2 < 1 ? null : next;
      case 'rows':
        next = { ...ref, r1: r(ref.r1Abs, ref.r1), r2: r(ref.r2Abs, ref.r2) };
        return next.r1 < 1 || next.r2 < 1 ? null : next;
    }
  });
}

/** Valida una operación que llega del panel; devuelve el mensaje de error o `null`. */
export function sheetOpProblem(op: unknown): string | null {
  if (!op || typeof op !== 'object') return 'Operación mal formada';
  const o = op as Partial<SheetOp>;
  if (typeof o.sheet !== 'string' || !o.sheet) return 'Operación sin hoja';
  if (!['insertRows', 'deleteRows', 'insertCols', 'deleteCols'].includes(String(o.kind))) {
    return `Operación desconocida: ${String(o.kind)}`;
  }
  if (!Number.isInteger(o.at) || (o.at as number) < 1) return 'Posición inválida';
  if (!Number.isInteger(o.count) || (o.count as number) < 1 || (o.count as number) > MAX_OP_COUNT) {
    return 'Cantidad inválida';
  }
  if (o.styleFrom !== undefined && !['before', 'after', 'none'].includes(o.styleFrom)) return 'Formato de origen inválido';
  return null;
}
