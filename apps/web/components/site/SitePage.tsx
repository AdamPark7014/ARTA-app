import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteMotion } from '@/components/site/SiteMotion';
import type { PublicSiteData } from '@/lib/public-site-data';
import type { PageKey } from '@/lib/site-blocks';
import { siteFontVars } from '@/lib/site-fonts';
import { visiblePages } from '@/lib/site-model';

type SitePageProps = {
  data: PublicSiteData;
  children: ReactNode;
  active?: PageKey;
  /** Vista previa de Studio: enseña también lo que aún no se publica. */
  preview?: boolean;
};

/** El marco de todas las páginas: mismo menú y mismo pie en todo el sitio. */
export function SitePage({ data, children, active, preview = false }: SitePageProps) {
  const links = visiblePages(data, preview);
  return (
    <div className={`sa ${siteFontVars}`} data-preview={preview ? 'on' : undefined}>
      <a className="sa-skip" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader links={links} active={active} />
      {children}
      <SiteFooter data={data} links={links} />
      <SiteMotion />
    </div>
  );
}
