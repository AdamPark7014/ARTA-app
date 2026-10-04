# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-10-04
- **Rama:** main
  (Adam es el único programador).
- **Producción:** `4745dd4` desplegado desde `main` el 2026-09-27 22:39 UTC (lo de abajo NO está desplegado)

## Turno cursor (2026-10-04): chat Android v2 según `docs/CHAT-V2-CONTRATO.md` (sin push ni release)

- Commits: `4677826` (conversación), `a030df9` (búsqueda, guardados, nueva conversación), `e2bf445` (lista,
  info del canal, rutas, imágenes), `03c8600` (vistas previas y avatar de grupo). Solo se tocó
  `ui/chat/**`, `data/api/ArtaApi.kt`, `data/realtime/RealtimeClient.kt` y rutas en `ui/ArtaApp.kt`.
  `4677826` arrastró sin querer los campos `entities`/`permissions` de `UserDto` que otro agente tenía sin
  commitear en `ArtaApi.kt` (aditivos, se dejaron).
- **No se corrió `relevo cerrar`** (hace `git add -A` y metería el Swift sin commitear del agente de iOS).
- Pantallas nuevas: `ChatSearchScreen`, `SavedMessagesScreen`, `NewConversationScreen` (DM, grupo 2–8,
  canal), `ChannelInfoScreen`. Rutas literales `chat/buscar`, `chat/guardados`, `chat/nueva`,
  `chat/{id}/info` declaradas antes de `chat/{channelId}?msg=`: así `HomeScreen` no cambia (sigue usando
  `openChat(id)`); las constantes están en `ChatRoutes` (`ConversationScreen.kt`).
- Hecho: secciones Canales / Eventos / Mensajes directos / Explorar canales, No molestar, presencia,
  markdown §7, chips de mención, citas con deslizar, guardados, vista previa de enlaces, emojis completos,
  borradores por canal (8000), visor con zoom y paginado, «Visto / Visto por N», «Mensaje eliminado»,
  divisor de no leídos y «↓ N nuevos», esqueleto / vacío / error con «Reintentar», imágenes sin recorte.
- Verificación: `gradlew :app:compileDebugKotlin` limpio (con `--rerun-tasks`). **No se probó en
  dispositivo ni contra el API v2 real.** Pendiente: abrir un canal de «Explorar canales» del que no se es
  miembro (depende de cómo responda el API), y revisar a ojo todo lo anterior.

## Turno cursor (2026-10-04): chat web v2 según `docs/CHAT-V2-CONTRATO.md` (commit `93a78bd`, sin push ni deploy)

- Varios agentes trabajan a la vez en este checkout (API del chat, Android, iOS). Este turno solo tocó
  `apps/web/app/(app)/chat/page.tsx`, `apps/web/components/chat/**` y `apps/web/styles/_chat.scss`.
  **No se corrió `relevo cerrar`** porque hace `git add -A` y metería el trabajo sin commitear de los otros.
- `page.tsx` queda como orquestador. Componentes nuevos: `Composer`, `MessageList`, `ChatPanels`
  (fijados, guardados, info del canal), `ChatDialogs` (nueva conversación, Ctrl+K), `EmojiPicker` +
  `emoji-data` (local, sin CDN), `chat-markdown` (parser puro, sin `dangerouslySetInnerHTML`), `chat-ui`.
- Hecho:
  - Menciones `[@Nombre](user:id)` como chips dorados, autocompletado con teclado y `@canal` para moderadores.
  - Markdown del §7; 8 reacciones rápidas más el picker completo; quién reaccionó al pasar el cursor.
  - Responder citando (`replyToId`); guardados (`GET /chat/saved`).
  - Nuevas conversaciones: DM, grupo de 2 a 8 personas (`POST /chat/group-dm`) y canal con `memberIds`.
  - Info del canal: editar, miembros con presencia, agregar o quitar, salir, archivar, silenciar 8 h, 1 semana o siempre.
  - Presencia (`GET /chat/presence` + `chat:presence`); divisor «Mensajes nuevos» y botón «↓ N nuevos».
  - Vista previa de enlaces (`GET /chat/link-preview`) y borradores por canal.
  - Visor con zoom, arrastre y deslizar; reintento de subidas; «Mensaje eliminado».
  - No molestar (`/chat/prefs`); esqueleto, vacío y error con «Reintentar».
  - Atajos: Ctrl+K, Esc y flecha arriba para editar. A 390 px se ve como lista y conversación, con hojas a pantalla completa.
