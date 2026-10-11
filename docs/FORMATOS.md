# Formatos estándar (carpeta «FORMATOS ARTA» de Drive)

Pedido de Adam (23-09-2026): que los formatos que gerencia comparte en Drive
(`drive.google.com/drive/folders/1IJ_ntDodKv7dd2Jg6y6dTB7UG3cHA6yB`) sean los
**estándar del sistema** para cualquier evento; que se capturen **dentro** de
ARTA, que la única salida sea **PDF**, y que nadie tenga que bajar un Word o un
Excel, editarlo fuera y volverlo a subir.

## Qué es cada archivo de Drive y cómo queda

| Archivo en Drive | En el sistema | Cómo se captura |
|---|---|---|
| CHECKLIST EVENTO GENERAL.docx | Plantilla `EVENTO_GENERAL` | Encabezado del show + los 42 puntos del Word (agrupados), cada casilla con nota corta opcional |
| CHECKLIST PRODUCCIÓN.docx | `PRODUCCION` | Riders (adjunto), 8 empresas proveedoras y 8 encargados (texto), production managers, horarios (hora), **minuto a minuto en tabla**, layout (adjunto), observaciones |
| CHECKLIST HOSPEDAJE.docx | `HOSPEDAJE` | Hotel, enlace, desayuno **SÍ/NO**, **rooming de Party A y Party B en tabla** (nombre, habitación, check-in/out, confirmación, notas), confirmaciones del hotel (adjunto) |
| CHECKLIST TRANSPORTACIÓN.docx | `TRANSPORTACION` | Proveedor, contacto, camionetas, modelo, qué incluye, estatus, **traslados en tabla (opcional)**, observaciones |
| CHECKLIST RUEDA DE PRENSA.xlsx.docx | `RUEDA_PRENSA` | Datos de la RP, **convocatoria** (encargado, Drive de contenido para rueda), encargados de venue / audio / coffee break, banners · pantallas · identificadores **SÍ/NO**, **medios confirmados en tabla**, **timeline** antes / durante / después (hora, actividad, responsable), observaciones. Convocatoria y timeline: correcciones del 30-09-2026 (catálogo v3) |
| CHECKLIST INFO ARTES SHOWS.docx | `ARTES_SHOWS` | Promotoras, boletera, patrocinadores, extras; **5 entregables como adjunto** (FB 1350, IG 1440, Story 1920, precios, reel); fechas de solicitud y de cambio; quién autorizó |
| DISTRUIBUICION PENDONES.xlsx | `PENDONES` | Ciudad + **avenidas × primera / segunda / tercera parte con totales por columna y total general**, fechas de colocación, permiso de vía pública SÍ/NO |
| CREACIÓN BOLETERA.docx | Módulo **Boletera** del evento (`lib/boletera-pdf.ts`) | Ya existía y reproduce el machote; la plantilla-checklist `BOLETERA` se retira |
| ORDEN DE COMPRA.xlsx (dos copias, misma plantilla) | Módulo **Órdenes de compra** (`lib/po-pdf.ts`) | Ya existía con el machote; la plantilla-checklist `ORDEN_COMPRA` se retira |

Además, dos formatos que no vienen de Drive pero ya existían en el sistema como
listas de casillas se rehicieron con campos de verdad (Adam, 24-09: «más que
palomitas, colocar los campos necesarios»): **Catering y Camerinos**
(`CATERING`: proveedor, contacto, personas, menú, restricciones, horarios de
servicio en tabla, camerinos en tabla) y **Mantenimiento (Auditorio)**, que el
11-10-2026 se rehízo con el Excel del propio Auditorio (ver abajo).

## ARTA y Auditorio: cada uno con sus formatos (11-10-2026)

Con la separación por entidad (`docs/entidades-arta-auditorio.md`) los ocho
formatos de Arta (`EVENTO_GENERAL`, `PRODUCCION`, `HOSPEDAJE`,
`TRANSPORTACION`, `RUEDA_PRENSA`, `ARTES_SHOWS`, `PENDONES`, `CATERING`) y el
libro «Distribución de Pendones (Excel)» van **solo a eventos de Arta**
(`entities: ['ARTA']`). Ninguno está documentado como compartido. El Auditorio
(`EXPLANADA`) tiene los suyos, tomados de sus documentos:

