# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-11-22
- **Rama:** main
  (Adam es el único programador).
- **Producción:** sigue en `0f68a31` (2026-11-07). **NO desplegado / NO push este turno.**

## Turno claude-code — 25-11-2026: las personas del seed salen del repo público

- **Hecho (pedido de Adam):** `prisma/seed.ts` ya no trae personas, correos ni contraseña por omisión. El equipo va en un
  JSON local (`prisma/equipo.local.json` o `SEED_EQUIPO`; copia en `C:/dev/secrets/seeders/arta`). Lector: `prisma/equipo.ts`.
  Salieron del repo `new-team-members.ts`, `provision-new-users.ts` y `alta-paula-contabilidad-2310.ts` (copia local).
- **Producción:** el seed del arranque sigue con formatos y Studio; sin el JSON no crea ni toca cuentas (ya existen todas).
  Antes solo actualizaba nombre y puesto; eso ahora queda en Panel → Usuarios.
- **CI:** el stack real entra con una cuenta inventada (`test/equipo-prueba.json`) y contraseña nueva en cada corrida.
- **Pruebas:** API 1,227; tipos de API y web; seed en Postgres desechable con equipo, sin equipo y repetido. El bloque
  «alta de Paula» de `roles-junta-2310.access.spec.ts` salió con su dato; lo cubre `equipo-local.spec.ts`.
- **Sin desplegar.** El historial de git conserva lo anterior.

## Turno cursor (2026-11-22 noche): paridad responsable de formatos

Adam: CONTINUAR noche 22-11; 1-3 huecos + tests; commits locales OK; sin push/deploy; ollama_implement→revisar→Write.

### Hecho
- Entrada: `git pull --rebase` (laptop estaba en `7507d40`, pasó a `6f1b906` + relevo verificación previo `656efbf`). Árbol limpio.
- **Hueco cerrado (API/web 21-11 ya tenían `owner`/`dueAt`; apps no):**
  1. **Android:** `EventChecklistRef.owner` + `dueAt`; helper `ChecklistAssignment.kt` (`checklistAssignmentLine` / `assignmentLine`); ficha de formato en `EventDetailScreen` muestra «Lo debe … · vence…».
  2. **iOS:** mismos campos + `assignmentLine()` en `EventChecklistRef`; lista de formatos en `EventDetailView` igual.
  3. **API test:** `checklistNotice('assigned')` en `notification-text.spec.ts`.
- **Pruebas:** `notification-text.spec.ts` **29/29**; Android `EventModulesDtoTest` (incluye `readsChecklistOwnerAndDue`) **BUILD SUCCESSFUL**.
- Ollama: draft `ChecklistAssignment` emitido; flota noche saturó contexto (4096) y el ticket global — apply final revisado a mano sobre el draft.

### Paridad
- **Web:** ya mostraba responsable (ChecklistPicker / Lo siguiente) — no toqué.
- **API:** ya manda `owner`/`dueAt` y aviso `checklist.assigned` → web con `?tab=checklists&checklist=` — no toqué.
- **Android / iOS:** ahora leen y pintan responsable+fecha en el resumen del evento; abrir formato sigue en web (contrato híbrido).
- **Asignar** responsable sigue solo en web (nativo no edita formatos).

### Siguiente
- Desplegar + migración `20261121000000_formato_responsable` cuando Adam lo pida.
- Capturas de tienda monocromo (Play/App Store) con OK de Adam.
- Opcional: alta nativa de responsable (PATCH assignment) si Adam quiere menos web.

### No tocar
- Push, deploy, firmas, secretos, `uploads/`.

---

- **2026-11-22 (cursor) — Verificación typecheck+API+e2e 306/307; sin cascarón GPS/chat/formatos catálogo.** Ver commit `656efbf`.

- **2026-11-22 (claude-code) — Megapasadas Mosaico 1–30 + piezas base.** NO desplegado. Ver commits `7268c52`…`6f1b906`.

- **2026-11-21 (claude-code) — Responsable/fecha por formato + Finanzas OC pagadas + diseño por módulo + Mosaico.** NO desplegado.

_Turnos anteriores: `git log -p -- .ai/RELEVO.md`._
