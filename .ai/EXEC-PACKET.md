# EXEC-PACKET — ARTA-app

- **Escrito por:** Claude (cabeza)
- **Fecha:** 2026-10-12
- **Rama:** main
- **Estado:** CERRADO
- **Ejecutó:** Cursor, 2026-10-12 (`6268d65`, `aaa36cb`, `41999aa`, `c6ded75` + cierre). Pendiente: Android en
  el emulador (ver criterio Android).
<!-- Estados: BORRADOR → LISTO PARA CURSOR → EN EJECUCION → CERRADO -->

## Objetivo
Terminar la **segunda pasada visual** («acabado») que pidió Adam: «todavía te faltan detalles por mejorar
para mejorar el sistema visualmente». El código ya está casi todo escrito y **compila**; lo que falta es
**revisarlo pantalla por pantalla, corregir lo que se vea mal y cerrar los huecos** en web, Android e iOS.
Claude revisa y pule al final, y despliega la web.

Sistema visual aprobado (manda): `docs/diseno/SISTEMA-VISUAL.md` (incluye la sección «Sin cortes»).
ARTA claro (papel `#f7f6f3` / tinta `#0c0c0d`, redondeado), Auditorio oscuro (negro / plata, recto),
Nunito en web y Android, SF Pro Rounded en iOS. Monocromo: color **solo** en alertas y errores reales.

## Estado al entregar (lo que ya está en main)
- Web `9d2eabb` (punto de control, compila: typecheck + `npm run build`): estilos en
  `apps/web/styles/_acabado.scss` (se importa al final de `globals.scss`), formato de cifras en
  `apps/web/lib/format.ts`, nombres de chat en `apps/web/components/chat/chat-ui.tsx`
  (`channelLabel` / `channelDisplayName`). Cubre, **sin verificar**, los puntos 1–11 de abajo.
- Android `5950776` (compila, 42 pruebas unitarias en verde): entrada premium, «Rechazar» discreto,
  cifras sin «—», encabezados de sección iguales. **Sin verificar en el emulador.**
- iOS `7b28b29`, `a349f91`, `7f2fb7f`, `5557c44`: entrada premium, secciones con el mismo encabezado, sin «—»
  en cifras, detalle de tarea. Compilación de `5557c44` lanzada (corrida 38300682548): confirmar en verde.
- Pasada anterior «sin cortes» ya desplegada (`ec45283`): auditoría Playwright en
  `apps/web/playwright.audit.config.ts` + `apps/web/e2e/audit/` + datos `apps/web/e2e/support/rich-fixtures.ts`.

## Criterios de éxito
- [x] **Web**, en las dos entidades (ARTA y Auditorio) a 1536×864 y 1536×730 (login, tareas y chat también a
      390×844), cada punto se ve terminado:
  1. Todas las pantallas con el mismo encabezado (`PageHeader`/`.ph`: título, una línea de descripción,
     acciones a la derecha, mismo aire). Revisar en especial Tareas, Usuarios, Seguridad, Organizaciones,
     Plantillas, Configuración, que antes no tenían título.
  2. Cabecera del evento compacta (título ~24–26 px, datos en un renglón, «cuánto falta» como ficha) y
     pestañas que se quedan pegadas bajo la barra superior al bajar. Nada encimado.
  3. Ningún campo con aspecto del navegador: selects con chevron propio, fecha/hora con icono propio y
     «dd/mm/aaaa» como pista, números sin flechitas, casillas/radios/interruptores del tema. El alta rápida
     de Tareas se lee como un solo compositor.
  4. Sin color de decoración: tarjetas y grupos neutros (Tareas «Vencidas/Bloqueadas», Usuarios «Sin entrar /
     Bloqueados / Alto riesgo»), distribución por rol en tonos de tinta/plata con leyenda, Corrida sin aviso
     ni botón verdes, Plantillas sin «Activa» verde ni «Inactiva» roja. El color solo en punto/texto pequeño
     de una alerta real.
  5. Máximo un elemento relleno por fila (Órdenes de compra, OC del evento, Boletera, Usuarios, Seguridad):
     estado con contorno + punto junto a su botón; «Eliminar/Revocar» discretos (rojo solo al pasar el
     cursor) y siempre con confirmación.
  6. Chat sin slugs en **ningún** lugar: lista, encabezado, estado vacío («Este es el inicio de…»),
     marcador del cuadro de texto («Escribe un mensaje…» o «Mensaje para <nombre>» si cabe), diálogos.
  7. Organizaciones y Seguridad en español de negocio (nada de «Tenants», «soft enforced», «Stripe env»,
     slugs en monoespaciado); fechas cortas («11 oct, 23:32»); columnas que no parten nombres en 4–5 renglones
     (también «Último acceso» en Usuarios).
  8. Configuración con su diseño de ajustes (etiqueta y explicación a la izquierda, control a la derecha), no
     una tarjeta perdida en una esquina.
  9. Plantillas: tarjetas alineadas arriba, misma estructura, acciones al pie.
  10. Calendario: fichas finas con barra de acento (no bloques negros), «hoy» claro, fines de semana y otros
      meses suaves, sin cortes.
  11. Acceso (login): pantalla partida, marca a la izquierda con «La experiencia del Show», formulario claro,
      contraseña con marcador «Tu contraseña», botón principal en el acento con estado apagado intencional.
      Probar `arta.localhost` (claro) y `auditorio.localhost` (oscuro) y 390×844.
  12. Cifras con un solo formato (`lib/format.ts`): tarjetas sin centavos, tablas y detalle con centavos.
  13. Ninguna cifra grande con «—» (poner la palabra: «Sin formatos», etc.); iconos del mismo tamaño y trazo;
      estados al pasar el cursor y foco visibles.
