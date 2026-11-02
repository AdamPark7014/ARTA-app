import { externalProps, showDateParts, showTimeLabel, ticketHref } from './site-format';
import { BLOCK_META, LAYOUT_KEY, anchorOf, resolveLayout, type LayoutBlock } from './site-blocks';
import { heroContent, type PublicSiteData, type PublicSiteItem } from './public-site-data';

/** Lo que pinta la portada, venga de una foto subida o de un show de la cartelera. */
export type HeroSlideView = {
  id: string;
  kind: 'foto' | 'show';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  focus?: string | null;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  draft?: boolean;
};

export const HOME_HREF = '/p/arta';

export const showHref = (slug: string) => `${HOME_HREF}/cartelera/${slug}`;
export const newsHref = (slug: string) => `${HOME_HREF}/noticias/${slug}`;

/** Secciones que salen en el sitio, en su orden. Sin contenido, las de solo fotos no enseñan un hueco. */
export function visibleBlocks(data: PublicSiteData, preview = false): LayoutBlock[] {
  const layout = data.pages.find((p) => p.sectionKey === LAYOUT_KEY)?.contentJson;
  return resolveLayout(layout).filter((block) => {
    if (!block.visible) return false;
    if (preview) return true;
    if (block.type === 'historias') return itemsOf(data, 'historia').length > 0;
    if (block.type === 'galeria') return itemsOf(data, 'foto').length > 0;
    if (block.type === 'aliados') return itemsOf(data, 'aliado').length > 0;
    return true;
  });
}

export function itemsOf(data: PublicSiteData, kind: PublicSiteItem['kind']): PublicSiteItem[] {
  return data.items.filter((i) => i.kind === kind);
}

export function buildNav(blocks: LayoutBlock[], homeHref: string) {
  return blocks
    .filter((b) => BLOCK_META[b.type].nav)
    .map((b) => ({ label: BLOCK_META[b.type].nav as string, href: `${homeHref}#${anchorOf(b)}` }));
}

export function buildHeroSlides(data: PublicSiteData): HeroSlideView[] {
  const hero = heroContent(data);
  const howMany = Number(hero.showCount ?? 3);
  const shows: HeroSlideView[] = data.shows
    .filter((s) => s.coverUrl)
    .slice(0, Number.isFinite(howMany) ? howMany : 3)
    .map((s) => {
      const date = showDateParts(s.eventDate);
      const tickets = ticketHref(s);
      return {
        id: `show-${s.id}`,
        kind: 'show',
        eyebrow: date ? `Próximo show · ${date.short}` : 'Próximo show',
        title: s.title,
        subtitle: [s.venue, s.city, showTimeLabel(s.eventTime)].filter(Boolean).join(' · ') || s.excerpt || undefined,
        imageUrl: s.coverUrl || undefined,
        ctaLabel: tickets ? s.ctaLabel || 'Comprar boletos' : 'Ver detalles',
        ctaHref: tickets || showHref(s.slug),
        secondaryLabel: tickets ? 'Ver detalles' : undefined,
        secondaryHref: tickets ? showHref(s.slug) : undefined,
        draft: s.published === false,
      };
    });
  const photos: HeroSlideView[] = data.slides.map((s) => ({
    id: s.id,
    kind: 'foto',
    title: s.title || hero.headline || 'La experiencia del Show',
    subtitle: s.subtitle || hero.sub || undefined,
    imageUrl: s.imageUrl,
    focus: s.focus,
    ctaLabel: s.ctaLabel || hero.cta || undefined,
    ctaHref: s.ctaHref || hero.ctaHref || undefined,
    secondaryLabel: 'Contacto',
    secondaryHref: '#contacto',
    draft: s.active === false,
  }));
  return [...shows, ...photos];
}

export { externalProps };
