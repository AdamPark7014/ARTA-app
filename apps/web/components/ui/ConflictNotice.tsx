'use client';

import { useState } from 'react';
import type { RevisionConflict } from '@/lib/api';
import { FieldDiff } from '@/components/ui/FieldDiff';

type Props = {
  conflict: RevisionConflict;
  /** Descartar lo mío y recargar lo que hay en el servidor. */
  onTakeTheirs: () => void;
  /** Reintentar el guardado sobre la revisión nueva, pisando lo suyo. */
  onKeepMine: () => void;
  onDismiss: () => void;
  busy?: boolean;
};

/**
 * Choque de edición concurrente.
 *
 * La regla es no perder lo tecleado: se enseña quién guardó y qué cambió, y se
 * deja elegir. Antes esto ni siquiera existía — el último en guardar ganaba y
 * el otro no se enteraba.
 */
export function ConflictNotice({ conflict, onTakeTheirs, onKeepMine, onDismiss, busy }: Props) {
  const [showDetail, setShowDetail] = useState(true);
  const changes = conflict.diff?.changes ?? [];

  return (
    <div className="conflict-notice" role="alert">
      <div className="conflict-notice__head">
        <div>
          <strong>{conflict.message}</strong>
          <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
            Tus cambios siguen en pantalla — no se ha perdido nada. Elige con qué versión quedarte.
          </p>
        </div>
        <button className="btn ghost btn-sm" type="button" onClick={onDismiss} aria-label="Cerrar aviso">
          ×
        </button>
      </div>

      {changes.length ? (
        <>
          <button
            className="btn ghost btn-sm"
            type="button"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((v) => !v)}
          >
            {showDetail ? 'Ocultar qué cambió' : `Ver qué cambió (${changes.length})`}
          </button>
          {showDetail ? (
            <div className="conflict-notice__diff">
              <p className="muted kpi-sub">De lo que tú tienes en pantalla, a lo que hay guardado:</p>
              <FieldDiff changes={changes} />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="row row--tight conflict-notice__actions">
        <button className="btn btn-sm" type="button" disabled={busy} onClick={onTakeTheirs}>
          Quedarme con lo guardado
        </button>
        <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={onKeepMine}>
          {busy ? 'Guardando…' : 'Guardar lo mío encima'}
        </button>
      </div>
    </div>
  );
}
