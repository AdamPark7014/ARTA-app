import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { ContactoView } from '@/components/site/SiteViews';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { pageMetadata, sitePageGraphJsonLd } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await fetchPublicSiteData('ARTA'), 'contacto');
}

export default async function ContactoPage() {
  const data = await fetchPublicSiteData('ARTA');
  return (
    <>
      <JsonLd data={sitePageGraphJsonLd(data, 'contacto')} />
      <ContactoView data={data} />
    </>
  );
}
