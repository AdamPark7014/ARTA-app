import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { formulaOfCell } from './sheet-layout';
import {
  isInsertOp,
  isRowOp,
  sheetOpProblem,
  shiftFormula,
  shiftIndex,
  shiftRangeRef,
  shiftSqref,
  type SheetOp,
} from './sheet-ops';

/**
 * Inserta o elimina filas/columnas en el `.xlsx` real moviendo TODO junto:
 * valores, formato de cada celda, alto de filas / ancho de columnas, celdas
 * combinadas, fórmulas (de esta hoja y de las que apuntan a ella), formato
 * condicional, validaciones, imágenes y nombres definidos.
 *
 * No se usa `spliceRows` de ExcelJS: mueve valores y estilos pero deja las
 * combinadas a medias y no toca las fórmulas — justo lo que «desordenaba» la
 * campaña (correcciones 30-09-2026). Aquí se toma una foto de la hoja, se
 * limpia y se vuelve a escribir cada cosa en su lugar nuevo.
 */

type Snapshot = {
  row: number;
  col: number;
  value: ExcelJS.CellValue;
  style: Partial<ExcelJS.Style>;
  note?: ExcelJS.Cell['note'];
};

type LineMeta = { size?: number; hidden?: boolean; outlineLevel?: number };

function isFormulaValue(v: unknown): v is { formula?: string; sharedFormula?: string; result?: unknown } {
  return !!v && typeof v === 'object' && ('formula' in (v as object) || 'sharedFormula' in (v as object));
}

const clone = <T>(v: T): T => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

/** Fórmulas de toda la hoja en forma explícita (las compartidas se expanden). */
function explicitFormulas(ws: ExcelJS.Worksheet): Map<string, { formula: string; result: unknown }> {
  const out = new Map<string, { formula: string; result: unknown }>();
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const v = cell.value;
      if (!isFormulaValue(v)) return;
      const formula = formulaOfCell(ws, r, c);
      if (formula) out.set(`${r}:${c}`, { formula, result: (v as { result?: unknown }).result });
    });
  });
  return out;
}

const formulaValue = (formula: string, result: unknown): ExcelJS.CellValue =>
  ({ formula, ...(result === undefined ? {} : { result }) }) as ExcelJS.CellValue;

/** Las fórmulas de otra hoja que apuntan a la hoja de la operación. */
function shiftOtherSheet(other: ExcelJS.Worksheet, op: SheetOp) {
  const formulas = explicitFormulas(other);
  const next = new Map<string, string>();
  for (const [key, { formula }] of formulas) {
    const [r, c] = key.split(':').map(Number);
    const shifted = shiftFormula(formula, op, { sheet: other.name, row: r, col: c });
    if (shifted !== formula) next.set(key, shifted);
  }
  if (!next.size) return;
  // Una compartida que cambia rompe a sus hijas: toda la hoja pasa a fórmulas explícitas.
  for (const [key, { formula, result }] of formulas) {
    const [r, c] = key.split(':').map(Number);
    other.getCell(r, c).value = formulaValue(next.get(key) ?? formula, result);
  }
}

function lastColumn(ws: ExcelJS.Worksheet): number {
  let max = Math.max(ws.columnCount, ws.columns?.length ?? 0);
  ws.eachRow({ includeEmpty: true }, (row) => {
    max = Math.max(max, row.cellCount);
  });
  return max;
}

function shiftAnchor(anchor: { nativeRow: number; nativeCol: number } | undefined, op: SheetOp) {
  if (!anchor) return;
  const key = isRowOp(op) ? 'nativeRow' : 'nativeCol';
  const index = anchor[key] + 1; // 0-based → 1-based
  const shifted = shiftIndex(index, op);
  anchor[key] = (shifted ?? op.at) - 1;
}