- Todo campo nuevo del contrato se trata como opcional: la página funciona con el API actual.
- Verificación: `npx -w apps/web tsc --noEmit -p tsconfig.json` limpio; `_chat.scss` compila con sass.
  `apps/web` no tiene script de lint; no hay e2e de chat. **No se revisó en navegador.**
- A medias o dependiente del API: presencia con `online` (hoy el servidor manda `status`; la web ignora el
  socket hasta que responda `GET /chat/presence`), `deleted: true` en `chat:message-updated`, `isGroupDm`,
  `replyTo` en la respuesta, `saved`, `/chat/prefs` y `/chat/link-preview`. Falta una e2e del chat y
  revisarlo a ojo en escritorio y a 390 px.

## Turno claude-code (2026-10-04, 11:50): Firebase de ARTA y apps móviles

- **Proyecto Firebase `arta-app-fde07`** (cuenta de Adam), sin Gemini ni Analytics; Cloud Messaging V1
  habilitado. Apps registradas: Android e iOS, las dos `com.artaproducciones.ops`.
- `android/app/google-services.json` e `ios/Resources/GoogleService-Info.plist` **ahora se versionan**
  (como NEXARA; son config de cliente). Con eso el CI de iOS deja de fallar por el plist.
- Primera corrida de «iOS · compilar» (run 37221297263): falló SOLO porque faltaba el plist; no llegó a
  compilar Swift. Hay que relanzarla después de este commit.
- **Pendiente de Adam**: (1) la clave de la cuenta de servicio se pegó en el chat → generar una nueva,
  subirla con `pwsh -File deploy/firebase-cuenta-servicio.ps1` y borrar la vieja (`73faf0e2…`) en Google
  Cloud; hoy el API sigue con «Push FCM apagado». (2) Clave APNs `.p8` en Firebase → Cloud Messaging.
- **Cursor está haciendo la paridad web ↔ app (Android e iOS)**. Después: compilar y publicar con las
  cuentas de NEXARA (App Store Connect / Play Console). Falta para publicar: App ID y perfil de
  `com.artaproducciones.ops` en el equipo de Apple de NEXARA, flujo `ios-testflight.yml` de ARTA con sus
  secretos, ficha en Play Console y llave de firma de Android (`key.properties` no existe: hoy el
  release sale firmado con la de debug).

## Turno claude-code (2026-10-04): «Correcciones Dashboard 30 de SEP 2026» (PDF del cliente)

PDF `Downloads\Dashboard ARTA 30 de SEP 2026.pdf`, seis puntos. Los seis hechos, con pruebas, en `main`
y **SIN desplegar** (commits `b3b9ca3` y el de cierre de este turno):

1. **Crear evento · un horario por función**: `EventFields.tsx` pide «Función 1 · horario», «Función 2 ·
   horario»… según «Funciones» (tope 12). `Event.schedule` guarda `Función 1 — 16:00 · Función 2 — 20:00`
   (una función: solo `20:00`); `startsAt` = fecha + primera hora. En los formatos, `eventTimeValue`
   lo lee «16:00 y 20:00». Eventos viejos «14:00 a 23:00»: se toma la apertura.
2. **Sin «Horario · cierra»**: quitado del formulario (crear y editar).
3. **Rueda de prensa**: catálogo v3 (`STANDARD_FORMAT_VERSION = 3`) — sección `convocatoria` (Encargado,
   Drive de contenido para rueda) como primer rubro y `timeline` (tablas Antes / Durante / Después:
   hora, actividad, responsable) después de Medios confirmados. **Tras desplegar hay que correr**
   `scripts/upgrade-format-templates.ts --dry` y luego `--confirm-produccion` (sube las 9 plantillas a v3
   y migra borradores conservando respuestas).
4. **Tareas a 1 o más personas**: tabla `TaskCoAssignee` (migración `20261004120000_task_co_assignees`,
   solo tabla nueva). `assigneeId` sigue siendo la persona principal; el API acepta `assigneeIds[]`
   (create/PATCH) y devuelve `assigneeIds` + `assignees`. Todos la ven en «Mis tareas», reciben avisos,
   pueden entregar; si quien pidió también la tiene, no pide visto bueno. Web: `AssigneesPicker`
   (casillas + buscador; en filas guarda al cerrar). `AssigneeSelect` se borró (sin usos).

