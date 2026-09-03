'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type FieldChange } from '@/lib/api';
import { FieldDiff } from '@/components/ui/FieldDiff';

type Revision = {
  id: string;
  revision: number;
  diffJson: { changes: FieldChange[]; summary: { added: number; removed: number; changed: number } } | null;
  note?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdAt: string;
  author?: { id: string; fullName: string } | null;
};

function describe(diff: Revision['diffJson']): string {
  if (!diff || !diff.changes.length) return 'Sin cambios registrados';
  const { added, removed, changed } = diff.summary;
  const parts: string[] = [];
  if (changed) parts.push(`${changed} cambiado${changed === 1 ? '' : 's'}`);
  if (added) parts.push(`${added} añadido${added === 1 ? '' : 's'}`);
  if (removed) parts.push(`${removed} quitado${removed === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/**
 * Historial de un documento con el diff campo por campo.
 *
 * Antes esta lista solo decía fecha, editor y nota, y el único botón era
 * «Restaurar». Ahora se puede responder «¿quién cambió el aforo de 4200 a 3800
 * y cuándo?» sin abrir la base de datos.
 */
export function RevisionHistory({
  path,
  reloadKey,
  emptyHint,
}: {
  /** Endpoint que devuelve las revisiones, p. ej. `/checklists/<id>/revisions`. */
  path: string;
  /** Cambia para volver a pedir el historial tras guardar. */
  reloadKey?: number | string;
  emptyHint?: string;
}) {
  const [rows, setRows] = useState<Revision[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Revision[]>(path)
      .then((data) => {
        setRows(data);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el historial'));
  }, [path]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (error) return <p className="form-error">{error}</p>;
  if (!rows) return <p className="muted kpi-sub">Cargando historial…</p>;
  if (!rows.length) {
    return (
      <p className="muted kpi-sub">
        {emptyHint || 'Todavía no hay revisiones. Se crean al guardar, no con el autoguardado.'}
      </p>
    );
  }

  return (
    <ul className="revision-list">
      {rows.map((r) => {
        const open = openId === r.id;
        const hasDiff = !!r.diffJson?.changes.length;
        return (
          <li className="revision-item" key={r.id}>
            <button
              type="button"
              className="revision-item__head"
              aria-expanded={open}
              disabled={!hasDiff}
              onClick={() => setOpenId(open ? null : r.id)}
            >
              <span className="revision-item__num">v{r.revision}</span>
              <span className="revision-item__main">
                <span className="revision-item__who">{r.author?.fullName || 'Sistema'}</span>
                <span className="muted kpi-sub">
                  {new Date(r.createdAt).toLocaleString('es-MX', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {' · '}
                  {r.diffJson ? describe(r.diffJson) : 'Versión histórica (sin diff)'}
                  {r.note ? ` · ${r.note}` : ''}
                </span>
              </span>
              {hasDiff ? (
                <span className="revision-item__caret" aria-hidden>
                  {open ? '▾' : '▸'}
                </span>
              ) : null}
            </button>
            {open && r.diffJson ? (
              <div className="revision-item__body">
                <FieldDiff changes={r.diffJson.changes} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
