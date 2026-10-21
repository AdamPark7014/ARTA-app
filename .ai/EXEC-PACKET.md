# EXEC-PACKET — ARTA-app

- **Escrito por:** Claude (cabeza)
- **Fecha:** 2026-10-21
- **Rama:** main
- **Estado:** LISTO PARA CURSOR
<!-- Estados: BORRADOR → LISTO PARA CURSOR → EN EJECUCION → CERRADO -->

## Objetivo
Dejar **Android a la par de iOS** para publicar la versión 1.0.1 en Google Play (Adam: «acaba ya con todo y
deployas»). iOS ya lo hizo el 19-10 en `34c9258` (rechazo 3.2 de Apple: ARTA es una **plataforma**, no una app
de una sola empresa): modo demo **en la build de tienda**, botón «Explorar ARTA con datos de muestra» en la
entrada, enlace a la página pública `/contratar`, pastilla de demo con «Salir», secciones web con aviso en el
demo, y textos que hablan de «tu organización». Android solo tiene el demo en `src/debug` (capturas de tienda).
Además: revisar en el emulador el acabado visual de Android que quedó pendiente el 12-10.
Claude compila el AAB (versionCode 4 / 1.0.1), lo sube a Play y actualiza la ficha.

## Criterios de éxito
- [ ] El demo funciona en **release**: las clases de `app/src/debug/java/com/artaproducciones/ops/demo/`
      (`DemoInterceptor`, `DemoProvider`, `DemoStore`, `DemoLaunch`) pasan a `main` (o a un paquete `demo` de
      `main`) y las fixtures de `apps/mobile-native/demo/` viajan también en release (`build.gradle.kts`:
      `sourceSets["debug"].assets.srcDir("../../demo")` → que aplique a `main`, solo los `.json`).
- [ ] `ApiDebugHooks.demo` se puede encender en tiempo de ejecución desde la entrada (como `Session.enterDemo`
      en iOS): sesión ficticia en memoria, sin red, sin socket (`RealtimeClient`) y **sin registrar push**.
      Al salir del demo se borra todo y vuelve a la entrada. El arranque por extras (`--ez arta_demo true`)
      sigue funcionando para las capturas.
- [ ] Entrada (`ui/login/LoginScreen.kt`): botón secundario «Explorar ARTA con datos de muestra» bajo
      «Entrar», y enlace «¿Tu organización aún no usa ARTA? Conoce cómo contratarlo» que abre
      `https://artaproducciones.com/contratar` en el navegador. Mismo estilo del sistema (papel/tinta, píldora).
- [ ] En el demo: pastilla fija arriba «Modo demo · datos de muestra» con «Salir» (ARTA píldora negra; Auditorio
      plata con texto negro), y las pantallas que abren la web (módulos de «Más», «En la web» del evento,
      calendario web) muestran un aviso «Disponible con una cuenta de tu organización» en vez de cargar la web.
- [ ] Textos de plataforma donde la app diga que es solo del «equipo de Arta Producciones» (entrada, Más /
      acerca de, soporte): «tu organización» / «tu equipo», como en iOS (`UI/Common/AppMeta.swift`,
      `UI/LoginView.swift`).
- [ ] Revisión visual en el emulador (modo demo, las dos entidades, doble toque en Inicio cambia): entrada,
      Inicio, Aprobaciones («Rechazar» discreto), detalle de evento (sin «—» en cifras), detalle de tarea, alta
      de tarea, Chats, Más. Corregir lo que se vea mal según `docs/diseno/SISTEMA-VISUAL.md`.
- [ ] `gradlew.bat assembleDebug testDebugUnitTest` en verde y `gradlew.bat :app:assembleRelease` compila
      (sin firmar está bien si no hay llave: no la busques ni la toques).
- [ ] Capturas antes/después en `.ai/scratch/android-1.0.1/` (excluida de git).

## Contexto mínimo a cargar
1. `git show 34c9258 -- apps/mobile-native/ios` — la especificación (lo mismo, en SwiftUI).
2. `apps/mobile-native/android/app/src/main/java/com/artaproducciones/ops/data/api/ApiDebugHooks.kt`
3. `apps/mobile-native/android/app/src/debug/java/com/artaproducciones/ops/demo/` (4 archivos)
4. `apps/mobile-native/android/app/build.gradle.kts` (sourceSets, preflight de release)
5. `apps/mobile-native/android/app/src/main/java/com/artaproducciones/ops/data/Session.kt`
6. `apps/mobile-native/android/app/src/main/java/com/artaproducciones/ops/ui/login/LoginScreen.kt`
7. `docs/diseno/SISTEMA-VISUAL.md`

