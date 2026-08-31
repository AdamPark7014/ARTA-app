# Enterprise iteration W3 — auditoría ultra profunda + mega presencia

Síntesis de la oleada W3 (post W2 `3efa71d`). **No** construye `/p/explanada` ni ERP inventario (PRODUCT: Explanada = panel interno).

## Oleada A — P0

- `PATCH /events/:id`: sin `status` (solo `POST close|cancel|reopen`).
- Analytics `auditLog`: filtrado por `user.organizationId` (overview + auditIntel).
- Sitio público / sitemap: sin `FALLBACK_NEWS` ni slugs inventados.

## Oleada B — Closed + RBAC

- `assertEventNotClosed` en campaigns, ticketing, finance advances, OC, uploads, tasks, vendor pins, checklist from-template.
- Gates: campaign view, finance view, vendor pin list, users PATCH role allowlist, webhooks secret mask.
- UI: OC authorize/mark_paid, hub tabs, sponsors/checklists/files, tasks Equipo, finance/ticketing/advances/vendor.

## Oleada C — SEO mega

- RSS `enclosure` + `media:content` cuando hay cover.
- Organization logo como `ImageObject`; home `@graph` con FAQPage + Service.
- FAQ visible `#faq`; `/llms.txt` + robots allow; `alternates.languages` es-MX.
- Studio `home_about`: stats + ubicación editables; env venue geo documentado.

## Oleada D — Producto / datos

- Calendario `/calendar` (mes, filtro estado, link al hub); nav Eventos.
- Índices Prisma ronda 2: PaymentProof, PurchaseOrderLine, PO(eventId,status), User(organizationId), ChecklistInstance(templateId), Event(entity,startsAt).
- e2e calendario + home sin fake news; specs P0 status strip + audit scope.

## Fuera de este turno (Adam / P3)

- Deploy key, Traefik, GSC, redes, 2FA enroll, Stripe prod, ticketing live URL.
- BullMQ / OpenTelemetry / inventario ERP / sitio público Explanada.

## Nota histórica

El archivo `ENTERPRISE_ITERATION_W3.md` anterior documentaba modularización hub / webhooks / OpenAPI (ya shippeado). Esta revisión reemplaza esa narrativa con la oleada de auditoría W3; el código de modularización sigue en el repo.
