# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-28
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner `5.78.215.109:2222`, stack docker `arta`). NestJS + Prisma (`apps/api`)
y Next 14 App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

Las **correcciones de la junta del 28-08-2026** (`Correciones Dashboard
ARTA.pdf`), más una baja y tres altas de usuario, **y el despliegue**. El
detalle razonado está en **`docs/CORRECCIONES_JUNTA_2026-08-28.md`** — léelo
antes de tocar estas áreas.

1. **Sidebar sin desglose de checks.** El menú queda en Inicio (Dashboard),
   Eventos (Crear evento · Eventos actuales · Eventos pasados · Tareas), Marca
   y Admin. Las 16 vistas de portafolio quedan `hidden: true` en
   `lib/access-matrix.ts` y salen al escribir en el buscador del sidebar. El
   menú vive ahora en `components/app-shell/SidebarNav.tsx` (necesita
   `useSearchParams`, va envuelto en `<Suspense>`).

2. **Eventos actuales / pasados.** `/events?scope=active|past|all`. Pasado =
   cerrado/cancelado o con `startsAt` anterior a hoy.

3. **Campaña con Excel/PDF embebidos.** `EventFile.module`; los adjuntos van
   con `module='campaign'`. La pestaña Campaña del evento y la fila de
   `/campaigns` se expanden y pintan el archivo con `FileViewer`.

4. **Ventana de OC configurable.** `src/purchase-orders/po-window.ts` (14 tests),
   config en `Organization.settingsJson.poWindow`, default lunes y jueves
   10:00–14:00 CDMX, pantalla `/settings`, banner en el hub y bloqueo real en el
   alta de OC. Dirección la salta a propósito.

5. **Tareas org-wide + avisos en plataforma.** `TaskAssignment.eventId` pasa a
   opcional; entran `organizationId`, `createdById`, `detail`. Modelo
   `Notification` + módulo Nest + campana en la topbar. `/tasks` con alta de
   tareas y tres vistas (Asignadas a mí / Que pedí / Equipo).

6. **Roster.** Baja de **Melissa Astudillo** (fuera del seeder y **borrada de la
   base de producción**, a petición de Adam). Altas de **Monse**, **Marisol
   Pérez Vásquez** (la «SOL» del PDF, perfil `convenios` igual que Leida) y
   **Kika**. El copy que la nombraba por su nombre pasa a nombrar el rol
   («gerencia de Arta») en API, panel, `docs/PRODUCT.md` y la guía de uso.

7. **Auditoría de la UI ya desplegada** (ver doc, sección 7). El menú se había
   podado de más: **Órdenes de compra** vuelve al menú (el PDF nunca pidió
   moverla dentro del evento, le dedica sección propia) y **Carpetas generales**
   vuelve para `convenios` y `enlace_gobierno`, cuyo `ROLE_SCOPE` empieza por
   «Carpetas» y se habían quedado sin herramienta. Botón **«Más herramientas»**
   para abrir en un clic las 14 vistas que siguen fuera del menú. Arreglado el
   checkbox de `/settings`, que salía centrado sobre su etiqueta.

8. **Dos defectos encontrados al desplegar** (ver doc, sección 6):
   el seed creaba usuarios **sin tenant** —quedaban invisibles para el panel de
   Usuarios y para asignar tareas— y **pisaba las contraseñas en cada
   despliegue**. Ambos corregidos en `prisma/seed.ts`, con backfill ya aplicado
   en producción (9/9 usuarios con `organizationId` + `OrgMembership`).

9. **Documentos editables dentro del evento** (pedido del 29-08-2026, detalle en
   `docs/DOCUMENTOS_EDITABLES.md`). La pestaña «Excel / PDF» pasa a llamarse
   **Documentos** y ahora:
   - **Hoja de cálculo editable**: se abre el `.xlsx` real en una cuadrícula, se
     escribe en las celdas y al guardar se reconstruye el archivo. Solo se
     tocan las celdas editadas, así que **las fórmulas y el formato de las que
     nadie tocó sobreviven**.
   - **Escribir encima del PDF**: pdf.js dibuja las páginas, se colocan cajas de
     texto arrastrables y pdf-lib las **imprime dentro del PDF** al guardar.
   - **Documento tipo Word → PDF**: se escribe por bloques y «Descargar PDF» lo
     imprime con pdfkit y lo registra como archivo del evento. Modelo nuevo
     `EventDocument` con versionado.
   - **PDF → documento editable**: extrae el texto y lo reagrupa en párrafos.
     **No reconstruye el diseño** y un PDF escaneado no devuelve nada — el panel
     lo dice en vez de crear un documento vacío.
   - `PUT /uploads/:id/content` reemplaza el archivo **sin cambiar el id**, sube
     `version`, guarda quién editó y conserva el anterior en disco.

### Verificación

- `npm run typecheck` (api + web) verde · `npx jest` en `apps/api`
  **9 suites / 61 tests** · `next build` verde con **35 rutas** ·
  `npm run test:e2e` **13 specs verdes**. `e2e/editors.spec.ts` genera un
  `.xlsx` de verdad, lo sirve, comprueba que su contenido llega a la cuadrícula,
  escribe dos celdas y verifica que se sube un `.xlsx` reconstruido de más de
  1 KB al endpoint de guardado.
- La UI se auditó con capturas del panel real (Playwright contra la API
  simulada): sidebar, hub de evento, pestaña Campaña con los archivos,
  `/tasks` y `/settings`.
- En producción: migración `20260828120000_…` aplicada, tabla `Notification`
  creada, columnas nuevas presentes, `TaskAssignment.eventId` nullable,
  9 usuarios activos, y salud pública 307/200/200/200.

## Decisiones de diseño que hay que respetar

