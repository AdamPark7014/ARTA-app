import { JsonLd } from '@/components/seo/JsonLd';
import { PublicSiteShell } from '@/components/site/PublicSiteShell';
import { fetchPublicShows, fetchPublicSiteData } from '@/lib/public-site-data';
import { homePageGraphJsonLd } from '@/lib/site-seo';

export default async function PublicArtaPage() {
  const [data, shows] = await Promise.all([fetchPublicSiteData('ARTA'), fetchPublicShows()]);
  return (
    <>
      <JsonLd data={homePageGraphJsonLd(data)} />
      <PublicSiteShell data={data} past={shows.past} />
    </>
  );
}