- [x] Huecos de la pasada anterior: en 390×844 las tablas de **Órdenes de compra** y **Campañas** pasan a
      tarjetas; en Inicio el panel «Hoy» no deja hueco abajo cuando la otra columna es más alta.
- [x] Auditoría «sin cortes» limpia otra vez: 0 texto cortado (salvo un renglón con `title`), 0 recortes,
      0 scroll horizontal, contraste AA, en las 2 entidades × 4 tamaños. (`despues-*.txt`: 0 en todo.)
- [x] Specs web que pasan hoy siguen pasando: app-shell, tasks, login, layout, mobile-shell, users-alta,
      formatos-auditorio (actualizar selectores solo si el cambio es puramente visual). 47/47; en login el
      botón del 2FA ahora es «Confirmar».
- [ ] **Android** verificado en el emulador (modo demo, las dos entidades): entrada, Aprobaciones (Rechazar),
      detalle de evento (sin «—»), detalle de tarea, alta de tarea, Inicio; paridad con iOS.
      **No hecho**: `assembleDebug testDebugUnitTest` en verde (42 pruebas, 0 fallas), pero el emulador se cayó
      con la máquina sin memoria (una corrida de Jest de otro repo) y lanzarlo no está permitido a Cursor.
- [x] **iOS**: `ios-build.yml` (38300682548) y `ios-screenshots.yml` (38307275188) en verde; capturas 01–07
      revisadas (`.ai/scratch/acabado/ios/`). El flujo solo captura ARTA (la cuenta demo); el Auditorio en iOS
      no tiene captura automática.
- [x] Capturas antes/después de cada punto en `.ai/scratch/acabado/` (no se versiona) para que Claude revise.

## Contexto mínimo a cargar
1. `docs/diseno/SISTEMA-VISUAL.md` — tokens, tipografía, componentes, «Sin cortes».
2. `apps/web/styles/_acabado.scss` — índice de lo hecho por punto (comentarios «═══ N. …»).
3. `apps/web/components/ui/PageChrome.tsx` — `PageHeader`.
4. `apps/web/components/chat/chat-ui.tsx` — `channelLabel` / `channelDisplayName`.
5. `apps/web/playwright.audit.config.ts` + `apps/web/e2e/audit/` — auditoría y cómo se sirve la app (puerto 3100).
6. `apps/mobile-native/android/app/src/main/java/com/artaproducciones/ops/ui/theme/Components.kt` — componentes Android.
7. `apps/mobile-native/ios/ArtaApp/UI/Common/Theme.swift` — tokens iOS.

## Archivos a tocar
1. `apps/web/styles/_acabado.scss` (ajustes de estilo de los 13 puntos)
2. `apps/web/components/ui/PageChrome.tsx`
3. `apps/web/components/chat/ChatPanels.tsx` y `apps/web/app/(app)/chat/page.tsx` (estado vacío y marcador sin slug)
4. `apps/web/components/ui/EventHero.tsx` y `apps/web/components/events/EventTabBar.tsx`
5. `apps/web/app/(app)/purchase-orders/page.tsx` y `apps/web/app/(app)/campaigns/page.tsx` (tarjetas en móvil)
6. `apps/web/app/(app)/dashboard/page.tsx` (panel «Hoy»)
7. `apps/web/lib/format.ts`
8. `apps/web/app/(auth)/login/page.tsx`
9. Las páginas de `apps/web/app/(app)/*/page.tsx` donde la revisión encuentre detalles
10. `apps/mobile-native/android/.../ui/login/LoginScreen.kt`, `ui/modules/ApprovalsScreen.kt`, `ui/modules/EventDetailScreen.kt`
11. `apps/mobile-native/ios/ArtaApp/UI/**` solo si las capturas muestran algo mal
12. `docs/diseno/SISTEMA-VISUAL.md` (anotar reglas nuevas: encabezado de pantalla, un relleno por fila, campos)

## Pasos numerados
1. [hecho] `pwsh -File C:\dev\scripts\relevo\relevo.ps1 estado` — el árbol debe estar limpio en `5557c44` o posterior.
   Si hay archivos sin commitear, son de otro turno: `relevo.ps1 salvar` antes de tocar nada.
