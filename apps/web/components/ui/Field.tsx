'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

/**
 * Campo de formulario con su etiqueta arriba (14/500), ayuda debajo (12) y error en
 * una línea ligada al control (aria-invalid + aria-describedby + role=alert). Se
 * marcan los opcionales, no los obligatorios: « · opcional» en la etiqueta.
 *
 *   <Field label="Monto" hint="Sin IVA." error={errors.amount} optional>
 *     <input className="field" inputMode="decimal" value={…} onChange={…} />
 *   </Field>
 *
 * El control hijo recibe `id`, `aria-invalid` y `aria-describedby` solo. Para
 * validar: `<form noValidate>`, al enviar se calculan los errores y se enfoca el
 * primer `[aria-invalid="true"]`; el botón principal nunca se apaga para validar.
 */
export function Field({
  label,
  hint,
  error,
  optional = false,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;
  const controlId = (isValidElement(children) && (children.props.id as string | undefined)) || id;

  return (
    <div className={`fieldx ${error ? 'is-invalid' : ''} ${className}`.trim()}>
      <label className="fieldx__label" htmlFor={controlId}>
        {label}
        {optional ? <span className="fieldx__optional"> · opcional</span> : null}
      </label>
      {control}
      {hint ? (
        <p className="fieldx__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="fieldx__error" id={errId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Enfoca el primer campo marcado como inválido dentro de `root` (el formulario). */
export function focusFirstInvalid(root: HTMLElement | null) {
  root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
