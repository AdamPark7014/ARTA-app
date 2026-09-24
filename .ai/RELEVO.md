# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-24
- **Rama:** main

## Hecho en este turno
### Campaña y Corrida — machotes estándar + generación y pruebas (24-09 noche)
- Registrar machotes desde repo: `register-format-sources.ts` ahora copia también
  `CAMPANA_BASE.xlsx` → `/uploads/format-campaign.xlsx` y `CORRIDA_BASE.xlsx` →
  `/uploads/format-corrida.xlsx`. Si los assets no están en el repo, genera un
  fallback con encabezado, merges y fórmulas estándar (sirve para CI).
- API:
  - Endpoint `POST /finance/event/:id/generate` movido a `FinanceExcelController` y
    registrado en `FinanceModule`.
  - `CampaignsController.exportExcel` usa `CampaignExcelService` (machote estándar).
- Scripts:
  - `scripts/generate-missing-campaign-and-corrida.ts` — (dry/confirm) genera campaña
    y/o corrida solo cuando el evento no tiene archivo aún. PDF oficial vía `ExcelPdfService`.
- Web:
  - `EventFinancePanel`: botón «Generar corrida» cuando falta y hay permiso.
  - Importar campaña: `parseCampaignWorkbook` ahora entiende el encabezado estándar
    (CONCEPTO..POR PAGAR) además del formato viejo de Interna/Externa.
- Pruebas:
  - `src/uploads/excel-templates.spec.ts`: genera campaña/corrida desde machote, reabre
    con ExcelJS y valida merges, encabezados, fórmulas y PDF.

### Nuevo: crear e importar plantillas de formatos + Excel embebido (24-09 tarde)
- Backend (NestJS):
  - `POST /checklists/templates`: crea plantilla nueva (key `CUSTOM`) desde cero.
  - `POST /checklists/templates/import-docx`: importa `.docx` → esquema (encabezados a secciones, `Etiqueta:` a campos, listas a casillas, tablas a tabla). Heurística editable luego.
  - `POST /checklists/templates/import-xlsx`: importa `.xlsx` como plantilla Excel; se copia por evento como `EventFile` editable que abre en `SheetEditor`.
  - `POST /checklists/templates/:id/excel`: reemplaza el `.xlsx` base de una plantilla Excel.
  - `POST /checklists/event/:eventId/from-template`: ahora detecta plantilla Excel y crea el `EventFile` en vez del checklist.
  - Permisos: dirección (general/adjunta/super_admin) también gestiona plantillas.
  - Prisma: `ChecklistTemplate.excelTemplateUrl TEXT NULL` (migración `20260924064800_excel_template_url`).
  - Test API: smoke de creación de plantilla.
- Web (Next.js):
  - Plantillas: botón «Nuevo formato» (desde cero) + «Importar Word» + «Importar Excel». Las plantillas Excel muestran «Descargar plantilla» y «Reemplazar .xlsx».
  - Eventos: en Formatos, «Agregar formato» permite adjuntar una plantilla activa a un evento (crea checklist o Excel según tipo).
  - SheetEditor: «Vista con formato» (solo lectura) que respeta merges, anchos y estilos básicos vía `sheet_to_html`; mantiene guardado por celdas.

