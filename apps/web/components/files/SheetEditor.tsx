'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import FastFormulaParser from 'fast-formula-parser';
import { createEvaluator } from '@/lib/sheet-evaluator';
import type { SaveFile } from '@/lib/file-save';
import { api } from '@/lib/api';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { RevisionHistory } from '@/components/ui/RevisionHistory';
import { useSaveHotkey } from '@/lib/use-save-hotkey';
import { useDirtyGuard } from '@/lib/use-dirty-guard';
import { translateFormula, type SheetOp, type SheetOpKind } from '@/lib/sheet-ops';
import {
  applyOpToGrid,
  applyOpToLayout,
  applyOpToPending,
  applyOpToWidths,
  applyOpToWorkbook,
  parseTsv,
  pickStyleFrom,
  shiftMerge,
  toTsv,
  type CellChange,
  type Grid,
  type Merge,
  type ServerCell,
  type ServerLayout,
} from '@/lib/sheet-grid';

export type { CellChange } from '@/lib/sheet-grid';

/** Hojas agregadas o renombradas en el panel; el servidor las aplica antes que todo. */
export type SheetStructChange = { add: string } | { rename: { from: string; to: string } };

/** Lo que manda «Guardar»: hojas, luego filas/columnas, luego celdas (ya en su lugar final). */
export type SheetPatch = { cells: CellChange[]; ops?: SheetOp[]; sheets?: SheetStructChange[] };

type Props = {
  url: string;
  fileName: string;
  /** Id del EventFile — necesario para salir en PDF y ver historial. */
  fileId?: string;
  canEdit: boolean;
  /** Dónde se guarda el .xlsx reconstruido (respaldo si no hay guardado por celdas) */
  onSave: SaveFile;
  /**
   * Guardado por celdas: la vía buena. Si viene, se manda el delta (y las
   * filas/columnas insertadas o eliminadas) y el servidor lo aplica con
   * ExcelJS sin degradar el resto del libro.
   */
  onSaveCells?: (patch: SheetPatch) => Promise<void>;
  /** `false` cuando el libro trae gráficas o tablas dinámicas. */
  panelEditable?: boolean;
  /** Por qué no se puede editar, para poder explicárselo a la persona. */
  blockReason?: string | null;
  /** Se llama tras guardar, para refrescar la lista de quien lo muestra */
  onSaved?: () => void | Promise<void>;
  /** Campaña y corrida: atajos propios (concepto nuevo con las fórmulas de su vecino). */
  variant?: 'default' | 'campaign' | 'finance';
};

type Pos = { r: number; c: number };
type Area = { r1: number; c1: number; r2: number; c2: number };
type Menu = { x: number; y: number; target: 'cell' | 'row' | 'col' };
type Snapshot =
  | { kind: 'grid'; grid: Grid }
  | {
      kind: 'full';
      grid: Grid;
      sheets: XLSX.WorkBook['Sheets'];
      layout: ServerLayout | undefined;
      colPx: number[];
      merges: Merge[];
      ops: SheetOp[];
      pending: Map<string, Map<string, CellChange>>;
    };

/** Ancho mínimo para calcular anchos de columna; la cuadrícula muestra solo lo escrito. */
const MIN_COLS = 9;
const ROW_PAGE = 120;
const DEFAULT_COL_PX = 104;
const HISTORY_MAX = 40;

