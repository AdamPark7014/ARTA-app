# EXEC-PACKET — ARTA-app

- **Escrito por:** Claude (cabeza)
- **Fecha:** 2026-09-23
- **Rama:** main
- **Estado:** CERRADO
<!-- Estados: BORRADOR → LISTO PARA CURSOR → EN EJECUCION → CERRADO -->

## Objetivo
Los 10 archivos de la carpeta «FORMATOS ARTA» de Drive (gerencia, 23-09-2026) pasan a ser
formatos **estándar del sistema**: se capturan dentro de ARTA para cualquier evento, la única
salida es **PDF** con la identidad del cliente (logo + pie de los Word), y no hace falta
subir/bajar Word ni Excel. Fuera de alcance: Orden de compra y Creación de boletera ya son
módulos propios con su PDF (se retiran sus plantillas-checklist duplicadas, nada más).

## Mapa Drive → sistema
| Archivo en Drive | Cómo queda |
|---|---|
| CHECKLIST EVENTO GENERAL.docx | plantilla `EVENTO_GENERAL` v2: encabezado + 45 puntos del cliente, agrupados, con nota por casilla |
| CHECKLIST PRODUCCIÓN.docx | `PRODUCCION` v2: riders (adjunto), proveedores y encargados (texto), PMs, horarios, **minuto a minuto (tabla)**, layout (adjunto), observaciones |
| CHECKLIST HOSPEDAJE.docx | `HOSPEDAJE` v2: hotel, enlace, desayuno SÍ/NO, **Party A / Party B (rooming en tabla)**, confirmaciones (adjunto), observaciones |
| CHECKLIST TRANSPORTACIÓN.docx | `TRANSPORTACION` v2: proveedor, contacto, camionetas, modelo, incluye, estatus, **traslados (tabla opcional)**, observaciones |
| CHECKLIST RUEDA DE PRENSA.xlsx.docx | `RUEDA_PRENSA` v2: datos de la RP, encargados, banners/pantallas/identificadores SÍ/NO, **medios confirmados (tabla)**, observaciones |
| CHECKLIST INFO ARTES SHOWS.docx | `ARTES_SHOWS` v2: promotoras, boletera, patrocinadores, extras, 5 entregables (adjunto), fechas, autorizó |
| DISTRUIBUICION PENDONES.xlsx | `PENDONES` v2: ciudad, **avenidas × 1.ª/2.ª/3.ª parte con totales (tabla)**, fechas de colocación, permiso, observaciones |
| CREACIÓN BOLETERA.docx | ya es el módulo Boletera (`lib/boletera-pdf.ts`); plantilla `BOLETERA` se retira (inactiva) |
| ORDEN DE COMPRA.xlsx (×2, misma plantilla) | ya es el módulo Órdenes de compra (`lib/po-pdf.ts`); plantilla `ORDEN_COMPRA` se retira |

## Criterios de éxito
- [x] `apps/api/src/common/format-schema.ts`: contrato único (tipos check/text/longtext/number/date/time/yesno/select/table/attachment), enlace al evento, avance, display, migración de valores.
- [x] `apps/api/src/checklists/format-catalog.ts`: los 7 formatos estándar, fieles a los Word/Excel del cliente, con ids estables (los módulos Hospedaje/Transporte/Prensa/Artes siguen leyendo `nombre`, `contacto`, `prov`, `vans`…).
- [x] PDF servidor (`checklist-pdf.service.ts`): logo + pie del cliente, encabezado del show en rejilla, casillas a dos columnas, SÍ/NO, tablas con totales, adjuntos con link, firmas; mapa de campos para capturar sobre la hoja.
- [x] Avance y diff entienden los tipos nuevos; `optional` no cuenta vacío.
- [x] Al crear evento o formato, el encabezado se rellena solo desde el evento.
- [x] `scripts/upgrade-format-templates.ts`: sube plantillas a v2 (con snapshot), migra formatos en borrador conservando respuestas, retira duplicados, regenera PDFs. `--dry` / `--confirm-produccion`.
- [x] Web: captura de todos los tipos (tabla con filas/totales, SÍ/NO, hora, adjunto desde el propio formato), editor de plantillas con los tipos nuevos.
- [x] tests: jest API 227/227 (nuevos: format-schema, format-catalog, checklist-pdf.service) · e2e `checklist-pdf.spec.ts` 3/3.
- [x] producción (23-09): desplegado `7c01296` por bundle, `upgrade-format-templates.ts` corrido en el contenedor (`--dry` y real): 47 formatos migrados, 9 sellados intactos, 5 plantillas retiradas. Respaldo `20260924-0345.sql.gz`.
- [ ] verificación manual con sesión real: Adam abre un evento en producción → Formatos → 7 formatos y sus PDFs. Docker local sigue sin arrancar; cuando levante, correr el script ahí también.

## Contexto mínimo a cargar (≤7 archivos)
- `apps/api/src/common/format-schema.ts`
- `apps/api/src/checklists/format-catalog.ts`
- `apps/api/src/checklists/checklist-pdf.service.ts`
- `apps/web/components/events/EventChecklistsPanel.tsx`
- `apps/web/components/events/ChecklistFieldControls.tsx` (SÍ/NO, adjunto, tabla)
- `apps/api/scripts/upgrade-format-templates.ts`
- `docs/FORMATOS.md`