### Deploy bf03c56 + cleanup EventFiles + borrar escrito CAMPAÑA (2026-09-24 11:44 CT)
- Local/GitHub ya en `bf03c5697eb4ebae7f4a06c628ef56f3425e51c0` (PR #1 squash-merge). Working tree limpio; sin `salvar`.
- Servidor ya tenía el mismo tip (no hizo falta bundle). `bash deploy/update.sh --no-pull`.
- Respaldo: `/root/arta-backups/20260924-1741.sql.gz`. Contenedores recreados sanos.
- Salud: arta/auditorio `/` → 307 `/dashboard`; API Nest arrancó sin crash; `/ready` 200.
- Cleanup `cleanup-event-files.ts`: dry 39 candidatos (todos `createdById` null, PDFs checklist bajo `/uploads/checklists/`); confirm soft-delete 39.
  - ANDRES PARRA (cmt7m9eml0022t7t9ja185d0l): 13
  - Pasaje Siniestro (cmthgq6ix000l13xaiaoux19k): 13
  - YAHIR PUEBLA (cmues7mzc006yxr7rfl47j1h5): 13
  - Ningún archivo con autor ni Excel de finanzas tocado.
- Escrito (EventDocument, sin `deletedAt`) en ANDRES PARRA: hard-delete tras confirmar 1 match.
  - id `cmteypa5c0003uoby29qhkupn`, título mojibake `CAMPAÃ‘A ANDRES PARRA.xlsx - CAMPAÃ‘A`, v1, editado por Arturo Taja 2026-08-29. 0 DocRevision asociadas. Quedan 0 escritos en ese evento.
### Documentos/campaña — limpieza y candados (24-09 tarde)
- Documentos del evento ahora solo listan archivos subidos por una persona o salidas PDF
  oficiales: `events.controller` filtra `files` por `deletedAt: null AND (createdById IS NOT NULL OR kind='pdf')`.
- Candados post-subida en `uploads.controller`:
  - Editar (`PUT /uploads/:id/content`, `PATCH /uploads/:id/cells`) y borrar (`DELETE /uploads/:id`)
    un archivo que tenga `createdById` queda reservado a dirección (`isDirectionRole`).
  - El borrado sigue siendo reversible (`deletedAt`, `deletedById`), nunca hard-delete.
- PDF → editable (leer texto del PDF a Documento) ahora es solo para dirección:
  `documents.controller.create()` exige dirección cuando llega `sourceFileId`.
- Mojibake arreglado al mostrar nombres de archivo: `lib/text.ts::fixMojibake()` y aplicado
  en `FileRow` y `FileViewer` (CAMPAÃ‘A → CAMPAÑA en todas las listas y vistas).
- El Excel de campaña ya abría como hoja (SheetEditor); no se tocó su flujo.
- Pruebas API nuevas:
  - `uploads.controller.spec.ts`: no-dirección no puede borrar un archivo subido; dirección sí.
  - `documents.controller.spec.ts`: PDF→editable bloqueado para no-dirección.
- Script de limpieza seguro (SOFT-DELETE) de archivos basura/placeholder:
  `apps/api/scripts/cleanup-event-files.ts`.
  - Dry-run:
    ```
    ts-node --transpile-only apps/api/scripts/cleanup-event-files.ts --dry
    ```
  - Producir (marca `deletedAt`):
    ```
    ts-node --transpile-only apps/api/scripts/cleanup-event-files.ts --confirm-produccion
    ```
  - Criterios: `deletedAt IS NULL AND ((createdById IS NULL AND kind != 'pdf') OR fileName LIKE '%CAMPAÃ%')`.

Estado: tsc api/web verdes. Jest API 233/233. E2E web no se corrieron aquí (requieren `npx playwright install`).

**Formatos estándar desde la carpeta «FORMATOS ARTA» de Drive** (pedido de Adam, 23-09).
Guía completa en `docs/FORMATOS.md`; plan y reparto en `.ai/EXEC-PACKET.md`.

- Los 10 archivos de Drive (6 checklists Word, pendones Excel, boletera Word, OC Excel ×2;
  Adam los bajó a Descargas) se leyeron y se convirtieron en **7 formatos estándar** fieles
  al cliente: `EVENTO_GENERAL` (42 puntos), `PRODUCCION`, `HOSPEDAJE`, `TRANSPORTACION`,
  `RUEDA_PRENSA`, `ARTES_SHOWS`, `PENDONES`. Boletera y Orden de compra ya eran módulos
  con su PDF: sus plantillas-checklist duplicadas (y Corrida, Campaña, Anticipos) se
  retiran (inactivas; lo existente sigue abriendo).
- **Contrato único** `apps/api/src/common/format-schema.ts`: tipos `check` (con nota),
  `text`, `longtext`, `number`, `date`, `time`, `yesno`, `select`, `table` (columnas,
  renglones, totales), `attachment` (nombre/link + `fileId`), `signature`; `optional`;
  `bind` al evento. Avance (`checklist-progress`) y diff (`doc-diff`) delegan ahí.
- **Catálogo** `apps/api/src/checklists/format-catalog.ts` con ids estables para los
  índices por módulo (`nombre`, `contacto`, `desayuno`, `prov`, `vans`, `modelo`,
  `venue`, `hora`, `ciudad`, `promotores`, `boletera`, `sponsors`).
- **PDF reescrito** (`checklist-pdf.service.ts`, pdfkit): logo y banda de pie sacados de
  los propios Word del cliente (`apps/api/assets/brand/`), encabezado del show en rejilla,
  casillas a dos columnas, SÍ/NO, tablas con totales y total general, adjuntos con link,
  firmas, folio. Mapa de campos para capturar sobre la hoja (tablas/adjuntos: formulario).
- **Encabezado desde el evento**: al crear evento o formato, `bindFormatToEvent` llena
  show, fecha (zona México), hora, ciudad y venue.
- **Seed**: las 7 estándar salen del catálogo; ya **no reescribe** plantillas con
  `version > 1` (editadas en Plantillas) ni reactiva las desactivadas.
- **Script** `apps/api/scripts/upgrade-format-templates.ts` (`--dry`,
  `--confirm-produccion`, `--keep-duplicates`, `--skip-instances`): sube plantillas con
  snapshot, migra formatos en borrador/revisión sin autorizar conservando respuestas,
  regenera PDFs, retira duplicados. `scripts/render-format-samples.ts` imprime los 7 sin base.
- **Web**: tipos en `event-detail.types.ts`; `ChecklistFieldControls.tsx` (SÍ/NO, adjunto
  que se sube o se elige desde el propio campo, tabla con filas y totales);
  `EventChecklistsPanel` capta todos los tipos, encabezado en rejilla, casillas a dos
  columnas con «+ nota»; `ChecklistPdfEditor` entiende hora y SÍ/NO; editor de plantillas
  con los tipos nuevos (columnas separadas por coma, `*` = suma); `styles/_formats.scss`;
  Hospedaje muestra Desayuno en vez de Habitaciones; `onUpload` del evento devuelve el
  archivo para enlazarlo al campo.
- Pruebas nuevas: `format-schema.spec`, `format-catalog.spec`, `checklist-pdf.service.spec`
  (+ casos en progreso y diff). Fixtures e2e regenerados con el generador nuevo.

### Verde
- `tsc --noEmit` api y web limpios; seed y scripts tipados aparte (limpios).
- jest API **227/227** (antes 198).
- e2e `checklist-pdf.spec.ts` **3/3** con build real de Next y los fixtures nuevos (el spec
  buscaba «Sobre el PDF» como botón y es pestaña desde el rediseño del 15-09; corregido).
  La captura del fallo confirmó que el panel pinta un formato viejo (texto/número/fecha)
  sin romperse.
- PDFs de muestra revisados a ojo (render en Node): logo, pie, tablas, SÍ/NO, firmas.

### Desplegado a producción (23-09-2026, 21:45-21:50 hora Puebla · 03:45 UTC 24-09)
Adam: «deploya». Bundle `9b40d6b..7c01296` por SSH (puerto 2222) y
`bash deploy/update.sh --no-pull` (incluye la «Quinta vuelta» de textos limpios que
esperaba visto bueno). Antes: `docker builder prune` (6.4 GB; disco 78 % → 70 %).
- Respaldo automático: `/root/arta-backups/20260924-0345.sql.gz`. Rollback:
  `bash deploy/rollback.sh --dump 20260924-0345.sql.gz`.
- Seed en el arranque: «6 plantillas sembradas · 7 respetadas» (respetó Evento General,
  que Arturo había editado el 24-08, y las legadas). API sin errores; arta y auditorio 200.
- `upgrade-format-templates.ts --dry` y luego `--confirm-produccion`: Evento General
  v2 → v3 (snapshot de la versión de Arturo, restaurable desde Plantillas); **47 formatos**
  en borrador/revisión migrados a v2 con PDF nuevo; **9 sellados intactos**; retiradas
  ORDEN_COMPRA, BOLETERA, CORRIDA_FINANCIERA, CAMPANA y ANTICIPOS (inactivas).
  CATERING y MANTENIMIENTO siguen activas.
- Un PDF regenerado de producción (ANDRES PARRA · Hospedaje) se bajó y revisó a ojo.

### Segunda vuelta: el formato como documento (23-09, 22:00)
Adam, con captura de producción: «se sobreponen; ¿por qué es PDF si quedamos que los que
son como PDF son Words hasta salir del sistema?». El modo «Sobre el PDF» dibujaba cajas
encima del valor ya impreso (se veía doble) y contradecía lo acordado.
- **`FormatSheet.tsx` + `_sheet.scss`**: el formato abre como la hoja misma (blanca, logo
  y pie del cliente, misma estructura que el PDF) y se llena en sitio. Modo por defecto;
  «Lista» queda como segundo modo. Tema claro propio dentro del panel oscuro (variables
  redefinidas en `.fsheet`; los inputs pisan `.shell input`).
- **Fuera** `ChecklistPdfEditor` (cajas sobre el PDF), sus fixtures y su spec. El API sigue
  dejando `pdfFieldsJson`; la web no lo usa.
- e2e nuevo `checklist-sheet.spec.ts` (hoja con marca, captura en sitio, modos) con
  fixture compartido `support/format-fixture.ts`; `layout.spec.ts` adaptado (y su selector
  del menú, que llevaba roto desde el rediseño del 15-09). **6/6** con build real.
- Capturas revisadas a ojo (Playwright): tabla en blanco, etiquetas en una línea.
- Commit `682fa5a`; **desplegado a producción 22:09** (bundle + `update.sh --no-pull`,
  respaldo automático del deploy); web y api sanos, `/brand/arta-logo-ink.png` 200.
- Adam (captura con la versión vieja, 22:06): «todos los formatos siguen siendo PDF; los
  verticales son Word y las cosas horizontales como campañas son Excel». Además el evento
  listaba **13 formatos** porque seguían los vacíos de las plantillas retiradas.
  **`checklist-visibility.ts`**: un formato de plantilla inactiva solo se lista si alguien
  lo empezó (avance, estado, firma o adjuntos); aplica al detalle del evento, a la lista
  por evento, al conteo de la lista de eventos, a los promedios de automatizaciones y
  resúmenes y al overview. No se borra nada. Commit `6d723e8`, **desplegado 22:13**;
  verificado a la mañana siguiente: api y web sanos 10 h, sin errores, ANDRES PARRA pasa
  de 13 a 9 formatos visibles (7 estándar + Catering + Mantenimiento).
- Pendones era Excel en Drive; en el documento va como tabla con totales. Si Adam lo
  quiere como Excel embebido (igual que la campaña), es trabajo aparte: generar el xlsx
  desde `campaign-sheet-template.ts`-style, abrirlo en `SheetEditor`, PDF por
  `/uploads/:id/pdf`.

### Tercera vuelta: campos que crecen, Excel editable, Catering y Mantenimiento con campos (24-09, 08:45)
Adam, con captura de «Anticipos y pagos» aún visible: «deberías poder ampliar los campos,
y más que palomitas colocar los campos necesarios; lo mismo con los Excel, les falta
accesibilidad a la edición».
- **Bug del filtro**: el PDF base que registra el alta es un `EventFile` del formato, así
  que `files: { some: {} }` hacía visibles todos. Ahora cuenta solo adjuntos con autor
  (`createdById` no nulo) y no borrados.
- **Campos que crecen**: `GrowingText` (textarea de una línea que se estira) para todo
  campo de texto en la hoja y en «Lista»; Enter no parte la línea, Shift+Enter sí.
- **Catering y Mantenimiento** pasan al catálogo v2 con campos y tablas (ya no son listas
  de casillas); fuera del seed legado. El script de upgrade los migra igual que al resto.
- **Excel**: la Corrida abre en `SheetEditor` (variant `finance`) para quien puede editar,
  guardando por celdas y con «Salir en PDF»; la Campaña abre ya en modo editar sin pedir
  «Ver / Editar». Celdas más altas (`padding 0.5rem`) y hoja hasta 72 vh.
  Ojo: esto revierte «no editar la corrida desde la página» de la junta del 11-09; manda
  lo que Adam pidió el 24-09.
- Verde: tsc api/web/seed/scripts; jest **229/229**.


### Desplegado a producción (24-09-2026, ~09:02 hora Puebla · 15:02 UTC)
Manager de Arta (Grok Bot): sync local→GitHub (1441860..e7d27f6, 9 commits) y bundle
6d723e8..e7d27f6 + `deploy/update.sh --no-pull`. Respaldo
`/root/arta-backups/20260924-1502.sql.gz`. API y web sanos; sitios 307→/dashboard.
`upgrade-format-templates.ts --confirm-produccion`: 9 formatos migrados (Catering ×6,
Mantenimiento ×2, Transportación ANDRES PARRA); 11 sellados intactos. Anticipos ya no
cuenta el PDF base como «empezado». Campos GrowingText y Excel editable (Corrida/Campaña)
en vivo.

## A medias

1. **Revisión visual con sesión real en producción**: Adam abre un evento (ANDRES PARRA,
   Pasaje Siniestro o YAHIR PUEBLA) → Formatos → los 7 formatos y sus PDFs; el agente no
   teclea contraseñas. Los avances cambiaron al migrar (los formatos nuevos tienen más
   campos): es esperado, no un bug.
2. **Docker local no arrancó** en toda la sesión (WSL `docker-desktop` `Stopped` incluso
   tras matar procesos y relanzar). La base local sigue con las plantillas viejas: cuando
   levante, correr el script de upgrade también ahí (`--dry` y real).

## Siguiente paso

1. Adam revisa los formatos en producción (ver «A medias» 1) y dice si algún espaciado o
   etiqueta del PDF no le convence.
2. Docker local: cuando arranque, `upgrade-format-templates.ts --dry` y real.
3. Decidir con Adam si CATERING y MANTENIMIENTO (no vienen de Drive) siguen activas.
4. Sigue pendiente de otras vueltas: deploy key de ARTA en GitHub (se despliega por bundle)
   y quitar los 5 eventos `[SEED_DEMO]` de producción con su visto bueno.

---

## Turno anterior (16-09-2026)

### Hecho

**Correcciones de la junta del 11-09-2026** (PDF «Correciones Dashboard ARTA 11 de SEP 2026»).
Mandato de Adam: simple, elegante y visualmente atractivo; nada de texto de más.

### Lenguaje visual nuevo (compartido)
- `styles/_refine.scss` + `components/ui/Lite.tsx`: SectionHead, Seg (secciones con
  contador), Pill/ReviewPill/ReviewFlow, EmptyLite, Tile, FileRow; tablas `.dtable` con
  celdas editables sin borde, `.fx` para formularios, `.savebar`, Gantt `.timeline` y
  calendario mensual `.mcal`. Estilos por módulo: `_campaign`, `_po`, `_ticketing`, `_chat`.
- `lib/pdf-kit.ts`: helpers pdf-lib (logo repintado en tinta — el PNG es blanco).
- `lib/price-list.ts`: la lista de precios interno/externo del PDF (págs. 4-5).

### 1. Evento
- Alta y edición con el mismo formulario (`components/events/EventFields.tsx`): «Evento»
  fusiona artista + nombre, «Fecha del evento», horario (abre/cierra), funciones, último
  día si son varias, venue, ciudad, promotor, descripción. Sin campaña.
- Prisma `Event`: `description`, `schedule`, `functions`.
- Cabecera nueva (`EventHero`): fecha, horario, lugar, cuenta regresiva; cerrar/cancelar/
  eliminar en «Más». Resumen con 4 mosaicos que llevan a su pestaña.
- La página del evento ya no cablea estado de OC/campaña/boletera/corrida/convenios:
  cada panel es autónomo (`EventPanelProps`: event, closed, onChanged, flash).

### 2. Corrida
- Sin «Nueva hoja de corrida» ni edición en página: un solo Excel, se ve embebido, se
  descarga y se reemplaza con versión (`PUT /uploads/:id/content`).

### 3. Órdenes de compra (agente)
- Se crean cualquier día. La config `poWindow` ahora son **días de cobro** (default
  L-M-V, marcador `kind: 'payDays'`; la config vieja se ignora). Marcar pagada fuera de
  día de cobro → 403, salvo dirección.
- Secciones Por autorizar · Por pagar · Pagadas · Todas (evento y portafolio).
- Partidas Cantidad | Descripción | Precio | Total; precio vacío (sin «0»); autocompleta
  precio interno desde la lista. Proveedor/Otro (`payeeType`), IVA 16 % (`withIva`),
  forma de pago Efectivo/Transferencia/Cheque (enum `CHEQUE`), observaciones.
- PDF con el machote del cliente (`lib/po-pdf.ts`).

### 4. Campaña
- Conceptos con cantidad, fechas, precio interno y externo; «Desde lista de precios».
- Vista Calendario (Gantt con hoy y día del show). Portafolio `/campaigns` con lista y
  calendario mensual; vuelve al menú.
- Estados Borrador → En revisión → Autorizada → Pagada (`Campaign.status`, `submittedAt`,
  `paidAt`; `authorized` se deriva). `POST /campaigns/event/:id/status {status, scope}`.
- «Generar campaña» = archivo de campaña (Excel con hojas Interna y Externa, versionado).
- Dos PDFs independientes: interna y externa (`lib/campaign-pdf.ts`).
- `POST /campaigns/event/:id` ahora FUSIONA `dataJson` por llave (conceptos y convenios
  escriben en la misma campaña).

### 5. Convenios
- Tabla Convenio | Descripción | Zona | Cantidad | Precio | Total (zona sugiere las de la
  boletera y trae su precio). Revisión propia (`Campaign.convenioStatus`). «Generar
  campaña de convenios» (Excel `CONVENIOS-*.xlsx`) + PDF. Patrocinadores plegados abajo.

### 6. Boletera (agente)
- «Creación de boletera»: artes (link), fecha, funciones, horario, venue, descripción,
  zonas (zona/aforo/precio), hold artista/promotor/venue. «Crear boletera y PDF» genera el
  PDF como el ejemplo del cliente. Sin sync, logo ni vendidos. `/ticketing` vuelve al menú.

### 7. Edición (quién edita)
- Rol nuevo `solo_carpetas` (sin operación de eventos, sin permisos).
- Williams y Juan Pablo → `solo_carpetas`. Leida y Sol (Marisol) empezaron en
  `gerente_arta` solo ARTA y el 16-09 subieron a `dir_adjunta` (ver «Cuarta vuelta»).
- Base viva: `scripts/apply-access-junta-0911.ts` (`--dry` primero). El seed ya lo trae
  para instalaciones nuevas. Aplicado en la base local de Docker.

### 8. Chat interno (agente)
- `/chat`: canal General + mensajes personales, no leídos, polling 4 s/10 s.
  Prisma `ChatMessage`, `ChatReadMarker`. API `/chat/*`.

### Seeder de credenciales (pedido de Adam, 15-09)
- `apps/api/scripts/seed-credentials.ts`: contraseña aleatoria por persona del equipo
  oficial (`@artaproducciones.com` + Rodrigo; `--all` para todos, `--only=` para algunos),
  guarda solo el hash, deja auditoría y escribe el Excel (Nombre, Correo, Contraseña, Rol,
  Entidades, Puede editar, Acceso). No imprime contraseñas. Pide `--yes`; si la base no es
  local exige `--confirm-produccion`. `--revoke` cierra sesiones.
- `.gitignore`: `credenciales/` y `*credenciales*.xlsx` nunca entran al repo.
- Corrido SOLO en Docker local (9 personas); el Excel se entregó a Adam por el chat, no
  vive en el repo.
- Las cuentas duplicadas `@arta.mx` de la base local y Melissa ya se quitaron (16-09,
  ver «Cuarta vuelta»).

### Segunda vuelta: más intuitivo (revisión propia, 15-09)
- **Campaña → Orden de compra:** con la campaña autorizada o pagada, «Crear OC» abre
  Órdenes de compra con las partidas a precio interno, rubro «Publicidad / campaña».
  Traspaso por `sessionStorage` (`poHandoffKey` en `lib/draft-store.ts`).
- **Excel → tabla:** «Actualizar tabla desde Excel» en el archivo de campaña
  (`parseCampaignWorkbook`): lo editado en Excel vuelve a la tabla, PDFs y calendario.
- **Borradores que no se pierden:** Campaña y Convenios guardan lo tecleado sin guardar
  en `sessionStorage` al cambiar de pestaña o recargar.
- **Candado en API:** conceptos (o convenios) en revisión/autorizados no se editan por
  `POST /campaigns/event/:id` hasta regresarlos a borrador.
- **Avisos:** enviar a revisión → dirección + gerencia de esa entidad; autorizar /
  regresar / pagar → a quien la envió; OC nueva → quien la puede autorizar.
- **Chat:** contador de no leídos en el menú (`useChatUnread`, 30 s + evento
  `arta:chat-read`) e icono propio.
- **Permisos:** `solo_carpetas` ya no ve «Tareas» ni puede crear tareas.
- `docker-compose.yml`: `TZ=America/Mexico_City` en api y web.
- Pruebas nuevas: `campaigns.controller.spec.ts` (candado, fusión de convenios, avisos,
  quién autoriza).

### Tercera vuelta: menos fricción visual (15-09, tarde)
Adam: «aún siento mucha fricción visual en algunos módulos, medio sucios o poco intuitivos».
- **Inicio** (`dashboard/page.tsx`): saludo + 4 mosaicos clicables (próximos 14 días,
  por pagar, tareas, formatos por autorizar) + «Próximos shows» y «Requiere atención».
  Fuera: portfolio neto, gráficas, márgenes, cuellos de botella y bitácora (siguen en sus
  módulos).
- **Eventos** (`events/page.tsx`): una tarjeta por show (fecha apilada, lugar, avance,
  píldora solo si hay algo que atender) + Seg Actuales/Pasados/Todos + buscar + Crear.
  Fuera el tablero por estado y la tabla duplicada.
- **Carpetas** (`folders/page.tsx`): tarjetas de carpeta; al abrir, archivos como
  FileRow con Ver/Editar/Abrir. El alta de carpeta ya no está siempre desplegada.
- **Calendario** (`calendar/page.tsx`): el mismo `MonthCalendar` de Campañas.
- **Marco** (`AppShell`): pie del menú = persona + iconos (esconder menú, salir); fuera el
  texto de alcance del rol, el badge de entidad de la barra y la pista del auto-ocultar.
- **Formatos** (`EventChecklistsPanel`): lista con filtro (Todos / Por completar / En
  revisión / Listos) y, al abrir, cabecera compacta + secciones plegables con casillas
  grandes. Firmas, PDF, adjuntos e historial ya no son cuatro bloques siempre abiertos:
  salen de «Más» como cajón. Estilos en `styles/_hub.scss` (los dejó un agente que se
  colgó antes de escribir el panel; el selector `ChecklistPicker` también es suyo).
- **Documentos** (`EventFilesPanel`): una lista con filtro por sección; el editor o la
  vista previa se abren bajo el archivo, no en paneles apilados arriba. Fuera las cuatro
  tarjetas de creación con microcopy: subir, importar Word y «+ Documento» en la cabecera.
- **Tareas** (`EventTasksPanel` + `styles/_tasks.scss`): una línea para pedir algo,
  secciones Abiertas / Por aprobar / Hechas, y la fila se abre para responsable, fecha,
  entrega, aprobación e historial.
- `styles/_home.scss`: estilos de lo anterior + capa de limpieza para pantallas viejas
  (oculta pistas largas, pasos numerados y «Qué pasa después»; badges sin mayúsculas;
  paneles con el aire de `.surface`).

### Cuarta vuelta: dirección adjunta y limpieza de usuarios (16-09, noche)
Adam: «dale los mismos permisos a Leida y Marisol de Arturo y José Luis excepto gestión
de usuarios, quita a Melissa y elimina usuarios duplicados tanto de db local como de
pública».
- **Rol nuevo `dir_adjunta` («Dirección adjunta»)**, Arta + Auditorio. `hasPermission` le
  da todo salvo `users.manage` (incluido `everything`); su tabla guarda los 13 permisos
  asignables, **nunca** `everything` ni `users.manage` (hay prueba que lo cuida).
- **`isDirectionRole(roleKey)`** en `roles.ts` (super_admin, dir_general, dir_adjunta)
  sustituye las comparaciones literales con `'dir_general'` en el API: reabrir/eliminar
  evento, quitar sello de corrida, firmar «Autorizado», ver todas las carpetas, días de
  cobro, aprobar tareas, autorizar campaña. Listas de roles: doc-guards (aprobar/sellar),
  resúmenes, avisos de campaña y vista de tareas del equipo.
- **Gestión de usuarios** se queda en dir_general: `/users` ya exigía `users.manage`;
  `organizations` e `org-invites` pasaron de «`users.manage` o `everything`» a
  `users.manage` a secas (no cambia a nadie existente). Días de cobro
  (`PATCH /purchase-orders/window`) pasó de `users.manage` a `everything`.
- Web: `dir_adjunta` en Tareas, Configuración, Auditoría, Webhooks y Resúmenes; no ve
  Usuarios ni Organizaciones. La página Usuarios ya no se abre con `everything`, y
  «Ir a Usuarios» en Seguridad solo sale a quien tiene `users.manage`.
- **Ojo al agregar controles nuevos:** si algo es «solo dirección», usa
  `isDirectionRole`; si es altas/bajas de gente, `users.manage` a secas. Con
  «`users.manage` o `everything`» la dirección adjunta entra.
- `scripts/apply-access-junta-0911.ts`: Leida y Marisol → `dir_adjunta` [ARTA+EXPLANADA];
  ahora también **cierra las sesiones** de quien cambia (antes era un paso aparte).
- **`scripts/remove-duplicate-users.ts`** (`--dry`; fuera de local exige
  `--confirm-produccion`): una cuenta `@arta.mx` con gemela oficial del mismo nombre
  hereda todo lo que tenga colgado (columnas FK hacia `User` leídas de
  `information_schema`, más el chat) y se borra; Melissa se borra sin heredero. Una
  `@arta.mx` sin gemela no se toca; nombres repetidos entre cuentas oficiales solo se avisan.
- **Local aplicado:** Leida y Marisol en `dir_adjunta`; borradas arturo, chacho, jp,
  leida, williams y melissa `@arta.mx` (solo tenían su membresía de organización). Quedan
  los mismos 9 usuarios que en producción.
- Melissa sigue nombrada en `docs/ACCESS.md` (No tocar) y en `SEED_PASS_MELISSA` de
  `docker-compose.yml` (variable muerta, el seed no la lee; es una contraseña y cae en el
  veto de credenciales). No se tocaron.

### Quinta vuelta: textos limpios en admin (16-09, noche)
Adam, con captura de Usuarios: «que los roles no digan cosa_cosa… lo mismo con webhooks y
con la auditoría como user.seeder, algo limpio».
- **Roles:** `ROLE_LABELS` en español llano y neutro (Dirección general, Dirección adjunta,
  Gerencia Arta, Dirección Auditorio, Logística y producción, Convenios y patrocinios,
  Enlace gobierno y pagos, Solo carpetas). `roleLabel()` en `roles.ts` nunca devuelve la
  clave con guion bajo. Usuarios (tabla, gráfica por rol, invitaciones, búsqueda) y
  Organizaciones ya no pintan `roleKey`.
- **«13 permisos extra»** era mentira: al asignar rol se guardan también los del rol.
  Ahora solo sale «+N permisos» si tiene algo además de su rol.
- **Auditoría:** `lib/audit-labels.ts` traduce todas las acciones vistas en local y
  producción (contraseña inicial, cambio de acceso, duplicados, tareas, campaña…); lo
  desconocido cae en «Movimiento en …», nunca en la clave. Fuera la clave cruda bajo la
  acción y la columna «Referencia» (IDs). `analytics.auditIntel` ya no cuenta
  `automation.scan`: en producción eran 1,271 filas de la revisión horaria.
- **Webhooks y Resúmenes:** sin jerga (endpoint, dispatch, HMAC, outbox, job runs,
  SMTP_HOST). Avisos con nombre («Órdenes de compra atrasadas», «Firmas pendientes»…) y
  estados con color propio en vez de reutilizar insignias de OC («Pagada» para un correo).
- Usuarios: Correo/Contraseña/enlace en vez de Email/Password/link.
- Verificado en Docker local con la sesión de Adam (Usuarios, Auditoría, Webhooks,
  Resúmenes): ningún texto con puntos o guiones bajos. **No desplegado a producción.**

### Migración
- `20260915090000_junta_0911` (enum CHEQUE, columnas nuevas, chat, backfill de campañas
  autorizadas). Aplicada en Docker local.

### Verde
- `tsc --noEmit` web y api limpios · jest API **198/198** (antes 174; +4 de `dir_adjunta`).
- Docker local: db 5439, api 4100, web 3100 (3000/4000/5432 los usa NEXARA; 5433 un
  Postgres nativo). Override en el scratchpad de la sesión, no en el repo.

#
### Desplegado a producción (24-09-2026, ~09:02 hora Puebla · 15:02 UTC)
Manager de Arta (Grok Bot): sync local→GitHub (1441860..e7d27f6, 9 commits) y bundle
6d723e8..e7d27f6 + `deploy/update.sh --no-pull`. Respaldo
`/root/arta-backups/20260924-1502.sql.gz`. API y web sanos; sitios 307→/dashboard.
`upgrade-format-templates.ts --confirm-produccion`: 9 formatos migrados (Catering ×6,
Mantenimiento ×2, Transportación ANDRES PARRA); 11 sellados intactos. Anticipos ya no
cuenta el PDF base como «empezado». Campos GrowingText y Excel editable (Corrida/Campaña)
en vivo.

## A medias (16-09)

1. **Sin revisión visual con sesión real**: el agente no teclea contraseñas; Adam entra en
   http://localhost:3100 y revisa. Los PDFs se probaron renderizando en Node (logo solo
   se ve en navegador).
