'use client';

import { useEffect, useState } from 'react';
import { SectionHead } from '@/components/ui/Lite';
import { disableWebPush, enableWebPush, getWebPushStatus, type WebPushStatus } from '@/lib/web-push';

const STATUS_TEXT: Record<Exclude<WebPushStatus, 'hidden'>, string> = {
  enabled: 'Activados: te llegan avisos aunque cierres la pestaña',
  disabled: 'Apagados en este navegador',
  denied: 'Bloqueados por el navegador: permítelos desde el candado junto a la dirección y vuelve aquí',
  unsupported: 'Este navegador no admite avisos push',
  'needs-install':
    'En iPhone o iPad: toca Compartir → «Agregar a pantalla de inicio», abre ARTA desde ese ícono y actívalos ahí',
};

/** Tarjeta de configuración: avisos push en este navegador (no aparece en la app nativa). */
export function WebPushCard() {
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWebPushStatus()
      .then(setStatus)
      .catch(() => setStatus('unsupported'));
  }, []);

  if (!status || status === 'hidden') return null;

  async function run(action: () => Promise<WebPushStatus>) {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la configuración de avisos');
      setStatus(await getWebPushStatus().catch(() => 'unsupported' as const));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHead title="Avisos en este navegador" sub="Chat, tareas y aprobaciones aunque ARTA no esté abierto." />
      <section className="surface surface--pad">
        <div className="fx">
          <div className="oc-set-row">
            <span className="inline-note">
              <span className={`oc-dot ${status === 'enabled' ? 'is-on' : ''}`} aria-hidden />
              {STATUS_TEXT[status]}
            </span>
            {status === 'enabled' ? (
              <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => run(disableWebPush)}>
                {busy ? 'Desactivando…' : 'Desactivar'}
              </button>
            ) : status === 'disabled' ? (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(enableWebPush)}>
                {busy ? 'Activando…' : 'Activar'}
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="oc-flash is-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
