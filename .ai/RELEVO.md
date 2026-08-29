# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

**Campaña / gastos de publicidad: Excel super-editable** (pedido al ver el PDF
«GASTOS DE PUBLICIDAD Y CONVENIOS» de ANDRES PARRA).

### Qué se hizo

1. **`SheetEditor` potenciado** — selección de celda; +/− fila/columna;
   duplicar/vaciar fila; llenar abajo; sumar columna; fórmulas `=` se guardan
   como fórmula del libro.
2. **Modo `variant="campaign"`** — «+ Concepto (con totales)» (fórmulas B×C /
   E×F), calcular fila, Σ Total / Σ Total ARTA.
3. **`lib/campaign-sheet-template.ts`** — plantilla GASTOS DE PUBLICIDAD Y
   CONVENIOS con columnas del formato real + totales/cortesías.
4. **Campaña del evento** — botón **Nueva hoja de gastos**; SheetEditor en modo
   campaña; en PDF aviso claro: la tabla se edita en Excel, el PDF solo anota.

### Límite explícito (no mentir)

Un PDF escaneado/exportado de esa tabla **no** se puede reescribir celda a
celda como Excel en el navegador. La fuente editable es el `.xlsx`.

### Verificación

- `npx tsc --noEmit` en `apps/web` verde.

## Decisiones de diseño que hay que respetar

- Todo lo anterior (checklists sobre PDF, ExpandBox, menú auto, pdffield CSS).
- Campaña: editar tabla en Excel; PDF = vista/anotación.
- No regenerar checklists autorizados en bloque.

## A medias — CUIDADO

- Deploy de este turno.
- Deploy key GitHub; Monse/Kika; P1 Playwright; Traefik causa raíz.

## Siguiente paso

1. Deploy.
2. Probar: Campaña → Nueva hoja de gastos → Editar hoja → + Concepto → Guardar.
3. Si Adam insiste en PDF “como Word completo”, valorar OCR/servicio aparte
   (fuera del spine actual).

## No tocar

- `docs/ACCESS.md`, `output: 'standalone'`, e2e API BD, `.env.arta`.
