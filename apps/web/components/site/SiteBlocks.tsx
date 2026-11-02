import Link from 'next/link';
import type { ReactNode } from 'react';
import { Galeria } from '@/components/site/Galeria';
import { Historias } from '@/components/site/Historias';
import { VenueMap, directionsUrl } from '@/components/site/VenueMap';
import {
  sectionContent,
  siteSettings,
  type PublicSiteContent,
  type PublicSiteData,
  type PublicSiteItem,
  type PublicSiteNewsItem,
} from '@/lib/public-site-data';
import { anchorOf, pageHref, serviceHref, resolveSiteHref, sectionKeyOf, type LayoutBlock } from '@/lib/site-blocks';
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
import { itemsOf, newsHref, servicesOf, showHref, type Service } from '@/lib/site-model';
import { VENUE_ADDRESS, contactFromSettings } from '@/lib/site-seo';

type Tone = 'papel' | 'blanco' | 'tinta';

type SectionProps = {
  block: Pick<LayoutBlock, 'id' | 'type'>;
  tone: Tone;
  className?: string;
  children: ReactNode;
};

function Section({ block, tone, className = '', children }: SectionProps) {
  const anchor = anchorOf(block);
  return (
    <section id={anchor} data-block={block.id} className={`sa-sec sa-sec--${tone} ${className}`.trim()} aria-labelledby={`${anchor}-t`}>
      {children}
    </section>
  );
}

type HeadProps = {
  titleId?: string;
  content: PublicSiteContent;
  children?: ReactNode;
  wide?: boolean;
};

export function SectionHead({ titleId, content, children, wide }: HeadProps) {
  return (
    <header className={`sa-head ${wide ? 'sa-head--wide' : ''}`.trim()} data-reveal>
      <div className="sa-head__copy">
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={titleId} className="sa-title">
          {content.headline}
        </h2>
        {content.lead ? <p className="sa-lead">{content.lead}</p> : null}
      </div>
      {children ? <div className="sa-head__aside">{children}</div> : null}
    </header>
  );
}

/** Lo que la vista previa enseña en una sección sin contenido; en el sitio esa sección no sale. */
function PreviewEmpty({ children }: { children: ReactNode }) {
  return <p className="sa-preview-empty">{children}</p>;
}

export function DraftTag({ show }: { show: boolean }) {
  return show ? <span className="sa-draft">Borrador</span> : null;
}

function StatusPill({ show }: { show: PublicSiteNewsItem }) {
  const status = showStatusOf(show);
  return <span className={`sa-status sa-status--${status}`}>{SHOW_STATUS_LABEL[status]}</span>;
}