export function applySheetOp(wb: ExcelJS.Workbook, op: SheetOp) {
  const problem = sheetOpProblem(op);
  if (problem) throw new BadRequestException(problem);
  const ws = wb.getWorksheet(op.sheet);
  if (!ws) throw new BadRequestException(`La hoja «${op.sheet}» no existe en el libro`);
  const rows = isRowOp(op);
  const insert = isInsertOp(op);

  for (const other of wb.worksheets) if (other !== ws) shiftOtherSheet(other, op);

  // ── Foto de la hoja ────────────────────────────────────────────────────
  const merges = [...(ws.model.merges ?? [])];
  for (const range of merges) ws.unMergeCells(range);

  const formulas = explicitFormulas(ws);
  const cells: Snapshot[] = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const f = formulas.get(`${r}:${c}`);
      cells.push({
        row: r,
        col: c,
        value: f
          ? formulaValue(shiftFormula(f.formula, op, { sheet: ws.name, row: r, col: c }), f.result)
          : clone(cell.value),
        style: clone(cell.style) ?? {},
        note: cell.note ? clone(cell.note) : undefined,
      });
    });
  });

  const lines = new Map<number, LineMeta>();
  if (rows) {
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (row.height || row.hidden || row.outlineLevel) {
        lines.set(r, { size: row.height, hidden: row.hidden, outlineLevel: row.outlineLevel });
      }
    });
  } else {
    const last = lastColumn(ws);
    for (let c = 1; c <= last; c += 1) {
      const col = ws.getColumn(c);
      if (col.width || col.hidden || col.outlineLevel) {
        lines.set(c, { size: col.width, hidden: col.hidden, outlineLevel: col.outlineLevel });
      }
    }
  }

  // ── Limpiar ────────────────────────────────────────────────────────────
  for (const s of cells) {
    const cell = ws.getCell(s.row, s.col);
    cell.value = null;
    cell.style = {};
    if (s.note) cell.note = undefined as unknown as string;
  }
  for (const index of lines.keys()) {
    if (rows) {
      const row = ws.getRow(index);
      row.height = undefined as unknown as number;
      row.hidden = false;
      row.outlineLevel = 0;
    } else {
      const col = ws.getColumn(index);
      col.width = undefined;
      col.hidden = false;
      col.outlineLevel = 0;
    }
  }

  // ── Escribir cada cosa en su lugar nuevo ───────────────────────────────
  const moveTo = (row: number, col: number) =>
    rows ? ([shiftIndex(row, op), col] as const) : ([row, shiftIndex(col, op)] as const);

  for (const s of cells) {
    const [r, c] = moveTo(s.row, s.col);
    if (r === null || c === null) continue;
    const cell = ws.getCell(r, c);
    cell.style = s.style;
    cell.value = s.value;
    if (s.note) cell.note = s.note;
  }

  const placeLine = (index: number, meta: LineMeta) => {
    if (rows) {
      const row = ws.getRow(index);
      if (meta.size) row.height = meta.size;
      if (meta.hidden) row.hidden = true;
      if (meta.outlineLevel) row.outlineLevel = meta.outlineLevel;
    } else {
      const col = ws.getColumn(index);
      if (meta.size) col.width = meta.size;
      if (meta.hidden) col.hidden = true;
      if (meta.outlineLevel) col.outlineLevel = meta.outlineLevel;
    }
  };
  for (const [index, meta] of lines) {
    const next = shiftIndex(index, op);
    if (next !== null) placeLine(next, meta);
  }

  // Lo insertado se ve como su vecina (la que eligió el panel), sin sus valores.
  if (insert && op.styleFrom !== 'none') {
    const source = op.styleFrom === 'after' ? op.at : op.at - 1;
    if (source >= 1) {
      for (const s of cells) {
        if ((rows ? s.row : s.col) !== source) continue;
        for (let k = 0; k < op.count; k += 1) {
          const cell = rows ? ws.getCell(op.at + k, s.col) : ws.getCell(s.row, op.at + k);
          cell.style = clone(s.style);
        }
      }
      const meta = lines.get(source);
      if (meta?.size) for (let k = 0; k < op.count; k += 1) placeLine(op.at + k, { size: meta.size });
    }
  }

  for (const range of merges) {
    const next = shiftRangeRef(range, op);
    if (next && next.includes(':')) {
      const [a, b] = next.split(':');
      if (a !== b) ws.mergeCells(next);
    }
  }

  // ── Lo que vive fuera de las celdas ────────────────────────────────────
  const sheetRef = (ref: string) => shiftFormula(ref, op, { sheet: ws.name, row: 0, col: 0 });

  const wsx = ws as unknown as {
    conditionalFormattings?: Array<{ ref: string; rules?: Array<{ formulae?: string[] }> }>;
    dataValidations?: { model: Record<string, { formulae?: unknown[] } & Record<string, unknown>> };
  };
  if (Array.isArray(wsx.conditionalFormattings)) {
    wsx.conditionalFormattings = wsx.conditionalFormattings
      .map((cf) => {
        const ref = shiftSqref(cf.ref, op);
        if (!ref) return null;
        const rules = (cf.rules ?? []).map((rule) =>
          Array.isArray(rule.formulae) ? { ...rule, formulae: rule.formulae.map((f) => sheetRef(String(f))) } : rule,
        );
        return { ...cf, ref, rules };
      })
      .filter((cf): cf is NonNullable<typeof cf> => !!cf);
  }
  if (wsx.dataValidations?.model) {
    const next: Record<string, { formulae?: unknown[] } & Record<string, unknown>> = {};
    for (const [key, rule] of Object.entries(wsx.dataValidations.model)) {
      const ref = shiftSqref(key, op);
      if (!ref) continue;
      next[ref] = Array.isArray(rule.formulae)
        ? { ...rule, formulae: rule.formulae.map((f) => (typeof f === 'string' ? sheetRef(f) : f)) }
        : rule;
    }
    wsx.dataValidations.model = next;
  }

  for (const image of ws.getImages()) {
    const range = image.range as unknown as {
      tl?: { nativeRow: number; nativeCol: number };
      br?: { nativeRow: number; nativeCol: number };
    };
    shiftAnchor(range.tl, op);
    shiftAnchor(range.br, op);
  }

  const names = wb.definedNames as unknown as {
    spliceRows?: (sheet: string, start: number, del: number, ins: number) => void;
    spliceColumns?: (sheet: string, start: number, del: number, ins: number) => void;
  };
  const splice = rows ? names.spliceRows : names.spliceColumns;
  splice?.call(wb.definedNames, ws.name, op.at, insert ? 0 : op.count, insert ? op.count : 0);

  if (typeof ws.pageSetup?.printArea === 'string' && ws.pageSetup.printArea) {
    const area = ws.pageSetup.printArea
      .split(',')
      .map((r) => shiftRangeRef(r.replace(/\$/g, ''), op))
      .filter(Boolean)
      .join(',');
    ws.pageSetup.printArea = area || undefined;
  }
  if (typeof ws.autoFilter === 'string' && ws.autoFilter) {
    ws.autoFilter = shiftRangeRef(ws.autoFilter, op) ?? (undefined as unknown as string);
  }
}

/** «2 filas insertadas», «1 columna eliminada». */
export function describeSheetOp(op: Pick<SheetOp, 'kind' | 'count'>): string {
  const one = op.count === 1;
  const noun = isRowOp(op) ? (one ? 'fila' : 'filas') : one ? 'columna' : 'columnas';
  const verb = isInsertOp(op) ? (one ? 'insertada' : 'insertadas') : one ? 'eliminada' : 'eliminadas';
  return `${op.count} ${noun} ${verb}`;
}