5. **Campañas · «no permite agregar columnas ni filas sin que mueva todo el orden; que se parezca a
   Excel»**. Causa: insertar una fila solo movía VALORES en el panel; al guardar, el delta de celdas se
   escribía en las posiciones nuevas pero el formato, las combinadas y las fórmulas se quedaban donde
   estaban (la banda negra del TOTAL acababa sobre un concepto y la suma apuntaba mal).
   - Regla única `sheet-ops.ts`, **duplicada a propósito e idéntica** en `apps/api/src/uploads/` y
     `apps/web/lib/` (`sheet-ops.spec.ts` falla si difieren): recorre índices, rangos, combinadas y
     fórmulas (incluye otras hojas y `#REF!`) como Excel, más una regla propia: un concepto insertado
     justo arriba del TOTAL o antes del primero ENTRA en la suma (Excel lo dejaría fuera).
   - Servidor: `xlsx-structure.ts` (`applySheetOp`) hace foto de la hoja y la reescribe en su lugar
     nuevo (valores, estilos, alto/ancho, combinadas, fórmulas, formato condicional, validaciones,
     imágenes, nombres definidos). No usa `spliceRows` de ExcelJS (deja combinadas rotas). El parche
     `PATCH /uploads/:id/cells` ahora es `{ sheets?, ops?, cells }`: primero hojas agregadas/renombradas
     (antes «+ Hoja» y «Renombrar» daban 400 al guardar), luego filas/columnas, luego celdas ya en su
     posición final. Lo insertado copia el formato de la vecina que elige el panel (`styleFrom`).
     Probado con los Excel reales del cliente (campaña, corrida, pendones): insertar y eliminar deja
     la hoja idéntica (celdas, combinadas, fórmulas, imágenes).
   - Panel (`SheetEditor.tsx` reescrito; helpers en `lib/sheet-grid.ts`): se usa como Excel — clic
     selecciona y escribir reemplaza, doble clic/F2 edita dentro, flechas/Enter/Tab, Mayús+clic o
     arrastre para rangos, clic en número de fila/letra de columna, **clic derecho** con insertar/
     eliminar/duplicar/vaciar, Ctrl+C/V con Excel (TSV; dentro de la hoja las fórmulas se trasladan),
     Ctrl+Z/Y (también deshace filas/columnas), Ctrl+D, ancho de columna arrastrable (doble clic
     autoajusta), barra de estado con Suma/Promedio/Cuenta del rango. Cinta simple: Filas / Columnas /
     «+ Concepto» (renglón debajo con las MISMAS fórmulas recorridas, sirve para cualquier plantilla).
     Quitados: «Vista con formato», «Calcular fila», «Σ COSTO TOTAL», «Sumar columna» (la barra de estado
     suma lo seleccionado). Cada celda sigue siendo un `<input aria-label="Celda A1">` (las e2e lo usan).
     También se arregló: «1,000» se leía como 1 y una celda vaciada seguía mostrando el valor viejo.

Verificación: Jest API 46 suites / 348 pruebas en verde (nuevas: `sheet-ops.spec`, `xlsx-structure.spec`,
tareas, avisos, catálogo, horario). `tsc` web y API limpios, `next build` en verde. E2E nuevas
`correcciones-0930.spec.ts` (crear evento con 2 funciones; insertar fila en campaña, escribir, Ctrl+Z) y
`tasks.spec.ts` (asignar a 1 y a 2 personas): 5/5 en verde contra el build en el puerto 3101.
**E2E viejas que fallan y NO son de este turno** (buscan UI que ya no existía en `9fd0ed3`: «Empieza»,
`.event-facts`, «Editar aquí», «Archivos (1)», «Mostrar tabla simple», fondo oscuro en la cuadrícula):
`app-shell` (2), `editors` (3), `event-edit` (5), `excel-hf`, `hotfix-sheet-editor` (los valores sí
pasan; falla su guarda de «fondo oscuro»), `hub-critical` (5). Pendiente para Cursor: actualizarlas.

### Para desplegar (no se hizo: hay migración y un script que toca datos de producción)

