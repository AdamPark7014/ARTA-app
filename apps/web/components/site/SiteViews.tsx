import Link from 'next/link';
import type { ReactNode } from 'react';
import { ContactForm } from '@/components/site/ContactForm';
import { Galeria } from '@/components/site/Galeria';
import { Historias } from '@/components/site/Historias';
import {
  AlliesGrid,
  CtaBand,
  DraftTag,
  FaqList,
  NewsCard,
  PlaceSection,
  SectionHead,
  ServiceCards,
  ShowRow,
  ShowsBill,
  ShowsEmpty,
  StatsRow,
} from '@/components/site/SiteBlocks';
import { SitePage } from '@/components/site/SitePage';
import { directionsUrl } from '@/components/site/VenueMap';
import { sectionContent, siteSettings, type PublicSiteContent, type PublicSiteData, type PublicSiteNewsItem } from '@/lib/public-site-data';
import { pageHref, pageMeta, serviceHref, type PageKey } from '@/lib/site-blocks';
import {
  SHOW_STATUS_LABEL,
  countdownLabel,
  externalProps,
  paragraphs,
  publishedLabel,
  safeHref,
  showDateParts,
  showStatusOf,
  showTimeLabel,
  ticketHref,
} from '@/lib/site-format';
import { HOME_HREF, isPageOff, itemsOf, servicesOf, showHref, type Service } from '@/lib/site-model';
import { VENUE_ADDRESS, contactFromSettings, socialProfiles } from '@/lib/site-seo';

type Crumb = { label: string; href?: string };

