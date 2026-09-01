'use client';

import type { ReactNode } from 'react';

type Props = {
  count: number;
  /** Sustantivo en singular: «tarea», «campaña». */
  noun: string;
  onClear: () => void;
  children: ReactNode;
  busy?: boolean;
};

/**
 * Barra flotante de acciones en lote. Aparece solo con selección activa, así
 * que no roba espacio vertical cuando no se usa.
 */
export function BulkBar({ count, noun, onClear, children, busy }: Props) {
  if (!count) return null;
  return (
    <div className="bulk-bar" role="region" aria-label="Acciones en lote">
      <span className="bulk-bar__count">
        {count} {noun}
        {count === 1 ? '' : 's'} seleccionada{count === 1 ? '' : 's'}
      </span>
      <div className="bulk-bar__actions row row--tight">
        {children}
        <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={onClear}>
          Quitar selección
        </button>
      </div>
    </div>
  );
}

type CheckProps = {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

/** Casilla de selección de fila / cabecera. */
export function SelectCheck({ checked, indeterminate, onChange, label }: CheckProps) {
  return (
    <input
      type="checkbox"
      className="select-check"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
