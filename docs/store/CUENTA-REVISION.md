# Cuenta de revisión (App Store y Google Play)

Apple (guía 2.1) y Google (Play Console → *Contenido de la app* → *Acceso a la app*) piden credenciales para
revisar una app que está toda detrás de un inicio de sesión. Darles la cuenta de alguien del equipo les
enseñaría eventos, proveedores, montos y conversaciones reales de Arta. Por eso la cuenta de revisión vive en
**su propia organización, aislada**, con datos inventados.

| Qué | Dónde |
| --- | --- |
| Sembrador (idempotente) | `apps/api/prisma/seed-store-reviewer.ts` |
| Sembrar / resembrar en producción | `apps/api/scripts/resembrar-cuenta-revision.ps1` |
| Comprobar que entra | `apps/api/scripts/verificar-cuenta-revision.ps1` |

## La cuenta

| Campo | Valor |
| --- | --- |
| Usuario (correo) | `revision.tiendas@artaproducciones.com` (se cambia con `-Email` / `STORE_REVIEWER_EMAIL`) |
| Contraseña | **No va en el repo ni en este documento.** Primera línea de `C:\dev\secrets\arta-store\cuenta-revision.txt` (fuera de git; generada al azar el 04-10-2026). Es la misma para App Store Connect y Play Console. |
| Nombre que ve en la app | «Demo Revisor» |
| Organización | «ARTA Demo · Revisión de tiendas» — slug `arta-demo-revision-tiendas`, id `org_arta_store_review` |
| Rol | `enlace_gobierno` (Enlace gobierno y pagos) + permiso fino `po.authorize` |
| Entidades | ARTA y EXPLANADA |
| 2FA | Apagado en el usuario **y** en la organización (`require2fa: false`) |

El API separa todo por `organizationId` (`apps/api/src/common/tenant.ts`): eventos, tareas, avisos, chat,
directorio de personas y órdenes de compra solo se ven dentro de la propia organización. La cuenta de revisión
no tiene ninguna membresía en la organización de Arta, así que no ve nada real.

### Por qué ese rol

Tenía que ver Inicio, Chats, Tareas, Avisos, Aprobaciones y Eventos **sin** poder tocar nada que no esté
separado por organización:

| Rol | Por qué no |
| --- | --- |
| `super_admin` | Cruza organizaciones. |
| `dir_general`, `dir_adjunta` | Tienen `studio.edit` (el **sitio público artaproducciones.com** no está separado por organización: el revisor podría cambiarlo) y editan las plantillas de formatos, que son globales. |
| `gerente_arta`, `dir_auditorio` | Igual: `studio.edit` y plantillas globales. |
| `logistica`, `convenios` | Sin `po.authorize`: Aprobaciones no enseñaría órdenes de compra ni anticipos. |
| `solo_carpetas` | No ve eventos ni tareas. |
| **`enlace_gobierno` + `po.authorize`** | Ve todo lo que importa, autoriza OC y anticipos, marca pagos; no toca Studio, plantillas, usuarios ni organizaciones. |

El sembrador comprueba esto contra `roles.ts` en cada corrida y se niega si un cambio futuro le da al rol
`studio.edit`, `users.manage`, rol de dirección o le quita `po.authorize`.

## Qué verá el revisor

Todo es ficticio: personas con correo `@example.com` (Lucía Méndez Arriaga, Mateo Ríos Calderón, Valeria
Ortega Luna), recintos inventados de Puebla, proveedores inventados. Las fechas se calculan contra el día en que
se siembra (hora de Ciudad de México).

