'use client';

import { useEffect, useRef, useState } from 'react';
import { NoticeIcon } from './NoticeRow';

export type LiveToast = {
  /** Una ráfaga o una conversación reusan su llave: la tarjeta se actualiza, no se apila. */
  key: string;
  type: string;
  title: string;
  body?: string | null;
  onOpen: () => void;
};

const STAY_MS = 7000;

/** Tarjetas en vivo arriba a la derecha (en el teléfono, arriba de lado a lado). */
export function LiveToasts({ toasts, onDismiss }: { toasts: LiveToast[]; onDismiss: (key: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="ltoasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.key} toast={toast} onDismiss={() => onDismiss(toast.key)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: LiveToast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  // Se queda mientras el cursor esté encima; cambiar el texto vuelve a dar tiempo para leerlo.
  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => dismiss.current(), STAY_MS);
    return () => window.clearTimeout(id);
  }, [paused, toast.title, toast.body]);

  return (
    <div className="ltoast" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <button
        type="button"
        className="ltoast__open"
        onClick={() => {
          toast.onOpen();
          onDismiss();
        }}
      >
        <NoticeIcon type={toast.type} />
        <span className="nt-row__copy">
          <span className="nt-row__title">{toast.title}</span>
          {toast.body ? <span className="nt-row__body">{toast.body}</span> : null}
        </span>
      </button>
      <button type="button" className="ltoast__close" aria-label="Cerrar aviso" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
