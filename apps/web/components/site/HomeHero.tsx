'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { externalProps, focusCss } from '@/lib/site-format';
import { MIN_WALL_POSTERS, showHref, type HeroLink, type HeroPoster, type HeroView } from '@/lib/site-model';

const PHOTO_MS = 7000;
const COLUMNS = 3;
/** Cada columna tiene que llenar la pantalla: con pocos pósters, la lista se repite. */
const POSTERS_PER_COLUMN = 5;

/** Ligas del sitio sin recargar la página; boletos y sitios externos, en otra pestaña. */
function HeroAnchor({ link, className }: { link: HeroLink; className: string }) {
  if (link.href.startsWith('/')) {
    return (
      <Link className={className} href={link.href}>
        {link.label}
      </Link>
    );
  }
  return (
    <a className={className} href={link.href} {...externalProps(link.href)}>
      {link.label}
    </a>
  );
}

function columnsOf(posters: HeroPoster[]) {
  return Array.from({ length: COLUMNS }, (_, column) => {
    let list = posters.filter((_, i) => i % COLUMNS === column);
    while (list.length && list.length < POSTERS_PER_COLUMN) list = [...list, ...list];
    return list;
  });
}

/** Los pósters reales de Arta en tres columnas que corren: dos veces la misma lista, para que no brinque. */
function PosterWall({ posters }: { posters: HeroPoster[] }) {
  return (
    <div className="sa-hero__wall" aria-hidden="true">
      {columnsOf(posters).map((list, column) => (
        <div key={column} className={`sa-hero__col ${column === 1 ? 'is-reverse' : ''}`.trim()}>
          <div className="sa-hero__reel" style={{ animationDuration: `${column === 1 ? 104 : 86 + column * 6}s` }}>
            {[...list, ...list].map((poster, i) => (
              <Link key={`${poster.id}-${i}`} href={showHref(poster.slug)} tabIndex={-1}>
                {/* eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio */}
                <img src={poster.coverUrl} alt="" decoding="async" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * La portada dice qué es Arta y enseña sus shows: los pósters de verdad, corriendo despacio, y el
 * próximo a la mano. Con pocos pósters (la vista previa, una temporada que empieza) salen las fotos de
 * Studio. Sin JavaScript o con «reducir movimiento» se queda quieta y se lee completa.
 */
export function HomeHero({ hero, next }: { hero: HeroView; next?: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wall = hero.posters.length >= MIN_WALL_POSTERS;
  const total = wall ? 0 : hero.photos.length;
  const moving = wall || total > 1;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Si en Studio se quita una foto, el índice puede quedar fuera de la lista.
  useEffect(() => {
    if (index >= total) setIndex(0);
  }, [index, total]);

  useEffect(() => {
    if (paused || reducedMotion || total < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % total), PHOTO_MS);
    return () => clearTimeout(t);
  }, [paused, reducedMotion, index, total]);

  // Fuera de la pantalla no hay nada que animar.
  useEffect(() => {
    if (!section.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    io.observe(section.current);
    return () => io.disconnect();
  }, []);

  const glow = hero.posters[0]?.coverUrl;
  const what = wall ? 'los pósters' : 'las fotos';

  return (
    <section className={`sa-hero ${paused || offscreen ? 'is-paused' : ''}`.trim()} ref={section} aria-labelledby="portada-t">
      {glow ? <span className="sa-hero__glow" style={{ backgroundImage: `url(${glow})` }} aria-hidden="true" /> : null}
      {wall ? (
        <PosterWall posters={hero.posters} />
      ) : (
        <div className="sa-hero__photos">
          {hero.photos.map((photo, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fotos dinámicas de Studio
            <img
              key={photo.id}
              className={`sa-hero__photo ${i === index ? 'is-on' : ''}`.trim()}
              src={photo.imageUrl}
              alt=""
              style={{ objectPosition: focusCss(photo.focus) }}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          ))}
        </div>
      )}
      <div className="sa-hero__inner">
        <div className="sa-hero__copy">
          <p className="sa-hero__brand">Arta Producciones</p>
          <h1 id="portada-t" className="sa-hero__title">
            {hero.title}
          </h1>
          {hero.sub ? <p className="sa-hero__sub">{hero.sub}</p> : null}
          <div className="sa-cta">
            {hero.primary ? <HeroAnchor link={hero.primary} className="sa-btn" /> : null}
            {hero.secondary ? <HeroAnchor link={hero.secondary} className="sa-arrow" /> : null}
          </div>
        </div>
        {next}
      </div>
      {!wall && hero.photos[index]?.draft ? <span className="sa-draft sa-hero__draft">Borrador</span> : null}
      {moving && !reducedMotion ? (
        <button
          type="button"
          className="sa-hero__pause"
          aria-label={paused ? `Reproducir ${what} de la portada` : `Pausar ${what} de la portada`}
          onClick={() => setPaused((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d={paused ? 'M8 5l11 7-11 7V5z' : 'M7 5h4v14H7zM13 5h4v14h-4z'} />
          </svg>
        </button>
      ) : null}
    </section>
  );
}
