# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-01
- **Rama:** main

## Hecho en este turno

**Eficiencia operativa de tareas, campañas y checklists + bugs que tumbaban pantallas.**

### 1. Tareas (`/tasks`, panel de tareas del evento)

- **Alta rápida en una línea**: título + responsable + fecha, Enter asigna. El
  resto de campos van tras «Más campos». Antes el formulario ocupaba media
  pantalla siempre.
- **Sin recargas**: marcar hecha / reasignar / cambiar fecha actualizan la fila
  en memoria con la respuesta del PATCH. Antes cada clic volvía a pedir las 300
  tareas (o el evento entero: checklists + OC + finanzas + boletera).
- **Lista de trabajo agrupada** (Vencidas / Hoy / Esta semana / Más adelante /
  Sin fecha / Hechas), con agrupar por persona y KPIs que filtran de un clic.
- **Acciones en lote**: seleccionar varias → marcar hechas, reabrir, reasignar.
- **Fecha editable en la propia fila**, sin abrir nada.
- Filtros y vista se recuerdan entre visitas (`lib/use-sticky-state.ts`).
- `AssigneeSelect` monta el directorio al enfocar: 300 tareas × 40 personas
  eran 12,000 `<option>` en el DOM.
- Se corrigió el desfase de un día en vencimientos (se guardan como medianoche
  UTC; ahora se compara la parte `YYYY-MM-DD`).

### 2. Campañas

- **Autoguardado** del editor + `Ctrl+S` + píldora de estado.
- **Aviso de cambios sin guardar** al cambiar de campaña o cerrar. Antes se
  perdía lo escrito en silencio al pulsar otra fila.
- Autorizar / quitar autorización **en ambos sentidos** y en lote; el botón solo
  aparece a quien el API deja autorizar (gerencia Arta / dirección).
- Guardar, subir y borrar archivos ya no recargan todas las campañas: se
  refresca solo esa fila (`GET /campaigns/event/:id/files`).
- Chips Todas / Pendientes / Autorizadas, columnas de presupuesto y plan.

### 3. Checklists

- **Autoguardado por inactividad** sin regenerar el PDF ni crear versión
  (`PATCH /checklists/:id` acepta `draft: true` y `regeneratePdf: false`).
  «Guardar y generar PDF» sigue siendo el guardado formal con versión.
- **Aviso de cambios sin guardar** al cambiar de formato o volver a la lista.
- **Índice de secciones** con avance x/y y salto directo.
- **Marcar / desmarcar toda una sección**, contraer completadas, filtro «solo
  pendientes» y buscador dentro del formato.
- `updateItem` pasa a actualización funcional: en lote solo sobrevivía el
  último cambio del tick.
- Guardar / firmar / regenerar ya no recargan el evento completo.
- Módulos de operación (catering, transporte, hospitality, prensa, pendones,
  arts): KPIs que filtran, orden por riesgo / avance / show cercano.

### 4. Bugs encontrados y corregidos

1. **El menú lateral se auto-escondía en la primera visita** — quien entraba por
   primera vez solo veía un filo dorado de 6 px. Ahora arranca visible; «Esconder
   menú» sigue disponible y se recuerda. *(Cambia una decisión del turno anterior:
   si se quiere de vuelta, es una línea en `AppShell.tsx`.)*
2. **Menú sin scroll propio** en escritorio: con iconos y grupos las últimas
   entradas quedaban fuera del viewport y no se podían pulsar.
3. **10 pantallas se caían con «Algo salió mal»** si el analytics llegaba
   incompleto (`/finance`, `/purchase-orders`, `/users`, `/audit` y los 6
   módulos de operación).
4. **Campos del PDF del checklist a ancho de hoja completa**: una regla
   `width/height: 100% !important` pisaba la geometría del mapa de campos, así
   que cada caja tapaba el documento entero.
5. **Al salir de pantalla completa el PDF se quedaba enorme** y desbordaba el
   panel (`.expandbox__body` sin `min-width: 0`).
6. **`npm run build` podía fallar entero** si el API contestaba algo que no era
   una lista en `/studio/public/news-index` (prerender de `feed.xml`).
7. Dos botones «Nuevo documento» idénticos en Documentos del evento.

### 5. Tests

- `apps/api`: 67/67 en verde.
- `apps/web` e2e: **26/28** (antes 10/28). Los 2 rojos son `public-site.spec.ts`
  (SSR: piden el API en `127.0.0.1:4000`, que aquí no está levantado — no es
  regresión de código).
- Se actualizaron specs que habían quedado desfasados de cambios de producto
  anteriores: menú «Inicio», checklist form-first, editores embebidos en vez de
  pantalla completa, «Guardar resumen» / «Guardar libro».

## A medias

Nada. Todo compila (`tsc --noEmit` web y api limpios) y `npm run build` pasa.

## Siguiente paso

1. Deploy y smoke con Arturo/José Luis:
   - `/tasks`: escribir tarea + Enter, marcar hechas en lote, agrupar por persona.
   - Campaña: editar y ver «Guardado hh:mm»; cambiar de fila con cambios pendientes.
   - Checklist de un evento: llenar campos y comprobar el autoguardado; luego
     «Guardar y generar PDF» y revisar el historial de versiones.
2. Confirmar con Adam si el menú lateral debe seguir visible por defecto
   (punto 4.1) o volver al auto-hide.
3. Levantar el API en local para que `public-site.spec.ts` corra completo.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
