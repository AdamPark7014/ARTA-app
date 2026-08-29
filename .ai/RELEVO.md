# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

Plan + implementación **P0** de profesionalización e intuitividad. Documento
maestro: **`docs/PLAN_PROFESIONALIZACION_UI.md`** (gap junta 28-08, documentos
editables 29-08, y fases P0–P3).

1. **Documentos en grande por defecto.** `ExpandBox` gana `defaultExpanded`.
   ChecklistPdfEditor, PdfEditor, SheetEditor y FileViewer (PDF/xlsx/imagen)
   abren a **pantalla completa**; Esc o «Salir» vuelve. Inline ya no es
   miniatura: `.expandbox--inline` con ~70vh de trabajo.

2. **Menú automático tipo Mac por defecto en desktop.** Primera visita
   (≥901px) activa auto-hide; se recuerda en `localStorage`. Franja sensible
   más visible, hint en topbar («Acerca el cursor al borde izquierdo»), botón
   **Fijar menú**. Móvil sigue con hamburguesa.

3. **Checklist hub.** Hint de pantalla completa + guardar/regenerar PDF.

4. **Security.** Copy 2FA más claro; sin inline style en clave secreta.

5. **Auditoría Fase A 6–7.** Finance / users / security ya usan PageHeader,
   LoadingBlock, EmptyState — sin reescritura; se marcan como revisadas en el
   plan (P1-1 queda para polish fino si Adam pide).

### Verificación

- `npx tsc --noEmit` en `apps/web` verde.

## Decisiones de diseño que hay que respetar

- Todo lo del relevo anterior de claude-code sigue vigente (herramientas
  ocultas no se borran, OC en menú, Carpetas para convenios, pdf worker,
  menú auto = una columna, blur del botón autohide, cajas PDF en puntos,
  seed sin tocar passwordHash, etc.).
- **`defaultExpanded` en editores de documento** — si alguien quiere empezar
  en columna, sale con Esc; no quitar el default sin pedirlo.
- **Primera visita desktop = menú automático.** Quien prefiera fijo usa
  «Fijar menú» o el toggle del pie (`arta_nav_autohide=0`).
- Los **21 checklists autorizados** siguen fuera del backfill salvo
  `--include-signed`.

## A medias — CUIDADO

- **Deploy key de GitHub en el servidor** — sigue pendiente (bundle + `--no-pull`).
- **Monse y Kika:** confirmar apellidos/correo/rol con Arturo.
- **Eventos `[SEED_DEMO]` sin `organizationId`** — invisibles en panel.
- **P1:** Playwright hub (Campaña + OC + ExpandBox Esc), guía HTML del menú nuevo.
- **P2:** causa raíz Traefik/Nexara; A3-5 un módulo operativo.
- **P3:** `ENTERPRISE_ITERATION_W2.md`.
- **`deploy/ensure-traefik-route.sh`** + cron 5 min en el droplet.

## Límites conocidos de los editores

Sin cambio: hoja no calcula fórmulas nuevas; PDF overlay añade texto; PDF→doc
pierde layout / no OCR. Ver `docs/DOCUMENTOS_EDITABLES.md`.

## Siguiente paso

1. Deploy a producción (bundle/`--no-pull` o deploy key).
2. P1-3 Playwright ExpandBox + Campaña + ventana OC.
3. P1-4 actualizar guía de uso al menú nuevo.
4. Confirmar roster Monse/Kika y entregar credenciales (fuera de repo).
5. P2-2 hook Nexara para no borrar `arta.yml`.

## No tocar

- **`docs/ACCESS.md`**
- **`next.config.js` → `output: 'standalone'`**
- **`apps/api/test/*.e2e-spec.ts`**
- **`deploy/.env.arta` del servidor**
- No regenerar en bloque PDFs ya autorizados.
