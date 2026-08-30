# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

**Sistema super robusto** (plan P0 → P1 → P2 + deploy).

### P0 — Integridad

1. `regenerateForEvent` salta instancias con `authorizedAt` /
   `authorizedSignature` (boletera no reescribe PDFs firmados).
2. Seed `update`: solo `fullName` / `title`; no pisa `roleKey`, `entities`,
   `permissions`, `active`; membership `update: {}`.
3. Hub evento: `flash()` + `msgVariant` (success vs error).

### P1 — Fiabilidad

4. try/catch en mutaciones del hub (firma, OC, uploads, close/reopen/cancel,
   tasks, sponsors, PIN, etc.).
5. Compose: API health `/ready`; web `/login` + `depends_on` api healthy.
6. `update.sh`: pg_dump → `/root/arta-backups/`; tags `arta-web:prev` /
   `arta-api:prev`. Nuevo `deploy/rollback.sh`.
7. Nav OC sin `checklist.edit` (solo `po.authorize` | `po.mark_paid` |
   `everything`).

### P2 — Pruebas y docs

8. Playwright `apps/web/e2e/hub-critical.spec.ts` (campaña, Esc dirty, OC
   window, corrida).
9. Guía HTML: menú nuevo, Más herramientas, ExpandBox, Ctrl+S, campaña Excel.
10. `DOMAINS.md`: hook post-deploy Nexara + backup/rollback.
11. `PLAN_PROFESIONALIZACION_UI.md`: P1-3/P1-4 y gap table actualizados.

### Verificación

- `npx tsc --noEmit` en `apps/web` y `apps/api` verde.

## Decisiones de diseño que hay que respetar

- Checklists sobre PDF, ExpandBox, menú auto, pdffield CSS.
- Campaña: editar tabla en Excel; PDF = vista/anotación.
- No regenerar checklists autorizados en bloque.
- Seed no pisa `passwordHash` ni ACL en update.

## A medias — CUIDADO

- Deploy key GitHub en Hetzner (Adam) para `git pull` en update.sh.
- Hook post-deploy Nexara que restaure `arta.yml` (doc listo; falta aplicar).
- Confirmar roster Monse/Kika.

## Siguiente paso

1. Smoke prod: boletera no toca PDF firmado; Usuarios cambiar rol → restart
   API → rol intacto; hub flash rojo si falla guardar; Esc dirty.
2. Adam: deploy key + hook Nexara post-deploy.
3. Opcional: backfill `--include-signed` solo si Adam lo pide.

## No tocar

- `docs/ACCESS.md`, `output: 'standalone'`, e2e API BD, `.env.arta`.
