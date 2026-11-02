'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { focusCss } from '@/lib/site-format';
import type { PublicSiteItem } from '@/lib/public-site-data';

/** Galería: rejilla de fotos en blanco y negro que se abren en grande, a color. */
export function Galeria({ items }: { items: PublicSiteItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    lastTrigger.current?.focus();
  }, []);
  const go = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + items.length) % items.length)),
    [items.length],
  );

  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    document.body.classList.add('sa-lock');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sa-lock');
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close, go]);

  const current = open === null ? null : items[open];

  return (
    <>
      <ul className="sa-gallery" data-count={Math.min(items.length, 7)}>
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              aria-label={`Ampliar foto${item.title ? `: ${item.title}` : ` ${i + 1}`}`}
              onClick={(e) => {
                lastTrigger.current = e.currentTarget;
                setOpen(i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- fotos dinámicas de Studio */}
              <img src={item.mediaUrl} alt={item.title || ''} loading="lazy" decoding="async" style={{ objectPosition: focusCss(item.focus) }} />
              {item.active === false ? <span className="sa-draft">Borrador</span> : null}
              {item.title ? <span className="sa-gallery__label">{item.title}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {current ? (
        <div className="sa-lightbox" role="dialog" aria-modal="true" aria-label={current.title || 'Foto'}>
          <div className="sa-lightbox__backdrop" onClick={close} />
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos dinámicas de Studio */}
          <img src={current.mediaUrl} alt={current.title || ''} />
          {current.title || current.caption ? (
            <p className="sa-lightbox__caption">
              {current.title ? <strong>{current.title}</strong> : null}
              {current.caption ? <span>{current.caption}</span> : null}
            </p>
          ) : null}
          <button type="button" ref={closeRef} className="sa-lightbox__close" aria-label="Cerrar foto" onClick={close}>
            ✕
          </button>
          {items.length > 1 ? (
            <>
              <button type="button" className="sa-viewer__nav sa-viewer__nav--prev" aria-label="Foto anterior" onClick={() => go(-1)}>
                ‹
              </button>
              <button type="button" className="sa-viewer__nav sa-viewer__nav--next" aria-label="Foto siguiente" onClick={() => go(1)}>
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
