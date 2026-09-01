import { apiBase, type PublicNewsPost } from './site-seo';

export type PublicSiteTile = { title: string; body: string };
export type PublicSiteStat = { label: string; text: string };

export type PublicSiteContent = {
  brand?: string;
  brandSub?: string;
  headline?: string;
  sub?: string;
  lead?: string;
  body?: string;
  cta?: string;
  ctaHref?: string;
  tiles?: PublicSiteTile[];
  /** Editable “Nosotros” stats (Studio `home_about`). */
  stats?: PublicSiteStat[];
  /** Visible location blurb under #ubicacion when set via Studio. */
  location?: string;
};

export type PublicSitePage = {
  sectionKey: string;
  contentJson: PublicSiteContent;
};

export type PublicSiteSlide = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  imageUrl: string;
  ctaLabel?: string | null;
  ctaHref?: string | null;
};

export type PublicSiteNewsItem = {
  id: string;
  title: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
  slug: string;
};

export type PublicSiteData = {
  pages: PublicSitePage[];
  slides: PublicSiteSlide[];
  news: PublicSiteNewsItem[];
};

export const FALLBACK_SLIDES: PublicSiteSlide[] = [
  {
    id: '1',
    title: 'La experiencia del Show',
    subtitle: 'Producción integral de conciertos y eventos en Puebla',
    imageUrl: '/uploads/seed-hero-1.jpg',
    ctaLabel: 'Ver operación',
    ctaHref: '#modulos',
  },
  {
    id: '2',
    title: 'Escenario, luz y público',
    subtitle: 'Checklists, boletera, campaña y cierre en un solo flujo',
    imageUrl: '/uploads/seed-hero-2.jpg',
    ctaLabel: 'Conoce Arta',
    ctaHref: '#nosotros',
  },
  {
    id: '3',
    title: 'Cada detalle cuenta',
    subtitle: 'Hospitality, producción técnica y firmas digitales',
    imageUrl: '/uploads/seed-hero-3.jpg',
    ctaLabel: 'Noticias',
    ctaHref: '#noticias',
  },
];

/** Server fetch for SSR public site (Studio CMS). */
export async function fetchPublicSiteData(entity = 'ARTA'): Promise<PublicSiteData> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/${encodeURIComponent(entity)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return { pages: [], slides: FALLBACK_SLIDES, news: [] };
    }
    const d = (await res.json()) as Partial<PublicSiteData>;
    return {
      pages: Array.isArray(d?.pages) ? d.pages : [],
      slides: Array.isArray(d?.slides) && d.slides.length ? d.slides : FALLBACK_SLIDES,
      news: Array.isArray(d?.news) ? d.news : [],
    };
  } catch {
    return { pages: [], slides: FALLBACK_SLIDES, news: [] };
  }
}

export async function fetchPublicNewsList(): Promise<PublicNewsPost[]> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news-index`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // El feed RSS se prerenderiza en `next build`: si el API contesta algo que
    // no es una lista, un `.map` reventaba el build entero del sitio.
    return Array.isArray(data) ? (data as PublicNewsPost[]) : [];
  } catch {
    return [];
  }
}
