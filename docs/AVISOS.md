# Avisos: qué se manda, a quién y cómo llega

Todo aviso nace en `NotificationsService.notify()` (`apps/api/src/notifications/`). De ahí sale a tres lugares con el
mismo título y el mismo cuerpo: la campana (fila en `Notification`), las pantallas abiertas (socket
`notification:new`) y el teléfono o navegador (FCM, `PushDispatchService`). Los mensajes de chat son la excepción: van
por `pushOnly` y no entran a la campana, porque ya viven en su conversación.

## El texto

`notification-text.ts`: quién hizo qué, sobre qué cosa y en qué evento; el monto si hay dinero, y qué se espera de
quien lo lee. El título cabe en una línea del teléfono y el cuerpo en la pantalla bloqueada. Nombres cortos («Mateo R.»)
y fechas en la hora de Puebla («el vie 7 nov»), nunca `2026-11-07`.

## Las categorías

`notification-push-meta.ts` decide canal y prioridad por tipo. La misma tabla, para presentar, en
`apps/web/lib/notification-kinds.ts`, `apps/mobile-native/ios/ArtaApp/UI/Notifications/NoticeKinds.swift` y su par de
Android: si cambia una, cambian todas.

| Canal | Qué entra | Cómo llega |
|---|---|---|
| `approvals` | Lo que espera un visto bueno, una firma o una revisión | Suena; en la web se queda hasta atenderlo |
| `tasks` | Asignada, rechazada, por vencer… (urgente) y lo demás | Suena lo urgente |
| `chat` | Mensajes y menciones | Suena; apilado por conversación, con Responder |
| `finance` | OC y anticipos | Suena lo que hay que mover (por pagar, rechazado) |
| `events` | Cancelado, cambio de fecha, boletera | Suena lo urgente |
| `documents`, `general` | Archivos, carpetas, formatos ya resueltos | **Pasivo**: entra a la bandeja sin sonar |

«Por atender» en las listas es `needsAction()`: lo que espera algo de quien lo lee. Ícono lleno = espera algo;
contorno = para enterarse.

## Lo que cada persona decide

`User.notificationPrefs` (`notification-prefs.ts`), con `GET/PATCH /notifications/preferences`:

- `muted`: categorías que no quiere en el teléfono.
- `quietHours`: de noche solo llega lo urgente (`priority: high` y no chat). Hora de Puebla.

Solo afecta al teléfono y al navegador: **la campana siempre lo guarda todo**. «No molestar» del chat
(`chatDndUntil`) sigue aparte y calla todo el push mientras dure.

## Ráfagas

`notify({ bundle })`: avisos iguales de la misma persona sobre lo mismo, en 10 minutos y sin leer, actualizan una sola
fila (`bundleCount`) y reemplazan la tarjeta del teléfono con la misma etiqueta, sin volver a sonar. Hoy lo usa subir
archivos («Ana R. subió 3 archivos»). Úsalo en todo lo que pueda llegar en serie.

## Tocar un aviso

- **Web**: el service worker abre `url?notif=<id>`; `NotificationBell` lo marca leído al llegar y limpia la dirección.
  Sin liga lleva a `/notifications`.
- **Apps**: abre la pantalla nativa o la vista web (`PanelLink` / su par de Android) y cambia a la entidad del aviso.
- Leer en un dispositivo avisa a los demás (push silencioso y socket `notification:read`).

## El push, campo por campo

`buildData` en `push-dispatch.service.ts`. Android recibe solo `data` y dibuja él (`ArtaPushRenderer`); iOS recibe
además `aps`, con `subtitle` (la entidad), `interruption-level` (`active` o `passive`) y `relevance-score`. No se usa
`time-sensitive`: pediría una capacidad nueva y regenerar los perfiles de firma.

## Correo

**No hay SMTP configurado en producción**: los resúmenes y las invitaciones se quedan en `NotificationOutbox` como
«enviados» sin salir. Si se conecta, va desde el dominio de ARTA (`C:\dev\scripts\ai-os\MARCAS-MAILING.md`).
