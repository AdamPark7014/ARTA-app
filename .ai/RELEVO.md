# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-11-01
- **Rama:** main
  (Adam es el único programador).
- **Producción:** `ceb81f9` desplegado desde `main` el 2026-11-01 (`bash deploy/update.sh` en `/var/www/arta-app`, log
  `/root/arta-deploy-20261101-R.log`; respaldo automático en `/root/arta-backups/`). Disco al 81 %: al 90 % se cae la BD.

## Turno claude-code (2026-11-01, noche): roles del cliente, adendum, testigos y Finanzas

Adam pasó la matriz real por persona. **Guía: `docs/ROLES-Y-PERMISOS.md`.** Reglas en `packages/rbac/src/roles.ts` con copia
idéntica en `apps/api/src/common/rbac/roles.ts`, y en `Rbac.swift` y `Rbac.kt`: cada cambio va a los cuatro. El API manda:
`events/event-visibility.ts` quita del evento lo que la persona no ve, y el mismo candado cubre archivos por id.

**En producción y aplicado a las personas** con `apps/api/scripts/roles-clientes-2026-11.ts`: Chacho y Arturo `dir_general`, Leida y
Sol `dir_adjunta` solo Arta, Juan Pablo `compras`, Williams `produccion`, Rodrigo `dir_auditorio`, Monse y Kika `contenido`, Paula
`contabilidad`, Iliana `catering` (nueva). Se cerraron sus sesiones: **todos vuelven a entrar una vez.** A Paula se le reseteó la
contraseña (la que tenía era aleatoria y nadie la sabía). Accesos en `Documents\ARTA-credenciales-2026-11-01.xlsx`, fuera del repo.

**Hecho:** pestañas del evento en el orden del cliente; Auditorio sin corrida, campaña ni convenios; solo Juan Pablo crea OC, ni
dirección (`hasPermission` excluye `po.edit`); forma de pago Adendum con persona, cuenta y archivo, y su pestaña; al autorizar una
transferencia o adendum, aviso `po.to_transfer` a contabilidad, y al quedar pagada, aviso a quien autorizó; boletera embebida en
Resumen (`Event.boleteraUrl`); Testigos de publicidad (`/testigos/*`, pestaña y pantalla del practicante, PDF final); perfiles de
practicante por temporada en `/studio/practicantes` (vencen con `accessExpiresAt`, que también saca a quien tenga la sesión
abierta); `/finanzas` para Paula, Chacho y Arturo; plantillas BARRA y MERCH; Usuarios con tarjetas de rol y vista previa
(`lib/role-access.ts`, sale de las mismas funciones que aplica el servidor).

**Botón de generar corrida:** el API respondía `skipped` si había cualquier archivo de corrida y la pantalla decía «generada». Ahora
solo un Excel lo bloquea, con error, y si solo hay PDF aparece «Generar en Excel». El de Leida y Sol es «Subir»; generar y modificar
son de dirección. Probado en el contenedor (plantilla, Excel y PDF), **no con el clic de Adam: confirmar con él cuál era su caso.**

**Trampas:**
- `CUSTOM` lo comparten la Distribución de Pendones en Excel y las plantillas propias: para aprobar usa `formatRuleKey(template)`.
- `userHasPermission` del panel deja pasar a `dir_general` en todo; para `po.edit` usa el `hasPermission` de `@arta/rbac`.
- `isPublic` en multipart: `enableImplicitConversion` vuelve «false» en true. Por eso el `@Transform` y el panel solo lo manda si es verdadero.
- Las pruebas con base real (`apps/api/test/*.e2e-spec.ts`) no corren en local con Docker apagado. Descubrieron la regla de `CUSTOM` y una
  prueba del acuse que venía roja desde `d2097d2`: tras tocar roles, **mira la CI antes de desplegar.**
- Compilación incremental de Android tras cambios grandes: cientos de `Unresolved reference` en archivos tocados. Es la caché; `--rerun` lo arregla.
- El seed corre en cada arranque. No pisa roles y, desde `5abee55`, tampoco Studio.

**Interpretaciones confirmadas por Adam (01-11):** «arte general, show y pendones» = Evento General, Artes de shows y Pendones (+Excel), y basta
uno de Chacho o Arturo; formatos de Auditorio los aprueban Rodrigo, Chacho o Arturo; OC en solo lectura para Leida y Sol, sin acceso Williams
y Rodrigo; «checklists generales» de Monse y Kika = Evento General y Checklist Auditorio; Iliana en los dos negocios; practicante publica por omisión y se quita por perfil; Paula conserva editar campaña, convenios y boletera
de la junta 23-10. Lo único aún supuesto es el correo de Iliana, `iliana@artaproducciones.com`.

**Verificado:** API 1129 de 1131 (un PDF por tiempo con la máquina cargada, pasa solo; 1 omitida ajena) y 55 con base real en CI; web 218 en
Chromium y Safari de CI; capturas 1536 y 390 sin cortes ni encimados; migraciones `20261102000000` y `20261102010000` aplicadas, columnas
consultadas en la base, 0 errores en `docker logs`; `/p/arta` en vivo sin Google Fonts; `HeroSlide` no cambia al reiniciar la API; Android 133
pruebas; iOS compila.

**No verificado:** ninguna pantalla con sesión real en producción por rol (solo pruebas con API de mentira); publicar desde `/studio` y
verlo en `/p/arta` (revalidación con cookie real); un push real de `po.to_transfer`; `/uploads/*` se sirve estático, quien ya tenga la URL de
una corrida la abre; apps: en iOS la fila de módulos del evento no salió en captura (solo por debajo de la barra al bajar), Android sin
emulador. Formatos y crear OC en las apps siguen abriendo la web.

**Tiendas:** Android `Documents\ARTA-builds\arta-1.0.2-5.aab`, **lo sube Adam a mano** a Prueba interna (pesa más que los 10 MB que deja
el navegador). iOS TestFlight 1.0.1 (14), corrida 41370494979.

## Turno claude-code (2026-11-01, noche): sitio público nuevo y Studio con la maqueta completa

