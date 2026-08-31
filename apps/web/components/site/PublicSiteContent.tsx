import Image from 'next/image';
import Link from 'next/link';
import { HeroCarousel } from '@/components/site/HeroCarousel';
import { SiteHeader } from '@/components/site/SiteHeader';
import { VenueMap } from '@/components/site/VenueMap';
import { panelLoginUrl } from '@/lib/domains';
import { FALLBACK_SLIDES, type PublicSiteData } from '@/lib/public-site-data';

const CONTACT = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contacto@artaproducciones.com',
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || '',
  city: process.env.NEXT_PUBLIC_CITY || 'Puebla',
  state: process.env.NEXT_PUBLIC_STATE || 'Puebla',
};

const VENUE_ADDRESS =
  process.env.NEXT_PUBLIC_VENUE_ADDRESS ||
  'Auditorio Arema Explanada, Puebla, Puebla, México';

type PublicSiteContentProps = {
  data: PublicSiteData;
};

/** Shared markup for public site (SSR and preview). */
export function PublicSiteContent({ data }: PublicSiteContentProps) {
  const { pages, slides, news } = data;
  const hero = pages.find((p) => p.sectionKey === 'home_hero')?.contentJson;
  const mods = pages.find((p) => p.sectionKey === 'home_modulos')?.contentJson;
  const about = pages.find((p) => p.sectionKey === 'home_about')?.contentJson;
  const cta = pages.find((p) => p.sectionKey === 'home_cta')?.contentJson;

  const panelLogin = panelLoginUrl('ARTA');
  const newsItems = news;
  const carouselSlides = slides.length ? slides : FALLBACK_SLIDES;

  return (
    <div className="site site-arta">
      <SiteHeader />
      <HeroCarousel slides={carouselSlides} hero={hero} />

      <section className="site-section" id="nosotros">
        <div className="about-grid">
          <div>
            <span className="badge arta">arta PRODUCCIONES</span>
            <h2>{about?.headline || 'Producimos el show completo'}</h2>
            <p className="lead">
              {about?.body ||
                about?.lead ||
                'Somos la productora detrás de la experiencia: producción técnica, hospitality, artes, boletera, campaña y cierre financiero. Operamos con el mismo rigor en cada concierto.'}
            </p>
            <div className="stat-row">
              <div>
                <strong>Shows</strong>
                <span>Producción integral de conciertos</span>
              </div>
              <div>
                <strong>Puebla</strong>
                <span>Base operativa y venues aliados</span>
              </div>
              <div>
                <strong>Experiencia</strong>
                <span>Del rider al cierre del evento</span>
              </div>
            </div>
          </div>
          <div
            className="about-visual"
            style={{
              backgroundImage: 'url(/uploads/seed-hero-2.jpg)',
            }}
            role="img"
            aria-label="Producción de eventos en vivo"
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
            <p className="muted">Lo último de Arta Producciones</p>
          </div>
          <a className="btn ghost btn-sm section-head-row__cta" href="#contacto">
            ¿Tienes un show? Escríbenos
          </a>
        </div>
        {newsItems.length ? (
          <div className="news-grid">
            {newsItems.map((n) => (
              <Link href={`/p/arta/noticias/${n.slug}`} className="news-card" key={n.id}>
                <div className="news-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- CMS URLs dinámicas */}
                  <img
                    src={n.coverUrl || FALLBACK_SLIDES[0].imageUrl}
                    alt={n.title}
                    loading="lazy"
                  />
                </div>
                <div className="news-body">
                  <time className="muted" dateTime={n.publishedAt || undefined}>
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
        ) : (
          <p className="muted lead">Pronto publicaremos novedades de la temporada.</p>
        )}
      </section>

      <section className="site-section" id="ubicacion">
        <h2>Ubicación</h2>
        <p className="lead">
          Base operativa en Puebla y venue aliado Auditorio Arema Explanada. Producción integral de
          conciertos y eventos en la región.
        </p>
        <address className="lead" style={{ fontStyle: 'normal' }}>
          {VENUE_ADDRESS}
        </address>
        <VenueMap title="arta PRODUCCIONES · Puebla" address={VENUE_ADDRESS} />
      </section>

      <section className="site-section site-cta-band" id="contacto">
        <div>
          <h2>
            {cta?.headline && !/equipo|panel|studio/i.test(cta.headline)
              ? cta.headline
              : 'Hablemos de tu próximo show'}
          </h2>
          <p className="lead">
            {cta?.body && !/panel|studio|editable/i.test(cta.body)
              ? cta.body
              : 'Cuéntanos tu fecha, venue y alcance. Te respondemos con una propuesta de producción.'}
          </p>
          <div className="row">
            <a className="btn" href={`mailto:${CONTACT.email}`}>
              Escribir a Arta
            </a>
            {CONTACT.phone ? (
              <a className="btn ghost" href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>
                {CONTACT.phone}
              </a>
            ) : (
              <a className="btn ghost" href={`mailto:${CONTACT.email}`}>
                {CONTACT.email}
              </a>
            )}
          </div>
        </div>
        <div className="site-contact-card">
          <div className="label">Contacto</div>
          {CONTACT.phone ? <strong>{CONTACT.phone}</strong> : <strong>{CONTACT.email}</strong>}
          {CONTACT.phone ? <span>{CONTACT.email}</span> : null}
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
            <div className="label">Equipo</div>
            <a href={panelLogin}>Acceso al panel</a>
            <a href={panelLoginUrl('EXPLANADA')}>Panel Auditorio</a>
          </div>
          <div>
            <div className="label">Contacto</div>
            <span>{CONTACT.email}</span>
            {CONTACT.phone ? <span>{CONTACT.phone}</span> : null}
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
