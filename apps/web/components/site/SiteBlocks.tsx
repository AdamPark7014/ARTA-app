import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Galeria } from '@/components/site/Galeria';
import { Historias } from '@/components/site/Historias';
import { LitLine } from '@/components/site/LitLine';
import { ProcessScroll } from '@/components/site/ProcessScroll';
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
  daysUntil,
  externalProps,
  paragraphs,
  publishedLabel,
  safeHref,
  showDateParts,
  showStatusOf,
  showTimeLabel,
  ticketHref,
} from '@/lib/site-format';
import { heroPhotoUrls, itemsOf, newsHref, servicesOf, showHref, type Service } from '@/lib/site-model';
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

/** Un titular de varias oraciones va en un renglón cada una. */
function Sentences({ text }: { text?: string }) {
  return (
    <>
      {(text || '').split(/(?<=\.)\s+/).map((line) => (
        <span className="sa-line" key={line}>
          {line}
        </span>
      ))}
    </>
  );
}

/** La franja de arriba de Inicio: el siguiente show, en una línea. */
export function NextShowRibbon({ show }: { show: PublicSiteNewsItem }) {
  const date = showDateParts(show.eventDate);
  const days = daysUntil(show.eventDate);
  const lead = days !== null && days >= 0 && days <= 6 ? 'Esta semana' : 'Próximo show';
  const when = date ? `${date.weekdayLong[0].toUpperCase()}${date.weekdayLong.slice(1)} ${date.dayMonth}` : '';
  const where = [when, show.venue].filter(Boolean).join(', ');
  return (
    <p className="sa-ribbon">
      {lead}: {show.title}.{where ? ` ${where}.` : ''}{' '}
      <Link href={showHref(show.slug)}>Ver detalles&nbsp;›</Link>
    </p>
  );
}

const LIGHT_TINTS = ['255, 176, 88', '255, 88, 122', '255, 226, 190'];

/** Sin póster, la tarjeta es un escenario a oscuras con sus reflectores. No finge una foto que no es del show. */
function StageLights({ index, wide }: { index: number; wide: boolean }) {
  const beams = wide
    ? [
        { x: '22%', from: '18deg', to: '-6deg', time: '11s' },
        { x: '50%', from: '-12deg', to: '14deg', time: '13s' },
        { x: '78%', from: '-20deg', to: '7deg', time: '9s' },
      ]
    : [
        { x: '30%', from: index % 2 ? '14deg' : '-8deg', to: index % 2 ? '-10deg' : '12deg', time: '12s' },
        { x: '70%', from: index % 2 ? '-14deg' : '12deg', to: index % 2 ? '10deg' : '-12deg', time: '10s' },
      ];
  return (
    <span className="sa-lights" style={{ '--tint': LIGHT_TINTS[index % LIGHT_TINTS.length] } as CSSProperties} aria-hidden="true">
      {beams.map((beam) => (
        <i key={beam.x} style={{ '--x': beam.x, '--from': beam.from, '--to': beam.to, '--time': beam.time } as CSSProperties} />
      ))}
    </span>
  );
}

