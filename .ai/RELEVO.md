# RELEVO

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