1. Bundle + `update.sh --no-pull` como siempre (respalda la base). Aplica la migración
   `20261004120000_task_co_assignees` (solo tabla nueva).
2. En `arta-api`: `scripts/upgrade-format-templates.ts --dry`, revisar, y luego `--confirm-produccion`
   (Rueda de Prensa v3: Convocatoria + Timeline).
3. Probar en producción con un Excel de campaña real: insertar fila arriba del TOTAL → Guardar → que el
   TOTAL baje con su banda y su suma, y «Salir en PDF».

## Regla de ramas (pedido de Adam, 2026-09-27)

- Todo el trabajo va a `main`. No crear ramas `cursor/*`, `feature/*` ni `hotfix/*`.
- Commit en `main`, `git push origin main` y deploy desde `main`.
- El servidor (`/var/www/arta-app`) está en `main`, sin otras ramas.

## Turno claude-code (2026-09-27, 17:20): notas de calendario del equipo + cuadrícula del Excel con el estilo real

Adam pidió dos cosas seguidas:

1. «igual ayudame a que el equipo pueda escribir sobre el calendario por favor»
2. «ayudame a que cuadre y se vea asi el excel y ademas que no puedo agregar columnas y
   filas y que el pdf se vea productivo no diga excel asi todo raro mejora el formato»

**Notas de calendario** (nuevo, de cero):
- Modelo `CalendarNote` (migración `20260927220000_calendar_notes`, solo tablas/índices
  nuevos) + `CalendarController` (`GET/POST/PATCH/DELETE /calendar/notes`) con las mismas
  reglas de acceso que el resto (`canAccessEventOps`, `assertSameTenant`); cualquiera con
  acceso a la entidad puede escribir, editar o borrar la nota de un compañero (es del
  equipo, no de quien la escribió). 8 tests en verde
  (`src/calendar/calendar.controller.spec.ts`), incluyendo que `dir_auditorio` sigue sin
  poder tocar notas de `ARTA` y que un organizador de otra organización no entra.
- `MonthCalendar` gana `onDayClick`/`renderDay` (opcionales, no rompen su otro uso en
  Campañas); `calendar/page.tsx` pinta las notas como chips en cada día con un mini-form
  (Guardar/Cancelar/Eliminar, Ctrl+Enter para guardar).

**Título sin «(Excel)» feo**: `cleanDisplayTitle()` en `pdf-branding.service.ts` (4 tests)
quita el sufijo `(Excel|Word|PDF|xlsx…)` del nombre visible; se usa tanto en el título
impreso del PDF como en el nombre de archivo de salida.

**No se podían agregar filas/columnas**: la barra `.sheet-tools` (+Fila, +Columna, +10 al
final) vivía FUERA de `.sheet-chrome`, que es `position: sticky`; en una hoja alta la barra
se iba scroll abajo y quedaba inalcanzable. Se movió el JSX de `.sheet-tools` adentro de
`.sheet-chrome` (después de `.sheet-fxbar`) + ajuste de borde en `globals.scss`.

**«que cuadre y se vea así» (el editor debía verse como el PDF)**: SheetJS Community
(cliente) no trae estilos, solo valores/merges/anchos aproximados. Nuevo endpoint
`GET /uploads/:id/layout` (sin efectos, mismo chequeo de acceso que `exportPdf`) que corre
el `buildSheetModel` de `sheet-layout.ts` — el mismo que arma el PDF — y regresa por hoja:
anchos reales de columna (en puntos) y cada celda maestra con su `rowSpan`/`colSpan`,
negrita, cursiva, alineación, color, relleno y bordes. `SheetEditor.tsx` lo consume
(`serverLayouts`, useEffect no bloqueante — si falla, se ve como antes) y en el render:
- las celdas cubiertas por un merge del servidor no se dibujan;
- la celda maestra sale con `rowSpan`/`colSpan`, fondo, bordes y (`.sheet__cell--styled`
  + variables CSS, porque `.sheet__cell` fuerza `color` con `!important`) negrita/cursiva/
  color/alineación reales;
- los anchos de columna (`effectiveColPx`) usan el ancho real del libro (pt → px) cuando el
  servidor lo conoce, y el cálculo por contenido de siempre para el resto;
