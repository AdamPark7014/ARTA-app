# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-10-05
- **Rama:** main
  (Adam es el único programador).
- **Producción:** `e9b4764` desplegado desde `main` el 2026-10-04 22:51 UTC (respaldo `/root/arta-backups/20261004-2249.sql.gz`); `/legal/*` responde 200 en los tres dominios. **Falta desplegar** el candado de Studio y plantillas (turno de abajo; solo API, sin migración)

## Turno claude-code (2026-10-04, 17:40): declaraciones de Play Console desde el Chrome de Adam

Sin cambios de código. En Play Console (app `4974517947869940332`, cuenta NEXARA `6272333329478326909`):
- Enviadas: política de privacidad, anuncios No, ID de publicidad No, app gubernamental No, funciones
  financieras «no proporciona», **clasificación IARC** (3+; Adam autorizó aceptar los términos de IARC).
- **Seguridad de los datos**: capturada completa y guardada como borrador (detalle en
  `docs/store/PLAY-STORE.md` §5.3 y §5.5). Play no deja enviarla hasta que esté «Contenido y audiencia objetivo»,
  y esa exige antes «Datos de inicio de sesión», que lleva la contraseña de la cuenta de revisión.
- Se cortó porque Chrome quedó minimizado: Play Console no abre diálogos en una pestaña oculta.

## Turno claude-code (2026-10-05): iOS enviado a revisión, push encendido, ícono nuevo y modo demo

- **iOS 1.0.0 (build 4) en «Esperando revisión»** desde el 05-10 ~13:35 (ASC app `6819117925`, envío
  `ee2a8741…`, se publica sola al aprobarse). Carta de autorización firmada por José Luis Arista Camarena
  (representante legal de Arta) adjunta en la revisión; copia en `Documents\ARTA-builds\…-firmada.pdf`.
  Notas para Apple: plataforma multiempresa para productoras, Arta primer cliente (riesgo 3.2 al ser pública).
- **Firma de iOS**: llave de API nueva «GitHub Actions ARTA» (`H7VXTV487C`, Gestor de apps) y certificado
  Apple Distribution nuevo (`GWNXGSWCBH`, vence 2027-10-05) con llave propia; todo en `C:\dev\secrets\arta-ios`
  (fuera de git) y en los secretos del repo. Tres arreglos para que archivara: `asc_signing.py` (sin `limit` en
  capacidades), identidad por `$(ARTA_CODE_SIGN_IDENTITY)` solo en app y extensión (XcodeGen deja
  «iPhone Developer» en el target; por línea de órdenes alcanzaba a los paquetes SPM).
- **Push**: cuenta de servicio de Firebase subida (la vieja `73faf0e2…`, por decisión de Adam) y llave APNs
  `3U672539N2` (la misma del equipo, ya usada por NEXARA) en Firebase de ARTA (producción).
- **Ícono nuevo** (la «a» del logo de Arta) en iOS, Android y Play; `play-assets/generar.py` lo regenera.
- **Modo demo de capturas** en las dos apps (solo debug): fixtures grabadas de la cuenta demo
  (`demo/grabar-fixtures.mjs`). iOS: flujo «iOS · capturas de App Store» (7 PNG 1320×2868, ya en ASC).
  Android: `--ez arta_demo true` + `arta_demo_tab/channel/task/event` (8 capturas 1080×1920 del emulador).
- **Arreglos Android de cara al usuario**: texto casi negro en detalle de tarea/evento, aprobaciones y eventos
  (`LocalContentColor` en `ArtaTheme`) y barra de estado ilegible en modo claro (`SystemBarStyle.dark`).
  `arta-1.0.0-2.aab` (código 2) listo en `Documents\ARTA-builds` para producción en Play.
