# RELEVO

- **2026-11-21 (claude-code) — Adam: «mejora aún más la UI/UX y el funcionamiento». NO desplegado.**
  - **Finanzas:** columna «Órdenes pagadas» por evento (`analytics.finance()` → `poPaid`, `poPaidCount`, totales
    `poPaid`/`poWithoutExpense`). No se suma a los egresos (la corrida puede traer ya ese gasto). Aviso y filtro
    «pagó órdenes y su corrida no tiene egresos». Prueba: `analytics-finance.spec.ts`.
  - **OC:** ya no se crea ni se edita una orden sin proveedor o con nombre de menos de 3 letras (salvo adendum,
    que se paga a una persona). API `assertVendorName` + formulario.
  - **Movimiento:** el módulo del evento entra con `pulido-in` al cambiar de pestaña; la segunda tira baja.
  - **Teléfono:** segunda tira de pestañas con desvanecido. El tablero de Tareas mide 390 de ancho (el aviso
    `hscroll` de la auditoría en «tablero» es de su propio paso, no de la página).
  - **Apps nativas:** sin cambios; en la nube no hay SDK de Android ni Xcode para compilarlas.
  - Playwright 1.65 pide `chromium_headless_shell-1255` (en la nube: symlink al 1243 de /opt/pw-browsers).

- **2026-11-15 (claude-code) — Imágenes de Docker de `node:20-bookworm-slim` a `node:22-bookworm-slim` (Node 20 ya sin soporte). NO desplegado.**
  - `apps/api/Dockerfile` y `apps/web/Dockerfile` (las tres etapas de cada uno). CI (`ci.yml`, `medir-safari.yml`,
    `web-safari.yml`) también pasa a `node-version: 22`. No hay `engines` ni `.nvmrc` que fijen Node 20.
  - `node:22-bookworm-slim` trae Node 22.23.5 y npm 10.9.9: el lock pasa `npm ci --dry-run --ignore-scripts` con
    npm 10.9.9 para `apps/api` y `apps/web`.
  - Imágenes construidas en la laptop: API (Prisma carga, `dist/main.js` existe) y web (arranca en 247 ms, `/login` 200).
  - Pruebas de la API **dentro de Node 22** (etapa `builder`): 1216 pasan, 1 omitida. En el contenedor hay que crear
    `apps/api/uploads` y montar `apps/web/lib` (no van en la imagen) o caen `excel-templates` y `sheet-ops` por ENOENT.
  - Con Node 26 de la laptop: `npm run test` igual que antes (API verde, e2e 306/307; la que falla necesita la API en `:4000`).
  - Para desplegar: el script de siempre reconstruye con la imagen nueva; lo decide Adam.

- **2026-11-15 (claude-code) — Dependencias al día con Node 26.13.1 / npm 12.2.2 (solo parches y menores). NO desplegado.**
  - Subidas: maplibre-gl 6.18.0 (sus `.mjs` copiados a `apps/web/public/maplibre/`), mammoth 1.13, sass 1.108,
    @sentry/node 10.78, stripe 22.6, otplib 13.6, nodemailer 10.5, @nestjs/throttler 6.7, playwright 1.65, socket.io-client
    4.8.4, postcss 8.5.33, docx-preview 0.3.7 y especificadores de Nest 10.4.22 / Prisma 5.22 / React 19.3 (ya en el lock).
  - **npm 12 bloquea los scripts de instalación:** `package.json` lleva `allowScripts` (Prisma, @parcel/watcher,
    protobufjs, @firebase/util, @nestjs/core). npm 10 de Docker (`node:20-bookworm-slim`) lo ignora.
  - Trampa de `overrides` + workspaces: npm 12 dejó `postcss` 8.5.32 en el lock aunque la web pedía `^8.5.33` y el npm 10
    de Docker lo rechazaba en `npm ci`; se forzó con `npm install postcss@^8.5.33 -w apps/web`. El lock final pasa
    `npm ci --dry-run` con npm 10.8.2 para api y web.
  - Verificado con Node 26: typecheck, pruebas de API, build (turbo), `AppModule` carga, e2e 306/307. La que falla
    (`real-stack-files.spec.ts`) necesita la API real en `:4000` y no corre sin ella. `mammoth` 1.13 da el mismo HTML que
    la 1.9 con los tres `.docx` de `apps/api/assets/format-sources`.
  - Ojo e2e: `start:e2e` fija `-p 3100`; si ese puerto está ocupado (hoy lo usa BOLETERA), levantar el build a mano en
    otro puerto con las variables de `playwright.config.ts` y correr con `E2E_PORT=<puerto>`.
  - Mayores pendientes y su costo: `C:\dev\.ai\dependencias-2026-11.md`.