/** 0 → A, 25 → Z, 26 → AA … */
function colLabel(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Recorta filas y columnas vacías del final: el libro guarda un rango
 * (`!ref`) que suele ir más allá de lo escrito y llenaba la cuadrícula de
 * celdas en blanco. Adam (27-09): «muestra solo las casillas escritas en el
 * Excel, con posibilidad de ampliarse».
 */
function trimGrid(rows: unknown[][]): unknown[][] {
  const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
  let height = rows.length;
  while (height > 0 && !rows[height - 1].some(filled)) height -= 1;
  let width = 0;
  for (let r = 0; r < height; r += 1) {
    const row = rows[r];
    for (let c = row.length - 1; c >= width; c -= 1) {
      if (filled(row[c])) {
        width = c + 1;
        break;
      }
    }
  }
  return rows.slice(0, height).map((r) => r.slice(0, width));
}

function padGrid(rows: unknown[][], minRows: number, minCols: number): Grid {
  const width = Math.max(minCols, ...rows.map((r) => r.length), 1);
  const height = Math.max(minRows, rows.length);
  const out: Grid = [];
  for (let r = 0; r < height; r += 1) {
    const row: string[] = [];
    for (let c = 0; c < width; c += 1) {
      const raw = rows[r]?.[c];
      row.push(raw === undefined || raw === null ? '' : String(raw));
    }
    out.push(row);
  }
  return out;
}

/** "12,5", "1,000" y "$ 1,000.50" también son números para quien captura en español. */
function toCellValue(text: string): { v: string | number; t: 's' | 'n' } {
  const trimmed = text.trim();
  if (!trimmed) return { v: '', t: 's' };
  if (trimmed.startsWith('=')) return { v: trimmed, t: 's' };
  let s = trimmed.replace(/[\s ]/g, '').replace(/[\$£€¥%]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.replace(/,/g, '');
  } else if (hasComma) {
    // «1,000» es un millar (así lo pinta la propia hoja); «12,5» es un decimal.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  // Paréntesis para negativos: (123.45) → -123.45
  s = s.replace(/^\((.*)\)$/, '-$1');
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return { v: n, t: 'n' };
  }
  return { v: text, t: 's' };
}

function numberOf(text: string): number | null {
  const { v, t } = toCellValue(text);
  return t === 'n' ? (v as number) : null;
}

const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function areaOf(a: Pos, b: Pos): Area {
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
}

function clonePending(p: Map<string, Map<string, CellChange>>) {
  return new Map([...p].map(([k, v]) => [k, new Map([...v].map(([ref, ch]) => [ref, { ...ch }]))]));
}

/**
 * Hoja de cálculo editable dentro del panel, que se maneja como Excel.
 *
 * Correcciones 30-09-2026 (Campañas): «el formato de edición es confuso, no
 * permite agregar columnas ni filas de manera sencilla sin que mueva todo el
 * orden; que se parezca lo más posible a Excel». Ahora:
 * - un clic selecciona la celda y lo que se escribe la reemplaza; doble clic
 *   (o F2) edita dentro; flechas, Enter y Tab mueven; Supr vacía;
 * - Mayús+clic, Mayús+flechas o arrastrar seleccionan un rango; la barra de
 *   abajo suma lo seleccionado;
 * - clic derecho en una celda, en el número de fila o en la letra de columna
 *   inserta o elimina filas/columnas — y lo insertado mueve TAMBIÉN el
 *   formato, las celdas combinadas y las fórmulas (`lib/sheet-ops.ts`, la
 *   misma regla que aplica el servidor al guardar);
 * - Ctrl+C / Ctrl+V con Excel o Google Sheets, Ctrl+Z / Ctrl+Y, Ctrl+D.
 *
 * Sobre lo que se conserva: se manda al servidor solo lo tocado (celdas y
 * filas/columnas) y ExcelJS lo aplica sobre el archivo real; lo que nadie tocó
 * sobrevive tal cual.
 */
export function SheetEditor({
  url,
  fileName,
  fileId,
  canEdit: canEditProp,
  onSave,
  onSaveCells,
  onSaved,
  panelEditable = true,
  blockReason,
  variant = 'default',
}: Props) {
  // Un libro con gráficas se ve, pero no se edita: el round-trip las perdería.
  const canEdit = canEditProp && panelEditable;
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  /**
   * Celdas tocadas desde que se abrió el archivo, por hoja. Es lo que se manda
   * al servidor: un delta, no un libro reconstruido (SheetJS Community tira
   * formato condicional y validaciones de TODO el libro al escribirlo).
   */
  const pendingCellsRef = useRef<Map<string, Map<string, CellChange>>>(new Map());
  /** Filas/columnas insertadas o eliminadas, en orden; el servidor las aplica antes que las celdas. */
  const pendingOpsRef = useRef<SheetOp[]>([]);
  const pendingSheetsRef = useRef<SheetStructChange[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [grid, setGridState] = useState<Grid>([]);
  /** Espejo síncrono de `grid`: las operaciones encadenadas no esperan al render. */
  const gridRef = useRef<Grid>([]);
  const [visibleRows, setVisibleRows] = useState(ROW_PAGE);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [revKey, setRevKey] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  /** Celda activa (la que tiene el foco). */
  const [sel, setSel] = useState<Pos | null>(null);
  /** Otra esquina del rango seleccionado (igual a `sel` si es una sola celda). */
  const [extent, setExtent] = useState<Pos | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  const campaign = variant === 'campaign';
  const finance = variant === 'finance';
  const [colPx, setColPx] = useState<number[]>([]);
  /** Anchos que la persona arrastró en esta sesión (no se guardan en el archivo). */
  const [colOverride, setColOverride] = useState<Record<number, number>>({});
  const [merges, setMerges] = useState<Merge[]>([]);
  /** Estilo real por hoja (nombre → layout), leído del servidor una vez por libro/hoja. */
  const [serverLayouts, setServerLayouts] = useState<Record<string, ServerLayout>>({});
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [, setHistoryTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  /** Arrastre para seleccionar: celdas, filas o columnas. */
  const dragRef = useRef<null | 'cell' | 'row' | 'col'>(null);
  /** Al enfocar por teclado o clic simple se selecciona todo el texto: escribir reemplaza, como en Excel. */
  const focusTargetRef = useRef<{ pos: Pos; selectAll: boolean; keepExtent: boolean } | null>(null);
  /** Cómo estaba la celda al entrar: Esc la regresa y el primer cambio deja punto de deshacer. */
  const focusInfoRef = useRef<{ pos: Pos; value: string; grid: Grid; changed: boolean } | null>(null);
  const clipRef = useRef<{ tsv: string; raw: string[][]; r: number; c: number } | null>(null);
  /** Celda cuyo texto hay que dejar seleccionado tras el próximo render. */
  const selectAllRef = useRef<Pos | null>(null);

  const commitGrid = useCallback((next: Grid) => {
    gridRef.current = next;
    setGridState(next);
  }, []);

  /**
   * Grid de presentación: muestra valores calculados y cacheados.
   * La celda enfocada sigue mostrando el `grid` crudo con "=…".
   */
  const displayGrid: Grid = useMemo(() => {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return grid;
    const ws = wb.Sheets[activeSheet];
    const parser = new (FastFormulaParser as any)();
    const evaluator = createEvaluator(wb as unknown as XLSX.WorkBook, activeSheet, grid);
    const normalizeFormulaName = (s: string) => {
      const map: Record<string, string> = {
        SUMA: 'SUM',
        PROMEDIO: 'AVERAGE',
        MIN: 'MIN',
        MAX: 'MAX',
        SI: 'IF',
        REDONDEAR: 'ROUND',
      };
      let out = s;
      for (const [es, en] of Object.entries(map)) {
        out = out.replace(new RegExp(`\\b${es}\\b`, 'g'), en);
      }
      return out;
    };
    const out: Grid = [];
    for (let r = 0; r < grid.length; r += 1) {
      const row: string[] = [];
      for (let c = 0; c < (grid[r]?.length || 0); c += 1) {
        const raw = grid[r]?.[c] ?? '';
        if (typeof raw === 'string' && raw.trim().startsWith('=')) {
          try {
            (parser as any).position = { sheet: activeSheet, row: r + 1, col: c + 1 };
            (parser as any).onCell = (ref: { sheet?: string; row: number; col: number }) => {
              const s = ref.sheet ?? activeSheet;
              const rr = ref.row - 1;
              const cc = ref.col - 1;
              if (s === activeSheet) {
                const v = grid[rr]?.[cc] ?? '';
                if (typeof v === 'string' && v.trim().startsWith('=')) {
                  (parser as any).position = { sheet: s, row: rr + 1, col: cc + 1 };
                  const inner = (parser as any).parse(String(v).replace(/^=/, ''));
                  return typeof inner === 'number' ? inner : Number(inner) || 0;
                }
                const { v: nv, t } = toCellValue(String(v));
                return t === 'n' ? (nv as number) : Number(nv) || 0;
              }
              const addr = XLSX.utils.encode_cell({ r: rr, c: cc });
              const obj = (wb.Sheets[s] as XLSX.WorkSheet)?.[addr] as XLSX.CellObject | undefined;
              if (obj?.f) return 0;
              const num = Number(obj?.v);
              return Number.isFinite(num) ? num : 0;
            };
            (parser as any).onRange = (ref: {
              sheet?: string;
              from: { row: number; col: number };
              to: { row: number; col: number };
            }) => {
              const s = ref.sheet ?? activeSheet;
              const arr: number[][] = [];
              for (let rr = ref.from.row - 1; rr <= ref.to.row - 1; rr += 1) {
                const arow: number[] = [];
                for (let cc = ref.from.col - 1; cc <= ref.to.col - 1; cc += 1) {
                  if (s === activeSheet) {
                    const v = grid[rr]?.[cc] ?? '';
                    if (typeof v === 'string' && v.trim().startsWith('=')) {
                      (parser as any).position = { sheet: s, row: rr + 1, col: cc + 1 };
                      const inner = (parser as any).parse(String(v).replace(/^=/, ''));
                      arow.push(typeof inner === 'number' ? inner : Number(inner) || 0);
                    } else {
                      const { v: nv, t } = toCellValue(String(v));
                      arow.push(t === 'n' ? (nv as number) : Number(nv) || 0);
                    }
                  } else {
                    const addr = XLSX.utils.encode_cell({ r: rr, c: cc });
                    const obj = (wb.Sheets[s] as XLSX.WorkSheet)?.[addr] as XLSX.CellObject | undefined;
                    const num = Number(obj?.v);
                    arow.push(Number.isFinite(num) ? num : 0);
                  }
                }
                arr.push(arow);
              }
              return arr;
            };
            const evaluated = evaluator.evaluateFormula(String(raw), r + 1, c + 1);
            const addr = XLSX.utils.encode_cell({ r, c });
            const obj = ws?.[addr] as XLSX.CellObject | undefined;
            if (typeof evaluated === 'number') {
              const fmt = (FastFormulaParser as any).SSF?.format;
              const z = (obj as any)?.z ?? undefined;
              if (fmt && z) row.push(fmt(z, evaluated));
              else {
                const hasDecimals = Math.abs(evaluated % 1) > 1e-6;
                row.push(
                  evaluated.toLocaleString('es-MX', {
                    minimumFractionDigits: hasDecimals ? 2 : 0,
                    maximumFractionDigits: hasDecimals ? 6 : 0,
                  }),
                );
              }
            } else row.push(String(evaluated ?? ''));
          } catch {
            const addr = XLSX.utils.encode_cell({ r, c });
            const obj = ws?.[addr] as XLSX.CellObject | undefined;
            // Fallback: evaluador simple de + - * / ^ y paréntesis sustituyendo refs por números
            try {
              const f = typeof obj?.f === 'string' ? String(obj!.f) : '';
              if (f) {
                const expr = f.replace(/\$?[A-Z]+\$?\d+/g, (m) => {
                  const maddr = XLSX.utils.decode_cell(m.replace(/\$/g, ''));
                  const num = ((): number => {
                    const rawAt = grid[maddr.r]?.[maddr.c] ?? '';
                    const { v: nv, t } = toCellValue(String(rawAt));
                    if (t === 'n') return nv as number;
                    return Number(nv) || 0;
                  })();
                  return String(Number.isFinite(num) ? num : 0);
                });
                if (/^[0-9+\-*/^().\s]+$/.test(expr)) {
                  const safe = expr.replace(/\^/g, '**');
                  // eslint-disable-next-line no-new-func
                  const val = Function(`"use strict";return (${safe});`)();
                  if (typeof val === 'number' && Number.isFinite(val)) {
                    const hasDecimals = Math.abs(val % 1) > 1e-6;
                    row.push(
                      val.toLocaleString('es-MX', {
                        minimumFractionDigits: hasDecimals ? 2 : 0,
                        maximumFractionDigits: hasDecimals ? 6 : 0,
                      }),
                    );
                    continue;
                  }
                }
              }
            } catch {
              /* ignore and fallback below */
            }
            // Fallback específico: SUM/SUMA con rangos/argumentos
            try {
              const ftxt = String(raw).trim().toUpperCase();
              const m = ftxt.match(/^=(SUM|SUMA)\(([^)]+)\)$/);
              if (m) {
                const args = m[2].split(/[;,]/).map((s) => s.trim());
                let total = 0;
                const addCell = (rr: number, cc: number) => {
                  const vraw = grid[rr]?.[cc] ?? '';
                  if (typeof vraw === 'string' && vraw.startsWith('=')) {
                    try {
                      (parser as any).position = { sheet: activeSheet, row: rr + 1, col: cc + 1 };
                      const val = (parser as any).parse(normalizeFormulaName(vraw.slice(1)));
                      total += Number(val) || 0;
                    } catch {
                      const cellObj = ws?.[XLSX.utils.encode_cell({ r: rr, c: cc })] as XLSX.CellObject | undefined;
                      total += Number(cellObj?.v) || 0;
                    }
                  } else {
                    const { v: nv, t } = toCellValue(String(vraw));
                    total += t === 'n' ? (nv as number) : Number(nv) || 0;
                  }
                };
                for (const a of args) {
                  const rng = a.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
                  if (rng) {
                    const s = XLSX.utils.decode_cell(rng[1]);
                    const e = XLSX.utils.decode_cell(rng[2]);
                    for (let rr = Math.min(s.r, e.r); rr <= Math.max(s.r, e.r); rr += 1) {
                      for (let cc = Math.min(s.c, e.c); cc <= Math.max(s.c, e.c); cc += 1) addCell(rr, cc);
                    }
                  } else {
                    const one = a.match(/^([A-Z]+\d+)$/);
                    if (one) {
                      const p = XLSX.utils.decode_cell(one[1]);
                      addCell(p.r, p.c);
                    } else {
                      total += Number(a) || 0;
                    }
                  }
                }
                const fmt = (FastFormulaParser as any).SSF?.format;
                const z = (obj as any)?.z ?? undefined;
                if (fmt && z) {
                  row.push(fmt(z, total));
                } else {
                  const hasDecimals = Math.abs(total % 1) > 1e-6;
                  row.push(
                    total.toLocaleString('es-MX', {
                      minimumFractionDigits: hasDecimals ? 2 : 0,
                      maximumFractionDigits: hasDecimals ? 6 : 0,
                    }),
                  );
                }
                continue;
              }
            } catch {
              /* ignore and continue to cache fallback */
            }
            // Si falla la evaluación, usa el valor cacheado de Excel si existe
            const cache = obj?.v as unknown;
            const fmt = (FastFormulaParser as any).SSF?.format;
            const z = (obj as any)?.z ?? undefined;
            if (typeof cache === 'number') {
              try {
                if (fmt && z) row.push(fmt(z, cache));
                else {
                  const hasDecimals = Math.abs((cache as number) % 1) > 1e-6;
                  row.push(
                    (cache as number).toLocaleString('es-MX', {
                      minimumFractionDigits: hasDecimals ? 2 : 0,
                      maximumFractionDigits: hasDecimals ? 6 : 0,
                    }),
                  );
                }
              } catch {
                row.push(String(cache));
              }
            } else {
              row.push(obj?.w != null ? String(obj.w) : '#¿?');
            }
          }
        } else {
          // Lo que está en la cuadrícula manda: una celda vaciada se ve vacía aunque el libro aún la tenga.
          row.push(raw == null ? '' : String(raw));
        }
      }
      out.push(row);
    }
    return out;
  }, [grid, activeSheet]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('arta-sheet-coach-2') !== '1') setShowCoach(true);
    } catch {
      setShowCoach(true);
    }
  }, []);

  function dismissCoach() {
    try {
      sessionStorage.setItem('arta-sheet-coach-2', '1');
    } catch {
      /* ignore quota / private mode */
    }
    setShowCoach(false);
  }

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const loadSheet = useCallback(
    (wb: XLSX.WorkBook, name: string) => {
      const ws = wb.Sheets[name];
      const rows = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][]) : [];
      // Preferir fórmulas visibles cuando existan (para no perder =B*C al editar)
      const withFormulas = rows.map((row, r) =>
        row.map((cell, c) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          const obj = ws?.[addr] as XLSX.CellObject | undefined;
          if (obj?.f) return `=${obj.f}`;
          return cell === undefined || cell === null ? '' : String(cell);
        }),
      );
      // Solo lo escrito (más una fila libre para seguir capturando); el resto se amplía.
      const used = trimGrid(withFormulas as unknown[][]);
      commitGrid(padGrid(used, Math.max(1, used.length + (canEditProp ? 1 : 0)), Math.max(1, used[0]?.length ?? 1)));
      setVisibleRows(ROW_PAGE);
      setSel(null);
      setExtent(null);
      setMenu(null);
      setColOverride({});
      resetHistory();
      try {
        const defs = (ws as XLSX.WorkSheet)['!cols'] as Array<{ wpx?: number; wch?: number }> | undefined;
        const px: number[] = [];
        const widthCount = Math.max(rows[0]?.length ?? 0, defs?.length ?? 0, MIN_COLS);
        for (let i = 0; i < widthCount; i += 1) {
          const d = defs?.[i];
          const w =
            (d?.wpx && Math.max(60, Math.floor(d.wpx))) ||
            (d?.wch && Math.max(60, Math.floor(d.wch * 7 + 10))) ||
            DEFAULT_COL_PX;
          px.push(w);
        }
        // ensancha por contenido visible (solo números o texto corto) en primeras filas
        const sampleRows = Math.min(30, rows.length);
        for (let c = 0; c < px.length; c += 1) {
          let maxLen = 0;
          for (let r = 0; r < sampleRows; r += 1) {
            const cell = rows[r]?.[c];
            if (cell == null) continue;
            const s = String(cell);
            const consider = toCellValue(s).t === 'n' || s.length <= 24;
            if (!consider) continue;
            if (s.length > maxLen) maxLen = s.length;
          }
          const contentW = Math.max(60, Math.min(640, Math.floor(maxLen * 7 + 16)));
          px[c] = Math.max(px[c] || 0, contentW);
        }
        // Columna A: etiquetas largas — evita clipping pero sin exceder ~300px
        if (px.length > 0) px[0] = Math.min(Math.max(px[0], 220), 300);
        // Columna B en campaña: números/cantidades — no debe ser ancha
        if (campaign && px.length > 1) px[1] = Math.min(px[1], 160);
        setColPx(px);
        setMerges(((ws as XLSX.WorkSheet)['!merges'] as Merge[] | undefined) || []);
      } catch {
        setColPx([]);
        setMerges([]);
      }
    },
    [campaign, canEditProp, commitGrid, resetHistory],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setDirty(false);
    setPdfUrl('');
    setShowHistory(false);
    setMsg('');
    // Archivo nuevo: el delta anterior ya no aplica.
    pendingCellsRef.current = new Map();
    pendingOpsRef.current = [];
    pendingSheetsRef.current = [];
    const inlineUrl = fileId ? `/api/files/${fileId}/inline` : url;
    fetch(inlineUrl, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo abrir el archivo (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        const wb = XLSX.read(buf, { type: 'array', cellStyles: true, cellFormula: true });
        workbookRef.current = wb;
        setSheetNames(wb.SheetNames);
        const first = wb.SheetNames[0] || '';
        setActiveSheet(first);
        loadSheet(wb, first);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al leer la hoja');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, fileId, loadSheet]);

  // Estilo real (merges, negritas, relleno, bordes, anchos) — sin esto la
  // hoja no revienta, solo se ve como antes: liso, un dato por celda.
  useEffect(() => {
    if (!fileId) {
      setServerLayouts({});
      return;
    }
    let cancelled = false;
    api<{ sheets: Record<string, ServerLayout> }>(`/uploads/${fileId}/layout`)
      .then((res) => {
        if (!cancelled) setServerLayouts(res?.sheets || {});
      })
      .catch(() => {
        if (!cancelled) setServerLayouts({});
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, url]);

  /** La hoja activa, ya indexada por «fila:columna» (1-based, como ExcelJS). */
  const sheetLayout = serverLayouts[activeSheet];
  const { serverCellsByKey, serverCovered } = useMemo(() => {
    const byKey = new Map<string, ServerCell>();
    const covered = new Set<string>();
    for (const cell of sheetLayout?.cells || []) {
      byKey.set(`${cell.row}:${cell.col}`, cell);
      for (let dr = 0; dr < cell.rowSpan; dr += 1) {
        for (let dc = 0; dc < cell.colSpan; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          covered.add(`${cell.row + dr}:${cell.col + dc}`);
        }
      }
    }
    return { serverCellsByKey: byKey, serverCovered: covered };
  }, [sheetLayout]);

  /** Anchos reales del libro (puntos → px), con el cálculo de contenido como respaldo. */
  const effectiveColPx = useMemo(() => {
    const widths = sheetLayout?.colWidths;
    const out = colPx.slice();
    if (widths?.length) {
      for (let i = 0; i < widths.length; i += 1) {
        const px = Math.round(widths[i] / 0.75);
        if (px > 0) out[i] = px;
      }
    }
    for (const [i, w] of Object.entries(colOverride)) out[Number(i)] = w;
    return out;
  }, [colPx, sheetLayout, colOverride]);

  const widthOf = (c: number) => effectiveColPx[c] || DEFAULT_COL_PX;
  const rowsCount = displayGrid.length;
  const cols = displayGrid[0]?.length || MIN_COLS;
  const area: Area | null = sel ? areaOf(sel, extent ?? sel) : null;
  const multi = !!area && (area.r1 !== area.r2 || area.c1 !== area.c2);
  const inArea = (r: number, c: number) =>
    !!area && r >= area.r1 && r <= area.r2 && c >= area.c1 && c <= area.c2;

  function markDirty() {
    setDirty(true);
    setMsg('');
  }

  /* ── Deshacer / rehacer ─────────────────────────────────────────────── */

  function fullSnapshot(): Snapshot | null {
    const wb = workbookRef.current;
    if (!wb) return null;
    return {
      kind: 'full',
      grid: gridRef.current,
      sheets: structuredClone(wb.Sheets),
      layout: serverLayouts[activeSheet],
      colPx,
      merges,
      ops: [...pendingOpsRef.current],
      pending: clonePending(pendingCellsRef.current),
    };
  }

  function pushHistory(snapshot: Snapshot | null) {
    if (!snapshot) return;
    historyRef.current = [...historyRef.current.slice(-(HISTORY_MAX - 1)), snapshot];
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }

  function restore(snapshot: Snapshot) {
    if (snapshot.kind === 'full') {
      const wb = workbookRef.current;
      if (wb) wb.Sheets = structuredClone(snapshot.sheets);
      setServerLayouts((prev) => {
        const next = { ...prev };
        if (snapshot.layout) next[activeSheet] = snapshot.layout;
        else delete next[activeSheet];
        return next;
      });
      setColPx(snapshot.colPx);
      setMerges(snapshot.merges);
      setColOverride({});
      pendingOpsRef.current = [...snapshot.ops];
      pendingCellsRef.current = clonePending(snapshot.pending);
    }
    commitGrid(snapshot.grid);
    focusInfoRef.current = null;
    markDirty();
  }

  function undo() {
    const snapshot = historyRef.current.pop();
    if (!snapshot) {
      setMsg('Nada que deshacer');
      return;
    }
    const current = snapshot.kind === 'full' ? fullSnapshot() : { kind: 'grid' as const, grid: gridRef.current };
    if (current) futureRef.current.push(current);
    restore(snapshot);
    setHistoryTick((t) => t + 1);
  }

  function redo() {
    const snapshot = futureRef.current.pop();
    if (!snapshot) return;
    const current = snapshot.kind === 'full' ? fullSnapshot() : { kind: 'grid' as const, grid: gridRef.current };
    if (current) historyRef.current.push(current);
    restore(snapshot);
    setHistoryTick((t) => t + 1);
  }

  /* ── Celdas ─────────────────────────────────────────────────────────── */

  /** Cuadrícula con al menos `rows` × `columns` (crece por el final, sin mover nada). */
  function grown(base: Grid, rows: number, columns: number): Grid {
    const width = Math.max(columns, base[0]?.length ?? 0, 1);
    const out = base.map((row) => (row.length < width ? [...row, ...Array(width - row.length).fill('')] : row.slice()));
    while (out.length < rows) out.push(Array(width).fill(''));
    return out;
  }

  function setCell(row: number, col: number, value: string) {
    const next = grown(gridRef.current, row + 1, col + 1);
    next[row][col] = value;
    commitGrid(next);
    markDirty();
  }

  /** Escribe varias celdas de golpe (pegar, vaciar, llenar) con un solo punto de deshacer. */
  function writeCells(cells: Array<{ r: number; c: number; v: string }>) {
    if (!cells.length) return;
    pushHistory({ kind: 'grid', grid: gridRef.current });
    const maxR = Math.max(...cells.map((x) => x.r)) + 1;
    const maxC = Math.max(...cells.map((x) => x.c)) + 1;
    const next = grown(gridRef.current, maxR, maxC);
    for (const { r, c, v } of cells) next[r][c] = v;
    commitGrid(next);
    if (maxR > visibleRows) setVisibleRows(maxR + 10);
    markDirty();
  }

  function clearArea(a: Area) {
    const cells: Array<{ r: number; c: number; v: string }> = [];
    for (let r = a.r1; r <= a.r2; r += 1) {
      for (let c = a.c1; c <= a.c2; c += 1) if (gridRef.current[r]?.[c]) cells.push({ r, c, v: '' });
    }
    writeCells(cells);
  }

  /** Anota una celda tocada, para mandarla como delta al guardar. */
  function recordCellChange(sheet: string, ref: string, text: string) {
    const bySheet = pendingCellsRef.current.get(sheet) || new Map<string, CellChange>();
    if (text.startsWith('=')) {
      bySheet.set(ref, { sheet, ref, formula: text.slice(1) });
    } else if (!text) {
      bySheet.set(ref, { sheet, ref, value: null });
    } else {
      const { v } = toCellValue(text);
      bySheet.set(ref, { sheet, ref, value: v });
    }
    pendingCellsRef.current.set(sheet, bySheet);
  }

  /** Todas las celdas tocadas desde que se abrió el archivo. */
  function collectPendingCells(): CellChange[] {
    const out: CellChange[] = [];
    for (const bySheet of pendingCellsRef.current.values()) out.push(...bySheet.values());
    return out;
  }

  /** Escribe la cuadrícula actual en la hoja activa del libro en memoria (y anota el delta). */
  function flushGridToWorkbook() {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return;
    const current = gridRef.current;
    const ws = wb.Sheets[activeSheet] || {};
    let maxRow = 0;
    let maxCol = 0;
    for (let r = 0; r < current.length; r += 1) {
      for (let c = 0; c < current[r].length; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const text = current[r][c];
        const existing = ws[addr] as XLSX.CellObject | undefined;
        const existingText = existing?.f
          ? `=${existing.f}`
          : existing === undefined || existing.v === undefined || existing.v === null
            ? ''
            : String(existing.w ?? existing.v);

        if (text === existingText) {
          if (existing) {
            maxRow = Math.max(maxRow, r);
            maxCol = Math.max(maxCol, c);
          }
          continue;
        }

        // Se anota el cambio: esto es exactamente el delta que va al servidor.
        recordCellChange(activeSheet, addr, text);

        if (!text) {
          delete ws[addr];
          continue;
        }

        if (text.startsWith('=')) {
          ws[addr] = { ...(existing || {}), t: 'n', f: text.slice(1), v: undefined, w: undefined } as XLSX.CellObject;
        } else {
          const { v, t } = toCellValue(text);
          ws[addr] = { ...(existing || {}), t, v, w: undefined, f: undefined } as XLSX.CellObject;
          delete (ws[addr] as Record<string, unknown>).f;
          delete (ws[addr] as Record<string, unknown>).w;
        }
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
    }
    const prev = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(maxRow, prev?.e.r ?? 0), c: Math.max(maxCol, prev?.e.c ?? 0) },
    });
    wb.Sheets[activeSheet] = ws;
  }

  /* ── Filas y columnas ───────────────────────────────────────────────── */

  /**
   * Inserta o elimina filas/columnas moviendo TODO: valores, fórmulas,
   * formato y combinadas — aquí y, al guardar, en el `.xlsx` real.
   */
  function structural(kind: SheetOpKind, at0: number, count: number, styleFrom?: SheetOp['styleFrom']) {
    const wb = workbookRef.current;
    if (!wb || !activeSheet || !canEdit || count < 1) return;
    const rows = kind === 'insertRows' || kind === 'deleteRows';
    const size = rows ? gridRef.current.length : gridRef.current[0]?.length ?? 1;
    const insert = kind === 'insertRows' || kind === 'insertCols';
    if (!insert && count >= size) {
      setError(rows ? 'La hoja necesita al menos una fila' : 'La hoja necesita al menos una columna');
      return;
    }
    flushGridToWorkbook();
    pushHistory(fullSnapshot());
    const op: SheetOp = {
      sheet: activeSheet,
      kind,
      at: at0 + 1,
      count,
      ...(insert ? { styleFrom: styleFrom ?? pickStyleFrom(sheetLayout, at0 + 1, rows, size) } : {}),
    };
    pendingCellsRef.current = applyOpToPending(pendingCellsRef.current, op);
    applyOpToWorkbook(wb, op);
    commitGrid(applyOpToGrid(gridRef.current, op));
    setServerLayouts((prev) => (prev[activeSheet] ? { ...prev, [activeSheet]: applyOpToLayout(prev[activeSheet], op)! } : prev));
    setColPx((prev) => applyOpToWidths(prev, op, DEFAULT_COL_PX));
    if (!rows) setColOverride({});
    setMerges((prev) => prev.map((m) => shiftMerge(m, op)).filter((m): m is Merge => !!m));
    pendingOpsRef.current = [...pendingOpsRef.current, op];
    if (rows && insert) setVisibleRows((v) => v + count);
    focusInfoRef.current = null;
    markDirty();
    setMenu(null);

    // La selección queda en lo insertado, o donde estaba lo eliminado.
    const c0 = sel?.c ?? 0;
    const r0 = sel?.r ?? 0;
    const height = gridRef.current.length;
    const width = gridRef.current[0]?.length ?? 1;
    const target = rows
      ? { r: Math.min(at0, height - 1), c: Math.min(c0, width - 1) }
      : { r: Math.min(r0, height - 1), c: Math.min(at0, width - 1) };
    const other = insert
      ? rows
        ? { r: at0 + count - 1, c: target.c }
        : { r: target.r, c: at0 + count - 1 }
      : target;
    focusCell(target, { keepExtent: true, selectAll: true });
    setExtent(other);
    setMsg(
      `${count} ${rows ? (count === 1 ? 'fila' : 'filas') : count === 1 ? 'columna' : 'columnas'} ${
        insert ? (count === 1 ? 'insertada' : 'insertadas') : count === 1 ? 'eliminada' : 'eliminadas'
      } — el formato y las fórmulas se movieron con ${count === 1 ? 'ella' : 'ellas'}. Guarda para dejarlo en el archivo.`,
    );
  }

  const rowSpanOfArea = area ? area.r2 - area.r1 + 1 : 1;
  const colSpanOfArea = area ? area.c2 - area.c1 + 1 : 1;
  const insertRowsAbove = () => area && structural('insertRows', area.r1, rowSpanOfArea);
  const insertRowsBelow = () => area && structural('insertRows', area.r2 + 1, rowSpanOfArea);
  const deleteRows = () => area && structural('deleteRows', area.r1, rowSpanOfArea);
  const insertColsLeft = () => area && structural('insertCols', area.c1, colSpanOfArea);
  const insertColsRight = () => area && structural('insertCols', area.c2 + 1, colSpanOfArea);
  const deleteCols = () => area && structural('deleteCols', area.c1, colSpanOfArea);

  /** Duplica las filas seleccionadas debajo de ellas, con sus fórmulas recorridas. */
  function duplicateRows() {
    if (!area) return;
    const { r1, r2 } = area;
    const n = r2 - r1 + 1;
    const source = gridRef.current.slice(r1, r2 + 1).map((row) => row.slice());
    structural('insertRows', r2 + 1, n, 'before');
    const next = gridRef.current.map((row) => row.slice());
    source.forEach((row, i) =>
      row.forEach((v, c) => {
        next[r2 + 1 + i][c] = v.startsWith('=') ? `=${translateFormula(v.slice(1), n, 0)}` : v;
      }),
    );
    commitGrid(next);
  }

  /**
   * Campaña / corrida: un renglón nuevo debajo de la selección con el mismo
   * formato y las MISMAS fórmulas del renglón (recorridas), sin sus valores.
   * Sirve para cualquier plantilla: si el renglón calcula CANTIDAD × COSTO, el
   * nuevo también.
   */
  function insertConcept() {
    const base = area ? area.r2 : Math.max(0, gridRef.current.length - 1);
    const formulas = (gridRef.current[base] ?? []).map((v) => (v.startsWith('=') ? v : ''));
    structural('insertRows', base + 1, 1, 'before');
    const next = gridRef.current.map((row) => row.slice());
    formulas.forEach((v, c) => {
      if (v) next[base + 1][c] = `=${translateFormula(v.slice(1), 1, 0)}`;
    });
    commitGrid(next);
    setMsg(
      formulas.some(Boolean)
        ? 'Concepto insertado con las fórmulas del renglón de arriba — escribe medio, cantidad y costo.'
        : 'Concepto insertado con el formato del renglón de arriba.',
    );
  }

  /** Ctrl+D / «Llenar abajo»: copia la fila de arriba del rango (o hasta la siguiente celda ocupada). */
  function fillDown() {
    if (!area) return;
    const current = gridRef.current;
    const cells: Array<{ r: number; c: number; v: string }> = [];
    for (let c = area.c1; c <= area.c2; c += 1) {
      const top = current[area.r1]?.[c] ?? '';
      let last = area.r2;
      if (area.r1 === area.r2) {
        last = area.r1;
        for (let r = area.r1 + 1; r < current.length && !current[r][c].trim(); r += 1) last = r;
      }
      for (let r = area.r1 + 1; r <= last; r += 1) {
        cells.push({ r, c, v: top.startsWith('=') ? `=${translateFormula(top.slice(1), r - area.r1, 0)}` : top });
      }
    }
    writeCells(cells);
  }

  function appendRows(n: number) {
    pushHistory({ kind: 'grid', grid: gridRef.current });
    commitGrid(grown(gridRef.current, gridRef.current.length + n, gridRef.current[0]?.length ?? 1));
    setVisibleRows((v) => Math.max(v, gridRef.current.length));
    markDirty();
  }

  function appendCols(n: number) {
    pushHistory({ kind: 'grid', grid: gridRef.current });
    commitGrid(grown(gridRef.current, gridRef.current.length, (gridRef.current[0]?.length ?? 0) + n));
    markDirty();
  }

  /* ── Hojas ──────────────────────────────────────────────────────────── */

  function switchSheet(name: string) {
    if (name === activeSheet) return;
    const wb = workbookRef.current;
    if (!wb || !wb.Sheets[name]) return;
    const hadPendingChanges = dirty;
    flushGridToWorkbook();
    setActiveSheet(name);
    loadSheet(wb, name);
    /*
     * `dirty` NO se apaga aquí: los cambios de la hoja anterior están en el
     * libro en memoria, pero todavía no en el servidor.
     */
    setMsg(hadPendingChanges ? `Cambiaste a «${name}» — lo de la hoja anterior se guarda al pulsar Guardar` : '');
  }

  function addSheet() {
    const wb = workbookRef.current;
    if (!wb || !canEdit) return;
    flushGridToWorkbook();
    let n = sheetNames.length + 1;
    let name = `Hoja${n}`;
    while (wb.SheetNames.includes(name)) {
      n += 1;
      name = `Hoja${n}`;
    }
    const ws = XLSX.utils.aoa_to_sheet([['']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
    pendingSheetsRef.current = [...pendingSheetsRef.current, { add: name }];
    setSheetNames([...wb.SheetNames]);
    setActiveSheet(name);
    loadSheet(wb, name);
    setDirty(true);
    setMsg(`Hoja «${name}» creada`);
  }

  function renameActiveSheet() {
    const wb = workbookRef.current;
    if (!wb || !canEdit || !activeSheet) return;
    const next = window.prompt('Nombre de la hoja', activeSheet)?.trim();
    if (!next || next === activeSheet) return;
    if (wb.SheetNames.includes(next)) {
      setError('Ya existe una hoja con ese nombre');
      return;
    }
    flushGridToWorkbook();
    const from = activeSheet;
    const idx = wb.SheetNames.indexOf(from);
    wb.Sheets[next] = wb.Sheets[from];
    delete wb.Sheets[from];
    wb.SheetNames[idx] = next;
    // Lo pendiente ya habla del nombre nuevo: el servidor renombra antes que todo.
    pendingSheetsRef.current = [...pendingSheetsRef.current, { rename: { from, to: next } }];
    const moved = pendingCellsRef.current.get(from);
    if (moved) {
      pendingCellsRef.current.delete(from);
      pendingCellsRef.current.set(next, new Map([...moved].map(([ref, ch]) => [ref, { ...ch, sheet: next }])));
    }
    pendingOpsRef.current = pendingOpsRef.current.map((op) => (op.sheet === from ? { ...op, sheet: next } : op));
    setServerLayouts((prev) => {
      if (!prev[from]) return prev;
      const copy = { ...prev, [next]: prev[from] };
      delete copy[from];
      return copy;
    });
    resetHistory();
    setSheetNames([...wb.SheetNames]);
    setActiveSheet(next);
    setDirty(true);
  }

  /* ── Guardar y salir en PDF ─────────────────────────────────────────── */

  /** Reescribe en el libro solo las celdas que cambiaron y devuelve el .xlsx. */
  function buildFile(): Blob | null {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return null;
    flushGridToWorkbook();
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      /*
       * Vía buena: mandar SOLO lo tocado y que el servidor lo aplique con
       * ExcelJS sobre el archivo real: hojas, filas/columnas y celdas.
       */
      if (onSaveCells && /\.xlsx$/i.test(fileName)) {
        flushGridToWorkbook();
        const cells = collectPendingCells();
        const ops = pendingOpsRef.current;
        const sheets = pendingSheetsRef.current;
        if (!cells.length && !ops.length && !sheets.length) {
          setDirty(false);
          setMsg('Sin cambios que guardar');
          return;
        }
        await onSaveCells({ cells, ...(ops.length ? { ops } : {}), ...(sheets.length ? { sheets } : {}) });
        pendingCellsRef.current = new Map();
        pendingOpsRef.current = [];
        pendingSheetsRef.current = [];
      } else {
        // Respaldo para `.xls` antiguos y para quien no pase `onSaveCells`.
        const blob = buildFile();
        if (!blob) throw new Error('No hay hoja abierta');
        const name = /\.xlsx?$/i.test(fileName) ? fileName.replace(/\.xls$/i, '.xlsx') : `${fileName}.xlsx`;
        await onSave(blob, name);
      }
      setDirty(false);
      resetHistory();
      setMsg('Guardado — edición registrada en el historial');
      setRevKey((k) => k + 1);
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  /** Salida oficial: PDF. El Excel solo vive embebido. */
  async function exitAsPdf() {
    if (!fileId) {
      setError('Falta el id del archivo para generar la salida PDF');
      return;
    }
    setExporting(true);
    setError('');
    setPdfUrl('');
    try {
      if (dirty && canEdit) await save();
      const res = await api<{ url: string; message?: string }>(`/uploads/${fileId}/pdf`, { method: 'POST' });
      setPdfUrl(res.url);
      setMsg(res.message || 'PDF de salida listo');
      setRevKey((k) => k + 1);
      await onSaved?.();
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  }

  useSaveHotkey(canEdit && dirty && !saving, save);
  // Cerrar la pestaña con celdas sin guardar se llevaba el trabajo sin avisar.
  useDirtyGuard(canEdit && dirty, 'La hoja tiene cambios sin guardar. ¿Salir de todas formas?');

  /* ── Selección y teclado ────────────────────────────────────────────── */

  const inputAt = (pos: Pos) =>
    tableRef.current?.querySelector<HTMLInputElement>(`input[data-cell="${pos.r}:${pos.c}"]`) ?? null;

  /** Celda maestra que cubre (r, c), si (r, c) está dentro de una combinada. */
  function masterOf(pos: Pos): Pos {
    if (!serverCovered.has(`${pos.r + 1}:${pos.c + 1}`)) {
      const m = merges.find((x) => pos.r >= x.s.r && pos.r <= x.e.r && pos.c >= x.s.c && pos.c <= x.e.c);
      return m && !serverCellsByKey.size ? { r: m.s.r, c: m.s.c } : pos;
    }
    for (const cell of serverCellsByKey.values()) {
      if (
        pos.r + 1 >= cell.row &&
        pos.r + 1 < cell.row + cell.rowSpan &&
        pos.c + 1 >= cell.col &&
        pos.c + 1 < cell.col + cell.colSpan
      ) {
        return { r: cell.row - 1, c: cell.col - 1 };
      }
    }
    return pos;
  }

  function clampPos(pos: Pos): Pos {
    return {
      r: Math.max(0, Math.min(gridRef.current.length - 1, pos.r)),
      c: Math.max(0, Math.min((gridRef.current[0]?.length ?? 1) - 1, pos.c)),
    };
  }

  /** Enfoca una celda (en el siguiente render si todavía no está pintada). */
  function focusCell(pos: Pos, opts: { selectAll?: boolean; keepExtent?: boolean } = {}) {
    const target = masterOf(clampPos(pos));
    focusTargetRef.current = { pos: target, selectAll: opts.selectAll ?? true, keepExtent: !!opts.keepExtent };
    if (target.r >= visibleRows) setVisibleRows(target.r + ROW_PAGE);
    const el = inputAt(target);
    if (el && document.activeElement === el) {
      // Ya tenía el foco: no habrá evento de foco, se aplica aquí.
      focusTargetRef.current = null;
      setSel(target);
      if (!opts.keepExtent) setExtent(target);
      if (opts.selectAll ?? true) el.select();
    } else if (el) {
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      setSel(target);
      if (!opts.keepExtent) setExtent(target);
    }
  }

  // La celda pedida aún no existía (fila nueva, «ver más filas»): se enfoca al pintarse.
  useEffect(() => {
    const target = focusTargetRef.current;
    if (!target) return;
    const el = inputAt(target.pos);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  function onCellFocus(e: ReactFocusEvent<HTMLInputElement>, pos: Pos) {
    const target = focusTargetRef.current;
    const matches = target && target.pos.r === pos.r && target.pos.c === pos.c;
    setSel(pos);
    if (!(matches && target.keepExtent)) setExtent(pos);
    const raw = gridRef.current[pos.r]?.[pos.c] ?? '';
    focusInfoRef.current = { pos, value: raw, grid: gridRef.current, changed: false };
    if (!matches || target.selectAll) {
      e.currentTarget.select();
      // Al enfocarse pinta el valor crudo (la fórmula) y eso mueve el cursor: se vuelve a seleccionar tras el render.
      selectAllRef.current = pos;
    }
    focusTargetRef.current = null;
  }

  useLayoutEffect(() => {
    const pos = selectAllRef.current;
    if (!pos) return;
    selectAllRef.current = null;
    const el = inputAt(pos);
    if (el && document.activeElement === el) el.select();
  });

  function onCellChange(pos: Pos, value: string) {
    if (!canEdit) return;
    const info = focusInfoRef.current;
    if (info && info.pos.r === pos.r && info.pos.c === pos.c && !info.changed) {
      info.changed = true;
      pushHistory({ kind: 'grid', grid: info.grid });
    }
    setCell(pos.r, pos.c, value);
  }

  function move(dr: number, dc: number, extend: boolean, growOnEnter = false) {
    if (!sel) {
      focusCell({ r: 0, c: 0 });
      return;
    }
    if (extend) {
      const from = extent ?? sel;
      setExtent(clampPos({ r: from.r + dr, c: from.c + dc }));
      return;
    }
    // Saltar la combinada entera al avanzar desde su celda maestra.
    const master = serverCellsByKey.get(`${sel.r + 1}:${sel.c + 1}`);
    const stepR = dr > 0 ? (master?.rowSpan ?? 1) : dr;
    const stepC = dc > 0 ? (master?.colSpan ?? 1) : dc;
    let next = { r: sel.r + stepR, c: sel.c + stepC };
    if (growOnEnter && canEdit && next.r >= gridRef.current.length) {
      commitGrid(grown(gridRef.current, next.r + 1, gridRef.current[0]?.length ?? 1));
    }
    next = clampPos(next);
    focusCell(next);
  }

  function onCellKeyDown(e: ReactKeyboardEvent<HTMLInputElement>, pos: Pos) {
    const el = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    const whole = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    const key = e.key;
    if (mod && !e.altKey) {
      const k = key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'd' && canEdit) {
        e.preventDefault();
        fillDown();
      }
      return;
    }
    switch (key) {
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        move(key === 'ArrowUp' ? -1 : 1, 0, e.shiftKey);
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        // Dentro del texto (doble clic / F2) las flechas mueven el cursor; si no, la celda.
        if (!whole && el.value) return;
        e.preventDefault();
        move(0, key === 'ArrowLeft' ? -1 : 1, e.shiftKey);
        return;
      case 'Enter':
        e.preventDefault();
        move(e.shiftKey ? -1 : 1, 0, false, true);
        return;
      case 'Tab':
        e.preventDefault();
        move(0, e.shiftKey ? -1 : 1, false);
        return;
      case 'F2':
        e.preventDefault();
        el.setSelectionRange(el.value.length, el.value.length);
        return;
      case 'Escape': {
        const info = focusInfoRef.current;
        if (info && info.pos.r === pos.r && info.pos.c === pos.c && el.value !== info.value) {
          e.preventDefault();
          e.stopPropagation();
          setCell(pos.r, pos.c, info.value);
          info.changed = false;
          selectAllRef.current = pos;
        }
        return;
      }
      case 'Delete':
      case 'Backspace':
        if (multi && canEdit && area) {
          e.preventDefault();
          clearArea(area);
        }
        return;
      default:
        return;
    }
  }

  function onCellMouseDown(e: ReactMouseEvent<HTMLInputElement>, pos: Pos) {
    if (e.button === 2) {
      // Clic derecho fuera del rango: primero se selecciona esa celda.
      if (!inArea(pos.r, pos.c)) {
        e.preventDefault();
        focusCell(pos);
      }
      return;
    }
    if (e.button !== 0) return;
    setMenu(null);
    if (e.shiftKey && sel) {
      e.preventDefault();
      setExtent(pos);
      return;
    }
    dragRef.current = 'cell';
    const focused = document.activeElement === e.currentTarget;
    if (!focused) {
      // Un clic selecciona la celda (como Excel): lo que se escriba la reemplaza.
      e.preventDefault();
      focusCell(pos);
    }
  }

  function onCellEnter(pos: Pos) {
    if (dragRef.current === 'cell') setExtent(pos);
  }

  function selectRows(r: number, extend: boolean) {
    const last = (gridRef.current[0]?.length ?? 1) - 1;
    if (extend && sel) {
      setExtent({ r, c: last });
      return;
    }
    focusCell({ r, c: 0 }, { keepExtent: true });
    setExtent({ r, c: last });
  }

  function selectCols(c: number, extend: boolean) {
    const last = gridRef.current.length - 1;
    if (extend && sel) {
      setExtent({ r: last, c });
      return;
    }
    focusCell({ r: 0, c }, { keepExtent: true });
    setExtent({ r: last, c });
  }

  useEffect(() => {
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  // Esc quita la selección (si la celda no tenía nada que regresar) y cierra el menú.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (menu) {
        setMenu(null);
        return;
      }
      if (!sel) return;
      const el = e.target as HTMLElement | null;
      if (el?.classList.contains('sheet__cell') || el?.classList.contains('sheet-fxbar__input')) el.blur();
      setSel(null);
      setExtent(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, menu]);

  /* ── Copiar / pegar ─────────────────────────────────────────────────── */

  function onCellCopy(e: ReactClipboardEvent<HTMLInputElement>, cut: boolean) {
    const el = e.currentTarget;
    const whole = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    if (!area || (!multi && !whole)) return; // texto parcial: lo normal del navegador
    e.preventDefault();
    const raw: string[][] = [];
    const shown: string[][] = [];
    for (let r = area.r1; r <= area.r2; r += 1) {
      raw.push(gridRef.current[r]?.slice(area.c1, area.c2 + 1) ?? []);
      shown.push(displayGrid[r]?.slice(area.c1, area.c2 + 1) ?? []);
    }
    const tsv = toTsv(shown);
    e.clipboardData.setData('text/plain', tsv);
    clipRef.current = { tsv, raw, r: area.r1, c: area.c1 };
    if (cut && canEdit) clearArea(area);
  }

  function onCellPaste(e: ReactClipboardEvent<HTMLInputElement>) {
    if (!canEdit || !sel) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const internal = clipRef.current && clipRef.current.tsv === text ? clipRef.current : null;
    const block = internal ? internal.raw : parseTsv(text);
    const single = block.length === 1 && block[0].length === 1;
    // Un solo valor en una sola celda: lo pega el propio campo (donde esté el cursor).
    if (single && !multi && !internal) return;
    e.preventDefault();
    const start = area ? { r: area.r1, c: area.c1 } : sel;
    const cells: Array<{ r: number; c: number; v: string }> = [];
    const put = (r: number, c: number, v: string, fromR: number, fromC: number) => {
      const value = internal && v.startsWith('=') ? `=${translateFormula(v.slice(1), r - fromR, c - fromC)}` : v;
      cells.push({ r, c, v: value });
    };
    if (single && area) {
      // Un valor sobre un rango: lo llena entero, como Excel.
      for (let r = area.r1; r <= area.r2; r += 1)
        for (let c = area.c1; c <= area.c2; c += 1) put(r, c, block[0][0], internal?.r ?? r, internal?.c ?? c);
    } else {
      block.forEach((row, i) =>
        row.forEach((v, j) => put(start.r + i, start.c + j, v, (internal?.r ?? 0) + i, (internal?.c ?? 0) + j)),
      );
    }
    writeCells(cells);
    const rows = single ? 0 : block.length - 1;
    const width = single ? 0 : Math.max(...block.map((r) => r.length)) - 1;
    if (!single) {
      focusCell(start, { keepExtent: true });
      setExtent({ r: start.r + rows, c: start.c + width });
    }
    setMsg(`Pegado: ${cells.length} celda${cells.length === 1 ? '' : 's'}`);
  }

  /* ── Menú contextual ────────────────────────────────────────────────── */

  function openMenu(e: ReactMouseEvent, target: Menu['target']) {
    // Solo lectura: no hay nada que insertar; queda el menú normal del navegador (copiar).
    if (!canEdit) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, target });
  }

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    }
    function onScroll() {
      setMenu(null);
    }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menu]);

  /* ── Ancho de columnas ──────────────────────────────────────────────── */

  function startResize(e: ReactMouseEvent, c: number) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(c);
    function onMove(ev: MouseEvent) {
      setColOverride((prev) => ({ ...prev, [c]: Math.max(40, Math.round(startW + ev.clientX - startX)) }));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /** Doble clic en el borde: la columna al ancho de su texto más largo, como en Excel. */
  function autoFit(c: number) {
    let longest = 0;
    for (const row of displayGrid) longest = Math.max(longest, (row[c] ?? '').length);
    setColOverride((prev) => ({ ...prev, [c]: Math.max(60, Math.min(640, longest * 7.5 + 20)) }));
  }

  /* ── Barra de fórmulas y estado ─────────────────────────────────────── */

  const shownRows = useMemo(() => displayGrid.slice(0, visibleRows), [displayGrid, visibleRows]);
  const selLabel = area
    ? multi
      ? `${colLabel(area.c1)}${area.r1 + 1}:${colLabel(area.c2)}${area.r2 + 1}`
      : `${colLabel(area.c1)}${area.r1 + 1}`
    : '';
  const fxValue = sel ? (grid[sel.r]?.[sel.c] ?? '') : '';

  const stats = useMemo(() => {
    if (!area || !multi) return null;
    let sum = 0;
    let nums = 0;
    let filled = 0;
    for (let r = area.r1; r <= area.r2; r += 1) {
      for (let c = area.c1; c <= area.c2; c += 1) {
        const text = displayGrid[r]?.[c] ?? '';
        if (!text.trim()) continue;
        filled += 1;
        const n = numberOf(text);
        if (n !== null) {
          sum += n;
          nums += 1;
        }
      }
    }
    return { sum, nums, filled };
  }, [area, multi, displayGrid]);

  /*
   * Ni gráficas ni tablas dinámicas sobreviven al round-trip, así que en vez de
   * comérselas en silencio el libro se abre en solo lectura y se dice por qué.
   */
  const blockNotice =
    !panelEditable && blockReason ? (
      <div className="module-banner module-banner--warn" role="status">
        {blockReason}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="sheet-state sheet-state--loading" role="status">
        <p className="sheet-state__title">Abriendo la hoja…</p>
        <p className="sheet-state__hint">Cargamos el Excel embebido para que edites aquí, sin descargas.</p>
      </div>
    );
  }
  if (error && !grid.length) {
    return (
      <div className="sheet-state sheet-state--error" role="alert">
        <p className="sheet-state__title">No se pudo abrir</p>
        <p className="sheet-state__hint">{error}</p>
        <p className="sheet-state__hint">Prueba de nuevo o pide a quien subió el archivo que lo vuelva a cargar.</p>
      </div>
    );
  }

  const nRows = rowSpanOfArea;
  const nCols = colSpanOfArea;
  const rowsWord = nRows === 1 ? 'fila' : `${nRows} filas`;
  const colsWord = nCols === 1 ? 'columna' : `${nCols} columnas`;
  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const menuItems: Array<{ label: string; run: () => void; danger?: boolean; hint?: string } | 'sep'> = [];
  if (menu && canEdit) {
    if (menu.target !== 'col') {
      menuItems.push(
        { label: `Insertar ${rowsWord} arriba`, run: insertRowsAbove },
        { label: `Insertar ${rowsWord} abajo`, run: insertRowsBelow },
        { label: nRows === 1 ? 'Duplicar fila' : `Duplicar ${nRows} filas`, run: duplicateRows },
        { label: `Eliminar ${rowsWord}`, run: deleteRows, danger: true },
      );
    }
    if (menu.target === 'cell') menuItems.push('sep');
    if (menu.target !== 'row') {
      menuItems.push(
        { label: `Insertar ${colsWord} a la izquierda`, run: insertColsLeft },
        { label: `Insertar ${colsWord} a la derecha`, run: insertColsRight },
        { label: `Eliminar ${colsWord}`, run: deleteCols, danger: true },
      );
    }
    menuItems.push('sep');
    menuItems.push(
      { label: 'Vaciar celdas', run: () => area && clearArea(area), hint: 'Supr' },
      { label: 'Llenar abajo', run: fillDown, hint: 'Ctrl+D' },
    );
    if ((campaign || finance) && menu.target !== 'col') {
      menuItems.push('sep', { label: '+ Concepto debajo (con sus fórmulas)', run: insertConcept });
    }
  }

  return (
    <ExpandBox title={fileName} dirty={dirty}>
      <div className="stack sheet-editor">
        {blockNotice}

        {showCoach ? (
          <div className="editor-coach" role="note" style={{ alignItems: 'center' }}>
            <p className="editor-coach__text" style={{ margin: 0 }}>
              Se usa como Excel: clic y escribe · doble clic o F2 edita dentro · <strong>clic derecho</strong> en una
              celda, número de fila o letra de columna para insertar o eliminar · Ctrl+C / Ctrl+V con Excel · Ctrl+Z
              deshace · Ctrl+S guarda.
            </p>
            <button type="button" className="editor-coach__dismiss" onClick={dismissCoach} aria-label="Cerrar guía">
              Entendido
            </button>
          </div>
        ) : null}

        <div className="sheet-chrome">
          <div className="sheet-toolbar">
            <div className="sheet-tabs" role="tablist" aria-label="Hojas del libro">
              {sheetNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={n === activeSheet}
                  className={`sheet-tab ${n === activeSheet ? 'is-active' : ''}`}
                  onClick={() => switchSheet(n)}
                  onDoubleClick={() => n === activeSheet && renameActiveSheet()}
                  title={n === activeSheet && canEdit ? 'Doble clic para renombrar' : undefined}
                >
                  {n}
                </button>
              ))}
              {canEdit ? (
                <button className="btn ghost btn-sm" type="button" onClick={addSheet} title="Agregar hoja">
                  + Hoja
                </button>
              ) : null}
            </div>

            <div className="row row--tight sheet-toolbar__actions">
              {fileId ? (
                <button
                  className="btn btn-sm sheet-toolbar__primary"
                  type="button"
                  disabled={exporting || saving}
                  onClick={() => void exitAsPdf()}
                  title="Genera el PDF oficial. El Excel no sale del sistema."
                >
                  {exporting ? 'Generando PDF…' : 'Salir en PDF'}
                </button>
              ) : null}
              {canEdit ? (
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  disabled={!dirty || saving}
                  onClick={save}
                  title="Ctrl+S / ⌘S — guarda la copia de trabajo (auditoría)"
                >
                  {saving ? 'Guardando…' : dirty ? 'Guardar' : 'Sin cambios'}
                </button>
              ) : (
                <span className="muted kpi-sub sheet-toolbar__readonly">
                  {panelEditable ? 'Solo lectura' : 'No editable aquí'}
                </span>
              )}
              {fileId ? (
                <button
                  className="btn ghost btn-sm sheet-toolbar__tertiary"
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-expanded={showHistory}
                >
                  {showHistory ? 'Ocultar historial' : 'Quién editó'}
                </button>
              ) : null}
            </div>
          </div>

          {canEdit ? (
            <div className="sheet-ribbon" role="toolbar" aria-label="Herramientas de hoja">
              <div className="sheet-ribbon__group">
                <button
                  className="sheet-ribbon__btn"
                  type="button"
                  disabled={!canUndo}
                  onClick={undo}
                  title="Deshacer (Ctrl+Z)"
                  aria-label="Deshacer"
                >
                  ↶
                </button>
                <button
                  className="sheet-ribbon__btn"
                  type="button"
                  disabled={!canRedo}
                  onClick={redo}
                  title="Rehacer (Ctrl+Y)"
                  aria-label="Rehacer"
                >
                  ↷
                </button>
              </div>
              <div className="sheet-ribbon__group" aria-label="Filas">
                <span className="sheet-ribbon__label">Filas</span>
                <button className="sheet-ribbon__btn" type="button" disabled={!area} onClick={insertRowsAbove}>
                  Insertar arriba
                </button>
                <button className="sheet-ribbon__btn" type="button" disabled={!area} onClick={insertRowsBelow}>
                  Insertar abajo
                </button>
                <button
                  className="sheet-ribbon__btn sheet-ribbon__btn--danger"
                  type="button"
                  disabled={!area}
                  onClick={deleteRows}
                >
                  Eliminar
                </button>
              </div>
              <div className="sheet-ribbon__group" aria-label="Columnas">
                <span className="sheet-ribbon__label">Columnas</span>
                <button className="sheet-ribbon__btn" type="button" disabled={!area} onClick={insertColsLeft}>
                  ← Insertar
                </button>
                <button className="sheet-ribbon__btn" type="button" disabled={!area} onClick={insertColsRight}>
                  Insertar →
                </button>
                <button
                  className="sheet-ribbon__btn sheet-ribbon__btn--danger"
                  type="button"
                  disabled={!area}
                  onClick={deleteCols}
                >
                  Eliminar
                </button>
              </div>
              {campaign || finance ? (
                <div className="sheet-ribbon__group">
                  <button
                    className="sheet-ribbon__btn sheet-ribbon__btn--primary"
                    type="button"
                    onClick={insertConcept}
                    title="Renglón nuevo debajo de la selección, con el mismo formato y las mismas fórmulas"
                  >
                    + Concepto
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="sheet-fxbar" role="group" aria-label="Barra de fórmulas">
            <span className="sheet-fxbar__ref" title="Celda activa">
              {selLabel || '—'}
            </span>
            <span className="sheet-fxbar__fx" aria-hidden="true">
              fx
            </span>
            <input
              className="sheet-fxbar__input"
              value={fxValue}
              readOnly={!canEdit || !sel}
              disabled={!sel}
              placeholder={sel ? 'Valor o fórmula (=A1*B1)' : 'Selecciona una celda'}
              aria-label={sel ? `Editar ${selLabel}` : 'Sin celda seleccionada'}
              onChange={(e) => sel && onCellChange(sel, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sel) {
                  e.preventDefault();
                  move(1, 0, false, true);
                }
              }}
            />
          </div>
        </div>

        {pdfUrl ? (
          <div className="sheet-pdf-success" role="status">
            <div className="sheet-pdf-success__text">
              <strong>PDF listo</strong>
              <span> — tu salida oficial quedó generada.</span>
            </div>
            <a className="btn btn-sm" href={pdfUrl} target="_blank" rel="noreferrer">
              Abrir PDF
            </a>
          </div>
        ) : null}

        {msg && !pdfUrl ? (
          <div className="module-banner module-banner--ok" role="status">
            {msg}
          </div>
        ) : null}
        {msg && pdfUrl ? (
          <p className="muted kpi-sub" role="status">
            {msg}
          </p>
        ) : null}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        {!shownRows.length ? (
          <div className="sheet-state sheet-state--empty" role="status">
            <p className="sheet-state__title">Hoja vacía</p>
            <p className="sheet-state__hint">
              {canEdit
                ? 'Haz clic en una celda y empieza a escribir.'
                : 'Este libro no tiene datos visibles en esta hoja.'}
            </p>
          </div>
        ) : (
          <div className="sheet-wrap">
            <table className="sheet sheet--excel" ref={tableRef}>
              <thead>
                <tr>
                  <th
                    className="sheet__corner"
                    scope="col"
                    title="Seleccionar todo"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      focusCell({ r: 0, c: 0 }, { keepExtent: true });
                      setExtent({ r: gridRef.current.length - 1, c: cols - 1 });
                    }}
                  >
                    <span className="sr-only">Fila / columna</span>
                  </th>
                  {Array.from({ length: cols }, (_, c) => {
                    const on = !!area && c >= area.c1 && c <= area.c2;
                    return (
                      <th
                        key={c}
                        scope="col"
                        className={`sheet__colhead${on ? ' sheet__col--sel' : ''}`}
                        style={{ width: widthOf(c) + 'px', minWidth: widthOf(c) + 'px' }}
                        onMouseDown={(e) => {
                          if (e.button === 2) {
                            if (!on) selectCols(c, false);
                            return;
                          }
                          e.preventDefault();
                          setMenu(null);
                          dragRef.current = 'col';
                          selectCols(c, e.shiftKey);
                        }}
                        onMouseEnter={() => dragRef.current === 'col' && selectCols(c, true)}
                        onContextMenu={(e) => openMenu(e, 'col')}
                      >
                        {colLabel(c)}
                        <span
                          className="sheet__colresize"
                          aria-hidden
                          title="Arrastra para cambiar el ancho"
                          onMouseDown={(e) => startResize(e, c)}
                          onDoubleClick={() => autoFit(c)}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row, r) => {
                  const rowOn = !!area && r >= area.r1 && r <= area.r2;
                  return (
                    <tr key={r} className={rowOn ? 'sheet__row--sel' : undefined}>
                      <th
                        className="sheet__rownum"
                        scope="row"
                        onMouseDown={(e) => {
                          if (e.button === 2) {
                            if (!rowOn) selectRows(r, false);
                            return;
                          }
                          e.preventDefault();
                          setMenu(null);
                          dragRef.current = 'row';
                          selectRows(r, e.shiftKey);
                        }}
                        onMouseEnter={() => dragRef.current === 'row' && selectRows(r, true)}
                        onContextMenu={(e) => openMenu(e, 'row')}
                      >
                        {r + 1}
                      </th>
                      {(() => {
                        const cells: JSX.Element[] = [];
                        for (let c = 0; c < row.length; c += 1) {
                          // Celda cubierta por el rowSpan/colSpan de una maestra anterior: no se dibuja.
                          if (serverCovered.has(`${r + 1}:${c + 1}`)) continue;
                          const isSel = sel?.r === r && sel?.c === c;
                          const serverCell = serverCellsByKey.get(`${r + 1}:${c + 1}`);
                          const merge = serverCell ? undefined : merges.find((m) => m.s.r === r && m.s.c === c);
                          let colSpan = 1;
                          let widthPx = widthOf(c);
                          if (serverCell) {
                            colSpan = serverCell.colSpan;
                            for (let i = c + 1; i < c + serverCell.colSpan; i += 1) widthPx += widthOf(i);
                          } else if (merge) {
                            colSpan = merge.e.c - merge.s.c + 1;
                            for (let i = merge.s.c + 1; i <= merge.e.c; i += 1) widthPx += widthOf(i);
                          }
                          const rowSpan = serverCell && serverCell.rowSpan > 1 ? serverCell.rowSpan : undefined;
                          const display = isSel ? (grid[r]?.[c] ?? '') : row[c];
                          const { t } = toCellValue(String(display));
                          const isText = t === 's' && typeof display === 'string' && !String(display).startsWith('=');
                          const approxTextPx = isText ? Math.min(2000, String(display).length * 7) : 0;
                          const shouldWrap = (isText && approxTextPx > Math.max(60, widthPx - 18)) || !!serverCell?.valign;
                          const tdStyle: CSSProperties = {};
                          if (serverCell?.fill) tdStyle.background = serverCell.fill;
                          if (serverCell?.valign === 'middle') tdStyle.verticalAlign = 'middle';
                          else if (serverCell?.valign === 'bottom') tdStyle.verticalAlign = 'bottom';
                          const b = serverCell?.border;
                          if (b?.top) tdStyle.borderTop = `${b.top.width}px solid ${b.top.color}`;
                          if (b?.right) tdStyle.borderRight = `${b.right.width}px solid ${b.right.color}`;
                          if (b?.bottom) tdStyle.borderBottom = `${b.bottom.width}px solid ${b.bottom.color}`;
                          if (b?.left) tdStyle.borderLeft = `${b.left.width}px solid ${b.left.color}`;
                          const inputStyle: CSSProperties = { minWidth: widthPx - 2, width: '100%' };
                          if (serverCell) {
                            Object.assign(inputStyle, {
                              '--cell-fg': serverCell.color || '#1a2330',
                              '--cell-weight': serverCell.bold ? 700 : 400,
                              '--cell-style': serverCell.italic ? 'italic' : 'normal',
                              '--cell-align': serverCell.align,
                            });
                          } else if (t === 'n' && !isSel) {
                            // Los números a la derecha, como en Excel.
                            inputStyle.textAlign = 'right';
                          }
                          const pos = { r, c };
                          const classes = ['sheet__td'];
                          if (isSel) classes.push('sheet__td--sel');
                          if (multi && inArea(r, c)) classes.push('sheet__td--range');
                          cells.push(
                            <td
                              key={c}
                              className={classes.join(' ')}
                              colSpan={colSpan}
                              rowSpan={rowSpan}
                              style={Object.keys(tdStyle).length ? tdStyle : undefined}
                            >
                              <input
                                className={`sheet__cell${shouldWrap ? ' sheet__cell--wrap' : ''}${
                                  serverCell ? ' sheet__cell--styled' : ''
                                }`}
                                data-cell={`${r}:${c}`}
                                value={display as string}
                                readOnly={!canEdit}
                                aria-label={`Celda ${colLabel(c)}${r + 1}`}
                                onFocus={(e) => onCellFocus(e, pos)}
                                onChange={(e) => onCellChange(pos, e.target.value)}
                                onKeyDown={(e) => onCellKeyDown(e, pos)}
                                onMouseDown={(e) => onCellMouseDown(e, pos)}
                                onMouseEnter={() => onCellEnter(pos)}
                                onDoubleClick={(e) => {
                                  // Doble clic: editar dentro, con el cursor al final (como F2).
                                  const el = e.currentTarget;
                                  el.setSelectionRange(el.value.length, el.value.length);
                                }}
                                onContextMenu={(e) => openMenu(e, 'cell')}
                                onCopy={(e) => onCellCopy(e, false)}
                                onCut={(e) => onCellCopy(e, true)}
                                onPaste={onCellPaste}
                                style={inputStyle}
                              />
                            </td>,
                          );
                          if (serverCell && serverCell.colSpan > 1) c += serverCell.colSpan - 1;
                          else if (merge) c = merge.e.c; // saltar celdas cubiertas por el merge
                        }
                        return cells;
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="sheet-status" role="status" aria-live="polite">
          <span className="sheet-status__ref">{selLabel || 'Sin selección'}</span>
          {stats ? (
            <span className="sheet-status__stats">
              {stats.nums ? (
                <>
                  Suma <strong>{money(stats.sum)}</strong> · Promedio {money(stats.sum / stats.nums)} ·{' '}
                </>
              ) : null}
              Cuenta {stats.filled}
            </span>
          ) : null}
          {canEdit ? (
            <span className="sheet-status__actions">
              {displayGrid.length > visibleRows ? (
                <button className="btn-quiet" type="button" onClick={() => setVisibleRows((v) => v + ROW_PAGE)}>
                  Ver más filas ({displayGrid.length - visibleRows})
                </button>
              ) : null}
              <button className="btn-quiet" type="button" onClick={() => appendRows(10)}>
                + 10 filas al final
              </button>
              <button className="btn-quiet" type="button" onClick={() => appendCols(1)}>
                + Columna al final
              </button>
            </span>
          ) : displayGrid.length > visibleRows ? (
            <button className="btn-quiet" type="button" onClick={() => setVisibleRows((v) => v + ROW_PAGE)}>
              Ver más filas ({displayGrid.length - visibleRows})
            </button>
          ) : null}
        </div>

        {fileId && showHistory ? (
          <div className="sheet-history" role="region" aria-label="Historial de ediciones">
            <div className="sheet-history__head">
              <div>
                <h3 className="sheet-history__title">Historial de ediciones</h3>
                <p className="sheet-history__sub muted kpi-sub">Quién guardó o generó PDF, y cuándo.</p>
              </div>
              <button className="btn ghost btn-sm" type="button" onClick={() => setShowHistory(false)}>
                Cerrar
              </button>
            </div>
            <RevisionHistory
              path={`/uploads/${fileId}/revisions`}
              reloadKey={revKey}
              emptyHint="Cada «Guardar» y cada «Salir en PDF» deja quién y cuándo."
            />
          </div>
        ) : null}
      </div>

      {menu && menuItems.length
        ? createPortal(
            <div
              ref={menuRef}
              className="sheet-menu"
              role="menu"
              aria-label="Opciones de la hoja"
              style={{
                top: Math.min(menu.y, window.innerHeight - 40 - menuItems.length * 34),
                left: Math.min(menu.x, window.innerWidth - 270),
              }}
            >
              {menuItems.map((item, i) =>
                item === 'sep' ? (
                  <div key={`sep-${i}`} className="sheet-menu__sep" role="separator" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={`sheet-menu__item${item.danger ? ' is-danger' : ''}`}
                    onClick={() => {
                      setMenu(null);
                      item.run();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.hint ? <span className="sheet-menu__hint">{item.hint}</span> : null}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </ExpandBox>
  );
}
