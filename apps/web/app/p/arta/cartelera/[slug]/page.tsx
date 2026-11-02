import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { SitePage } from '@/components/site/SitePage';
import { directionsUrl } from '@/components/site/VenueMap';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import {
  SHOW_STATUS_LABEL,
  countdownLabel,
  externalProps,
  paragraphs,
  showDateParts,
  showStatusOf,
  showTimeLabel,
  ticketHref,
} from '@/lib/site-format';
import { showHref } from '@/lib/site-model';
import { HOME_PATH, buildPublicMetadata, fetchPublicNews, showGraphJsonLd } from '@/lib/site-seo';

type Props = { params: { slug: string } };

async function fetchShow(slug: string) {
  const post = await fetchPublicNews(slug);
  return post?.template === 'evento' ? post : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const show = await fetchShow(params.slug);
  const path = `${HOME_PATH}/cartelera/${params.slug}`;
  if (!show) {
    return buildPublicMetadata({
      title: 'Show no encontrado',
      description: 'El show que buscas no está disponible.',
      path,
      noIndex: true,
    });
  }
  const date = showDateParts(show.eventDate);
  const description =
    show.excerpt?.trim() ||
    [show.title, date?.long, show.venue, show.city].filter(Boolean).join(' · ').slice(0, 158);
  return buildPublicMetadata({
    title: show.title,
    description,
    path,
    image: show.coverUrl,
    imageAlt: `Póster de ${show.title}`,
  });
}

export default async function ShowPage({ params }: Props) {
  const [show, data] = await Promise.all([fetchShow(params.slug), fetchPublicSiteData('ARTA')]);

  if (!show) {
    return (
      <SitePage data={data}>
        <section className="sa-sec sa-sec--papel sa-page sa-notfound">
          <h1 className="sa-title">Show no encontrado</h1>
          <p className="sa-lead">El enlace puede estar desactualizado o el show ya no está en la cartelera.</p>
          <a className="sa-btn" href={`${HOME_PATH}/cartelera`}>
            Ver la cartelera
          </a>
        </section>
      </SitePage>
    );
  }

  const date = showDateParts(show.eventDate);
  const time = showTimeLabel(show.eventTime);
  const status = showStatusOf(show);
  const tickets = ticketHref(show);
  const countdown = countdownLabel(show.eventDate);
  const where = [show.venue, show.city].filter(Boolean).join(', ');
  const others = data.shows.filter((s) => s.slug !== show.slug).slice(0, 3);

  return (
    <SitePage data={data}>
      <JsonLd data={showGraphJsonLd(show)} />
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
          <a className="sa-link sa-link--back" href={`${HOME_PATH}/cartelera`}>
            Cartelera
          </a>
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
      {others.length ? (
        <section className="sa-sec sa-sec--blanco" aria-labelledby="otros-t">
          <header className="sa-head sa-head--wide">
            <div className="sa-head__copy">
              <h2 id="otros-t" className="sa-title">
                También en cartelera
              </h2>
            </div>
          </header>
          <ul className="sa-past">
            {others.map((other) => {
              const d = showDateParts(other.eventDate);
              return (
                <li key={other.id}>
                  <a href={showHref(other.slug)}>
                    {other.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
                      <img src={other.coverUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="sa-news__placeholder" />
                    )}
                    <strong>{other.title}</strong>
                    {d ? <span>{d.long}</span> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </SitePage>
  );
}