- todo lo que el servidor no conoce (hoja sin evento, celda no vista) se ve exactamente
  igual que antes — no hay regresión si `/layout` no responde.
- `tsc --noEmit` limpio en `apps/api` y `apps/web`; jest de `calendar`/`pdf-branding` en
  verde (12/12).
- **Desplegado `4745dd4` a producción 27-09 22:39 UTC**: bundle + `update.sh --no-pull`
  (respaldo automático de la BD). `arta-api`/`arta-web` sanos; migración `CalendarNote`
  aplicada y verificada en la BD de producción (`\dt "CalendarNote"` en `arta-db`).
  Verifiqué `buildSheetModel` (lo que sirve `/uploads/:id/layout`) corriéndolo dentro de
  `arta-api` contra el Excel real de pendones (`DISTRIBUCION_PENDONES.xlsx`): trae los 4
  merges reales (título 5×5, banda 1×5, columna lateral 10×1), negrita donde toca y los
  rellenos `#000000`/`#F2F2F2` — coincide con el PDF. No hice login en producción para
  verlo desde el navegador (no tengo ni debo usar la contraseña real de Adam en un sitio que
  no es localhost); falta que Adam lo confirme a ojo en un evento real con Excel. Tampoco se
  pudo levantar el stack local (los puertos 3000/4000/5432 del docker-compose de ARTA los
  ocupan ahora los contenedores de NEXARA-dev).

## Turno claude-code (2026-09-27, 15:30): «Salir en PDF» daba 500 y la cuadrícula llena de vacíos

Adam, con el editor del Excel de pendones: «server error, y muestra solo las casillas escritas
en el Excel con posibilidad de ampliarse».
- **500**: `exportPdf` anotaba una `DocRevision` sobre el Excel de origen con la versión del
  Excel, que no cambia al exportar; la segunda exportación chocaba con la única
  (`docType, docId, revision`). Ahora la exportación queda en el `auditLog`
  (`file.export.pdf`) y en la revisión del PDF de salida (que sí sube de versión), y
  `recordFileRevision` ignora un P2002 en vez de tumbar la operación.
- **Cuadrícula**: `SheetEditor` rellenaba 24 filas × 9 columnas mínimo. Ahora `trimGrid`
  recorta filas y columnas vacías del final y muestra solo lo escrito (más una fila libre si
  se puede editar); «+ Fila», «+ 10 al final» y «+ Columna al final» amplían.