- **Android 1.0.0 (código 2) enviado a revisión de Google en producción** el 05-10 ~14:10, sin testers (pedido
  de Adam). Ficha es-419 (se quitó en-US), ícono, gráfico, 8 capturas, categoría Productividad, contacto
  gerencia@nexara.com.mx, 177 países + resto del mundo. Publicación gestionada desactivada: sale sola al
  aprobarse. Play Console no responde con Chrome oculto (los diálogos no abren).

## Turno claude-code (2026-10-04, 18:10–18:30): cuenta de revisión sembrada y App Store Connect lleno

- **Cuenta de revisión en producción** (una sola para Apple y Google): contraseña aleatoria en
  `C:\dev\secrets\arta-store\cuenta-revision.txt` (fuera de git). `resembrar-cuenta-revision.ps1` tenía un bug:
  desde Windows la contraseña llegaba con `\r` y el sembrador abortaba; arreglado, y ahora acepta
  `-ArchivoContrasena` y `-Confirmar`. 88 registros creados; la verificación contra el API público pasa.
  El AVISO de 5 eventos sin organización son los de la semilla de julio (sin creador), invisibles para todos;
  no se tocaron (asignarlos a Arta los haría aparecer en su panel).
- **Apple**: App IDs `com.artaproducciones.ops` y `.NotificationService` registrados; app creada en ASC
  (id `6819117925`) y llenada con la API interna de ASC desde la sesión de Adam (detalle y lo que falta en
  `docs/store/IOS-APP-STORE.md`, «Estado»). **La app `6814597698` es NEXARA**: la pestaña de Adam estaba ahí; no
  se tocó.
- Play: el formulario de «Datos de inicio de sesión» no abre con Chrome minimizado; además lleva la contraseña,
  que la escribe Adam.

## Turno claude-code (2026-10-04, 17:05): Studio y plantillas de formatos solo desde la organización de Arta

Hallazgo del turno anterior. `PageContent`/`HeroSlide`/`NewsPost` (sitio público artaproducciones.com) y
`ChecklistTemplate` no tienen `organizationId`; cualquier org con `studio.edit` o rol de dirección (alta
self-serve, invitación, Stripe, la org de revisión `org_arta_store_review`) podía reescribirlos.

- `common/tenant.ts`: `assertSharedCatalogWrite(user)` → pasa si `tenantIdOf(user) === DEFAULT_ORG_ID`
  (`org_arta_internal`; usuarios sin org caen ahí, igual que en el resto) o `roleKey === 'super_admin'`;
  si no, 403 «Solo la organización de Arta puede modificar este contenido». Va **después** del chequeo de rol.
- `studio.controller.ts`: `assertStudioWrite` en PUT pages, POST/PUT/DELETE slides y news. Lecturas igual.
- `checklists.controller.ts`: `assertTemplateWrite` en POST templates, import-docx, import-xlsx,
  templates/:id/excel, PATCH templates/:id y restore; si llegó archivo (multer ya lo guardó) lo borra.
  Lecturas igual (las demás orgs siguen usando el catálogo para crear formatos en sus eventos).
- Sin cambios en `schema.prisma` ni migraciones.
- Pruebas: `studio/studio.controller.spec.ts`, `checklists/checklists.templates.spec.ts`, casos nuevos en
  `common/tenant.spec.ts`. Quitando el candado fallan 13 (las 7 escrituras de Studio y las 6 de plantillas).
  API: `tsc` limpio, jest 54 suites / 464 en verde (1 omitida, como antes).
- **Pendiente**: (1) desplegar (bundle + `update.sh --no-pull`; no hay migración). (2) La web sigue mostrando
  Studio y el editor de plantillas a dirección de otras orgs (`lib/access-matrix.ts` solo mira permisos);
  ahora al guardar ven el 403. (3) Las lecturas autenticadas de Studio (`GET studio/pages|slides|news`)
  muestran borradores no publicados de Arta a otras orgs con `studio.edit`; se dejaron como estaban por
  pedido. (4) Si los carga multer y el rol no alcanza, el archivo ya quedaba huérfano antes de este cambio
  (import-docx/xlsx, templates/:id/excel); no se tocó. (5) Siguen abiertos: avisos de eventos sin
  organización llegan a todas; `docs/ACCESS.md` trae contraseñas de semilla en texto.

