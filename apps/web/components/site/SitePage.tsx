import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteMotion } from '@/components/site/SiteMotion';
import type { PublicSiteData } from '@/lib/public-site-data';
import { anchorOf } from '@/lib/site-blocks';
import { HOME_HREF, buildHeroSlides, buildNav, visibleBlocks } from '@/lib/site-model';

/** Marco de las páginas interiores (cartelera, un show, noticias, una noticia): mismo menú y pie que la portada. */
export function SitePage({ data, children }: { data: PublicSiteData; children: ReactNode }) {
  const blocks = visibleBlocks(data);
  const nav = buildNav(blocks, HOME_HREF);
  const contact = blocks.find((b) => b.type === 'contacto');
  const markImage = buildHeroSlides(data).find((s) => s.kind === 'foto' && s.imageUrl)?.imageUrl;
  return (
    <div className="sa sa--inner">
      <a className="sa-skip" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader nav={nav} homeHref={HOME_HREF} solid contactHref={contact ? `${HOME_HREF}#${anchorOf(contact)}` : 'mailto:contacto@artaproducciones.com'} />
      <main id="contenido">{children}</main>
      <SiteFooter data={data} nav={nav} markImage={markImage} />
      <SiteMotion />
    </div>
  );
}
