import { PublicSiteShell } from '@/components/site/PublicSiteShell';
import { fetchPublicSiteData } from '@/lib/public-site-data';

export default async function PublicArtaPage() {
  const data = await fetchPublicSiteData('ARTA');
  return <PublicSiteShell data={data} />;
}
