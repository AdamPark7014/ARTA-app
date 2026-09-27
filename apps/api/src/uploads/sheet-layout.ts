import type * as ExcelJS from 'exceljs';

/**
 * De un libro de ExcelJS a un modelo de hoja listo para imprimir.
 *
 * Es lo que le faltaba a la salida en PDF de los Excel embebidos: el exportador
 * anterior recorría celda por celda y pintaba el valor de cada una, así que
 * una celda combinada («DISTRIBUCIÓN PENDONES CHOLULA» en A1:E5) salía
 * repetida 25 veces, los anchos eran todos iguales, no había negritas ni
 * rellenos, y las fórmulas sin resultado guardado salían vacías.
 *
 * Aquí se resuelve todo eso una vez, sin pdfkit de por medio, para poder
 * probarlo con los libros base del cliente (`assets/format-sources`).
 */

export type CellBox = {
  /** Índices base 1 de la celda maestra. */
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  bold: boolean;
  italic: boolean;
  /** Puntos, ya con la escala de la hoja. */
  fontSize: number;
  color: string;
  fill: string | null;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  /** Excel deja que un texto largo se desborde sobre celdas vacías a la derecha. */
  overflow: boolean;
  border: { top?: BorderLine; right?: BorderLine; bottom?: BorderLine; left?: BorderLine };
};

export type BorderLine = { width: number; color: string };

export type SheetImage = {
  buffer: Buffer;
  extension: string;
  /** Celda ancla (base 0) y desplazamiento dentro de ella, en puntos sin escalar. */
  row: number;
  col: number;
  dx: number;
  dy: number;
  /** Posición absoluta en la hoja sin escalar (referencia; el dibujo usa el ancla). */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SheetModel = {
  name: string;
  /** Ancho de cada columna en puntos (índice 0 = columna A). */
  colWidths: number[];
  /** Alto de cada fila en puntos (índice 0 = fila 1). */
  rowHeights: number[];
  cells: CellBox[];
  images: SheetImage[];
  totalWidth: number;
  totalHeight: number;
  /** Orientación pedida por el propio libro, si la trae. */
  orientation: 'portrait' | 'landscape' | null;
};

/* ── Colores del tema de Office (los que Excel usa por defecto) ────────── */

const THEME_COLORS = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];

const DEFAULT_ROW_HEIGHT = 15;
const DEFAULT_COL_WIDTH_CHARS = 8.43;
const MAX_ROWS = 400;
const MAX_COLS = 26;
const EMU_PER_PX = 9525;
const PX_TO_PT = 0.75;

function argbToHex(argb: string | undefined): string | null {
  if (!argb) return null;
  const hex = argb.length === 8 ? argb.slice(2) : argb.length === 6 ? argb : null;
  return hex ? `#${hex.toUpperCase()}` : null;
}

function colorOf(c: Partial<ExcelJS.Color> | undefined): string | null {
  if (!c) return null;
  if (c.argb) return argbToHex(c.argb);
  if (typeof c.theme === 'number') {
    const base = THEME_COLORS[c.theme] ?? null;
    if (!base) return null;
    const tint = (c as { tint?: number }).tint;
    return typeof tint === 'number' && tint !== 0 ? applyTint(base, tint) : base;
  }
  return null;
}

