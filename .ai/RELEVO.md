# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**W3 auditoría ultra profunda + mega presencia** (oleadas A–D):

### P0 / integridad (ya en `87ba30c` + verificación)
- PATCH events sin `status`; analytics audit tenant-scoped; sin FALLBACK_NEWS.

### Closed + RBAC
- API mutators + gates (WIP `87ba30c`); UI OC/hub/towers (`1eb575a`).

### SEO mega
- RSS `enclosure`/`media:content`; Organization logo ImageObject; home `@graph` FAQPage + Service.
- FAQ visible `#faq`; `/llms.txt` + robots; `alternates.languages` es-MX.
- Studio `home_about` stats + ubicación; seed `home_about`.

### Producto / datos
- Calendario `/calendar` + nav Eventos.
- Índices Prisma ronda 2 + migración `20260831120000_w3_indexes_r2`.
- Docs `ENTERPRISE_ITERATION_W3.md` + `SITEMAP.md`; W2 backlog sin `/p/explanada`.
- e2e calendar + empty news; specs P0 status/audit.

`tsc` api+web OK; jest P0 specs OK.

## A medias

Nada de código W3. Falta **deploy smoke** en Hetzner (siguiente si Adam pide, o este cierre).

## Siguiente paso

1. Deploy archive → `update.sh --no-pull` → smoke: `/p/arta` FAQ, `/llms.txt`, calendario login, closed 403.
2. Ops Adam: redes, GSC, deploy key, 2FA, Stripe prod (fuera de W3).

## No tocar

- `docs/ACCESS.md`, `.env.arta`, e2e API BD.
- No inventar `sameAs` sin URLs de Adam.
- No `/p/explanada` ni inventario ERP.
