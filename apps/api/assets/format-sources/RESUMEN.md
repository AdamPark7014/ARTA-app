# RESUMEN — Formatos ARTA (originales)

Generado desde archivos copiados de `C:\Users\adpoz\Downloads` (solo lectura en PC).

## Archivos faltantes

- **Campaña xlsx**: no encontrado (ningún xlsx reciente con campa/campaña/publicidad).
- **Corrida xlsx**: no encontrado (ningún xlsx con corrida/financ).
- **ORDEN DE COMPRA LEYENDA.xlsx**: no encontrado por ese nombre.
- **ORDEN DE COMPRA CIRCO.xlsx**: no encontrado por ese nombre.
- Sí hay dos hashes distintos de ORDEN DE COMPRA: base/(1) idénticos, y `(2)` distinto — se documenta la diferencia abajo.

### Downloads modificados en las últimas 2 horas (para identificar Campaña/Corrida)

| Hora (Mexico City) | Bytes | Nombre |
|---|---:|---|
| 2026-09-24 11:44:23 | 27,426,202 | `mapa nexara.svg` |
| 2026-09-24 11:44:11 | 1,438,919 | `mapa nexara.jpg` |
| 2026-09-24 11:42:23 | 1,980,403 | `DSC01035.jpg.jpeg` |
| 2026-09-24 11:42:18 | 14,538,787 | `foto 2 armado.jpg.jpeg` |
| 2026-09-24 11:42:15 | 7,696,090 | `DSC00923.jpg.jpeg` |
| 2026-09-24 11:42:12 | 9,845,466 | `foto armado.jpg.jpeg` |
| 2026-09-24 11:42:08 | 9,042,211 | `DSC00989.jpg.jpeg` |
| 2026-09-24 11:42:01 | 3,385,576 | `DSC00984.jpg.jpeg` |
| 2026-09-24 11:41:56 | 5,786,754 | `DSC00937.jpg.jpeg` |

Ninguno de esos archivos recientes es Excel; Campaña/Corrida **no** están en Downloads en la ventana de 2h ni por nombre.

## ORDEN DE COMPRA.xlsx (base / newest of identical copies)

- **Box path:** `/workspace/arta-formatos/ORDEN_DE_COMPRA.xlsx`
- **Size:** 43,236 bytes
- **Sheets (2):** Hoja1, ORDEN DE COMPRA

### Sheet: `Hoja1`
- Dimensions (openpyxl): `A3:Z59` — max_row=59, max_column=26
- Merged ranges: **13**
- Merge sample: I51:K52, I41:K48, G51:H52, I38:K40, I50:K50, G38:H40, D13:H13, G50:H50, G41:H48, C19:J19, B48:D52, B47:D47 … (+1 more)
- Leading rows (possible headers / labels):
  - Row 4:  |  |  |  |  | ORDEN DE COMPRA
  - Row 10:  |  |  |  |  |  |  |  |  | PROVEEDOR | X
  - Row 11:  |  |  |  |  |  |  |  |  | OTRO
- Formulas sample (1 shown; scanned sheet):
  - `K32==SUM(K20:K28)`
- Notable cells (keywords):
  - J10: PROVEEDOR
  - B19: CANTIDAD
  - K19: SUBTOTAL
  - J30: SUBTOTAL
  - J32: TOTAL
  - B48: LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE REALIZARÁN LUNES, MIÉRCOLES Y VIERNES

### Sheet: `ORDEN DE COMPRA`
- Dimensions (openpyxl): `A3:Z59` — max_row=59, max_column=26
- Merged ranges: **13**
- Merge sample: I41:K48, G51:H52, I38:K40, I50:K50, G38:H40, D13:H13, B48:D52, G50:H50, G41:H48, C19:J19, I51:K52, B47:D47 … (+1 more)
- Leading rows (possible headers / labels):
  - Row 4:  |  |  |  |  | ORDEN DE COMPRA
  - Row 10:  |  |  |  |  |  |  |  |  | PROVEEDOR | X
  - Row 11:  |  |  |  |  |  |  |  |  | OTRO
- Formulas sample (1 shown; scanned sheet):
  - `K32==SUM(K20:K28)`
