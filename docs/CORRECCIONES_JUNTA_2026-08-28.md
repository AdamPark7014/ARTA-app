# Correcciones del dashboard — junta del 28 de agosto de 2026

Origen: `Correciones Dashboard ARTA.pdf` (Arta Producciones). Este documento
registra qué quedó implementado, con qué criterio y qué falta hacer a mano.

---

## 1. Barra lateral: fuera el desglose de checks

> «En la barra lateral principal quitar el desglose de cada uno de los checks
> —Plantillas, carpetas generales, transportación, artes, pendones, etc.— y
> agregar Crear Evento, Eventos actuales, Eventos Pasados y Tareas. El resto de
> herramientas y formatos deberá encontrarse dentro de cada evento.»

El menú queda en cuatro grupos:

| Grupo    | Entradas                                                              |
| -------- | --------------------------------------------------------------------- |
| Inicio   | Dashboard                                                             |
| Eventos  | Crear evento · Eventos actuales · Eventos pasados · Tareas            |
| Marca    | Studio web · Ver sitio Arta                                           |
| Admin    | Usuarios · Configuración · Organizaciones · Seguridad · Audit · Webhooks · Digests |

**Las herramientas transversales no se borraron.** En `lib/access-matrix.ts`
quedan marcadas `hidden: true` bajo el grupo *Vistas de portafolio*: siguen
existiendo como ruta y aparecen en el menú al escribir en el buscador del
sidebar (`Plantillas`, `Carpetas generales`, `Finanzas`, `Órdenes de compra`,
`Campañas`, `Boletera`, `Anticipos`, `Hospitality`, `Transportación`,
`Catering`, `Rueda de prensa`, `Artes`, `Pendones`, `Risk`, `Mantenimiento`,
`Vendor PIN`). Borrarlas del router hubiera dejado 16 pantallas huérfanas y
habría roto los enlaces que ya circulan por WhatsApp y correo.

**Excepción a la regla:** un rol sin operación de eventos en la entidad activa
(`dir_auditorio` dentro de Arta) se quedaba con el menú vacío. Para ese caso
`visibleNavItems()` devuelve *Carpetas generales* al menú — es su única
herramienta ahí.

- «Eventos actuales» = `/events?scope=active`; «Eventos pasados» =
  `/events?scope=past`. **Pasado** significa cerrado/cancelado **o** con fecha
  de show anterior a hoy. La página también trae un conmutador
  Actuales / Pasados / Todos por si alguien llega por enlace directo.
- Dentro del evento (hub `/events/[id]`) siguen las pestañas Resumen,
  Checklists, Órdenes de compra, Corrida, Campaña, Boletera, Tareas, Convenios
  y patrocinios, y Excel/PDF. Hospitality, transportación, catering, prensa,
  artes y pendones son instancias de checklist: viven en la pestaña Checklists
  del propio evento.

## 2. Campaña: Excel y PDF embebidos

> «Que la sección de Campaña pueda expandirse para visualizar directamente los
> archivos relacionados, principalmente el Excel y/o PDF de la campaña, sin
> necesidad de descargarlos… y que puedan subirse, actualizarse y consultarse
> desde el mismo evento.»

- `EventFile` gana la columna `module`. Los adjuntos de campaña se etiquetan
  `module = 'campaign'` al subirlos (`POST /uploads` acepta `module`).
- La pestaña **Campaña** del evento tiene el bloque *Archivos de la campaña*:
  subir, **Actualizar** (sube la versión nueva y retira la anterior), eliminar
  y **Expandir** para leer el archivo en línea. El visor ya existente
  (`FileViewer`) pinta el PDF en un iframe y el Excel como tabla con `xlsx`.
- La vista de portafolio `/campaigns` expande cada fila con los mismos
  archivos, que es la pantalla que se mostró en la junta.
- `GET /campaigns` y `GET /campaigns/event/:id` viajan con `files`.

## 3. Órdenes de compra: ventana configurable

