# ARTA y Auditorio: separación por entidad (11-10-2026)

Pedido de Adam: ARTA (Arta Producciones) y Auditorio (Auditorio Arema Explanada, `EXPLANADA`) son negocios
distintos dentro de la misma organización (`org_arta_internal`). Nada de Auditorio se ve en ARTA y viceversa,
salvo para quien tiene los dos ("híbridos").

## Quién ve qué

| Persona | Rol | Entidades | Nota |
|---|---|---|---|
| Arturo, José Luis (Chacho) | `dir_general` | ARTA + EXPLANADA | Todo, incluida la gestión de usuarios |
| Monse, Kika | `dir_adjunta` | ARTA + EXPLANADA | Híbridas |
| Leida, Marisol | `dir_adjunta` | ARTA | |
| Rodrigo, Williams (Will), Juan Pablo (JP) | `dir_adjunta` | EXPLANADA | Todo lo de Auditorio |

`dir_adjunta` opera todo en sus entidades. Con usuarios solo puede **dar de alta** gente nueva
(permiso `users.create`), con entidades dentro de las suyas y un rol que no sea de dirección general
ni de plataforma. Editar, cambiar de rol, desactivar o reactivar a alguien que ya existe es `users.manage`
(solo dirección general).

## Contrato del API

- Toda fila de negocio tiene entidad: `Event.entity`, `CalendarNote.entity`, `SharedFolder.entity` (ya
  existían) y ahora también `ChatChannel.entity` (null = directos y grupos de directos, que son personales),
  `TaskAssignment.entity` y `PaymentProof.entity` (anticipos). Con evento, la entidad se copia del evento.
- **Lecturas**: los listados aceptan `?entity=ARTA|EXPLANADA`. Con el parámetro devuelven solo esa entidad
  (y en el chat, también los directos). Sin el parámetro devuelven todas las entidades del usuario, para
  que las apps 1.0.0 sigan funcionando. Pedir una entidad a la que no se tiene acceso da 403.
  - `GET /events`, `/calendar/notes`, `/analytics/*`, `/folders` (ya lo tenían)
  - `GET /tasks/mine`, `/tasks/requested`, `/tasks/workload`
  - `GET /finance/advances/pending` y el resto de listados de anticipos
  - `GET /chat/channels`, `/chat/unread`, `/chat/search`
  - `GET /notifications` y su contador de no leídos
- **Escrituras**: sin evento, `POST /tasks`, la solicitud de anticipo y `POST /chat/channels` aceptan
  `entity`. Si no viene, se usa la única entidad del usuario o, para un híbrido, ARTA.
- Los DTO de tareas, anticipos, canales y avisos llevan `entity` (`"ARTA" | "EXPLANADA" | null`).
- Cada entidad tiene sus canales `#general` y `#anuncios`; los de Auditorio llevan los slugs
  `general-auditorio` y `anuncios-auditorio`. Los canales de evento heredan la entidad del evento.
- A una tarea solo se puede asignar gente con acceso a su entidad.

## Apps móviles (iOS y Android)

- **Entidad activa**: se guarda por usuario. Al entrar es la última usada o, si no hay, la primera de
  `user.entities` (ARTA si tiene las dos).
- **Híbrido**: `dir_general` o `super_admin`, o quien tiene dos entidades. Solo los híbridos pueden cambiar.
- **Cambio rápido**:
  - Doble toque en la pestaña Inicio (la casita) alterna ARTA ⇄ Auditorio, con háptica y un aviso breve
    («Ahora en Auditorio»).
  - También en Más, con un selector «Arta | Auditorio», y en el chip de entidad del encabezado de Inicio.
- **Color**: ARTA usa el acento dorado `#C9A962` y Auditorio el plateado `#C7CCD4` (oscuro `#9AA1AC`).
  El resto del tema oscuro no cambia.
- **Marca**: «Arta Producciones» o «Auditorio Explanada» en Inicio y en los encabezados.
- Toda lectura de listados manda `?entity=<activa>` y toda creación sin evento manda `entity`. El globo de
  chat y el de avisos cuentan solo la entidad activa.

## Web

- El switch Arta/Auditorio del menú ya existía (dominios `arta.*` / `auditorio.*`).
- El acento de Auditorio pasa de azul (`#7b9fd4`) a plateado (`#c7ccd4`, oscuro `#9aa1ac`).