- **2026-11-14 (claude-code) — Limpieza de documentación (Adam: «quita documentación y unifica»).** Borrados 11 documentos obsoletos sin referencias (auditorías, planes y prompts viejos; están en el historial de git). Índice único del repo: `docs/INDICE.md`; índice de todos los proyectos: `C:\dev\DOCS.md`; memoria compartida de Codex/Claude/Cursor/Grok: `C:\dev\.ai\memoria`. RELEVO recortado a los 3 turnos más recientes.

- **Último turno:** claude-code
- **Fecha:** 2026-11-11
- **Rama:** main
  (Adam es el único programador).
- **Producción:** `0f68a31` desplegado desde `main` el 2026-11-07 (`bash deploy/update.sh` en `/var/www/arta-app`, log
  `/root/arta-deploy-20261107-B.log`; respaldo automático en `/root/arta-backups/`). Disco al 69 %: **un despliegue lo subió a 90 %, donde se cae la BD.** Antes de cada
  despliegue, `docker builder prune -af`.

## Turno claude-code (2026-11-11): homologar cifras y texto (UI/UX, fase 1)

Adam: «la app no te dice nada… homologarlo». Recorrido en `/mnt/project-files/produccion/hallazgos-uiux-web-2026-11-11.md`. **NO desplegado.**
- **Eventos activos (Inicio) = Eventos → Actuales:** `isEventCurrent` / `eventCurrentWhere` / `eventPastWhere` en
  `common/checklist-progress.ts`. Antes Inicio contaba todo `status=ACTIVE` (8, con shows pasados sin cerrar) y la lista
  cortaba por inicio en UTC (3). `eventsActiveStatus` conserva el conteo viejo. Prueba: `event-current.spec.ts`.
- **Finanzas:** etiquetas en español («Corridas cerradas», «Estado», «Cerrada», «Neto»), Egresos aclara que las OC van
  aparte (no están sincronizadas con las corridas: OC pagadas $50,280 vs egresos $0), fecha del evento en cada fila
  (dos eventos «FINDE»), `financeRuns` ordenado por `updatedAt` (antes `[0]` era arbitrario).
- **Avisos de Inicio** sin jerga («formatos al N % · faltan N días», «formatos entregados esperan tu autorización»).
- **Tareas:** la ficha «Pendientes» cuenta lo mismo que filtra (todo lo no aprobado, incluye «Por aprobar» y bloqueadas).
- **Fechas:** `eventWhen` en `lib/format.ts` («sáb 9 dic · en 29 días», «15 – 17 ene», «en curso»); lo usa la lista de Eventos.
- **Teléfono:** el tablero de Tareas ya no ensancha la página (`.board { min-width: 0 }`); las fichas de filtro se
  desvanecen a la derecha para que se note que hay más; `title` en nombres que se cortan (Inicio, tablero, chat).
- **Apps nativas:** solo chat, avisos, tareas y OC; su texto ya está en español claro. Lo demás abre el panel web.
- Maqueta para visto bueno: https://claude.ai/artifact/JHUC8N18Kg3w2V41yVXkX5
- **Maqueta aprobada por Adam (11-11, «Sí, aplícala así») y aplicada:**
  - Evento: franja «Lo siguiente» (`components/events/next-steps.ts` + `NextStepsStrip.tsx`) con el formato más
    atrasado y su botón, más atajos (campaña, boletera, OC por autorizar, tareas vencidas).
  - Pestañas agrupadas (`EventTabBar.tsx`, `TAB_GROUPS`): Resumen · Producción (Formatos, Tareas, Documentos,
    Testigos) · Dinero (Corrida, OC, Convenios, Adendum) · Venta (Campaña, Boletera); el grupo abierto enseña una
    segunda tira. Un grupo con un solo módulo visible se llama como el módulo.
  - Tarjetas de Eventos: «Lo siguiente» y píldora A tiempo / Atrasado / Urgente. El API (`/analytics/overview`,
    `eventHealth`) ahora manda `todoChecklists`, `reviewChecklists`, `worstChecklist`.
  - Calendario (`MonthCalendar.tsx`): una barra por semana para shows de varios días, en carriles; lo que no cabe
    (más de 3) queda en «+N más».
  - Capturas antes/después: `/mnt/project-files/produccion/capturas-homologacion/`.
  - Los formatos no tienen responsable en el modelo: «quién lo debe» de la maqueta solo sale donde hay dato.

## Turno claude-code (2026-11-08, tarde): Next 15 + React 19 y xlsx

Adam: «ve cómo mejorar lo que falte y asegúrate que mi lap tenga el commit más reciente». **NO desplegado.**
- **Next 14.2.35 → 15.5.29** (backport con todos los arreglos; 16 trae más cambios de golpe) y **React 18.2 → 19**.
  Cambios: `headers()` asíncrono (`(app)/layout.tsx`, `page.tsx`, `robots.ts`), `params`/`searchParams` como Promise
  (`p/arta/{noticias,servicios,cartelera}/[slug]`, `dev/sheet-harness`), tipos de `useRef`/`RefObject`/`JSX` de React 19.
  Regresión atrapada por e2e: Avisos con `?tab=enviados` marcaba vistos los recibidos en el primer render; el filtro
  ahora arranca en la pestaña de la liga.