Adam: «un paquete de la página web más complejo y más acorde a Arta Producciones, a los colores y a todo, mucho más
profesional» y «la maqueta total en Studio web para que los practicantes puedan subir, quitar, bajar y poner historias,
noticias, todo». Sesión aparte de la de roles y permisos. Desplegado con los roles en `ceb81f9`.
Guía: `docs/SITIO-PUBLICO.md`.

**Sitio** (`styles/sitio.scss`, clases `sa-`, tinta y papel, sin dorado; Outfit y Nunito locales, ya no pide Google Fonts en
`/p/arta`): portada con los próximos shows y sus pósters, cartelera, historias con visor a pantalla completa, nosotros,
servicios, noticias, galería con ampliación, aliados, preguntas, ubicación y contacto. Páginas nuevas: `/p/arta/cartelera`,
`/p/arta/cartelera/[slug]` (JSON-LD `Event`) y `/p/arta/noticias`. Marca vectorizada en `public/brand/`, incluida la «a»
girada de `arta-footer.png`, que es el motivo de todo el sitio.

**Studio:** maqueta a la izquierda (Subir, Bajar, Quitar, Poner, sección nueva), editor al centro y vista previa real a la
derecha, con computadora o teléfono, con borradores o como está publicado; enseña lo que se escribe antes de guardar. Botón
«Perfiles de practicante» a `/studio/practicantes`, que no ve el rol practicante. La regla sigue siendo `canPublishStudio`:
sin `studio.publish` se dejan borradores y se mandan a revisión.

**API:** modelo `SiteItem`, columnas nuevas en `HeroSlide` y `NewsPost`, migración `20261102000000_sitio_maqueta_studio`
(aditiva e idempotente). Rutas: `GET preview`, `items`, `POST reorder`, `POST pages/publish`, `GET public/shows`.

**Errores de fondo que salieron y ya no están:**
- **La semilla borraba Studio en cada despliegue:** reescribía secciones, borraba los slides y republicaba las notas.
  `prisma/seed-studio.ts` solo siembra una base vacía. **Al primer arranque cambia una vez:** el texto de relleno que siga
  idéntico pasa al copy nuevo y las tres notas de relleno (`temporada-puebla`, `checklists-digitales`, `experiencia-show`)
  quedan en borrador. No se borra nada; lo editado se respeta. Noticias arranca vacía hasta que publiquen.
- **Guardar una sección no guardaba:** `contentJson` no tenía decorador y el `whitelist` lo tiraba, contestando 200.
- **Lo publicado tardaba hasta una hora en verse:** caché de 3600 s. Ahora 30 s, y Studio refresca al publicar
  (`POST /p/arta/revalidar`, solo con sesión de Studio).
- Corregir una noticia publicada le cambiaba la fecha; un slug repetido daba 500; el botón de un slide aceptaba `javascript:`.

**Verificado:**
- API: `studio.maqueta.spec.ts` (24), specs de Studio existentes y `schema-migrations.spec.ts` en verde;
  `test/studio-sitio.e2e-spec.ts` (5) contra Postgres real, con filtros de cartelera y semilla.
- Stack real (API + base aparte + `next dev`): 20 comprobaciones de practicante a público, con foto subida, revisión, 403 al
  publicar por API, publicación que se ve sin esperar caché, orden, JSON-LD, sitemap y feed.
- Web: Chromium 218 de 219 contra un build de producción con el API apagado; `real-stack-files` necesita API y corre en CI.
  Nuevas: `e2e/sitio-publico.spec.ts` (12), `e2e/studio-maqueta.spec.ts` (18) y dos en `public-site.spec.ts`. Después de ese
  build solo cambió un separador de la cartelera (`·` con espacio duro), revisado con tipos.
- Capturas revisadas a 1536 y 390 con `playwright.audit.config.ts` (`e2e/audit/sitio.audit.ts`, 22 vistas), sin scroll lateral
  ni errores de página. Lo que marca y no es falla: contraste 1:1 en ligas (el subrayado es un gradiente), cinta y riel que
  cortan a propósito, menú abierto tapando la página.

**No verificado:**
- **Safari real.** WebKit no corre desde la app de escritorio en Windows (`playwright.config.ts`); lo cubre `web-safari.yml`
  al subir. Se cuidó `svh`/`dvh`, áreas seguras, 16 px en campos, `playsInline` y `-webkit-mask`, pero nadie lo ha visto en un
  iPhone: el visor de historias y el video son lo primero que hay que probar.
- Subir un video de verdad (se probó con foto). El mapa de Google se simuló en las capturas.
- Con contenido real: los pósters y fotos de prueba eran ficticios y el sitio en producción solo tiene las fotos de semilla.

**Confirmado por Adam (01-11):** «Historias» son tipo Instagram (foto o video vertical con visor), no casos de éxito.

**Decisiones a confirmar con Adam:**
- El formulario de contacto arma el correo en la app de quien escribe (`mailto:`) y ofrece WhatsApp: no hay SMTP en producción.
- Los practicantes no publican salvo que su perfil lo permita.

**Al desplegar (sesión principal):** la migración corre sola en el arranque. Después, `SELECT count(*) FROM "SiteItem"`,
`docker logs arta-api | grep Studio` (debe decir «contenido respetado» y cuántos textos de relleno retiró) y abrir `/p/arta`.
Datos del sitio: correo, teléfono y redes se llenan en Studio, ya no hace falta recompilar.

**Quedó sin limpiar:** las clases `.site-*` y `.studio-*` viejas siguen en `globals.scss`, ya sin uso (no se tocó ese archivo
para no chocar con la otra sesión). `next.config.js` acepta `NEXT_DIST_DIR` para compilar sin pisar el `.next` de otra sesión;
ojo, Next reescribe `tsconfig.json` al usarlo: no commitear ese cambio.

**Siguiente:** desplegar, cargar la primera cartelera real y probar en un iPhone.

## Turno claude-code (2026-11-01, tarde): chat con referencias y otra pasada premium

Adam: «en el chat algo mucho más pro tipo Slack… poder arrobar tareas, personas, actividades, eventos; mejora tareas,
notificaciones y el ligado de push a casos de uso» y «haz mucho más premium todo el sistema».

