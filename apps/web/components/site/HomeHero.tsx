'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ARTA_WORDMARK_PATH } from '@/lib/arta-wordmark';
import { externalProps, focusCss } from '@/lib/site-format';
import type { HeroLink, HeroView } from '@/lib/site-model';

const PHOTO_MS = 7000;

/**
 * El punto más grueso de las letras (la unión de la «t»), en unidades del dibujo de 1200 × 466:
 * ahí se acerca la cámara, para que la letra termine cubriendo toda la pantalla.
 */
const FOCUS = { x: 692, y: 196, radius: 62 };

/** Hasta dónde del recorrido se abre el logo; lo demás es la foto a pantalla completa. */
const OPEN_AT = 0.7;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

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

/**
 * La portada: el logo de Arta es una ventana al show y, al bajar, se abre hasta llenar la pantalla con
 * la foto. Sin JavaScript o con «reducir movimiento» se queda en su primera imagen, que se lee completa.
 */
export function HomeHero({ hero }: { hero: HeroView }) {
  const section = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const windowShape = useRef<SVGSVGElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const photos = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLParagraphElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [live, setLive] = useState(false);
  const total = hero.photos.length;

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

  useEffect(() => {
    setLive(!reducedMotion && total > 0);
    if (reducedMotion || !total) return;

    let queued = false;
    let stickyTop = 0;
    let maxScale = 1;
    let startScale = 1.14;
    let startShift = -5;

    const measure = () => {
      if (!pin.current || !mark.current) return;
      stickyTop = parseFloat(getComputedStyle(pin.current).top) || 0;
      const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = mark.current;
      const x = offsetLeft + (FOCUS.x / 1200) * offsetWidth;
      const y = offsetTop + (FOCUS.y / 466) * offsetHeight;
      const { clientWidth, clientHeight } = pin.current;
      const farthest = Math.hypot(Math.max(x, clientWidth - x), Math.max(y, clientHeight - y));
      maxScale = farthest / ((FOCUS.radius * offsetWidth) / 1200);
      // En el teléfono la foto va más cerca: el escenario tiene que caer dentro de las letras.
      const narrow = window.innerWidth <= 820;
      startScale = narrow ? 1.4 : 1.14;
      startShift = narrow ? -15 : -5;
    };

    const apply = () => {
      queued = false;
      const root = section.current;
      if (!root || !pin.current || !windowShape.current || !copy.current || !photos.current || !tag.current) return;
      const travel = Math.max(1, root.offsetHeight - pin.current.offsetHeight);
      const progress = clamp((stickyTop - root.getBoundingClientRect().top) / travel);
      const zoom = clamp(progress / OPEN_AT);

      windowShape.current.style.transform = `scale(${Math.pow(maxScale, Math.pow(zoom, 1.55)).toFixed(3)})`;
      root.classList.toggle('is-open', zoom >= 1);

      const fade = clamp(1 - progress / 0.09);
      copy.current.style.opacity = fade.toFixed(3);
      copy.current.style.transform = `translateY(${(-progress * 180).toFixed(1)}px)`;
      copy.current.style.visibility = fade > 0 ? 'visible' : 'hidden';

      const rest = 1 - zoom;
      photos.current.style.transform = `translateY(${(startShift * rest).toFixed(2)}%) scale(${(1 + (startScale - 1) * rest).toFixed(3)})`;

      const closing = clamp((progress - 0.76) / 0.14);
      root.style.setProperty('--closing', closing.toFixed(3));
      tag.current.style.transform = `translateY(${((1 - closing) * 14).toFixed(1)}px)`;
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
    // `live` cambia la altura de la sección: se vuelve a medir con ella ya puesta.
  }, [reducedMotion, total, live]);

  return (
    <section className={`sa-hero ${live ? 'is-live' : ''}`.trim()} ref={section} aria-labelledby="portada-t">
      <div className="sa-hero__pin" ref={pin}>
        <div className="sa-hero__photos" ref={photos}>
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
        <span className="sa-hero__shade" aria-hidden="true" />
        <div className="sa-hero__open">
          <div className="sa-hero__mark" ref={mark}>
            {/* Una hoja de papel con las letras recortadas: detrás está la foto. */}
            <svg className="sa-hero__window" ref={windowShape} viewBox="0 0 1200 466" role="img" aria-label="Arta">
              <path fillRule="evenodd" d={`M-14000 -14000H15200V14466H-14000Z ${ARTA_WORDMARK_PATH}`} />
            </svg>
          </div>
          <div className="sa-hero__copy" ref={copy}>
            <h1 id="portada-t" className="sa-hero__title">
              {hero.title}
            </h1>
            {hero.sub ? <p className="sa-hero__sub">{hero.sub}</p> : null}
            <div className="sa-cta">
              {hero.primary ? <HeroAnchor link={hero.primary} className="sa-btn" /> : null}
              {hero.secondary ? <HeroAnchor link={hero.secondary} className="sa-arrow" /> : null}
            </div>
          </div>
        </div>
        <p className="sa-hero__tag" ref={tag} aria-hidden="true">
          #LaExperienciadelShow
        </p>
        {hero.photos[index]?.draft ? <span className="sa-draft sa-hero__draft">Borrador</span> : null}
        {total > 1 && !reducedMotion ? (
          <button
            type="button"
            className="sa-hero__pause"
            aria-label={paused ? 'Reproducir las fotos de la portada' : 'Pausar las fotos de la portada'}
            onClick={() => setPaused((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d={paused ? 'M8 5l11 7-11 7V5z' : 'M7 5h4v14H7zM13 5h4v14h-4z'} />
            </svg>
          </button>
        ) : null}
      </div>
    </section>
  );
}