- Notable cells (keywords):
  - J10: PROVEEDOR
  - B19: CANTIDAD
  - K19: SUBTOTAL
  - J30: SUBTOTAL
  - J32: TOTAL
  - B48: LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE REALIZARÁN LUNES, MIÉRCOLES Y VIERNES


**Column headers (fila 19, sheet ORDEN DE COMPRA / Hoja1):** B=`CANTIDAD`, C=`DESCRIPCION DEL PRODUCTO` (merged C19:J19), K=`SUBTOTAL`. Totales: J30/J32 labels SUBTOTAL/TOTAL, fórmula `K32=SUM(K20:K28)`. Pie: OBSERVACIONES + leyenda de pagos de campañas (lun/mie/vie); firmas entrega/recibe (G50/I50).

## ORDEN DE COMPRA (2).xlsx (distinct hash — candidate variant)

- **Box path:** `/workspace/arta-formatos/ORDEN_DE_COMPRA_2.xlsx`
- **Size:** 43,120 bytes
- **Sheets (2):** Hoja1, ORDEN DE COMPRA

### Sheet: `Hoja1`
- Dimensions (openpyxl): `A3:Z59` — max_row=59, max_column=26
- Merged ranges: **13**
- Merge sample: I41:K48, G51:H52, I38:K40, I50:K50, G38:H40, D13:H13, B48:D52, G50:H50, G41:H48, C19:J19, I51:K52, B47:D47 … (+1 more)
- Leading rows (possible headers / labels):
  - Row 4:  |  |  |  |  | ORDEN DE COMPRA
  - Row 10:  |  |  |  |  |  |  |  |  | PROVEEDOR | X
  - Row 11:  |  |  |  |  |  |  |  |  | OTRO
- Formulas sample (1 shown; scanned sheet):
  - `K32==SUM(K20:K28)`
- Notable cells (keywords):
  - J10: PROVEEDOR
  - B19: CANTIDAD
  - K19: SUBTOTAL
  - J30: SUBTOTAL
  - J32: TOTAL
  - B48: LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE REALIZARÁN LUNES, MIÉRCOLES Y VIERNES

### Sheet: `ORDEN DE COMPRA`
- Dimensions (openpyxl): `A3:Z59` — max_row=59, max_column=26
- Merged ranges: **13**
- Merge sample: I41:K48, G51:H52, I38:K40, I50:K50, G38:H40, D13:H13, B48:D52, G50:H50, G41:H48, C19:J19, I51:K52, B47:D47 … (+1 more)
- Leading rows (possible headers / labels):
  - Row 4:  |  |  |  |  | ORDEN DE COMPRA
  - Row 10:  |  |  |  |  |  |  |  |  | PROVEEDOR | X
  - Row 11:  |  |  |  |  |  |  |  |  | OTRO
- Formulas sample (1 shown; scanned sheet):
  - `K32==SUM(K20:K28)`
- Notable cells (keywords):
  - J10: PROVEEDOR
  - B19: CANTIDAD
  - K19: SUBTOTAL
  - J30: SUBTOTAL
  - J32: TOTAL
  - B48: LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE REALIZARÁN LUNES, MIÉRCOLES Y VIERNES

## DISTRUIBUICION PENDONES.xlsx

- **Box path:** `/workspace/arta-formatos/DISTRUIBUICION_PENDONES.xlsx`
- **Size:** 30,366 bytes
- **Sheets (1):** Hoja1

### Sheet: `Hoja1`
- Dimensions (openpyxl): `A1:F27` — max_row=27, max_column=6
- Merged ranges: **4**
- Merge sample: A6:E6, A1:E5, A8:A17, C19:E19
- Leading rows (possible headers / labels):
  - Row 1: DISTRIBUCIÓN PENDONES CHOLULA
  - Row 6: COLOCACIÓN PENDONES
  - Row 7: EVENTO | AVENIDAS PRINCIPALES | PRIMERA PARTE | SEGUNDA PARTE | TERCERA PARTE
  - Row 8:  | FEDERAL ATLIXCO
  - Row 9:  | CAMINO REAL
  - Row 10:  | BLVD NIÑO POBLANO
  - Row 11:  | AVENIDAS LAS TORRES
  - Row 12:  | AVENIDAS SECUNDARIAS
