'use client';

import { useMemo, useRef, useState } from 'react';
import {
  NO_LABEL,
  YES_LABEL,
  tableRowsWithContent,
  type ChecklistColumn,
  type ChecklistItem,
  type ChecklistRow,
  type EventFile,
} from '@/components/events/event-detail.types';

type Patch = (patch: Partial<ChecklistItem>) => void;

/* ── SÍ / NO ─────────────────────────────────────────────────────────────── */

export function YesNoField({ item, readOnly, onPatch }: { item: ChecklistItem; readOnly: boolean; onPatch: Patch }) {
  const value = String(item.value ?? '').trim().toUpperCase();
  const isYes = value === YES_LABEL || value === 'SI' || value === 'YES';
  const isNo = value === NO_LABEL;
  return (
    <div className="hub-yesno" role="radiogroup" aria-label={item.label}>
      <button
        type="button"
        role="radio"
        aria-checked={isYes}
        className={`hub-yesno__btn ${isYes ? 'is-on' : ''}`}
        disabled={readOnly}
        onClick={() => onPatch({ value: isYes ? null : YES_LABEL })}
      >
        Sí
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isNo}
        className={`hub-yesno__btn ${isNo ? 'is-on is-no' : ''}`}
        disabled={readOnly}
        onClick={() => onPatch({ value: isNo ? null : NO_LABEL })}
      >
        No
      </button>
    </div>
  );
}

/* ── Adjunto del formato ─────────────────────────────────────────────────── */

const isHttp = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());

/**
 * Lo que en el Word del cliente era un «BOTÓN»: el archivo vive en el propio
 * formato (se sube aquí mismo o se elige entre sus adjuntos) o es un link.
 * Nada obliga a salir del sistema para consultarlo.
 */
export function AttachmentField({
  item,
  readOnly,
  files,
  onPatch,
  onUpload,
}: {
  item: ChecklistItem;
  readOnly: boolean;
  /** Adjuntos ya subidos a este formato. */
  files: EventFile[];
  onPatch: Patch;
  onUpload?: (file: File) => Promise<EventFile | void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const value = String(item.value ?? '');
  const linked = item.fileId ? files.find((f) => f.id === item.fileId) : undefined;
  const href = linked?.url || (isHttp(value) ? value.trim() : '');
  const shown = linked?.fileName || value;

  async function pick(file: File) {
    if (!onUpload) return;
    setBusy(true);
    try {
      const created = await onUpload(file);
      if (created && created.id) onPatch({ fileId: created.id, value: created.fileName });
      else onPatch({ value: file.name });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hub-attach">
      {shown ? (
        <div className="hub-attach__current">
          <span className="hub-attach__icon" aria-hidden>
            {linked ? '▤' : isHttp(value) ? '↗' : '·'}
          </span>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="hub-attach__name">
              {shown}
            </a>
          ) : (
            <span className="hub-attach__name">{shown}</span>
          )}
          {!readOnly ? (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                onPatch({ fileId: null, value: '' });
                setLinking(false);
              }}
            >
              Quitar
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="hub-attach__actions">
          {onUpload ? (
            <>
              <button
                type="button"
                className="btn-quiet"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? 'Subiendo…' : shown ? 'Reemplazar archivo' : 'Subir archivo'}
              </button>
              <input
                ref={inputRef}
                type="file"
                hidden
                accept=".pdf,.xlsx,.xls,.csv,.docx,image/*,video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void pick(f);
                }}
              />
            </>
          ) : null}
          {files.length ? (
            <select
              className="hub-attach__pick"
              aria-label={`Elegir adjunto para ${item.label}`}
              value={linked?.id || ''}
              onChange={(e) => {
                const f = files.find((x) => x.id === e.target.value);
                if (f) onPatch({ fileId: f.id, value: f.fileName });
              }}
            >
              <option value="">Elegir de los adjuntos…</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fileName}
                </option>
              ))}
            </select>
          ) : null}
          {!linking && !linked ? (
            <button type="button" className="btn-quiet" onClick={() => setLinking(true)}>
              {isHttp(value) ? 'Cambiar link' : 'Pegar link'}
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly && linking && !linked ? (
        <input
          type="url"
          autoFocus
          placeholder="https://drive.google.com/…"
          value={isHttp(value) ? value : ''}
          onChange={(e) => onPatch({ fileId: null, value: e.target.value })}
          onBlur={() => setLinking(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setLinking(false);
          }}
        />
      ) : null}
    </div>
  );
}

/* ── Tabla ───────────────────────────────────────────────────────────────── */

const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

function emptyRow(columns: ChecklistColumn[]): ChecklistRow {
  return Object.fromEntries(columns.map((c) => [c.id, null]));
}

function isNumeric(c: ChecklistColumn) {
  return c.type === 'number' || c.type === 'money';
}

