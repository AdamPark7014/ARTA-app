# Chat v2 — contrato compartido (API · web · Android · iOS)

Fecha: 2026-10-04. Todo es **aditivo**: lo que ya existe sigue igual y los clientes viejos
(apps ya instaladas) no se rompen. Los campos nuevos pueden faltar en respuestas viejas:
los clientes los tratan como opcionales.

## 1. Responder citando (quote reply)

- Prisma: `ChatMessage.replyToId String?` + relación `replyTo ChatMessage? @relation("ChatReplyTo", onDelete: SetNull)`.
- `POST /chat/channels/:id/messages` acepta `replyToId?: string` (debe ser del mismo canal; si no, 400).
- `ChatMessageDto.replyTo`: `{ id, authorId, authorName, excerpt, kind, attachmentName, deleted } | null`.
  `excerpt` = cuerpo a ≤140 caracteres con las menciones ya como `@Nombre` (texto plano).

## 2. Mensajes guardados

- Prisma: `ChatSavedMessage { id, userId, messageId, createdAt, @@unique([userId, messageId]) }` (cascada por usuario y mensaje).
- `POST /chat/messages/:id/save` → alterna → `{ saved: boolean }`.
- `GET /chat/saved?limit=50&before=<savedAt ISO>` → `{ items: [{ savedAt, message: ChatMessageDto, channel: { id, name, kind, isGroupDm } }] }`.
- `ChatMessageDto.saved: boolean` (para quien pide).

## 3. Mensajes directos de grupo

- Prisma: `ChatChannel.isGroupDm Boolean @default(false)`. Un grupo es `kind = PRIVATE`, `isGroupDm = true`,
  `dmKey = "g:" + ids ordenados (incluye a quien crea) unidos por ":"` (así no se duplican).
- `POST /chat/group-dm { userIds: string[] }` (de 2 a 8 personas además de quien crea) → `ChatChannelDto`
  (si ya existe con esas mismas personas, devuelve ese).
- `name` del grupo = nombres de pila de las personas, separados por coma (se puede renombrar con `PATCH /chat/channels/:id`).
- `ChatChannelDto.isGroupDm: boolean`. Los clientes lo muestran en la sección «Mensajes directos» con avatares apilados.

## 4. Presencia (en línea)

- El gateway lleva en memoria los sockets por persona.
- `GET /chat/presence` → `{ online: string[] }` (ids de la misma organización conectados ahora).
- Servidor emite `chat:presence` `{ userId, online: boolean }` al cuarto `org:<id>` al conectar el primer socket
  y al cerrar el último (con 20 s de gracia antes de marcar desconectado).
- Clientes: punto verde en avatar de directos y en la lista de miembros.

## 5. Vista previa de enlaces

- `GET /chat/link-preview?url=<url>` → `{ url, title, description, image, siteName } | null`.
- Servidor: solo `http/https`, resuelve DNS y **rechaza IPs privadas/loopback/link-local** (SSRF), sigue ≤3 redirecciones
  revalidando cada salto, 4 s de tiempo, ≤512 KB, solo `text/html`; lee `og:*`/`twitter:*`/`<title>`.
  Caché en memoria 24 h (≤500 entradas). `image` se devuelve como URL absoluta.
- Clientes: tarjeta bajo el mensaje para el **primer** enlace del cuerpo; caché local por URL.

## 6. No molestar

- Prisma: `User.chatDndUntil DateTime?`.
- `GET /chat/prefs` → `{ dndUntil: string | null }`; `PATCH /chat/prefs { dndUntil: string | null }`.
- Mientras `dndUntil > ahora` **no sale push** a esa persona (de chat ni de procesos); el aviso en la app sí se guarda.
  Lo aplica el servicio que manda push (`PushService` o equivalente).

## 7. Formato de texto (igual en los tres clientes)

Subconjunto tipo Slack, se renderiza en el cliente; el servidor guarda el texto tal cual:

| Escribe | Se ve |
|---|---|
| `*negrita*` | **negrita** |
| `_cursiva_` | *cursiva* |
| `~tachado~` | ~~tachado~~ |
| `` `código` `` | código en línea (monoespaciada, fondo) |
| ```` ```bloque``` ```` | bloque de código (monoespaciada, fondo, respeta saltos) |
| `> cita` al inicio de línea | barra lateral dorada |
| `- elemento` / `1. elemento` | lista |
| URL suelta | enlace tocable |
| `[@Nombre](user:<id>)` | mención como chip dorado (nunca el token crudo) |
| `@canal` | mención de canal resaltada |

Los marcadores no se aplican dentro de código. Copiar texto copia la versión legible (menciones como `@Nombre`).

## 8. Reglas comunes de UI

- Reacciones rápidas (8, mismo orden): 👍 ❤️ 😂 🎉 👀 🔥 ✅ 🙏 + selector completo de emojis (sin CDN; lista local por categorías).
- Límite de mensaje: 8000 caracteres en todos los clientes.
- Borradores por canal persistidos (web `localStorage`, Android `SharedPreferences`/DataStore, iOS `UserDefaults`).
- Separador «Mensajes nuevos» usando `lastReadAt` del miembro al abrir el canal, y botón «↓ N nuevos».
- «Visto» en directos; «Visto por N» en grupos (no exigir que lean todos).
- Estados: cargando (esqueleto), vacío, error con «Reintentar». Hápticos en enviar, reaccionar y pulsación larga (móvil).
- Deslizar para responder citando (móvil). Visor de imágenes con zoom, desplazamiento, galería y deslizar para cerrar.
- Mensaje eliminado se muestra como «Mensaje eliminado» en gris (no desaparece si tiene hilo).
