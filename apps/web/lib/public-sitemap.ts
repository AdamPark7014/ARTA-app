import type { MetadataRoute } from 'next';
import { ROOT_DOMAIN } from '@/lib/domains';

/** Slugs de respaldo si la API no responde (coinciden con PublicSite FALLBACK_NEWS). */
const FALLBACK_NEWS_SLUGS = ['temporada-puebla', 'checklists-digitales', 'experiencia-show'];

type NewsIndexRow = {
  slug: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
}

export function publicSiteBaseUrl(): string {
  return `https://${ROOT_DOMAIN}`;
}

export async function fetchPublishedNewsSlugs(): Promise<NewsIndexRow[]> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news-index`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FALLBACK_NEWS_SLUGS.map((slug) => ({ slug }));
    const rows = (await res.json()) as NewsIndexRow[];
    return rows.length ? rows : FALLBACK_NEWS_SLUGS.map((slug) => ({ slug }));
  } catch {
    return FALLBACK_NEWS_SLUGS.map((slug) => ({ slug }));
  }
}

export async function buildPublicSitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteBaseUrl();
  const news = await fetchPublishedNewsSlugs();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/p/arta`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];

  for (const row of news) {
    const lastModified = row.updatedAt || row.publishedAt;
    entries.push({
      url: `${base}/p/arta/noticias/${row.slug}`,
      lastModified: lastModified ? new Date(lastModified) : now,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}