**Chat** (`docs/CHAT-V2-CONTRATO.md` § 9): la misma @ liga tareas, eventos, OC, formatos, documentos y anticipos. El
cuerpo lleva `@Etiqueta` en texto plano (las apps viejas lo leen bien) y `refs` aparte (`ChatMessageRef`). La tarjeta se
calcula al leer, con los permisos de quien lee: **sin acceso se ve la etiqueta, nunca monto ni estado**. Por socket viaja
sin resolver (`resolved:false`) y cada cliente pide la suya con `POST /chat/refs/cards`. Trampa: `label` es lo escrito y
encuentra el chip; `title` es el nombre de hoy. No los mezcles o al renombrar una tarea se pierde el chip.
Web: selector universal, barra de redactor tipo Slack, `/tarea Título @persona mañana`, «Crear tarea» en un mensaje,
panel «Ligados», «Mencionado en el chat» en tarea y evento. Sin el puesto en el encabezado. La fecha ya no se encima.

**Avisos** (`docs/AVISOS.md` § Casos): `Notification.targetKind/targetId`, sacado de la liga si no se dice otro.
`pushActionsFor` decide los botones: Entregar (con nota), Aprobar, Revisar. **El dinero y las firmas nunca se aprueban
desde la pantalla bloqueada: `review` solo abre.** Un aviso por persona y mensaje: `planFor` corre antes del push normal.
Service worker sin sesión: «Entregar» abre `/tasks?task=<id>&do=deliver`. En la campana, el botón del siguiente paso.

**Tareas:** `POST /tasks/:id/comments` con @, `?task=` por fin lleva a esa tarea aunque el filtro la deje fuera (antes
la liga de los avisos no enfocaba nada), vista Tablero con arrastre, un solo juego de filtros, filas que se leen como texto.

**Otra pasada premium:** Ctrl K encuentra tareas, OC, formatos, documentos y anticipos; atajos `?` y `g` + letra. En el
teléfono el buscador salía en 165 px (ahora toda la pantalla), el evento dentro de un módulo es un renglón, Tareas enseña
tareas en el primer pantallazo, la cabecera del chat deja ver el nombre con lo demás en «Más».

**Apps:** iOS (`21d0514`) y Android (`58fb578`) con todo lo anterior salvo `/tarea` y «Ligados». Android: 94/94 y
assembleDebug, sin verse en emulador. iOS: compila (`ios-build.yml`) y abre en simulador con el código final
(`ios-screenshots.yml`, corrida 41341449800), pero el modo demo no trae referencias: **chips, tarjetas y botones de aviso no
se han visto en ninguna app.** Lo más riesgoso: el chip dentro del texto en iOS (`Text + Text`) y su fondo en Android; las
acciones de push en un teléfono de verdad. El comentario en las apps no trae selector de @. Nada se publicó en tiendas.

**Pruebas:** web Chromium 148/148 (`e2e/chat-refs.spec.ts`, `e2e/tareas-tablero.spec.ts`), API 729. Capturas nuevas en
`e2e/audit/cortes.audit.ts`: `chat-refs`, `chat-selector`, `chat-tarea`, `chat-ligados`, `tablero`.

**Incidente (01-11, 18:53–18:56 UTC):** se desplegó `ChatMessageRef` sin su migración: el archivo no se escribió porque iba
en la misma línea (`&&`) de un parche que falló. El chat falló unos 3 minutos (1 error en el log, 0 avisos perdidos). Se
aplicó el SQL a mano y la migración quedó idempotente. **La CI no lo vio** (`21d0514` salió en verde): sus pruebas con base
real no tocaban el chat, las del API usan Prisma de mentira, `notify` se traga sus errores y el contenedor seguía «healthy».
Ahora: `schema-migrations.spec.ts` truena si un modelo o columna no tiene migración, y `test/chat-refs.e2e-spec.ts` escribe y
lee el chat en la base real. Tras desplegar, consultar la tabla nueva y `docker logs arta-api`.
Ojo: `prisma migrate diff` contra producción marca diferencias viejas en `EventDocumentSlot` (nombres de índices, llaves y
valores por omisión): por eso no sirve de guardia en CI todavía.

**Siguiente:** versión nueva de las apps a tiendas (pide OK de Adam), verlas en teléfono, lista § 6 de `SAFARI.md`,
SMTP sin conectar.

## Turno claude-code (2026-11-01): barrido premium de punta a punta, Safari y avisos

Adam: «dale una pasada a todo… compatibilidad con Safari… más premium, hasta las notificaciones, cómo interactúan,
qué envían; barrido end-to-end». El RELEVO no se actualizaba desde el 22-10: los commits del 29-10 (junta 23-10,
contabilidad y practicante, formatos de seguridad, inventario de limpieza, Safari) y este turno van aquí.

**Errores reales que salieron al poner al día las pruebas (llevaban rojas desde el 22-10):**
- **Fórmulas que desaparecían:** el servidor guardaba la fórmula sin resultado y SheetJS descarta esas celdas: al
  reabrir la hoja salían vacías. Ahora `XLSX.read` con `sheetStubs` y `refreshFormulaResults` al guardar.
- **PDF de corrida con totales viejos:** `FormulaResolver` usaba el resultado guardado aunque el dato hubiera cambiado.
  Ahora calcula con los valores actuales y solo cae al guardado si no puede. Las fórmulas leen la hoja que nombran.
- **Tablas de Word perdidas:** `normalizeBlocks` del API no conocía `table`, las volvía párrafo vacío (también al
  guardar). Se conservan en su lugar y salen en el PDF.
- **PDF con la primera página vacía** (documentos, boletera, historial): el cursor se quedaba abajo tras pintar el pie.
- **Cancelar el motivo de un reemplazo seguía adelante:** `window.prompt(...) || ''`. Ahora `askPrompt` devuelve `null`.
- `/notifications` no existía aunque el aviso del navegador llevaba ahí. Tocar un aviso no lo marcaba leído.

