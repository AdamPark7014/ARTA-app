# Sitemap e indexación — artaproducciones.com

## URLs en producción

| Recurso | URL |
|---------|-----|
| Sitemap | https://artaproducciones.com/sitemap.xml |
| Robots | https://artaproducciones.com/robots.txt |
| Sitio público | https://artaproducciones.com/p/arta |
| Noticias | https://artaproducciones.com/p/arta/noticias/{slug} |

El sitemap se **genera dinámicamente** desde noticias publicadas en Studio (`GET /studio/public/news-index`). Se actualiza solo al publicar noticias nuevas (revalidación ~1 h).

## Qué se indexa

- Solo el **sitio marketing** en el dominio raíz (`/p/arta` y noticias).
- **No** entran: panel `arta.*`, `auditorio.*`, login, PIN proveedor (`/v/`).

## Enviar a buscadores

1. [Google Search Console](https://search.google.com/search-console) → propiedad `artaproducciones.com` → Sitemaps → añadir `https://artaproducciones.com/sitemap.xml`
2. [Bing Webmaster Tools](https://www.bing.com/webmasters) → mismo sitemap.

## Verificar

```bash
curl -s https://artaproducciones.com/sitemap.xml | head -40
curl -s https://artaproducciones.com/robots.txt
```

## Metadata y presencia social

- **Open Graph / Twitter Card** en `/p/arta` y cada noticia (título, descripción, imagen).
- **JSON-LD**: Organization, WebSite, NewsArticle, BreadcrumbList.
- **Manifest** PWA: `/manifest.webmanifest`
- **OG image dinámica**: `/p/arta/opengraph-image`
- Código: [`apps/web/lib/site-seo.ts`](../apps/web/lib/site-seo.ts)

Verificar meta tags:

```bash
curl -sI https://artaproducciones.com/p/arta | head -15
```

## Código (sitemap)

- [`apps/web/app/sitemap.ts`](../apps/web/app/sitemap.ts)
- [`apps/web/app/robots.ts`](../apps/web/app/robots.ts)
- [`apps/web/lib/public-sitemap.ts`](../apps/web/lib/public-sitemap.ts)
- API: [`apps/api/src/studio/studio.controller.ts`](../apps/api/src/studio/studio.controller.ts) → `GET studio/public/news-index`
