'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { externalProps, focusCss } from '@/lib/site-format';
import type { HeroSlideView } from '@/lib/site-model';

type HeroCarouselProps = {
  slides: HeroSlideView[];
  /** `bn` = fotos en blanco y negro, como la marca; los pósters de los shows siempre van a color. */
  tone?: string;
};

const SLIDE_MS = 7000;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function HeroCarousel({ slides, tone = 'bn' }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const total = Math.max(slides.length, 1);
  const go = useCallback((delta: number) => setIndex((i) => (i + delta + total) % total), [total]);

  // Si en Studio se quita una foto, el índice puede quedar fuera de la lista.
  useEffect(() => {
    if (index >= total) setIndex(0);
  }, [index, total]);

  const paused = hovering || userPaused || reducedMotion || slides.length < 2;

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [paused, index, go]);

  const current = slides[index] || slides[0];
  if (!current) return null;

  return (
    <section
      className={`sa-hero ${tone === 'color' ? 'sa-hero--color' : ''}`.trim()}
      aria-roledescription="carrusel"
      aria-label="Portada"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 48) return;
        go(end < start ? 1 : -1);
      }}
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`sa-hero__slide sa-hero__slide--${s.kind} ${i === index ? 'is-active' : ''}`.trim()}
          aria-hidden={i !== index}
        >
          {s.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- fotos dinámicas de Studio
            <img
              className="sa-hero__img"
              src={s.imageUrl}
              alt=""
              style={{ objectPosition: focusCss(s.focus) }}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          ) : null}
        </div>
      ))}
      <div className="sa-hero__veil" />
      <span className="sa-hero__motif" aria-hidden="true" />

      <div className="sa-hero__inner">
        <div className={`sa-hero__copy ${current.kind === 'show' ? 'has-poster' : ''}`.trim()} key={current.id}>
          {current.eyebrow ? <p className="sa-hero__eyebrow">{current.eyebrow}</p> : null}
          {current.draft ? <span className="sa-draft">Borrador</span> : null}
          <h1 className={`sa-hero__title ${current.title.length > 26 ? 'is-long' : ''}`.trim()}>{current.title}</h1>
          {current.subtitle ? <p className="sa-hero__sub">{current.subtitle}</p> : null}
          <div className="sa-hero__actions">
            {current.ctaLabel && current.ctaHref ? (
              <a className="sa-btn sa-btn--on-ink" href={current.ctaHref} {...externalProps(current.ctaHref)}>
                {current.ctaLabel}
              </a>
            ) : null}
            {current.secondaryLabel && current.secondaryHref ? (
              <a className="sa-btn sa-btn--ghost-ink" href={current.secondaryHref}>
                {current.secondaryLabel}
              </a>
            ) : null}
          </div>
        </div>
        {current.kind === 'show' && current.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
          <img className="sa-hero__poster" key={`p-${current.id}`} src={current.imageUrl} alt={`Póster de ${current.title}`} />
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="sa-hero__controls">
          <div className="sa-hero__bars" role="group" aria-label="Elegir imagen">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-current={i === index}
                aria-label={`${i + 1} de ${slides.length}: ${s.title}`}
                className={`sa-hero__bar ${i === index ? 'is-active' : ''} ${i < index ? 'is-past' : ''}`.trim()}
                onClick={() => setIndex(i)}
              >
                <span
                  key={i === index ? `run-${index}` : 'idle'}
                  style={{
                    animationDuration: `${SLIDE_MS}ms`,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                />
              </button>
            ))}
          </div>
          <span className="sa-hero__count" aria-hidden="true">
            {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>
          <div className="sa-hero__arrows">
            <button
              type="button"
              aria-label={userPaused ? 'Reproducir portada' : 'Pausar portada'}
              onClick={() => setUserPaused((v) => !v)}
            >
              <Icon d={userPaused ? 'M7 5l12 7-12 7V5z' : 'M8 5v14M16 5v14'} />
            </button>
            <button type="button" aria-label="Anterior" onClick={() => go(-1)}>
              <Icon d="M15 18l-6-6 6-6" />
            </button>
            <button type="button" aria-label="Siguiente" onClick={() => go(1)}>
              <Icon d="M9 18l6-6-6-6" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
