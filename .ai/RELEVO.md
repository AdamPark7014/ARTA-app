# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-28
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner, 7 usuarios reales listados en `docs/ACCESS.md` — ese archivo no se
mueve, no se publica, no se toca). NestJS + Prisma (`apps/api`) y Next 14
App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

Se aplicaron **las correcciones de la junta del 28-08-2026**
(`Correciones Dashboard ARTA.pdf`). El detalle razonado, con las decisiones y
las excepciones, está en **`docs/CORRECCIONES_JUNTA_2026-08-28.md`** — léelo
antes de tocar cualquiera de estas áreas. Resumen:

1. **Sidebar sin desglose de checks.** `apps/web/lib/access-matrix.ts` se
   reescribió: el menú queda en Inicio (Dashboard), Eventos (Crear evento ·
   Eventos actuales · Eventos pasados · Tareas), Marca y Admin. Las 16 vistas
   de portafolio (Plantillas, Carpetas, Finanzas, OC, Campañas, Boletera,
   Anticipos, Hospitality, Transportación, Catering, Prensa, Artes, Pendones,
   Risk, Mantenimiento, Vendor PIN) **no se borraron**: quedan `hidden: true`
   y salen al escribir en el buscador del sidebar. El menú se movió a
   `components/app-shell/SidebarNav.tsx` porque necesita `useSearchParams`
   (va envuelto en `<Suspense>` dentro de `AppShell`).

2. **Eventos actuales / pasados.** `/events` acepta `?scope=active|past|all`.
   Pasado = cerrado/cancelado **o** con `startsAt` anterior a hoy. La página se
   partió en `EventsPage` (Suspense) + `EventsPageInner`.

3. **Campaña con Excel/PDF embebidos.** `EventFile` gana la columna `module`;
   los adjuntos de campaña van con `module='campaign'`. `POST /uploads` acepta
   `module`. La pestaña Campaña del evento y la fila de `/campaigns` se
   expanden y pintan el archivo con el `FileViewer` que ya existía. «Actualizar»
   sube la versión nueva y borra la anterior.

4. **Ventana de OC configurable.** Lógica pura en
   `apps/api/src/purchase-orders/po-window.ts` (14 tests verdes en
   `po-window.spec.ts`), config en `Organization.settingsJson.poWindow`,
   default lunes y jueves 10:00–14:00 CDMX. `GET/PATCH /purchase-orders/window`,
   bloqueo real en `POST /purchase-orders`, pantalla nueva `/settings` y
   banner `PoWindowBanner` en el hub del evento y en `/purchase-orders`.
   **`dir_general` y `super_admin` saltan la ventana a propósito.**

5. **Tareas org-wide + avisos en plataforma.** `TaskAssignment.eventId` pasa a
   opcional y se agregan `organizationId`, `createdById`, `detail`. Modelo
   `Notification` nuevo con su módulo Nest. `/users/directory` deja de filtrar
   por entidad. `/tasks` se rehízo: alta de tareas + tres vistas (Asignadas a
   mí / Que pedí / Equipo). Campana `NotificationBell` en la topbar, sondeo
   cada 45 s.

6. **Altas Monse, Sol y Kika** definidas en `apps/api/prisma/new-team-members.ts`
   con rol `logistica`, y script `npm run users:provision` que **solo inserta
   lo que falta**.

### Verificación

- `npm run typecheck` (api + web) — verde.
- `npx jest` en `apps/api` — **9 suites, 61 tests**, incluidas las 14 nuevas de
  la ventana de OC.
- `next build` — verde, **35 rutas** (antes 34; entra `/settings`).
- `npm run test:e2e` en `apps/web` — **9 specs verdes** (antes 6). Se
  actualizaron los tres de `app-shell` que asumían el menú viejo y se agregó
  `e2e/tasks.spec.ts` (asignar tarea a otra persona + campana de avisos).

## Decisiones de diseño que hay que respetar

- **Las herramientas ocultas no se borran.** Están fuera del menú, no del
  router. Si borras esas rutas rompes enlaces que ya circulan y dejas huérfanos
  los deep links de los checklists por disciplina.
- **`visibleNavItems()` devuelve Carpetas generales al menú** cuando el usuario
  no tiene operación de eventos en la entidad activa (`dir_auditorio` dentro de
  Arta). Sin esa excepción ese rol se queda con el menú vacío.