export function ShowRow({ show }: { show: PublicSiteNewsItem }) {
  const date = showDateParts(show.eventDate);
  const tickets = ticketHref(show);
  // Espacio duro antes del punto: si el renglón se parte, el «·» no queda al inicio del siguiente.
  const where = [show.venue, show.city].filter(Boolean).join(' · ');
  const time = showTimeLabel(show.eventTime);
  return (
    <li className={`sa-show ${showStatusOf(show) === 'cancelado' ? 'is-cancelled' : ''}`.trim()} data-reveal>
      <div className="sa-show__date">
        {date ? (
          <>
            <strong>{date.day}</strong>
            <span>
              {date.month} <em>{date.weekday}</em>
            </span>
          </>
        ) : (
          <span>Fecha por definir</span>
        )}
      </div>
      <div className="sa-show__main">
        <h3>
          <Link href={showHref(show.slug)}>{show.title}</Link>
        </h3>
        <p>{[where, time].filter(Boolean).join(' · ') || show.excerpt}</p>
      </div>
      {show.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
        <img className="sa-show__thumb" src={show.coverUrl} alt="" loading="lazy" decoding="async" />
      ) : null}
      <div className="sa-show__side">
        <DraftTag show={show.published === false} />
        <StatusPill show={show} />
        {tickets ? (
          <a className="sa-btn sa-btn--small" href={tickets} {...externalProps(tickets)}>
            {show.ctaLabel || 'Boletos'}
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function ShowsEmpty({ content }: { content: PublicSiteContent }) {
  return (
    <div className="sa-empty" data-reveal>
      <span className="sa-empty__motif" aria-hidden="true" />
      <h3>{content.emptyTitle}</h3>
      <p>{content.emptyText}</p>
      <Link className="sa-btn" href={pageHref('contacto')}>
        Escríbenos
      </Link>
    </div>
  );
}

/** Póster del siguiente show junto a la lista. */
export function ShowsBill({ shows }: { shows: PublicSiteNewsItem[] }) {
  const featured = shows.find((s) => s.coverUrl);
  const countdown = countdownLabel(featured?.eventDate);
  return (
    <div className={`sa-bill ${featured ? 'has-feature' : ''}`.trim()}>
      {featured ? (
        <Link className="sa-feature" href={showHref(featured.slug)} data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio */}
          <img src={featured.coverUrl as string} alt={`Póster de ${featured.title}`} loading="lazy" decoding="async" />
          <span className="sa-feature__tag">{countdown || 'Próximo show'}</span>
        </Link>
      ) : null}
      <ol className="sa-shows">
        {shows.map((show) => (
          <ShowRow key={show.id} show={show} />
        ))}
      </ol>
    </div>
  );
}

function Cartelera({ block, content, shows }: { block: LayoutBlock; content: PublicSiteContent; shows: PublicSiteNewsItem[] }) {
  return (
    <Section block={block} tone="papel">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content} wide>
        <Link className="sa-link" href={pageHref('cartelera')}>
          Ver toda la cartelera
        </Link>
      </SectionHead>
      {shows.length ? <ShowsBill shows={shows.slice(0, 4)} /> : <ShowsEmpty content={content} />}
    </Section>
  );
}

function HistoriasBlock({ block, content, items }: { block: LayoutBlock; content: PublicSiteContent; items: PublicSiteItem[] }) {
  return (
    <Section block={block} tone="tinta" className="sa-sec--rail">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content} wide>
        {items.length ? (
          <Link className="sa-link" href={pageHref('historias')}>
            Ver todas las historias
          </Link>
        ) : null}
      </SectionHead>
      {items.length ? <Historias items={items} /> : <PreviewEmpty>Aún no hay historias. Súbelas desde Studio y aparecen aquí.</PreviewEmpty>}
    </Section>
  );
}

