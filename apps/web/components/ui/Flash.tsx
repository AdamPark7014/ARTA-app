'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const STAY_MS = 5000;

/**
 * Ver `FlashMessage` en PageChrome: es el que usan las pantallas.
 *
 * Con `onDismiss` es un aviso flotante (resultado de una acción): abajo al centro,
 * por encima de la barra inferior del teléfono, y se cierra solo a los 5 s salvo
 * los errores, que esperan a que se lean. Pasar el ratón o el foco encima detiene
 * el reloj. Sin `onDismiss` es un estado en su lugar, dentro del mosaico.
 */
export function Flash({
  variant,
  children,
  onDismiss,
}: {
  variant: 'info' | 'success' | 'warn' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [held, setHeld] = useState(false);
  const floats = !!onDismiss;
  const closesAlone = floats && variant !== 'error';

  // Otro mensaje vuelve a dar tiempo para leerlo.
  useEffect(() => {
    if (!closesAlone || held) return;
    const id = window.setTimeout(() => dismiss.current?.(), STAY_MS);
    return () => window.clearTimeout(id);
  }, [closesAlone, held, children]);

  return (
    <div
      className={`flash flash--${variant} ${floats ? 'flash--float' : ''}`}
      role={variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={floats ? () => setHeld(true) : undefined}
      onMouseLeave={floats ? () => setHeld(false) : undefined}
      onFocus={floats ? () => setHeld(true) : undefined}
      onBlur={floats ? () => setHeld(false) : undefined}
    >
      <span className="flash__body">{children}</span>
      {onDismiss ? (
        <button type="button" className="flash__dismiss" onClick={onDismiss} aria-label="Cerrar aviso">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