export function SiteCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="sa-crumbs" aria-label="Estás en">
      <ol>
        {crumbs.map((crumb) => (
          <li key={crumb.label}>
            {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

type PageHeadProps = {
  crumbs: Crumb[];
  eyebrow?: string;
  title: string;
  lead?: string | null;
  image?: string | null;
  children?: ReactNode;
};

/** La cabecera de cada página: foto a color (o tinta con el motivo), migas y título. */
export function PageHead({ crumbs, eyebrow, title, lead, image, children }: PageHeadProps) {
  return (
    <header className={`sa-pagehead ${image ? 'has-image' : ''}`.trim()}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio
        <img className="sa-pagehead__img" src={image} alt="" decoding="async" />
      ) : (
        <span className="sa-pagehead__motif" aria-hidden="true" />
      )}
      <div className="sa-pagehead__inner">
        <SiteCrumbs crumbs={crumbs} />
        {eyebrow ? <p className="sa-eyebrow">{eyebrow}</p> : null}
        <h1 className="sa-title sa-title--xl">{title}</h1>
        {lead ? <p className="sa-lead">{lead}</p> : null}
        {children}
      </div>
    </header>
  );
}

function SimpleHead({ pageKey, content }: { pageKey: PageKey; content: PublicSiteContent }) {
  return (
    <PageHead
      crumbs={[{ label: 'Inicio', href: HOME_HREF }, { label: pageMeta(pageKey).label }]}
      eyebrow={content.eyebrow}
      title={content.headline || pageMeta(pageKey).label}
      lead={content.lead}
      image={content.pageImage}
    />
  );
}

type ViewProps = { data: PublicSiteData; preview?: boolean };

function PastShows({ past, tone = 'tinta', title, eyebrow }: { past: PublicSiteNewsItem[]; tone?: 'tinta' | 'blanco'; title: string; eyebrow?: string }) {
  return (
    <section className={`sa-sec sa-sec--${tone}`} aria-label={title}>
      <header className="sa-head sa-head--wide" data-reveal>
        <div className="sa-head__copy">
          {eyebrow ? <p className="sa-eyebrow">{eyebrow}</p> : null}
          <h2 className="sa-title">{title}</h2>
        </div>
      </header>
      <ul className="sa-past">
        {past.map((show) => {
          const date = showDateParts(show.eventDate);
          return (
            <li key={show.id} data-reveal>
              <Link href={showHref(show.slug)}>
                {show.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
                  <img src={show.coverUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="sa-news__placeholder" />
                )}
                <strong>{show.title}</strong>
                {date ? <span>{date.long}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CarteleraView({ data, preview, upcoming, past = [] }: ViewProps & { upcoming: PublicSiteNewsItem[]; past?: PublicSiteNewsItem[] }) {
  const content = sectionContent(data, 'home_cartelera');
  return (
    <SitePage data={data} active="cartelera" overDark preview={preview}>
      <main id="contenido">
        <SimpleHead pageKey="cartelera" content={content} />
        <section className="sa-sec sa-sec--papel" aria-label="Próximos shows">
          {upcoming.length ? <ShowsBill shows={upcoming} /> : <ShowsEmpty content={content} />}
        </section>
        {past.length ? <PastShows past={past} eyebrow="Ya pasaron" title="Shows anteriores" /> : null}
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function ShowView({ data, preview, show, others }: ViewProps & { show: PublicSiteNewsItem & { body?: string | null }; others: PublicSiteNewsItem[] }) {
  const date = showDateParts(show.eventDate);
  const time = showTimeLabel(show.eventTime);
  const status = showStatusOf(show);
  const tickets = ticketHref(show);
  const countdown = countdownLabel(show.eventDate);
  const where = [show.venue, show.city].filter(Boolean).join(', ');
  return (
    <SitePage data={data} active="cartelera" preview={preview}>
      <main id="contenido">
        <article className="sa-sec sa-sec--papel sa-showpage">
          <div className="sa-showpage__poster" data-reveal>
            {show.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
              <img src={show.coverUrl} alt={`Póster de ${show.title}`} decoding="async" />
            ) : (
              <span className="sa-news__placeholder" />
            )}
          </div>
          <div className="sa-showpage__copy" data-reveal>
            <SiteCrumbs crumbs={[{ label: 'Inicio', href: HOME_HREF }, { label: 'Cartelera', href: pageHref('cartelera') }, { label: show.title }]} />
            <DraftTag show={show.published === false} />
            <h1 className="sa-title sa-title--xl">{show.title}</h1>
            {show.excerpt ? <p className="sa-lead">{show.excerpt}</p> : null}
            <dl className="sa-facts">
              {date ? (
                <div>
                  <dt>Fecha</dt>
                  <dd>{date.long}</dd>
                </div>
              ) : null}
              {time ? (
                <div>
                  <dt>Hora</dt>
                  <dd>{time}</dd>
                </div>
              ) : null}
              {where ? (
                <div>
                  <dt>Lugar</dt>
                  <dd>
                    <a href={directionsUrl(where)} target="_blank" rel="noopener noreferrer">
                      {where}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Boletos</dt>
                <dd>
                  <span className={`sa-status sa-status--${status}`}>{SHOW_STATUS_LABEL[status]}</span>
                  {countdown && status !== 'cancelado' ? <span className="sa-facts__note">{countdown}</span> : null}
                </dd>
              </div>
            </dl>
            {tickets ? (
              <a className="sa-btn sa-btn--large" href={tickets} {...externalProps(tickets)}>
                {show.ctaLabel || 'Comprar boletos'}
              </a>
            ) : null}
            <div className="sa-prose">
              {paragraphs(show.body).map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
          </div>
        </article>
        {others.length ? <PastShows past={others.slice(0, 4)} tone="blanco" title="También en cartelera" /> : null}
      </main>
    </SitePage>
  );
}

export function NotFoundView({ data, preview, title, text, href, linkLabel }: ViewProps & { title: string; text: string; href: string; linkLabel: string }) {
  return (
    <SitePage data={data} preview={preview}>
      <main id="contenido">
        <section className="sa-sec sa-sec--papel sa-notfound">
          <h1 className="sa-title">{title}</h1>
          <p className="sa-lead">{text}</p>
          <Link className="sa-btn" href={href}>
            {linkLabel}
          </Link>
        </section>
      </main>
    </SitePage>
  );
}

export function NosotrosView({ data, preview }: ViewProps) {
  const content = sectionContent(data, 'home_about');
  const aliados = sectionContent(data, 'home_aliados');
  const logos = itemsOf(data, 'aliado');
  const steps = content.steps?.filter((s) => s.title?.trim()) ?? [];
  const services = isPageOff(data, 'servicios') ? [] : servicesOf(data);
  return (
    <SitePage data={data} active="nosotros" overDark preview={preview}>
      <main id="contenido">
        <PageHead
          crumbs={[{ label: 'Inicio', href: HOME_HREF }, { label: 'Nosotros' }]}
          eyebrow={content.eyebrow}
          title={content.headline || 'Nosotros'}
          lead={content.summary}
          image={content.pageImage}
        />
        <section className="sa-sec sa-sec--papel sa-about" aria-label="Quiénes somos">
          <div className="sa-prose sa-about__copy" data-reveal>
            {paragraphs(content.body).map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
          {content.imageUrl ? (
            <div className="sa-about__media" data-reveal>
              {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
              <img src={content.imageUrl} alt="" loading="lazy" decoding="async" />
            </div>
          ) : null}
          <StatsRow content={content} />
        </section>
        {steps.length ? (
          <section className="sa-sec sa-sec--tinta" aria-labelledby="pasos-t">
            <header className="sa-head" data-reveal>
              <div className="sa-head__copy">
                <h2 id="pasos-t" className="sa-title">
                  {content.stepsTitle || 'Cómo trabajamos'}
                </h2>
              </div>
            </header>
            <ol className="sa-steps">
              {steps.map((step, i) => (
                <li key={step.title} data-reveal>
                  <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {services.length ? (
          <section className="sa-sec sa-sec--blanco" aria-labelledby="nos-servicios-t">
            <SectionHead titleId="nos-servicios-t" content={sectionContent(data, 'home_modulos')} wide>
              <Link className="sa-link" href={pageHref('servicios')}>
                Ver todos los servicios
              </Link>
            </SectionHead>
            <ServiceCards services={services} />
          </section>
        ) : null}
        {logos.length ? (
          <section className="sa-sec sa-sec--papel" aria-labelledby="aliados-t">
            <SectionHead titleId="aliados-t" content={aliados} />
            <AlliesGrid items={logos} />
          </section>
        ) : null}
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function ServiciosView({ data, preview }: ViewProps) {
  const content = sectionContent(data, 'home_modulos');
  const services = servicesOf(data);
  return (
    <SitePage data={data} active="servicios" overDark preview={preview}>
      <main id="contenido">
        <SimpleHead pageKey="servicios" content={content} />
        <section className="sa-sec sa-sec--blanco" aria-label="Servicios">
          <ol className="sa-servicelist">
            {services.map((service, i) => (
              <li key={service.slug} data-reveal>
                <Link href={serviceHref(service.slug)}>
                  {service.imageUrl ? (
                    <span className="sa-servicelist__media">
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
                      <img src={service.imageUrl} alt="" loading="lazy" decoding="async" />
                    </span>
                  ) : null}
                  <span className="sa-servicelist__copy">
                    <span className="sa-servicelist__n" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h2>{service.title}</h2>
                    <p>{service.body}</p>
                    <span className="sa-link">Ver qué incluye</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function ServicioView({ data, preview, service }: ViewProps & { service: Service }) {
  const others = servicesOf(data).filter((s) => s.slug !== service.slug);
  return (
    <SitePage data={data} active="servicios" overDark preview={preview}>
      <main id="contenido">
        <PageHead
          crumbs={[{ label: 'Inicio', href: HOME_HREF }, { label: 'Servicios', href: pageHref('servicios') }, { label: service.title }]}
          eyebrow="Servicio"
          title={service.title}
          lead={service.body}
          image={service.imageUrl}
        />
        <section className="sa-sec sa-sec--papel sa-service" aria-label={`Detalle de ${service.title}`}>
          <div className="sa-prose" data-reveal>
            {paragraphs(service.detail).map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
          {service.includesList.length ? (
            <aside className="sa-includes" data-reveal>
              <h2>Qué incluye</h2>
              <ul>
                {service.includesList.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </aside>
          ) : null}
        </section>
        {others.length ? (
          <section className="sa-sec sa-sec--blanco" aria-labelledby="otros-servicios-t">
            <header className="sa-head sa-head--wide" data-reveal>
              <div className="sa-head__copy">
                <h2 id="otros-servicios-t" className="sa-title">
                  Otros servicios
                </h2>
              </div>
            </header>
            <ServiceCards services={others} />
          </section>
        ) : null}
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function NoticiasView({ data, preview, news }: ViewProps & { news: PublicSiteNewsItem[] }) {
  const content = sectionContent(data, 'home_noticias');
  const [first, ...rest] = news;
  return (
    <SitePage data={data} active="noticias" overDark preview={preview}>
      <main id="contenido">
        <SimpleHead pageKey="noticias" content={content} />
        <section className="sa-sec sa-sec--papel" aria-label="Publicaciones">
          {first ? (
            <>
              <div className="sa-newsfirst">
                <NewsCard post={first} large />
              </div>
              {rest.length ? (
                <div className="sa-newslist">
                  {rest.map((post) => (
                    <NewsCard key={post.slug} post={post} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="sa-lead sa-muted">{content.emptyText}</p>
          )}
        </section>
      </main>
    </SitePage>
  );
}

type Article = PublicSiteNewsItem & { body?: string | null };

export function NoticiaView({ data, preview, post }: ViewProps & { post: Article }) {
  const cta = safeHref(post.ctaHref);
  const more = data.news.filter((n) => n.slug !== post.slug).slice(0, 3);
  return (
    <SitePage data={data} active="noticias" preview={preview}>
      <main id="contenido">
        <article className="sa-sec sa-sec--papel sa-article">
          <header className="sa-article__head" data-reveal>
            <SiteCrumbs crumbs={[{ label: 'Inicio', href: HOME_HREF }, { label: 'Noticias', href: pageHref('noticias') }, { label: post.title }]} />
            <DraftTag show={post.published === false} />
            <h1 className="sa-title sa-title--xl">{post.title}</h1>
            {post.excerpt ? <p className="sa-lead">{post.excerpt}</p> : null}
            {post.publishedAt ? <time dateTime={post.publishedAt}>{publishedLabel(post.publishedAt)}</time> : null}
          </header>
          {post.coverUrl ? (
            <div className="sa-article__cover" data-reveal>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL dinámica de Studio */}
              <img src={post.coverUrl} alt={post.title} decoding="async" />
            </div>
          ) : null}
          <div className="sa-prose" data-reveal>
            {paragraphs(post.body).map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            {cta && post.ctaLabel ? (
              <p>
                <a className="sa-btn" href={cta} {...externalProps(cta)}>
                  {post.ctaLabel}
                </a>
              </p>
            ) : null}
          </div>
        </article>
        {more.length ? (
          <section className="sa-sec sa-sec--blanco" aria-labelledby="mas-noticias-t">
            <header className="sa-head sa-head--wide">
              <div className="sa-head__copy">
                <h2 id="mas-noticias-t" className="sa-title">
                  Más noticias
                </h2>
              </div>
              <div className="sa-head__aside">
                <Link className="sa-link" href={pageHref('noticias')}>
                  Ver todas
                </Link>
              </div>
            </header>
            <div className="sa-newslist">
              {more.map((n) => (
                <NewsCard key={n.id} post={n} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </SitePage>
  );
}

export function HistoriasView({ data, preview }: ViewProps) {
  const content = sectionContent(data, 'home_historias');
  const items = itemsOf(data, 'historia');
  return (
    <SitePage data={data} active="historias" overDark preview={preview}>
      <main id="contenido">
        <SimpleHead pageKey="historias" content={content} />
        <section className="sa-sec sa-sec--tinta" aria-label="Todas las historias">
          {items.length ? <Historias items={items} grid /> : <p className="sa-lead sa-muted">{content.emptyText}</p>}
        </section>
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function GaleriaView({ data, preview }: ViewProps) {
  const content = sectionContent(data, 'home_galeria');
  const items = itemsOf(data, 'foto');
  return (
    <SitePage data={data} active="galeria" overDark preview={preview}>
      <main id="contenido">
        <SimpleHead pageKey="galeria" content={content} />
        <section className="sa-sec sa-sec--tinta" aria-label="Todas las fotos">
          {items.length ? <Galeria items={items} /> : <p className="sa-lead sa-muted">{content.emptyText}</p>}
        </section>
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function PreguntasView({ data, preview }: ViewProps) {
  const content = sectionContent(data, 'home_faq');
  const faqs = content.faqs?.filter((f) => f.question?.trim()) ?? [];
  return (
    <SitePage data={data} active="preguntas" overDark preview={preview}>
      <main id="contenido">
        <SimpleHead pageKey="preguntas" content={content} />
        <section className="sa-sec sa-sec--blanco sa-faqpage" aria-label="Preguntas y respuestas">
          <FaqList faqs={faqs} />
        </section>
        <CtaBand data={data} />
      </main>
    </SitePage>
  );
}

export function ContactoView({ data, preview }: ViewProps) {
  const content = sectionContent(data, 'home_cta');
  const place = sectionContent(data, 'home_ubicacion', { address: VENUE_ADDRESS });
  const settings = siteSettings(data);
  const contact = contactFromSettings(settings);
  const socials = socialProfiles(settings);
  return (
    <SitePage data={data} active="contacto" overDark preview={preview}>
      <main id="contenido">
        <PageHead
          crumbs={[{ label: 'Inicio', href: HOME_HREF }, { label: 'Contacto' }]}
          eyebrow={content.eyebrow}
          title={content.headline || 'Contacto'}
          lead={content.body}
          image={content.pageImage}
        />
        <section className="sa-sec sa-sec--tinta sa-contact" aria-label="Escríbenos">
          <span className="sa-contact__motif" aria-hidden="true" />
          <div className="sa-contact__copy" data-reveal>
            <h2 className="sa-title">Escríbenos</h2>
            <ul className="sa-contact__ways">
              <li>
                <span>Correo</span>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
              {contact.phone ? (
                <li>
                  <span>Teléfono</span>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a>
                </li>
              ) : null}
              <li>
                <span>Ciudad</span>
                <b>
                  {contact.city}, {contact.state}
                </b>
              </li>
              {socials.length ? (
                <li>
                  <span>Redes</span>
                  <div>
                    {socials.map((p) => (
                      <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer me">
                        {p.label}
                      </a>
                    ))}
                  </div>
                </li>
              ) : null}
            </ul>
          </div>
          <div data-reveal>
            <ContactForm email={contact.email} whatsapp={contact.whatsapp} submitLabel={content.cta || 'Escribir a Arta'} />
          </div>
        </section>
        <PlaceSection id="ubicacion" titleId="ubicacion-t" content={place} />
      </main>
    </SitePage>
  );
}
