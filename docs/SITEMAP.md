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

El sitemap se **genera dinámicamente** desde noticias publicadas en Studio (`GET /studio/public/news-index`). Si la API falla o no hay noticias, **no** se inventan slugs. Se actualiza solo al publicar (revalidación ~1 h).

## Qué se indexa

- Solo el **sitio marketing** en el dominio raíz (`/p/arta`, noticias, `llms.txt`).
- **No** entran: panel `arta.*`, `auditorio.*`, login, PIN proveedor (`/v/`).
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

- **Open Graph / Twitter Card** en `/p/arta` y cada noticia (título, descripción, imagen).
- Artículos: preferir `coverUrl` como `og:image` (no logo si hay cover).
- **JSON-LD `@graph`**: Organization (logo ImageObject), WebSite, WebPage, LocalBusiness, FAQPage, Service, NewsArticle + Breadcrumb.
- **Discover**: `max-image-preview:large`; RSS con `enclosure` / `media:content` cuando hay cover usable.
- **FAQ**: sección visible `#faq` alineada con FAQPage schema (solo Q&A reales en página).
- **llms.txt**: resumen de entidad + URLs canónicas para crawlers AI.
- **lang**: `html lang=es-MX` + `alternates.languages['es-MX']`.
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
- Home: Organization + WebSite + FAQPage + Service; noticias: NewsArticle.

### RSS / Discover

- Feed: `https://artaproducciones.com/p/arta/feed.xml`
- Enlazado en `<link rel="alternate">` del layout público.
- Items con cover incluyen `media:content` / `enclosure`.

### sameAs (redes sociales)

Configurar en `.env.arta` cuando Adam confirme URLs (no inventar):

- `NEXT_PUBLIC_SOCIAL_INSTAGRAM`
- `NEXT_PUBLIC_SOCIAL_FACEBOOK`
- `NEXT_PUBLIC_SOCIAL_YOUTUBE`
- `NEXT_PUBLIC_SOCIAL_TWITTER`

### Geo venue

- `NEXT_PUBLIC_VENUE_ADDRESS`, `NEXT_PUBLIC_VENUE_LAT`, `NEXT_PUBLIC_VENUE_LNG`
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