/** La tarjeta de un show. Con póster: el arte se asoma abajo y le da el color a la tarjeta. */
function ShowTile({ show, wide, index }: { show: PublicSiteNewsItem; wide: boolean; index: number }) {
  const date = showDateParts(show.eventDate);
  const tickets = ticketHref(show);
  const status = showStatusOf(show);
  const time = showTimeLabel(show.eventTime);
  const classes = [
    'sa-tile',
    wide ? 'sa-tile--wide' : '',
    show.coverUrl ? 'has-poster' : '',
    status === 'cancelado' ? 'is-cancelled' : '',
  ];
  return (
    <article className={classes.filter(Boolean).join(' ')} data-reveal>
      {show.coverUrl ? (
        <span className="sa-tile__glow" style={{ backgroundImage: `url(${show.coverUrl})` }} aria-hidden="true" />
      ) : (
        <StageLights index={index} wide={wide} />
      )}
      <div className="sa-tile__copy">
        <p className="sa-tile__when">{[date?.dayMonth || 'Fecha por definir', show.venue, show.city].filter(Boolean).join(' · ')}</p>
        <DraftTag show={show.published === false} />
        <h3>
          <Link href={showHref(show.slug)}>{show.title}</Link>
        </h3>
        <p className="sa-tile__sub">{[time, countdownLabel(show.eventDate)].filter(Boolean).join(' · ') || show.excerpt}</p>
        <div className="sa-cta">
          {tickets ? (
            <a className="sa-btn" href={tickets} {...externalProps(tickets)}>
              {show.ctaLabel || 'Boletos'}
            </a>
          ) : (
            <StatusPill show={show} />
          )}
          <Link className="sa-arrow" href={showHref(show.slug)}>
            Ver detalles
          </Link>
        </div>
      </div>
      {show.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
        <img className="sa-tile__poster" src={show.coverUrl} alt={`Póster de ${show.title}`} loading="lazy" decoding="async" />
      ) : null}
    </article>
  );
}

function Cartelera({ block, content, shows }: { block: LayoutBlock; content: PublicSiteContent; shows: PublicSiteNewsItem[] }) {
  const list = shows.slice(0, 5);
  return (
    <Section block={block} tone="papel" className="sa-sec--mosaic">
      <header className="sa-headc" data-reveal>
        <h2 id={`${anchorOf(block)}-t`} className="sa-title">
          {content.headline}
        </h2>
      </header>
      {list.length ? (
        <div className="sa-mosaic">
          {list.map((show, i) => (
            <ShowTile key={show.id} show={show} index={i} wide={i === 0 && list.length % 2 === 1} />
          ))}
        </div>
      ) : (
        <PreviewEmpty>Aún no hay shows publicados. Agrégalos en Cartelera y aparecen aquí.</PreviewEmpty>
      )}
      <p className="sa-more" data-reveal>
        <Link className="sa-arrow" href={pageHref('cartelera')}>
          Ver toda la cartelera
        </Link>
      </p>
    </Section>
  );
}