/** Tinte de Office: >0 aclara hacia blanco, <0 oscurece hacia negro. */
function applyTint(hex: string, tint: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const t = tint > 0 ? v + (255 - v) * tint : v * (1 + tint);
    return Math.max(0, Math.min(255, Math.round(t)));
  });
  return `#${ch.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ancho de columna de Excel (en caracteres) → puntos. */
export function colWidthPt(chars: number | undefined): number {
  const w = typeof chars === 'number' && chars > 0 ? chars : DEFAULT_COL_WIDTH_CHARS;
  // Fórmula de Excel: px = trunc((chars * 7 + 5) / 7 * 256) / 256 * 7 ≈ chars*7+5 con Calibri 11.
  return Math.round((w * 7 + 5) * PX_TO_PT * 100) / 100;
}

/* ── Referencias A1 ────────────────────────────────────────────────────── */

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(index: number): string {
  let n = index;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function parseRef(ref: string): { row: number; col: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(ref.trim());
  return m ? { col: colToIndex(m[1]), row: Number(m[2]) } : null;
}

export function parseRange(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const [a, b] = range.split(':');
  const p = parseRef(a);
  const q = b ? parseRef(b) : p;
  if (!p || !q) return null;
  return {
    r1: Math.min(p.row, q.row),
    c1: Math.min(p.col, q.col),
    r2: Math.max(p.row, q.row),
    c2: Math.max(p.col, q.col),
  };
}

/**
 * Traslada una fórmula compartida al desplazamiento de otra celda, como hace
 * Excel: `SUM(C8:C17)` escrita en C18 y compartida en D18 es `SUM(D8:D17)`.
 * Las referencias con `$` no se mueven. Las cadenas entre comillas se respetan.
 */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  return formula.replace(/("[^"]*")|(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/gi, (m, quoted, cAbs, col, rAbs, row) => {
    if (quoted) return quoted;
    const c = cAbs ? colToIndex(col) : colToIndex(col) + dCol;
    const r = rAbs ? Number(row) : Number(row) + dRow;
    if (c < 1 || r < 1) return m;
    return `${cAbs}${indexToCol(c)}${rAbs}${r}`;
  });
}

/* ── Formato de números ────────────────────────────────────────────────── */

const MX = 'es-MX';

export function formatNumber(value: number, numFmt: string | undefined): string {
  const fmt = numFmt || '';
  if (!Number.isFinite(value)) return '';
  if (/%/.test(fmt)) {
    const decimals = (/0\.(0+)%/.exec(fmt)?.[1] || '').length;
    return `${(value * 100).toLocaleString(MX, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
  }
  if (/\$|\[\$/.test(fmt)) {
    return value.toLocaleString(MX, { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (/0\.00/.test(fmt)) {
    return value.toLocaleString(MX, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (/#,##0|0/.test(fmt) && !/\./.test(fmt) && fmt !== 'General' && fmt !== '') {
    return Math.round(value).toLocaleString(MX);
  }
  if (Number.isInteger(value)) return value.toLocaleString(MX);
  return value.toLocaleString(MX, { maximumFractionDigits: 2 });
}

function formatDate(d: Date, numFmt: string | undefined): string {
  if (Number.isNaN(d.getTime())) return '';
  if (/h|s/i.test(numFmt || '') && !/^d|^m|^y/i.test(numFmt || '')) {
    return d.toLocaleTimeString(MX, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
  return d.toLocaleDateString(MX, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

/* ── Valores y fórmulas ────────────────────────────────────────────────── */

type RawValue = ExcelJS.CellValue;

type Resolver = {
  /** Valor crudo de una celda (con fórmulas ya resueltas a su resultado). */
  valueAt: (row: number, col: number) => string | number | boolean | Date | null;
};

function isFormulaValue(v: RawValue): v is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return !!v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);
}

function plainOf(v: RawValue): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof (v as ExcelJS.CellHyperlinkValue).text === 'string') return (v as ExcelJS.CellHyperlinkValue).text;
    if ('error' in v) return String((v as ExcelJS.CellErrorValue).error);
    if ('result' in v && v.result !== undefined && v.result !== null) {
      const r = v.result as unknown;
      if (typeof r === 'object' && r && 'error' in (r as object)) return null;
      return r as string | number | boolean | Date;
    }
  }
  return null;
}

/**
 * Evaluador de fórmulas para las celdas editadas en el panel (el servidor
 * guarda la fórmula sin resultado). Usa `fast-formula-parser` si está; si
 * algo no se puede calcular, la celda sale vacía en vez de tumbar el PDF.
 */
export class FormulaResolver implements Resolver {
  private memo = new Map<string, string | number | boolean | Date | null>();
  private stack = new Set<string>();
  private parser: { parse: (f: string, pos: { row: number; col: number; sheet: string }) => unknown } | null = null;

  constructor(
    private ws: ExcelJS.Worksheet,
    private formulaOf: (row: number, col: number) => string | null,
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FormulaParser = require('fast-formula-parser');
      this.parser = new FormulaParser({
        onCell: ({ row, col }: { row: number; col: number }) => this.numericOrText(row, col),
        onRange: ({ from, to }: { from: { row: number; col: number }; to: { row: number; col: number } }) => {
          const out: Array<Array<string | number | boolean | Date | null>> = [];
          for (let r = from.row; r <= Math.min(to.row, MAX_ROWS); r += 1) {
            const line: Array<string | number | boolean | Date | null> = [];
            for (let c = from.col; c <= Math.min(to.col, MAX_COLS); c += 1) line.push(this.numericOrText(r, c));
            out.push(line);
          }
          return out;
        },
      });
    } catch {
      this.parser = null;
    }
  }

  private numericOrText(row: number, col: number) {
    const v = this.valueAt(row, col);
    return v === null ? null : v;
  }

  valueAt(row: number, col: number): string | number | boolean | Date | null {
    const key = `${row}:${col}`;
    if (this.memo.has(key)) return this.memo.get(key)!;
    const cell = this.ws.getCell(row, col);
    const raw = cell.value;
    let out: string | number | boolean | Date | null;
    if (isFormulaValue(raw)) {
      const cached = plainOf(raw);
      if (cached !== null && cached !== '') {
        out = cached;
      } else {
        const formula = this.formulaOf(row, col);
        out = formula ? this.evaluate(formula, row, col, key) : null;
      }
    } else {
      out = plainOf(raw);
    }
    this.memo.set(key, out);
    return out;
  }

  private evaluate(formula: string, row: number, col: number, key: string) {
    if (!this.parser || this.stack.has(key)) return null;
    this.stack.add(key);
    try {
      const r = this.parser.parse(formula, { row, col, sheet: this.ws.name });
      if (typeof r === 'number' || typeof r === 'string' || typeof r === 'boolean') return r;
      if (r instanceof Date) return r;
      return null;
    } catch {
      return null;
    } finally {
      this.stack.delete(key);
    }
  }
}

/** Fórmula de una celda, resolviendo las compartidas por desplazamiento. */
export function formulaOfCell(ws: ExcelJS.Worksheet, row: number, col: number): string | null {
  const raw = ws.getCell(row, col).value;
  if (!isFormulaValue(raw)) return null;
  if ('formula' in raw && raw.formula) return raw.formula;
  if ('sharedFormula' in raw && raw.sharedFormula) {
    const master = parseRef(raw.sharedFormula);
    if (!master) return null;
    const masterRaw = ws.getCell(master.row, master.col).value;
    if (isFormulaValue(masterRaw) && 'formula' in masterRaw && masterRaw.formula) {
      return shiftFormula(masterRaw.formula, row - master.row, col - master.col);
    }
  }
  return null;
}

/* ── Modelo ────────────────────────────────────────────────────────────── */

export function buildSheetModel(ws: ExcelJS.Worksheet, workbook: ExcelJS.Workbook): SheetModel {
  const merges: Array<{ r1: number; c1: number; r2: number; c2: number }> = [];
  for (const m of (ws.model as { merges?: string[] }).merges ?? []) {
    const p = parseRange(m);
    if (p) merges.push(p);
  }
  const slave = new Set<string>();
  const masterOf = new Map<string, { r1: number; c1: number; r2: number; c2: number }>();
  for (const m of merges) {
    masterOf.set(`${m.r1}:${m.c1}`, m);
    for (let r = m.r1; r <= m.r2; r += 1) {
      for (let c = m.c1; c <= m.c2; c += 1) if (r !== m.r1 || c !== m.c1) slave.add(`${r}:${c}`);
    }
  }

  // Área usada: hasta la última fila y columna con contenido, borde, relleno o combinación.
  let lastRow = 0;
  let lastCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const has = plainOf(cell.value) !== null || isFormulaValue(cell.value) || hasBorder(cell) || !!fillOf(cell);
      if (has) {
        lastRow = Math.max(lastRow, r);
        lastCol = Math.max(lastCol, c);
      }
    });
  });
  for (const m of merges) {
    lastRow = Math.max(lastRow, m.r2);
    lastCol = Math.max(lastCol, m.c2);
  }
  lastRow = Math.min(lastRow, MAX_ROWS);
  lastCol = Math.min(lastCol, MAX_COLS);

  const colWidths: number[] = [];
  for (let c = 1; c <= lastCol; c += 1) {
    const column = ws.getColumn(c);
    colWidths.push(column.hidden ? 0 : colWidthPt(column.width));
  }
  const rowHeights: number[] = [];
  for (let r = 1; r <= lastRow; r += 1) {
    const row = ws.getRow(r);
    rowHeights.push(row.hidden ? 0 : typeof row.height === 'number' && row.height > 0 ? row.height : DEFAULT_ROW_HEIGHT);
  }

  const resolver = new FormulaResolver(ws, (r, c) => formulaOfCell(ws, r, c));
  const cells: CellBox[] = [];

  for (let r = 1; r <= lastRow; r += 1) {
    for (let c = 1; c <= lastCol; c += 1) {
      const key = `${r}:${c}`;
      if (slave.has(key)) continue;
      const cell = ws.getCell(r, c);
      const merged = masterOf.get(key);
      const value = resolver.valueAt(r, c);
      const text = displayValue(value, cell.numFmt);
      const fill = fillOf(cell);
      const border = borderOf(cell, merged ? ws.getCell(merged.r2, merged.c2) : null);
      if (!text && !fill && !hasAnySide(border)) continue;

      const font = cell.font || {};
      const fontColor = colorOf(font.color) ?? (fill && luminance(fill) < 0.45 ? '#FFFFFF' : '#111114');
      const numeric = typeof value === 'number' || value instanceof Date;
      const horizontal = cell.alignment?.horizontal;
      const align: CellBox['align'] =
        horizontal === 'center' || horizontal === 'centerContinuous'
          ? 'center'
          : horizontal === 'right'
            ? 'right'
            : horizontal === 'left'
              ? 'left'
              : numeric
                ? 'right'
                : 'left';
      const vertical = cell.alignment?.vertical;
      const valign: CellBox['valign'] = vertical === 'top' ? 'top' : vertical === 'middle' ? 'middle' : merged ? 'middle' : 'bottom';

      // Desborde a la derecha: texto sin ajuste, alineado a la izquierda, con vecinas vacías.
      let overflow = false;
      if (!merged && !cell.alignment?.wrapText && align === 'left' && typeof value === 'string' && c < lastCol) {
        const right = ws.getCell(r, c + 1);
        overflow = plainOf(right.value) === null && !isFormulaValue(right.value) && !slave.has(`${r}:${c + 1}`);
      }

      cells.push({
        row: r,
        col: c,
        rowSpan: merged ? merged.r2 - merged.r1 + 1 : 1,
        colSpan: merged ? merged.c2 - merged.c1 + 1 : 1,
        text,
        bold: !!font.bold,
        italic: !!font.italic,
        fontSize: Math.max(6, Math.min(20, typeof font.size === 'number' ? font.size : 11)),
        color: fontColor,
        fill,
        align,
        valign,
        wrap: !!cell.alignment?.wrapText || (!!merged && (merged.r2 > merged.r1 || text.length > 40)),
        overflow,
        border,
      });
    }
  }

  const colOffsets = prefix(colWidths);
  const rowOffsets = prefix(rowHeights);
  const images: SheetImage[] = [];
  for (const img of ws.getImages()) {
    const media = workbook.getImage(Number(img.imageId));
    if (!media?.buffer || !/^(png|jpe?g)$/i.test(media.extension || '')) continue;
    const tl = img.range.tl;
    const col = Math.floor(tl.nativeCol ?? (tl as { col?: number }).col ?? 0);
    const row = Math.floor(tl.nativeRow ?? (tl as { row?: number }).row ?? 0);
    const dx = ((tl.nativeColOff ?? 0) / EMU_PER_PX) * PX_TO_PT;
    const dy = ((tl.nativeRowOff ?? 0) / EMU_PER_PX) * PX_TO_PT;
    const x = (colOffsets[Math.min(col, colWidths.length)] ?? colOffsets[colWidths.length]) + dx;
    const y = (rowOffsets[Math.min(row, rowHeights.length)] ?? rowOffsets[rowHeights.length]) + dy;
    const ext = (img.range as { ext?: { width?: number; height?: number } }).ext;
    let w = (ext?.width ?? 0) * PX_TO_PT;
    let h = (ext?.height ?? 0) * PX_TO_PT;
    if (!w || !h) {
      const br = img.range.br as { nativeCol?: number; nativeRow?: number } | undefined;
      if (br && typeof br.nativeCol === 'number' && typeof br.nativeRow === 'number') {
        w = (colOffsets[Math.min(br.nativeCol, colWidths.length)] ?? 0) - x;
        h = (rowOffsets[Math.min(br.nativeRow, rowHeights.length)] ?? 0) - y;
      }
    }
    if (w > 4 && h > 4) images.push({ buffer: media.buffer as unknown as Buffer, extension: media.extension, row, col, dx, dy, x, y, w, h });
  }

  const setup = ws.pageSetup as { orientation?: string } | undefined;
  return {
    name: ws.name,
    colWidths,
    rowHeights,
    cells,
    images,
    totalWidth: colOffsets[colWidths.length] ?? 0,
    totalHeight: rowOffsets[rowHeights.length] ?? 0,
    orientation: setup?.orientation === 'landscape' ? 'landscape' : setup?.orientation === 'portrait' ? 'portrait' : null,
  };
}