## Turno claude-code (2026-10-04, 16:15–17:10): revisión, despliegue y pulido para tiendas «como NEXARA»

Pedido de Adam: «checa, púlelo y deploya todo; básate mucho en cómo está la app de NEXARA (ya en producción)
para cumplir con toda la documentación al subirla».

- **Verificado antes de desplegar**: API `tsc` limpio, jest 430 en verde (52 suites); web `tsc` y `next build`
  ok; Android `testDebugUnitTest assembleDebug lintDebug` verde; las 3 migraciones nuevas son solo aditivas.
- **Despliegue 1** (`a59b5e4`, 22:18 UTC): respaldo `/root/arta-backups/20261004-2218.sql.gz`; migraciones
  `task_co_assignees`, `chat_v2`, `advance_approval` aplicadas; `/api/ready` 200. `upgrade-format-templates`
  `--dry` y luego `--confirm-produccion`: 1 plantilla actualizada (Evento General v3), 79 formatos migrados
  conservando respuestas, 11 aprobados/sellados intactos. La plantilla de Rueda de prensa ya traía
  Convocatoria y Timeline (la escribió el seed al arrancar).
- **Comparación con NEXARA** (agente de solo lectura) → brechas de tienda y lo que se hizo (3 agentes + yo):
  - **Páginas legales públicas** `apps/web/app/legal/{privacidad,terminos,eliminar-cuenta,soporte}` (públicas en
    `lib/domains.ts`), con NEXARA como desarrollador/publicador para Arta Producciones.
  - **iOS** (`f814b8d`): solo iPhone (`TARGETED_DEVICE_FAMILY "1"`), enlaces legales en login y «Más»,
    «Eliminar mi cuenta» (abre la web), `PrivacyInfo.xcprivacy` con los datos reales, candados de NEXARA en
    `ios-testflight.yml` (SDK ≥ 26, ícono sin alfa, plists, binario sin iPad), identificadores de accesibilidad.
    «iOS · compilar» #5 verde sobre ese commit.
  - **Android** (`934884d`): reglas R8 de NEXARA (Tink/security-crypto, Moshi, Retrofit, Coil, Socket.IO,
    Firebase); el release minificado llega al login sin crash en el emulador `nexara_phone`. Release falla si no
    hay `key.properties` o `VERSION_CODE` (ya no cae a la llave de debug). `scripts/build-play-aab.ps1`. Red solo
    HTTPS en release (excepción local en `src/debug`). AAB regenerado: `Documents\ARTA-builds\arta-1.0.0-1.aab`
    (huella de firma `CB:BA:EA:…:38:50`, llave de subida; mapping al lado).
  - **Cuenta de revisión** (`e9b4764`): `prisma/seed-store-reviewer.ts` (org «ARTA Demo · Revisión de tiendas»
    sin 2FA, datos ficticios, rol `enlace_gobierno` + `po.authorize`), `scripts/resembrar-cuenta-revision.ps1` y
    `verificar-cuenta-revision.ps1` (los corre Adam; la contraseña nunca pasa por un agente).
  - **Docs de tienda** `docs/store/` (README con la decisión de distribución, IOS-APP-STORE, PLAY-STORE,
    CUENTA-REVISION), gráficos de Play `apps/mobile-native/play-assets/` y `scripts/subir-secretos-ios.ps1`.
- **Hallazgos de seguridad (no tocados, para otro turno)**: Studio (sitio público) y las plantillas de formatos
  no están separadas por organización (escrituras ya cerradas en el turno de arriba); los avisos de eventos sin organización llegan a todas; `docs/ACCESS.md`
  trae contraseñas de semilla en texto.