| Documento del Auditorio | Plantilla | Cómo se captura |
|---|---|---|
| CHECKLIST AUDITORIO.xlsx · hojas AUDITORIO y MERCH | `CHECKLIST_AUDITORIO` «Checklist Auditorio» | Encabezado (evento, showtime y empresa/promotor desde el evento; boletera). **Producción**: load in, load out y soundcheck (hora), rider y minuto a minuto (adjunto), encargado, pirotecnia / papirotecnia / CO2 (SÍ/NO). **Camerinos**: horarios, cuántos, quick change y catering caliente (no gas) SÍ/NO. **Merch**: SÍ/NO, porcentaje a cobrar, operador y contacto merch del talento (la hoja MERCH). **Prensa**: cuántos medios, cuántas canciones, encargado por promotor. **Venue**: permisos, contrato (adjunto), apertura de puertas y de sala, término del show (hora), capacidad esperada |
| CHECKLIST AUDITORIO.xlsx · hoja LIMPIEZA | `LIMPIEZA` «Checklist Limpieza» | Evento, showtime y capacidad; **tabla** Actividad · Responsable · Horario · Estatus · Observaciones que nace con las 15 áreas de la hoja |
| CHECKLIST AUDITORIO.xlsx · hoja MANTENIMIENTO | `MANTENIMIENTO` «Checklist Mantenimiento» (sustituye al de antes) | **Tabla** Actividad · Responsable · Fecha de supervisión · Observaciones · Cambios · Fecha de solicitud · Fecha de entrega con las 20 áreas; los «botones para foto» de Observaciones y Testigos son **dos adjuntos por área** (sección «Fotos: observaciones y testigos», opcionales) |
| Compromiso de horarios — Día del show (Word) | `COMPROMISO_HORARIOS` | Encabezado (evento, fecha, productor / empresa desde el evento; encargado de producción); **tabla** Concepto · Horario comprometido · Hora real · Observaciones con los 10 renglones del Word (el vacío queda para un concepto libre); **Condiciones** (las 8, palabra por palabra) y **Aceptación** como texto fijo; cargo por extensión de desmontaje (hora límite y costo por hora o fracción); firmas **Producción externa** y **Auditorio Explanada Puebla** |

Decisiones:

- **Fotos**: una celda de tabla no lleva archivo; el tipo que existe para eso es
  `attachment` (un archivo o un link por campo: la foto desde el teléfono, un
  PDF o el link a un álbum). Cada área de Mantenimiento tiene «foto de
  observaciones» y «testigos (fotos)».
- **Listas que trae la plantilla** (áreas, conceptos): la primera columna es
  `prefilled`; esos renglones no cuentan como captura, así que un formato recién
  creado no sale «completo». En la hoja la celda parte renglón y sigue editable.
- **Texto fijo** (`paragraph`): condiciones y aceptación se imprimen tal cual
  (viñetas si son varios), no se capturan ni puntúan.
- **Firmas**: son las mismas dos firmas digitales (ENTREGADO / AUTORIZADO); el
  formato les pone nombre en su sección `firmas`. Producción externa firma en el
  pad de Entregado (el pad deja escribir el nombre de quien firma) y el
  Auditorio en Autorizado (lo permite dirección o `dir_auditorio` en eventos del
  Auditorio).
- **Versiones por formato**: `STANDARD_FORMAT_VERSION` es 4, pero cada formato
  guarda la suya (`formatVersion`): los de Arta siguen en 3, así que el script
  no reescribe sus formatos vivos.

Los «BOTÓN» del Word (rider, layout, party A/B, confirmaciones, artes) eran un
archivo aparte. Ahora son un **adjunto del propio formato** (se sube desde el
campo o se elige entre los adjuntos del formato) o una **tabla** que se llena
renglón por renglón. El PDF los imprime: la tabla con sus totales, el adjunto
con su nombre o como link clicable.

## Dónde vive

- **Contrato** de campos: `apps/api/src/common/format-schema.ts`. Tipos:
  `check` (con `note`), `text`, `longtext`, `number`, `date`, `time`, `yesno`,
  `select`, `table` (`columns`, `rows`, `minRows`, `total`; columna
  `prefilled` = la escribe la plantilla), `attachment` (`value` = nombre o
  link, `fileId` = adjunto del formato), `signature` (su `label` nombra la
  firma), `paragraph` (texto fijo: el texto es `label`).
  `optional: true` = vacío no resta avance. `bind` = se rellena desde el evento.