| Pantalla | Contenido |
| --- | --- |
| **Inicio** | «Hola, Demo», resumen del día (una tarea vence hoy, aprobaciones pendientes), accesos rápidos y el evento de la próxima semana. |
| **Chats** | `#general` (2 sin leer), `#anuncios` (mensaje fijado), canal del evento «Trío Luna de Plata · Noche de Boleros» con hilo, reacción y fijado (1 sin leer), y un directo con Lucía (1 sin leer). |
| **Tareas** | 4 suyas: una abierta que vence hoy, una en curso, una entregada esperando visto bueno de Lucía y una sin evento. |
| **Avisos** | 6 avisos (4 sin leer): tarea asignada, OC por autorizar, anticipo por aprobar, entrega por revisar, evento creado. |
| **Aprobaciones** | Pendientes: OC de audio de «Sonido Quetzal Pro» por $37,700 (con IVA), anticipo de hospedaje por $8,400 pedido por Valeria y la entrega de Mateo. Historial: una OC autorizada y una tarea aprobada. |
| **Eventos** | 3 actuales: «Noche de Boleros» (ARTA, en 5 días), «Festival Sabores del Valle» (ARTA, en 12 días), «Eco de Volcanes · Gira 2026» (Explanada, en 26 días). Cada uno con su corrida financiera vacía. |
| **Calendario** | Los eventos y dos notas del equipo. |
| **Más** | Módulos web de su rol: eventos, calendario, órdenes de compra, finanzas, anticipos, carpetas, seguridad. |

Las vistas de formatos (Hospedaje, Catering, Rueda de prensa…) salen vacías: el sembrador no genera formatos ni
PDF. Si el revisor crea un evento desde la app, el API sí se los genera, como a cualquier evento.

## Sembrar o resembrar en producción

Desde Windows, en la raíz del repo, con la llave del Hetzner en `~\.ssh\id_ed25519_nexara_hetzner`:

```powershell
pwsh -File apps\api\scripts\resembrar-cuenta-revision.ps1
```

1. Pide la contraseña dos veces (no se ve ni queda en el historial). Mínimo 12 caracteres, sin espacios al
   principio o al final.
2. Copia **tu** `prisma/seed-store-reviewer.ts` al contenedor `arta-api` (scp + `docker cp`) y comprueba que el
   SHA-256 coincide. Hace falta porque la imagen de producción solo trae el archivo si se construyó después de
   que existiera en `main`; así siempre corre la versión del repo. La copia vive en el contenedor hasta el
   siguiente despliegue.
3. Corre el sembrador con `--dry` y enseña qué crearía o actualizaría (y si la contraseña cambia).
4. Pregunta; si escribes `SI`, lo aplica con `--confirm-produccion`. Todo va en una transacción: si algo no
   cuadra (otra organización con ese slug, un correo que ya existe en Arta…), aborta y no queda nada escrito.
5. Corre la verificación.

Opciones: `-SoloDry` (solo simula), `-SinVerificar`, `-Email otro@correo`, `-Servidor/-Puerto/-Llave/-Contenedor`.
Sin preguntas: `-ArchivoContrasena C:\dev\secrets\arta-store\cuenta-revision.txt -Confirmar` (así se sembró en
producción el 04-10-2026: 88 registros creados, verificación OK).

La contraseña viaja por la entrada estándar de SSH, el servidor la lee con `read` y la pasa al contenedor con
`docker exec -e STORE_REVIEWER_PASSWORD` sin valor; el sembrador la borra de su entorno al leerla y nunca la
imprime. Si la contraseña cambia respecto a la guardada, se revocan las sesiones abiertas de la cuenta.

**Resembrar justo antes de mandar cada versión a revisión**: devuelve todo a su estado inicial (estados de OC,
anticipo y tareas, mensajes, avisos), recalcula las fechas a partir de hoy, apaga el 2FA y quita el candado por
intentos. No borra lo que el revisor haya creado (tareas, mensajes, eventos nuevos): eso se queda en la demo.

### En una base local

```powershell
cd apps\api
$env:STORE_REVIEWER_PASSWORD = Read-Host 'Contraseña' -AsSecureString | ConvertFrom-SecureString -AsPlainText
npx ts-node --transpile-only prisma/seed-store-reviewer.ts --dry
npx ts-node --transpile-only prisma/seed-store-reviewer.ts
Remove-Item Env:STORE_REVIEWER_PASSWORD
```

«Local» = `DATABASE_URL` en `localhost`/`127.0.0.1` y sin `NODE_ENV=production`. Cualquier otra base (incluido
el host `db` de docker compose, que es justo el Postgres de producción) exige `--confirm-produccion`.

## Verificar

```powershell
pwsh -File apps\api\scripts\verificar-cuenta-revision.ps1
```

