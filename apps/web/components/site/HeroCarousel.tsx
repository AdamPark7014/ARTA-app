'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import type { PublicSiteContent, PublicSiteSlide } from '@/lib/public-site-data';

type HeroCarouselProps = {
  slides: PublicSiteSlide[];
  hero?: PublicSiteContent;
};

export function HeroCarousel({ slides, hero }: HeroCarouselProps) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const next = useCallback(() => {
    setSlideIdx((i) => (i + 1) % Math.max(slides.length, 1));
  }, [slides.length]);

  const prev = useCallback(() => {
    setSlideIdx((i) => (i - 1 + slides.length) % Math.max(slides.length, 1));
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2 || reducedMotion) return;
    const t = setInterval(next, 5500);
    return () => clearInterval(t);
  }, [paused, slides.length, next, reducedMotion]);

  const current = slides[slideIdx] || slides[0];

  return (
    <section
      className="hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`hero-slide ${i === slideIdx ? 'is-active' : ''}`}
          style={{ backgroundImage: `url(${s.imageUrl})` }}
          role="img"
          aria-label={s.title || `Imagen del carrusel ${i + 1}`}
          aria-hidden={i !== slideIdx}
        />
      ))}
      <div className="hero-overlay" />
      <div className="hero-content">
        <Image
          src="/brand/arta-logo.png"
          alt="arta"
          width={200}
          height={80}
          className="hero-logo"
          priority
        />
        <p className="hero-quote">“La experiencia del Show”</p>
        <h1>{current.title || hero?.headline || 'La experiencia del Show'}</h1>
        <p>{current.subtitle || hero?.sub || 'Producción integral de conciertos y eventos.'}</p>
        <div className="row">
          <a className="btn" href={current.ctaHref || hero?.ctaHref || '#modulos'}>
            {current.ctaLabel || hero?.cta || 'Explorar'}
          </a>
          <a className="btn ghost" href="#contacto">
            Contacto
          </a>
        </div>
      </div>
      {slides.length > 1 ? (
        <>
          <button type="button" className="hero-nav prev" onClick={prev} aria-label="Anterior">
            ‹
          </button>
          <button type="button" className="hero-nav next" onClick={next} aria-label="Siguiente">
            ›
          </button>
          <div className="hero-dots">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={i === slideIdx ? 'active' : ''}
                aria-label={`Ir a imagen ${i + 1}${s.title ? `: ${s.title}` : ''}`}
                onClick={() => setSlideIdx(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