**Web:** `AskDialog` en lugar de `confirm`/`prompt` (queda solo el de salir con cambios sin guardar), `Flash` flotante,
buscador global (Ctrl K: eventos, personas, pantallas), `RouteProgress`, migas, «Siguiente show» en Inicio, módulos en
pastillas en el teléfono, OC del evento como tarjetas, hoja que selecciona como Excel (resultado en la celda, fórmula en
la barra), caras en tareas, vacíos con ícono de línea, 2FA en casillas, 404 propia, barra de Safari teñida, formatos y
PDF en tinta (antes dorado y verde). Estilos nuevos en `styles/_premium.scss` y `_safari.scss`; guía en
`docs/diseno/SISTEMA-VISUAL.md` § «Barrido premium».

**Avisos** (`docs/AVISOS.md`): campana nueva, tarjeta en vivo, pantalla `/notifications`, preferencias por persona
(`User.notificationPrefs`: categorías y horario silencioso), ráfagas (`Notification.bundleCount`), iOS con `subtitle`,
`interruption-level` y `relevance-score`. Migración `20261101120000_avisos_preferencias_y_rafagas` (solo columnas).

**Safari** (`docs/SAFARI.md`): PDF dibujado con pdf.js en teléfono y tableta (el iframe enseña solo la primera página),
«Filas y columnas» y «Renombrar» a la vista con el dedo, un toque ya no selecciona la celda de junto, chat sobre el
teclado (`use-keyboard-fit.ts`, **sin probar en un iPhone real**), fechas de iOS, columnas de la hoja que Safari
ensanchaba (`size={1}`). Lo que necesita una persona con Safari de verdad: `SAFARI.md` §6.

**Apps:** iOS y Android con pantalla de Avisos nueva, preferencias, interacción del push y barrido de acabado. Android
compila, 67 pruebas; **no se vio en emulador** (la máquina tenía 2 GB libres). iOS compila en CI (`ios-build.yml`).
**Nada se publicó en tiendas ni cambió versiones:** las apps nuevas salen cuando Adam lo pida.

**Pruebas:** Chromium 128/128 en local y en CI, WebKit (Mac e iPhone) contra Chromium en `web-safari.yml`, stack real en
verde por primera vez en semanas, API 693. `ci.yml` ya no corre «Stack real» en el job sin API.

**No conectado:** no hay SMTP en producción: resúmenes e invitaciones no salen por correo (`docs/AVISOS.md`).

**Siguiente:** versión nueva de las apps a tiendas (pide OK de Adam), revisar Android en emulador, lista de §6 de
`SAFARI.md` con un iPhone y una Mac.

## Turno claude-code (2026-10-21, tarde): cierre del acabado, Rodrigo con correo de Arta, Play

Adam: «no ocupes Cursor, corre todo tú» (regla nueva en `~/.claude/CLAUDE.md` y `C:\dev\.claude\rules\cursor-motor.md`;
el relevo sigue para trabajos separados). Desde la app de escritorio, `cursor-agent` no corre (integridad de código).
- **Web** (`c28eda6`, desplegado): revisado en pantalla el acabado de Cursor del 12-10; la hoja tipo Excel
  (Corrida) ya no usa verde en «+ Concepto» ni en la guía (la selección conserva el verde de Excel).
- **Rodrigo** (`0dbccc0`, desplegado): `rodrigo@arema.mx` → `rodrigo@artaproducciones.com`, puesto «Supervisión
  del Auditorio». El seed renombra la cuenta (`RENAMED_EMAILS`), no crea otra: verificado en producción (1 fila,
  misma contraseña). Nadie más tenía dominio de Arema; Melissa ya no existe (borrada el 28-08).
- **Credenciales para la compañía**: `Documents\ARTA-credenciales-2026-10-21.{pdf,xlsx,md}` = el de agosto con
  correos de Arta, sin Melissa ni las secciones internas; **mismas contraseñas** (Adam). Las descripciones por
  grupo siguen siendo las de agosto (los accesos cambiaron el 11-10): ofrecido actualizarlas.
- **Compromiso de horarios**: Adam no lo encontraba; ya está desde el 11-10 (Auditorio → evento → Formatos). El
  .docx que reenvió es idéntico a la plantilla.
- **Google Play**: ficha enviada a revisión el 21-10 12:53 (ícono papel y tinta, gráfico, 6 capturas nuevas de
  `.ai/scratch/play-capturas/`, textos de plataforma **sin** la frase del demo, que se regresa con la 1.0.1).
  **AAB 1.0.1 (código 4)** firmado en `Documents\ARTA-builds\arta-1.0.1-4.aab` (+ `-mapping.txt`): pesa 12.9 MB y
  `file_upload` de Chrome solo admite 10 MB → lo subió Adam a mano. **Producción 4 (1.0.1), lanzamiento completo,
  enviada a revisión el 21-10 ~13:30** (notas: diseño nuevo, «Explorar ARTA con datos de muestra», textos sin
  cortes); 1 advertencia sin bloqueo (sin símbolos de depuración nativos, igual que la 1.0.0; el mapping de R8
  pesa 85 MB y no se subió). La descripción enviada a las 12:53 ya incluía la frase del demo (el recorte no se
  guardó), así que ficha y app quedan coherentes cuando Google apruebe las dos.
- **iOS**: 1.0.0 (12) sigue `WAITING_FOR_REVIEW` (envío del 19-10). Lleva ya todo el diseño, el ícono y el demo.

## Turno claude-code (2026-10-21): Android a la par de iOS para la 1.0.1 (EXEC-PACKET cerrado)

Ejecutó Claude (agente) el `.ai/EXEC-PACKET.md` «Android a la par de iOS». **Nada subido a Play ni desplegado**;
versionCode/versionName, firma y `gradle.properties` sin tocar (siguen 3 / 1.0.0).
- **Demo en la build de tienda**: `app/src/main/java/.../demo/` (`DemoMode` con estado en tiempo de ejecución,
  `DemoInterceptor` primero en la cadena de OkHttp, `DemoStore` + `DemoClock` que mueve las fechas de las fixtures
  a hoy como iOS, `DemoLaunch` con los extras de capturas solo en debug). Fuera `ApiDebugHooks`, el
  `DemoProvider` y el manifiesto de debug. Fixtures en todas las variantes (`sourceSets["main"]`, sin el `.mjs`).
