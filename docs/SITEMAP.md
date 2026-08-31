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

## Guía SEO ops (post W2)

### Google Search Console

1. Verificar propiedad con `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` en el layout `/p/arta`.
2. Enviar sitemap: `https://artaproducciones.com/sitemap.xml`
3. Inspección de URL en `/p/arta` y una noticia publicada → solicitar indexación.
4. Revisar **Enhancements → Unparsable structured data** tras desplegar `@graph`.

### Rich Results

- Probar home y noticia en [Rich Results Test](https://search.google.com/test/rich-results).
- Debe aparecer Organization + WebSite en home; NewsArticle en noticias.

### RSS / Discover

- Feed: `https://artaproducciones.com/p/arta/feed.xml`
- Enlazado en `<link rel="alternate">` del layout público.

### sameAs (redes sociales)

Configurar en `.env.arta` cuando Adam confirme URLs:

- `NEXT_PUBLIC_SOCIAL_INSTAGRAM`
- `NEXT_PUBLIC_SOCIAL_FACEBOOK`
- `NEXT_PUBLIC_SOCIAL_YOUTUBE`
- `NEXT_PUBLIC_SOCIAL_TWITTER`

Solo incluir perfiles verificados y visibles.

### Bing

- `NEXT_PUBLIC_BING_SITE_VERIFICATION` en layout.
- Mismo sitemap en Bing Webmaster Tools.

### Smoke post-deploy

```bash
curl -s https://artaproducciones.com/p/arta | grep -i "experiencia"
curl -s https://artaproducciones.com/p/arta/feed.xml | head -20
```

El body de `/p/arta` debe contener texto de noticias/hero (SSR), no solo shell vacío.

## Código (sitemap)

- [`apps/web/app/sitemap.ts`](../apps/web/app/sitemap.ts)
- [`apps/web/app/robots.ts`](../apps/web/app/robots.ts)
- [`apps/web/lib/public-sitemap.ts`](../apps/web/lib/public-sitemap.ts)
- API: [`apps/api/src/studio/studio.controller.ts`](../apps/api/src/studio/studio.controller.ts) → `GET studio/public/news-index`