2. Monse y Kika siguen en `logistica` (la lista del cliente no los menciona).
3. Reglas CSS viejas sin uso en `globals.scss`: `.po-card*`, `.po-next*`,
   `.po-form-section*`, `.po-proofs*`, `.ticket-card*`, `.ticket-form-section*`,
   `.ticket-zones*`, `.event-hint`, `.event-quick-actions`.
4. Pendientes previos que siguen: fórmulas al insertar filas en Excel embebido; backfill
   de avance de checklists; `TZ=America/Mexico_City` en el contenedor del API.

### Desplegado a producción (16-09-2026, 22:00 UTC)
- `arta.artaproducciones.com`, `auditorio.artaproducciones.com` y el sitio público
  responden 200. Migración `20260915090000_junta_0911` **aplicada** (26 en total),
  `ChatController` y `CampaignsController` registrados, sin errores en el arranque.
- ⚠️ **El servidor no tiene credenciales de GitHub para este repo**: `deploy/update.sh`
  falla en `git pull` («could not read Username»). Se desplegó llevando el código por
  `git bundle` vía SSH y corriendo `bash deploy/update.sh --no-pull`:
  ```
  git bundle create arta-main.bundle main   # local
  scp -P 2222 arta-main.bundle root@5.78.215.109:/root/
  # en el server, en /var/www/arta-app:
  git fetch /root/arta-main.bundle main && git merge --ff-only FETCH_HEAD
  bash deploy/update.sh --no-pull
  ```
  Arreglo de fondo: dar de alta una deploy key de ARTA en GitHub (el server ya tiene
  llaves para nexara, acrobat, family y zynoratek) y cambiar el remoto a SSH.
