'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/lib/user-context';
import {
  dismissWebPushPrompt,
  enableWebPush,
  getWebPushStatus,
  syncWebPush,
  webPushPromptDismissed,
  type WebPushStatus,
} from '@/lib/web-push';

/** Espera tras entrar al panel: nunca en el primer pintado. */
const PROMPT_DELAY_MS = 8000;

/**
 * Invitación única a activar avisos en este navegador (se recuerda al cerrarla)
 * y re-registro silencioso del token cuando el permiso ya estaba concedido.
 */
export function WebPushPrompt() {
  const { user, loading } = useUser();
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (loading || !userId) return;
    syncWebPush().catch(() => undefined);

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (webPushPromptDismissed()) return;
      const next = await getWebPushStatus().catch(() => 'hidden' as const);
      if (cancelled) return;
      const askable = next === 'disabled' && typeof Notification !== 'undefined' && Notification.permission === 'default';
      if (askable || next === 'needs-install') setStatus(next);
    }, PROMPT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loading, userId]);

  if (!status || !user) return null;

  function close() {
    dismissWebPushPrompt();
    setStatus(null);
  }

  async function activate() {
    setBusy(true);
    try {
      await enableWebPush();
    } catch {
      /* el estado queda visible en Configuración */
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="wp-prompt" role="dialog" aria-live="polite" aria-label="Avisos en este navegador">
      <style>{`
        .wp-prompt {
          position: fixed;
          right: 16px;
          bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          z-index: 60;
          max-width: 360px;
          padding: 14px 16px;
          background: var(--bg-elev);
          border: 1px solid var(--line-strong);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          color: var(--text);
          font-size: 14px;
          line-height: 1.4;
        }
        .wp-prompt__actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
        @media (max-width: 760px) {
          .wp-prompt { left: 12px; right: 12px; max-width: none; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>
      <strong>¿Quieres avisos en este navegador?</strong>
      <div className="t-muted t-small" style={{ marginTop: 4 }}>
        {status === 'needs-install'
          ? 'En iPhone o iPad, toca Compartir → «Agregar a pantalla de inicio» y abre ARTA desde ese ícono para recibir avisos.'
          : 'Te avisamos de chat, tareas y aprobaciones aunque cierres la pestaña.'}
      </div>
      <div className="wp-prompt__actions">
        <button type="button" className="btn ghost btn-sm" onClick={close}>
          {status === 'needs-install' ? 'Entendido' : 'Ahora no'}
        </button>
        {status === 'disabled' ? (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={activate}>
            {busy ? 'Activando…' : 'Activar avisos'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
