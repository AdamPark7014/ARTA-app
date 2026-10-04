'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { extOf, formatBytes, isVoiceNote, kindOf, mmss, type ChatAttachment } from './chat-model';

export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.35-4.35',
  send: 'M12 19V5m-6 6 6-6 6 6',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  bubble: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  clip: 'M21.4 11.6 12.2 20.8a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3',
  close: 'M18 6 6 18M6 6l12 12',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  pause: 'M8 5v14M16 5v14',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  open: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  pin: 'M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Z',
  thread: 'M4 5h16v10H9l-5 4V5Z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.5-7a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  bell: 'M12 3a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.2h14l-1.5-3.5V8.5A5.5 5.5 0 0 0 12 3Zm-2 15a2 2 0 0 0 4 0',
  bellOff: 'M4 4l16 16M9.5 4.6A5.5 5.5 0 0 1 17.5 8.5v3.2l1.5 3.5H9M6.5 9v2.7L5 15.2m5 2.8a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 9v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  check: 'M5 12l5 5L20 7',
  reply: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3h.01',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  hash: 'M5 9h14M5 15h14M10 3 8 21M16 3l-2 18',
  zoomIn: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.35-4.35M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.35-4.35M8 11h6',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  compose: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
};

/** Una sola reproducción a la vez, como en WhatsApp. */
let playing: HTMLAudioElement | null = null;