- Respaldo previo automático: `/root/arta-backups/20260916-2159.sql.gz`.
  Rollback: `bash deploy/rollback.sh` (imágenes `arta-web:prev` / `arta-api:prev`).
- Se apartó `apps/web/app/p/arta/noticias/[slug]/NewsDetailClient.tsx` (huérfano, sin
  imports, sin versionar) a `/root/arta-stale-NewsDetailClient.tsx.bak`; entraba al build.
- Se liberó caché de build de Docker (`docker builder prune`): el disco estaba al 86 %,
  quedó en 79 %. No se tocaron imágenes ni volúmenes.
- **Accesos de la junta aplicados en producción (16-09, con visto bueno de Adam):**
  `scripts/apply-access-junta-0911.ts` (simulación y luego real). Leida y Marisol →
  `gerente_arta` [ARTA]; Williams y Juan Pablo → `solo_carpetas` [ARTA+EXPLANADA], sin
  permisos extra. Verificado con una auditoría de solo lectura.
- **Sesiones cerradas** de Leida (2) y Marisol (5), con auditoría
  `user.sessions.revoked_access_change`: el JWT guarda rol, entidades y permisos, y sin
  cerrarlas el cambio no aplicaba hasta que expirara el token (7 días). Tendrán que volver
  a iniciar sesión. Williams y Juan Pablo no tenían sesiones.
