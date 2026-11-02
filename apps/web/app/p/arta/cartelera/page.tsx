import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { CarteleraView } from '@/components/site/SiteViews';
import { fetchPublicShows, fetchPublicSiteData } from '@/lib/public-site-data';
import { isPageOff } from '@/lib/site-model';
import { pageMetadata, sitePageGraphJsonLd } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await fetchPublicSiteData('ARTA'), 'cartelera');
}

export default async function CarteleraPage() {
  const [data, shows] = await Promise.all([fetchPublicSiteData('ARTA'), fetchPublicShows()]);
  if (isPageOff(data, 'cartelera')) notFound();
  return (
    <>
      <JsonLd data={sitePageGraphJsonLd(data, 'cartelera')} />
      <CarteleraView data={data} upcoming={shows.upcoming} past={shows.past} />
    </>
  );
}
