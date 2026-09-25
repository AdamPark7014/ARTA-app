'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import FastFormulaParser from 'fast-formula-parser';
import type { SaveFile } from '@/lib/file-save';
import { api } from '@/lib/api';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { RevisionHistory } from '@/components/ui/RevisionHistory';
import { useSaveHotkey } from '@/lib/use-save-hotkey';
import { useDirtyGuard } from '@/lib/use-dirty-guard';

type Props = {
  url: string;
  fileName: string;
  /** Id del EventFile — necesario para salir en PDF y ver historial. */
  fileId?: string;
  canEdit: boolean;
  /** Dónde se guarda el .xlsx reconstruido (respaldo si no hay guardado por celdas) */
  onSave: SaveFile;
  /**
   * Guardado por celdas: la vía buena. Si viene, se manda el delta y el
   * servidor lo aplica con ExcelJS sin degradar el resto del libro.
   */
  onSaveCells?: (patch: { cells: CellChange[] }) => Promise<void>;
  /** `false` cuando el libro trae gráficas o tablas dinámicas. */
  panelEditable?: boolean;
  /** Por qué no se puede editar, para poder explicárselo a la persona. */
  blockReason?: string | null;
  /** Se llama tras guardar, para refrescar la lista de quien lo muestra */
  onSaved?: () => void | Promise<void>;
  /**
   * Modo campaña: barra de herramientas de gastos (insertar concepto, totales
   * B×C / E×F, llenado rápido). Ideal para «GASTOS DE PUBLICIDAD Y CONVENIOS».
   */
  variant?: 'default' | 'campaign' | 'finance';
};

/** Una celda cambiada, en el formato que espera `PATCH /uploads/:id/cells`. */
export type CellChange = {
  sheet: string;
  ref: string;
  formula?: string | null;
  value?: string | number | null;
};

type Grid = string[][];
type Sel = { r: number; c: number } | null;

const MIN_ROWS = 24;
const MIN_COLS = 9;
const ROW_PAGE = 120;

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

/** "12,5" y "1 000" también son números para quien captura en español. */
function toCellValue(text: string): { v: string | number; t: 's' | 'n' } {
  const trimmed = text.trim();
  if (!trimmed) return { v: '', t: 's' };
  if (trimmed.startsWith('=')) return { v: trimmed, t: 's' };
  const normalized = trimmed.replace(/\s/g, '').replace(/\$/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const n = Number(normalized);
    if (Number.isFinite(n)) return { v: n, t: 'n' };
  }
  return { v: text, t: 's' };
}

function parseMoney(text: string): number {
  const n = Number(
    String(text)
      .replace(/[$\s]/g, '')
      .replace(/,/g, ''),
  );
  return Number.isFinite(n) ? n : 0;
}

