# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-27
- **Rama:** feature/mobile-chat-push
- **Producción:** `6b6624b` (deploy de este turno en curso; ver «Deploy»)

## Hecho en este turno

Pedido de Adam: «continúa, falta paridad total: documentos, fotos, todo con compatibilidad
nativa total y notificaciones push de todo».

### API (`f6945ad`, `45164cd`)
- Adjuntos de chat: fotos (HEIC incluido), video, notas de voz, Office, Pages/Numbers/Keynote,
  zip, csv y txt, hasta 100 MB. El tipo lo decide la tabla de `chat-attachments.ts` más la
  firma del contenido. Nada ejecutable entra.
- Los archivos van a `/uploads/chat/`, fuera del candado de originales de dirección (docx/xlsx),
  y los nombres llegan en UTF-8 («Cotización.pdf»).
- Push de procesos que faltaban: evento cerrado, reabierto, cancelado o reprogramado;
  anticipos de finanzas; comprobantes de OC.
- `chat:channel-activity` ahora trae `senderName`, `channelName` y `notify`. `notify` es true
  solo para quien no silenció, no es el autor ni fue mencionado, y no es respuesta en hilo.
  El navegador lo usa para el aviso de escritorio.

### Android (`cd15a24`) e iOS (`17654c1`)
- Cámara (foto y video), galería múltiple, documentos y notas de voz AAC `.m4a`.
- Vista previa y reproducción nativa (Media3 / AVPlayer), compartir y guardar, y barra de avance de subida.
- Android: `testDebugUnitTest`, `assembleDebug` y `assembleRelease` en verde.
- iOS: **sin compilar** (no hay Mac aquí).

### Web: chat en canales + socket (este commit)
- `apps/web/app/(app)/chat/page.tsx` reescrito sobre `chat/channels/*`, el mismo API que las apps. Tiene:
  - Canales, eventos y directos; hilos en panel lateral; reacciones; fijados.
  - Editar (1 h) y borrar; «escribiendo…»; «Visto / Visto por N»; silenciar.
  - Búsqueda de mensajes; nuevo directo y nuevo canal; paginación hacia atrás.
  - Enlaces `?channel=&msg=` (avisos), `?with=dm:<id>` y `?event=<id>`.
- Adjuntos (`components/chat/`):
  - Se mandan por botón, arrastrar o pegar; varios a la vez, con cola y barra de avance (XHR).
  - Fotos grandes o HEIC se pasan a JPEG de 2560 px.
  - Nota de voz: AAC `.m4a` si el navegador lo graba, si no WAV 16 kHz. Así se oye nativa en iPhone y Android (WebM/Opus no suena en iOS).
  - Se ven en línea imagen, video, audio y documento. Lo que el navegador no puede mostrar queda como descarga.
- `lib/realtime.ts`: un socket por pestaña a `/api/socket.io` con cookie. Repite `chat:join` al reconectar y avisa presencia.
- Campana en vivo (`notification:new` / `notification:read`) y aviso de escritorio con la pestaña oculta. Incluye mensajes de chat con `notify`. El permiso se pide al abrir la campana.
- Globo del menú en vivo por `chat:unread`.
- `next.config.js`: reescritura `/api/socket.io` → `socket.io/` solo para desarrollo. En producción Traefik va directo al API.
- Dependencia nueva: `socket.io-client` en `apps/web`.

### Verificación
- Jest API 298/298. `tsc` web y API limpios. `next build` en verde.
- Prueba en navegador contra el API local, con JP simulado desde `.ai/scratch/web-peer.mjs`. Funcionó en vivo:
  - «escribiendo…», texto, nota de voz WAV, PDF con acento, 👍, hilo y «Visto por 1».
  - Arrastrar PNG y CSV se envía; `.exe` se rechaza.
  - Visor de fotos, responder en hilo, vista de teléfono y directo nuevo en la lista.
- Scripts (leen las contraseñas de variables de entorno, nunca del repo):
  - `live-smoke.mjs`, `web-peer.mjs`, `web-dm.mjs`, `web-activity.mjs`.
  - `web-session.mjs`: login local y cookies para el navegador.

## Deploy

Pendiente de anotar el resultado (se actualiza al cerrar el turno).

## A medias

1. **Push apagado en producción**: `FIREBASE_SERVICE_ACCOUNT_JSON` no está en
   `deploy/.env.arta` del servidor. Adam lo añade (no el agente) y reinicia el API:
   `docker compose --env-file deploy/.env.arta -f deploy/docker-compose.arta.yml up -d api`.
2. **iOS nunca se ha compilado**: lanzar `ios-build.yml` (workflow_dispatch o PR) y corregir.
3. Web: los avisos de escritorio funcionan con la pestaña abierta. Para que lleguen con el navegador cerrado faltaría Web Push (VAPID y service worker); no está hecho.
4. Android y iOS sin probar en dispositivo real.

## Siguiente paso

1. Adam: Firebase de ARTA (Android e iOS, clave APNs `.p8`) y la cuenta de servicio en `.env.arta`. Pasos en `apps/mobile-native/README.md`.
2. Push de la rama a GitHub y correr «iOS · compilar» hasta verde.
3. Probar en teléfonos:
   - Adjuntos de cada tipo en ambos sentidos (web ↔ Android ↔ iPhone).
   - Responder desde la notificación.
   - Leer en un dispositivo y que el aviso se quite en el otro.
4. Opcional: Web Push con service worker para avisos con el navegador cerrado.
5. Pendientes de antes: deploy key de ARTA en GitHub, quitar `[SEED_DEMO]` con visto bueno, revisión visual de formatos.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` a un repo de app.
- No mover Traefik de puerto.
- Conceptos de campaña: no romper al tocar Excel.
- Credenciales de Firebase: nunca en git.
  - `google-services.json` y `GoogleService-Info.plist` están en `.gitignore`.
  - La cuenta de servicio solo va por variable de entorno.