function prefix(values: number[]): number[] {
  const out = [0];
  for (const v of values) out.push(out[out.length - 1] + v);
  return out;
}

function fillOf(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (!fill || fill.type !== 'pattern' || fill.pattern === 'none') return null;
  const color = colorOf(fill.fgColor);
  // Blanco no es relleno: es el fondo de la hoja.
  return color && color !== '#FFFFFF' ? color : null;
}

function borderSide(side: Partial<ExcelJS.Border> | undefined): BorderLine | undefined {
  if (!side?.style) return undefined;
  const width = /^(medium|thick|double)$/.test(side.style) ? (side.style === 'thick' ? 1.4 : 1) : 0.5;
  return { width, color: colorOf(side.color) ?? '#000000' };
}

function borderOf(cell: ExcelJS.Cell, lastOfMerge: ExcelJS.Cell | null): CellBox['border'] {
  const b = cell.border || {};
  const tail = lastOfMerge?.border || {};
  return {
    top: borderSide(b.top),
    left: borderSide(b.left),
    right: borderSide(lastOfMerge ? tail.right : b.right),
    bottom: borderSide(lastOfMerge ? tail.bottom : b.bottom),
  };
}

function hasBorder(cell: ExcelJS.Cell): boolean {
  const b = cell.border;
  return !!b && !!(b.top?.style || b.left?.style || b.right?.style || b.bottom?.style);
}

function hasAnySide(border: CellBox['border']): boolean {
  return !!(border.top || border.left || border.right || border.bottom);
}

export function displayValue(value: string | number | boolean | Date | null, numFmt: string | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value, numFmt);
  if (typeof value === 'number') return formatNumber(value, numFmt);
  if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO';
  return String(value).replace(/\r/g, '').trim();
}
