'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { SaveFile } from '@/lib/file-save';

type Props = {
  url: string;
  fileName: string;
  canEdit: boolean;
  /** Dónde se guarda el .xlsx reconstruido */
  onSave: SaveFile;
  /** Se llama tras guardar, para refrescar la lista de quien lo muestra */
  onSaved?: () => void | Promise<void>;
};

type Grid = string[][];

const MIN_ROWS = 24;
const MIN_COLS = 8;
const ROW_PAGE = 100;

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
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const n = Number(normalized);
    if (Number.isFinite(n)) return { v: n, t: 'n' };
  }
  return { v: text, t: 's' };
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
export function SheetEditor({ url, fileName, canEdit, onSave, onSaved }: Props) {
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

  const loadSheet = useCallback((wb: XLSX.WorkBook, name: string) => {
    const ws = wb.Sheets[name];
    const rows = ws
      ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][])
      : [];
    setGrid(padGrid(rows, MIN_ROWS, MIN_COLS));
    setVisibleRows(ROW_PAGE);
  }, []);

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

  function setCell(row: number, col: number, value: string) {
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[row][col] = value;
      return next;
    });
    setDirty(true);
    setMsg('');
  }

  function switchSheet(name: string) {
    if (dirty && !confirm('Hay cambios sin guardar en esta hoja. ¿Cambiar de todos modos?')) return;
    const wb = workbookRef.current;
    if (!wb) return;
    setActiveSheet(name);
    loadSheet(wb, name);
    setDirty(false);
  }

  function addRows(n = 10) {
    setGrid((prev) => [...prev, ...Array.from({ length: n }, () => Array(cols).fill(''))]);
    setVisibleRows((v) => v + n);
  }

  function addColumn() {
    setGrid((prev) => prev.map((r) => [...r, '']));
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
          existing === undefined || existing.v === undefined || existing.v === null
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

        const { v, t } = toCellValue(text);
        // Escribir encima de una fórmula la convierte en valor, como en Excel.
        ws[addr] = { ...(existing || {}), t, v, w: undefined, f: undefined } as XLSX.CellObject;
        delete (ws[addr] as Record<string, unknown>).f;
        delete (ws[addr] as Record<string, unknown>).w;
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

  const shownRows = useMemo(() => grid.slice(0, visibleRows), [grid, visibleRows]);

  if (loading) return <p className="muted kpi-sub">Abriendo hoja de cálculo…</p>;
  if (error && !grid.length) {
    return (
      <div className="form-error" role="alert">
        {error}
      </div>
    );
  }

  return (
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
          <span className="muted kpi-sub">{activeSheet || 'Hoja 1'}</span>
        )}

        <div className="row row--tight">
          {canEdit ? (
            <>
              <button className="btn ghost btn-sm" type="button" onClick={() => addRows(10)}>
                + 10 filas
              </button>
              <button className="btn ghost btn-sm" type="button" onClick={addColumn}>
                + columna
              </button>
              <button className="btn btn-sm" type="button" disabled={!dirty || saving} onClick={save}>
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

      {msg ? (
        <div className="module-banner module-banner--ok" role="status">
          {msg} · el archivo quedó actualizado para todo el equipo.
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
              <tr key={r}>
                <th className="sheet__rownum">{r + 1}</th>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input
                      className="sheet__cell"
                      value={cell}
                      readOnly={!canEdit}
                      aria-label={`Celda ${colLabel(c)}${r + 1}`}
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
        Las fórmulas y el formato de las celdas que no toques se conservan. Si escribes encima de una
        fórmula, esa celda pasa a ser un valor fijo — igual que en Excel.
      </p>
    </div>
  );
}