> «Que el sistema permita configurar los días y horarios disponibles para
> solicitar órdenes de compra. Actualmente el periodo disponible es de lunes y
> jueves de 10:00 a 14:00 horas.»

- Configuración por organización en `Organization.settingsJson.poWindow`
  (sin tabla nueva). Default: lunes y jueves, 10:00–14:00,
  `America/Mexico_City` — exactamente la política vigente.
- Pantalla **Admin → Configuración** (`/settings`): activar/desactivar la
  restricción, elegir días, horario, zona horaria y una nota para el equipo.
  Solo con permiso `users.manage`.
- `GET /purchase-orders/window` devuelve el estado (`open`, horario en
  palabras, cuándo vuelve a abrir). El panel del evento y `/purchase-orders`
  muestran el aviso **antes** de que alguien capture.
- `POST /purchase-orders` rechaza con 403 fuera de ventana, y el mensaje dice
  el horario y cuándo reabre. **Dirección (`dir_general`, `super_admin`) puede
  capturar fuera de horario** — es quien configura la regla y necesita la
  válvula de escape para urgencias.
- Lógica pura en `src/purchase-orders/po-window.ts`, con 14 pruebas en
  `po-window.spec.ts` (incluye husos horarios y configuraciones corruptas).

## 4. Tareas entre todo el equipo + aviso en plataforma

> «Que la sección de Tareas permita asignar tareas entre todos los integrantes
> de la organización… La persona a quien se le asigne una tarea deberá recibir
> una notificación dentro de la plataforma.»

- `GET /users/directory` ya no filtra por entidad: devuelve a todo el personal
  activo del tenant. Alguien de Arta puede pedirle apoyo a alguien que solo
  opera el Auditorio.
- `TaskAssignment` cambia: `eventId` pasa a **opcional** (hay tareas de apoyo
  que no cuelgan de ningún show), y se agregan `organizationId`, `createdById`
  (quién pidió el apoyo) y `detail`.
- Modelo **`Notification`** nuevo + `NotificationsService`. Se avisa al
  asignarse una tarea, al reasignarla, y al solicitante cuando el otro la marca
  hecha o bloqueada. Un aviso que falla nunca tumba la operación que lo generó.
- **Campana en la barra superior** (`NotificationBell`): contador de no leídos
  con sondeo cada 45 s, panel con los últimos 20 avisos, marcar leído al abrir
  y «marcar todo leído». Cada aviso lleva a su evento o a `/tasks`.
- `/tasks` deja de ser solo «mis tareas»: ahora tiene alta de tareas
  (persona + evento opcional + módulo + vencimiento + detalle) y tres vistas —
  **Asignadas a mí**, **Que pedí a otros** y **Equipo**. Se reasigna desde la
  tabla, tanto aquí como dentro del evento.

## 5. Altas y baja de usuarios

> «AGREGAR USUARIO: MONSE, SOL Y KIKA.»

Definidas en `apps/api/prisma/new-team-members.ts` y enganchadas al roster de
`prisma/seed.ts`:

| Persona                    | Correo                       | Rol         | Alcance |
| -------------------------- | ---------------------------- | ----------- | ------- |
| Monse                      | `monse@artaproducciones.com` | `logistica` | Eventos, checklists, campaña, boletera y carpetas en ambas entidades |
| **Marisol Pérez Vásquez**  | `marisol@artaproducciones.com` | `convenios` | Carpetas, patrocinios y checklists — **mismo perfil que Leida Osorio** |
| Kika                       | `kika@artaproducciones.com`  | `logistica` | Igual que Monse |

**«SOL» es Marisol Pérez Vásquez** (confirmado por Adam el 28-08-2026), con el
mismo perfil que Leida. De Monse y Kika la junta solo dio el nombre de pila:
quedan en `logistica`, que es el mínimo con el que pueden trabajar. Apellidos,
correo definitivo y rol se ajustan desde **Panel → Usuarios**.

### Baja: Melissa Astudillo