function AudioPlayer({ a, voice, onError }: { a: ChatAttachment; voice: boolean; onError: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(
    () => () => {
      if (playing === ref.current) playing = null;
    },
    [],
  );

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  };

  const syncDuration = (el: HTMLAudioElement) => {
    if (Number.isFinite(el.duration)) setDuration(el.duration);
  };

  return (
    <div className={`chat-audio${voice ? ' chat-audio--voice' : ''}`}>
      <button type="button" className="chat-audio__btn" onClick={toggle} aria-label={on ? 'Pausar' : 'Reproducir'}>
        <Icon d={on ? ICONS.pause : ICONS.play} size={16} />
      </button>
      <div className="chat-audio__main">
        {voice ? null : <span className="chat-audio__name">{a.name || 'Audio'}</span>}
        <div className="chat-audio__track">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(time, duration || 1)}
            aria-label="Posición"
            onChange={(e) => {
              const el = ref.current;
              if (el) el.currentTime = Number(e.target.value);
            }}
          />
          <span className="chat-audio__time">{mmss(on || time > 0 ? time : duration)}</span>
        </div>
      </div>
      <audio
        ref={ref}
        src={a.url}
        preload="metadata"
        onPlay={() => setOn(true)}
        onPause={() => setOn(false)}
        onEnded={() => {
          setOn(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => syncDuration(e.currentTarget)}
        onDurationChange={(e) => syncDuration(e.currentTarget)}
        onError={onError}
      />
    </div>
  );
}

function DocumentRow({ a, note }: { a: ChatAttachment; note?: string }) {
  const ext = extOf(a.name) || extOf(a.url);
  const meta = [ext ? ext.toUpperCase() : null, formatBytes(a.size), note].filter(Boolean).join(' · ');
  return (
    <div className="chat-doc">
      <span className="chat-doc__icon" data-ext={ext}>
        <Icon d={ICONS.file} size={20} />
      </span>
      <span className="chat-doc__copy">
        <span className="chat-doc__name">{a.name || 'Documento'}</span>
        {meta ? <span className="chat-doc__meta">{meta}</span> : null}
      </span>
      <a className="chat-doc__act" href={a.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir" title="Abrir">
        <Icon d={ICONS.open} size={16} />
      </a>
      <a className="chat-doc__act" href={a.url} download={a.name || true} aria-label="Descargar" title="Descargar">
        <Icon d={ICONS.download} size={16} />
      </a>
    </div>
  );
}

/**
 * Foto, video, audio o documento. Si el navegador no puede mostrar el formato
 * (HEIC en Chrome, video HEVC), queda como archivo descargable.
 */
export function AttachmentView({ a, onImage }: { a: ChatAttachment; onImage: (a: ChatAttachment) => void }) {
  const [broken, setBroken] = useState(false);
  const kind = kindOf(a);
  if (broken) return <DocumentRow a={a} note="No se puede ver aquí" />;
  if (kind === 'image') {
    return (
      <button type="button" className="chat-att chat-att--image" onClick={() => onImage(a)} aria-label="Ver foto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name || 'Foto'} loading="lazy" onError={() => setBroken(true)} />
      </button>
    );
  }
  if (kind === 'video') {
    return (
      <div className="chat-att chat-att--video">
        <video src={a.url} controls preload="metadata" playsInline onError={() => setBroken(true)} />
      </div>
    );
  }
  if (kind === 'audio') return <AudioPlayer a={a} voice={isVoiceNote(a)} onError={() => setBroken(true)} />;
  return <DocumentRow a={a} />;
}

const MAX_ZOOM = 5;

/**
 * Visor de fotos del canal: zoom (rueda, botones, doble clic, + / −), arrastrar
 * para desplazar con zoom, flechas o deslizar entre fotos, deslizar abajo o Esc cierra.
 */
export function MediaViewer({ items, start, onClose }: { items: ChatAttachment[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, start), Math.max(0, items.length - 1)));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const count = items.length;
  const a = items[index] ?? items[0];

  const go = useCallback(
    (d: number) => {
      if (count < 2) return;
      setIndex((i) => (i + d + count) % count);
    },
    [count],
  );

  const zoomTo = useCallback((next: number) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, next));
    setScale(s);
    if (s === 1) setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(MAX_ZOOM, s * 1.25));
      else if (e.key === '-') zoomTo(scale / 1.25);
      else if (e.key === '0') zoomTo(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, go, zoomTo, scale]);

  // La rueda necesita `passive: false` para no desplazar la página detrás.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => {
        const next = Math.min(MAX_ZOOM, Math.max(1, e.deltaY < 0 ? s * 1.15 : s / 1.15));
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (!a) return null;

  return (
    <div className="chat-viewer" role="dialog" aria-modal="true" aria-label={a.name || 'Foto'}>
      <div className="chat-viewer__bar">
        <span className="chat-viewer__name">{a.name || 'Foto'}</span>
        {count > 1 ? (
          <span className="chat-viewer__count">
            {index + 1} / {count}
          </span>
        ) : null}
        <button type="button" className="chat-viewer__btn" onClick={() => zoomTo(scale / 1.25)} aria-label="Alejar" disabled={scale <= 1}>
          <Icon d={ICONS.zoomOut} size={18} />
        </button>
        <button type="button" className="chat-viewer__btn" onClick={() => zoomTo(scale * 1.25)} aria-label="Acercar" disabled={scale >= MAX_ZOOM}>
          <Icon d={ICONS.zoomIn} size={18} />
        </button>
        <a className="chat-viewer__btn" href={a.url} download={a.name || true} aria-label="Descargar">
          <Icon d={ICONS.download} size={18} />
        </a>
        <button type="button" className="chat-viewer__btn" onClick={onClose} aria-label="Cerrar">
          <Icon d={ICONS.close} size={18} />
        </button>
      </div>
      <div
        ref={stageRef}
        className={`chat-viewer__stage${scale > 1 ? ' is-zoomed' : ''}`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
          if (scale > 1) setOffset({ x: d.ox + dx, y: d.oy + dy });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (scale === 1 && d.moved) {
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
            else if (dy > 100) onClose();
            return;
          }
          if (!d.moved && e.target === e.currentTarget) onClose();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={() => zoomTo(scale > 1 ? 1 : 2.5)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={a.url}
          className="chat-viewer__img"
          src={a.url}
          alt={a.name || 'Foto'}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        />
        {count > 1 ? (
          <>
            <button type="button" className="chat-viewer__nav chat-viewer__nav--prev" onClick={() => go(-1)} aria-label="Foto anterior">
              <Icon d={ICONS.back} size={22} />
            </button>
            <button type="button" className="chat-viewer__nav chat-viewer__nav--next" onClick={() => go(1)} aria-label="Foto siguiente">
              <Icon d={ICONS.next} size={22} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
