import { externalProps, showDateParts, showTimeLabel, ticketHref } from './site-format';
import {
  BLOCK_META,
  DEFAULT_CONTENT,
  LAYOUT_KEY,
  SITE_BASE,
  SITE_PAGES,
  pageHref,
  pageMeta,
  resolveLayout,
  resolvePages,
  resolveSiteHref,
  type LayoutBlock,
  type PageKey,
  type ServiceTile,
} from './site-blocks';
import { heroContent, sectionContent, type PublicSiteData, type PublicSiteItem } from './public-site-data';
import { slugify } from './studio-templates';

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

export const HOME_HREF = SITE_BASE;

export const showHref = (slug: string) => `${SITE_BASE}/cartelera/${slug}`;
export const newsHref = (slug: string) => `${SITE_BASE}/noticias/${slug}`;

export function itemsOf(data: Pick<PublicSiteData, 'items'>, kind: PublicSiteItem['kind']): PublicSiteItem[] {
  return data.items.filter((i) => i.kind === kind);
}

const layoutOf = (data: Pick<PublicSiteData, 'pages'>) => data.pages.find((p) => p.sectionKey === LAYOUT_KEY)?.contentJson;

/** Una página quitada en Studio deja de existir para el público: su ruta da 404 y nada lleva a ella. */
export function isPageOff(data: Pick<PublicSiteData, 'pages'>, key: PageKey): boolean {
  return resolvePages(layoutOf(data)).some((page) => page.key === key && !page.visible);
}

/** Secciones de Inicio que salen, en su orden. Sin contenido, las de solo fotos no enseñan un hueco. */
export function visibleBlocks(data: PublicSiteData, preview = false): LayoutBlock[] {
  return resolveLayout(layoutOf(data)).filter((block) => {
    if (!block.visible) return false;
    const { page } = BLOCK_META[block.type];
    if (page && isPageOff(data, page)) return false;
    if (preview) return true;
    if (block.type === 'historias') return itemsOf(data, 'historia').length > 0;
    if (block.type === 'galeria') return itemsOf(data, 'foto').length > 0;
    if (block.type === 'aliados') return itemsOf(data, 'aliado').length > 0;
    return true;
  });
}

export type SiteLink = { key: PageKey; label: string; href: string; secondary?: boolean };

/** El menú: las páginas que se ven, en su orden. Historias y Galería no salen mientras estén vacías. */
export function visiblePages(data: PublicSiteData, preview = false): SiteLink[] {
  return resolvePages(layoutOf(data))
    .filter((page) => {
      if (!page.visible) return false;
      if (preview) return true;
      if (page.key === 'historias') return itemsOf(data, 'historia').length > 0;
      if (page.key === 'galeria') return itemsOf(data, 'foto').length > 0;
      return true;
    })
    .map((page) => {
      const meta = pageMeta(page.key);
      return { key: page.key, label: meta.label, href: pageHref(page.key), secondary: meta.secondary };
    });
}

export type Service = ServiceTile & { slug: string; includesList: string[] };

const DEFAULT_TILES = DEFAULT_CONTENT.home_modulos.tiles as ServiceTile[];

/**
 * Servicios con su dirección. Los ya guardados en producción traen solo título y resumen: el detalle
 * de arranque entra por nombre, hasta que alguien escriba el suyo.
 */
/** Los servicios guardados antes de que tuvieran página: toman por su nombre el detalle que les falta. */
export const withServiceDefaults = (tile: ServiceTile): ServiceTile => ({
  ...DEFAULT_TILES.find((d) => d.title === tile.title),
  ...tile,
});

export function servicesOf(data: Pick<PublicSiteData, 'pages'>): Service[] {
  const tiles = (sectionContent(data, 'home_modulos').tiles ?? []) as ServiceTile[];
  const taken = new Set<string>();
  const out: Service[] = [];
  for (const raw of tiles) {
    if (!raw.title?.trim()) continue;
    const tile = withServiceDefaults(raw);
    let slug = slugify(tile.slug?.trim() || tile.title) || 'servicio';
    if (taken.has(slug)) slug = `${slug}-${out.length + 1}`;
    taken.add(slug);
    const includesList = (tile.includes || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    out.push({ ...tile, slug, includesList });
  }
  return out;
}

export function buildHeroSlides(data: PublicSiteData): HeroSlideView[] {
  const hero = heroContent(data);
  const howMany = Number(hero.showCount ?? 3);
  const contact = pageHref('contacto');
  const shows: HeroSlideView[] = (isPageOff(data, 'cartelera') ? [] : data.shows)
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
  const photos: HeroSlideView[] = data.slides.map((s) => {
    const saved = s.ctaHref || hero.ctaHref;
    const href = saved ? resolveSiteHref(saved) : undefined;
    const route = href ? parseSitePath(href) : null;
    return {
      id: s.id,
      kind: 'foto',
      title: s.title || hero.headline || 'La experiencia del Show',
      subtitle: s.subtitle || hero.sub || undefined,
      imageUrl: s.imageUrl,
      focus: s.focus,
      ctaLabel: s.ctaLabel || hero.cta || undefined,
      ctaHref: route && isPageOff(data, route.page) ? undefined : href,
      secondaryLabel: 'Contacto',
      secondaryHref: contact,
      draft: s.active === false,
    };
  });
  return [...shows, ...photos];
}

/** Página que corresponde a una ruta del sitio. La vista previa navega con esto, sin salir de Studio. */
export type SiteRoute = { page: PageKey; slug?: string };

export function parseSitePath(path: string): SiteRoute | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '');
  if (clean === SITE_BASE) return { page: 'inicio' };
  if (!clean.startsWith(`${SITE_BASE}/`)) return null;
  const [first, slug] = clean.slice(SITE_BASE.length + 1).split('/');
  const meta = SITE_PAGES.find((p) => p.path === `/${first}`);
  return meta ? { page: meta.key, slug } : null;
}

export { BLOCK_META, externalProps };
