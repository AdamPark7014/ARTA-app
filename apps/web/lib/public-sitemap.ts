import type { MetadataRoute } from 'next';
import { LEGAL_UPDATED } from '@/app/legal/legal-data';
import { ROOT_DOMAIN } from '@/lib/domains';
import { fetchPublicSiteData } from '@/lib/public-site-data';

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

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** La fecha más reciente de la lista (o nada: mejor sin `lastmod` que con uno falso). */
function latest(values: Array<string | null | undefined>): Date | undefined {
  return values
    .map(toDate)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
}

/** `LEGAL_UPDATED` va en dd/mm/aaaa, como se muestra en las páginas legales. */
function legalUpdated(): Date | undefined {
  const m = LEGAL_UPDATED.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : undefined;
}

/**
 * Todas las páginas públicas indexables: portada, noticias publicadas, contratar y legales.
 * `lastModified` sale de Studio (portada/noticias) o de la fecha de las páginas legales.
 * (Next 14.2 no serializa `images` en el sitemap: las fotos se descubren desde las páginas.)
 */
export async function buildPublicSitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteBaseUrl();
  const [site, news] = await Promise.all([fetchPublicSiteData('ARTA'), fetchPublishedNewsSlugs()]);

  const homeModified = latest([
    ...site.pages.map((p) => p.updatedAt),
    ...site.slides.map((s) => s.updatedAt),
    ...news.map((n) => n.updatedAt || n.publishedAt),
  ]);
  const legalModified = legalUpdated();
  const withDate = (d: Date | undefined) => (d ? { lastModified: d } : {});

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/p/arta`,
      ...withDate(homeModified),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];

  for (const row of news) {
    entries.push({
      url: `${base}/p/arta/noticias/${row.slug}`,
      ...withDate(toDate(row.updatedAt) || toDate(row.publishedAt)),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  entries.push({
    url: `${base}/contratar`,
    ...withDate(legalModified),
    changeFrequency: 'monthly',
    priority: 0.6,
  });

  for (const slug of ['privacidad', 'terminos', 'soporte', 'eliminar-cuenta']) {
    entries.push({
      url: `${base}/legal/${slug}`,
      ...withDate(legalModified),
      changeFrequency: 'yearly',
      priority: 0.3,
    });
  }

  return entries;
}