- **Catálogo** de los formatos de Arta y del Auditorio: `apps/api/src/checklists/format-catalog.ts`
  (`STANDARD_FORMATS`, `STANDARD_FORMAT_VERSION`, `RETIRED_TEMPLATES`,
  `EXTRA_TEMPLATE_ENTITIES`). Los ids
  de ítem son estables: los índices por módulo (Hospedaje, Transporte, Prensa,
  Artes) leen `nombre`, `contacto`, `desayuno`, `prov`, `vans`, `modelo`,
  `venue`, `hora`, `ciudad`, `promotores`, `boletera`, `sponsors`.
- **PDF**: `apps/api/src/checklists/checklist-pdf.service.ts`. Carta, logo y
  banda de pie tomados de los propios Word del cliente
  (`apps/api/assets/brand/`), encabezado del show en rejilla, casillas a dos
  columnas, SÍ/NO, tablas con totales, adjuntos con link, firmas ENTREGADO /
  AUTORIZADO, folio «Página n de N». Deja el mapa de campos para capturar sobre
  la hoja (las tablas y adjuntos se capturan en el formulario).
- **Excel embebido (plantillas)**: una plantilla de checklist puede referir un
  `.xlsx` fuente (`excelTemplateUrl`). Al crear un evento (o al «Agregar
  formato» en un evento existente) se copia el libro al evento como `EventFile`
  editable en `SheetEditor` con salida oficial PDF: respeta merges, anchos,
  bordes y logos. Scripts:
  - `scripts/register-format-sources.ts` — copia originales a `/uploads` y crea
    “Distribución de Pendones (Excel)”. También registra machotes estándar de
    Campaña (`/uploads/format-campaign.xlsx`) y Corrida (`/uploads/format-corrida.xlsx`)
    leyendo de `apps/api/assets/format-sources/` cuando existen; si faltan en el repo,
    genera un fallback con el encabezado y las fórmulas estándar (sirve para pruebas/CI).
  - `scripts/upgrade-excel-templates.ts` — agrega los Excel a eventos ya
    existentes (dry-run y confirm).
  - `scripts/generate-missing-campaign-and-corrida.ts` — genera campaña/corrida
    para eventos que aún no tienen archivo (NUNCA sobreescribe). Soporta `--dry`
    y `--confirm-produccion`.
- **Encabezado desde el evento**: al crear un evento (`events.controller`) o un
  formato desde plantilla (`checklists.controller`), `bindFormatToEvent` llena
  show, fecha, hora, ciudad y venue. Lo que la persona escriba después manda.
- **Web**: el formato abre como **documento** (`components/events/FormatSheet.tsx`
  + `styles/_sheet.scss`): la hoja blanca con la marca, la misma estructura que
  el PDF, y cada dato se escribe en su sitio. Es lo acordado con Adam: lo que era
  Word se ve y se llena como Word hasta que sale en PDF. «Lista» es el segundo
  modo (captura compacta, `EventChecklistsPanel.tsx`). Controles compartidos en
  `ChecklistFieldControls.tsx` (SÍ/NO, adjunto, tabla). Ya no existe «escribir
  sobre el PDF»: el PDF impreso no es superficie de captura (se veía doble).
  El editor de plantillas (`TemplateSchemaEditor`) conoce los tipos nuevos;
  para una tabla se escriben las columnas separadas por coma y `*` al final de
  la que se suma.

## Profesionalización de formatos (slots, reemplazo, branding, auditoría)

