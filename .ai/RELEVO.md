# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-02
- **Rama:** main

## Hecho en este turno

**Fase 0 del plan de robustez de documentos: parar la hemorragia.**

Son bugs verificados en código que hoy pierden datos o dejan la puerta abierta.
Sin migraciones y sin UI nueva, para poder desplegarlo sin ceremonia.

### Pérdida de datos

1. **`SheetEditor`: cambiar de hoja dejaba «Guardar» inhabilitado.** Volcaba los
   cambios al libro en memoria y acto seguido hacía `setDirty(false)`, así que el
   botón pasaba a «Sin cambios» y Ctrl+S enmudecía — mientras el mensaje prometía
   que se guardarían. Cambiar de pestaña y cerrar perdía la hoja anterior entera.
2. **Aviso al cerrar con cambios sin guardar** en `SheetEditor`, `PdfEditor` y
   `DocEditor` (`useDirtyGuard`, que ya existía y no usaba ninguno).

### Permisos

3. **`/uploads` exige el permiso de la sección del archivo**, no solo acceso al
   evento: `finance` → `finance.edit`, `campaign` → `campaign.edit`, resto →
   `checklist.edit`. Antes, roles con solo `finance.view` (logística, convenios,
   enlace de gobierno) podían reemplazar o **borrar** el Excel de la corrida por API.
4. **Un `EventFile` sin evento ya no se salta todos los controles** — pedía cero
   comprobaciones porque no había contra qué comprobarlas.
5. **`POST /uploads` guarda el autor.** Un archivo subido no tenía ninguno en la base.
6. **`POST /checklists/:id/pdf`** pide `checklist.edit`, respeta evento cerrado y se
   niega a reimprimir un formato autorizado.
7. **`regenerateInstance` no reimprime un formato autorizado** (salvo `force`, que
   solo usa el flujo de firma). Antes, cualquier guardado posterior a la firma
   reescribía el PDF con la imagen de la firma pegada sobre el contenido **nuevo**:
   el documento parecía autorizado sin serlo. `regenerateForEvent` ya lo protegía;
   por esta puerta se colaba.
8. **Validación por «magic bytes»** además de la lista blanca de extensiones. El
   nombre y el `Content-Type` los pone quien sube: un ejecutable renombrado a
   `.xlsx` quedaba servido en `/uploads/*` desde el mismo origen que el panel.

### Cifras que mentían

9. **Sellar y editar la corrida son acciones distintas.** La guarda era
   `if (existing.locked && body.locked !== false)`, así que mandando
   `{ locked: false, dataJson: {...} }` se desbloqueaba y editaba en la **misma**
   petición. Ahora una corrida sellada no acepta cambios y quitar el sello es
   operación aparte, reservada a dirección.
10. **Los totales los recalcula siempre el servidor.** Antes solo se recalculaban
    `if (dataJson.rows)`: un PATCH sin renglones persistía `totalIncome` inventado
    y `analytics` se lo creía. Extraído a `finance-totals.ts` (usado por finance y
    analytics), inmune a `NaN`/`Infinity`.
11. **`calcProgress` deja de contar la sección `firmas`**, que el seed añade a todas
    las plantillas con dos ítems de texto ya rellenados que puntuaban siempre. Había
    **tres** implementaciones distintas (checklists, finance, panel web); ahora hay
    una en `src/common/checklist-progress.ts`.

### Pruebas

- 3 specs nuevos: `checklist-progress`, `finance-totals`, `upload-storage`.
- Arreglado el setup roto de `tenant-isolation.e2e-spec.ts` (`new ChecklistPdfService()`
  sin argumentos: no compilaba y el spec se apoyaba en ese error de tipos).
- **95/95 en verde** (antes 67), `tsc --noEmit` limpio en api y web.

## A medias

Nada a medias. Pero **el punto 11 tiene un pendiente operativo**: hay que correr
el backfill en producción, porque las filas viejas conservan el porcentaje viejo.

## Siguiente paso

1. **Deploy + `prisma migrate deploy`** en Hetzner — sigue pendiente lo del turno
   anterior de cursor (evidencia/aprobación de tareas).
2. **Backfill del avance**, después del deploy:
   ```
   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
     scripts/backfill-checklist-progress.ts --dry
   ```
   El `--dry` enseña el impacto sin escribir. Sin `--dry`, aplica.
   ⚠️ **Los porcentajes bajan** y los umbrales de riesgo de `/analytics/ops`
   reclasifican formatos de golpe. Es corregir una cifra que mentía, pero hay que
   avisar al equipo el mismo día y, si los digests están activos, silenciarlos 24 h.
   (En local no se pudo medir el impacto: la base de desarrollo no tiene checklists.)
3. Smoke de tareas del turno de cursor: asignar → entregar con foto/nota →
   aprobar/rechazar → historial.

## Decisión pendiente para Adam

El plan aprobado (`~/.claude/plans/el-tema-de-checlist-sparkling-mango.md`) dice en
Fase 3 **migrar `SheetEditor` de `xlsx` a `exceljs` en el navegador**. Al someter la
arquitectura a crítica salió un argumento que lo tumba: **ExcelJS tampoco hace
round-trip conservador** — parsea a su propio modelo y re-serializa, así que tira
gráficas, tablas dinámicas y validaciones. Cambiaríamos «pierde estilos» por
«conserva estilos, pierde gráficas», al doble de bundle.

Alternativa que sí cumple «preservar el archivo original»:
`SheetEditor.flushGridToWorkbook` **ya calcula exactamente qué celdas cambiaron** →
mandar ese delta a un `PATCH /uploads/:id/cells`, aplicarlo en el **servidor** con
ExcelJS (ya es dependencia de la API, coste de bundle cero), y marcar como «solo
lectura en panel» los libros que traigan `xl/charts/` o `xl/pivotCache/`. Ese mismo
delta *es* el diff del Excel: trazabilidad de la corrida sin escribir un differ de
hojas.

**No se ha implementado nada de esto.** Está para decidir antes de la Fase 3.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