export function StatsRow({ content }: { content: PublicSiteContent }) {
  const stats = content.stats?.filter((s) => s.label?.trim()) ?? [];
  if (!stats.length) return null;
  return (
    <dl className="sa-stats" data-reveal>
      {stats.map((s) => (
        <div key={s.label}>
          <dt>{s.label}</dt>
          <dd>{s.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function Nosotros({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const image = content.imageUrl;
  return (
    <Section block={block} tone="papel" className="sa-about">
      <div className="sa-about__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title sa-title--xl">
          {content.headline}
        </h2>
        <p className="sa-lead">{content.summary || paragraphs(content.body)[0] || content.lead}</p>
        <Link className="sa-btn sa-btn--spaced" href={pageHref('nosotros')}>
          Conoce a Arta
        </Link>
      </div>
      {image ? (
        <div className="sa-about__media" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
          <img src={image} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}
      <StatsRow content={content} />
    </Section>
  );
}

/** Tarjeta de un servicio: lleva a su página. */
export function ServiceCards({ services }: { services: Service[] }) {
  return (
    <ol className="sa-services" data-count={services.length}>
      {services.map((service, i) => (
        <li key={service.slug} data-reveal>
          <Link href={serviceHref(service.slug)}>
            {service.imageUrl ? (
              <span className="sa-services__media">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
                <img src={service.imageUrl} alt="" loading="lazy" decoding="async" />
              </span>
            ) : null}
            <span className="sa-services__n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3>{service.title}</h3>
            <p>{service.body}</p>
            <span className="sa-services__more">Ver qué incluye</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Servicios({ block, content, services }: { block: LayoutBlock; content: PublicSiteContent; services: Service[] }) {
  return (
    <Section block={block} tone="blanco">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content} wide>
        <Link className="sa-link" href={pageHref('servicios')}>
          Ver todos los servicios
        </Link>
      </SectionHead>
      <ServiceCards services={services} />
    </Section>
  );
}

export function NewsCard({ post, large }: { post: PublicSiteNewsItem; large?: boolean }) {
  return (
    <article className={`sa-news ${large ? 'sa-news--large' : ''}`.trim()} data-reveal>
      <Link href={newsHref(post.slug)} className="sa-news__media" tabIndex={-1} aria-hidden="true">
        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- portada dinámica de Studio
          <img src={post.coverUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="sa-news__placeholder" />
        )}
      </Link>
      <div className="sa-news__body">
        <div className="sa-news__meta">
          <DraftTag show={post.published === false} />
          {post.publishedAt ? <time dateTime={post.publishedAt}>{publishedLabel(post.publishedAt)}</time> : null}
        </div>
        <h3>
          <Link href={newsHref(post.slug)}>{post.title}</Link>
        </h3>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
      </div>
    </article>
  );
}

function Noticias({ block, content, news }: { block: LayoutBlock; content: PublicSiteContent; news: PublicSiteNewsItem[] }) {
  const [first, ...rest] = news.slice(0, 4);
  return (
    <Section block={block} tone="papel">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content} wide>
        <Link className="sa-link" href={pageHref('noticias')}>
          Ver todas las noticias
        </Link>
      </SectionHead>
      {first ? (
        <div className={`sa-newsgrid ${rest.length ? '' : 'is-single'}`.trim()}>
          <NewsCard post={first} large />
          {rest.length ? (
            <div className="sa-newsgrid__rest">
              {rest.map((post) => (
                <NewsCard key={post.id} post={post} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="sa-lead sa-muted">{content.emptyText}</p>
      )}
    </Section>
  );
}

function GaleriaBlock({ block, content, items }: { block: LayoutBlock; content: PublicSiteContent; items: PublicSiteItem[] }) {
  return (
    <Section block={block} tone="tinta">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content} wide>
        {items.length ? (
          <Link className="sa-link" href={pageHref('galeria')}>
            Ver toda la galería
          </Link>
        ) : null}
      </SectionHead>
      {items.length ? <Galeria items={items.slice(0, 7)} /> : <PreviewEmpty>Aún no hay fotos. Súbelas desde Studio y aparecen aquí.</PreviewEmpty>}
    </Section>
  );
}

export function AlliesGrid({ items }: { items: PublicSiteItem[] }) {
  return (
    <ul className="sa-allies" data-reveal>
      {items.map((item) => {
        const link = safeHref(item.linkHref);
        const logo = (
          // eslint-disable-next-line @next/next/no-img-element -- logo dinámico de Studio
          <img src={item.mediaUrl} alt={item.title || 'Aliado'} loading="lazy" decoding="async" />
        );
        return (
          <li key={item.id}>
            {link ? (
              <a href={link} {...externalProps(link)}>
                {logo}
              </a>
            ) : (
              logo
            )}
            <DraftTag show={item.active === false} />
          </li>
        );
      })}
    </ul>
  );
}

function Aliados({ block, content, items }: { block: LayoutBlock; content: PublicSiteContent; items: PublicSiteItem[] }) {
  return (
    <Section block={block} tone="papel">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content} />
      {items.length ? <AlliesGrid items={items} /> : <PreviewEmpty>Aún no hay aliados. Sube sus logos desde Studio y aparecen aquí.</PreviewEmpty>}
    </Section>
  );
}

export function FaqList({ faqs }: { faqs: NonNullable<PublicSiteContent['faqs']> }) {
  return (
    <div className="sa-faq" data-reveal>
      {faqs.map((item) => (
        <details key={item.question}>
          <summary>
            {item.question}
            <span aria-hidden="true" />
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

function Faq({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const faqs = content.faqs?.filter((f) => f.question?.trim()) ?? [];
  return (
    <Section block={block} tone="blanco" className="sa-faqsec">
      <SectionHead titleId={`${anchorOf(block)}-t`} content={content}>
        {faqs.length > 3 ? (
          <Link className="sa-link" href={pageHref('preguntas')}>
            Ver todas las preguntas
          </Link>
        ) : null}
      </SectionHead>
      <FaqList faqs={faqs.slice(0, 3)} />
    </Section>
  );
}

export function PlaceSection({ content, titleId, id, as: Tag = 'h2' }: { content: PublicSiteContent; titleId: string; id?: string; as?: 'h2' }) {
  const address = content.address || VENUE_ADDRESS;
  return (
    <section id={id} className="sa-sec sa-sec--papel sa-place" aria-labelledby={titleId}>
      <div className="sa-place__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <Tag id={titleId} className="sa-title">
          {content.headline}
        </Tag>
        {content.lead ? <p className="sa-lead">{content.lead}</p> : null}
        <address>{address}</address>
        <a className="sa-btn" href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
          Cómo llegar
        </a>
      </div>
      <div data-reveal>
        <VenueMap address={address} />
      </div>
    </section>
  );
}

/** Invitación a escribir: cierra Inicio y las páginas de contenido. */
export function CtaBand({ data, id, block }: { data: Pick<PublicSiteData, 'pages'>; id?: string; block?: string }) {
  const content = sectionContent(data, 'home_cta');
  const contact = contactFromSettings(siteSettings(data));
  const titleId = `${id || 'invitacion'}-t`;
  return (
    <section id={id} data-block={block} className="sa-sec sa-sec--tinta sa-band" aria-labelledby={titleId}>
      <span className="sa-contact__motif" aria-hidden="true" />
      <div className="sa-band__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={titleId} className="sa-title sa-title--xl">
          {content.headline}
        </h2>
        {content.body ? <p className="sa-lead">{content.body}</p> : null}
        <div className="sa-band__actions">
          <Link className="sa-btn sa-btn--on-ink" href={pageHref('contacto')}>
            {content.cta || 'Escribir a Arta'}
          </Link>
          <a className="sa-btn sa-btn--ghost-ink" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        </div>
      </div>
    </section>
  );
}

function TextoLibre({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const raw = safeHref(content.ctaHref);
  const link = raw ? resolveSiteHref(raw) : null;
  const dark = content.tone === 'tinta';
  return (
    <Section
      block={block}
      tone={dark ? 'tinta' : 'papel'}
      className={`sa-free ${content.imageSide === 'izquierda' ? 'sa-free--flip' : ''} ${content.imageUrl ? '' : 'sa-free--solo'}`.trim()}
    >
      <div className="sa-free__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title">
          {content.headline}
        </h2>
        {content.body ? <p className="sa-lead sa-prewrap">{content.body}</p> : null}
        {link && content.cta ? (
          <a className={`sa-btn ${dark ? 'sa-btn--on-ink' : ''}`.trim()} href={link} {...externalProps(link)}>
            {content.cta}
          </a>
        ) : null}
      </div>
      {content.imageUrl ? (
        <div className="sa-free__media" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
          <img src={content.imageUrl} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}
    </Section>
  );
}

function Anuncio({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const raw = safeHref(content.ctaHref);
  const link = raw ? resolveSiteHref(raw) : null;
  const paper = content.tone === 'papel' && !content.imageUrl;
  return (
    <Section block={block} tone={paper ? 'blanco' : 'tinta'} className={`sa-banner ${content.imageUrl ? 'has-image' : ''}`.trim()}>
      {content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio
        <img className="sa-banner__img" src={content.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : null}
      <div className="sa-banner__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title sa-title--xl">
          {content.headline}
        </h2>
        {content.body ? <p className="sa-lead sa-prewrap">{content.body}</p> : null}
        {link && content.cta ? (
          <a className={`sa-btn ${paper ? '' : 'sa-btn--on-ink'}`.trim()} href={link} {...externalProps(link)}>
            {content.cta}
          </a>
        ) : null}
      </div>
    </Section>
  );
}

/** Pinta una sección de Inicio: cada una resume algo y lleva a su página. */
export function SiteBlock({ block, data }: { block: LayoutBlock; data: PublicSiteData }) {
  const key = sectionKeyOf(block);
  const content = sectionContent(data, key);
  switch (block.type) {
    case 'cartelera':
      return <Cartelera block={block} content={content} shows={data.shows} />;
    case 'historias':
      return <HistoriasBlock block={block} content={content} items={itemsOf(data, 'historia')} />;
    case 'nosotros':
      return <Nosotros block={block} content={content} />;
    case 'servicios':
      return <Servicios block={block} content={content} services={servicesOf(data)} />;
    case 'noticias':
      return <Noticias block={block} content={content} news={data.news} />;
    case 'galeria':
      return <GaleriaBlock block={block} content={content} items={itemsOf(data, 'foto')} />;
    case 'aliados':
      return <Aliados block={block} content={content} items={itemsOf(data, 'aliado')} />;
    case 'faq':
      return <Faq block={block} content={content} />;
    case 'ubicacion':
      return <PlaceSection id={anchorOf(block)} titleId={`${anchorOf(block)}-t`} content={sectionContent(data, key, { address: VENUE_ADDRESS })} />;
    case 'contacto':
      return <CtaBand data={data} id={anchorOf(block)} block={block.id} />;
    case 'texto':
      return <TextoLibre block={block} content={content} />;
    case 'anuncio':
      return <Anuncio block={block} content={content} />;
    default:
      return null;
  }
}
