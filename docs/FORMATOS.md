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
| CHECKLIST RUEDA DE PRENSA.xlsx.docx | `RUEDA_PRENSA` | Datos de la RP, encargados de venue / audio / coffee break, banners · pantallas · identificadores **SÍ/NO**, **medios confirmados en tabla**, observaciones |
| CHECKLIST INFO ARTES SHOWS.docx | `ARTES_SHOWS` | Promotoras, boletera, patrocinadores, extras; **5 entregables como adjunto** (FB 1350, IG 1440, Story 1920, precios, reel); fechas de solicitud y de cambio; quién autorizó |
| DISTRUIBUICION PENDONES.xlsx | `PENDONES` | Ciudad + **avenidas × primera / segunda / tercera parte con totales por columna y total general**, fechas de colocación, permiso de vía pública SÍ/NO |
| CREACIÓN BOLETERA.docx | Módulo **Boletera** del evento (`lib/boletera-pdf.ts`) | Ya existía y reproduce el machote; la plantilla-checklist `BOLETERA` se retira |
| ORDEN DE COMPRA.xlsx (dos copias, misma plantilla) | Módulo **Órdenes de compra** (`lib/po-pdf.ts`) | Ya existía con el machote; la plantilla-checklist `ORDEN_COMPRA` se retira |

Los «BOTÓN» del Word (rider, layout, party A/B, confirmaciones, artes) eran un
archivo aparte. Ahora son un **adjunto del propio formato** (se sube desde el
campo o se elige entre los adjuntos del formato) o una **tabla** que se llena
renglón por renglón. El PDF los imprime: la tabla con sus totales, el adjunto
con su nombre o como link clicable.

## Dónde vive

- **Contrato** de campos: `apps/api/src/common/format-schema.ts`. Tipos:
  `check` (con `note`), `text`, `longtext`, `number`, `date`, `time`, `yesno`,
  `select`, `table` (`columns`, `rows`, `minRows`, `total`), `attachment`
  (`value` = nombre o link, `fileId` = adjunto del formato), `signature`.
  `optional: true` = vacío no resta avance. `bind` = se rellena desde el evento.
- **Catálogo** de los siete formatos: `apps/api/src/checklists/format-catalog.ts`
  (`STANDARD_FORMATS`, `STANDARD_FORMAT_VERSION`, `RETIRED_TEMPLATES`). Los ids
  de ítem son estables: los índices por módulo (Hospedaje, Transporte, Prensa,
  Artes) leen `nombre`, `contacto`, `desayuno`, `prov`, `vans`, `modelo`,
  `venue`, `hora`, `ciudad`, `promotores`, `boletera`, `sponsors`.
- **PDF**: `apps/api/src/checklists/checklist-pdf.service.ts`. Carta, logo y
  banda de pie tomados de los propios Word del cliente
  (`apps/api/assets/brand/`), encabezado del show en rejilla, casillas a dos
  columnas, SÍ/NO, tablas con totales, adjuntos con link, firmas ENTREGADO /
  AUTORIZADO, folio «Página n de N». Deja el mapa de campos para capturar sobre
  la hoja (las tablas y adjuntos se capturan en el formulario).
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

## Poner al día una base que ya existía

```bash
# En el contenedor del API (local o producción)
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts --dry
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/upgrade-format-templates.ts
```

Qué hace: sube las siete plantillas a la versión del catálogo (snapshot en
«Versiones anteriores», auditoría), migra los formatos en **borrador o en
revisión y sin firma de autorización** conservando lo capturado por id de ítem,
rellena el encabezado desde el evento, guarda la versión anterior y regenera el
PDF; retira las plantillas duplicadas (`--keep-duplicates` para no hacerlo).
Los formatos aprobados, sellados o autorizados **no se tocan**. Fuera de una
base local exige `--confirm-produccion`.

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
  migración de respuestas (casilla → SÍ/NO, ids que cambian de sección).
- `format-catalog.spec.ts`: siete formatos, encabezado enlazado, ids únicos,
  columnas válidas, ids estables por módulo, los 42 puntos de Evento general.
- `checklist-pdf.service.spec.ts`: el generador real imprime cada formato y
  deja un campo por dato capturable, todo dentro de la hoja; con 40 renglones y
  firmas pagina.
- `apps/web/e2e/checklist-pdf.spec.ts` usa fixtures del generador real; se
  regeneraron con este diseño (`e2e/fixtures/README-regenerar.ts.txt`).