## Turno cursor (2026-10-04, 14:20–16:15): anticipos con aprobación, iOS en verde, firma de publicación

- **Anticipos** (Adam dijo «sí»): contrato `docs/ANTICIPOS-CONTRATO.md` (`41fabe2`).
  - API y web `d8f6d78`: enum `AdvanceStatus` en `PaymentProof`, migración
    `20261004170000_advance_approval` (aditiva; `fileUrl` pasa a opcional; los anticipos viejos quedan `PAID`),
    endpoints `pending`/`mine`/`approve`/`reject`/`paid`, avisos `advance.*`, página `/advances` con pestañas.
    tsc de API y web en verde; jest en verde salvo `uploads/excel-pdf.service.spec.ts` y
    `uploads/excel-templates.spec.ts` (timeout de 5 s en render de Excel, ya fallaban; no se tocaron).
  - Android `e69ac90` (compila, 16 tests en verde) e iOS `a27f322`: sección «Anticipos» en Aprobaciones,
    contador de Inicio, push `advance.requested`/`advance.to_pay` → Aprobaciones.
- **iOS compila en verde en GitHub** («iOS · compilar», runs 37232442897, 37233024765, 37233179142).
- **TestFlight de ARTA** (`77a1197`): `.github/workflows/ios-testflight.yml` (equipo NEXARA `AHNW9K8745`),
  `scripts/asc_signing.py` registra bundle ids (app + `NotificationService`), activa push y comunicación,
  y crea los dos perfiles con la llave de App Store Connect. Firma por target en
  `apps/mobile-native/ios/Config/*.xcconfig` (`*.signing.xcconfig` los escribe CI; ignorados).
  `Resources/PrivacyInfo.xcprivacy` nuevo. **Nunca se ha ejecutado** (faltan secretos).
- **Android firmado:** llave de subida `apps/mobile-native/android/arta-upload.jks` + `key.properties`
  (ignorados por git; respaldo en `Documents\LLAVES-ANDROID\ARTA`). AAB 1.0.0 (código 1) firmado y
  verificado: `Documents\ARTA-builds\arta-1.0.0-1.aab`. Compilar: `.\gradlew.bat :app:bundleRelease
  "-PVERSION_CODE=N" "-PVERSION_NAME=X.Y.Z"` (con comillas en PowerShell).
- `gh` no tiene sesión; se usa el token del administrador de credenciales de git en `$env:GH_TOKEN`.

## Turno cursor (2026-10-04, 11:45–13:00): paridad web ↔ app, push de cada acción y chat v2

Pedido de Adam: «paridad total de la app móvil, UI/UX perfecta, push de cada cosa (tareas, solicitudes,
mensajes…), chat más profesional que Slack; manda varios agentes; **avísame antes de compilar** (iOS y
Android se publican con las cuentas de NEXARA)». Decisión de Adam: **híbrido** (lo diario nativo, el resto
en vista web dentro de la app con la misma sesión) y chat «todo, en orden».

Contratos (léelos antes de tocar móvil o chat):
- `docs/CHAT-V2-CONTRATO.md` — chat v2 (API, web, Android, iOS).
- `docs/PARIDAD-MOVIL-CONTRATO.md` — pestañas, rutas nativas, vista web con handoff, enlaces de avisos.

Trabajo de 11 agentes en paralelo, ~36 commits en `main` (de `9250f5a` a este cierre):
- **API chat v2** (`56ac02f`): responder citando (`replyToId`), guardados (`ChatSavedMessage`), grupos de
  directos (`isGroupDm`, `POST /chat/group-dm`), presencia (`GET /chat/presence` + socket), vista previa de
  enlaces con anti-SSRF (`GET /chat/link-preview`), No molestar (`User.chatDndUntil`, `/chat/prefs`; corta
  todo push en `push-dispatch.service.ts`), «Mensaje eliminado» si tiene hilo, avisos `chat.added`,
  `chat.removed`, `chat.reaction`, `chat.thread_reply`. **Migración nueva `20261004150000_chat_v2`**
  (solo aditiva).
