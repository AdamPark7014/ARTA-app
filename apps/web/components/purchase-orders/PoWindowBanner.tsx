'use client';

import { useEffect, useState } from 'react';
import { fetchPoWindow, type PoWindowState } from '@/lib/po-window';

/**
 * Aviso de la ventana de solicitud de OC.
 *
 * Junta 2026-08-28: el periodo para solicitar órdenes de compra es
 * configurable (hoy lunes y jueves de 10:00 a 14:00). El equipo tiene que
 * verlo antes de capturar, no al recibir el error del servidor.
 */
export function PoWindowBanner({ state }: { state?: PoWindowState | null }) {
  const [local, setLocal] = useState<PoWindowState | null>(state ?? null);

  useEffect(() => {
    if (state !== undefined) {
      setLocal(state);
      return;
    }
    let cancelled = false;
    fetchPoWindow()
      .then((s) => {
        if (!cancelled) setLocal(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (!local || !local.config.enabled) return null;

  if (local.open) {
    return (
      <div className="module-banner module-banner--ok" role="status">
        <strong>Ventana de OC abierta.</strong> Se solicitan {local.scheduleLabel}. Captura ahora;
        fuera de ese periodo el sistema no acepta nuevas órdenes.
      </div>
    );
  }

  return (
    <div className="module-banner module-banner--warn" role="status">
      <strong>Ventana de OC cerrada.</strong> Las órdenes de compra se solicitan{' '}
      {local.scheduleLabel}
      {local.nextOpenLabel ? ` · vuelve a abrir ${local.nextOpenLabel}` : ''}.
      {local.bypass ? ' Como dirección, tú sí puedes capturar fuera de horario.' : ''}
      {local.config.note ? ` ${local.config.note}` : ''}
    </div>
  );
}
