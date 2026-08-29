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
