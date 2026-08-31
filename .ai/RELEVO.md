# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** main

## Hecho en este turno

**Sitemap + robots.txt** para indexación del sitio público.

1. `GET /studio/public/news-index` — slugs de noticias publicadas.
2. `app/sitemap.ts` + `app/robots.ts` + `lib/public-sitemap.ts`.
3. `isPublicPath` incluye `/sitemap.xml` y `/robots.txt`.
4. `docs/SITEMAP.md` — URLs y envío a Search Console.

## Siguiente paso

1. Deploy + verificar `curl …/sitemap.xml`.
2. Adam: enviar sitemap en Google Search Console / Bing.

## No tocar

- `docs/ACCESS.md`, `.env.arta`, e2e API BD.
