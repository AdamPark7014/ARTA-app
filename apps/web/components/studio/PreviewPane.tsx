'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PreviewMessage } from '@/lib/site-blocks';

export type PreviewHandle = {
  post: (message: DistributedMessage) => void;
};

type DistributedMessage =
  | Omit<Extract<PreviewMessage, { type: 'section' }>, 'source'>
  | Omit<Extract<PreviewMessage, { type: 'layout' }>, 'source'>
  | Omit<Extract<PreviewMessage, { type: 'reload' }>, 'source'>
  | Omit<Extract<PreviewMessage, { type: 'page' }>, 'source'>
  | Omit<Extract<PreviewMessage, { type: 'scrollTo' }>, 'source'>;

type Device = 'computadora' | 'telefono';
type Mode = 'borradores' | 'publicado';

const DEVICE_WIDTH: Record<Device, number> = { computadora: 1366, telefono: 390 };

/**
 * La vista previa es la página de verdad dentro de un marco (`/site?embed=1`), a escala para que
 * quepa: lo que se ve aquí es lo que verá el público, con sus mismos estilos y tamaños.
 */
export const PreviewPane = forwardRef<PreviewHandle, { onClose?: () => void; onReady?: () => void }>(function PreviewPane(
  { onClose, onReady },
  ref,
) {
  const [device, setDevice] = useState<Device>('computadora');
  const [mode, setMode] = useState<Mode>('borradores');
  const [box, setBox] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  /** Lo escrito sin guardar: el marco puede estar cargando todavía y perdería el mensaje. */
  const unsaved = useRef(new Map<string, DistributedMessage>());

  const send = (message: DistributedMessage) =>
    frameRef.current?.contentWindow?.postMessage({ source: 'arta-studio', ...message }, window.location.origin);

  useImperativeHandle(
    ref,
    () => ({
      post(message) {
        if (message.type === 'reload') unsaved.current.clear();
        else if (message.type === 'section') unsaved.current.set(`section:${message.sectionKey}`, message);
        else if (message.type === 'layout') unsaved.current.set('layout', message);
        send(message);
      },
    }),
    [],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.source !== 'arta-preview') return;
      unsaved.current.forEach((message) => send(message));
      onReady?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const width = DEVICE_WIDTH[device];
  const scale = box.width ? Math.min(1, box.width / width) : 1;
  const height = box.height ? box.height / scale : 800;
  const src = `/site?embed=1${mode === 'publicado' ? '&modo=publicado' : ''}`;

  return (
    <aside className="st-preview" aria-label="Vista previa">
      <div className="st-preview__bar">
        <div className="st-seg" role="group" aria-label="Tamaño de la vista previa">
          {(['computadora', 'telefono'] as Device[]).map((d) => (
            <button key={d} type="button" className={device === d ? 'is-active' : ''} aria-pressed={device === d} onClick={() => setDevice(d)}>
              {d === 'computadora' ? 'Computadora' : 'Teléfono'}
            </button>
          ))}
        </div>
        <div className="st-seg" role="group" aria-label="Qué enseña la vista previa">
          {(['borradores', 'publicado'] as Mode[]).map((m) => (
            <button key={m} type="button" className={mode === m ? 'is-active' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'borradores' ? 'Con borradores' : 'Publicado'}
            </button>
          ))}
        </div>
        <a className="st-preview__open" href={`/site${mode === 'publicado' ? '?modo=publicado' : ''}`} target="_blank" rel="noopener noreferrer">
          Abrir
        </a>
        {onClose ? (
          <button type="button" className="btn ghost btn-sm st-preview__close" onClick={onClose}>
            Cerrar
          </button>
        ) : null}
      </div>
      <div className={`st-preview__stage is-${device}`} ref={stageRef}>
        <iframe
          key={src}
          ref={frameRef}
          src={src}
          title="Vista previa del sitio"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </aside>
  );
});
