import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { NewsCard } from '@/components/site/SiteBlocks';
import { SitePage } from '@/components/site/SitePage';
import { fetchPublicNewsList, fetchPublicSiteData, sectionContent, type PublicSiteNewsItem } from '@/lib/public-site-data';
import { HOME_PATH, buildPublicMetadata, simplePageGraphJsonLd } from '@/lib/site-seo';

const DESCRIPTION = 'Anuncios, detrás de cámaras y todo lo que pasa en Arta Producciones.';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Noticias',
  description: DESCRIPTION,
  path: `${HOME_PATH}/noticias`,
});

export default async function NewsIndexPage() {
  const [data, rows] = await Promise.all([fetchPublicSiteData('ARTA'), fetchPublicNewsList()]);
  const content = sectionContent(data, 'home_noticias');
  const news = (rows as Array<PublicSiteNewsItem & { sortOrder?: number | null; id?: string }>)
    .filter((n) => n.template !== 'evento')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return (
    <SitePage data={data}>
      <JsonLd data={simplePageGraphJsonLd({ path: `${HOME_PATH}/noticias`, name: 'Noticias', description: DESCRIPTION })} />
      <section className="sa-sec sa-sec--papel sa-page">
        <header className="sa-page__head" data-reveal>
          <p className="sa-eyebrow">Arta Producciones</p>
          <h1 className="sa-title sa-title--xl">{content.headline}</h1>
          {content.lead ? <p className="sa-lead">{content.lead}</p> : null}
        </header>
        {news.length ? (
          <div className="sa-newslist">
            {news.map((post) => (
              <NewsCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p className="sa-lead sa-muted">{content.emptyText}</p>
        )}
      </section>
    </SitePage>
  );
}
