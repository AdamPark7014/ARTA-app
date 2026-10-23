import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { entityFromHost } from '@/lib/domains';
import { publicSiteBaseUrl } from '@/lib/public-sitemap';

/**
 * Fotos públicas (portadas de noticias, carrusel) viven en /uploads junto con archivos del panel.
 * Se abren solo las imágenes: sin ellas no hay vista previa en X/LinkedIn ni Google Imágenes.
 */
const PUBLIC_IMAGE_PATTERNS = [
  '/uploads/*.jpg$',
  '/uploads/*.jpeg$',
  '/uploads/*.png$',
  '/uploads/*.webp$',
];

export default function robots(): MetadataRoute.Robots {
  const host = headers().get('host') || '';

  // Paneles (arta.*, auditorio.*): cada respuesta lleva `X-Robots-Tag: noindex` (middleware). Se deja
  // rastrear para que Google lea ese noindex y saque lo que tuviera; solo se cierran API y archivos.
  if (entityFromHost(host)) {
    return { rules: [{ userAgent: '*', disallow: ['/api/', '/uploads/'] }] };
  }

  const base = publicSiteBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', ...PUBLIC_IMAGE_PATTERNS],
        disallow: [
          '/dashboard',
          '/events',
          '/login',
          '/invite',
          '/v/',
          '/dev/',
          '/api/',
          '/uploads/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
