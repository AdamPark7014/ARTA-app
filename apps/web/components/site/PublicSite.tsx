'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { VenueMap } from '@/components/site/VenueMap';

type Tile = { title: string; body: string };
type Content = {
  brand?: string;
  brandSub?: string;
  headline?: string;
  sub?: string;
  lead?: string;
  body?: string;
  cta?: string;
  ctaHref?: string;
  tiles?: Tile[];
};

type Slide = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  imageUrl: string;
  ctaLabel?: string | null;
  ctaHref?: string | null;
};

type NewsItem = {
  id: string;
  title: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
  slug: string;
};

const CONTACT = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contacto@artaproducciones.com',
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || '+52 222 000 0000',
  city: process.env.NEXT_PUBLIC_CITY || 'Puebla',
  state: process.env.NEXT_PUBLIC_STATE || 'Puebla',
};

const FALLBACK_SLIDES: Slide[] = [
  {
    id: '1',
    title: 'La experiencia del Show',
    subtitle: 'Producción integral de conciertos y eventos en Puebla',
    imageUrl: '/uploads/seed-hero-1.jpg',
    ctaLabel: 'Ver operación',
    ctaHref: '#modulos',
  },
  {
    id: '2',
    title: 'Escenario, luz y público',
    subtitle: 'Checklists, boletera, campaña y cierre en un solo flujo',
    imageUrl: '/uploads/seed-hero-2.jpg',
    ctaLabel: 'Conoce Arta',
    ctaHref: '#nosotros',
  },
  {
    id: '3',
    title: 'Cada detalle cuenta',
    subtitle: 'Hospitality, producción técnica y firmas digitales',
    imageUrl: '/uploads/seed-hero-3.jpg',
    ctaLabel: 'Noticias',
    ctaHref: '#noticias',
  },
];

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    slug: 'temporada-puebla',
    title: 'Nueva temporada de shows en Puebla',
    excerpt: 'Producción, artes y boletera alineadas de punta a punta.',
    coverUrl: '/uploads/seed-news-1.jpg',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    slug: 'checklists-digitales',
    title: 'Checklists digitales con firma',
    excerpt: 'Entregado y autorizado quedan registrados en PDF por evento.',
    coverUrl: '/uploads/seed-news-2.jpg',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'n3',
    slug: 'experiencia-show',
    title: 'La experiencia del Show',
    excerpt: 'Montaje, corrida y cierre con el sello Arta en cada venue.',
    coverUrl: '/uploads/seed-news-3.jpg',
    publishedAt: new Date().toISOString(),
  },
];

