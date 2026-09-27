# ARTA móvil (nativa)

Apps 100 % nativas en paridad con NEXARA (`NEXARA-app/apps/mobile-native`):

| Carpeta | Stack | Identificador |
| --- | --- | --- |
| `android/` | Kotlin + Jetpack Compose | `com.artaproducciones.ops` |
| `ios/` | SwiftUI (XcodeGen) + extensión de avisos | `com.artaproducciones.ops` (+ `.NotificationService`) |

Ambas hablan con el mismo API que la web (`https://arta.artaproducciones.com/api`):
sesión por cookie `arta_access` + CSRF (`arta_csrf` → header `x-csrf-token`),
Socket.IO en `/api/socket.io` con la misma cookie y push por FCM.

## Qué hacen

- **Chat tipo Slack**: canales públicos/privados, directos, hilos, reacciones,
  fijados, menciones `@`, editar (1 h) y borrar, adjuntos (foto/PDF, 20 MB),
  «escribiendo…», ✓/✓✓ de leído, silenciar 8 h / 1 semana / siempre, búsqueda
  de compañeros para abrir un directo, envío optimista con reintento.
- **Avisos de todos los procesos** (OC, formatos, tareas, menciones) en su
  pestaña; los que aún no tienen pantalla nativa se abren en el panel web.
- **Push estilo WhatsApp**:
  - Android: canales por tipo (chat, aprobaciones, tareas, finanzas, eventos,
    general), `MessagingStyle` apilado por conversación, **Responder** y
    **Marcar como leído** desde la notificación, sin sonido si la
    conversación está abierta.
  - iOS: categorías `ARTA_CHAT` (Responder / Marcar como leído) y
    `ARTA_EVENT`, agrupado por `thread-id`, notificaciones de comunicación con
    la cara (iniciales) de quien escribe (extensión `NotificationService`).
  - Leer en un dispositivo quita los avisos de esa conversación en los demás
    (push silencioso `chat.read`).
  - Al cerrar sesión se da de baja el token del teléfono.

## Puesta en marcha de Firebase (una sola vez, la hace Adam)

1. En la consola de Firebase, crear (o usar) el proyecto de ARTA.
2. Registrar la app **Android** `com.artaproducciones.ops` y bajar
   `google-services.json` → `android/app/google-services.json` (no se versiona).
3. Registrar la app **iOS** `com.artaproducciones.ops`, bajar
   `GoogleService-Info.plist` → `ios/Resources/GoogleService-Info.plist` (no se
   versiona; en CI se escribe desde un secreto) y subir la clave APNs `.p8`
   del equipo de Apple en *Project settings → Cloud Messaging*.
4. Crear una cuenta de servicio (*Project settings → Service accounts →
   Generate new private key*) y poner su JSON (una línea o base64) en
   `FIREBASE_SERVICE_ACCOUNT_JSON` del `.env.arta` del servidor; reiniciar `arta-api`.

Sin estos archivos las dos apps compilan y funcionan, solo que sin push.

## Compilar

**Android** (Windows, con JDK 21 y el SDK en `local.properties`):

```powershell
cd apps/mobile-native/android
.\gradlew.bat testDebugUnitTest assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Contra un API local del emulador: `-PDEV_API_BASE_URL=http://10.0.2.2:4000/api`.

**iOS** (sin Mac): el flujo `.github/workflows/ios-build.yml` genera el
proyecto con XcodeGen y compila para simulador sin firma (lanzarlo desde
*Actions* o en un PR que toque `apps/mobile-native/ios`). Con una Mac:

```bash
cd apps/mobile-native/ios
brew install xcodegen && xcodegen generate && open ArtaApp.xcodeproj
```

La publicación en TestFlight seguirá el mismo esquema que NEXARA
(`ios-testflight.yml` + secretos del certificado y de App Store Connect).

## Paridad

Toda pantalla, endpoint y flujo existe en las dos plataformas. Si agregas algo
en una, agrega su análogo en la otra.
