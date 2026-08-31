import type { PublicSiteData } from '@/lib/public-site-data';
import { PublicSiteContent } from '@/components/site/PublicSiteContent';

type PublicSiteShellProps = {
  data: PublicSiteData;
};

/** Server entry for SSR public home. */
export function PublicSiteShell({ data }: PublicSiteShellProps) {
  return <PublicSiteContent data={data} />;
}
