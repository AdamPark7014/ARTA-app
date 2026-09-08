# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-08
- **Rama:** main

## Hecho en este turno

**El evento por fin se puede editar, y se ve sin tener que abrir un formulario.**

### 1. La fecha del show no se podía cambiar

El API aceptaba `startsAt`, `endsAt` y `campaignType` **desde siempre**; el panel
nunca los mandaba. Así que la fecha de un show y el tipo de campaña solo se
podían fijar **al crear el evento**: si el show se movía de fecha —que es la
mitad de la operación— no había arreglo salvo borrarlo y rehacerlo, perdiendo
formatos, órdenes, archivos e historial.

Ahora se editan desde el evento, con la validación de que el fin no puede ir
antes del inicio, y `endsAt` acepta `null` explícito para poder **quitar** una
fecha de fin puesta por error (antes se quedaba para siempre).

### 2. Bug de zona horaria en las fechas

El formulario mandaba lo que escupe un `<input type="datetime-local">`:
`2026-09-19T20:00`, **sin zona**. El API hacía `new Date(valor)`, que Node
interpreta en la zona del proceso. En una laptop de Puebla salía bien; en el
contenedor —que corre en UTC porque nadie fijó `TZ`— ese show de las 20:00 se
guardaba como 20:00Z, o sea **las 14:00 de Puebla**. Seis horas, y en shows de
noche **cambiaba el día**: el panel anunciaba el evento un día después del real.

Se manda un instante absoluto desde el navegador (`lib/event-dates.ts`), que es
el único que sabe con certeza en qué zona está la persona. Arreglado también en
**crear evento**, que es donde se capturan hoy.

### 3. «Datos del show» se ve siempre

Los datos vivían medio escondidos: el nombre y la sede salían en la cinta de
arriba, y el **promotor**, el **fin** y el **tipo de campaña** no salían en
ninguna parte — había que abrir el formulario para enterarse de qué decían.
Ahora hay una tarjeta con todo, y «Editar» la convierte en campos en el sitio.

El tipo de campaña además explica **qué hace**: decide si la hoja de gastos toma
el precio interno o el externo de cada concepto. Era justo lo que no se entendía.

### 4. «Editar datos» desde otra pestaña ya no era un botón muerto

El formulario vive en Resumen. Desde Tareas o Corrida, el botón del encabezado
encendía el modo edición contra algo que no estaba en pantalla: se apretaba y no
pasaba nada. Ahora lleva a Resumen con el formulario abierto.

### 5. El texto de una tarea se corrige donde está

El API acepta `title` y `detail`, pero el panel solo dejaba reasignar y mover la
fecha: una tarea mal escrita se quedaba mal escrita para siempre, o se borraba y
se rehacía **perdiendo su historial y su evidencia**. Ahora el título es un
botón que abre la fila en modo corrección, sin diálogo aparte —la tarea sigue a
la vista con su responsable y su fecha, que es el contexto que hace falta.

### 6. Accesibilidad de las tablas que se llenan a diario

Los `<input>` dentro de celdas solo tenían `placeholder`. Un lector de pantalla
anunciaba siete «cuadro de texto» seguidos sin decir de qué fila ni de qué
columna. Ahora cada celda se nombra sola —«Precio interno de MUPIS», «Cantidad
de Consola»— en **conceptos de campaña** y en las **partidas de OC** (captura y
edición). Las notas del evento tenían solo `placeholder`, que desaparece al
escribir: ahora llevan nombre. Y los datos del show son un `<dl>` de verdad, no
`div`s: se anuncian como «Promotor: Arta Producciones».

### 7. Pruebas

**Nuevo `e2e/event-edit.spec.ts`** (5): los datos se ven sin entrar en edición,
la fecha se mueve y viaja como instante absoluto, un fin antes del inicio no se
guarda, «Editar datos» desde otra pestaña lleva al formulario, y el texto de una
tarea se corrige en su fila.

## A medias

1. **Fórmulas al insertar/borrar filas en Excel embebido.** Sigue siendo el
   fallo más serio del editor.
2. **Precios campaña interno/externo sin llenar** — falta la lista de Arta.
3. **No se puede pasar un evento de borrador a activo.** Los nuevos nacen
   `ACTIVE`, así que solo afecta a eventos viejos o sembrados; el `PATCH` no
   acepta `status` a propósito (evita saltarse `EVENT_CLOSE`), así que haría
   falta un endpoint propio.
4. Estados oráculo solo en checklists; `locked` sigue en `FinanceRun`;
   `EventDocument` sin revisiones.
5. Auditoría incompleta fuera de OC/checklists (campañas, documentos, carpetas,
   vendor, boletera, patrocinios, roles, login).
6. Editor embebido de Excel/PDF de patrocinio (hoy Abrir / Documentos).

## Siguiente paso

1. **Deploy + `prisma migrate deploy`** en Hetzner. Migraciones acumuladas:
   tareas con evidencia, `doc_revisions_and_status`,
   `file_revisions_and_panel_editable`, `signature_content_hash` y
   `po_payment_method`.
   ⚠️ **Fijar `TZ=America/Mexico_City` en el contenedor del API** de paso: el
   arreglo de fechas ya no depende de ello, pero todo lo que el servidor
   formatee por su cuenta (digests, PDFs) sigue saliendo en la zona del proceso.
2. **Backfill del avance** tras el deploy:
   ```
   docker exec -w /app/apps/api arta-api npx ts-node --transpile-only \
     scripts/backfill-checklist-progress.ts --dry
   ```
   ⚠️ Los porcentajes bajan y las alertas de riesgo suben. Avisar el mismo día.
3. **Revisar las fechas ya guardadas en producción.** Si el contenedor corría en
   UTC, los shows capturados hasta hoy pueden estar 6 h adelantados. Vale la
   pena mirar un par contra el cartel real antes de dar por buena la agenda.
4. Smoke: mover la fecha de un show y ver que la cinta de arriba y el calendario
   dicen lo mismo.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
