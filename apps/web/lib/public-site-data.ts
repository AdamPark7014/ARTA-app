import { DEFAULT_CONTENT, HERO_KEY, SETTINGS_KEY } from './site-blocks';
import type { PublicNewsPost } from './site-seo';

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Lo publicado en Studio tiene que verse pronto: con una hora de caché, quien publicaba creía que
 * no había funcionado. Studio además pide refrescar al publicar (`/p/arta/revalidar`).
 */
export const SITE_CACHE = { revalidate: 30, tags: ['sitio'] };

export type PublicSiteTile = { title: string; body: string };
export type PublicSiteStat = { label: string; text: string };
export type PublicSiteFaq = { question: string; answer: string };

export type PublicSiteContent = {
  eyebrow?: string;
  brand?: string;
  brandSub?: string;
  headline?: string;
  sub?: string;
  lead?: string;
  body?: string;
  cta?: string;
  ctaHref?: string;
  imageUrl?: string;
  imageSide?: string;
  tone?: string;
  tiles?: PublicSiteTile[];
  /** Datos de «Nosotros» (Studio `home_about`). */
  stats?: PublicSiteStat[];
  faqs?: PublicSiteFaq[];
  /** Texto de ubicación de la versión anterior del sitio. */
  location?: string;
  address?: string;
  emptyTitle?: string;
  emptyText?: string;
  showCount?: string;
  ticker?: string;
  // Datos del sitio (`site_ajustes`).
  tagline?: string;
  footerNote?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  city?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  spotify?: string;
  x?: string;
  blocks?: unknown;
};

export type PublicSitePage = {
  sectionKey: string;
  contentJson: PublicSiteContent;
  updatedAt?: string | null;
  /** Solo en la vista previa: es un borrador sin publicar. */
  draft?: boolean;
};

export type PublicSiteSlide = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  imageUrl: string;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  focus?: string | null;
  updatedAt?: string | null;
  /** Solo en la vista previa llega `false`. */
  active?: boolean;
};

export type PublicSiteNewsItem = {
  id: string;
  title: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  slug: string;
  /** «Evento destacado»: un show de la cartelera (junta 23-10-2026). */
  template?: string | null;
  eventDate?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  venue?: string | null;
  city?: string | null;
  eventTime?: string | null;
  showStatus?: string | null;
  /** Solo en la vista previa llega `false`. */
  published?: boolean;
};

export type PublicSiteItem = {
  id: string;
  kind: 'historia' | 'foto' | 'aliado';
  title?: string | null;
  caption?: string | null;
  mediaUrl: string;
  mediaType?: string | null;
  focus?: string | null;
  linkLabel?: string | null;
  linkHref?: string | null;
  /** Solo en la vista previa llega `false`. */
  active?: boolean;
};

export type PublicSiteData = {
  pages: PublicSitePage[];
  slides: PublicSiteSlide[];
  news: PublicSiteNewsItem[];
  shows: PublicSiteNewsItem[];
  items: PublicSiteItem[];
};

export const FALLBACK_SLIDES: PublicSiteSlide[] = [
  {
    id: '1',
    title: 'La experiencia del Show',
    subtitle: 'Producimos conciertos y espectáculos en Puebla',
    imageUrl: '/uploads/seed-hero-1.jpg',
    ctaLabel: 'Ver cartelera',
    ctaHref: '#cartelera',
  },
  {
    id: '2',
    title: 'Escenario, luz y público',
    subtitle: 'Cada fecha, con el mismo cuidado de principio a fin',
    imageUrl: '/uploads/seed-hero-2.jpg',
    ctaLabel: 'Conoce Arta',
    ctaHref: '#nosotros',
  },
  {
    id: '3',
    title: 'Cada detalle cuenta',
    subtitle: 'Audio, iluminación, hospitalidad y boletaje en una sola mano',
    imageUrl: '/uploads/seed-hero-3.jpg',
    ctaLabel: 'Lo que hacemos',
    ctaHref: '#modulos',
  },
];

/** Tarjetas de «Lo que hacemos» cuando Studio no trae las suyas (la página y el JSON-LD usan las mismas). */
export const FALLBACK_MODULE_TILES = DEFAULT_CONTENT.home_modulos.tiles as PublicSiteTile[];

/** Sección con su texto de arranque debajo: lo vacío en Studio no deja un hueco, salvo lo que se borró a propósito. */
export function sectionContent(data: Pick<PublicSiteData, 'pages'>, sectionKey: string, fallback?: PublicSiteContent): PublicSiteContent {
  const saved = data.pages.find((p) => p.sectionKey === sectionKey)?.contentJson;
  return { ...(DEFAULT_CONTENT[sectionKey] as PublicSiteContent), ...fallback, ...saved };
}

export const heroContent = (data: Pick<PublicSiteData, 'pages'>) => sectionContent(data, HERO_KEY);
export const siteSettings = (data: Pick<PublicSiteData, 'pages'>) => sectionContent(data, SETTINGS_KEY);

function normalize(d: Partial<PublicSiteData> | null | undefined): PublicSiteData {
  const list = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const slides = list(d?.slides);
  return {
    pages: list(d?.pages),
    slides: slides.length ? slides : FALLBACK_SLIDES,
    news: list(d?.news),
    shows: list(d?.shows),
    items: list(d?.items),
  };
}

export const normalizeSiteData = normalize;

/** Server fetch for SSR public site (Studio CMS). */
export async function fetchPublicSiteData(entity = 'ARTA'): Promise<PublicSiteData> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/${encodeURIComponent(entity)}`, { next: SITE_CACHE });
    if (!res.ok) return normalize(null);
    return normalize((await res.json()) as Partial<PublicSiteData>);
  } catch {
    return normalize(null);
  }
}

export async function fetchPublicNewsList(): Promise<PublicNewsPost[]> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news-index`, { next: SITE_CACHE });
    if (!res.ok) return [];
    const data = await res.json();
    // El feed RSS se prerenderiza en `next build`: si el API contesta algo que
    // no es una lista, un `.map` reventaba el build entero del sitio.
    return Array.isArray(data) ? (data as PublicNewsPost[]) : [];
  } catch {
    return [];
  }
}

/** Cartelera completa: lo que viene y lo que ya pasó. */
export async function fetchPublicShows(): Promise<{ upcoming: PublicNewsPost[]; past: PublicNewsPost[] }> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/shows`, { next: SITE_CACHE });
    if (!res.ok) return { upcoming: [], past: [] };
    const data = (await res.json()) as { upcoming?: PublicNewsPost[]; past?: PublicNewsPost[] };
    return {
      upcoming: Array.isArray(data?.upcoming) ? data.upcoming : [],
      past: Array.isArray(data?.past) ? data.past : [],
    };
  } catch {
    return { upcoming: [], past: [] };
  }
}
