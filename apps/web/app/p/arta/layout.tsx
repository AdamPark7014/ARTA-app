import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  SITE_TAGLINE,
  buildPublicMetadata,
  organizationJsonLd,
  websiteJsonLd,
} from '@/lib/site-seo';

export const metadata: Metadata = buildPublicMetadata({
  title: `${SITE_TAGLINE} · Producción de conciertos y eventos`,
  description:
    'Arta Producciones: producción integral de conciertos y eventos en Puebla. Experiencia del show, operación profesional y venue Auditorio Arema Explanada.',
  path: '/p/arta',
});

export default function PublicArtaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      {children}
    </>
  );
}
