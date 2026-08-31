import type { MetadataRoute } from 'next';
import { publicSiteBaseUrl } from '@/lib/public-sitemap';

export default function robots(): MetadataRoute.Robots {
  const base = publicSiteBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/p/'],
        disallow: [
          '/dashboard',
          '/events',
          '/login',
          '/invite',
          '/v/',
          '/api/',
          '/uploads/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
