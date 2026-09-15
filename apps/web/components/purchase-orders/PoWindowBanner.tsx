'use client';

import { usePoWindow, type PoWindowState } from '@/lib/po-window';

/**
 * «Días de cobro: lunes, miércoles y viernes» en una línea, con un punto verde
 * cuando hoy es uno de ellos. Sin banner: la regla se ve, no estorba.
 * Solo usa `<span>`, así que cabe dentro del `sub` de `SectionHead`.
 */
export function PayDaysNote({ state }: { state: PoWindowState | null | undefined }) {
  if (!state || !state.config.enabled) return null;
  const hint = state.open
    ? 'Hoy es día de cobro'
    : state.nextOpenLabel
      ? `Próximo cobro: ${state.nextOpenLabel}`
      : 'Hoy no es día de cobro';
  return (
    <span className="inline-note oc-paydays" title={hint}>
      <span className={`oc-dot ${state.open ? 'is-on' : ''}`} aria-hidden />
      <span>
        Días de cobro: <strong>{state.scheduleLabel}</strong>
      </span>
      <span className="sr-only">. {hint}.</span>
    </span>
  );
}

/** Compatibilidad: si no le pasan el estado, lo pide solo. */
export function PoWindowBanner({ state }: { state?: PoWindowState | null }) {
  const fetched = usePoWindow();
  return <PayDaysNote state={state === undefined ? fetched : state} />;
}