- Formulas sample (4 shown; scanned sheet):
  - `C18==SUM(C8:C17)`
  - `D18==SUM(D8:D17)`
  - `E18==SUM(E8:E17)`
  - `C19==C18+D18+E18`
- Notable cells (keywords):
  - A1: DISTRIBUCIÓN PENDONES CHOLULA
  - A6: COLOCACIÓN PENDONES
  - B19: TOTAL

## Diferencias ORDEN DE COMPRA: base vs (2) (en lugar de LEYENDA/CIRCO)

- Cells only in base: 3; only in (2): 1; value-changed same coord: 0
- Changed / unique text samples:
  - ONLY base Hoja1!B20: `1.0`
  - ONLY base Hoja1!C20: `ANTICIPO TRANSPORTE`
  - ONLY base Hoja1!K20: `50000.0`
  - ONLY (2) Hoja1!B47: `OBSERVACIONES`
- Sheets base: ['Hoja1', 'ORDEN DE COMPRA']; sheets (2): ['Hoja1', 'ORDEN DE COMPRA']
- Merges sheet `ORDEN DE COMPRA`: base=13, (2)=13
- Merges sheet `Hoja1`: base=13, (2)=13

### Hallazgo branding (posible LEYENDA vs CIRCO)

Los dos ORDEN DE COMPRA únicos **no** se llaman LEYENDA/CIRCO, pero difieren sobre todo en **imágenes embebidas** (logos):

- `xl/media/image1.png` y `image2.png` están **intercambiados** entre base y `(2)` (mismos bytes, roles invertidos).
- También cambian `drawing1.xml` / `drawing2.xml` (posición/tamaño de drawings) y strings menores.
- En celdas: base `Hoja1` trae una línea de ejemplo `1 | ANTICIPO TRANSPORTE | 50000`; `(2)` no. `(2)` conserva label `OBSERVACIONES` en B47 de Hoja1.

**No se pudo contrastar LEYENDA vs CIRCO por nombre** porque esos archivos no están en Downloads. Si los logos corresponden a marcas Leyenda/Circo, habría que descargarlos con esos nombres desde el Drive folder de origen.

Imágenes extraídas a `/workspace/arta-formatos/_orden_media/base/` y `.../two/` para inspección visual.

**Nota LEYENDA / CIRCO:** no hay archivos con esos nombres en Downloads. Solo existen el base (y copia `(1)` idéntica) y `(2)` con hash distinto. Si LEYENDA/CIRCO viven en el Drive folder `1IJ_ntDodKv7dd2Jg6y6dTB7UG3cHA6yB`, aún no se descargaron con esos nombres.

## CREACIÓN BOLETERA.docx

- **Box path:** `/workspace/arta-formatos/CREACION_BOLETERA.docx`
- **Size:** 45,377 bytes
- Paragraphs (non-empty sampled): 13 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - Evento:
  - Boletera:
  - Fecha:
  - Horario:
  - Venue:
  - Artista:
  - Promotor:
  - Venue:
- Content preview (first paragraphs):
  - [normal] CREACIÓN BOLETERA
  - [normal] Evento:
  - [normal] Boletera:
  - [normal] Fecha:
  - [normal] Horario:
  - [normal] Venue:
  - [normal] + CXS
  - [normal] HOLD
  - [normal] Artista:
  - [normal] Promotor:
  - [normal] Venue:
  - [normal] CARPETA EDITABLE
  - [normal] DESCRIPCIÓN DEL EVENTO
- Tables: **1**
  - Table 1: 8 rows × 3 cols
    - R1: ZONA | AFORO | PRECIO
    - R2: DIAMANTE | 545 | $                           3,000.00
    - R3: PLATINO | 507 | $                           2,650.00
    - R4: ORO | 268 | $                           2,400.00

## CHECKLIST EVENTO GENERAL.docx