## Archivos a tocar
1. `android/app/build.gradle.kts` (assets del demo en main; **no** tocar versionCode/versionName ni firma)
2. `android/app/src/main/java/com/artaproducciones/ops/demo/*` (movidos desde debug)
3. `android/app/src/debug/java/com/artaproducciones/ops/demo/*` (quitar lo movido; dejar solo lo exclusivo de debug)
4. `android/app/src/main/java/com/artaproducciones/ops/data/api/ApiDebugHooks.kt` (o renombrar a `DemoHooks` si queda más claro)
5. `android/app/src/main/java/com/artaproducciones/ops/data/Session.kt` (`enterDemo` / `exitDemo`)
6. `android/app/src/main/java/com/artaproducciones/ops/ui/login/LoginScreen.kt`
7. `android/app/src/main/java/com/artaproducciones/ops/ui/ArtaApp.kt` (pastilla de demo)
8. `android/app/src/main/java/com/artaproducciones/ops/MainActivity.kt` (no pedir permiso de avisos ni registrar push en demo)
9. Pantallas que abren la web (buscar `WebView`, `openWeb`, `En la web` en `ui/`)
10. `android/app/src/main/java/com/artaproducciones/ops/data/realtime/RealtimeClient.kt` (apagado en demo)
11. `android/app/src/main/res/values/strings.xml` si hay textos ahí
12. `docs/store/PLAY-STORE.md` (anotar el demo y los textos)

## Pasos numerados
1. `pwsh -NoProfile -File C:\dev\scripts\relevo\relevo.ps1 estado` (árbol limpio en `c28eda6` o posterior;
   `.ai/audit/` sin seguimiento no es tuyo: no lo toques ni lo commitees).
2. Leer el contexto mínimo. Mover el demo a `main` sin cambiar su comportamiento; compilar.
3. Encendido en tiempo de ejecución + `Session.enterDemo/exitDemo`; sin red, socket ni push en demo.
4. Entrada: botón de demo + enlace a `/contratar`; pastilla con «Salir»; avisos en lo que abre la web.
5. Textos de plataforma.
6. `gradlew.bat assembleDebug testDebugUnitTest` y `gradlew.bat :app:assembleRelease`.
7. Si `adb devices` muestra un emulador (Claude lo deja encendido), instalar la debug como copia lado a lado
   o la debug normal **solo si no está instalada la de tienda** (`adb shell pm list packages | findstr arta`;
   si está `com.artaproducciones.ops` de tienda, NO desinstalarla: usa
   `--init-script C:\Users\adpoz\AppData\Local\Temp\claude\C--dev\8a455b4a-d5fc-4181-bfa4-53faac6684d2\scratchpad\pulido-android\tools\redesign-init.gradle`
   que instala `com.artaproducciones.ops.redesign`). El emulador es lento: esperar ~25 s tras abrir. Probar el
   botón de demo desde la entrada (sin el extra), la pastilla y «Salir»; luego la revisión visual del criterio.
   Capturas con `adb exec-out screencap -p > archivo.png` en `.ai/scratch/android-1.0.1/`.
8. Commits pequeños; `git pull --rebase`; subir a `origin main`. Estado: CERRADO aquí; actualizar `.ai/RELEVO.md`.

## Tests / verificación
- `gradlew.bat assembleDebug testDebugUnitTest` (42+ pruebas, 0 fallas) y `gradlew.bat :app:assembleRelease`.
- Emulador: demo desde la entrada en release-like (debug sin el extra), pastilla, salir, sin llamadas de red
  (`adb logcat | findstr OkHttp` no debe mostrar peticiones a artaproducciones.com en demo).
- Capturas antes/después revisadas.

## Workers (NO_LLM / LOCAL / MCP)
- NO_LLM: gradle, adb, git.
- LOCAL: `ollama_find` para localizar `WebView`/`openWeb`/textos «Arta Producciones» en `ui/`.

## No hacer / riesgos
- Solo `main`; commits con rutas explícitas (nunca `git add -A`) y trailer `Agente: cursor`; no escribir «push»
  en mensajes; rutas con `push/` (p. ej. `ops/push/`) → `git add --pathspec-from-file`.
- **No tocar** `key.properties`, `*.jks`, `gradle.properties` (versionCode/versionName), firma, ni subir a Play:
  lo hace Claude. No renombrar canales de avisos existentes.
- Repo público: nada de credenciales ni datos personales; las fixtures del demo ya son ficticias (no regrabarlas).
- No cambiar el API ni la web.
- Prohibido `git reset --hard`, `git checkout --`, `git clean`, `git stash drop` (además están bloqueados).

## Handoff a Cursor
Frase de arranque: «Lee `.ai/EXEC-PACKET.md` de ARTA-app y ejecútalo de principio a fin: Android a la par de iOS
(demo en la build de tienda, botón en la entrada, `/contratar`, textos de plataforma), revisión en el emulador,
pruebas en verde, capturas en `.ai/scratch/android-1.0.1/` y sube a main. No toques versionCode, firma ni Play.»
