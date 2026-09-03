# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-02
- **Rama:** main

## Hecho en este turno

**Fase 1 del plan de robustez: motor de revisiones, historial con diff y fin de
las ediciones que se pisan.**

### 1. Nadie se pisa (el problema de fondo)

Hasta ahora **no existía ningún control de concurrencia en todo el repo**. El
autoguardado manda el documento completo cada 1.8 s y el servidor hacía
`update({ data: { dataJson } })`: el último en escribir ganaba y el otro perdía
su trabajo sin ver un solo error.

Ahora `PATCH /checklists/:id` acepta `baseRevision`. El UPDATE lleva el número de
revisión **dentro del WHERE**, así que si otra petición se adelantó no casa
ninguna fila y se responde **409 con el diff de lo que pasó mientras tanto**, en
vez de pisarlo. El contador `revision` es a la vez historial y candado, así que
no hace falta un `SELECT … FOR UPDATE` aparte.

En pantalla no se pierde nada: aparece *«Karla guardó cambios mientras
editabas»* con el detalle campo por campo y dos salidas — quedarse con lo
guardado, o guardar lo mío encima.

`baseRevision` es **opcional**: sin él se mantiene el comportamiento anterior, así
que nada de fuera se rompe mientras se migra.

### 2. Historial que responde «quién cambió qué»

- **`DocRevision`**: una sola tabla para checklist, corrida, documento y archivo.
  Con **FK real al evento y borrado en cascada** (sin ella, borrar un evento
  dejaría revisiones huérfanas para siempre) y **`organizationId` propio** — no
  inferido por el autor, que es justo el error que hace inservible el `AuditLog`
  de hoy.
- **`doc-diff.ts`**: differ propio, sin librería genérica. Casa por
  identificador, nunca por posición, así que **reordenar una sección no es un
  cambio**. Devuelve «Datos del show → Aforo autorizado: 4200 → 3800», no
  `sections.2.items.7.value`. **21 pruebas** cubren reordenar, vaciar, añadir,
  borrar y datos corruptos.
- **El diff lo calcula y lo guarda el servidor.** La web solo lo pinta.
- `GET /checklists/:id/revisions` + componentes `RevisionHistory`, `FieldDiff` y
  `ConflictNotice`.

### 3. Estados (columnas puestas, todavía sin aplicar)

`DocStatus { DRAFT REVIEW APPROVED SEALED }` en `ChecklistInstance`, `FinanceRun`
y `EventDocument`, con `submittedBy/At`, `approvedBy/At`, `sealedBy/At` y
`reopenReason`. **Se ven pero aún no bloquean nada** — eso es Fase 3, a
propósito: el equipo convive semanas con los estados antes de que restrinjan.

### 4. Migración de datos (dentro de la propia migración SQL)

- Los checklists **no se ponen todos en DRAFT**: firmado → `SEALED`, entregado →
  `REVIEW`. Poner todo en borrador des-aprobaría trabajo ya firmado.
- El historial de `ChecklistVersion` se **copia** a `DocRevision` con
  `ROW_NUMBER()`. La tabla vieja queda intacta como respaldo; se elimina en una
  migración posterior tras cuadrar conteos.
- Contador `revision` = nº de versiones previas, para que el `@@unique` no choque.
- `createdById` desde la versión más antigua. Nunca se inventa un autor.
- `AuditLog.organizationId` desde el autor; `ip` y `userAgent` nuevos, más
  índices por `userId` y por organización.

### 5. Roturas ajenas arregladas

- `test/tenant-isolation.e2e-spec.ts` **no compilaba**: le faltaba el
  `NotificationsService` que `TasksController` pide desde el turno anterior de
  cursor. El suite entero estaba caído y no se notaba porque `tsc` solo mira
  `src/`.
- `e2e/layout.spec.ts` medía el ancho del PDF sin esperar a que rasterizara:
  fallaba bajo carga y pasaba en aislado. Endurecido, no silenciado.

### 6. Pruebas

- **116 unitarias** (antes 95) y **35 de integración contra Postgres real**
  (antes 17), incluido `revision-concurrency.e2e-spec.ts`: dos guardados
  simultáneos → uno gana, el otro recibe 409; el autoguardado sube revisión pero
  **no** deja historial.
- Playwright: **26 de 28**. Los 2 rojos son `public-site.spec.ts`, que hace SSR
  contra el API en `127.0.0.1:4000` — no levantado aquí, no es regresión.
- `tsc --noEmit` limpio en api y web; `npm run build` del web pasa.

## A medias

Nada roto, pero la Fase 1 **no cubre todavía**:

1. **Solo checklists tienen revisión y candado.** `FinanceRun` y `EventDocument`
   ya tienen las columnas, pero sus endpoints aún no registran revisiones ni
   aceptan `baseRevision`.
2. **`DocLock` (presencia «Karla está editando») no se hizo** — el agente de
   diseño recomendó bajarlo de prioridad: no es un mecanismo de corrección y con
   el candado por revisión no hace falta.
3. **Operaciones por campo** (`{ ops: [...] }` en vez del documento completo),
   que harían que dos personas editando campos distintos **fusionen sin chocar**.
   Es la mejora natural del candado y quedó anotada para Fase 2.

## Siguiente paso

1. **Deploy + `prisma migrate deploy`** en Hetzner. Sigue pendiente lo del turno
   de cursor (evidencia/aprobación de tareas) además de esta migración.
2. **Backfill del avance** tras el deploy (viene de Fase 0):
   ```
   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
     scripts/backfill-checklist-progress.ts --dry
   ```
   ⚠️ Los porcentajes bajan y las alertas de riesgo suben. Avisar al equipo el
   mismo día; si los digests están activos, silenciarlos 24 h.
3. **Smoke de concurrencia con dos sesiones**: abrir el mismo formato en dos
   navegadores, guardar en uno y luego en el otro → debe salir el aviso con el
   diff, no perderse nada.
4. Fase 2: corrida financiera y Excel fiel — con el cambio de rumbo ya aprobado
   (deltas de celda al servidor, ExcelJS en el API, no en el navegador).

## Decisión ya tomada (para que no se relitigue)

El plan original decía migrar `SheetEditor` a **ExcelJS en el navegador**. Se
descartó: ExcelJS tampoco hace round-trip conservador —parsea a su modelo y
re-serializa, tirando gráficas y tablas dinámicas— y duplica el bundle.

En su lugar, Fase 2 hará: `flushGridToWorkbook` **ya sabe qué celdas cambiaron**
→ mandar ese delta a `PATCH /uploads/:id/cells`, aplicarlo en el **servidor** con
ExcelJS (ya es dependencia del API, coste de bundle cero), y marcar «solo lectura
en panel» los libros con `xl/charts/` o `xl/pivotCache/`. Ese delta *es* el diff
del Excel.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
