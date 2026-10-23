# Sitemap e indexación — artaproducciones.com

## URLs en producción

| Recurso | URL |
|---------|-----|
| Sitemap | https://artaproducciones.com/sitemap.xml |
| Robots | https://artaproducciones.com/robots.txt |
| llms.txt | https://artaproducciones.com/llms.txt |
| Sitio público | https://artaproducciones.com/p/arta |
| FAQ | https://artaproducciones.com/p/arta#faq |
| Noticias | https://artaproducciones.com/p/arta/noticias/{slug} |
| Feed RSS | https://artaproducciones.com/p/arta/feed.xml |

El sitemap se **genera dinámicamente**: portada, noticias publicadas en Studio (`GET /studio/public/news-index`),
`/contratar` y las cuatro páginas `/legal/*`. `lastmod` sale de Studio (portada = lo más reciente de secciones,
carrusel y noticias) o de `LEGAL_UPDATED`; si la API no responde, la portada va sin `lastmod` (nunca «ahora» falso)
y **no** se inventan slugs. Revalidación ~1 h. Next 14.2 no serializa `images` en el sitemap.

## Qué se indexa

- Solo el **sitio público** en el dominio raíz: `/p/arta`, noticias, `/contratar`, `/legal/*`.
- `www.artaproducciones.com` → **308** al dominio raíz (middleware): una sola versión.
- **No** entran: panel `arta.*`, `auditorio.*` (cada respuesta lleva `X-Robots-Tag: noindex, nofollow` desde el
  middleware y su `robots.txt` no anuncia sitemap), login, PIN proveedor (`/v/`), `/dev/`, API.
- `/uploads/` está cerrado salvo imágenes (`/uploads/*.jpg$`, `.jpeg`, `.png`, `.webp`): portadas de noticias y
  carrusel necesitan poder rastrearse para la vista previa en redes y Google Imágenes.
- **No** hay `/p/explanada` (Explanada = ops internas).

## Enviar a buscadores

