'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { SaveFile } from '@/lib/file-save';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { useSaveHotkey } from '@/lib/use-save-hotkey';

type Props = {
  url: string;
  fileName: string;
  canEdit: boolean;
  /** Dónde se guarda el .xlsx reconstruido */
  onSave: SaveFile;
  /** Se llama tras guardar, para refrescar la lista de quien lo muestra */
  onSaved?: () => void | Promise<void>;
  /**
   * Modo campaña: barra de herramientas de gastos (insertar concepto, totales
   * B×C / E×F, llenado rápido). Ideal para «GASTOS DE PUBLICIDAD Y CONVENIOS».
   */
  variant?: 'default' | 'campaign';
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
  canEdit,
  onSave,
  onSaved,
  variant = 'default',
}: Props) {
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [grid, setGrid] = useState<Grid>([]);
  const [visibleRows, setVisibleRows] = useState(ROW_PAGE);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState<Sel>(null);
  const campaign = variant === 'campaign';

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
    setGrid(padGrid(withFormulas as unknown[][], MIN_ROWS, campaign ? MIN_COLS : 8));
    setVisibleRows(ROW_PAGE);
    setSel(null);
  }, [campaign]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setDirty(false);
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
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
  }, [url, loadSheet]);

  const cols = grid[0]?.length || MIN_COLS;

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

  function switchSheet(name: string) {
    if (dirty && !confirm('Hay cambios sin guardar en esta hoja. ¿Cambiar de todos modos?')) return;
    const wb = workbookRef.current;
    if (!wb) return;
    setActiveSheet(name);
    loadSheet(wb, name);
    setDirty(false);
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

  /** Inserta un renglón de concepto con fórmulas de total (campaña). */
  function insertCampaignConcept() {
    const at = sel ? sel.r + 1 : Math.min(grid.length, 9);
    const excelRow = at + 1; // 1-based after insert we'll fix formulas for that row
    setGrid((prev) => {
      const width = Math.max(prev[0]?.length || 0, 9);
      const row = Array(width).fill('');
      // D = B*C , G = E*F  (se ajusta al número de fila Excel tras insertar)
      const blank = Array.from({ length: 1 }, () => {
        const r = row.slice();
        return r;
      });
      const next = [...prev.slice(0, at), ...blank, ...prev.slice(at)];
      const excel = at + 1;
      next[at][3] = `=B${excel}*C${excel}`;
      next[at][6] = `=E${excel}*F${excel}`;
      return next;
    });
    setVisibleRows((v) => Math.max(v, at + 5));
    setSel({ r: at, c: 0 });
    markDirty();
    void excelRow;
    setMsg('Renglón de concepto insertado — escribe en CONCEPTO, CANTIDAD y COSTO');
  }

  /** Recalcula totales visibles B×C y E×F en la fila seleccionada (valores, no fórmula). */
  function computeSelectedRowTotals() {
    if (!sel) return;
    const r = sel.r;
    const qty = parseMoney(grid[r][1] || '');
    const cost = parseMoney(grid[r][2] || '');
    const qtyArta = parseMoney(grid[r][4] || '');
    const costArta = parseMoney(grid[r][5] || '');
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][3] = qty || cost ? String(Math.round(qty * cost * 100) / 100) : next[r][3];
      next[r][6] =
        qtyArta || costArta ? String(Math.round(qtyArta * costArta * 100) / 100) : next[r][6];
      return next;
    });
    markDirty();
  }

  function sumColumn(col: number) {
    let total = 0;
    for (const row of grid) {
      total += parseMoney(row[col] || '');
    }
    setMsg(`Suma columna ${colLabel(col)}: ${total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`);
  }

  /** Reescribe en el libro solo las celdas que cambiaron y devuelve el .xlsx. */
  const buildFile = useCallback((): Blob | null => {
    const wb = workbookRef.current;
    if (!wb || !activeSheet) return null;
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

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }, [grid, activeSheet]);

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const blob = buildFile();
      if (!blob) throw new Error('No hay hoja abierta');
      const name = /\.xlsx?$/i.test(fileName)
        ? fileName.replace(/\.xls$/i, '.xlsx')
        : `${fileName}.xlsx`;
      await onSave(blob, name);
      setDirty(false);
      setMsg('Guardado');
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  useSaveHotkey(canEdit && dirty && !saving, save);

  const shownRows = useMemo(() => grid.slice(0, visibleRows), [grid, visibleRows]);
  const selLabel = sel ? `${colLabel(sel.c)}${sel.r + 1}` : 'ninguna';

  if (loading) return <p className="muted kpi-sub">Abriendo hoja de cálculo…</p>;
  if (error && !grid.length) {
    return (
      <div className="form-error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <ExpandBox title={fileName} defaultExpanded dirty={dirty}>
      <div className="stack">
        <div className="sheet-toolbar">
          {sheetNames.length > 1 ? (
            <label className="sheet-toolbar__sheets">
              <span className="muted kpi-sub">Hoja</span>
              <select
                className="field field--select"
                value={activeSheet}
                onChange={(e) => switchSheet(e.target.value)}
              >
                {sheetNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="muted kpi-sub">
              {activeSheet || 'Hoja 1'}
              {sel ? ` · Celda ${selLabel}` : ''}
            </span>
          )}

          <div className="row row--tight sheet-toolbar__actions">
            {canEdit ? (
              <>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={!dirty || saving}
                  onClick={save}
                  title="Ctrl+S / ⌘S"
                >
                  {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}
                </button>
              </>
            ) : (
              <span className="muted kpi-sub">Solo lectura</span>
            )}
            <a className="btn ghost btn-sm" href={url} download={fileName}>
              Descargar
            </a>
          </div>
        </div>

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
                  title="COSTO TOTAL = CANTIDAD × COSTO y lo mismo en columnas ARTA"
                >
                  Calcular fila
                </button>
                <button className="btn ghost btn-sm" type="button" onClick={() => sumColumn(3)}>
                  Σ Total
                </button>
                <button className="btn ghost btn-sm" type="button" onClick={() => sumColumn(6)}>
                  Σ Total ARTA
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {campaign ? (
          <p className="muted kpi-sub">
            Formato de gastos: CONCEPTO · CANTIDAD · COSTO · TOTAL · CANTIDAD ARTA · COSTO ARTA ·
            TOTAL ARTA · PAGADO · POR PAGAR. Haz clic en una celda para seleccionar la fila y usar
            las herramientas.
          </p>
        ) : null}

        {msg ? (
          <div className="module-banner module-banner--ok" role="status">
            {msg}
          </div>
        ) : null}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th className="sheet__corner" />
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c}>{colLabel(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row, r) => (
                <tr key={r} className={sel?.r === r ? 'sheet__row--sel' : undefined}>
                  <th className="sheet__rownum">{r + 1}</th>
                  {row.map((cell, c) => (
                    <td key={c} className={sel?.r === r && sel?.c === c ? 'sheet__td--sel' : undefined}>
                      <input
                        className="sheet__cell"
                        value={cell}
                        readOnly={!canEdit}
                        aria-label={`Celda ${colLabel(c)}${r + 1}`}
                        onFocus={() => setSel({ r, c })}
                        onChange={(e) => setCell(r, c, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {grid.length > visibleRows ? (
          <button
            className="btn ghost btn-sm"
            type="button"
            onClick={() => setVisibleRows((v) => v + ROW_PAGE)}
          >
            Ver más filas ({grid.length - visibleRows} restantes)
          </button>
        ) : null}

        <p className="muted kpi-sub">
          Las fórmulas que empiezan con = se guardan como fórmula. Si escribes un número encima, la
          celda pasa a valor fijo — igual que en Excel.
        </p>
      </div>
    </ExpandBox>
  );
}