export function PublicSite() {
  const [pages, setPages] = useState<Array<{ sectionKey: string; contentJson: Content }>>([]);
  const [slides, setSlides] = useState<Slide[]>(FALLBACK_SLIDES);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch('/api/studio/public/ARTA')
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages || []);
        if (d.slides?.length) setSlides(d.slides);
        if (d.news?.length) setNews(d.news);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const next = useCallback(() => {
    setSlideIdx((i) => (i + 1) % Math.max(slides.length, 1));
  }, [slides.length]);

  const prev = useCallback(() => {
    setSlideIdx((i) => (i - 1 + slides.length) % Math.max(slides.length, 1));
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setInterval(next, 5500);
    return () => clearInterval(t);
  }, [paused, slides.length, next]);

  const hero = pages.find((p) => p.sectionKey === 'home_hero')?.contentJson;
  const mods = pages.find((p) => p.sectionKey === 'home_modulos')?.contentJson;
  const about = pages.find((p) => p.sectionKey === 'home_about')?.contentJson;
  const cta = pages.find((p) => p.sectionKey === 'home_cta')?.contentJson;
  const current = slides[slideIdx] || FALLBACK_SLIDES[0];

  return (
    <div className="site site-arta">
      <header className={`site-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <Link href="/p/arta" className="site-brand">
          <Image
            src="/brand/arta-logo.png"
            alt="arta"
            width={140}
            height={56}
            className="site-logo-img"
            priority
          />
        </Link>
        <nav className="site-nav-links">
          <a href="#nosotros">Nosotros</a>
          <a href="#modulos">Operación</a>
          <a href="#noticias">Noticias</a>
          <a href="#ubicacion">Ubicación</a>
          <a href="#contacto">Contacto</a>
        </nav>
      </header>

      {/* Hero carousel — full bleed */}
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
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => setSlideIdx(i)}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="site-section" id="nosotros">
        <div className="about-grid">
          <div>
            <div className="site-hero-kicker">arta PRODUCCIONES</div>
            <h2>{about?.headline || 'Producimos el show completo'}</h2>
            <p className="lead">
              {about?.body ||
                about?.lead ||
                'Somos la productora detrás de la experiencia: producción técnica, hospitality, artes, boletera, campaña y cierre financiero. Operamos con el mismo rigor en cada concierto.'}
            </p>
            <div className="stat-row">
              <div>
                <strong>14+</strong>
                <span>Formatos operativos</span>
              </div>
              <div>
                <strong>1</strong>
                <span>Sitio público Arta</span>
              </div>
              <div>
                <strong>1</strong>
                <span>Panel de control</span>
              </div>
            </div>
          </div>
          <div
            className="about-visual"
            style={{
              backgroundImage: 'url(/uploads/seed-hero-2.jpg)',
            }}
          />
        </div>
      </section>

      <section className="site-section" id="modulos">
        <h2>{mods?.headline || 'Todo el flujo del evento'}</h2>
        <p className="lead">
          {mods?.lead ||
            'Desde el rider hasta el cierre: formatos editables, firmas digitales y control financiero.'}
        </p>
        <div className="site-grid">
          {(
            mods?.tiles || [
              { title: 'Producción', body: 'Riders, plantas de luz, stage hands y minuto a minuto.' },
              { title: 'Hospitality', body: 'Hospedaje, transporte, catering y camerinos.' },
              { title: 'Comercial', body: 'Boletera, patrocinios, artes y campaña autorizada.' },
              { title: 'Cierre', body: 'Corrida financiera, anticipos y firmas entregado / autorizado.' },
            ]
          ).map((t) => (
            <div className="site-tile" key={t.title}>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" id="noticias">
        <div className="section-head-row">
          <div>
            <h2>Noticias</h2>
            <p className="lead" style={{ marginBottom: 0 }}>
              Lo último de Arta Producciones
            </p>
          </div>
        </div>
        <div className="news-grid">
          {(news.length ? news : FALLBACK_NEWS).map((n) => (
            <Link href={`/p/arta/noticias/${n.slug}`} className="news-card" key={n.id}>
              <div
                className="news-cover"
                style={{
                  backgroundImage: `url(${n.coverUrl || FALLBACK_SLIDES[0].imageUrl})`,
                }}
              />
              <div className="news-body">
                <time className="muted">
                  {n.publishedAt
                    ? new Date(n.publishedAt).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : ''}
                </time>
                <h3>{n.title}</h3>
                <p>{n.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-section" id="ubicacion">
        <h2>Ubicación</h2>
        <p className="lead">
          Base operativa en Puebla. Producción integral de conciertos y eventos en venues aliados.
        </p>
        <VenueMap
          title="arta PRODUCCIONES · Puebla"
          address={process.env.NEXT_PUBLIC_VENUE_ADDRESS || `${CONTACT.city}, ${CONTACT.state}`}
        />
      </section>

      <section className="site-section site-cta-band" id="contacto">
        <div>
          <h2>{cta?.headline && !/equipo|panel|studio/i.test(cta.headline) ? cta.headline : 'Hablemos de tu próximo show'}</h2>
          <p className="lead">
            {cta?.body && !/panel|studio|editable/i.test(cta.body)
              ? cta.body
              : 'Cuéntanos tu fecha, venue y alcance. Te respondemos con una propuesta de producción.'}
          </p>
          <div className="row">
            <a className="btn" href={`mailto:${CONTACT.email}`}>
              Escribir a Arta
            </a>
            <a className="btn ghost" href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>
              {CONTACT.phone}
            </a>
          </div>
        </div>
        <div className="site-contact-card">
          <div className="label">Contacto</div>
          <strong>{CONTACT.phone}</strong>
          <span>{CONTACT.email}</span>
          <span>
            {CONTACT.city}, {CONTACT.state}
          </span>
        </div>
      </section>

      <footer className="site-footer-pro">
        <div className="site-footer-brand">
          <Image src="/brand/arta-logo.png" alt="arta" width={120} height={48} />
          <p>“La experiencia del Show”</p>
        </div>
        <div className="site-footer-cols">
          <div>
            <div className="label">Sitio</div>
            <Link href="/p/arta">Inicio</Link>
            <a href="#noticias">Noticias</a>
            <a href="#contacto">Contacto</a>
          </div>
          <div>
            <div className="label">Secciones</div>
            <a href="#nosotros">Nosotros</a>
            <a href="#modulos">Operación</a>
            <a href="#ubicacion">Mapa</a>
          </div>
          <div>
            <div className="label">Contacto</div>
            <span>{CONTACT.email}</span>
            <span>{CONTACT.phone}</span>
            <span>
              {CONTACT.city}, {CONTACT.state}
            </span>
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} arta PRODUCCIONES</span>
          <span>Producción integral de eventos</span>
        </div>
      </footer>
    </div>
  );
}
