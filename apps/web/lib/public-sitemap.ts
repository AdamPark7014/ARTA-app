import type { MetadataRoute } from 'next';
import { ROOT_DOMAIN } from '@/lib/domains';

type NewsIndexRow = {
  slug: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  coverUrl?: string | null;
};

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
}

export function publicSiteBaseUrl(): string {
  return `https://${ROOT_DOMAIN}`;
}

/** Solo noticias reales publicadas — nunca slugs inventados. */
export async function fetchPublishedNewsSlugs(): Promise<NewsIndexRow[]> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news-index`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as NewsIndexRow[];
    return Array.isArray(rows) ? rows.filter((r) => r?.slug) : [];
  } catch {
    return [];
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
    {
      url: `${base}/llms.txt`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  for (const row of news) {
    const lastModified = row.updatedAt || row.publishedAt;
    entries.push({
      url: `${base}/p/arta/noticias/${row.slug}`,
      lastModified: lastModified ? new Date(lastModified) : now,
      changeFrequency: 'monthly',
      priority: 0.7,
      ...(row.coverUrl
        ? {
            images: [`${base}${row.coverUrl.startsWith('/') ? row.coverUrl : `/${row.coverUrl}`}`],
          }
        : {}),
    });
  }

  return entries;
}
