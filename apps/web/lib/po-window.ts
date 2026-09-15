import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Días de cobro de órdenes de compra (revisión 11-09-2026).
 *
 * La OC se crea cualquier día; el pago solo se registra en los días de cobro.
 * El endpoint conserva su nombre (`/purchase-orders/window`) y su forma.
 */
export type PoWindowConfig = {
  kind?: 'payDays';
  enabled: boolean;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  /** Legado: ya no restringen. */
  start: string;
  end: string;
  timeZone: string;
  note?: string;
};

export type PoWindowState = {
  config: PoWindowConfig;
  /** Hoy es día de cobro. */
  open: boolean;
  /** "lunes, miércoles y viernes" */
  scheduleLabel: string;
  /** "mañana (miércoles)" · "el lunes" */
  nextOpenLabel: string | null;
  nowMinutes: number;
  /** Crear OC ya no depende del día: siempre true. */
  canRequestNow: boolean;
  /** Se puede registrar un pago hoy (día de cobro o dirección). */
  canPayNow?: boolean;
  bypass?: boolean;
  canEdit?: boolean;
};

export const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export function fetchPoWindow() {
  return api<PoWindowState>('/purchase-orders/window');
}

export function savePoWindow(config: PoWindowConfig) {
  return api<PoWindowState>('/purchase-orders/window', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

/** Estado de los días de cobro; `null` mientras carga o si falla. */
export function usePoWindow(): PoWindowState | null {
  const [state, setState] = useState<PoWindowState | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPoWindow()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Los días en palabras cuando la regla está activa. */
export function payDaysLabel(state: PoWindowState | null | undefined): string | undefined {
  return state?.config.enabled ? state.scheduleLabel : undefined;
}

/**
 * Si hoy NO se puede marcar pagada, el texto corto que va en lugar del botón:
 * «Cobro el miércoles». `null` si hoy sí se puede (o aún no se sabe).
 */
export function payBlockedLabel(state: PoWindowState | null | undefined): string | null {
  if (!state || !state.config.enabled) return null;
  const canPay = state.canPayNow ?? (state.open || !!state.bypass);
  if (canPay) return null;
  return state.nextOpenLabel ? `Cobro ${state.nextOpenLabel}` : 'Hoy no es día de cobro';
}