## Archivos a tocar (máx 12)
| Archivo | Acción | Notas |
|---------|--------|-------|
| `apps/api/src/common/format-schema.ts` | nuevo | contrato |
| `apps/api/src/checklists/format-catalog.ts` | nuevo | catálogo v2 |
| `apps/api/src/checklists/checklist-pdf.service.ts` | reescrito | pdfkit, brand en `apps/api/assets/brand` |
| `apps/api/src/common/checklist-progress.ts` · `doc-diff.ts` | editar | delegan en format-schema |
| `apps/api/src/checklists/checklists.controller.ts` · `events/events.controller.ts` | editar | `bindFormatToEvent` al instanciar |
| `apps/api/prisma/seed.ts` | editar | usa el catálogo; no pisa plantillas editadas |
| `apps/api/scripts/upgrade-format-templates.ts` | nuevo | migración |
| `apps/web/components/events/event-detail.types.ts` | editar | tipos |
| `apps/web/components/events/EventChecklistsPanel.tsx` + `ChecklistFieldControls.tsx` | editar/nuevo | captura |
| `apps/web/components/files/ChecklistPdfEditor.tsx` · `checklists/TemplateSchemaEditor.tsx` · `app/(app)/checklists/page.tsx` | editar | tipos nuevos |
| `apps/web/app/(app)/hospitality/page.tsx` | editar | columna Desayuno en vez de Habitaciones |
| `apps/web/styles/_hub.scss` | editar | tabla, SÍ/NO, adjunto, nota |

## Pasos numerados (hiperdetallados)
1. Contrato (`format-schema.ts`) → catálogo (`format-catalog.ts`) → pruebas de forma (ids únicos, encabezado con `bind`, columnas válidas).
2. PDF: reescribir `generate()` con layout propio (y manual), brand desde `apps/api/assets/brand`, mapa de campos para check/value; tablas y adjuntos solo en formulario.
3. Avance/diff: `isItemComplete` y `itemDisplay` delegan en `format-schema`.
4. Instanciación: `bindFormatToEvent(template.schemaJson, event)` en `events.controller` (alta) y `checklists.controller` (`from-template`).
5. Seed: 7 estándar desde el catálogo; los demás con `active`; en `update` no pisar plantillas con `version > 1` (editadas en la UI).
6. Script de upgrade (ver criterios). Corre en Docker: `docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry`.
7. Web: tipos; panel con controles nuevos; `onUpload` devuelve el archivo para enlazarlo al ítem adjunto; editor de plantillas; página de plantillas; estilos.
8. Regenerar fixtures e2e (`apps/web/e2e/fixtures/README-regenerar.ts.txt`) porque cambió el diseño del PDF.

## Resto para Cursor (lo que Claude deja abierto)
- Levantar Docker local, correr el script de upgrade (`--dry` y luego real), abrir un evento y revisar visualmente los 7 PDFs con la sesión de Adam. Ajustar espaciados si algo se corta.
- Correr `npm -w apps/web run test:e2e -- checklist-pdf` tras regenerar fixtures.
- Producción: `git bundle` + `bash deploy/update.sh --no-pull` (ver RELEVO) y luego el script de upgrade en el contenedor de producción con `--confirm-produccion`.

## Tests / verificación
```powershell
npm -w apps/api run test -- --runInBand format checklist doc-diff
npx -w apps/api tsc --noEmit -p apps/api/tsconfig.json
npx -w apps/web tsc --noEmit -p apps/web/tsconfig.json
# PDFs de muestra (sin base): apps/api/scripts/render-format-samples.ts
```

## Workers (Cursor los dirige; un writer por worktree)
- **NO_LLM** (rg / git / tests / lint / playwright):
- **LOCAL** — comando exacto, no una intención. Ej.:
  `pwsh -File C:\Users\adpoz\Projects\ai-oss-2026\scripts\ollama-worker.ps1 -Action digest -Repo "." -Max 120`
  `... -Action find -Repo "." -Query "..."` · `... -Action map -ItemsInline "..." -Prompt "... {{item}}"`
- **MCP / Firecrawl / n8n / Temporal**:

## Worktrees
(Si hay paralelismo: `pwsh -File C:\Users\adpoz\Projects\ai-oss-2026\scripts\worktree-new.ps1 -RepoPath . -Name <slice>`)
-

## No hacer / riesgos
- No cambiar ids de ítem del catálogo (los índices por módulo los leen) ni bajar `STANDARD_FORMAT_VERSION`.
- No editar las plantillas estándar a mano en la UI para «subirlas»: eso lo hace el script con snapshot.
- El script no toca formatos aprobados/sellados/autorizados; no forzarlo con `--include-signed` (no existe a propósito).
- Docker Desktop en esta máquina a veces no levanta el motor: matar procesos y relanzar; nunca «Reset to factory defaults» (borra la base).
- Los estilos nuevos van en `styles/_formats.scss` (no en `_hub.scss` como decía el plan).

## Handoff a Cursor
(Una sola frase de arranque. `packet.ps1 handoff` la copia al portapapeles junto con el boot.)
Implementa `.ai/EXEC-PACKET.md` de ARTA-app paso a paso sin cambiar la arquitectura; cierra con relevo.

