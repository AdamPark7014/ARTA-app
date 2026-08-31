import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from '@/lib/site-seo';

export default function manifest(): MetadataRoute.Manifest {
  const origin = siteOrigin();
  return {
    name: SITE_NAME,
    short_name: 'Arta',
    description: SITE_DESCRIPTION,
    start_url: '/p/arta',
    display: 'standalone',
    background_color: '#0a0a0b',
    theme_color: '#c9a227',
    lang: 'es-MX',
    orientation: 'portrait-primary',
    icons: [
      {
        src: `${origin}/brand/arta-logo.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    categories: ['business', 'entertainment'],
  };
}