Sale del roster del seeder (`prisma/seed.ts`) y su cuenta se borra de la base
de datos de producción. El copy que la nombraba por su nombre —mensajes de la
API, banners del panel, `docs/PRODUCT.md` y la guía de uso— pasa a nombrar el
**rol** («gerencia de Arta»), que es como debió estar desde el principio.

Su historial **no se pierde**: todas las llaves foráneas hacia `User` son
opcionales (`ON DELETE SET NULL`) o en cascada sobre datos de sesión. Los
checklists que firmó, las OC que autorizó y el audit log conservan la fila con
el `userId` en nulo, y la firma digital guarda el nombre dentro del JSON.

### Cómo llegan las altas a producción

`docker/api-entrypoint.sh` corre `prisma migrate deploy` **y el seed** en cada
arranque del contenedor del API. Es decir: **el seed sí corre en producción en
cada despliegue**, y reescribe el `passwordHash` de todo el roster con los
valores de `deploy/.env.arta`. Por eso las tres altas nuevas necesitan su
propia variable en `deploy/docker-compose.arta.yml` y en `.env.arta`:

```
SEED_PASS_MONSE=…
SEED_PASS_MARISOL=…
SEED_PASS_KIKA=…
```

Sin ellas caerían en `SEED_PASSWORD`, que es compartida. Existe además
`npm run users:provision` (`apps/api/scripts/provision-new-users.ts`) para dar
de alta sin redesplegar: **solo inserta lo que falta** y no toca a nadie que ya
exista.

## 6. Dos defectos que salieron al desplegar

Ninguno venía en el PDF; aparecieron al poner las altas en producción.

**El seed creaba usuarios sin `organizationId`.** Los endpoints de usuarios y de
directorio filtran por tenant, así que Monse, Marisol y Kika quedaban
invisibles: no salían en *Panel → Usuarios* ni se les podía asignar una tarea,
aunque sí podían iniciar sesión. El seed ahora hace `upsert` de la organización
por defecto, adopta al usuario que no tenga tenant —sin mover a nadie que ya
pertenezca a otra— y le crea su `OrgMembership`. En producción se hizo además el
backfill: los 9 usuarios quedaron en `org_arta_internal` con membresía.

**El seed pisaba las contraseñas en cada despliegue.** `api-entrypoint.sh` lo
ejecuta en cada arranque del contenedor y el `update` del upsert reescribía
`passwordHash`: si alguien cambiaba su contraseña desde *Panel → Seguridad*, el
siguiente despliegue se la revertía. Ese campo salió del `update`. La contraseña
de `.env.arta` es ahora solo la **inicial**; para reponer una se usa
*Panel → Usuarios*.

## 7. Auditoría de la UI: lo que había escondido de más

Con el panel ya desplegado se revisó pantalla por pantalla contra el PDF. El
menú se había podado demasiado y tres roles se quedaron sin herramienta:

**Órdenes de compra vuelve al menú.** El PDF no la puso en la lista de lo que
se muda dentro del evento —«checklists, campañas, boletera, corrida financiera,
hospitality, rueda de prensa, convenios»—; al contrario, le dedica una sección
propia y enseña su pantalla. Estaba oculta por error.

**Carpetas generales vuelve al menú para quien vive de ellas.** `ROLE_SCOPE` lo
dice literalmente: `convenios` es «Carpetas · patrocinios · checklists» y
`enlace_gobierno` es «Carpetas · pagos · marcar OC pagado». Con el menú podado,
Leida, Marisol y Juan Pablo veían cuatro entradas de eventos y nada más. Las
carpetas generales **no son un check del evento**: son el repositorio que no
cuelga de ningún show, así que no tienen dónde vivir «dentro del evento».
`visibleNavItems()` las devuelve al grupo *Documentos* para esos roles y para
`dir_auditorio` dentro de Arta.

**Botón «Más herramientas».** Las 14 vistas que siguen fuera del menú se abren
en un clic desde el sidebar, en vez de exigir adivinar un término en el
buscador. El menú sigue sin desglosar cada check, que es lo que pedía la junta.