function columnSum(rows: ChecklistRow[], column: ChecklistColumn): number | null {
  let sum = 0;
  let any = false;
  for (const row of rows) {
    const raw = row[column.id];
    if (raw === null || raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * Rooming, minuto a minuto, medios, avenidas: se capturan renglón por renglón
 * aquí mismo y salen en el PDF con sus totales. Sin Excel de por medio.
 */
export function TableField({
  item,
  readOnly,
  onPatch,
}: {
  item: ChecklistItem;
  readOnly: boolean;
  onPatch: Patch;
}) {
  const columns = useMemo(() => (item.columns || []).filter((c) => c.id), [item.columns]);
  const rows = useMemo<ChecklistRow[]>(() => {
    const base = Array.isArray(item.rows) ? item.rows : [];
    // Siempre hay un renglón en blanco para empezar a escribir.
    if (!readOnly && (!base.length || Object.values(base[base.length - 1]).some((v) => v !== null && v !== ''))) {
      return [...base, emptyRow(columns)];
    }
    return base.length ? base : [emptyRow(columns)];
  }, [item.rows, columns, readOnly]);

  if (!columns.length) return <p className="t-muted t-small">Tabla sin columnas.</p>;

  const totals = columns.map((c) => (c.total ? columnSum(tableRowsWithContent(item.rows), c) : null));
  const hasTotals = columns.some((c) => c.total);
  const totalCols = columns.filter((c) => c.total);
  const grand = totals.reduce<number>((s, v) => s + (v ?? 0), 0);

  function commit(next: ChecklistRow[]) {
    // Los renglones vacíos del final no se guardan.
    const trimmed = [...next];
    while (trimmed.length && !Object.values(trimmed[trimmed.length - 1]).some((v) => v !== null && v !== '')) {
      trimmed.pop();
    }
    onPatch({ rows: trimmed });
  }

  function setCell(r: number, c: ChecklistColumn, raw: string) {
    const next = rows.map((row) => ({ ...row }));
    next[r][c.id] = isNumeric(c) ? (raw === '' ? null : Number(raw)) : raw;
    commit(next);
  }

  function removeRow(r: number) {
    commit(rows.filter((_, i) => i !== r));
  }

  return (
    <div className="dtable-wrap hub-table">
      <table className="dtable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} className={isNumeric(c) ? 'num' : undefined} style={{ width: `${((c.width ?? 1) / columns.reduce((s, x) => s + (x.width ?? 1), 0)) * 100}%` }}>
                {c.label}
              </th>
            ))}
            {!readOnly ? <th className="col-act" aria-label="Acciones" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {columns.map((c) => {
                const raw = row[c.id];
                const value = raw === null || raw === undefined ? '' : String(raw);
                if (readOnly) {
                  return (
                    <td key={c.id} className={isNumeric(c) ? 'num' : undefined}>
                      {c.type === 'money' && value !== '' ? money(Number(value)) : value}
                    </td>
                  );
                }
                return (
                  <td key={c.id} className={isNumeric(c) ? 'num' : undefined}>
                    <input
                      className={`cell ${isNumeric(c) ? 'num' : ''}`}
                      type={c.type === 'date' ? 'date' : c.type === 'time' ? 'time' : isNumeric(c) ? 'number' : 'text'}
                      step={c.type === 'money' ? '0.01' : undefined}
                      inputMode={isNumeric(c) ? 'decimal' : undefined}
                      aria-label={`${c.label}, renglón ${r + 1}`}
                      placeholder={r === rows.length - 1 ? c.label : undefined}
                      value={value}
                      onChange={(e) => setCell(r, c, e.target.value)}
                    />
                  </td>
                );
              })}
              {!readOnly ? (
                <td className="col-act">
                  {r < rows.length - 1 || Object.values(row).some((v) => v !== null && v !== '') ? (
                    <button type="button" className="icon-btn" aria-label={`Quitar renglón ${r + 1}`} onClick={() => removeRow(r)}>
                      ×
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        {hasTotals ? (
          <tfoot>
            <tr>
              {columns.map((c, i) => (
                <td key={c.id} className={isNumeric(c) ? 'num' : undefined}>
                  {i === 0 ? item.totalLabel || 'Total' : c.total && totals[i] !== null ? (c.type === 'money' ? money(totals[i]!) : totals[i]!.toLocaleString('es-MX')) : ''}
                </td>
              ))}
              {!readOnly ? <td className="col-act" /> : null}
            </tr>
            {totalCols.length > 1 ? (
              <tr>
                <td colSpan={columns.length + (readOnly ? 0 : 1)} className="num">
                  {item.totalLabel || 'Total'} general: {totalCols[0].type === 'money' ? money(grand) : grand.toLocaleString('es-MX')}
                </td>
              </tr>
            ) : null}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
