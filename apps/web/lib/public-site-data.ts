import { apiBase, type PublicNewsPost } from './site-seo';

export type PublicSiteTile = { title: string; body: string };

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

export const FALLBACK_NEWS: PublicSiteNewsItem[] = [
  {
    id: 'n1',
    slug: 'temporada-puebla',
    title: 'Nueva temporada de shows en Puebla',
    excerpt: 'Producción, artes y boletera alineadas de punta a punta.',
    coverUrl: '/uploads/seed-news-1.jpg',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    slug: 'checklists-digitales',
    title: 'Checklists digitales con firma',
    excerpt: 'Entregado y autorizado quedan registrados en PDF por evento.',
    coverUrl: '/uploads/seed-news-2.jpg',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'n3',
    slug: 'experiencia-show',
    title: 'La experiencia del Show',
    excerpt: 'Montaje, corrida y cierre con el sello Arta en cada venue.',
    coverUrl: '/uploads/seed-news-3.jpg',
    publishedAt: new Date().toISOString(),
  },
];

/** Server fetch for SSR public site (Studio CMS). */
export async function fetchPublicSiteData(entity = 'ARTA'): Promise<PublicSiteData> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/${encodeURIComponent(entity)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return { pages: [], slides: FALLBACK_SLIDES, news: FALLBACK_NEWS };
    }
    const d = (await res.json()) as Partial<PublicSiteData>;
    return {
      pages: d.pages || [],
      slides: d.slides?.length ? d.slides : FALLBACK_SLIDES,
      news: d.news?.length ? d.news : FALLBACK_NEWS,
    };
  } catch {
    return { pages: [], slides: FALLBACK_SLIDES, news: FALLBACK_NEWS };
  }
}

export async function fetchPublicNewsList(): Promise<PublicNewsPost[]> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news-index`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return (await res.json()) as PublicNewsPost[];
  } catch {
    return [];
  }
}