function Frase({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  return (
    <Section block={block} tone="papel" className="sa-say">
      <LitLine id={`${anchorOf(block)}-t`} text={content.text || ''} />
    </Section>
  );
}

function Proceso({ block, content, data }: { block: LayoutBlock; content: PublicSiteContent; data: PublicSiteData }) {
  const photos = heroPhotoUrls(data);
  const steps = (sectionContent(data, 'home_about').steps ?? [])
    .filter((step) => step.title?.trim())
    .map((step, i) => ({ title: step.title, body: step.body, imageUrl: step.imageUrl || photos[i % Math.max(photos.length, 1)] }));
  return (
    <Section block={block} tone="papel" className="sa-proc-sec">
      <header className="sa-head" data-reveal>
        <div className="sa-head__copy">
          <h2 id={`${anchorOf(block)}-t`} className="sa-title">
            {content.headline}
          </h2>
        </div>
        <div className="sa-head__aside">
          <Link className="sa-arrow" href={pageHref('nosotros')}>
            Conoce a Arta
          </Link>
        </div>
      </header>
      {steps.length ? <ProcessScroll steps={steps} /> : <PreviewEmpty>Agrega los pasos en Nosotros y aparecen aquí.</PreviewEmpty>}
    </Section>
  );
}

function Recientes({ block, content, past }: { block: LayoutBlock; content: PublicSiteContent; past: PublicSiteNewsItem[] }) {
  return (
    <Section block={block} tone="papel" className="sa-recent">
      <header className="sa-head" data-reveal>
        <div className="sa-head__copy">
          <h2 id={`${anchorOf(block)}-t`} className="sa-title">
            {content.headline}
          </h2>
        </div>
      </header>
      {past.length ? (
        <ul data-reveal>
          {past.slice(0, 5).map((show) => {
            const date = showDateParts(show.eventDate);
            return (
              <li key={show.id}>
                <Link href={showHref(show.slug)}>
                  <strong>{show.title}</strong>
                  {show.venue ? <span>{show.venue}</span> : <span />}
                  {date ? <time dateTime={show.eventDate || undefined}>{`${date.short} ${date.year}`}</time> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <PreviewEmpty>Aquí salen solos los shows que ya pasaron. La vista previa no los trae.</PreviewEmpty>
      )}
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

/** Un servicio en el mosaico de Inicio: se turnan foto y texto grande. */
function ServiceTileBento({ service, index, full }: { service: Service; index: number; full: boolean }) {
  const turn = index % 4;
  const photo = turn % 2 === 0 ? service.imageUrl : undefined;
  const words = (service.tagline || '').split(/(?<=\.)\s+/).filter(Boolean);
  const ledger = !photo && turn === 3 ? service.includesList.slice(0, 4) : [];
  const stacked = !photo && !ledger.length && words.length > 1;
  const span = full ? 'full' : turn === 0 || turn === 3 ? 'big' : 'small';
  return (
    <li className={`sa-bt sa-bt--${span} ${photo ? 'sa-bt--photo' : ''}`.trim()} data-reveal>
      <Link href={serviceHref(service.slug)}>
        {photo ? (
          <span className="sa-bt__media">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
            <img src={photo} alt="" loading="lazy" decoding="async" />
          </span>
        ) : null}
        <span className="sa-bt__label">{service.title}</span>
        {stacked ? (
          <h3 className="sa-bt__stack">
            {words.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </h3>
        ) : (
          <h3>{service.tagline || service.title}</h3>
        )}
        {ledger.length ? (
          <ul className="sa-bt__ledger">
            {ledger.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="sa-bt__foot">{service.body}</p>
        )}
        {ledger.length ? null : <span className="sa-bt__plus" aria-hidden="true" />}
      </Link>
    </li>
  );
}

function Servicios({ block, content, services }: { block: LayoutBlock; content: PublicSiteContent; services: Service[] }) {
  return (
    <Section block={block} tone="papel" className="sa-sec--mosaic">
      <header className="sa-headc" data-reveal>
        <h2 id={`${anchorOf(block)}-t`} className="sa-title">
          <Sentences text={content.headline} />
        </h2>
        {content.lead ? <p className="sa-headc__lead">{content.lead}</p> : null}
        <Link className="sa-arrow" href={pageHref('servicios')}>
          Ver todos los servicios
        </Link>
      </header>
      <ul className="sa-bento">
        {services.map((service, i) => (
          <ServiceTileBento key={service.slug} service={service} index={i} full={i === services.length - 1 && services.length % 2 === 1} />
        ))}
      </ul>
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
      {content.pageImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio
        <img className="sa-band__img" src={content.pageImage} alt="" loading="lazy" decoding="async" />
      ) : null}
      <div className="sa-band__copy" data-reveal>
        <h2 id={titleId} className="sa-title sa-title--xl">
          {content.headline}
        </h2>
        {content.body ? <p className="sa-band__text">{content.body}</p> : null}
        <div className="sa-cta">
          <Link className="sa-btn sa-btn--on-ink" href={pageHref('contacto')}>
            {content.cta || 'Escribir a Arta'}
          </Link>
          <a className="sa-arrow" href={`mailto:${contact.email}`}>
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
export function SiteBlock({ block, data, past = [] }: { block: LayoutBlock; data: PublicSiteData; past?: PublicSiteNewsItem[] }) {
  const key = sectionKeyOf(block);
  const content = sectionContent(data, key);
  switch (block.type) {
    case 'frase':
      return <Frase block={block} content={content} />;
    case 'cartelera':
      return <Cartelera block={block} content={content} shows={data.shows} />;
    case 'proceso':
      return <Proceso block={block} content={content} data={data} />;
    case 'recientes':
      return <Recientes block={block} content={content} past={past} />;
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
