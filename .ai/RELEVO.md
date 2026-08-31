# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** main

## Hecho en este turno

**Metadata hiper-presencia SEO** (sitio público indexable).

1. `lib/site-seo.ts` — OG, Twitter, canonical, keywords, JSON-LD helpers.
2. Layouts: público `/p/arta` rich meta + Organization/WebSite; panel/auth/PIN `noindex`.
3. Noticias: `generateMetadata` server-side + Article/Breadcrumb JSON-LD.
4. `opengraph-image.tsx` dinámica 1200×630; `manifest.ts` PWA.
5. `docs/SITEMAP.md` ampliado con sección metadata.

## Siguiente paso

1. Deploy + verificar OG en Facebook Sharing Debugger / Twitter Card Validator.
2. Google Search Console: sitemap + inspección URL `/p/arta`.

## No tocar

- `docs/ACCESS.md`, `.env.arta`, e2e API BD.
