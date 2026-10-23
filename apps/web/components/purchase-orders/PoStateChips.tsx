'use client';

import type { PoStateKey } from '@/lib/po-payment';

/**
 * Chips por estado preciso de la OC («Autorizada · sin comprobante 2»), con su
 * cuenta. Tocar el elegido lo quita. Los usan la torre de OC y la pestaña OC del
 * evento; solo se pintan cuando hay más de un estado que separar.
 */
export function PoStateChips({
  chips,
  value,
  onChange,
}: {
  chips: Array<{ key: PoStateKey; label: string; count: number }>;
  value: PoStateKey | null;
  onChange: (key: PoStateKey | null) => void;
}) {
  return (
    <div className="chip-row oc-state-chips" role="group" aria-label="Filtrar por lo que le falta">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`chip ${value === c.key ? 'is-on' : ''}`}
          aria-pressed={value === c.key}
          onClick={() => onChange(value === c.key ? null : c.key)}
        >
          {c.label}
          <span className="chip__count">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
