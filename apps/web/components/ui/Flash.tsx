'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const STAY_MS = 5000;

/** Ver `FlashMessage` en PageChrome: es el que usan las pantallas. */
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
  const floats = !!onDismiss;
  const closesAlone = floats && (variant === 'success' || variant === 'info');

  // Otro mensaje vuelve a dar tiempo para leerlo.
  useEffect(() => {
    if (!closesAlone) return;
    const id = window.setTimeout(() => dismiss.current?.(), STAY_MS);
    return () => window.clearTimeout(id);
  }, [closesAlone, children]);

  return (
    <div className={`flash flash--${variant} ${floats ? 'flash--float' : ''}`} role={variant === 'error' ? 'alert' : 'status'}>
      <span className="flash__body">{children}</span>
      {onDismiss ? (
        <button type="button" className="flash__dismiss" onClick={onDismiss} aria-label="Cerrar">
          ×
        </button>
      ) : null}
    </div>
  );
}
