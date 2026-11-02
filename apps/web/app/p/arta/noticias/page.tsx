import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { NoticiasView } from '@/components/site/SiteViews';
import { fetchPublicNewsList, fetchPublicSiteData, type PublicSiteNewsItem } from '@/lib/public-site-data';
import { isPageOff } from '@/lib/site-model';
import { pageMetadata, sitePageGraphJsonLd } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await fetchPublicSiteData('ARTA'), 'noticias');
}

export default async function NoticiasPage() {
  const [data, rows] = await Promise.all([fetchPublicSiteData('ARTA'), fetchPublicNewsList()]);
  if (isPageOff(data, 'noticias')) notFound();
  // El índice trae todas; el orden manual de Studio manda sobre la fecha.
  const news = (rows as Array<PublicSiteNewsItem & { sortOrder?: number | null }>)
    .filter((n) => n.template !== 'evento')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return (
    <>
      <JsonLd data={sitePageGraphJsonLd(data, 'noticias')} />
      <NoticiasView data={data} news={news} />
    </>
  );
}
