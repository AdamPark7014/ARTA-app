'use client';

import type { FieldChange } from '@/lib/api';

const KIND_LABEL: Record<FieldChange['kind'], string> = {
  added: 'Añadido',
  removed: 'Quitado',
  changed: 'Cambiado',
};

/**
 * El diff campo por campo, tal como lo calculó el servidor.
 *
 * Se agrupa por sección para que se lea como el formato, no como un volcado de
 * JSON: «Datos del show → Aforo autorizado: 4200 → 3800».
 */
export function FieldDiff({ changes, empty = 'Sin cambios' }: { changes: FieldChange[]; empty?: string }) {
  if (!changes.length) return <p className="muted kpi-sub">{empty}</p>;

  const bySection = new Map<string, FieldChange[]>();
  for (const change of changes) {
    bySection.set(change.scope, [...(bySection.get(change.scope) || []), change]);
  }

  return (
    <div className="field-diff">
      {[...bySection.entries()].map(([scope, list]) => (
        <div className="field-diff__group" key={scope}>
          <div className="field-diff__scope">{scope}</div>
          <ul className="field-diff__list">
            {list.map((change) => (
              <li className={`field-diff__row field-diff__row--${change.kind}`} key={change.key}>
                <span className="field-diff__label">{change.label}</span>
                <span className="field-diff__values">
                  {change.before !== null ? (
                    <span className="field-diff__before">{change.before}</span>
                  ) : (
                    <span className="field-diff__before muted">vacío</span>
                  )}
                  <span className="field-diff__arrow" aria-hidden>
                    →
                  </span>
                  {change.after !== null ? (
                    <span className="field-diff__after">{change.after}</span>
                  ) : (
                    <span className="field-diff__after muted">vacío</span>
                  )}
                </span>
                <span className="sr-only">{KIND_LABEL[change.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
