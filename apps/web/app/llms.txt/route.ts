import { CONTACT_EMAIL, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteOrigin } from '@/lib/site-seo';

export const revalidate = 86400;

/** Plain-text map for AI crawlers (llms.txt convention). */
export async function GET() {
  const base = siteOrigin();
  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}

## Canonical

- Home: ${base}/p/arta
- Cartelera: ${base}/p/arta/cartelera
- Nosotros: ${base}/p/arta/nosotros
- Servicios: ${base}/p/arta/servicios
- Noticias: ${base}/p/arta/noticias
- Feed RSS: ${base}/p/arta/feed.xml
- Preguntas frecuentes: ${base}/p/arta/preguntas
- Contacto: ${base}/p/arta/contacto
- Contratar la plataforma ARTA: ${base}/contratar
- Aviso de privacidad: ${base}/legal/privacidad
- Sitemap: ${base}/sitemap.xml

## Entity

- Name: ${SITE_NAME}
- Alternate: ARTA
- Location: Puebla, Puebla, México
- Venue ally: Auditorio Arema Explanada
- Contact: ${CONTACT_EMAIL}
- Language: es-MX

## Do not index

Internal ops panels (arta.*/auditorio.*), login, vendor PIN (/v/), and app APIs are not public marketing content.

## Optional

- Studio CMS publishes real news only; empty news is an empty state, never invented slugs.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
