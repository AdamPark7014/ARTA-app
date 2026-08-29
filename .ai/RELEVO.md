# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

**Fix: no se podía escribir sobre el PDF del checklist** (reportado en
Catering y Camerinos / ANDRES PARRA).

### Causa

1. El canvas de pdf.js quedaba por encima / capturando clics: los campos
   existían en el DOM pero no se veían ni respondían.
2. Las reglas globales `.shell input` / `.panel input` (fondo `#141416`,
   `color-scheme: dark`, `width: 100%`) ganaban o camuflaban los `.pdffield`
   sobre la hoja blanca.

Los datos en BD estaban bien: Catering tiene `pdfFieldsJson` con 6 campos,
`pageWidth=612`, sectionId `cat` alineado con `dataJson`.

### Cambio

- Canvas: `z-index: 0` + `pointer-events: none`.
- Overlay: `z-index: 2`; campos `z-index: 3` + `pointer-events: auto`.
- `.pdffield` con borde dorado siempre visible, fondo blanco forzado,
  especificidad `.shell` / `.panel`, casillas mín. 22px.
- Hint «N campos editables…» y alerta si el mapa no coincide con ítems.
- Hit targets de check un poco más grandes al escalar.

Plan P0 sigue en `docs/PLAN_PROFESIONALIZACION_UI.md`.

### Verificación

- `npx tsc --noEmit` en `apps/web` verde.
- Confirmado en prod DB: checklist Catering con fields no nulos.

## Decisiones de diseño que hay que respetar

- Todo lo del relevo anterior sigue vigente.
- No regenerar en bloque los 21 checklists ya autorizados.
- Los `.pdffield` deben ganar siempre a `.shell input` (fondo claro sobre PDF).

## A medias — CUIDADO

- Deploy de este fix (bundle / `--no-pull`).
- Deploy key GitHub en el servidor.
- Monse/Kika: confirmar apellidos.
- P1 Playwright hub; guía HTML menú nuevo.
- Traefik/Nexara causa raíz.

## Siguiente paso

1. Deploy inmediato de este fix.
2. Verificar en UI: casillas blancas con borde dorado sobre el PDF.
3. P1 specs / guía.

## No tocar

- `docs/ACCESS.md`, `output: 'standalone'`, e2e API contra BD, `.env.arta`.