- **Cuentas `@arta.mx` duplicadas: NO existen en producción** (solo 9 usuarios oficiales).
  Eran restos del seed viejo en la base local de Docker. No se desactivó nada.
- Williams tenía 3 tareas abiertas: **son de eventos de demostración**, no trabajo real.
- **Dirección adjunta en producción (16-09, 22:28 UTC):** desplegado `9b40d6b` por bundle
  (respaldo `/root/arta-backups/20260916-2228.sql.gz`; antes `docker builder prune`, disco
  83 % → 74 %). Los tres sitios responden 200, seed OK, API sin errores.
  `apply-access-junta-0911.ts` simulación y luego real: Leida y Marisol → `dir_adjunta`
  [ARTA+EXPLANADA], 13 permisos (sin `users.manage` ni `everything`), sesiones cerradas.
  `remove-duplicate-users.ts --dry` → «Sin duplicados ni cuentas a quitar (9 usuarios)»:
  en producción nunca hubo `@arta.mx` ni Melissa, no se borró nada.
- ⚠️ **5 de los 7 eventos en producción son demo del seed** (`notes` con `[SEED_DEMO]`:
  Cierre Temporada · CDMX, Noche Estelar · Puebla, Renta Boletera · Arena Night, Show
  Familiar · Domingo, Tour Centro · León), con 9 OC de ejemplo que inflan «Por autorizar» y
  «Por pagar». `seedDemoPortfolio()` los **vuelve a crear en cada arranque** si no
  encuentra ninguno: para quitarlos hay que (1) apagar el demo en producción en el seed
  (bandera o `NODE_ENV`), desplegar, y (2) borrar esos eventos. No se hizo nada: pendiente
  de visto bueno de Adam (borrar datos de producción no se deshace).

### Siguiente paso (16-09)

1. Desplegar la «Quinta vuelta» (textos limpios) cuando Adam dé el visto bueno: bundle +
   `update.sh --no-pull`, sin migraciones ni scripts.
2. Avisar a Leida y Marisol que vuelven a iniciar sesión y ya ven todo menos Usuarios
   y Organizaciones.
3. Arreglo de fondo del despliegue: deploy key de ARTA en GitHub (sigue por bundle).
4. Demo `[SEED_DEMO]` en producción: sigue esperando visto bueno de Adam.
5. Si en producción había ventana de OC guardada, revisar «Días de cobro» en Configuración.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
