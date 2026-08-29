# Documentos editables dentro del evento

Pedido de Adam (29-08-2026): que los Excel y PDF del evento se vean embebidos y
se puedan **editar ahí mismo**, escribiendo encima, como si abrieras Excel o un
PDF en tu computadora; y que haya algo tipo Word que **al descargarse salga en
PDF**.

Todo vive en la pestaña **Documentos** del evento (antes «Excel / PDF») y en la
sección de archivos de **Campaña**.

---

## 1. Hoja de cálculo editable

`components/files/SheetEditor.tsx`

Se abre el `.xlsx` real en una cuadrícula con letras de columna y números de
fila, se escribe en las celdas y **Guardar cambios** reconstruye el archivo y lo
reemplaza en el evento.

**Qué se conserva.** El libro original se mantiene en memoria y al guardar solo
se tocan las celdas que la persona editó, así que **las fórmulas y el formato de
las celdas que nadie tocó sobreviven**. Si escribes encima de una fórmula, esa
celda pasa a ser un valor fijo — exactamente lo que hace Excel.

**Qué no hace.** No calcula fórmulas nuevas: si escribes `=A1+B1`, se guarda ese
texto, no el resultado. Tampoco edita estilos (colores, bordes, anchos).

Hojas múltiples: se listan todas y se edita la activa.

## 2. Escribir encima del PDF

`components/files/PdfEditor.tsx`

Las páginas se dibujan con **pdf.js**; con «Escribir sobre el PDF» se hace clic
donde quieras y aparece una caja de texto que se puede arrastrar. Al guardar,
**pdf-lib imprime el texto dentro del PDF**: el archivo que queda en el evento
ya lo trae incrustado, no es una capa aparte. Es el equivalente digital de
rellenar y firmar un PDF a mano.

**Qué no hace.** No reescribe el texto original del PDF — para eso está el punto
4. La tipografía de lo que escribes es Helvetica.

## 3. Documento tipo Word → PDF

`components/files/DocEditor.tsx` + `apps/api/src/documents/`

Un documento se escribe por bloques (**Título, Subtítulo, Párrafo, Viñeta,
Separador**). Enter abre un bloque nuevo y Retroceso en uno vacío lo quita, para
escribir de corrido. **Descargar PDF** lo imprime con pdfkit —la misma identidad
visual que los PDF de checklist— y lo **registra como archivo del evento**, así
que queda en la lista junto a todo lo demás.

Cada guardado sube la versión; si el PDF exportado quedó atrás, el panel lo
avisa.

Modelo nuevo `EventDocument` (`blocksJson`, `version`, `pdfUrl`, `pdfVersion`).

## 3-bis. El checklist se captura SOBRE su PDF

`components/files/ChecklistPdfEditor.tsx` + `checklist-pdf.service.ts`

Antes el formulario mandaba y el PDF era su salida en solo lectura. Ahora es al
revés: **se escribe sobre la hoja**.

Funciona porque el PDF lo genera este mismo sistema, así que el generador sabe
dónde escribió cada dato. Ahora lo registra —página y coordenadas por ítem— en
`ChecklistInstance.pdfFieldsJson`, y el panel dibuja el PDF real con pdf.js y
coloca un campo de captura justo encima de cada valor: texto, select o casilla.
Al guardar, el PDF se regenera con lo capturado y sigue el flujo de firmas de
siempre.

Los campos van con fondo opaco porque el PDF de abajo sigue mostrando el valor
anterior hasta la regeneración.

El **formulario clásico sigue disponible** con el botón *Formulario*, y es el
modo por defecto mientras un formato no tenga mapa (se llena en su siguiente
regeneración). Para los que ya existían:

```bash
docker exec -w /app/apps/api arta-api npx ts-node --transpile-only scripts/backfill-checklist-pdf-fields.ts
```

Ese script **deja fuera los formatos ya autorizados** a propósito: reescribir en
bloque un documento firmado no debe pasar sin que alguien lo pida. Para
incluirlos, `--include-signed`.

> Detalle que cuesta caro: en columnas `Json?` de Prisma, `{ equals: null }`
> significa «JSON null», no NULL de la base. Hay que usar `Prisma.DbNull` o la
> consulta no devuelve nada — la primera corrida del backfill no encontró
> ninguna de las 59 filas por eso.

## 4. PDF → documento editable

`lib/pdf-to-blocks.ts`

El botón **«Pasar a documento»** de cada PDF extrae su texto con pdf.js, lo
reagrupa en párrafos (cortando donde el salto vertical se agranda) y crea un
documento del punto 3, listo para reescribirse y volver a exportarse en PDF.

> **Límite honesto:** esto **no reconstruye el diseño**. Tablas, columnas,
> imágenes y tipografías se pierden; lo que queda es el texto en orden. Un PDF
> escaneado (imagen sin capa de texto) no devuelve nada, y el panel lo dice en
> vez de crear un documento vacío. Convertir un PDF a un Word fiel exige OCR y
> reconstrucción de layout, que no es algo que el navegador pueda hacer bien.

## Guardado en el sitio

`PUT /uploads/:id/content` reemplaza el contenido **sin cambiar el id**, para
que los enlaces que ya circulan sigan sirviendo. Sube `version`, guarda quién
editó y **no borra el archivo anterior del disco**: la versión previa queda como
respaldo. Un evento cerrado deja todo en solo lectura.

`EventFile` gana `version`, `updatedById` y `updatedAt`.

## Dependencias y build

- `xlsx` (ya estaba) para leer y escribir el libro.
- `pdfjs-dist` para dibujar y extraer texto; `pdf-lib` para escribir dentro del
  PDF. Las dos entran por **import dinámico**, así que solo se descargan cuando
  alguien abre un editor.
- El worker de pdf.js se copia a `public/pdf.worker.min.mjs` en cada build
  (`npm run copy-pdf-worker`, enganchado a `prebuild`/`predev`) en vez de
  versionarse, para que worker y librería nunca se desfasen — si se desfasan,
  pdf.js revienta en runtime. Por eso está en `.gitignore`.

## Pruebas

`e2e/editors.spec.ts` genera un `.xlsx` de verdad, lo sirve, abre el editor,
comprueba que el contenido real llegó a la cuadrícula, escribe dos celdas,
guarda y verifica que se subió un `.xlsx` reconstruido de más de 1 KB al
endpoint de guardado. Un segundo spec crea un documento, lo escribe y lo guarda.

`e2e/checklist-pdf.spec.ts` usa fixtures producidos por el **generador real**
(`e2e/fixtures/`, ver `README-regenerar.ts.txt`), así que comprueba que los
campos caen sobre lo que pdfkit imprimió de verdad y no sobre coordenadas
inventadas: valores correctos, escritura sobre la hoja, campos dentro de los
límites de la página y vuelta al formulario clásico.