- **Box path:** `/workspace/arta-formatos/CHECKLIST_EVENTO_GENERAL.docx`
- **Size:** 85,790 bytes
- Paragraphs (non-empty sampled): 45 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - CIUDAD:                                                          VENUE:
- Content preview (first paragraphs):
  - [normal] CHECKLIST EVENTO
  - [normal] NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - [normal] CIUDAD:                                                          VENUE:
  - [normal] VENUE
  - [normal] PLANTA DE LUZ
  - [normal] CAMPAÑA
  - [normal] RIDER HOSPITALIDAD
  - [normal] COTIZAR CATERING
  - [normal] DEFINIR DIVISIÓN, CUÁNTOS Y MEDIDAS DE CAMERINOS
  - [normal] RENTA DE CARPAS
  - [normal] MOBILIARIO
  - [normal] LLENAR CHECKLIST DE TRANSPORTACIÓN
  - [normal] LLENAR CHECKLIST DE HOSPEDAJE
  - [normal] VIÁTICOS
  - [normal] PAGO STAFF
  - [normal] PREPARAR CAJA DE PAPELERÍA
  - [normal] SECCIONES LAYOUT
  - [normal] ACTIVACIONES
  - [normal] RENTA DE VALLAS
  - [normal] RENTA DE GRADAS
- Tables: **0**

## CHECKLIST PRODUCCIÓN.docx

- **Box path:** `/workspace/arta-formatos/CHECKLIST_PRODUCCION.docx`
- **Size:** 2,696,809 bytes
- Paragraphs (non-empty sampled): 28 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - CIUDAD :                                                          VENUE:
  - HORARIO DE INGRESO A VENUE:
  - OBSERVACIONES:
- Content preview (first paragraphs):
  - [Normal] CHECKLIST PRODUCCIÓN
  - [Normal] NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - [Normal] CIUDAD :                                                          VENUE:
  - [Normal] RIDER ORIGINAL:  BOTÓN
  - [Normal] VS RIDER ACEPTADO: BOTÓN
  - [Normal] EMPRESA PROVEEDORA DE AUDIO
  - [Normal] EMPRESA PROVEEDORA DE ILUMINACIÓN
  - [Normal] EMPRESA PROVEEDORA DE AUDIO
  - [Normal] EMPRESA PROVEEDORA DE PLANTA DE LUZ
  - [Normal] EMRESA PROVEEDORA DE EFECTOS
  - [Normal] EMPRESA PROVEEDORA DE BACKLINE
  - [Normal] EMPRESA PROVEEDORA DE ESCENARIO Y GRAND SUPPORT
  - [Normal] EMPRES PROVEEDORA DE STAGE HANDS
  - [Normal] PRODUCTION MANAGER DEL ARTISTA
  - [Normal] PRODUCTION MANAGER DEL PROMOTOR
  - [Normal] ENCARGADO DE EQUIPO DE AUDIO
  - [Normal] ENCARGADO DE EQUIPO DE ILUMINACIÓN
  - [Normal] ENCARGADO DE VIDEO
  - [Normal] ENCARGADO DE PLANTA DE LUZ
  - [Normal] ENCARGADO DE EFECTOS
- Tables: **0**

## CHECKLIST HOSPEDAJE.docx

- **Box path:** `/workspace/arta-formatos/CHECKLIST_HOSPEDAJE.docx`
- **Size:** 2,696,146 bytes
- Paragraphs (non-empty sampled): 10 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - CIUDAD :                                                          VENUE:
  - NOMBRE DEL HOTEL:
  - NOMBRE Y CONTACTO DEL ENLACE CON EL HOTEL:
  - OBSERVACIONES:
- Content preview (first paragraphs):
  - [Normal] CHECKLIST HOSPEDAJE
  - [Normal] NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - [Normal] CIUDAD :                                                          VENUE:
  - [Normal] NOMBRE DEL HOTEL:
  - [Normal] NOMBRE Y CONTACTO DEL ENLACE CON EL HOTEL:
  - [Normal] INCLUYE DESAYUNO: SÍ / NO
  - [Normal] OBSERVACIONES:
  - [Normal] PARTY A BOTÓN
  - [Normal] PARTY B BOTÓN
  - [Normal] CONFIRMACIONES BOTÓN
- Tables: **0**

## CHECKLIST TRANSPORTACIÓN.docx

- **Box path:** `/workspace/arta-formatos/CHECKLIST_TRANSPORTACION.docx`
- **Size:** 2,693,550 bytes
- Paragraphs (non-empty sampled): 10 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - CIUDAD :                                                          VENUE:
  - NOMBRE DEL PROVEEDOR:
  - CONTACTO DEL PROVEEDOR:
  - CANTIDAD DE CAMIONETAS:
  - MODELO DE CAMIONETAS:
  - EL SERVICIO INCLUYE:
  - ESTATUS:
  - OBSERVACIONES:
