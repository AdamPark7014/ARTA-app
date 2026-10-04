import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION } from '@/lib/site-seo';

/**
 * Manifiesto del panel instalado (PWA). En iPhone los avisos push solo
 * funcionan con ARTA agregada a la pantalla de inicio, por eso abre en el panel.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'ARTA',
    short_name: 'ARTA',
    description: SITE_DESCRIPTION,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    lang: 'es-MX',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['business', 'productivity'],
  };
}
