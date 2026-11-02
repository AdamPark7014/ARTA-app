import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { ShowRow } from '@/components/site/SiteBlocks';
import { SitePage } from '@/components/site/SitePage';
import { fetchPublicShows, fetchPublicSiteData, sectionContent } from '@/lib/public-site-data';
import { showDateParts } from '@/lib/site-format';
import { showHref } from '@/lib/site-model';
import { HOME_PATH, buildPublicMetadata, simplePageGraphJsonLd } from '@/lib/site-seo';

const DESCRIPTION = 'Todos los conciertos y espectáculos que vienen con Arta Producciones: fechas, recintos y boletos.';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Cartelera',
  description: DESCRIPTION,
  path: `${HOME_PATH}/cartelera`,
});

export default async function CarteleraPage() {
  const [data, shows] = await Promise.all([fetchPublicSiteData('ARTA'), fetchPublicShows()]);
  const content = sectionContent(data, 'home_cartelera');
  return (
    <SitePage data={data}>
      <JsonLd data={simplePageGraphJsonLd({ path: `${HOME_PATH}/cartelera`, name: 'Cartelera', description: DESCRIPTION })} />
      <section className="sa-sec sa-sec--papel sa-page">
        <header className="sa-page__head" data-reveal>
          <p className="sa-eyebrow">{content.eyebrow}</p>
          <h1 className="sa-title sa-title--xl">{content.headline}</h1>
          {content.lead ? <p className="sa-lead">{content.lead}</p> : null}
        </header>
        {shows.upcoming.length ? (
          <ol className="sa-shows">
            {shows.upcoming.map((show) => (
              <ShowRow key={show.id} show={show} />
            ))}
          </ol>
        ) : (
          <div className="sa-empty" data-reveal>
            <span className="sa-empty__motif" aria-hidden="true" />
            <h2>{content.emptyTitle}</h2>
            <p>{content.emptyText}</p>
            <a className="sa-btn" href="/p/arta#contacto">
              Escríbenos
            </a>
          </div>
        )}
      </section>
      {shows.past.length ? (
        <section className="sa-sec sa-sec--tinta" aria-labelledby="pasados-t">
          <header className="sa-head sa-head--wide" data-reveal>
            <div className="sa-head__copy">
              <p className="sa-eyebrow">Ya pasaron</p>
              <h2 id="pasados-t" className="sa-title">
                Shows anteriores
              </h2>
            </div>
          </header>
          <ul className="sa-past">
            {shows.past.map((show) => {
              const date = showDateParts(show.eventDate);
              return (
                <li key={show.id} data-reveal>
                  <a href={showHref(show.slug)}>
                    {show.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- póster dinámico de Studio
                      <img src={show.coverUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="sa-news__placeholder" />
                    )}
                    <strong>{show.title}</strong>
                    {date ? <span>{date.long}</span> : null}
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
