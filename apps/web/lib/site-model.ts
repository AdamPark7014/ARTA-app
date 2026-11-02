import { externalProps } from './site-format';
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
import { heroContent, sectionContent, type PublicSiteData, type PublicSiteItem, type PublicSiteNewsItem } from './public-site-data';
import { slugify } from './studio-templates';

export type HeroPhoto = { id: string; imageUrl: string; focus?: string | null; draft?: boolean };
export type HeroLink = { label: string; href: string };

/** La portada: qué es Arta, a dónde ir y las fotos que se turnan en su marco. */
export type HeroView = {
  title: string;
  sub?: string;
  primary: HeroLink | null;
  secondary: HeroLink | null;
  photos: HeroPhoto[];
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

/** Secciones de Inicio que salen, en su orden. Sin contenido, una sección no enseña un hueco: no sale. */
export function visibleBlocks(data: PublicSiteData, preview = false, past: PublicSiteNewsItem[] = []): LayoutBlock[] {
  return resolveLayout(layoutOf(data)).filter((block) => {
    if (!block.visible) return false;
    const { page } = BLOCK_META[block.type];
    if (page && isPageOff(data, page)) return false;
    if (preview) return true;
    if (block.type === 'cartelera') return data.shows.length > 0;
    if (block.type === 'recientes') return past.length > 0;
    if (block.type === 'noticias') return data.news.length > 0;
    if (block.type === 'historias') return itemsOf(data, 'historia').length > 0;
    if (block.type === 'galeria') return itemsOf(data, 'foto').length > 0;
    if (block.type === 'aliados') return itemsOf(data, 'aliado').length > 0;
    return true;
  });
}

export type SiteLink = { key: PageKey; label: string; href: string; secondary?: boolean };

/** El menú: las páginas que se ven, en su orden. Noticias, Historias y Galería no salen mientras estén vacías. */
export function visiblePages(data: PublicSiteData, preview = false): SiteLink[] {
  return resolvePages(layoutOf(data))
    .filter((page) => {
      if (!page.visible) return false;
      if (preview) return true;
      if (page.key === 'noticias') return data.news.length > 0;
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

/** Las fotos de la portada, para quien necesite una: pasos sin foto, tarjetas de shows sin póster. */
export const heroPhotoUrls = (data: Pick<PublicSiteData, 'slides'>) => data.slides.map((s) => s.imageUrl).filter(Boolean);

export function buildHero(data: PublicSiteData): HeroView {
  const hero = heroContent(data);
  /** Una liga a una página quitada no se pinta. */
  const link = (label?: string, raw?: string): HeroLink | null => {
    if (!label?.trim() || !raw?.trim()) return null;
    const href = resolveSiteHref(raw);
    const route = parseSitePath(href);
    return route && isPageOff(data, route.page) ? null : { label, href };
  };
  const main = link(hero.cta, hero.ctaHref);
  const other = link(hero.secondaryLabel, hero.secondaryHref);
  // Sin shows, «Ver la cartelera» llevaría a una página casi vacía: abre lo que sí hay.
  const toEmptyBill = !data.shows.length && !!main && parseSitePath(main.href)?.page === 'cartelera';
  const primary = main && !toEmptyBill ? main : other;
  const secondary = primary === other ? link('Lo que hacemos', pageHref('servicios')) : other;
  return {
    title: hero.headline || 'La experiencia del Show.',
    sub: hero.sub || undefined,
    primary,
    secondary,
    photos: data.slides
      .filter((s) => s.imageUrl)
      .map((s) => ({ id: s.id, imageUrl: s.imageUrl, focus: s.focus, draft: s.active === false })),
  };
}

/** El show que anuncia la franja de arriba de Inicio. */
export function nextShowOf(data: PublicSiteData): PublicSiteNewsItem | null {
  if (isPageOff(data, 'cartelera')) return null;
  const wanted = Number(heroContent(data).showCount ?? 1);
  if (Number.isFinite(wanted) && wanted <= 0) return null;
  return data.shows[0] ?? null;
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