- Content preview (first paragraphs):
  - [Normal] CHECKLIST TRANSPORTACIÓN
  - [Normal] NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - [Normal] CIUDAD :                                                          VENUE:
  - [Normal] NOMBRE DEL PROVEEDOR:
  - [Normal] CONTACTO DEL PROVEEDOR:
  - [Normal] CANTIDAD DE CAMIONETAS:
  - [Normal] MODELO DE CAMIONETAS:
  - [Normal] EL SERVICIO INCLUYE:
  - [Normal] ESTATUS:
  - [Normal] OBSERVACIONES:
- Tables: **0**

## CHECKLIST RUEDA DE PRENSA.xlsx.docx

- **Box path:** `/workspace/arta-formatos/CHECKLIST_RUEDA_DE_PRENSA.xlsx.docx`
- **Size:** 2,696,284 bytes
- Paragraphs (non-empty sampled): 11 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - EVENTO:                                    FECHA DE LA RP:                                                 HORA DE LA RP:
  - CIUDAD DE LA RP:                                                          VENUE DE LA RP:
  - NOMBRE Y CONTACTO DEL ENCARGADO DE VENUE:
  - NOMBRE Y CONTACTO DEL PROVEEDOR DE AUDIO Y MICRÓFONOS:
  - ENCARGADO DE COFFEE BREAK:
  - MEDIOS CONFIRMADOS:
  - OBSERVACIONES:
- Content preview (first paragraphs):
  - [Normal] CHECKLIST RUEDA DE PRENSA
  - [Normal] EVENTO:                                    FECHA DE LA RP:                                                 HORA DE LA RP:
  - [Normal] CIUDAD DE LA RP:                                                          VENUE DE LA RP:
  - [Normal] NOMBRE Y CONTACTO DEL ENCARGADO DE VENUE:
  - [Normal] NOMBRE Y CONTACTO DEL PROVEEDOR DE AUDIO Y MICRÓFONOS:
  - [Normal] ENCARGADO DE COFFEE BREAK:
  - [Normal] BANNERS: SÍ / NO
  - [Normal] PANTALLAS: SÍ / NO
  - [Normal] IDENTIFICADORES DE MESA: SÍ / NO
  - [Normal] MEDIOS CONFIRMADOS:
  - [Normal] OBSERVACIONES:
- Tables: **0**

## CHECKLIST INFO ARTES SHOWS.docx

- **Box path:** `/workspace/arta-formatos/CHECKLIST_INFO_ARTES_SHOWS.docx`
- **Size:** 2,906,542 bytes
- Paragraphs (non-empty sampled): 13 total non-empty
- Headings: none with Heading/Title style (may use bold/normal)
- Field-like lines:
  - NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - VENUE:
  - PROMOTORAS:
  - BOLETERA:
  - PATROCINADORES:
  - EXTRAS:
  - OBSERVACIONES:
  - FECHA DE SOLICITUD:
  - FECHA DE CAMBIO (CUANDO SE REALIZÓ):
  - FIRMA /NOMBRE AUTORIZADO:
- Content preview (first paragraphs):
  - [Normal] CHECKLIST ARTES
  - [Normal] NOMBRE DEL SHOW:                                    FECHA:                                                 HORA:
  - [Normal] VENUE:
  - [Normal] PROMOTORAS:
  - [Normal] BOLETERA:
  - [Normal] PATROCINADORES:
  - [Normal] EXTRAS:
  - [Normal] FORMATO FB (1350) BOTÓN
FORMATO IG (1440) BOTÓN
FORMATO STORY (1920) BOTÓN
PRECIOS (TODOS) BOTÓN
  - [Normal] REEL GENERAL BOTÓN
  - [Normal] OBSERVACIONES:
  - [Normal] FECHA DE SOLICITUD:
  - [Normal] FECHA DE CAMBIO (CUANDO SE REALIZÓ):
  - [Normal] FIRMA /NOMBRE AUTORIZADO:
- Tables: **0**
