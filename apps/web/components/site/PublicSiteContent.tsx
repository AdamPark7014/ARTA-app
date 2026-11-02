import { HeroCarousel } from '@/components/site/HeroCarousel';
import { LegacyAnchors } from '@/components/site/LegacyAnchors';
import { SiteBlock } from '@/components/site/SiteBlocks';
import { SitePage } from '@/components/site/SitePage';
import { heroContent, type PublicSiteData } from '@/lib/public-site-data';
import { BLOCK_META } from '@/lib/site-blocks';
import { buildHeroSlides, visibleBlocks } from '@/lib/site-model';

type PublicSiteContentProps = {
  data: PublicSiteData;
  /** Vista previa de Studio: se enseñan borradores. */
  preview?: boolean;
};

/** Inicio, para el sitio (servidor) y para la vista previa (cliente): resume y lleva a cada página. */
export function PublicSiteContent({ data, preview = false }: PublicSiteContentProps) {
  const blocks = visibleBlocks(data, preview);
  const hero = heroContent(data);
  const ticker = (hero.ticker || '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <SitePage data={data} active="inicio" overDark preview={preview}>
      {preview ? null : <LegacyAnchors />}
      <HeroCarousel slides={buildHeroSlides(data)} />
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
        {blocks.map((block) => (BLOCK_META[block.type] ? <SiteBlock key={block.id} block={block} data={data} /> : null))}
      </main>
    </SitePage>
  );
}