Pide la contraseña y hace lo mismo que las apps: `POST https://arta.artaproducciones.com/api/auth/login` con
`{ email, password }`. Informa si entró, si el API pidió 2FA (`requires2fa` o `requiresTotpEnrollment`), que la
sesión caiga en la organización demo y cuántas cosas verá en Eventos, Tareas, Avisos, Aprobaciones y Chats. Al
final revoca solo la sesión que abrió esta comprobación. Nunca imprime la contraseña, la cookie ni el cuerpo
de las respuestas. `-SoloLogin` se queda en login + 2FA. Sale con 0 si todo pasa.

Ojo: 8 intentos fallidos bloquean la cuenta 5 minutos. Si falla por contraseña, no insistas: resiembra.

## Texto para App Store Connect

*App Store Connect → la app → versión → **Información de la revisión de la app** (App Review Information).*

- **Se requiere iniciar sesión**: sí
- **Nombre de usuario**: `revision.tiendas@artaproducciones.com`
- **Contraseña**: «la contraseña te la doy aparte»
- **Notas** (en inglés, para el revisor):

```text
ARTA is the operations app of Arta Producciones, a live-event production company in Puebla, Mexico (concerts and festivals). The interface is in Spanish.

The demo account above belongs to an isolated demo organization filled with fictional data: every event, person, vendor and amount is invented, and the account cannot see any real company data. It does not use two-factor authentication.

Suggested walkthrough:
1. Inicio (Home): today's summary, tasks due today and pending approvals.
2. Chats: team channels (#general, #anuncios, an event channel with a thread) and a direct message with Lucía. You can send messages, reply in threads and react.
3. Tareas (Tasks): tasks assigned to the demo user in different states. Open one to see its history, or deliver it.
4. Avisos (Notifications): in-app notifications about tasks, purchase orders and cash advances.
5. Inicio > Aprobaciones (Approvals): approve or reject a purchase order, a cash advance and a delivered task.
6. Inicio > "Eventos de los próximos 7 días", or Más (More) > Eventos actuales: three upcoming events with their tasks, purchase orders and chat.

Push notifications are optional; the app works normally if you decline them. Accounts are created by the organization's administrators (there is no public sign-up). Account deletion: https://artaproducciones.com/legal/eliminar-cuenta (also linked from the app).
```

## Texto para Play Console

*Play Console → la app → **Contenido de la app** → **Acceso a la app** → «Todas o algunas de las funciones de la
app están restringidas» → **Agregar instrucciones**.*

- **Nombre**: `Cuenta de demostración ARTA`
- **Nombre de usuario, correo electrónico o número de teléfono**: `revision.tiendas@artaproducciones.com`
- **Contraseña**: «la contraseña te la doy aparte»
- **¿Se necesita información adicional para acceder a la app?**:

```text
Sign in with the e-mail and password above. The account belongs to an isolated demo organization with fictional data (events, people, vendors and amounts are invented) and does not use two-factor authentication. The interface is in Spanish: Inicio (Home), Chats, Tareas (Tasks), Avisos (Notifications) and Más (More). Purchase orders, cash advances and delivered tasks waiting for approval are under Inicio > Aprobaciones. Push notifications are optional.
```

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Verificación: `login` 401 | Contraseña distinta a la sembrada, o 8 intentos fallidos (candado de 5 min). | Resembrar con la contraseña que está en las tiendas. |
| Verificación: `2FA` FALLA | El revisor (o alguien) activó 2FA en *Más → Seguridad*. | Resembrar: apaga el TOTP del usuario y el `require2fa` de la demo. |
| El revisor cambió la contraseña | La cuenta deja de coincidir con la de las tiendas. | Resembrar con la contraseña de las tiendas. |
| «Abortado: … pertenece a org_arta_internal» | El correo del revisor ya existe en Arta. | Usar otro correo (`-Email`); el sembrador no mueve personas entre organizaciones. |
| «AVISO: N evento(s) … sin organización» | Hay eventos viejos sin `organizationId`; sus avisos se mandan a todas las organizaciones. | Asignarles `org_arta_internal` antes de entregar la cuenta (el sembrador no los toca). |
| Pantallas con fechas pasadas | Se sembró hace días. | Resembrar justo antes de mandar a revisión. |
