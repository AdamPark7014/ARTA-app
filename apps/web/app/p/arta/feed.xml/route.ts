import { fetchPublicNewsList } from '@/lib/public-site-data';
import { SITE_NAME, absoluteMediaUrl, siteOrigin } from '@/lib/site-seo';

export const revalidate = 3600;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mediaBlock(coverUrl: string | null | undefined, title: string): string {
  const abs = absoluteMediaUrl(coverUrl);
  if (!abs) return '';
  const safe = escapeXml(abs);
  const alt = escapeXml(title);
  return `
  <enclosure url="${safe}" type="image/jpeg" length="0"/>
  <media:content url="${safe}" medium="image" type="image/jpeg">
    <media:title type="plain">${alt}</media:title>
  </media:content>
  <media:thumbnail url="${safe}"/>`;
}

export async function GET() {
  const posts = await fetchPublicNewsList();
  const base = siteOrigin();
  const items = posts
    .map((post) => {
      const link = `${base}/p/arta/noticias/${post.slug}`;
      const pub = post.publishedAt ? new Date(post.publishedAt).toUTCString() : new Date().toUTCString();
      const desc = escapeXml(post.excerpt?.trim() || post.title);
      return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${link}</link>
  <guid isPermaLink="true">${link}</guid>
  <pubDate>${pub}</pubDate>
  <description>${desc}</description>${mediaBlock(post.coverUrl, post.title)}
</item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(SITE_NAME)} · Noticias</title>
    <link>${base}/p/arta#noticias</link>
    <description>Noticias y novedades de Arta Producciones</description>
    <language>es-mx</language>
    <atom:link href="${base}/p/arta/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
