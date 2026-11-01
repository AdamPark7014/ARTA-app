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

## 9. Referencias: arrobar tareas, eventos, OC, formatos, documentos y anticipos

Fecha: 2026-11-01. También aditivo: el cuerpo lleva `@Etiqueta` en **texto plano**, así que una app vieja lee
«revisa @Cotizar luces» sin problema; solo no ve la tarjeta. Las personas siguen con `[@Nombre](user:<id>)`.

- `kind`: `task | event | po | format | doc | advance`.
- Prisma: `ChatMessageRef { messageId, channelId, kind, targetId, label, createdById, createdAt }`.
- `POST /chat/channels/:id/messages` y `PATCH /chat/messages/:id` aceptan `refs?: [{ kind, id }]` (máximo 8). El
  servidor descarta en silencio lo que el autor no puede abrir o ya no existe. Editar sin `refs` conserva las que
  sigan escritas en el cuerpo; con `refs`, las reemplaza. Editar no vuelve a avisar.
- `ChatMessageDto.refs: ChatRefDto[]`:

  ```
  { kind, id,
    label,        // tal como quedó en el cuerpo: sirve para encontrar el chip. No cambia aunque renombren la tarea.
    title,        // el nombre de hoy, para la tarjeta
    resolved,     // false = llegó por socket, solo trae la etiqueta. Pide la tarjeta con /chat/refs/cards.
    canOpen,      // false = sin acceso: enseña la etiqueta y nada más (ni monto, ni estado, ni liga)
    missing,      // ya no existe
    href,         // ruta del panel; las apps la traducen con su enrutador de ligas de siempre
    status, statusLabel,
    tone,         // action (relleno: te toca) | late | info | done
    subtitle, dueAt, progress /* 0-100 */, people: [{ id, fullName }], amount,
    actions }     // lo que ESTA persona puede hacer ahí mismo: deliver | complete | approve
  ```

- `GET /chat/refs/search?q=&kinds=&entity=&channelId=` → `{ results: ChatRefDto[] }`, en grupos por tipo. Sin `q`
  sugiere lo que esa persona trae a la mano. Busca sin acentos. Primero lo del evento de la conversación.
- `POST /chat/refs/cards` `{ refs: [{ kind, id }] }` (hasta 60) → `{ refs: ChatRefDto[] }`, con los permisos de quien pide.
- `GET /chat/refs/backlinks?kind=&id=` → `{ links: [{ messageId, channelId, channelName, author, excerpt, at, href }] }`:
  «Mencionado en». Solo conversaciones que esa persona puede leer; 404 si no puede abrir la cosa.
- `GET /chat/channels/:id/refs` → `{ refs: [ChatRefDto + { messageId, at, count }] }`: panel «Ligados».
- Socket `chat:refs-changed` `{ kind, id }` en el canal, cuando cambia una tarea u OC mencionada ahí: refresca la tarjeta.

**Acciones de la tarjeta** (solo tareas):

- `deliver`: alguien más la pidió, se entrega con nota o evidencia: `POST /tasks/:id/submit { completionNote }`.
- `complete`: no hay quien revise: `PATCH /tasks/:id { status: 'DONE' }`.
- `approve`: `POST /tasks/:id/approve`.

**Crear tarea desde el chat:** `POST /tasks` de siempre (`eventId` si el canal es de un evento) y después un mensaje
`Nueva tarea: @Etiqueta` con su `refs`; desde un mensaje, como respuesta en su hilo. Web: `/tarea Título @persona mañana`
y «Crear tarea» en el menú del mensaje. Sus responsables no reciben aviso doble: ya les llegó `task.assigned`.

**Comentar una tarea:** `POST /tasks/:id/comments { body }` (máx. 2000, con `[@Nombre](user:<id>)`) devuelve la tarea
completa. Queda en `activities` con `action: 'comment'`. Avisa con `task.mention` y `task.comment`.
