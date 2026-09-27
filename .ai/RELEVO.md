# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-26
- **Rama:** feature/mobile-chat-push

## Hecho en este turno

Pedido de Adam: «armar la app Android e iOS como NEXARA-app… primero toda la
sistematización de mensajes tipo Slack (y perfeccionarla) y el esquema de push
como WhatsApp, para todos los procesos».

### `d5cf1b3` API: chat tipo Slack + Socket.IO + push FCM
- Prisma, migración `20260926210000_chat_channels_push` (backfill del chat viejo):
  canales públicos, privados y directos, miembros con `lastReadAt` y silencio,
  hilos, reacciones, fijados, menciones y `UserPushEndpoint`.
- `RealtimeGateway` (Socket.IO en `/api/socket.io`, sesión por cookie `arta_access`
  validada contra `UserSession`). Eventos `chat:*` y `notification:new`.
- `ChatService` v2: canales y directos, hilos, reacciones, fijados, editar (1 h) y
  borrar, búsqueda, menciones, silenciar, adjuntos (`chat/upload`) y escribiendo.
  Los endpoints viejos del chat siguen vivos para la web actual.
- `DevicesModule` (`POST|DELETE /devices/push`) + `PushDispatchService` (firebase-admin):
  - Android recibe solo `data`.
  - iOS recibe `alert` con `thread-id`, las categorías `ARTA_CHAT`/`ARTA_EVENT` y `mutable-content`.
  - `chat.read` se manda como push silencioso.
- Push en todos los procesos que ya avisaban: `NotificationsService` empuja cada aviso.
  - Nuevos: OC (autorizada, pagada, rechazada, cancelada, y «por pagar» a quien paga).
  - Formatos: enviado a revisión (a los aprobadores), aprobado, sellado, regresado y reabierto.
- `uploads/upload-storage.ts`: `uploadRoot` depende de `UPLOAD_DIR`.
- Jest API **278/278** con Postgres de prueba.

### `53f5d77` App Android nativa (`apps/mobile-native/android`)
- Kotlin + Compose, `com.artaproducciones.ops`, minSdk 26.
- Cookies en EncryptedSharedPreferences + CSRF, login con 2FA.
- Chats con filtros y búsqueda.
- Conversaciones: hilos, reacciones, fijados, menciones, foto y PDF, ✓/✓✓, escribiendo y silenciar.
- Pestaña de avisos y socket en vivo.
- FCM estilo WhatsApp:
  - 6 canales por tipo; `MessagingStyle` por conversación.
  - Responder y marcar como leído desde la notificación.
  - No suena con la conversación abierta; `chat.read` quita los avisos.
- `testDebugUnitTest` (PushPayload 6/6) y `assembleDebug` en verde; APK debug de 24 MB.
- Sin `google-services.json` compila sin push (`HAS_FIREBASE=false`).

### `479e513` App iOS nativa (`apps/mobile-native/ios`)
- SwiftUI + XcodeGen (`project.yml`), iOS 17, mismas pantallas y flujos que Android.
- Cookies en `HTTPCookieStorage` + CSRF.
- `PushManager`:
  - Token FCM; categorías `ARTA_CHAT` (responder, marcar leído) y `ARTA_EVENT`.
  - Sin banner si la conversación está abierta; silenciosos quitan los avisos.
- Extensión `NotificationService`: notificaciones de comunicación con avatar de iniciales (como WhatsApp).
- Workflow `.github/workflows/ios-build.yml`: compila para simulador sin firma.
  - Se lanza con `workflow_dispatch` o en un PR que toque `apps/mobile-native/ios`.
- `deploy/docker-compose.arta.yml` ahora pasa `FIREBASE_SERVICE_ACCOUNT_JSON` al API.
  - Antes no llegaba al contenedor.
  - Documentado en `deploy/.env.arta.example`.
- `apps/mobile-native/README.md`: qué hace, pasos de Firebase y cómo compilar.

## A medias

1. **iOS nunca se ha compilado**: no hay Mac ni Swift en esta máquina.
   - Se revisó a mano, pero el primer build real puede tener errores de tipo.
   - Hay que lanzar `ios-build.yml` y corregir lo que salga.
2. **Push sin probar de punta a punta**. Falta Firebase: `google-services.json`,
   `GoogleService-Info.plist`, la clave APNs `.p8` y `FIREBASE_SERVICE_ACCOUNT_JSON`
   en el `.env.arta` del servidor. Pasos en `apps/mobile-native/README.md`.
3. **Android sin probar en dispositivo o emulador**: compila y pasa unitarias, nada más.
4. **Badge inconsistente**: los push de avisos mandan `badge` = avisos sin leer y los
   de chat mandan `badge` = chat sin leer. Con la app abierta, iOS pone la suma.
   - Unificar en el API (`notifications.service.ts` y `chat.service.ts`) cuidando la
     dependencia circular Chat ↔ Notifications.
5. **La web de chat sigue usando los endpoints de compatibilidad**. Falta pasarla a
   `chat/channels/*` y al socket (hilos, reacciones y fijados solo se ven en móvil).
6. Decisiones anotadas:
   - La supervisión de directos por dirección se omitió a propósito, por privacidad.
   - Las menciones llegan como aviso aparte, no dentro del `MessagingStyle`.
   - Drift previo de `EventDocumentSlot` visto al generar la migración (no se tocó).

## Siguiente paso

1. Push de la rama y PR a `main`. Lanzar «iOS · compilar» y corregir hasta verde.
2. Adam: crear o usar el proyecto Firebase de ARTA y registrar las apps Android e iOS
   `com.artaproducciones.ops`. Subir la `.p8` y poner la cuenta de servicio en `.env.arta`.
3. Deploy: la migración `20260926210000_chat_channels_push` es aditiva y trae backfill.
   - Respaldo automático de `update.sh`.
   - Después, revisar que `/api/socket.io` pase por Traefik (mismo host, sin puerto nuevo).
4. Probar en teléfonos reales:
   - Chat en vivo, responder desde la notificación y leer en un dispositivo para que se quite en el otro.
   - Avisos de OC y de formatos.
5. Flujo TestFlight para iOS copiando `NEXARA-app/.github/workflows/ios-testflight.yml`
   (secretos del certificado y de App Store Connect).
6. Pendientes de turnos anteriores que siguen:
   - Deploy key de ARTA en GitHub (se despliega por bundle).
   - Quitar los eventos `[SEED_DEMO]` de producción cuando Adam dé el visto bueno.
   - Revisión visual de los formatos con sesión real.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` a un repo de app.
- No mover Traefik de puerto.
- Conceptos de campaña: no romper al tocar Excel.
- Credenciales de Firebase: nunca en git.
  - `google-services.json` y `GoogleService-Info.plist` están en `.gitignore`.
  - La cuenta de servicio solo va por variable de entorno.
