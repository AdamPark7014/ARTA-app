# Enterprise iteration W2 — auditoría ultra profunda

Síntesis de la oleada W2 (post metadata W1 / sitemap / hosts polish).

## W1 — Integridad P0

- Checklists: `assertEventNotClosed` + `checklist.edit` en PATCH/sign/restore.
- OC: RBAC create/update con `checklist.edit`; autorización ya gated.
- Documents/sponsors: permiso edit + closed guard en sponsors.
- Digests: `flush-outbox` tenant-scoped; global solo `everything`.
- UI comprobantes OC en hub y torre (`PoProofsBlock`).

## W2 — SEO profundo

- SSR sitio público (`fetchPublicSiteData` → `PublicSiteShell`).
- SSR noticias (`NewsArticleView` sin double-fetch).
- JSON-LD `@graph` unificado (`homePageGraphJsonLd`, `newsArticleGraphJsonLd`).
- Sin SearchAction falso; `EntertainmentBusiness` + `LocalBusiness` Explanada.
- `sameAs` / verificación GSC-Bing vía env.
- RSS `/p/arta/feed.xml`; OG por noticia; sitemap `lastmod` + imagen opcional.
- a11y: `prefers-reduced-motion` carrusel; `alt` en grid noticias.

## W3 — Módulos hub

- Studio: editor tiles `home_modulos` (no pisa tiles al guardar otras secciones).
- Patrocinadores: edición inline.
- Hub OC tab alineado con permisos PO/checklist.
- Events API `?scope=active|past|all`.
- Banner sync boletera stub en UI.

## W4 — Datos / RBAC

- Índices Prisma: `PurchaseOrder.eventId`, `TicketingSetup.eventId`, `AuditLog.createdAt`, `Event(org,status,startsAt)`.
- Finance list/advances: `finance.view`.
- Tasks workload: solo gerencia.

## W5 — Calidad

- e2e público + vendor smoke.
- Esta guía + `docs/SITEMAP.md` ampliado.

## Backlog P3 (fuera de este turno)

- BullMQ / colas persistentes para digests y automations.
- OpenTelemetry en API + web.
- Sitio público Explanada `/p/explanada`.
- Stripe producción / calendario-inventario.
