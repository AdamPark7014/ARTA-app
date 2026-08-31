# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**W3 completo** (`5e7e246` + UI `1eb575a` + P0 `87ba30c`) y **deploy Hetzner** OK.

Smoke prod:
- `/p/arta`: FAQ visible + `@graph` FAQPage/Service + empty news state
- `/llms.txt` 200; robots Allow `/llms.txt`
- feed `language=es-mx`; calendar → login `?next=/calendar`
- containers api/web healthy

## A medias

Nada W3.

## Siguiente paso

1. Ops Adam: redes (`NEXT_PUBLIC_SOCIAL_*`), GSC, deploy key, 2FA, Stripe prod.
2. Push `origin/main` cuando quieras (rama ahead ~13).

## No tocar

- `docs/ACCESS.md`, `.env.arta`, e2e API BD.
- No `/p/explanada` ni inventario ERP.
