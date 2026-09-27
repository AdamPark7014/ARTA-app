# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-26
- **Rama:** feature/mobile-chat-push
- **Producción:** `6b6624b` desplegado en `/var/www/arta-app` el 2026-09-27 04:14 UTC

## Hecho en este turno

Pedido de Adam: «continúa mejorando los huecos que veas y cuando acabes deploya por SSH».

### Verificación antes del deploy
- La API compilada arranca de verdad (`node dist/main.js` contra el Postgres local).
  No hay errores de DI y `RealtimeGateway` y `/devices/push` quedan montados.
- Smoke en vivo `.ai/scratch/live-smoke.mjs` (login con cookie + CSRF, socket con cookie):
  - Mensaje recibido en vivo por `chat:message`, conteo de no leídos y borrado.
  - Aviso por mención + `read-all`, que emite `notification:read` con `unread: 0`.
  - Uso: variables `SMOKE_A_EMAIL/PASS`, `SMOKE_B_EMAIL/PASS` y `SMOKE_NODE_MODULES`
    (una carpeta con `socket.io-client`).
- Traefik no necesita cambios. `/api/socket.io` entra por el router `arta-api`, se le quita `/api`
  y el upgrade a WebSocket pasa (verificado en producción: `wss` llega al gateway y este
  responde `unauthorized` sin sesión).
- La migración `20260926210000_chat_channels_push` se probó sobre una copia de la base de
  producción (base temporal `arta_migtest`, ya borrada), en una transacción: aplica limpia.
  En producción el chat no tenía mensajes, así que el backfill no movió nada.

### `6b6624b` Globo unificado y aviso leído sincronizado
- `PushDispatchService.appBadge()` = avisos sin leer + chat sin leer (sin archivados ni silenciados).
  - Si el llamador no fija `badge`, `sendToUser` lo calcula; con `null` no toca el globo.
  - Chat y avisos ya no mandan su propio conteo. Se quitó el hueco de «badge inconsistente».
- `NotificationsService.syncRead()`: al marcar un aviso o todos como leídos (`PATCH
  /notifications/:id/read`, `POST /notifications/read-all`) se hacen dos cosas:
  - Se emite el socket `notification:read`.
  - Se manda un push silencioso `notification.read`.
- Android (`ArtaPushRenderer`):
  - `notification.read` quita ese aviso de la bandeja, o todos los de procesos si no trae id.
  - Cada conversación usa su propio conteo en `setNumber`, ya no el total. Así los launchers que suman no cuentan de más.
- iOS (`PushManager.handleSilent`): mismo manejo de `notification.read`.
- Nuevo `devices/push-dispatch.service.spec.ts`. Jest API **281/281** y Android
  `testDebugUnitTest` + `assembleDebug` en verde.

### Deploy
- `main` avanzado por fast-forward a `6b6624b`, subido por bundle y desplegado con `update.sh --no-pull`.
- Respaldo de la base: `/root/arta-backups/20260927-0412.sql.gz`. Imágenes anteriores en `arta-web:prev` y `arta-api:prev`.
- Estado tras el deploy:
  - Migración aplicada y los 3 contenedores healthy, con 0 reinicios.
  - `/api/ready` responde 200. arta y auditorio devuelven 307, y el sitio público redirige a `/p/arta`.
- Rollback si hiciera falta: `bash deploy/rollback.sh` (añadir `--dump 20260927-0412.sql.gz` para restaurar también la base).

## A medias

1. **Push apagado en producción**: `FIREBASE_SERVICE_ACCOUNT_JSON` no está en
   `deploy/.env.arta` del servidor ni en el contenedor. Sin eso el chat avisa solo por socket.
   Adam lo añade (no lo edita el agente) y después reinicia el API:
   `docker compose --env-file deploy/.env.arta -f deploy/docker-compose.arta.yml up -d api`.
2. **iOS nunca se ha compilado**: no hay Mac. Hay que lanzar `ios-build.yml` y corregir lo que salga.
3. **La web de chat sigue usando los endpoints de compatibilidad**. Funciona, pero hilos,
   reacciones y fijados solo se ven en móvil y la web no escucha el socket.
   - Referencia a copiar: `NEXARA-app/apps/web/components/WorkspaceChat.tsx` (~2950 líneas).
   - Hace falta `socket.io-client` en `apps/web`.
   - Se dejó fuera de este deploy a propósito por tamaño y riesgo.
4. Android sin probar en dispositivo; iOS y Android sin Firebase configurado.

## Siguiente paso

1. Adam: proyecto Firebase de ARTA, apps `com.artaproducciones.ops` (Android e iOS), clave
   APNs `.p8` y la cuenta de servicio en `.env.arta` del servidor. Pasos en `apps/mobile-native/README.md`.
2. Push de la rama a GitHub y lanzar «iOS · compilar». Corregir hasta verde.
3. Migrar la web de chat a `chat/channels/*` + socket (canales, hilos, reacciones, fijados, escribiendo).
   También la campana web con `notification:new` y `notification:read`.
4. Probar en teléfonos reales:
   - Chat en vivo, responder desde la notificación, leer en uno y que se quite en el otro.
   - Avisos de OC y de formatos.
5. TestFlight para iOS copiando `NEXARA-app/.github/workflows/ios-testflight.yml`.
6. Pendientes de antes:
   - Deploy key de ARTA en GitHub.
   - Quitar `[SEED_DEMO]` de producción con visto bueno.
   - Revisión visual de formatos.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` a un repo de app.
- No mover Traefik de puerto.
- Conceptos de campaña: no romper al tocar Excel.
- Credenciales de Firebase: nunca en git.
  - `google-services.json` y `GoogleService-Info.plist` están en `.gitignore`.
  - La cuenta de servicio solo va por variable de entorno.
