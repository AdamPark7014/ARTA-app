'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { externalProps, focusCss, safeHref } from '@/lib/site-format';
import type { PublicSiteItem } from '@/lib/public-site-data';

const FRAME_MS = 6500;

function isVideo(item: PublicSiteItem) {
  return item.mediaType === 'video';
}

/** Historias: fila de tarjetas verticales que se abren a pantalla completa, una tras otra. */
export function Historias({ items }: { items: PublicSiteItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const railRef = useRef<HTMLUListElement | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);

  const scrollRail = (dir: 1 | -1) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <>
      <div className="sa-rail-wrap">
        <ul className="sa-rail" ref={railRef} data-count={items.length}>
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className="sa-story-card"
                aria-label={`Ver historia: ${item.title || `número ${i + 1}`}`}
                onClick={(e) => {
                  lastTrigger.current = e.currentTarget;
                  setOpen(i);
                }}
              >
                {isVideo(item) ? (
                  // `#t=0.1`: sin esto Safari en iPhone deja el cuadro en negro hasta reproducirlo.
                  <video src={`${item.mediaUrl}#t=0.1`} muted playsInline preload="metadata" style={{ objectPosition: focusCss(item.focus) }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- fotos dinámicas de Studio
                  <img src={item.mediaUrl} alt="" loading="lazy" decoding="async" style={{ objectPosition: focusCss(item.focus) }} />
                )}
                <span className="sa-story-card__shade" />
                {isVideo(item) ? (
                  <span className="sa-story-card__play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M7 5l12 7-12 7V5z" />
                    </svg>
                  </span>
                ) : null}
                {item.active === false ? <span className="sa-draft sa-story-card__draft">Borrador</span> : null}
                {item.title ? <span className="sa-story-card__title">{item.title}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        {items.length > 4 ? (
          <div className="sa-rail-arrows">
            <button type="button" aria-label="Historias anteriores" onClick={() => scrollRail(-1)}>
              ‹
            </button>
            <button type="button" aria-label="Más historias" onClick={() => scrollRail(1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>
      {open !== null ? (
        <StoryViewer
          items={items}
          start={open}
          onClose={() => {
            setOpen(null);
            lastTrigger.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function StoryViewer({ items, start, onClose }: { items: PublicSiteItem[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pressAt = useRef(0);

  const item = items[index];
  const video = item ? isVideo(item) : false;

  const next = useCallback(() => {
    setProgress(0);
    setIndex((i) => {
      if (i >= items.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [items.length, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    document.body.classList.add('sa-lock');
    return () => document.body.classList.remove('sa-lock');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  // Avance de las fotos: el video lleva su propio reloj.
  useEffect(() => {
    if (video || held) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      let done = false;
      setProgress((p) => {
        const value = p + delta / FRAME_MS;
        if (value >= 1) done = true;
        return Math.min(value, 1);
      });
      if (done) {
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, held, index, next]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (held) el.pause();
    else void el.play().catch(() => undefined);
  }, [held, index]);

  if (!item) return null;
  const link = safeHref(item.linkHref);

  return (
    <div className="sa-viewer" role="dialog" aria-modal="true" aria-label={item.title || 'Historia'}>
      <div className="sa-viewer__backdrop" onClick={onClose} />
      <div
        className="sa-viewer__frame"
        // Mantener presionado pausa; un toque rápido avanza o regresa según el lado.
        onPointerDown={() => {
          pressAt.current = Date.now();
          setHeld(true);
        }}
        onPointerUp={(e) => {
          setHeld(false);
          if (Date.now() - pressAt.current > 280) return;
          if ((e.target as HTMLElement).closest('a,button')) return;
          const box = e.currentTarget.getBoundingClientRect();
          if (e.clientX - box.left < box.width * 0.3) prev();
          else next();
        }}
        onPointerCancel={() => setHeld(false)}
      >
        {video ? (
          <video
            key={item.id}
            ref={videoRef}
            src={item.mediaUrl}
            autoPlay
            muted={muted}
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            onEnded={next}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- fotos dinámicas de Studio
          <img key={item.id} src={item.mediaUrl} alt={item.title || ''} draggable={false} />
        )}
        <div className="sa-viewer__shade" />

        <div className="sa-viewer__bars" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.id}>
              <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})` }} />
            </span>
          ))}
        </div>

        <div className="sa-viewer__top">
          <span className="sa-viewer__count">
            {index + 1} / {items.length}
          </span>
          {video ? (
            <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
              {muted ? 'Sonido' : 'Silenciar'}
            </button>
          ) : null}
          <button type="button" ref={closeRef} onClick={onClose} aria-label="Cerrar historia">
            ✕
          </button>
        </div>

        <div className="sa-viewer__copy">
          {item.title ? <h3>{item.title}</h3> : null}
          {item.caption ? <p>{item.caption}</p> : null}
          {link && item.linkLabel ? (
            <a className="sa-btn sa-btn--on-ink" href={link} {...externalProps(link)}>
              {item.linkLabel}
            </a>
          ) : null}
        </div>
      </div>
      <button type="button" className="sa-viewer__nav sa-viewer__nav--prev" aria-label="Historia anterior" disabled={index === 0} onClick={prev}>
        ‹
      </button>
      <button type="button" className="sa-viewer__nav sa-viewer__nav--next" aria-label="Historia siguiente" onClick={next}>
        ›
      </button>
    </div>
  );
}
