import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { GaleriaView } from '@/components/site/SiteViews';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { isPageOff } from '@/lib/site-model';
import { pageMetadata, sitePageGraphJsonLd } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await fetchPublicSiteData('ARTA'), 'galeria');
}

export default async function GaleriaPage() {
  const data = await fetchPublicSiteData('ARTA');
  if (isPageOff(data, 'galeria')) notFound();
  return (
    <>
      <JsonLd data={sitePageGraphJsonLd(data, 'galeria')} />
      <GaleriaView data={data} />
    </>
  );
}