- Cada evento tiene “slots” de documento (6 checklists, Pendones, Campaña, Corrida, Boletera; OC es por orden; además Adicionales).
- Un slot tiene UNA fuente activa: INTERNO (generado) o EXTERNO (subido). Estados: Pendiente, Borrador, En revisión, Autorizado (sellado), Reemplazado, Cancelado, Eliminado (UI).
- Reemplazo: subir externo pide confirmación + motivo; el interno queda archivado (no destruido) y el slot muestra “Reemplazado por documento externo (quién/cuándo/motivo)”. Botones de generación se deshabilitan. Tipos: checklists .docx (PDF final aceptado), campaña/corrida .xlsx, adicionales cualquier permitido. Si estaba Autorizado, solo dirección puede reemplazar. Revertir a interno: solo dirección y con motivo; todo auditado.
- Edición: internos editables por staff en Borrador/En revisión; tras Autorizado solo dirección puede reabrir (nueva versión). Externos: bloqueados tras subir (regla existente; edición/eliminación solo dirección). Editar Excel embebido crea nueva versión; el original se preserva.
- Versionado: cada guardado = vN con autor/fecha. PDF con folio `ARTA-<evento>-<FORMATO>-vN`, versión, generado por, fecha. Marca de agua BORRADOR hasta Autorizado. Nombre de archivo `<EVENTO>_<AAAAMMDD>_<FORMATO>_v<N>.pdf`.
- Salida: solo PDF para usuarios regulares. Originales (.xlsx/.docx) solo dirección (y se audita cada descarga).
- Branding: servicio único de branding PDF (encabezado/folio/pie). Aplica a todos los PDFs (internos y externos convertidos).
- Parámetros y formatos personalizados: campos a nivel plantilla (versionados, afectan futuros eventos) y campos extra por evento. Formatos custom con bloques y bindings a datos del evento (nombre, fecha, venue, ciudad, artista, promotor, zonas/precios, totales de OC y campaña).
- Borrado/recuperación: borrado suave con motivo; “Papelera” por evento para restaurar. Super_admin puede purgar con script.
- Auditoría: apéndice inmutable (sin update/delete). Se registra actor, rol, fecha, evento, slot, doc, versión, acción (create, generate, upload, replace, revert, edit con diffs, submit, authorize, reopen, pdf_generate, download_original, delete, restore, recreate, template_change), motivo, resumen antes/después, IP/UA. Vistas de Historial por documento y por evento, exportables en PDF.

Scripts:
- `backfill-document-slots.ts --dry|--confirm-produccion`: crea slots por evento sin tocar documentos.

Nota: los «formatos personalizados con data bindings» quedan diferidos a una fase posterior; esta PR deja el andamiaje (campos extra a nivel plantilla/evento) y la documentación.

## Qué se ve en pantalla

Al abrir un formato aparece la **hoja** (fondo blanco, marca, mismo orden que el
PDF) y se escribe directo: texto en su línea (la línea crece con lo que se
escribe), casillas, SÍ/NO, tablas renglón por renglón, adjuntos desde el propio
campo, firmas al pie.

Los **Excel** del evento (Corrida y Campaña) abren directamente en el editor de
hoja para quien puede editar: celdas amplias, barra de fórmulas, filas y
columnas, «Salir en PDF». Antes la corrida solo se consultaba y la campaña pedía
«Ver / Editar»; Adam (24-09): «a los Excel les falta accesibilidad a la edición». «Ampliar a pantalla
completa» la lleva a toda la ventana. «Guardar y generar PDF» imprime la salida;
«Ver el PDF» la enseña. El modo «Lista» es la misma captura en formulario
compacto, útil en pantallas chicas.

## Salida en PDF de los Excel

`apps/api/src/uploads/sheet-layout.ts` convierte la hoja de ExcelJS en un modelo
imprimible (celdas combinadas una sola vez, anchos y altos del libro, negritas,
rellenos, bordes, alineación, formatos de número, fórmulas calculadas con
`fast-formula-parser` cuando el libro no trae el resultado, imágenes ancladas a
su celda) y `excel-pdf.service.ts` lo dibuja con la marca común
(`pdf-branding.service.ts`: logo, entidad, título, evento, banda de pie y
«Página n de N»). La hoja se encoge para caber a lo ancho; si en vertical
quedaría por debajo del 72 % pasa a apaisado (o si el libro lo pide). Muestras
sin base: `scripts/render-sheet-samples.ts` (imprime los libros base de
`assets/format-sources`).

Lo que había antes repetía el título combinado en cada celda, ignoraba anchos y
estilos y dejaba una hoja en blanco al inicio: el pie se escribía en una `y`
fija fuera del margen apaisado y pdfkit abría página nueva. El servicio de marca
ahora pinta el pie con el margen inferior en cero y lo restaura (ver
`inFooterZone`). Ese mismo servicio de marca lo usan documentos, boletera e
historial; el PDF de checklists dibuja su propia primera página y no lo llama.

## Poner al día una base que ya existía

