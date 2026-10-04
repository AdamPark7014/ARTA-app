import * as XLSX from 'xlsx';
import {
  isInsertOp,
  isRowOp,
  shiftCellRef,
  shiftFormula,
  shiftIndex,
  shiftSpan,
  type SheetOp,
} from './sheet-ops';

/**
 * Lo que el editor de hoja (`SheetEditor`) hace en el navegador cuando se
 * inserta o elimina una fila o columna: la misma regla que el servidor
 * (`sheet-ops.ts`) aplicada a la cuadrícula, al libro en memoria, al estilo
 * leído del servidor y a las celdas pendientes de guardar. Así lo que se ve
 * antes de guardar es lo mismo que queda en el `.xlsx`.
 */

export type Grid = string[][];

export type ServerBorderSide = { width: number; color: string };
export type ServerCell = {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  fill: string | null;
  color: string;
  border: { top?: ServerBorderSide; right?: ServerBorderSide; bottom?: ServerBorderSide; left?: ServerBorderSide };
};
export type ServerLayout = { colWidths: number[]; cells: ServerCell[] };

/** Una celda cambiada, en el formato que espera `PATCH /uploads/:id/cells`. */
export type CellChange = {
  sheet: string;
  ref: string;
  formula?: string | null;
  value?: string | number | null;
};

export type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };

/* ── Cuadrícula ───────────────────────────────────────────────────────── */

/**
 * Inserta o elimina en la cuadrícula. Cada fórmula se reescribe desde la celda
 * donde vivía ANTES (igual que en el servidor).
 */
export function applyOpToGrid(grid: Grid, op: SheetOp): Grid {
  const rows = isRowOp(op);
  const height = grid.length;
  const width = Math.max(1, ...grid.map((r) => r.length));
  const newHeight = rows ? (isInsertOp(op) ? height + op.count : Math.max(1, height - overlap(op, height))) : height;
  const newWidth = rows ? width : isInsertOp(op) ? width + op.count : Math.max(1, width - overlap(op, width));
  const out: Grid = Array.from({ length: newHeight }, () => Array(newWidth).fill(''));
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const text = grid[r]?.[c] ?? '';
      if (!text) continue;
      const nr = rows ? shiftIndex(r + 1, op) : r + 1;
      const nc = rows ? c + 1 : shiftIndex(c + 1, op);
      if (nr === null || nc === null || nr > newHeight || nc > newWidth) continue;
      out[nr - 1][nc - 1] = text.startsWith('=')
        ? `=${shiftFormula(text.slice(1), op, { sheet: op.sheet, row: r + 1, col: c + 1 })}`
        : text;
    }
  }
  return out;
}

/** Cuántas de las filas/columnas eliminadas existen de verdad en la cuadrícula. */
function overlap(op: SheetOp, size: number): number {
  const last = Math.min(size, op.at + op.count - 1);
  return Math.max(0, last - op.at + 1);
}

/* ── Libro en memoria (SheetJS) ───────────────────────────────────────── */

/**
 * Mismo cambio sobre el libro en memoria: la hoja de la operación se recorre
 * entera y las demás solo ven sus fórmulas reescritas. Con esto, comparar la
 * cuadrícula contra el libro sigue dando solo lo que la persona escribió.
 */