- **Entrada**: «Explorar ARTA con datos de muestra» (`Session.enterDemo`) y «¿Tu organización aún no usa ARTA?
  Conoce cómo contratarlo» → `/contratar`. **En el demo**: pastilla arriba «Modo demo · datos de muestra» con
  «Salir» (`Session.exitDemo`, olvida lo cambiado); sin socket, push ni permiso de avisos; la vista web y «Abrir
  en el navegador» enseñan «Disponible con una cuenta de tu organización»; en Más «Salir del modo demo».
- **Permiso de avisos**: ahora se pide tras iniciar sesión con cuenta real (como iOS), ya no en la entrada.
- **Pulido**: `SectionTitle` (las etiquetas largas se partían en dos y los totales cortos quedaban a media fila)
  y «Crear tarea» apagado sin título.
- **Verificado**: `assembleDebug testDebugUnitTest` 45/45; `:app:assembleRelease` OK (preflight; 54 fixtures en el
  APK). Emulador con la copia **`com.artaproducciones.ops.demo101`** (la `.redesign` tiene abierta una sesión real
  y no se cerró): demo desde la entrada, las dos entidades (doble toque en Inicio), avisos web,
  «Salir» → entrada; 0 líneas de OkHttp y 0 sockets del uid durante el demo; los extras `--ez arta_demo true`
  siguen abriendo sin pastilla. Capturas en `.ai/scratch/android-1.0.1/` (01–26).
- **Siguiente (Claude cabeza)**: AAB 1.0.1 (versionCode 4), subirlo a Play y cambiar la ficha a «tu organización»
  (`docs/store/PLAY-STORE.md` §8).

## Turno claude-code (2026-10-19, mediodía): ARTA sigue pública — modo demo en tienda, /contratar y ficha nueva

Adam: «Quiero mantener ARTA pública en App Store: aplica los cambios de producto necesarios y prepara el texto B».
- **iOS** (`34c9258`): modo demo fuera de `#if DEBUG` (`DemoMode` con estado en tiempo de ejecución,
  `Session.enterDemo`, `DemoBanner` + `DemoWebUnavailableView`, botón «Explorar ARTA con datos de muestra» y
  enlace a `/contratar` en `LoginView`); `project.yml` ya no excluye `fixtures/` en Release. Las pruebas de
  interfaz siguen arrancando con `-ArtaDemo YES` (sin pastilla). **Build 1.0.0 (12)** lanzada por
  `iOS · TestFlight` (corrida `39295923791`, `-f build=12`); al procesar hay que elegirla en la versión 1.0.0.
- **Web** (`34c9258`, **desplegada** a producción a las ~11:40 por bundle + `update.sh --no-pull`, log
  `/root/arta-deploy-20261019-contratar.log`; api y web sanos): ruta pública `/contratar` (qué incluye, cómo
  empezar, contacto de NEXARA), enlace en la navegación legal; soporte/términos/privacidad/eliminar cuenta
  hablan de «tu organización». Comprobado `https://artaproducciones.com/contratar` → 200. **Ojo:** el deploy
  llevó también el acabado visual de Cursor del 12-10 (`9c79894`), que seguía sin revisar en pantalla.
- **~12:10: build 12 (versión 1.0.0, subida hoy; NO la «12» de 1.0.1 del 11-10) elegida en la versión, «Actualizar
  revisión» pulsado (envío `c1da1a8a…` en «Listo para revisión») y el texto B guardado como **borrador** en el
  Resolution Center. **12:09: Adam autorizó enviar sin video**: texto B publicado y «Volver a enviar» pulsado →
  **1.0.0 (12) «Pendiente de revisión»** (envío `c1da1a8a…`). Nada que hacer hasta que Apple conteste; si vuelve
  3.2, plan B = distribución sin listar (`docs/store/RESPUESTA-APPLE-3.2.md`).
- **22-10 (claude-code): APROBADA Y PUBLICADA.** Apple aceptó la 1.0.0 (12) con el texto B (sin video); la
  versión está en `READY_FOR_DISTRIBUTION` (lanzamiento automático) y la ficha pública ya responde:
  https://apps.apple.com/mx/app/id6819117925. iOS y Android en tienda. Pendiente solo la paridad Android del
  demo y los textos de Play (tarjeta propuesta).
- **ASC** (ya guardado por la API interna): texto promocional, descripción, URL de marketing
  (`/contratar`) y notas de revisión nuevos (textos en `docs/store/IOS-APP-STORE.md` §7). Falta: elegir el
  build 12, re-adjuntar el video de revisión (el adjunto está vacío), «Actualizar revisión», responder con el
  **texto B** de `docs/store/RESPUESTA-APPLE-3.2.md` y «Volver a enviar».
- **Android sin tocar**: la app publicada 1.0.0 (3) no tiene el botón de demo ni los textos de plataforma; la
  ficha de Play sigue diciendo «equipo de Arta Producciones» (pendiente, no bloquea a Apple).
- Docs (`3db205a`): `RESPUESTA-APPLE-3.2.md` reescrito con la decisión, `IOS-APP-STORE.md` §7/§8,
  `PLAY-STORE.md`, `README.md`.
## Turno claude-code (2026-10-19, mañana): rechazo iOS 3.2 del 12-10 y decisión de distribución

- Apple rechazó **1.0.0 (11)** el 12-10 (envío `c1da1a8a…`, iPad Air M3) con **3.2 Business**: app para una
  organización concreta con distribución pública; cinco preguntas o elegir otra vía. Texto y análisis en
  `docs/store/RESPUESTA-APPLE-3.2.md`: recomendación **distribución sin listar** (formulario de Apple + respuesta
  en el Resolution Center, textos listos); texto B solo si Adam insiste en pública (exige cambios de producto).
- Visto en ASC: 7 capturas de iPhone 6,9" del simulador (correctas), sin juego de iPad, sin vistas previas, pero
  **el adjunto de App Review está vacío** aunque las notas citan el video `ARTA-app-review-1.0.0-build11.mp4`:
  volver a subirlo antes de reenviar.
- Android **1.0.0 (3) publicada** en Google Play desde el 11-10 (178 países, lanzamiento completo).
- Nada cambiado en código ni en tiendas. Producción sigue en `ec45283`.
## Turno cursor (2026-10-12, tarde): acabado visual listo para revisión de Claude

