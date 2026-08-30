# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

**Hosts polish** — profesionalización visual/copy en los 4 hosts (sitio, arta,
auditorio, PIN/auth). Sin módulos CRUD nuevos.

### A — Panel unificado

1. Nav 100 % ES en `access-matrix.ts` (Inicio, Auditoría, Resúmenes, Hospedaje,
   Riesgo, PIN proveedores) + tab evento Checklists→Formatos.
2. Títulos `AppShell` sin jerga EN (Finanzas, OC, Campañas, Auditoría, etc.).
3. Wordmark tipográfico EXPLANADA + `globals.scss` `data-entity` polish.
4. Empty states más claros en `ModuleChecklistIndex`.

### B — Sitio público + Studio

5. Sin teléfono placeholder; stats de marca (Shows / Puebla / Experiencia);
   aria-labels ES en carrusel.
6. Studio y vista previa del sitio: labels ES (Titular, Botón, Borrador).

### C — PIN + auth

7. Portal `/v/[pinId]` Acceso proveedor; label default Proveedor en hub.
8. Login/invite copy alineado a entidad (Auditorio Arema · Explanada).

### D — Cierre

9. `npx tsc --noEmit` en `apps/web`.
10. Nota hosts polish en `PLAN_PROFESIONALIZACION_UI.md`.
11. Deploy bundle + smoke 3 hosts.

## Decisiones de diseño que hay que respetar

- Checklists sobre PDF, ExpandBox, menú auto, pdffield CSS.
- Campaña: editar tabla en Excel; PDF = vista/anotación.
- No regenerar checklists autorizados en bloque.
- Seed no pisa `passwordHash` ni ACL en update.
- Marca Explanada = wordmark tipográfico (no hay PNG Arema en `public/brand/`).

## A medias — CUIDADO

- Deploy key GitHub en Hetzner (Adam) para `git pull` en update.sh.
- Hook post-deploy Nexara que restaure `arta.yml` (doc listo; falta aplicar).
- Confirmar roster Monse/Kika.

## Siguiente paso

1. Adam: deploy key + hook Nexara post-deploy.
2. Smoke manual opcional: panel auditorio wordmark; sitio sin tel falso.
3. Opcional: backfill `--include-signed` solo si Adam lo pide.

## No tocar

- `docs/ACCESS.md`, `output: 'standalone'`, e2e API BD, `.env.arta`.