- **La ventana de OC no encierra a dirección.** Es deliberado: quien configura
  la regla necesita la válvula para urgencias.
- **Los avisos nunca lanzan.** `NotificationsService.notify()` traga el error y
  lo loguea: un aviso que falla no puede tumbar la creación de la tarea.
- **No se pasa el seed en producción.** `prisma/seed.ts` reescribe el
  `passwordHash` de TODOS los usuarios en cada corrida. Para altas se usa
  `npm run users:provision`, que solo inserta lo que falta.
- Sigue vigente todo lo del turno anterior: los e2e del web no necesitan
  Postgres (Playwright intercepta `**/api/**`), el host es
  `arta.localhost:3100`, y `output: 'standalone'` no se toca.

## A medias — CUIDADO

- **La migración `20260828120000_tasks_org_notifications_file_module` NO se ha
  aplicado en producción.** Toca `EventFile`, `TaskAssignment` y crea
  `Notification`. Hay que correr `npm run prisma:deploy` en `apps/api` contra
  el droplet **antes** de desplegar el API nuevo, o el backend arranca contra
  un esquema viejo. La migración trae el `UPDATE` que hereda
  `TaskAssignment.organizationId` desde el evento; las tareas que ya existen
  quedan sin `createdById` (nadie las pidió) y eso es correcto.
- **Rol y correo de Monse, Sol y Kika están asumidos**, no confirmados. La
  junta solo dio nombres de pila. Confirmar con Arturo antes de correr
  `users:provision`.
- **Items 6 y 7 de la Fase A** siguen sin auditar visualmente
  (`finance/page.tsx`, `purchase-orders/page.tsx`, `users/page.tsx`,
  `security/page.tsx`). `purchase-orders` se tocó solo para meter el banner.
- **`deploy/ensure-traefik-route.sh`** y su cron de 5 min siguen igual que el
  turno pasado: el cron vive en el droplet, no en el repo.

## Siguiente paso

Por orden de valor:

1. **Aplicar la migración y desplegar.** Es lo único que separa este trabajo de
   estar vivo en artaproducciones.com.
2. **Confirmar con Arturo** rol/correo de las tres altas y correr
   `users:provision`. Después, entregar credenciales a Chacho, Arturo, Leida y
   Sol (`ENVIAR USUARIOS` del PDF) — acción manual, fuera del repo.
3. **Playwright del hub de evento**: la pestaña Campaña con archivos y la
   ventana de OC son lo más nuevo y no tienen spec. `/events/[id]` sigue siendo
   la ruta más pesada (244 kB) y la menos cubierta.
4. **Cerrar los items 6 y 7 de la Fase A** (ver «A medias»).
5. **A3-5 — módulos operativos**: inventario técnico, calendario de producción
   y reportes ejecutivos. No existen. Regla del plan: *un módulo a la vez, sin
   CRUD nuevo fuera del spine*.
6. **A3-6 — manual del Auditorio**: extender
   `docs/guides/ARTA-Ops-Guia-de-Uso.html` y, ya de paso, documentar el menú
   nuevo — la guía todavía describe el sidebar viejo.
7. **A3-7 — causa raíz de la ruta de Traefik**: el deploy de NEXARA borra
   `arta.yml` del file provider compartido y tumba el dominio a 404. Hoy se
   parchea con cron.
8. **A3-8 — falta `docs/ENTERPRISE_ITERATION_W2.md`**.

## No tocar

- **`docs/ACCESS.md`** — 7 usuarios reales con nombre y correo. No se mueve, no
  se publica, no se cambia. Fuera de alcance cualquier rotación o lectura de
  secretos.
- **`next.config.js` → `output: 'standalone'`** — lo exige el Dockerfile de
  producción, aunque haga ruido con `next start` en los e2e.
- **El commit `2c165a1`** — rescate del turno anterior. No se reescribe ni se
  hace squash hasta que Adam confirme que ese rediseño es el bueno.
- **`apps/api/test/*.e2e-spec.ts`** — corren contra BD real y el CI hace
  `prisma migrate deploy` antes. Están bien como están.
- **No se ha hecho push.** Todos los commits siguen siendo locales.