```bash
# En el contenedor del API (local o producción)
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts
# Registrar machotes (OC, Pendones, Campaña, Corrida)
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/register-format-sources.ts --confirm-produccion
# Generar campaña/corrida donde falten
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/generate-missing-campaign-and-corrida.ts --dry
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/generate-missing-campaign-and-corrida.ts --confirm-produccion
```

Qué hace: crea las plantillas estándar que falten, pone a cada una sus
entidades (Arta → `ARTA`, Auditorio → `EXPLANADA`, y el libro de Pendones Excel
→ `ARTA`), sube cada plantilla a la versión de **su** formato (snapshot en
«Versiones anteriores», auditoría), migra los formatos en **borrador o en
revisión, sin firma de autorización y de eventos abiertos** conservando lo
capturado por id de ítem, rellena el encabezado desde el evento, guarda la
versión anterior y regenera el PDF; retira las plantillas duplicadas
(`--keep-duplicates` para no hacerlo). Los formatos aprobados, sellados,
autorizados o de eventos cerrados/cancelados **no se tocan**. Si la forma nueva
dejaría fuera algo capturado (una tabla que ya no existe, «Campos adicionales»)
ese formato **no se migra** y se reporta; `--allow-data-loss` lo migra igual (lo
anterior queda en Versiones). Fuera de una base local exige
`--confirm-produccion`. Es idempotente: la segunda corrida no cambia nada.

### Formatos del Auditorio en eventos que ya existían (11-10-2026)

`--add-auditorio-formats` agrega a cada evento **abierto** del Auditorio
(ni cerrado ni cancelado; los `[SEED_DEMO]` se omiten salvo `--include-seed`)
los formatos del Auditorio que le falten, igual que «Agregar formato»
(encabezado desde el evento, avance y PDF). **No borra ni modifica** los
formatos que el evento ya tiene: si ya hay uno de esa plantilla, no crea otro.
`--event <id>` lo limita a un evento.

```bash
# 0) Desplegar: la migración 20261011150000_formatos_auditorio agrega las claves y el
#    seed del arranque crea las tres plantillas nuevas (y sube Mantenimiento si nadie lo editó).
# 1) Simulación: entidades, Mantenimiento y qué formatos se agregarían
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry --add-auditorio-formats
# 2) Aplicar
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --add-auditorio-formats --confirm-produccion
```

Los formatos de Arta que un evento del Auditorio recibió antes de la separación
se quedan donde están (el script no borra nada); se quitan a mano si sobran.

## El seed ya no pisa plantillas

`prisma/seed.ts` corre en cada arranque del contenedor. Antes reescribía todas
las plantillas (lo editado en «Plantillas» se perdía en el siguiente reinicio y
una plantilla desactivada volvía a activarse). Ahora solo crea las que faltan y
actualiza una estándar cuando **nadie la ha tocado** (`version` 1) y su
`formatVersion` es menor que la del catálogo. Subir una plantilla ya editada es
trabajo del script de arriba.

## Ver los PDFs sin base

```powershell
$env:OUT_DIR = 'C:\tmp\formatos'
npx -w apps/api ts-node --transpile-only scripts/render-format-samples.ts   # con datos de muestra
npx -w apps/api ts-node --transpile-only scripts/render-format-samples.ts --empty
```

## Pruebas

- `format-schema.spec.ts`: completitud por tipo, totales, enlace con el evento,
  migración de respuestas (casilla → SÍ/NO, ids que cambian de sección), listas
  `prefilled`, texto fijo, nombres de firma y `droppedFormatValues` (qué se
  perdería al migrar).
- `format-catalog.spec.ts`: los doce formatos y su entidad, encabezado enlazado,
  ids únicos, columnas válidas, ids estables por módulo, los 42 puntos de Evento
  general, y cada formato del Auditorio contra su Excel / Word.
- `apps/web/e2e/formatos-auditorio.spec.ts`: el Compromiso de horarios en la
  hoja (texto fijo, concepto largo completo, firmas con nombre).
- `checklist-pdf.service.spec.ts`: el generador real imprime cada formato y
  deja un campo por dato capturable, todo dentro de la hoja; con 40 renglones y
  firmas pagina.
- `apps/web/e2e/checklist-pdf.spec.ts` usa fixtures del generador real; se
  regeneraron con este diseño (`e2e/fixtures/README-regenerar.ts.txt`).