export function applyOpToWorkbook(wb: XLSX.WorkBook, op: SheetOp) {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    if (name !== op.sheet) {
      for (const key of Object.keys(ws)) {
        if (key.startsWith('!')) continue;
        const cell = ws[key] as XLSX.CellObject;
        if (!cell?.f) continue;
        const { r, c } = XLSX.utils.decode_cell(key);
        cell.f = shiftFormula(cell.f, op, { sheet: name, row: r + 1, col: c + 1 });
      }
      continue;
    }
    const rows = isRowOp(op);
    const next: XLSX.WorkSheet = {};
    let maxR = 0;
    let maxC = 0;
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue;
      const { r, c } = XLSX.utils.decode_cell(key);
      const nr = rows ? shiftIndex(r + 1, op) : r + 1;
      const nc = rows ? c + 1 : shiftIndex(c + 1, op);
      if (nr === null || nc === null) continue;
      const cell = { ...(ws[key] as XLSX.CellObject) };
      if (cell.f) cell.f = shiftFormula(cell.f, op, { sheet: name, row: r + 1, col: c + 1 });
      next[XLSX.utils.encode_cell({ r: nr - 1, c: nc - 1 })] = cell;
      maxR = Math.max(maxR, nr - 1);
      maxC = Math.max(maxC, nc - 1);
    }
    const merges = ((ws['!merges'] as Merge[] | undefined) ?? [])
      .map((m) => shiftMerge(m, op))
      .filter((m): m is Merge => !!m);
    if (merges.length) next['!merges'] = merges;
    const lines = (rows ? ws['!rows'] : ws['!cols']) as unknown[] | undefined;
    if (Array.isArray(lines)) {
      const copy = lines.slice();
      if (isInsertOp(op)) copy.splice(op.at - 1, 0, ...Array(op.count).fill(undefined));
      else copy.splice(op.at - 1, op.count);
      next[rows ? '!rows' : '!cols'] = copy as never;
      next[rows ? '!cols' : '!rows'] = (rows ? ws['!cols'] : ws['!rows']) as never;
    } else {
      if (ws['!cols']) next['!cols'] = ws['!cols'];
      if (ws['!rows']) next['!rows'] = ws['!rows'];
    }
    next['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    wb.Sheets[name] = next;
  }
}

export function shiftMerge(m: Merge, op: SheetOp): Merge | null {
  const rows = isRowOp(op);
  const span = rows ? shiftSpan(m.s.r + 1, m.e.r + 1, op) : shiftSpan(m.s.c + 1, m.e.c + 1, op);
  if (!span) return null;
  const next: Merge = rows
    ? { s: { r: span[0] - 1, c: m.s.c }, e: { r: span[1] - 1, c: m.e.c } }
    : { s: { r: m.s.r, c: span[0] - 1 }, e: { r: m.e.r, c: span[1] - 1 } };
  return next.s.r === next.e.r && next.s.c === next.e.c ? null : next;
}

/* ── Estilo leído del servidor ────────────────────────────────────────── */

/** Qué tan «especial» se ve una fila/columna: relleno, negritas, combinadas. */
function lineWeight(layout: ServerLayout | undefined, index: number, rows: boolean): number {
  if (!layout) return 0;
  let score = 0;
  for (const cell of layout.cells) {
    if ((rows ? cell.row : cell.col) !== index) continue;
    const fill = (cell.fill || '').toLowerCase();
    if (fill && fill !== '#ffffff' && fill !== '#fff') score += 2;
    if (cell.bold) score += 1;
    if ((rows ? cell.colSpan : cell.rowSpan) > 1) score += 1;
  }
  return score;
}

/**
 * De qué vecina toma el formato lo insertado. Como Excel, de la anterior —
 * salvo que la anterior sea un encabezado o un TOTAL (relleno, negritas) y la
 * siguiente un renglón normal: un concepto nuevo debe verse como concepto.
 */
export function pickStyleFrom(
  layout: ServerLayout | undefined,
  at: number,
  rows: boolean,
  size: number,
): 'before' | 'after' | 'none' {
  const hasBefore = at > 1;
  const hasAfter = at <= size;
  if (!hasBefore && !hasAfter) return 'none';
  if (!hasBefore) return 'after';
  if (!hasAfter) return 'before';
  return lineWeight(layout, at, rows) < lineWeight(layout, at - 1, rows) ? 'after' : 'before';
}

