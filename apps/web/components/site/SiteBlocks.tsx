import type { ReactNode } from 'react';
import { ContactForm } from '@/components/site/ContactForm';
import { Galeria } from '@/components/site/Galeria';
import { Historias } from '@/components/site/Historias';
import { VenueMap, directionsUrl } from '@/components/site/VenueMap';
import {
  FALLBACK_MODULE_TILES,
  sectionContent,
  siteSettings,
  type PublicSiteContent,
  type PublicSiteData,
  type PublicSiteItem,
  type PublicSiteNewsItem,
} from '@/lib/public-site-data';
import { anchorOf, sectionKeyOf, type LayoutBlock } from '@/lib/site-blocks';
import {
  SHOW_STATUS_LABEL,
  countdownLabel,
  externalProps,
  publishedLabel,
  safeHref,
  showDateParts,
  showStatusOf,
  showTimeLabel,
  ticketHref,
} from '@/lib/site-format';
import { itemsOf, newsHref, showHref } from '@/lib/site-model';
import { VENUE_ADDRESS, contactFromSettings, socialProfiles } from '@/lib/site-seo';

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
  block: Pick<LayoutBlock, 'id' | 'type'>;
  content: PublicSiteContent;
  children?: ReactNode;
  wide?: boolean;
};

function SectionHead({ block, content, children, wide }: HeadProps) {
  return (
    <header className={`sa-head ${wide ? 'sa-head--wide' : ''}`.trim()} data-reveal>
      <div className="sa-head__copy">
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title">
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

function DraftTag({ show }: { show: boolean }) {
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
          <a href={showHref(show.slug)}>{show.title}</a>
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

function Cartelera({ block, content, shows }: { block: LayoutBlock; content: PublicSiteContent; shows: PublicSiteNewsItem[] }) {
  const featured = shows.find((s) => s.coverUrl);
  const countdown = countdownLabel(featured?.eventDate);
  return (
    <Section block={block} tone="papel">
      <SectionHead block={block} content={content} wide>
        {shows.length ? (
          <a className="sa-link" href="/p/arta/cartelera">
            Ver toda la cartelera
          </a>
        ) : null}
      </SectionHead>
      {shows.length ? (
        <div className={`sa-bill ${featured ? 'has-feature' : ''}`.trim()}>
          {featured ? (
            <a className="sa-feature" href={showHref(featured.slug)} data-reveal>
              {/* eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio */}
              <img src={featured.coverUrl as string} alt={`Póster de ${featured.title}`} loading="lazy" decoding="async" />
              <span className="sa-feature__tag">{countdown || 'Próximo show'}</span>
            </a>
          ) : null}
          <ol className="sa-shows">
            {shows.slice(0, 8).map((show) => (
              <ShowRow key={show.id} show={show} />
            ))}
          </ol>
        </div>
      ) : (
        <div className="sa-empty" data-reveal>
          <span className="sa-empty__motif" aria-hidden="true" />
          <h3>{content.emptyTitle}</h3>
          <p>{content.emptyText}</p>
          <a className="sa-btn" href="#contacto">
            Escríbenos
          </a>
        </div>
      )}
    </Section>
  );
}

function HistoriasBlock({ block, content, items }: { block: LayoutBlock; content: PublicSiteContent; items: PublicSiteItem[] }) {
  return (
    <Section block={block} tone="tinta" className="sa-sec--rail">
      <SectionHead block={block} content={content} wide />
      {items.length ? <Historias items={items} /> : <PreviewEmpty>Aún no hay historias. Súbelas desde Studio y aparecen aquí.</PreviewEmpty>}
    </Section>
  );
}

function Nosotros({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const image = content.imageUrl;
  const stats = content.stats?.filter((s) => s.label?.trim()) ?? [];
  return (
    <Section block={block} tone="papel" className="sa-about">
      <div className="sa-about__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title sa-title--xl">
          {content.headline}
        </h2>
        <p className="sa-lead">{content.body || content.lead}</p>
      </div>
      {image ? (
        <div className="sa-about__media" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto dinámica de Studio */}
          <img src={image} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}
      {stats.length ? (
        <dl className="sa-stats" data-reveal>
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Section>
  );
}

function Servicios({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const tiles = content.tiles?.filter((t) => t.title?.trim()) ?? FALLBACK_MODULE_TILES;
  return (
    <Section block={block} tone="blanco">
      <SectionHead block={block} content={content} />
      <ol className="sa-services" data-count={tiles.length}>
        {tiles.map((t, i) => (
          <li key={`${t.title}-${i}`} data-reveal>
            <span className="sa-services__n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function NewsCard({ post, large }: { post: PublicSiteNewsItem; large?: boolean }) {
  return (
    <article className={`sa-news ${large ? 'sa-news--large' : ''}`.trim()} data-reveal>
      <a href={newsHref(post.slug)} className="sa-news__media" tabIndex={-1} aria-hidden="true">
        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- portada dinámica de Studio
          <img src={post.coverUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="sa-news__placeholder" />
        )}
      </a>
      <div className="sa-news__body">
        <div className="sa-news__meta">
          <DraftTag show={post.published === false} />
          {post.publishedAt ? <time dateTime={post.publishedAt}>{publishedLabel(post.publishedAt)}</time> : null}
        </div>
        <h3>
          <a href={newsHref(post.slug)}>{post.title}</a>
        </h3>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
      </div>
    </article>
  );
}

function Noticias({ block, content, news }: { block: LayoutBlock; content: PublicSiteContent; news: PublicSiteNewsItem[] }) {
  const [first, ...rest] = news.slice(0, 5);
  return (
    <Section block={block} tone="papel">
      <SectionHead block={block} content={content} wide>
        {news.length ? (
          <a className="sa-link" href="/p/arta/noticias">
            Ver todas las noticias
          </a>
        ) : null}
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
      <SectionHead block={block} content={content} wide />
      {items.length ? <Galeria items={items} /> : <PreviewEmpty>Aún no hay fotos. Súbelas desde Studio y aparecen aquí.</PreviewEmpty>}
    </Section>
  );
}

function Aliados({ block, content, items }: { block: LayoutBlock; content: PublicSiteContent; items: PublicSiteItem[] }) {
  return (
    <Section block={block} tone="papel">
      <SectionHead block={block} content={content} />
      {items.length ? (
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
      ) : (
        <PreviewEmpty>Aún no hay aliados. Sube sus logos desde Studio y aparecen aquí.</PreviewEmpty>
      )}
    </Section>
  );
}

function Faq({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const faqs = content.faqs?.filter((f) => f.question?.trim()) ?? [];
  return (
    <Section block={block} tone="blanco" className="sa-faqsec">
      <SectionHead block={block} content={content} />
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
    </Section>
  );
}

function Ubicacion({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const address = content.address || VENUE_ADDRESS;
  return (
    <Section block={block} tone="papel" className="sa-place">
      <div className="sa-place__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title">
          {content.headline}
        </h2>
        {content.lead ? <p className="sa-lead">{content.lead}</p> : null}
        <address>{address}</address>
        <a className="sa-btn" href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
          Cómo llegar
        </a>
      </div>
      <div data-reveal>
        <VenueMap address={address} />
      </div>
    </Section>
  );
}

function Contacto({ block, content, data }: { block: LayoutBlock; content: PublicSiteContent; data: PublicSiteData }) {
  const settings = siteSettings(data);
  const contact = contactFromSettings(settings);
  const socials = socialProfiles(settings);
  return (
    <Section block={block} tone="tinta" className="sa-contact">
      <span className="sa-contact__motif" aria-hidden="true" />
      <div className="sa-contact__copy" data-reveal>
        {content.eyebrow ? <p className="sa-eyebrow">{content.eyebrow}</p> : null}
        <h2 id={`${anchorOf(block)}-t`} className="sa-title sa-title--xl">
          {content.headline}
        </h2>
        {content.body ? <p className="sa-lead">{content.body}</p> : null}
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
    </Section>
  );
}

function TextoLibre({ block, content }: { block: LayoutBlock; content: PublicSiteContent }) {
  const link = safeHref(content.ctaHref);
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
  const link = safeHref(content.ctaHref);
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

/** Pinta una sección de la maqueta con su contenido. */
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
      return <Servicios block={block} content={content} />;
    case 'noticias':
      return <Noticias block={block} content={content} news={data.news} />;
    case 'galeria':
      return <GaleriaBlock block={block} content={content} items={itemsOf(data, 'foto')} />;
    case 'aliados':
      return <Aliados block={block} content={content} items={itemsOf(data, 'aliado')} />;
    case 'faq':
      return <Faq block={block} content={content} />;
    case 'ubicacion':
      return <Ubicacion block={block} content={sectionContent(data, key, { address: VENUE_ADDRESS })} />;
    case 'contacto':
      return <Contacto block={block} content={content} data={data} />;
    case 'texto':
      return <TextoLibre block={block} content={content} />;
    case 'anuncio':
      return <Anuncio block={block} content={content} />;
    default:
      return null;
  }
}