- **Las herramientas ocultas no se borran.** Están fuera del menú, no del
  router: borrar esas rutas rompería enlaces que ya circulan.
- **`visibleNavItems()` devuelve Carpetas generales al menú** a `convenios`,
  `enlace_gobierno` y a quien no tenga operación de eventos en la entidad
  activa (`dir_auditorio` en Arta). Sin esa excepción esos roles se quedan sin
  herramienta: las carpetas no cuelgan de ningún evento.
- **Órdenes de compra se queda en el menú.** El PDF le dedica su propia sección
  (la ventana de solicitud) y nunca pidió moverla dentro del evento.
- **El worker de pdf.js se copia a `public/` en cada build**, no se versiona:
  si worker y librería se desfasan, pdf.js revienta en runtime. Está en
  `.gitignore` y lo genera `npm run copy-pdf-worker` (enganchado a `prebuild`).
  Además está excluido del matcher del middleware: es un asset estático y no
  debe pasar por el gate de sesión.
- **`pdfjs-dist` y `pdf-lib` entran por import dinámico.** Son pesados; así solo
  se descargan cuando alguien abre un editor.
- **La ventana de OC no encierra a dirección.**
- **Los avisos nunca lanzan**: `NotificationsService.notify()` traga el error.
- **El seed ya no toca `passwordHash` en el update.** La contraseña de
  `.env.arta` es solo la inicial; reponerla se hace desde Panel → Usuarios. No
  lo revuelvas: antes cada despliegue revertía los cambios de contraseña.
- **El seed adopta al usuario sin tenant, pero no mueve al que ya tiene otro.**
- Sigue vigente: los e2e del web no necesitan Postgres, el host es
  `arta.localhost:3100`, y `output: 'standalone'` no se toca.

## A medias — CUIDADO

- **El servidor no tiene credenciales de GitHub.** El repo es privado y el
  `.git` de `/var/www/arta-app` estaba vacío (los archivos se habían subido a
  mano), así que `deploy/update.sh` nunca pudo hacer su `git pull`. Se
  reconstruyó la historia desde un `git bundle` y se desplegó con `--no-pull`.
  **Falta darle una deploy key** para que `update.sh` funcione como fue
  diseñado. El procedimiento actual está en el doc de correcciones.
- **Los 5 eventos `[SEED_DEMO]` tienen `organizationId` en NULL** y por eso son
  invisibles en el panel — comportamiento anterior a este turno. Es la razón de
  que la migración dejara sus 5 tareas sin `organizationId`. Si se quieren ver,
  hay que asignarles tenant.
- **Monse y Kika entraron con nombre de pila y rol `logistica` asumido.** Falta
  que Arturo confirme apellidos, correo definitivo y rol.
- **Items 6 y 7 de la Fase A** siguen sin auditar visualmente
  (`finance/page.tsx`, `users/page.tsx`, `security/page.tsx`).
  `purchase-orders/page.tsx` solo se tocó para meter el banner.
- **`deploy/ensure-traefik-route.sh`** y su cron de 5 min siguen igual: el cron
  vive en el droplet, no en el repo.

## Límites conocidos de los editores

Están explicados en `docs/DOCUMENTOS_EDITABLES.md`, pero conviene tenerlos a
mano antes de prometer nada:

- La hoja **no calcula fórmulas nuevas**: si escribes `=A1+B1` se guarda ese
  texto, no el resultado. Tampoco edita estilos (colores, bordes, anchos).
- Escribir sobre el PDF **añade** texto; no reescribe el original.
- El paso de PDF a documento **pierde el diseño** (tablas, columnas, imágenes) y
  no funciona con PDF escaneados. Hacerlo bien exigiría OCR y reconstrucción de
  layout, que no es cosa del navegador.

## Siguiente paso

1. **Deploy key de GitHub en el servidor** — sin eso, cada despliegue necesita
   el rodeo del bundle.
2. **Confirmar apellidos/rol de Monse y Kika** y entregar credenciales
   (`ENVIAR USUARIOS` del PDF: Chacho, Arturo, Leida y Marisol). Las
   contraseñas iniciales están en `.env.arta` del servidor y en el documento
   que Adam tiene en `Documents\ARTA-credenciales-2026-08-28.md` — **ese
   archivo no entra al repo**.
3. **Playwright del hub de evento**: la pestaña Campaña con archivos y la
   ventana de OC son lo más nuevo y no tienen spec. `/events/[id]` sigue siendo
   la ruta más pesada (244 kB) y la menos cubierta.
4. **Cerrar los items 6 y 7 de la Fase A**.
5. **A3-5 — módulos operativos**: inventario técnico, calendario de producción,
   reportes ejecutivos. Regla del plan: *un módulo a la vez, sin CRUD nuevo
   fuera del spine*.
6. **A3-6 — guía del Auditorio**: `docs/guides/ARTA-Ops-Guia-de-Uso.html` sigue
   describiendo el sidebar viejo; hay que documentar el menú nuevo.
7. **A3-7 — causa raíz de la ruta de Traefik**: el deploy de NEXARA borra
   `arta.yml` del file provider compartido. Hoy se parchea con cron.
8. **A3-8 — falta `docs/ENTERPRISE_ITERATION_W2.md`**.

## No tocar

- **`docs/ACCESS.md`** — no se mueve, no se publica, no se cambia.
- **`next.config.js` → `output: 'standalone'`** — lo exige el Dockerfile.
- **El commit `2c165a1`** — rescate del turno anterior; no se reescribe ni se
  hace squash hasta que Adam confirme.
- **`apps/api/test/*.e2e-spec.ts`** — corren contra BD real.
- **`deploy/.env.arta` del servidor** — contiene las contraseñas iniciales de
  todo el equipo y `JWT_SECRET`. Respaldos en `/root/arta-backups/`.
