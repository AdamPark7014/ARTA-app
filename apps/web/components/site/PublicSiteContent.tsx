import { HomeHero } from '@/components/site/HomeHero';
import { LegacyAnchors } from '@/components/site/LegacyAnchors';
import { NextShowRibbon, SiteBlock } from '@/components/site/SiteBlocks';
import { SitePage } from '@/components/site/SitePage';
import { heroContent, type PublicSiteData, type PublicSiteNewsItem } from '@/lib/public-site-data';
import { BLOCK_META } from '@/lib/site-blocks';
import { buildHero, nextShowOf, visibleBlocks } from '@/lib/site-model';

type PublicSiteContentProps = {
  data: PublicSiteData;
  /** Shows que ya pasaron; la vista previa no los trae. */
  past?: PublicSiteNewsItem[];
  /** Vista previa de Studio: se enseñan borradores. */
  preview?: boolean;
};

/** Inicio, para el sitio (servidor) y para la vista previa (cliente): resume y lleva a cada página. */
export function PublicSiteContent({ data, past = [], preview = false }: PublicSiteContentProps) {
  const blocks = visibleBlocks(data, preview, past);
  const next = nextShowOf(data);
  const ticker = (heroContent(data).ticker || '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <SitePage data={data} active="inicio" preview={preview}>
      {preview ? null : <LegacyAnchors />}
      {next ? <NextShowRibbon show={next} /> : null}
      <HomeHero hero={buildHero(data)} />
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
        {blocks.map((block) => (BLOCK_META[block.type] ? <SiteBlock key={block.id} block={block} data={data} past={past} /> : null))}
      </main>
    </SitePage>
  );
}