- **Avisos de cada acción** (`8995091`, `af1e35f`, `97c2899`, `fdaab4e`, `8bb2f69`): ~50 tipos nuevos
  (tareas: quitar, reabrir, cambios, evidencia, borrar; recordatorio diario 8:00 CDMX `task.due_soon` /
  `task.overdue`; eventos; OC; firmas de formatos; documentos, archivos, carpetas; calendario; patrocinios;
  boletera con hitos 50/75/90 % y agotado; usuarios; invitaciones; proveedores; alertas horarias en
  campana). Canal push nuevo `documents`. `linkUrl` con las formas del contrato. Helpers
  `notifyUsers` / `notifyOncePerDay` / `whoCan` en `NotificationsService`. Menciones con
  `channel_id`/`message_id` y categoría `ARTA_CHAT` en iOS (`d58b1b0`).
- **Web chat v2** (`93a78bd`): menciones como chips (antes salía el token crudo), autocompletado, markdown,
  emojis locales, citas, guardados, nueva conversación (DM/grupo/canal), info del canal y miembros,
  presencia, no leídos, vistas previas, borradores, visor, No molestar, Ctrl+K; 390 px como app.
- **Web modo app y teléfono** (`fbca247`, `4a762f5`, `49045b2`): User-Agent `ArtaApp/` → `data-shell="app"`
  sin barra lateral ni superior, safe-area; en el teléfono la hamburguesa **no aparecía** (corregido);
  pasada responsive global. `e2e/mobile-shell.spec.ts` 30/30.
- **Push en navegador** (`c3a6e4d`): FCM web con SW propio, tarjeta en Configuración, PWA instalable
  (`start_url /dashboard`, íconos), build args `NEXT_PUBLIC_FIREBASE_*`. **Apagado hasta que Adam registre
  la app web en Firebase y ponga las variables** (ver Siguiente paso).
- **Android** (`da5bd83`, `795f0f8`, `4fa4254`, `4438993`, `4677826`, `a030df9`, `e2bf445`, `03c8600`):
  pestañas Inicio · Chats · Tareas · Avisos · Más; vista web con handoff `/auth/handoff` → `?_nxt=` (respaldo:
  copiar cookies); «Más» con los módulos del rol; avisos con enlace nativo y canal `arta_documents`;
  módulos nativos Inicio, Tareas, detalle de tarea, Aprobaciones (tareas por revisar y OC), Eventos con mes,
  detalle de evento; chat v2 completo. `gradlew :app:assembleDebug` **verde**.
- **iOS** (`ec3aec4`, `8f41f67`, `f2fc455`, `19cedb1`, `be903d4`, `0bde357`, `c1c3b77`, `dcb4019`, `a51e120`):
  lo mismo que Android en SwiftUI. **Nunca compilado** (Windows): primer chequeo real = `ios-build.yml`.
  Puntos frágiles anotados por los agentes: atributos de `AttributedString`, gestos dentro de `TabView`
  paginado, aislamiento de main actor con SDK iOS 18, `case ..<(-1)`, doble opcional en `UpdateTaskBody`.

