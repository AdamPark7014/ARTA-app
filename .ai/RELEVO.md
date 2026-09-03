# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-03
- **Rama:** main

## Hecho en este turno

**Fase 3: los estados por fin protegen algo. Firmar congela el documento.**

### 1. Un solo oráculo para tres candados

Había tres candados que se solapaban —el estado del documento, el `locked` de la
corrida y el estado del evento— y cada endpoint los comprobaba por su cuenta.
Así nació el bug que ya costó caro: `if (existing.locked && body.locked !== false)`,
que dejaba desbloquear y editar en la misma petición.

Ahora hay **un único sitio** donde se decide si algo se puede escribir:
`common/doc-guards.ts`. Todo endpoint de escritura pasa por `assertDocWritable`.
**17 pruebas** cubren la matriz completa.

### 2. Las reglas, y por qué son así

- **Pedir revisión es autoservicio.** Nadie tiene que pedir permiso para pedir
  que le revisen.
- **`REVIEW` NO bloquea la edición.** Es una bandera, no un candado. Si
  bloqueara, nadie cerraría su formato a las 23 h antes de un show porque quien
  aprueba está dormido — y el atajo del equipo acabaría siendo tocar la base.
- **`APPROVED` y `SEALED` sí bloquean.** Un aprobado se devuelve a borrador para
  editarlo; un sellado solo lo reabre **dirección, con motivo por escrito** que
  queda en el historial.
- **Sellado es de un solo sentido**: no se puede volver a «aprobado» ni a
  «revisión», solo reabrir.
- Los botones que darían 403 **no se enseñan**: quien no puede aprobar no ve
  «Aprobar».

### 3. Cerrar un evento ya NO sella (decisión de producto)

Cerrar es operativo; sellar es un acto de responsabilidad con firmante y fecha.
Confundirlos implicaba que **reabrir DES-sellaba** — y así era literalmente: el
`reopen` hacía `financeRun.updateMany({ locked: false })` sobre todas las
corridas del evento, echando abajo un sello que alguien había puesto a
conciencia. Ahora reabrir devuelve cada documento a *su* propio estado y jamás
degrada un sellado. El evento cerrado sigue dejando todo en solo lectura, pero a
través del oráculo.

### 4. El PDF firmado deja de sobrescribirse

El archivo se escribía siempre en `<id>.pdf`, así que **cada regeneración
borraba el documento anterior, firmas incluidas**. Ahora lleva la revisión en el
nombre (`<id>-r<n>.pdf`): cada versión queda en disco y el PDF que alguien firmó
no se puede pisar.

### 5. Prueba de qué se firmó

`DigitalSignature` gana `contentHash`: el sha256 del `dataJson` exacto que se
firmó. Antes no había forma de demostrar que el documento actual fuera el que
alguien autorizó.

### 6. Pruebas

- **156 unitarias** (antes 139) y **45 de integración** contra Postgres real
  (antes 35), con `doc-status-flow.e2e-spec.ts` recorriendo el flujo completo:
  logística pide revisión → sigue editando → no puede aprobar → gerencia aprueba
  → ya no se edita → sella → dirección reabre con motivo → cada transición dejó
  su revisión.
- Playwright **26 de 28**. Los 2 rojos son `public-site.spec.ts` (SSR contra el
  API en `127.0.0.1:4000`, no levantado aquí — no es regresión).

## A medias

Nada roto. Pendientes conocidos, por orden de importancia:

1. **Insertar o borrar filas desde el panel no reajusta las fórmulas.** Una
   `=B9*C9` desplazada a la fila 10 sigue apuntando a la 9 → cálculos mal en
   silencio. Es el fallo más serio que queda en el editor de hojas.
2. **Los estados solo se aplican en checklists.** `FinanceRun` y `EventDocument`
   tienen las columnas y la corrida ya tiene su `unlock`, pero sus endpoints aún
   no usan el oráculo ni exponen transiciones.
3. **`locked` sigue existiendo** en `FinanceRun` como columna real. El oráculo ya
   lo lee, pero falta la migración que lo elimine cuando todo pase por `status`.
4. **`EventDocument` sigue sin revisiones.**
5. **`folders`** (SharedFile) quedó fuera de todo: otro modelo.

## Siguiente paso

1. **Deploy + `prisma migrate deploy`** en Hetzner. Hay **cuatro** migraciones
   acumuladas: tareas con evidencia (cursor), `doc_revisions_and_status`,
   `file_revisions_and_panel_editable` y `signature_content_hash`.
2. **Backfill del avance** tras el deploy (viene de Fase 0):
   ```
   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
     scripts/backfill-checklist-progress.ts --dry
   ```
   ⚠️ Los porcentajes bajan y las alertas de riesgo suben. Avisar al equipo el
   mismo día y silenciar digests 24 h.
3. **Smoke con Arturo/José Luis**: llenar un formato → mandarlo a revisión →
   aprobarlo → intentar editarlo (debe negarse) → sellarlo → reabrirlo con
   motivo → ver el rastro completo en el historial.
4. **Smoke con un Excel real de Arta** (viene de Fase 2): abrir una corrida con
   formato, editar una celda, guardar, descargar y abrir en Excel. Deben
   sobrevivir colores, moneda, anchos y las fórmulas no tocadas.
5. **Smoke de concurrencia**: mismo formato en dos navegadores, guardar en uno y
   luego en el otro → aviso con diff, sin perder nada.

### Si el equipo se queja de fricción

Los estados salieron pensados para no estorbar (revisión no bloquea, pedir
revisión es autoservicio). Si aun así molestan la primera semana, **se relaja el
flujo, no se abandona el historial**: el valor está en `DocRevision`, no en los
candados.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