- **xlsx 0.18.5 → 0.20.3** vía alias `npm:@e965/xlsx@0.20.3` (republica los paquetes oficiales de SheetJS; el CDN de
  SheetJS está bloqueado desde la nube). Los `import 'xlsx'` no cambian.
- **postcss** como devDependency de web para que el override llegue a Next (npm no lo aplicaba a la copia anidada).
- `npm audit --omit=dev`: **0 críticas, 0 altas** (18 moderadas).
- `.ai/audit/` al `.gitignore`: en la laptop trae un gitleaks.json con el valor de una llave de Google y `relevo.ps1
  salvar` (git add -A) lo habría subido.
- **Dockerfiles:** copian también `apps/<ws>/node_modules`: npm dejó next/react y multer/nodemailer dentro del
  workspace y el primer despliegue de 4a51e5f no compiló en Docker (producción siguió en 0f68a31, sin corte).
  Ojo: `npm run build` local no lo detecta; solo `docker compose build`.
- **Segundo intento (97694e6): rollback** tras ~4 min: la portada y galería viven en `uploads/site/` (46 archivos) y
  daban 401. `isPublicUpload` ya deja públicas las imágenes de `site/` (nada más de esa carpeta). `uploads/legal/`
  (1 archivo) sigue con sesión. Producción quedó en 0f68a31; cron de `arta-ops` instalado y primer respaldo OK (21:49).
- Laptop (`C:\dev\apps\ARTA-app`, no `C:\dev\ARTA-app`): quedó en 222ebbd antes de este commit.

**Verificación:** typecheck API+web, API 1,208 pruebas, build web, e2e Chromium 305/305.

## Turno claude-code (2026-11-08): endurecer producción

Adam: «revisa… si le falta algo para llevarlo a producción»; «todo lo que falte déjalo ya resuelto». Evaluación:
https://claude.ai/artifact/Wqme32SNsxZbcQpqCUkosd. **NO desplegado todavía.** Guía nueva: **`deploy/OPERACION.md`**.

- **`/uploads` exige sesión** (`uploads/static-access.ts`, `bootstrap-config.ts`): públicas solo las fotos sueltas en la
  raíz (sitio público). Lo demás (PDF, Office, audio/video, `chat/`, `documents/`, `testigos/`…) pide `arta_access`
  con sesión viva en BD (caché 60 s) o token de proveedor `arta_vendor`; si no, 401. Originales xlsx/docx siguen solo
  para dirección. Las apps ya mandaban la cookie en imágenes/audio/video. Nombres de archivo nuevos con `randomUUID`.
- **Swagger** solo fuera de producción (`SWAGGER_ENABLED=1` lo enciende). **Seed:** sin portafolio demo con
  `NODE_ENV=production` (`SEED_DEMO=1` lo fuerza); los eventos `[SEED_DEMO]` que ya existan en producción siguen ahí.
- **Dependencias:** `npm audit --omit=dev` de 35 (2 críticas) a 20 (1 crítica, 1 alta): multer 2.5, nodemailer 10.4,
  overrides de body-parser, lodash, js-yaml, @grpc/grpc-js, postcss. Quedan **Next 14** (arreglo solo en 15/16, migración
  aparte) y **xlsx** (el arreglo está en cdn.sheetjs.com, bloqueado desde la nube; solo navegador).
  Ojo: overrides de npm no se aplican sobre un lock existente; hubo que regenerar desde el lock original.
- **Operación:** `deploy/backup.sh` (BD + uploads, verificado, rotación, rclone opcional), `monitor.sh` (API/web, disco,
  respaldo; avisa por `ALERT_WEBHOOK_URL`), `notify.sh`, `install-cron.sh` (`/etc/cron.d/arta-ops`). `update.sh` limpia
  caché y **aborta si el disco queda ≥80 %**. Logs de Docker con tope (5×20 MB).
- **Safari CI rojo en 0f68a31:** era la prueba de la campana corriendo a las 00:06 UTC («hace 5 min» caía en «Ayer»);
  reloj fijo a mediodía en `e2e/notifications.spec.ts`.

**Verificación:** typecheck API+web, API 78 suites / 1,208 pruebas, build web, e2e Chromium 305/305 (sin «Stack real»).
**Pendiente de Adam en el servidor:** desplegar, `sudo bash deploy/install-cron.sh`, poner `ALERT_WEBHOOK_URL`,
`ARTA_BACKUP_REMOTE` (+ rclone) y `SENTRY_DSN`. Probar que el sitio público y las apps siguen viendo fotos y adjuntos.


_Turnos anteriores recortados el 2026-11-14 (limpieza de documentación). Historial completo: `git log -p -- .ai/RELEVO.md`._