Ejecutado `.ai/EXEC-PACKET.md` (CERRADO). **Nada desplegado ni subido a tiendas**: producción sigue en `ec45283`.
- **Hecho (web)**: chat sin slugs también en búsqueda, guardados, hilos, selector rápido y avisos del navegador
  (`6268d65`, `channelWhere` en `components/chat/chat-ui.tsx`); OC y Campañas como tarjetas a ≤ 640 px
  (`dtable--cards` en `_acabado.scss`), panel «Hoy» sin hueco, cabecera de evento sin desbordes (lugar que se
  acorta y menú «Más» hacia dentro), notas del calendario con autor visible en escritorio y barras sin texto en
  el teléfono, fondo del acceso con líneas de 1 px (arcos ARTA, diagonales Auditorio) y su texto con contraste
  AA, cifras de mosaicos en color del texto con punto de aviso, «Agregar formato» en el encabezado de la sección
  (`41999aa`); spec de login con el botón «Confirmar» (`aaa36cb`); reglas nuevas en
  `docs/diseno/SISTEMA-VISUAL.md` § «Acabado» (`c6ded75`).
- **Verificado**: auditoría «sin cortes» 0 en todo (texto, recortes, scroll lateral, encimados, contraste) en las
  2 entidades × 1536×864, 1536×730, 1280×720 y 390×844; 7 specs 47/47; `npm run typecheck` y `npm run build`
  limpios; Android `assembleDebug testDebugUnitTest` (42 pruebas, 0 fallas); iOS ios-build 38300682548 y
  ios-screenshots 38307275188 en verde, capturas 01–07 revisadas.
- **Capturas**: `.ai/scratch/acabado/` (`antes-*` y `despues-*` = `{arta|audi}-{tamaño}-{pantalla}.png`, más
  `.txt/.json` de la auditoría; iOS en `ios/`). Scripts de apoyo ahí mismo (`serve.mjs`, `run-audit.mjs`,
  `run-specs.mjs`, `issues.mjs`). La app se sirvió en el 3110 (`node serve.mjs both 3110`).
- **A medias**: Android **sin revisar en el emulador**: el emulador se cayó con la máquina sin memoria (una
  corrida de Jest de FINANVOZ-app con 23 procesos) y lanzar el emulador no está permitido a Cursor. Falta revisar
  entrada, Aprobaciones (Rechazar), evento sin «—», tarea, alta de tarea e Inicio en las dos entidades con la
  copia `com.artaproducciones.ops.redesign`. El flujo de capturas de iOS solo saca ARTA (cuenta demo).
- **Siguiente (Claude)**: revisar capturas `despues-*`, pulir, revisar Android en el emulador y desplegar la web.

## Turno claude-code (2026-10-12, mediodía): acabado visual a medias → Cursor (ejecutado arriba)

Adam: «todavía te faltan detalles» y luego «dime qué falta a ver si Cursor puede acabarlo y lo pules». Se
detuvieron los agentes y se guardaron puntos de control que **compilan** (no verificados en pantalla):
web `9d2eabb` (`styles/_acabado.scss`, `lib/format.ts`, `PageHeader`, cabecera de evento compacta, campos del
sistema, color solo en alertas, un relleno por fila, chat sin slugs, Organizaciones/Seguridad/Configuración/
Plantillas/Calendario/acceso), Android `5950776`, iOS `7b28b29`…`5557c44`. **Lo que falta está en
`.ai/EXEC-PACKET.md` (LISTO PARA CURSOR)**: revisar pantalla por pantalla, cerrar huecos, auditoría limpia,
capturas en `.ai/scratch/acabado/` (excluida de git en `.git/info/exclude`). Producción sigue en `ec45283`:
desplegar solo después de la revisión de Claude.

## Turno claude-code (2026-10-12, madrugada): pulido «sin cortes»

Adam: «más premium y agradable, tiene muchos cortes no agradables» (textos con «…», cosas cortadas por bordes o
barras). Hecho en las tres plataformas, con capturas antes/después revisadas:
- **Web** (`2724a4a`, `ec45283`, desplegado): auditoría Playwright de 40 pantallas × 2 entidades × 4 tamaños
  (`apps/web/playwright.audit.config.ts`, `e2e/audit/`, datos `e2e/support/rich-fixtures.ts`; correr con la app en
  el 3100). Texto cortado 175–197 → 0 por tamaño (lo que queda en un renglón lleva `title`), recortes 15–178 → 0.
  Estilos en `styles/_pulido.scss` (se importa al final), comportamiento en `components/app-shell/useShellPolish.ts`.
  Pendiente: tablas de OC y campañas en móvil siguen como tabla con desvanecido; «Último acceso» en Usuarios.
- **iOS** (`2207b7b`, `8b31a8e`, `2b9e2fa`, `971a5ac`; ios-build 38209662592 y capturas 38209664892 verdes):
  desvanecido antes de la barra de pestañas y bajo la barra de estado, renglones a dos líneas, canal de evento
  con el evento de título y el artista abajo, aviso de cambio de entidad compacto.
- **Android** (`94f5970`, `5ef64c2`, `1d95d84`): accesos de Inicio en cuadrícula, filtros de Tareas en dos
  renglones, «nueva conversación» en la barra de Chats (el botón flotante tapaba el último chat), desvanecidos
  bajo barras. Medido en el emulador (2 GB, debug): arranca igual o más rápido que antes del pulido; el «no
  responde» que salió una vez fue del emulador, no de la app.
- Nada de esto está en tiendas: iOS 1.0.0 (11) sigue `WAITING_FOR_REVIEW`; va en 1.0.1 / versionCode 4.

## Turno claude-code (2026-10-11, tarde): formatos del Auditorio, sistema visual e ícono nuevo