/** El estilo del servidor, recorrido igual que el libro. */
export function applyOpToLayout(layout: ServerLayout | undefined, op: SheetOp): ServerLayout | undefined {
  if (!layout) return layout;
  const rows = isRowOp(op);
  const cells: ServerCell[] = [];
  for (const cell of layout.cells) {
    const start = rows ? cell.row : cell.col;
    const end = start + (rows ? cell.rowSpan : cell.colSpan) - 1;
    const span = shiftSpan(start, end, op);
    if (!span) continue;
    cells.push(
      rows
        ? { ...cell, row: span[0], rowSpan: span[1] - span[0] + 1 }
        : { ...cell, col: span[0], colSpan: span[1] - span[0] + 1 },
    );
  }
  if (isInsertOp(op) && op.styleFrom && op.styleFrom !== 'none') {
    const source = op.styleFrom === 'after' ? op.at : op.at - 1;
    for (const cell of layout.cells) {
      if ((rows ? cell.row : cell.col) !== source || (rows ? cell.rowSpan : cell.colSpan) !== 1) continue;
      for (let k = 0; k < op.count; k += 1) {
        // Como en el servidor: el formato sí, las combinadas no.
        cells.push(
          rows
            ? { ...cell, row: op.at + k, colSpan: 1, rowSpan: 1 }
            : { ...cell, col: op.at + k, colSpan: 1, rowSpan: 1 },
        );
      }
    }
  }
  let colWidths = layout.colWidths;
  if (!rows) {
    colWidths = colWidths.slice();
    if (isInsertOp(op)) {
      const source = op.styleFrom === 'after' ? op.at : op.at - 1;
      const width = colWidths[source - 1] ?? 0;
      colWidths.splice(op.at - 1, 0, ...Array(op.count).fill(op.styleFrom === 'none' ? 0 : width));
    } else {
      colWidths.splice(op.at - 1, op.count);
    }
  }
  return { colWidths, cells };
}

/** Anchos en pantalla (px), recorridos igual. */
export function applyOpToWidths(widths: number[], op: SheetOp, fallback: number): number[] {
  if (isRowOp(op)) return widths;
  const out = widths.slice();
  if (isInsertOp(op)) {
    const source = op.styleFrom === 'after' ? op.at : op.at - 1;
    const width = op.styleFrom === 'none' ? fallback : out[source - 1] ?? fallback;
    out.splice(op.at - 1, 0, ...Array(op.count).fill(width));
  } else {
    out.splice(op.at - 1, op.count);
  }
  return out;
}

/* ── Celdas pendientes de guardar ─────────────────────────────────────── */

/**
 * Lo editado antes de la operación se guarda DESPUÉS de ella en el servidor
 * (primero filas/columnas, luego celdas), así que sus direcciones y fórmulas
 * se pasan a las posiciones nuevas.
 */
export function applyOpToPending(
  pending: Map<string, Map<string, CellChange>>,
  op: SheetOp,
): Map<string, Map<string, CellChange>> {
  const out = new Map<string, Map<string, CellChange>>();
  for (const [sheet, bySheet] of pending) {
    const next = new Map<string, CellChange>();
    for (const change of bySheet.values()) {
      const ref = sheet === op.sheet ? shiftCellRef(change.ref, op) : change.ref;
      if (!ref) continue;
      const old = XLSX.utils.decode_cell(change.ref);
      const formula = change.formula
        ? shiftFormula(change.formula, op, { sheet, row: old.r + 1, col: old.c + 1 })
        : change.formula;
      next.set(ref, { ...change, ref, ...(change.formula ? { formula } : {}) });
    }
    out.set(sheet, next);
  }
  return out;
}

/* ── Copiar y pegar ───────────────────────────────────────────────────── */

/** Texto con tabuladores (lo que copia Excel o Google Sheets) → filas de celdas. */
export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  return lines.map((line) => line.split('\t'));
}

export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => v.replace(/[\t\n\r]+/g, ' ')).join('\t')).join('\n');
}
