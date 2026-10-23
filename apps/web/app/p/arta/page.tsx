import { JsonLd } from '@/components/seo/JsonLd';
import { PublicSiteShell } from '@/components/site/PublicSiteShell';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { homePageGraphJsonLd } from '@/lib/site-seo';

export default async function PublicArtaPage() {
  const data = await fetchPublicSiteData('ARTA');
  return (
    <>
      <JsonLd data={homePageGraphJsonLd(data)} />
      <PublicSiteShell data={data} />
    </>
  );
}
