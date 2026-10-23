import type { Metadata } from 'next';
import { HOME_PATH, SITE_NAME, buildPublicMetadata } from '@/lib/site-seo';

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const bingVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

const baseMeta = buildPublicMetadata({
  title: `${SITE_NAME} · Producción de conciertos y eventos en Puebla`,
  absoluteTitle: true,
  description:
    'Productora de conciertos y eventos en Puebla: producción técnica, hospitality, boletera, campaña y cierre. Venue aliado: Auditorio Arema Explanada.',
  path: HOME_PATH,
});

/**
 * Metadatos de la portada. Las noticias (`noticias/[slug]`) los sobrescriben con los suyos; el JSON-LD
 * de cada página lo pinta su propio `page.tsx` con los datos que esa página muestra.
 */
export const metadata: Metadata = {
  ...baseMeta,
  ...(googleVerification || bingVerification
    ? {
        verification: {
          ...(googleVerification ? { google: googleVerification } : {}),
          ...(bingVerification ? { other: { 'msvalidate.01': bingVerification } } : {}),
        },
      }
    : {}),
  alternates: {
    ...baseMeta.alternates,
    types: {
      'application/rss+xml': [{ url: `${HOME_PATH}/feed.xml`, title: 'Noticias Arta Producciones' }],
    },
  },
};

export default function PublicArtaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