**Arreglo visual.** En *Configuración*, el checkbox de la ventana de OC salía
centrado sobre su etiqueta: `.form label` (grid) le ganaba en especificidad a
`.checkbox-row` (flex).

Dos specs nuevos fijan el comportamiento: un rol de convenios conserva Carpetas
en el menú, y «Más herramientas» abre las vistas ocultas.

### Observación que no se tocó

El item de menú de *Órdenes de compra* se muestra a cualquiera con
`checklist.edit`, que es casi todo el mundo —incluido `convenios`—. Es
comportamiento anterior a este trabajo (la lista de permisos del item ya era
`['checklist.edit', 'po.authorize', 'po.mark_paid', 'everything']`). Afinar qué
rol ve la torre de control de compras es una decisión de Adam, no un arreglo
que corresponda meter aquí.

## Despliegue del 28-08-2026

Servidor Hetzner `5.78.215.109`, stack `arta` (`arta-db`, `arta-api`,
`arta-web`) detrás del Traefik compartido.

- **Respaldo previo**: volcado completo de la base y copia de `.env.arta` en
  `/root/arta-backups/`.
- **Migración** `20260828120000_tasks_org_notifications_file_module` aplicada
  por el entrypoint. Verificado en la base: tabla `Notification` creada,
  `EventFile.module`, `TaskAssignment.organizationId/createdById/detail` y
  `TaskAssignment.eventId` ya nullable.
- **Roster final**: 9 usuarios activos. Melissa borrada; Monse, Marisol y Kika
  creadas con su propia contraseña (`SEED_PASS_*` en `.env.arta`, que se
  agregaron al compose para que no cayeran en la `SEED_PASSWORD` compartida).
- Se agregó `WEB_ORIGIN` a `.env.arta`, que faltaba en producción.
- **Salud**: `artaproducciones.com` 307 → panel, `arta…/login` 200,
  `arta…/api/health` 200, `auditorio…/login` 200.

### Cómo se subió el código

**El servidor no tiene credenciales de GitHub** (repo privado) y su `.git`
estaba vacío: los archivos se habían subido a mano en algún momento, así que
`deploy/update.sh` nunca pudo hacer su `git pull`. Se reconstruyó la historia
desde un `git bundle` del repo local y se desplegó con `--no-pull`.

**Queda pendiente** dar acceso de lectura al servidor —deploy key SSH o token—
para que `update.sh` funcione como fue diseñado. Mientras tanto, el
procedimiento es:

```bash
# en local
git bundle create arta.bundle main
scp -P 2222 arta.bundle root@5.78.215.109:/root/arta.bundle
# en el servidor
cd /var/www/arta-app
git fetch /root/arta.bundle 'main:refs/remotes/origin/main'
git reset origin/main && git checkout -- .
bash deploy/update.sh --no-pull
```

### Observación: los 5 eventos demo son invisibles

`Event.organizationId` está en `NULL` en los 5 eventos `[SEED_DEMO]` (el evento
real sí tiene tenant). Como el listado filtra por organización, esos 5 no se ven
en el panel — comportamiento que ya existía antes de este trabajo. Por eso el
`UPDATE` de la migración que hereda `TaskAssignment.organizationId` desde el
evento dejó las 5 tareas demo en `NULL`: no es un fallo de la migración, es que
sus eventos tampoco tienen tenant. Si algún día se quieren ver, hay que asignar
`organizationId` a esos eventos.

## Pendiente (fuera del código)

- **Confirmar apellidos y correo de Monse y Kika** con Arturo, y ajustar rol si
  hace falta desde Panel → Usuarios.
- **Dar acceso de lectura del repo al servidor** (deploy key) para que
  `deploy/update.sh` vuelva a hacer `git pull` por sí solo.
- **Nadie tiene 2FA dado de alta**: el panel lo pide en el primer acceso.
- **`ENVIAR USUARIOS: CHACHO, ARTURO, LEIDA Y SOL`** — entrega de credenciales
  por canal seguro. Es una acción operativa de Adam, no del repositorio: aquí
  no se guardan contraseñas.
