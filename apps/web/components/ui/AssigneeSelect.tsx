'use client';

import { useState } from 'react';

export type DirectoryUser = { id: string; fullName: string; title?: string | null };

type Props = {
  value: string;
  directory: DirectoryUser[];
  onChange: (assigneeId: string) => void;
  disabled?: boolean;
  label: string;
  className?: string;
  /** Selector único (formulario de alta): monta el directorio de entrada. */
  eager?: boolean;
};

/**
 * Selector de responsable para tablas largas.
 *
 * Antes cada fila montaba el directorio completo: 300 tareas × 40 personas =
 * 12,000 `<option>` en el DOM y la tabla iba a tirones. Aquí las opciones se
 * materializan al enfocar o pasar el cursor, que es justo antes de que el
 * navegador abra el desplegable.
 */
export function AssigneeSelect({
  value,
  directory,
  onChange,
  disabled,
  label,
  className = 'field field--select field--assignee',
  eager,
}: Props) {
  const [ready, setReady] = useState(false);
  const current = directory.find((u) => u.id === value);

  const options = ready || eager ? directory : current ? [current] : [];

  function hydrate() {
    if (!ready) setReady(true);
  }

  return (
    <select
      className={className}
      aria-label={label}
      disabled={disabled}
      value={value}
      onFocus={hydrate}
      onPointerEnter={hydrate}
      onTouchStart={hydrate}
      onKeyDown={hydrate}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Sin asignar</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>
          {u.fullName}
          {u.title ? ` · ${u.title}` : ''}
        </option>
      ))}
    </select>
  );
}