1. [Google Search Console](https://search.google.com/search-console) → propiedad `artaproducciones.com` → Sitemaps → añadir `https://artaproducciones.com/sitemap.xml`
2. [Bing Webmaster Tools](https://www.bing.com/webmasters) → mismo sitemap.

## Verificar

```bash
curl -s https://artaproducciones.com/sitemap.xml | head -40
curl -s https://artaproducciones.com/robots.txt
curl -s https://artaproducciones.com/llms.txt | head -20
```

## Metadata y presencia social

- **Open Graph / Twitter Card** en todas las páginas públicas (título, descripción, canonical, `og:locale es_MX`).
- Imagen para compartir: `public/brand/og-arta.png` (1200×630, papel y tinta, generada desde
  `brand/arta-logo-ink.png`). Noticias: su `coverUrl` primero y la de marca de respaldo.
- Sin `twitter:site` mientras no haya cuenta de X confirmada (`NEXT_PUBLIC_SOCIAL_TWITTER`).
- **JSON-LD `@graph`** (un solo bloque por página, `<` escapado):
  - Portada: `Organization`+`EventPlanner` (logo en tinta, email, ciudad, `contactPoint`; teléfono y `sameAs`
    solo si están configurados y por tanto visibles), `WebSite`, `WebPage`, `EventVenue` (Auditorio Arema
    Explanada, nombre y ciudad; coordenadas solo si se configuran), `FAQPage` (las preguntas visibles) y un
    `Service` por cada tarjeta de `#modulos` (Studio).
  - Noticia: `NewsArticle` + `WebPage` + `BreadcrumbList` (Inicio › Noticias › título).
  - `/contratar` y `/legal/*`: `WebPage` + `BreadcrumbList`.
  - Sin `Event`: el sitio no publica cartelera; cuando la tenga, cada show con fecha, recinto y boletos.
- Google Business Profile y Search Console: [`docs/seo/GOOGLE-BUSINESS.md`](seo/GOOGLE-BUSINESS.md).
- **Discover**: `max-image-preview:large`; RSS con `enclosure` / `media:content` cuando hay cover usable.
- **FAQ**: sección visible `#faq` alineada con FAQPage schema (solo Q&A reales en página).
- **llms.txt**: resumen de entidad + URLs canónicas para crawlers AI.
- **lang**: `html lang=es-MX`. Sin `hreflang`: no hay versiones en otro idioma.
- **Manifest** PWA: `/manifest.webmanifest`
- Código: [`apps/web/lib/site-seo.ts`](../apps/web/lib/site-seo.ts)

Verificar meta tags:

```bash
curl -sI https://artaproducciones.com/p/arta | head -15
```

## Guía SEO ops (post W2/W3)

### Google Search Console

1. Verificar propiedad con `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` en el layout `/p/arta`.
2. Enviar sitemap: `https://artaproducciones.com/sitemap.xml`
3. Inspección de URL en `/p/arta` y una noticia publicada → solicitar indexación.
4. Revisar **Enhancements → Unparsable structured data** tras desplegar `@graph` / FAQ / Service.

### Rich Results

- Probar home y noticia en [Rich Results Test](https://search.google.com/test/rich-results).
- Home: Organization/EventPlanner + WebSite + EventVenue + FAQPage + Service; noticias: NewsArticle + Breadcrumb.

### RSS / Discover

- Feed: `https://artaproducciones.com/p/arta/feed.xml`
- Enlazado en `<link rel="alternate">` del layout público.
- Items con cover incluyen `media:content` / `enclosure`.

### sameAs (redes sociales)

Configurar en `.env.arta` cuando Adam confirme URLs (no inventar):

- `NEXT_PUBLIC_SOCIAL_INSTAGRAM`
- `NEXT_PUBLIC_SOCIAL_FACEBOOK`
- `NEXT_PUBLIC_SOCIAL_YOUTUBE`
- `NEXT_PUBLIC_SOCIAL_TIKTOK`
- `NEXT_PUBLIC_SOCIAL_TWITTER`

Son variables de **build** (Dockerfile/compose las pasan como `args`): tras cambiarlas, reconstruir la web.
Se muestran en el pie («Redes») y entran a `sameAs`: lo que no se ve no se publica.

### Geo venue

- `NEXT_PUBLIC_VENUE_ADDRESS`, `NEXT_PUBLIC_VENUE_LAT`, `NEXT_PUBLIC_VENUE_LNG` (las coordenadas de respaldo del
  mapa, 19.0414/-98.2063, no son las del recinto: el JSON-LD no las usa).
- Studio `home_about.location` + stats editables.

### Bing

- `NEXT_PUBLIC_BING_SITE_VERIFICATION` en layout.
- Mismo sitemap en Bing Webmaster Tools.

### Smoke post-deploy

```bash
curl -s https://artaproducciones.com/p/arta | grep -i "experiencia"
curl -s https://artaproducciones.com/p/arta | grep -i "faq"
curl -s https://artaproducciones.com/p/arta/feed.xml | head -30
curl -s https://artaproducciones.com/llms.txt | head -15
```

El body de `/p/arta` debe contener texto de hero/FAQ (SSR), no solo shell vacío. Sin noticias → empty state, no cards inventadas.

## Código (sitemap / SEO)

- [`apps/web/app/sitemap.ts`](../apps/web/app/sitemap.ts)
- [`apps/web/app/robots.ts`](../apps/web/app/robots.ts)
- [`apps/web/app/llms.txt/route.ts`](../apps/web/app/llms.txt/route.ts)
- [`apps/web/lib/public-sitemap.ts`](../apps/web/lib/public-sitemap.ts)
- [`apps/web/lib/site-seo.ts`](../apps/web/lib/site-seo.ts)
- API: [`apps/api/src/studio/studio.controller.ts`](../apps/api/src/studio/studio.controller.ts) → `GET studio/public/news-index`
