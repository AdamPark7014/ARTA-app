import type { PublicSiteData, PublicSiteNewsItem } from '@/lib/public-site-data';
import { PublicSiteContent } from '@/components/site/PublicSiteContent';

type PublicSiteShellProps = {
  data: PublicSiteData;
  past?: PublicSiteNewsItem[];
};

/** Server entry for SSR public home. */
export function PublicSiteShell({ data, past }: PublicSiteShellProps) {
  return <PublicSiteContent data={data} past={past} />;
}
