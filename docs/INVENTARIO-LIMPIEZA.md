# Inventario de limpieza semanal (Auditorio)

Pedido del cliente en la junta del 23-10-2026: «inventario de limpieza semanal».
Es del Auditorio (`EXPLANADA`) y **no cuelga de un evento**: se cuenta cada
semana aunque no haya show.

## Dónde vive

- **Pantalla**: `/maintenance/inventario-limpieza` (menú «Operación» →
  «Inventario de limpieza», solo en Auditorio; también desde Mantenimiento).
  `apps/web/app/(app)/maintenance/inventario-limpieza/page.tsx`.
- **API**: `apps/api/src/cleaning-inventory/` (`/cleaning-inventory`). Lógica
  pura y cuentas en `cleaning-inventory.ts`.
- **Base**: tabla `CleaningInventory` (migración
  `20261029130100_inventario_limpieza`): una fila por organización, entidad y
  semana (`weekStart` = lunes `AAAA-MM-DD`); los renglones en `itemsJson`.

## Cómo funciona

- La semana va de lunes a domingo. «Abrir semana actual» o «Abrir la semana del
  día» crea la semana si no existe (si ya existe, la abre).
- La primera semana nace con una lista base de 16 insumos (papel, jabón,
  cloro, bolsas, jergas…) que se edita, quita o amplía en la hoja. Cada semana
  nueva copia insumos, unidades y mínimos de la anterior, y su **existencia
  final pasa a ser la existencia inicial**.
- Columnas: insumo, unidad, existencia inicial, entradas, consumo, existencia
  final, mínimo, faltantes, observaciones. Además: responsable del conteo y
  observaciones de la semana.
- Cuentas: existencia final = inicial + entradas − consumo; faltantes = mínimo
  − existencia final (nunca negativo). Se ven en gris; si el conteo físico es
  otro se escribe encima y manda lo escrito. Los insumos con faltantes llevan
  un punto de aviso.
- Se guarda solo (autoguardado, con bloqueo optimista por `revision`: si otra
  persona guardó antes, avisa en vez de pisar). Historial a la izquierda con
  responsable, faltantes y quién editó.
- **PDF** con el motor de formatos (`ChecklistPdfService`): logo y marca del
  Auditorio, encabezado de la semana, tabla con las cuentas hechas,
  observaciones y renglones de firma *Responsable de limpieza* / *Auditorio
  Explanada Puebla*, folio `AUD-INV-<lunes>-V<revisión>`. Sin marca de agua de
  borrador (no hay flujo de aprobación).

## Quién

- Ver: quien opera eventos del Auditorio.
- Capturar y abrir semanas: además `checklist.edit` (dirección, dirección
  adjunta del Auditorio —Rodrigo, Will, JP— y `dir_auditorio`).
- Borrar una semana abierta por error: solo dirección. Todo queda en la
  bitácora (`cleaning_inventory.create|update|pdf|delete`).

## Pruebas

`apps/api/src/cleaning-inventory/cleaning-inventory.spec.ts`: lunes de
cualquier fecha (cruce de año), etiqueta de la semana, hoy en hora de México,
cuentas y lo escrito que manda, limpieza de lo que llega del panel, semana
nueva desde la anterior y el PDF real.