2. [hecho, también 1280×720 y 390×844] Web: levantar la app con la API simulada como lo hace la auditoría (ver `playwright.audit.config.ts`) y sacar
   capturas de TODAS las pantallas en las dos entidades a 1536×864 y 1536×730 → `.ai/scratch/acabado/antes-*`.
3. [hecho] Recorrer los puntos 1–13 con las capturas; corregir en `_acabado.scss` o en la página. Un commit pequeño por
   punto (o por grupo de pantallas). Revisar Auditorio igual de terminado que ARTA.
4. [hecho] Terminar el chat (punto 6): estado vacío, marcador del cuadro de texto, diálogos y búsqueda sin slug.
5. [hecho] Móvil web (390×844): Órdenes de compra y Campañas como tarjetas; Tareas, chat y login sin cortes.
6. [hecho] Inicio: panel «Hoy» sin hueco (que la rejilla no estire la tarjeta, o que la lista crezca para llenarla).
7. [hecho, con la app en 3110] Correr la auditoría (`npx playwright test -c playwright.audit.config.ts` desde `apps/web`, app en 3100) hasta
   que quede limpia; correr los 7 specs; `npm run typecheck` y `npm run build`.
8. [hecho] Capturas «después» → `.ai/scratch/acabado/despues-*` (mismos nombres que «antes»).
9. [a medias: compila y 42 pruebas en verde; emulador caído, sin revisión en pantalla] Android: `gradlew.bat assembleDebug testDebugUnitTest`; instalar la copia de prueba lado a lado
   (`--init-script` con `redesign-init.gradle`, que vive en el scratchpad de Claude; si no lo encuentras,
   usa el emulador con la app de prueba ya instalada `com.artaproducciones.ops.redesign`; **no desinstalar la de
   tienda**). El emulador es lento: esperar ~25 s tras abrir antes de tocar. Revisar entrada, Aprobaciones,
   evento, tarea, alta de tarea e Inicio en las dos entidades (doble toque en Inicio cambia de entidad).
10. [hecho] iOS: confirmar `gh run view 38300682548 -R AdamPark7014/ARTA-app` en verde; correr
    `gh workflow run ios-screenshots.yml -R AdamPark7014/ARTA-app --ref main`, descargar y revisar.
11. [hecho] Subir a `origin main` (`git pull --rebase` antes). **No desplegar**: Claude revisa y despliega.
12. [hecho] Actualizar `.ai/RELEVO.md` entero en el último commit y `relevo.ps1 cerrar -Mensaje "acabado visual listo para revisión"`.

## Tests / verificación
- Web: `npm run typecheck`, `npm run build` (si falla `next/font` al bajar Nunito, es la red: reintentar),
  auditoría «sin cortes» limpia, specs app-shell, tasks, login, layout, mobile-shell, users-alta,
  formatos-auditorio.
- Android: `gradlew.bat assembleDebug testDebugUnitTest` (42+ pruebas, 0 fallas) + capturas del emulador.
- iOS: `ios-build.yml` y `ios-screenshots.yml` en verde; capturas revisadas.
- Capturas antes/después en `.ai/scratch/acabado/`.

## Workers (NO_LLM / LOCAL / MCP)
- NO_LLM: Playwright (auditoría y capturas), gradle, `gh` para las corridas de iOS, `adb exec-out screencap`.
- LOCAL: `ollama_find` para localizar clases/estilos en `globals.scss` y parciales antes de leer a mano.

## No hacer / riesgos
- **Solo `main`**: sin ramas, worktrees ni PRs. Commits con rutas explícitas (nunca `git add -A`), mensaje en
  español con el trailer `Agente: cursor`. No escribir la palabra «push» en mensajes de commit; una ruta que
  contenga `push/` (p. ej. `components/web-push/`) en la línea de `git add` la bloquea el hook: usar
  `git add --pathspec-from-file=<archivo>`.
- Repo **público**: nada de contraseñas, llaves, correos reales ni datos personales (los datos de prueba usan
  `@arta.test` / `@example.com`). No tocar `key.properties`, `*.jks`, `versionCode`, `.env*`, `docs/ACCESS.md`.
- No cambiar llamadas al API, permisos ni datos: es solo presentación.
- No rediseñar: el sistema está aprobado; esto es acabado. Nada de colores nuevos (ni azul, violeta ni dorado).
- No desplegar al servidor ni subir a TestFlight / Play: lo hace Claude tras revisar.
- Prohibido `git reset --hard`, `git checkout --`, `git clean`, `git stash drop`.
- El emulador Android es lento (2 GB): un «no responde» al abrir la versión debug es del emulador, no de la app
  (medido el 12-10: igual que antes del pulido).

## Handoff a Cursor
Frase de arranque: «Lee `.ai/EXEC-PACKET.md` de ARTA-app y ejecútalo de principio a fin: revisa pantalla por
pantalla el acabado visual (web, Android, iOS), corrige lo que se vea mal, deja la auditoría sin cortes limpia,
captura antes/después en `.ai/scratch/acabado/` y sube a main sin desplegar.»
Al terminar: marcar `- **Estado:** CERRADO` aquí y avisar a Adam para que Claude revise, pula y despliegue.
