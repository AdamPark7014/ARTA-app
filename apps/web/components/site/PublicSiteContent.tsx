import { HeroCarousel } from '@/components/site/HeroCarousel';
import { SiteBlock } from '@/components/site/SiteBlocks';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteMotion } from '@/components/site/SiteMotion';
import { heroContent, type PublicSiteData } from '@/lib/public-site-data';
import { BLOCK_META, anchorOf } from '@/lib/site-blocks';
import { HOME_HREF, buildHeroSlides, buildNav, visibleBlocks } from '@/lib/site-model';

type PublicSiteContentProps = {
  data: PublicSiteData;
  /** Vista previa de Studio: se enseñan borradores y las ligas de sección no salen de la página. */
  preview?: boolean;
};

/** La página completa, para el sitio (servidor) y para la vista previa (cliente). */
export function PublicSiteContent({ data, preview = false }: PublicSiteContentProps) {
  const blocks = visibleBlocks(data, preview);
  const homeHref = preview ? '' : HOME_HREF;
  const nav = buildNav(blocks, homeHref);
  const hero = heroContent(data);
  const contact = blocks.find((b) => b.type === 'contacto');
  const contactHref = contact ? `${homeHref}#${anchorOf(contact)}` : `mailto:contacto@artaproducciones.com`;
  const ticker = (hero.ticker || '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const slides = buildHeroSlides(data);
  const markImage = slides.find((s) => s.kind === 'foto' && s.imageUrl)?.imageUrl;

  return (
    <div className="sa" data-preview={preview ? 'on' : undefined}>
      <a className="sa-skip" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader nav={nav} homeHref={homeHref} contactHref={contactHref} />
      <HeroCarousel slides={slides} tone={hero.tone} />
      {ticker.length ? (
        <div className="sa-ticker" aria-label={ticker.join('. ')}>
          {[0, 1, 2, 3].map((copy) => (
            <div className="sa-ticker__run" key={copy} aria-hidden="true">
              {ticker.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <main id="contenido">
        {blocks.map((block) =>
          BLOCK_META[block.type] ? <SiteBlock key={block.id} block={block} data={data} /> : null,
        )}
      </main>
      <SiteFooter data={data} nav={nav} markImage={markImage} />
      <SiteMotion />
    </div>
  );
}