- **Formatos del Auditorio** (`0ac37e2`, migración `20261011150000`): Checklist Auditorio (hojas AUDITORIO +
  MERCH), Limpieza (15 áreas), Mantenimiento rehecho (20 áreas, fotos como adjuntos por área) y Compromiso de
  horarios (condiciones y aceptación tal cual, firmas «Producción externa» / «Auditorio Explanada Puebla»). Los
  8 de ARTA y el libro de Pendones quedan solo ARTA. Contrato en `docs/FORMATOS.md`. En producción se corrió
  `upgrade-format-templates.ts --add-auditorio-formats --confirm-produccion` (segunda pasada `--dry` sin cambios)
  y se borraron a mano los 8 formatos de ARTA del evento Omar Camacho (`cmv16n3qy00cjmoc0niy4jed7`), creados
  solos el 09-10 y nunca editados; respaldo previo `20261011-2216.sql.gz`.
- **Avance de formatos**: los campos del encabezado que se llenan solos (evento, fecha, hora) cuentan como
  capturados, igual que en ARTA; por eso un formato nuevo del Auditorio nace en 43–67 %. Se le ofreció a Adam
  que arranque en 0 %; sin respuesta todavía.
- **Sistema visual aprobado** (`docs/diseno/SISTEMA-VISUAL.md`, referencia `propuesta-arta-auditorio.png`):
  ARTA claro (papel/tinta, redondeado) y Auditorio oscuro (negro/plata, recto); Nunito en web y Android, SF Pro
  Rounded en iOS. Web `c3cc958` (desplegado; terciario oscurecido a `#6b6b73`/`#8a8a93` por contraste AA),
  iOS `11026e1`+`7e85447` (ios-build y capturas verdes), Android `96927c9`, retoques `a689724`.
- **Ícono nuevo «A · Papel»** (`495c11d`, elegido por Adam): «a» del logo en tinta sobre papel en iOS, Android,
  Play (`icon-512`, feature graphic) y el panel web instalado; fuente única `play-assets/generar.py`. iOS arranca
  en color papel (`LaunchBackground`, `UIUserInterfaceStyle` Light); Android arranca en papel, tema base claro,
  acento de avisos en tinta y fondo de ventana por entidad.
- **Tiendas**: iOS 1.0.0 (11) sigue `WAITING_FOR_REVIEW` (envío `c1da1a8a…`); Play 1.0.0 (3) en revisión. Nada
  de lo de hoy está en las tiendas: va en iOS 1.0.1 (TestFlight con `-f version=1.0.1 -f build=12`, solo con el
  visto bueno de Adam) y Android versionCode 4 tras la aprobación. Al subirlas, cambiar también el ícono y el
  feature graphic de la ficha de Play y las capturas (las de iOS ya salen claras en `ios-screenshots.yml`).
- **E2E web**: además de los que fallaban desde el 07-10, hay specs viejos que esperan textos que ya no existen
  (calendar, correcciones-0930, editors, event-edit, excel-hf, hotfix-sheet-editor, hub-critical,
  public-site, purchase-orders). Pasan app-shell, tasks, login, layout, mobile-shell, users-alta y
  formatos-auditorio.
- **Emulador**: quedó instalada la copia de prueba `com.artaproducciones.ops.redesign` (otra firma que la app de
  tienda); se puede desinstalar.

## Turno claude-code (2026-10-11): ARTA y Auditorio separados (API, web, iOS, Android)

Pedido de Adam: Auditorio (EXPLANADA) es otro negocio; nada de Auditorio en ARTA salvo para híbridos.
Contrato completo: `docs/entidades-arta-auditorio.md`.
- **Accesos** (`apps/api/scripts/apply-access-arta-auditorio-1011.ts`, todos `dir_adjunta` salvo dirección
  general): Leida y Marisol ARTA; Monse y Kika ambas; Rodrigo, Will y JP Auditorio; Chacho y Arturo
  `dir_general`. `dir_adjunta` da de alta gente nueva (`users.create`) pero no toca usuarios existentes.
- **API** (`49ce057`): migración `20261011120000` (entidad en ChatChannel/TaskAssignment/PaymentProof),
  `common/entity-scope.ts` (`?entity=` en listados; sin él, todas las de la persona), chat con #general y
  #anuncios por entidad (`general-auditorio`/`anuncios-auditorio`, solo donde hay gente solo de Auditorio),
  avisos/tareas/anticipos/Inicio/plantillas por entidad, carpetas con 403.
- **Web** (`0ba0322`): `?entity=` en tareas, chat, avisos, anticipos y plantillas; Usuarios para
  `users.create` (solo alta); acento de Auditorio plateado `#c7ccd4`/`#9aa1ac` (antes azul).
- **iOS** (`f233b36`, `933ce62`, `8382ff8`) y **Android** (`a70059d`): entidad activa por usuario, doble
  toque en Inicio (y chip en Inicio, selector en Más) para híbridos, acento dorado/plateado, `?entity=` en
  todo. Sin subir a tiendas todavía (la 1.0.0 sigue en revisión). Pendiente en apps: las vistas web
  dentro de la app siguen en `arta.*` y un aviso de la otra entidad no cambia de entidad al abrirlo.
- **Propuesta visual**: aprobada y aplicada (ver turno de la tarde arriba).
- **Formatos de Auditorio**: hechos y en producción (ver turno de la tarde arriba).

## Turno claude-code (2026-10-09): repo público con historial sin contraseñas

GitHub no cobraba los minutos de Actions de la cuenta (banco de Adam bloqueado) y NEXARA-app ya corre gratis por
ser público. Adam pidió hacer público ARTA-app sacando antes las contraseñas del historial.
- **Repo nuevo con el mismo nombre** `AdamPark7014/ARTA-app` (historial reescrito con git-filter-repo, mismos 290
  commits con SHAs nuevos: los SHAs viejos citados abajo ya no existen en GitHub). El repo viejo quedó como
  **`ARTA-app-privado`** (privado, con el historial original). Respaldo completo local:
  `C:\dev\secrets\arta-store\ARTA-app-historial-completo-2026-10-09.bundle`.
- Se reemplazaron en todo el historial las 11 contraseñas del sembrador (la general y las de Arturo, Chacho,
  Melissa, Rodrigo, Williams, Leida, JP, Monse, Marisol y Kika) por `CambiaEsto-<Nombre>`; la de desarrollo
  pasó a `ArtaDevLocal-1` (sembrador, CI, e2e, `.env.example`). Comprobado: 0 coincidencias en GitHub.