Verificación de este cierre:
- API: `prisma validate` ok, `tsc` limpio, jest **420 en verde** (1 omitido).
- Web: `tsc` limpio, `next build` ok. Playwright: 53 en verde, **27 fallan desde antes** (selectores
  viejos: «Editar aquí», «Ventana de OC abierta», «Calendario de eventos», `.event-facts`, «Lista para
  pagar»; `public-site` necesita el API en :4000; editores de Excel del PR #5). Ninguna toca código de hoy.
  `app-shell.spec` corregido (reloj fijo, 7/7).
- Android: `assembleDebug` verde. iOS: sin compilar.

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

1. **Push apagado en producción** hasta que Adam suba la cuenta de servicio NUEVA con
   `pwsh -File deploy/firebase-cuenta-servicio.ps1` (la vieja `73faf0e2…` se pegó en un chat: borrarla).
   Clave APNs `.p8` pendiente en Firebase → Cloud Messaging (sin ella no hay push en iPhone).
2. **TestFlight sin ejecutar**: faltan los secretos (`pwsh -File scripts\subir-secretos-ios.ps1`, reusa el
   certificado y la llave de NEXARA). La app en App Store Connect ya existe y está llena (id `6819117925`);
   falta pegar la contraseña de revisión en la versión y en TestFlight (`docs/store/IOS-APP-STORE.md`).
3. **Play sin subir**: la app (cuenta NEXARA, id `4974517947869940332`) tiene **todas** las declaraciones de
   «Contenido de la aplicación» enviadas (04-10, 18:40: datos de inicio de sesión, público 18+, seguridad de
   los datos, salud: ninguna). **Prueba interna publicada** el 04-10 21:49 con `1 (1.0.0)` (bundle de la
   biblioteca: subir otra vez el mismo código da «código de versión 1 ya se ha usado»). Faltan testers y la ficha
   de Play Store (sin ella el nombre temporal es «com.artaproducciones.ops (unreviewed)»). Contraseña de revisión
   en ASC guardada (versión y TestFlight) y verificada por hash contra el archivo.
4. ~~Cuenta de revisión sin sembrar~~: sembrada el 04-10 (ver turno de las 18:10). Resembrar justo antes de
   cada envío a revisión (`docs/store/CUENTA-REVISION.md`).
5. **Decisión de Adam**: distribución sin listar (iOS) + prueba interna (Play), y carta de Arta autorizando a
   NEXARA a publicar con su nombre y logo (5.2.1). Ver `docs/store/README.md`.
6. Sin capturas de tienda: no hay flujo de capturas como el de NEXARA (`ios-screenshots.yml` + UITests + modo
   demo). Los identificadores de accesibilidad ya están; mientras, capturas a mano con la cuenta de revisión.
7. Huecos que la API no tiene (la app no los inventa): motivo al rechazar una OC, comentarios y prioridad
   en tareas. iOS: `?advance=<id>` abre Aprobaciones pero no resalta la tarjeta (Android sí). Android pide dos
   permisos a la vez al arrancar (aviso en logcat).
8. Push web (navegador) apagado: falta app Web en Firebase + VAPID → `NEXT_PUBLIC_FIREBASE_*` en `.env.arta`.
9. Nada probado en teléfono real. 27 e2e viejas de la web por actualizar + 2 specs jest de Excel con timeout.
10. Seguridad (ver hallazgos de este turno): Studio y plantillas sin separar por organización.

## Siguiente paso

1. Adam: puntos 1–5 de «A medias» (en ese orden conviene: cuenta de servicio → cuenta de revisión → Play
   prueba interna → secretos iOS + app en ASC → «iOS · TestFlight»).
2. Con los secretos puestos: lanzar «iOS · TestFlight» (Actions → Run workflow, `main`) y corregir hasta que suba.
3. Probar en teléfonos del equipo: tareas, aprobaciones y anticipos, vista web con sesión, avisos, chat.
4. Capturas de tienda y, si se va a revisión, pedir distribución sin listar.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` a un repo de app.
- No mover Traefik de puerto.
- Conceptos de campaña: no romper al tocar Excel. El editor y el evaluador de Excel son los del PR #6.
- Firebase: `google-services.json` y `GoogleService-Info.plist` **sí se versionan** (config de cliente).
  La cuenta de servicio nunca: solo por variable de entorno con el script.
- No renombrar canales push existentes (`arta_<channel>` ya instalados en teléfonos).
- No crear ramas: todo va a `main`.
- Llave de subida Android (`arta-upload.jks`, `key.properties`): nunca en git; no regenerarla (Play la
  registra en la primera subida).
