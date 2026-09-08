# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-08
- **Rama:** main

## Hecho en este turno

**Eficiencia, medida antes y después. Y deploy.**

### 1. El 72 % del payload del evento era material que nadie mira

`GET /events/:id` traía, por cada formato del show: el `dataJson` completo, el
`schemaJson` **entero** de la plantilla, el mapa de campos del PDF y **las dos
firmas, que llevan la imagen en base64 dentro**. De todo eso la lista solo pinta
`template.key`. Cuando se abre un formato, el panel ya pedía
`GET /checklists/:id` aparte — así que era trabajo tirado.

Y el panel **recarga el evento entero después de cada guardado: 27 sitios**. O
sea que el desperdicio se multiplicaba por cada casilla marcada.

Medido sobre la base sembrada (13 formatos vacíos, sin firmas):
**45.0 KB → 9.9 KB, −78 %.** En un show real con formatos llenos y firmados es
bastante más, porque una firma es un PNG en base64.

También: el historial de tareas venía con 80 movimientos por tarea aunque el
panel lo pinta colapsado. Ahora son los 12 últimos.

### 2. La librería de Excel viajaba en cada carga del evento

`FileViewer` y `SheetEditor` importan `xlsx` de forma estática, y los cuatro
paneles del evento los importaban a su vez. Más `finance-import` y
`campaign-sheet-template`, que la página importaba directo. Resultado: **quien
abría un evento se bajaba `xlsx` entero aunque no tocara una hoja**.

Se veía en el build: `/events/[id]` pesaba **317 kB** de First Load contra
~117 kB de cualquier otra pantalla; `/campaigns` y `/folders`, 270 y 266 kB.

Tres cambios:
- `components/files/lazy.tsx` — los cinco editores por `next/dynamic`.
- `components/events/lazy-panels.tsx` — los ocho paneles que no son Resumen.
  Solo se pinta una pestaña a la vez; no hacía falta traer las nueve.
- `lib/campaign-concepts.ts` — el catálogo de conceptos y precios **sin `xlsx`**.
  Estaba dentro del módulo que genera el libro, así que la tabla de precios
  arrastraba la librería entera. El generador se carga al pulsar «Nueva hoja de
  gastos», y `importFinanceFromFile` al importar.

**`/events/[id]`: 317 kB → 133 kB (−58 %). `/campaigns`: 270 → 122 kB.
`/folders`: 266 → 118 kB.** La pantalla más usada del panel ya pesa lo mismo
que las demás.

### 3. Verde

174 unitarias · Playwright **38 de 40** (los 2 rojos son los SSR de siempre, que
piden el API en `127.0.0.1:4000`) · `tsc --noEmit` limpio en api y web.

## A medias

1. **Fórmulas al insertar/borrar filas en Excel embebido.** Sigue siendo el
   fallo más serio del editor.
2. **Precios campaña interno/externo sin llenar** — falta la lista de Arta.
3. **No se puede pasar un evento de borrador a activo.** Los nuevos nacen
   `ACTIVE`; el `PATCH` no acepta `status` a propósito (evita saltarse
   `EVENT_CLOSE`), así que haría falta un endpoint propio.
4. Estados oráculo solo en checklists; `locked` sigue en `FinanceRun`;
   `EventDocument` sin revisiones.
5. Auditoría incompleta fuera de OC/checklists.
6. **`sponsor-convenio-template` sigue trayendo `xlsx` estático** en
   `EventSponsorsPanel`. Ya no pesa en la carga inicial porque el panel es
   diferido, pero cuando alguien abre Convenios se baja la librería entera; el
   mismo corte que se hizo en campaña le vendría bien.

## Siguiente paso

1. **Backfill del avance** — sigue sin correr:
   ```
   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
     scripts/backfill-checklist-progress.ts --dry
   ```
   ⚠️ Los porcentajes **bajan** y las alertas de riesgo **suben** el mismo día.
   Avisar al equipo antes y silenciar digests 24 h. No se corrió en este deploy
   a propósito: mueve todos los números que ve el equipo y eso se avisa.
2. **Revisar las fechas ya guardadas.** Si el contenedor venía corriendo en UTC,
   los shows capturados antes del arreglo de zona horaria pueden estar 6 h
   adelantados. Mirar un par contra el cartel real.
3. **Fijar `TZ=America/Mexico_City`** en el contenedor del API: el arreglo de
   fechas ya no depende de ello, pero los digests y PDFs que formatea el
   servidor sí.
4. Smoke con el equipo: mover la fecha de un show, pedir una OC en efectivo (no
   debe pedir comprobante) y abrir una hoja de campaña.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
