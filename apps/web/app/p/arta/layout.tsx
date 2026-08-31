import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  SITE_TAGLINE,
  buildPublicMetadata,
  homePageGraphJsonLd,
} from '@/lib/site-seo';

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const bingVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

const baseMeta = buildPublicMetadata({
  title: `${SITE_TAGLINE} · Producción de conciertos y eventos`,
  description:
    'Arta Producciones: producción integral de conciertos y eventos en Puebla. Experiencia del show, operación profesional y venue Auditorio Arema Explanada.',
  path: '/p/arta',
});

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
      'application/rss+xml': [{ url: '/p/arta/feed.xml', title: 'Noticias Arta Producciones' }],
    },
  },
};

export default function PublicArtaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={homePageGraphJsonLd()} />
      {children}
    </>
  );
}
