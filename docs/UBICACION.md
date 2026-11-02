# Ubicación del equipo en las apps

Adam, 01-11-2026: «incluir geolocalización de todos excepto Chacho y Arturo de 10 am a 6 pm en las apps móviles».

- **A quién:** todos menos `dir_general` (Chacho y Arturo) y `super_admin`. Reglas `isLocationTracked` y `canSeeTeamLocation`
  en `packages/rbac/src/roles.ts`, con copia en el API, `Rbac.swift` y `Rbac.kt`.
- **Cuándo:** de 10:00 a 17:59, hora de Puebla (`America/Mexico_City`), los siete días. Un punto cada 30 minutos.
- **Quién lo ve:** solo Chacho, Arturo y `super_admin`, en `/ubicacion`. Abrir el recorrido de alguien queda en auditoría.
- **Lo guarda el servidor:** coordenadas, precisión y hora. Se borra solo a los 90 días (`ubicacion-latido.service.ts`).

El servidor manda: fuera del horario no guarda nada aunque el teléfono lo mande, y a un exento le responde 403.

## Lo que hace cada sistema

| | Android | iOS |
|---|---|---|
| Permiso | «Mientras se usa» + notificación fija | «Mientras se usa» |
| App cerrada | Sigue midiendo: servicio de primer plano, alarma cada 30 min y push de datos | **No mide.** Recordatorio visible, uno por hora como máximo |
| App abierta | Mide | Mide |

**iOS no lleva «Siempre» ni `location` en `UIBackgroundModes`.** Apple ya rechazó eso en NEXARA por 2.5.4 (seguir a empleados no es un
uso válido del modo de fondo, 07-10-2026) y ARTA está en la tienda pública (rechazo 3.2, resuelto el 19-10). Medir con la app cerrada en iPhone
pide distribuirla por Apple Business Manager: es decisión de Adam, no de código.

**Android no lleva `ACCESS_BACKGROUND_LOCATION`** (Play pide declaración y video): el servicio de primer plano arranca con la app visible.
Si Android lo mata, vuelve al abrir la app.

## Contrato

Todo con la sesión normal. Las apps solo miden con consentimiento, dentro del horario y si `tracked` es verdadero.

- `GET /ubicacion/estado` → `{ tracked, consentAt, inWindow, startHour, endHour, timeZone, intervalMinutes, serverTime }`
- `POST /ubicacion/consentimiento` → `{ consentAt }`. 403 si la persona es exenta.
- `POST /ubicacion/estado` `{ state: 'ok' | 'sin_permiso' | 'apagada' }`. Para que dirección vea el motivo de un hueco.
- `POST /ubicacion/puntos` `{ platform: 'ios' | 'android', points: [{ lat, lng, accuracyM?, capturedAt }] }` → `{ saved, ignored }`. Máximo 50.
  `capturedAt` es la hora del teléfono al medir. Los puntos sin conexión se guardan y se reenvían; el servidor tira lo que tenga más de un día, lo que caiga
  fuera del horario y lo que quede a menos de 20 minutos de otro punto.
- `GET /ubicacion/equipo?date=YYYY-MM-DD` → personas con `status`, `count` y `last`. Solo dirección.
- `GET /ubicacion/persona/:id?date=YYYY-MM-DD` → `{ person, points }`. Solo dirección.

Push: `type: 'location.ping'`, `silent: '1'` en Android (medir ya, sin avisar) y `type: 'location.reminder'` visible en iOS.

`status`: `al_dia`, `atrasada` (más de 45 min), `sin_permiso`, `apagada`, `sin_aceptar`, `sin_datos`, `fuera_de_horario`.

## Tiendas

Al agregar esto hay que declararlo:

- **App Store Connect → Privacidad de la app:** Ubicación precisa, ligada a la identidad, función de la app, no rastreo.
- **Play Console → Seguridad de los datos:** Ubicación precisa, recopilada, no compartida. **Permisos de servicios en primer plano:** `location`.
- **Aviso de privacidad:** `apps/web/app/legal/privacidad/page.tsx`.