- `docs/ACCESS.md` salió de todo el historial y ahora es **solo local** (`.gitignore`); copia en
  `C:\dev\secrets\arta-store\ACCESS.md`. Ya no aplica la regla «No tocar docs/ACCESS.md» en git.
- Secretos de Actions recreados en el repo nuevo (los 7, desde `C:\dev\secrets\arta-ios` y `arta-store`).
- **Servidor**: `/var/www/arta-app` tiene el historial viejo. El próximo deploy por bundle no hace
  fast-forward: tras `git fetch /root/arta-main.bundle main`, usar `git checkout -B main FETCH_HEAD`
  (árbol limpio salvo `deploy/.env.arta`, que no está versionado) y luego `update.sh --no-pull`.
- **Pendiente de Adam**: si alguna de esas 11 contraseñas sigue sirviendo en producción, cambiarla (estuvieron en
  un repo privado); decidir si se borra `ARTA-app-privado`.
- **iOS 1.0.0 (build 11) en revisión** desde el 09-10 ~18:45 UTC (envío nuevo `c1da1a8a…`; el `ee2a8741…` con la
  build 6 se canceló por la API para cambiar la build). Build 11 = texto nuevo del diálogo «Eliminar mi cuenta».
  Video `ARTA-app-review-1.0.0-build11.mp4` (corrida `37971415326`, 6:01, versión «1.0.0 (11)» en Más, página
  de baja cargada en Safari) como adjunto único; notas al día (la carta firmada quedó en la respuesta del 08-10).
  En el repo nuevo `run_number` reinició: TestFlight y video se lanzan con `-f build=N` (siguiente: 12).
  Scripts de la API pública usados (scratchpad, no versionados): cancelar envío = PATCH `reviewSubmissions/{id}`
  `canceled:true`; reenviar = POST `reviewSubmissions` + POST `reviewSubmissionItems` + PATCH `submitted:true`.

## Turno claude-code (2026-10-06 → 07): rechazo 2.1 de Apple, reportar/bloquear, baja de cuenta

- **Apple rechazó la 1.0.0 (build 4)** el 06-10 con 2.1 «Information Needed» (cuenta con poco historial):
  pide video en iPhone desde que se abre la app (login, eliminar cuenta, **reportar y bloquear** contenido
  de usuarios) y 6 respuestas, también en las Notas. Hilo `cac88353-72f7-3530-8580-d96429ac21f5`, envío
  `ee2a8741…` en UNRESOLVED_ISSUES. Texto de respuesta: `docs/store/RESPUESTA-APPLE-2.1.md`.
- **Reportar y bloquear** (API `b461e6d`, Android `636c2ba`, iOS `7377b25`; contrato
  `docs/chat-reportar-bloquear.md`). Términos con tolerancia cero.
- **Cuelgue real del chat iOS**: con el teclado abierto, arrastrar la conversación dejaba el hilo principal
  sin contestar (`.scrollDismissesKeyboard(.interactively)` + `.defaultScrollAnchor(.bottom)`, iOS 26).
  Pasó a `.immediately` (`4f89818`); `testZDiagnosticoArrastre` lo comprueba (3 escenarios responden).
- **Video para Apple en simulador**: flujo `ios-review-video.yml` (inputs `version`/`build` para que Más muestre
  la de TestFlight; `sample` automático si la app se queda quieta 40 s). La prueba ya no arrastra con teclado,
  abre la tarea correcta y espera a que Safari pinte la página de eliminar cuenta. Corrida buena con build 6:
  `37653966259` (pero Safari no alcanzó a cargar → se cambió la prueba en `79801c4`).
- **Resembrado de la cuenta demo** borra los mensajes que no son de la siembra (el video deja uno por corrida).
- **Baja de cuenta = desactivar** (regla de Adam 07-10): `DELETE /users/:id` ya hace `active=false`, revoca
  sesiones y notifications filtra `active`; lo creado se queda con su autor. La página `/legal/eliminar-cuenta`,
  privacidad y los textos de las apps (iOS diálogo, Android subtítulo, `1abad39`) ahora lo dicen así.
- **ASC**: build 6 (`bfb83052…`, con reportar/bloquear y el arreglo del chat) VALID y ligada a la 1.0.0;
  notas de revisión reescritas con las 6 respuestas (API pública, `appStoreReviewDetails/9ed9de8a…`).
- **iOS 1.0.0 (build 6) REENVIADO** el 08-10 15:25 UTC → WAITING_FOR_REVIEW (envío `ee2a8741…`). Video
  `ARTA-app-review-1.0.0-build6.mp4` (corrida `37653966259`) como único adjunto de App Review (ASC solo admite
  uno; la carta firmada salió de ahí y va adjunta en la respuesta del hilo). Respuesta = la de
  `docs/store/RESPUESTA-APPLE-2.1.md` + párrafo de baja de cuenta. Para reenviar: «Actualizar revisión» en la
  versión y luego «Volver a enviar a revisión de apps» en el envío (antes de actualizar, ese botón está gris).
- **GitHub Actions BLOQUEADO** desde el 07-10 ~17:06 UTC: se acabaron los 2,000 min incluidos (NEXARA-app
  $41, ARTA-app $12 brutos en octubre) y GitHub no logra cobrar el excedente a la tarjeta («recent account
  payments have failed…»). Sin presupuestos configurados. Nada de macOS corre hasta que Adam lo arregle.
- **Android 1.0.0 (código 3) EN REVISIÓN** el 08-10 ~15:35 UTC en Producción (178 países), con reportar/
  bloquear y el texto nuevo de la baja; reemplazó a la versión 2 (Adam aceptó reiniciar la revisión que
  llevaba desde el 05-10). Notas es-419 de primera versión.
- **Pendiente**: (1) Con Actions de vuelta: build iOS con el texto nuevo de baja (`1abad39`) como 1.0.1.
  (2) Si Google pide actualizar el cuestionario IARC por la interacción entre usuarios, contestarlo.
  (3) `asc_signing.Asc` ya antepone `/v1`: en scripts nuevos usar rutas sin `/v1`.

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
