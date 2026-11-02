import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { PreguntasView } from '@/components/site/SiteViews';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { isPageOff } from '@/lib/site-model';
import { pageMetadata, faqGraphJsonLd } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await fetchPublicSiteData('ARTA'), 'preguntas');
}

export default async function PreguntasPage() {
  const data = await fetchPublicSiteData('ARTA');
  if (isPageOff(data, 'preguntas')) notFound();
  return (
    <>
      <JsonLd data={faqGraphJsonLd(data)} />
      <PreguntasView data={data} />
    </>
  );
}