/**
 * Hoja de cálculo editable dentro del panel.
 *
 * Se abre el .xlsx real, se escribe encima como en Excel y al guardar se
 * reconstruye el archivo y se reemplaza en el sitio (mismo id, nueva versión).
 *
 * Sobre lo que se conserva: el libro original se mantiene en memoria y solo se
 * tocan las celdas que la persona edita, así que **las fórmulas y formatos de
 * las celdas que nadie toca sobreviven al guardado**. Una celda con fórmula que
 * se sobrescribe pasa a ser valor fijo — igual que en Excel.
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
   * Celdas tocadas desde que se abrió el archivo, por hoja.
   *
   * Es lo que se manda al servidor: un delta, no un libro reconstruido. Con la
   * edición Community de SheetJS, reescribir el `.xlsx` completo desde el
   * navegador emite una fuente fija y tira formato condicional y validaciones
   * de TODO el libro. Mandando solo el delta, ExcelJS lo aplica en el servidor
   * sobre el archivo real y lo que nadie tocó sobrevive.
   */
  const pendingCellsRef = useRef<Map<string, Map<string, CellChange>>>(new Map());
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [grid, setGrid] = useState<Grid>([]);
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
  const [sel, setSel] = useState<Sel>(null);
  const [showCoach, setShowCoach] = useState(false);
  const [showStyled, setShowStyled] = useState(false);
  const [styledHtml, setStyledHtml] = useState<string>('');
  const campaign = variant === 'campaign';
  const finance = variant === 'finance';
  const richTools = campaign || finance;
  const [colPx, setColPx] = useState<number[]>([]);
  const mergesRef = useRef<Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>>([]);

  /**
   * Grid de presentación: muestra valores calculados y cacheados.
   * La celda enfocada sigue mostrando el `grid` crudo con "=…".
   */
  const displayGrid: Grid = useMemo(() => {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return grid;
    const ws = wb.Sheets[activeSheet];
    const parser = new (FastFormulaParser as any)();
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
            (parser as any).onRange = (ref: { sheet?: string; from: { row: number; col: number }; to: { row: number; col: number } }) => {
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
            const evaluated = (parser as any).parse(String(raw).replace(/^=/, ''));
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
            } else if (typeof evaluated === 'string') {
              row.push(evaluated);
            } else {
              row.push(String(evaluated ?? ''));
            }
          } catch {
            const addr = XLSX.utils.encode_cell({ r, c });
            const obj = ws?.[addr] as XLSX.CellObject | undefined;
            row.push(obj?.w != null ? String(obj.w) : '#¿?');
          }
        } else {
          const addr = XLSX.utils.encode_cell({ r, c });
          const obj = ws?.[addr] as XLSX.CellObject | undefined;
          row.push(obj?.w != null ? String(obj.w) : String(raw ?? ''));
        }
      }
      out.push(row);
    }
    return out;
  }, [grid, activeSheet]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('arta-sheet-coach') !== '1') setShowCoach(true);
    } catch {
      setShowCoach(true);
    }
  }, []);

  function dismissCoach() {
    try {
      sessionStorage.setItem('arta-sheet-coach', '1');
    } catch {
      /* ignore quota / private mode */
    }
    setShowCoach(false);
  }

  const loadSheet = useCallback((wb: XLSX.WorkBook, name: string) => {
    const ws = wb.Sheets[name];
    const rows = ws
      ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][])
      : [];
    // Preferir fórmulas visibles cuando existan (para no perder =B*C al editar)
    const withFormulas = rows.map((row, r) =>
      row.map((cell, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const obj = ws?.[addr] as XLSX.CellObject | undefined;
        if (obj?.f) return `=${obj.f}`;
        return cell === undefined || cell === null ? '' : String(cell);
      }),
    );
    setGrid(padGrid(withFormulas as unknown[][], MIN_ROWS, campaign || finance ? MIN_COLS : 8));
    setVisibleRows(ROW_PAGE);
    setSel(null);
    // Column widths + merges
    try {
      const defs = (ws as XLSX.WorkSheet)['!cols'] as Array<{ wpx?: number; wch?: number }> | undefined;
      const px: number[] = [];
      const widthCount = Math.max(rows[0]?.length ?? 0, defs?.length ?? 0, MIN_COLS);
      for (let i = 0; i < widthCount; i += 1) {
        const d = defs?.[i];
        const w =
          (d?.wpx && Math.max(60, Math.floor(d.wpx))) ||
          (d?.wch && Math.max(60, Math.floor(d.wch * 8) + 12)) ||
          104;
        px.push(w);
      }
      setColPx(px);
      mergesRef.current = (((ws as XLSX.WorkSheet)['!merges'] as unknown) as Array<{
        s: { r: number; c: number };
        e: { r: number; c: number };
      }>) || [];
    } catch {
      setColPx([]);
      mergesRef.current = [];
    }
    try {
      // Vista de solo lectura con estilos básicos (ancho de columnas, merges, negritas)
      const html = XLSX.utils.sheet_to_html(ws, { id: 'styled-view', editable: false });
      setStyledHtml(html);
    } catch {
      setStyledHtml('');
    }
  }, [campaign, finance]);

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

  const cols = displayGrid[0]?.length || MIN_COLS;

  function markDirty() {
    setDirty(true);
    setMsg('');
  }

  function setCell(row: number, col: number, value: string) {
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[row][col] = value;
      return next;
    });
    markDirty();
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

  /** Escribe el grid actual en la hoja activa del workbook (sin generar Blob). */
  function flushGridToWorkbook() {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return;
    const ws = wb.Sheets[activeSheet] || {};
    let maxRow = 0;
    let maxCol = 0;
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const text = grid[r][c];
        const existing = ws[addr] as XLSX.CellObject | undefined;
        const existingText =
          existing?.f
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
          ws[addr] = {
            ...(existing || {}),
            t: 'n',
            f: text.slice(1),
            v: undefined,
            w: undefined,
          } as XLSX.CellObject;
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
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    wb.Sheets[activeSheet] = ws;
  }

  function switchSheet(name: string) {
    if (name === activeSheet) return;
    const wb = workbookRef.current;
    if (!wb || !wb.Sheets[name]) return;
    const hadPendingChanges = dirty;
    if (dirty) flushGridToWorkbook();
    setActiveSheet(name);
    loadSheet(wb, name);
    /*
     * `dirty` NO se apaga aquí. Los cambios de la hoja anterior están en el
     * libro en memoria, pero todavía no en el servidor: apagarlo dejaba
     * «Guardar» deshabilitado y Ctrl+S mudo, así que el mensaje prometía un
     * guardado que la persona ya no podía hacer y al cerrar se perdía la hoja.
     */
    setMsg(
      hadPendingChanges
        ? `Cambiaste a «${name}» — lo de la hoja anterior se guarda al pulsar Guardar`
        : '',
    );
  }

  function addSheet() {
    const wb = workbookRef.current;
    if (!wb || !canEdit) return;
    if (dirty) flushGridToWorkbook();
    let n = sheetNames.length + 1;
    let name = `Hoja${n}`;
    while (wb.SheetNames.includes(name)) {
      n += 1;
      name = `Hoja${n}`;
    }
    const ws = XLSX.utils.aoa_to_sheet([['']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
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
    if (dirty) flushGridToWorkbook();
    const idx = wb.SheetNames.indexOf(activeSheet);
    wb.Sheets[next] = wb.Sheets[activeSheet];
    delete wb.Sheets[activeSheet];
    wb.SheetNames[idx] = next;
    setSheetNames([...wb.SheetNames]);
    setActiveSheet(next);
    setDirty(true);
  }

  function insertRows(at: number, n = 1) {
    setGrid((prev) => {
      const width = prev[0]?.length || cols;
      const blank = Array.from({ length: n }, () => Array(width).fill(''));
      return [...prev.slice(0, at), ...blank, ...prev.slice(at)];
    });
    setVisibleRows((v) => v + n);
    markDirty();
  }

  function deleteRow(at: number) {
    if (grid.length <= 1) return;
    setGrid((prev) => prev.filter((_, i) => i !== at));
    if (sel?.r === at) setSel(null);
    else if (sel && sel.r > at) setSel({ r: sel.r - 1, c: sel.c });
    markDirty();
  }

  function duplicateRow(at: number) {
    setGrid((prev) => {
      const copy = prev[at]?.slice() || Array(cols).fill('');
      return [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)];
    });
    setVisibleRows((v) => v + 1);
    markDirty();
  }

  function insertColumn(at: number) {
    setGrid((prev) => prev.map((r) => [...r.slice(0, at), '', ...r.slice(at)]));
    markDirty();
  }

  function deleteColumn(at: number) {
    if (cols <= 1) return;
    setGrid((prev) => prev.map((r) => r.filter((_, i) => i !== at)));
    if (sel?.c === at) setSel(null);
    else if (sel && sel.c > at) setSel({ r: sel.r, c: sel.c - 1 });
    markDirty();
  }

  function fillDown() {
    if (!sel || sel.r >= grid.length - 1) return;
    const value = grid[sel.r][sel.c];
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      for (let r = sel.r + 1; r < next.length; r += 1) {
        if (next[r][sel.c].trim()) break;
        next[r][sel.c] = value;
      }
      return next;
    });
    markDirty();
  }

  function clearRow(at: number) {
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[at] = next[at].map(() => '');
      return next;
    });
    markDirty();
  }

  /** Inserta un renglón CONCEPTO | CANTIDAD | COSTO | COSTO TOTAL (=B×C). */
  function insertCampaignConcept() {
    const at = sel ? sel.r + 1 : Math.min(grid.length, 8);
    setGrid((prev) => {
      const width = Math.max(prev[0]?.length || 0, 4);
      const row = Array(width).fill('');
      const next = [...prev.slice(0, at), row, ...prev.slice(at)];
      const excel = at + 1;
      next[at][3] = `=B${excel}*C${excel}`;
      return next;
    });
    setVisibleRows((v) => Math.max(v, at + 5));
    setSel({ r: at, c: 0 });
    markDirty();
    setMsg(
      'Concepto insertado — CANTIDAD×COSTO → COSTO TOTAL. En convenios: descripción en CANTIDAD y cortesías en COSTO.',
    );
  }

  /** Recalcula COSTO TOTAL = CANTIDAD × COSTO en la fila seleccionada. */
  function computeSelectedRowTotals() {
    if (!sel) return;
    const r = sel.r;
    const qty = parseMoney(grid[r][1] || '');
    const cost = parseMoney(grid[r][2] || '');
    if (!qty && !cost) {
      setMsg('Esta fila no tiene cantidad/costo numéricos (¿es un convenio con cortesías?)');
      return;
    }
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][3] = String(Math.round(qty * cost * 100) / 100);
      return next;
    });
    markDirty();
  }

  function sumColumn(col: number) {
    let total = 0;
    for (const row of displayGrid) {
      total += parseMoney(row[col] || '');
    }
    setMsg(`Suma columna ${colLabel(col)}: ${total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`);
  }

  /** Reescribe en el libro solo las celdas que cambiaron y devuelve el .xlsx. */
  const buildFile = useCallback((): Blob | null => {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return null;
    flushGridToWorkbook();
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    // flushGridToWorkbook cierra sobre grid/activeSheet actuales
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, activeSheet]);

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      /*
       * Vía buena: mandar SOLO las celdas tocadas y que el servidor las aplique
       * con ExcelJS sobre el archivo real. Reconstruir el libro aquí con la
       * edición Community de SheetJS emite una fuente fija y tira formato
       * condicional y validaciones de TODO el libro, incluso de las hojas que
       * nadie abrió.
       */
      if (onSaveCells && /\.xlsx$/i.test(fileName)) {
        flushGridToWorkbook();
        const cells = collectPendingCells();
        if (!cells.length) {
          setDirty(false);
          setMsg('Sin cambios que guardar');
          return;
        }
        await onSaveCells({ cells });
        pendingCellsRef.current = new Map();
      } else {
        // Respaldo para `.xls` antiguos y para quien no pase `onSaveCells`.
        const blob = buildFile();
        if (!blob) throw new Error('No hay hoja abierta');
        const name = /\.xlsx?$/i.test(fileName)
          ? fileName.replace(/\.xls$/i, '.xlsx')
          : `${fileName}.xlsx`;
        await onSave(blob, name);
      }
      setDirty(false);
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
      const res = await api<{ url: string; message?: string }>(`/uploads/${fileId}/pdf`, {
        method: 'POST',
      });
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

  // Esc quita la selección (y sale del input de celda / barra de fórmulas).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || !sel) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.classList.contains('sheet__cell') ||
        el?.classList.contains('sheet-fxbar__input')
      ) {
        el.blur();
      }
      setSel(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const shownRows = useMemo(() => displayGrid.slice(0, visibleRows), [displayGrid, visibleRows]);
  const selLabel = sel ? `${colLabel(sel.c)}${sel.r + 1}` : '';
  const fxValue = sel ? (grid[sel.r]?.[sel.c] ?? '') : '';

  function setFxValue(value: string) {
    if (!sel || !canEdit) return;
    setCell(sel.r, sel.c, value);
  }

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

  return (
    <ExpandBox title={fileName} dirty={dirty}>
      <div className="stack sheet-editor">
        {blockNotice}

        {showCoach ? (
          <div className="editor-coach" role="note" style={{ alignItems: 'center' }}>
            <p className="editor-coach__text" style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Copia de trabajo interna · Ctrl+S guarda · Esc quita la selección ·{' '}
              {campaign
                ? 'Campaña: «+ Concepto» → CANTIDAD×COSTO → total; en convenios, describe en CANTIDAD y cortesías en COSTO.'
                : finance
                ? 'Corrida: completa Ingresos y Egresos; «Σ Montos» verifica la columna C. El Resumen se actualiza al guardar.'
                : 'Edita celdas → Guardar → Salir en PDF.'}
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
                >
                  {n}
                </button>
              ))}
              {canEdit ? (
                <>
                  <button className="btn ghost btn-sm" type="button" onClick={addSheet} title="Agregar hoja">
                    + Hoja
                  </button>
                  <button
                    className="btn ghost btn-sm"
                    type="button"
                    onClick={renameActiveSheet}
                    title="Renombrar hoja activa"
                  >
                    Renombrar
                  </button>
                </>
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
              <button
                className="btn ghost btn-sm"
                type="button"
                onClick={() => setShowStyled((v) => !v)}
                title="Vista con formato (combina celdas, anchos, negritas)"
              >
                {showStyled ? 'Vista simple' : 'Vista con formato'}
              </button>
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
              onChange={(e) => setFxValue(e.target.value)}
            />
          </div>
        </div>

        {/* Nota compacta unificada — se muestra solo si no ha sido descartada (reduce altura) */}
        {!showCoach && showStyled ? (
          <p className="sheet-note muted kpi-sub" role="note">
            Vista con formato: solo lectura.
          </p>
        ) : null}

        {canEdit ? (
          <div className="sheet-tools" role="toolbar" aria-label="Herramientas de hoja">
            <div className="sheet-tools__group">
              <span className="sheet-tools__label">Filas</span>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!sel}
                onClick={() => sel && insertRows(sel.r, 1)}
                title="Insertar fila arriba de la selección"
              >
                + Fila
              </button>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!sel}
                onClick={() => sel && duplicateRow(sel.r)}
              >
                Duplicar fila
              </button>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!sel}
                onClick={() => sel && clearRow(sel.r)}
              >
                Vaciar fila
              </button>
              <button
                className="btn ghost btn-sm btn-danger"
                type="button"
                disabled={!sel}
                onClick={() => sel && deleteRow(sel.r)}
              >
                − Fila
              </button>
              <button className="btn ghost btn-sm" type="button" onClick={() => insertRows(grid.length, 10)}>
                + 10 al final
              </button>
            </div>
            <div className="sheet-tools__group">
              <span className="sheet-tools__label">Columnas</span>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!sel}
                onClick={() => sel && insertColumn(sel.c)}
              >
                + Columna
              </button>
              <button
                className="btn ghost btn-sm btn-danger"
                type="button"
                disabled={!sel}
                onClick={() => sel && deleteColumn(sel.c)}
              >
                − Columna
              </button>
              <button className="btn ghost btn-sm" type="button" onClick={() => insertColumn(cols)}>
                + Columna al final
              </button>
            </div>
            <div className="sheet-tools__group">
              <span className="sheet-tools__label">Rápido</span>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!sel}
                onClick={fillDown}
                title="Copia el valor hacia abajo hasta la primera celda ocupada"
              >
                Llenar abajo
              </button>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!sel}
                onClick={() => sel && sumColumn(sel.c)}
              >
                Sumar columna
              </button>
            </div>
            {campaign ? (
              <div className="sheet-tools__group sheet-tools__group--campaign">
                <span className="sheet-tools__label">Campaña</span>
                <button className="btn btn-sm" type="button" onClick={insertCampaignConcept}>
                  + Concepto (con totales)
                </button>
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  disabled={!sel}
                  onClick={computeSelectedRowTotals}
                  title="COSTO TOTAL = CANTIDAD × COSTO"
                >
                  Calcular fila
                </button>
                <button className="btn ghost btn-sm" type="button" onClick={() => sumColumn(3)}>
                  Σ COSTO TOTAL
                </button>
              </div>
            ) : null}
            {finance ? (
              <div className="sheet-tools__group sheet-tools__group--campaign">
                <span className="sheet-tools__label">Corrida</span>
                <button className="btn ghost btn-sm" type="button" onClick={() => sumColumn(2)}>
                  Σ Montos (col C)
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

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
                ? 'Haz clic en una celda y empieza a escribir. O agrega filas desde la barra de herramientas.'
                : 'Este libro no tiene datos visibles en esta hoja.'}
            </p>
          </div>
        ) : (
          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th className="sheet__corner" scope="col">
                    <span className="sr-only">Fila / columna</span>
                  </th>
                  {Array.from({ length: cols }, (_, c) => (
                    <th
                      key={c}
                      scope="col"
                      className={sel?.c === c ? 'sheet__col--sel' : undefined}
                      style={{ width: (colPx[c] || 104) + 'px', minWidth: (colPx[c] || 104) + 'px' }}
                    >
                      {colLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row, r) => (
                  <tr key={r} className={sel?.r === r ? 'sheet__row--sel' : undefined}>
                    <th className="sheet__rownum" scope="row">
                      {r + 1}
                    </th>
                    {row.map((cell, c) => {
                      const isSel = sel?.r === r && sel?.c === c;
                      // Calcular overflow a través de vecinos vacíos consecutivos
                      let nextEmpty = false;
                      let extra = 0;
                      for (let n = c + 1; n < row.length; n += 1) {
                        const empty = (row[n] ?? '').toString().trim() === '';
                        const mergedStartsHere = mergesRef.current.some((m) => m.s.r === r && m.s.c === n);
                        if (!empty || mergedStartsHere) break;
                        nextEmpty = true;
                        extra += colPx[n] || 104;
                      }
                      const merge = mergesRef.current.find((m) => m.s.r === r && m.s.c === c);
                      let displayWidth = colPx[c] || 104;
                      if (merge) {
                        for (let i = merge.s.c + 1; i <= merge.e.c; i += 1) displayWidth += (colPx[i] || 104);
                      } else if (nextEmpty) {
                        displayWidth += extra;
                      }
                      return (
                        <td
                          key={c}
                          className={isSel ? 'sheet__td--sel' : undefined}
                          style={{ position: 'relative' }}
                        >
                          {!isSel ? (
                            <span
                              className={`sheet__display${nextEmpty || merge ? ' is-over' : ''}`}
                              style={{
                                minWidth: (colPx[c] || 104) - 10,
                                width: Math.max(displayWidth - 10, (colPx[c] || 104) - 10),
                              }}
                              aria-hidden="true"
                            >
                              {cell}
                            </span>
                          ) : null}
                          <input
                            className="sheet__cell"
                            value={isSel ? (grid[r]?.[c] ?? '') : cell}
                            readOnly={!canEdit}
                            aria-label={`Celda ${colLabel(c)}${r + 1}`}
                            onFocus={() => setSel({ r, c })}
                            onChange={(e) => setCell(r, c, e.target.value)}
                            style={{ minWidth: (colPx[c] || 104) - 2, width: '100%' }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showStyled && styledHtml ? (
          <div className="sheet-wrap" aria-label="Vista con formato" role="region" style={{ overflowX: 'auto' }}>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: styledHtml }} />
          </div>
        ) : null}

        {!showStyled && displayGrid.length > visibleRows ? (
          <button
            className="btn ghost btn-sm"
            type="button"
            onClick={() => setVisibleRows((v) => v + ROW_PAGE)}
          >
            Ver más filas ({displayGrid.length - visibleRows} restantes)
          </button>
        ) : null}

        <p className="muted kpi-sub sheet-footnote">
          Las fórmulas con = se conservan. Si escribes un número encima, la celda pasa a valor fijo —
          igual que en Excel.
        </p>

        {fileId && showHistory ? (
          <div className="sheet-history" role="region" aria-label="Historial de ediciones">
            <div className="sheet-history__head">
              <div>
                <h3 className="sheet-history__title">Historial de ediciones</h3>
                <p className="sheet-history__sub muted kpi-sub">
                  Quién guardó o generó PDF, y cuándo.
                </p>
              </div>
              <button
                className="btn ghost btn-sm"
                type="button"
                onClick={() => setShowHistory(false)}
              >
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
    </ExpandBox>
  );
}