- e2e: `checklist-sheet` 3/3 en verde (build real, puerto 3101 porque el 3100 lo ocupa ahora el
  Docker local). `editors.spec` y `excel-hf.spec` **fallan desde antes**: piden el botón «Editar
  aquí» (ya es «Editar»; corregido) y cargan el Excel por `/api/files/:id/inline` (PR #5),
  ruta que su mock no responde → la celda A1 recibe «[]». Pendiente para Cursor: stub de
  `files/:id/inline` en `support/mock-api.ts` o en esos specs.
- **Desplegado `99c43b8` a producción 27-09 15:37**: api y web sanos, el `dist` incluye el
  arreglo (`file.export.pdf`). Falta que Adam pulse «Salir en PDF» en pendones para confirmar.

## Turno claude-code (2026-09-27, 14:00): PDFs «horribles» y hoja en blanco

Adam, con el PDF de `Distribución de Pendones (Excel)` en producción: «tus pdfs salen
horribles raros y además dejan hoja en blanco al inicio».
- Causa 1 (hoja en blanco): `PdfBrandingService.drawHeaderFooter` (PR #3) escribía el pie en
  `y=570` fijo; en carta apaisada eso cae bajo el margen y pdfkit abre página nueva. Ahora
  el servicio usa `doc.page.width/height`, pinta el pie con el margen inferior en cero
  (`inFooterZone`) y trae la marca real (logo, banda, «Página n de N»). Lo usan documentos,
  boletera, historial y Excel.
- Causa 2 (raro): el exportador de Excel recorría celda por celda: el título combinado
  A1:E5 salía 25 veces, anchos iguales, sin estilos, fórmulas vacías. Nuevo
  `sheet-layout.ts` (modelo de hoja: merges, anchos/altos, estilos, bordes, formatos de
  número, fórmulas con `fast-formula-parser`, fórmulas compartidas trasladadas, imágenes
  ancladas) + `excel-pdf.service.ts` reescrito (ajuste a lo ancho, apaisado si hace falta,
  encoger antes de cortar, paginación por filas). `scripts/render-sheet-samples.ts`.
- Causa 3: Cursor había enganchado ese servicio de marca al PDF de checklists **encima** de
  la primera página que ya tenía logo y título: salía texto plano, pie a media página y
  «BORRADOR» gigante. Restaurado `newPage(cur, true)`; el folio de Cursor se imprime en
  el pie; la marca de agua de borrador queda tenue (9 %).
- Pruebas: `sheet-layout.spec.ts` (con los libros base del cliente) y
  `excel-pdf.service.spec.ts` (sin hoja en blanco, conteo de páginas). Jest API en verde.
- Revisado a ojo: pendones (1 página, título una vez, totales), corrida (apaisada,
  moneda, banda negra con texto blanco, logo), campaña (2 páginas), checklist Hospedaje.
- **Desplegado `88ec1c3` a producción 27-09 14:24** (bundle + `update.sh --no-pull`,
  respaldo automático del deploy). api y web sanos; el Excel real de pendones impreso en el
  contenedor con el exportador nuevo: 1 página, sin hoja en blanco. Adam debe volver a
  pulsar «Salir en PDF» en cada Excel para regenerar los PDF ya existentes.

## Turno claude-code (2026-09-27, 12:30): retomar tras Cursor

- Mi trabajo del 24-09 (campos de texto que crecen, Catering y Mantenimiento con campos y
  tablas en el catálogo v2, Corrida y Campaña abriendo en el editor de hoja, filtro de
  formatos retirados corregido) lo rescató Cursor en `e7d27f6` y está en `main`; Cursor
  siguió encima (PR #2, #3, #5) y lo desplegó. Verificado en producción: Catering y
  Mantenimiento ya en v2 (plantillas e instancias), `upgrade-format-templates.ts --dry`
  → «9 ya al día · 0 migrados · 11 sellados intactos». Nada que correr.
- Quitado `apps/web/e2e/_shot.spec.ts` (spec temporal de capturas que entró en el rescate).
- Regla «solo main» revisada: ya está en `~/.claude/CLAUDE.md` (regla 5), `C:\dev\CLAUDE.md`,
  `GIT-SOLO-MAIN.md` y el hook; guardada también como memoria por defecto de Claude. Se
  quitaron los restos de «un writer por worktree» en `.cursor/rules/fusion-boot.mdc`,
  `packet.ps1` y `boot-fusion.ps1`, y la sección Worktrees del EXEC-PACKET dice «no aplica».

## Turno cursor (2026-09-27)

Pedido: «todo mergeado y fusionado, canónico en `main`; no quiero ramas sobreescribiéndose».

### Limpieza de ramas
- Sin copias de ramas (pedido de Adam: todo canónico en `main`).
- `feature/mobile-chat-push` fusionada en `main` por fast-forward y borrada.
- GitHub iba 11 commits atrás (sin el chat ni las apps móviles). Ahora `origin/main` está al día.
- Borradas de GitHub porque ya estaban en `main` (se comparó el contenido, no solo el historial):
  - `cursor/new-formats-import-excel-docx-37b5`: idéntica al PR #2.
  - `cursor/formats-professionalization-37b5`: idéntica al PR #3.
  - `cursor/fix-boot-di-and-scripts-d788`: el PR #4; solo le sobraban notas viejas de RELEVO.
  - `cursor/doc-campaign-locks-cd94`: idéntica a `bf03c56`.
  - `hotfix/sheet-editor-dark-contrast`: el PR #6, ya fusionado.

### PR #5 `cursor/excel-professional-ui-ff0d` fusionado en `main` (decisión de Adam)
- Se trae todo **menos el editor y el evaluador de Excel**, que se quedan como en producción (PR #6):
  - `SheetEditor.tsx`, `lib/sheet-evaluator.ts` y `types/fast-formula-parser.d.ts` = versión de `main`.
  - Motivo: las dos ramas rehicieron el evaluador de fórmulas en paralelo (`createEvaluator` frente a
    `buildDisplayGrid`) y el editor chocaba en 15 puntos. Se protege Campaña/Corrida en producción.
- Lo que entra del PR #5:
  - Word: las tablas del `.docx` se importan y se editan como tablas (`documents.controller`, `DocEditor`).
  - Mejoras en `FileViewer`, `FormatSheet`, checklists y carpetas.
  - `GET folders/files/:id/inline`, con controles de organización, entidad, roles y ruta dentro de uploads.
  - `files/:id/inline`: un archivo sin evento ahora solo lo abre dirección (antes, cualquier usuario con sesión).
  - Workflow de CI, pruebas e2e (`real-stack-files`, `excel-snapshots`, `docx-viewer`…) y `test/excel-evaluator.spec.ts`.
  - Página interna `/dev/sheet-snap` (con login) y capturas en `docs/pr5-screens/`.
- Dependencias:
  - web: `docx-preview`; en desarrollo, `@types/pngjs`, `jszip` y `mammoth`.
  - api: `fast-formula-parser`.
- Verificación:
  - `tsc` web y API limpios; `next build` en verde.
  - Jest API 303 en verde y 1 omitido.
  - Las e2e de Playwright del PR #5 no se corrieron. Algunas (`excel-snapshots`, `real-stack-files`)
    esperan el editor del PR #5 y pueden fallar contra el editor de producción. Revisarlas o quitarlas
    si molestan en CI.

### Turno anterior (mismo día): paridad web y móvil del chat
- Chat web sobre `chat/channels/*` + socket: hilos, reacciones, fijados, «escribiendo…», «Visto».
- Adjuntos nativos (fotos HEIC, video, notas de voz m4a/WAV, Office, zip) en web, Android e iOS.
- Campana web en vivo y aviso de escritorio. Push de procesos: evento cerrado, reabierto, cancelado o
  reprogramado; anticipos; comprobantes de OC.
- Desplegado `735c8c7` el 2026-09-27 06:40 UTC. Respaldo `/root/arta-backups/20260927-0640.sql.gz`.

## Deploy

- `f5e0c52` desplegado desde `main` (bundle + `update.sh --no-pull`) el 2026-09-27 14:54 UTC.
- Respaldo de la base: `/root/arta-backups/20260927-1454.sql.gz`.
- Estado tras el deploy:
  - Sin migraciones pendientes; «Nest application successfully started»; api, web y db healthy.
  - `/api/ready` 200, `/login` 200, `/chat` sin sesión → `/login?next=%2Fchat`.
  - Socket.IO con el Origin de la web responde 200. `folders/files/:id/inline` sin sesión responde 401.
- El servidor solo tiene `main`; se borró la referencia vieja `remotes/bundle/main`.
- Rollback: `bash deploy/rollback.sh` (añadir `--dump 20260927-1454.sql.gz` para restaurar también la base).

## A medias

1. **Push apagado en producción**: `FIREBASE_SERVICE_ACCOUNT_JSON` no está en `deploy/.env.arta` del
   servidor. Adam lo añade (no el agente) y reinicia el API:
   `docker compose --env-file deploy/.env.arta -f deploy/docker-compose.arta.yml up -d api`.
2. **iOS nunca se ha compilado**: lanzar `ios-build.yml` (workflow_dispatch) y corregir.
3. Web Push con el navegador cerrado (VAPID y service worker): no está hecho.
4. Android y iOS sin probar en dispositivo real.
5. Las e2e del PR #5 están sin revisar contra el editor de Excel de producción.

## Siguiente paso

1. Adam: Firebase de ARTA (Android e iOS, clave APNs `.p8`) y la cuenta de servicio en `.env.arta`.
   Pasos en `apps/mobile-native/README.md`.
2. Correr «iOS · compilar» en GitHub Actions hasta verde.
3. Probar en teléfonos: adjuntos en ambos sentidos, responder desde la notificación y leído sincronizado.
4. Revisar visualmente en producción las tablas de Word y el visor de Excel (Campaña y Corrida).
5. Pendientes de antes: deploy key de ARTA en GitHub, quitar `[SEED_DEMO]` con visto bueno.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` a un repo de app.
- No mover Traefik de puerto.
- Conceptos de campaña: no romper al tocar Excel. El editor y el evaluador de Excel son los del PR #6.
- Credenciales de Firebase: nunca en git.
  - `google-services.json` y `GoogleService-Info.plist` están en `.gitignore`.
  - La cuenta de servicio solo va por variable de entorno.
- No crear ramas: todo va a `main`.
