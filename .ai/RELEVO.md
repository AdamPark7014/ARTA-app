# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-27
- **Rama:** main

## Contexto del proyecto

ERP de producción de eventos **en producción real** (artaproducciones.com,
Hetzner, 7 usuarios reales listados en `docs/ACCESS.md` — ese archivo no se
mueve, no se publica, no se toca). NestJS + Prisma (`apps/api`) y Next 14
App Router (`apps/web`), monorepo npm workspaces + turbo.

## Hecho en este turno

1. **Rescate del turno anterior.** Había 67 archivos sin commitear
   (56 modificados, 11 nuevos). Van al commit WIP **`2c165a1`**
   — 67 files changed, +6.061 / −2.486. Nada se perdió y nada se reescribió.

2. **Identificado qué era ese trabajo:** la **Fase A (Craft UI)** de
   `docs/PROFESSIONALIZATION_PLAN.md`. **Ojo: la Fase A del plan tiene 7
   items, no 4.** Estado real leído del disco:
   - (1) Skeleton / empty-state compartidos — hecho
     (`components/ui/EmptyState.tsx`, `LoadingBlock.tsx`,
     `components/events/EventDetailSkeleton.tsx`).
   - (2) Event hub tab bar — hecho (`components/events/EventTabBar.tsx` +
     `useEventTab.ts`).
   - (3) Ticketing unificado — hecho (`EventTicketingPanel.tsx`).
   - (4) Events list risk badges + jerarquía — hecho
     (`app/(app)/events/page.tsx`, filtro `riskOnly` + `StatusBadge kind="risk"`).
   - (5) Dashboard alert-first — hecho (`alert-stack` / `ops-alert` en
     `app/(app)/dashboard/page.tsx`).
   - (6) Finance + OC tables y (7) Users / Security consistency — las páginas
     están tocadas y compilan, pero **no se auditó visualmente si el criterio
     de "consistency" quedó cumplido**. Es lo único de la Fase A sin verificar.

   Los 11 archivos nuevos **están todos referenciados** desde al menos un
   consumidor — no quedó ningún componente huérfano.

3. **A3-1 — compila.** `npx tsc --noEmit` verde en `apps/web` **y** en
   `apps/api`. `next build` verde: 34 rutas generadas, 0 errores. **El
   rediseño no dejó nada roto**: no hubo imports rotos ni componentes
   fantasma que arreglar.

4. **A3-3 — scripts raíz.** `package.json` raíz ahora tiene `typecheck`,
   `test`, `test:api`, `test:api:e2e`, `test:web`. Añadido `typecheck` a
   `apps/api` y `typecheck` + `test` + `test:e2e` + `start:e2e` a `apps/web`.
   `npm run typecheck` y `npm test` desde la raíz cubren api **y** web.

5. **A3-2 — Playwright arrancado.** `apps/web` pasa de 0 a **6 specs verdes**:
   - `apps/web/e2e/login.spec.ts` (2): reto 2FA completo
     (login → `requires2fa` → `verify-login` → `/dashboard`) y credenciales
     inválidas sin salir de `/login`.
   - `apps/web/e2e/app-shell.spec.ts` (4): gate del middleware sin sesión,
     shell con navegación + identidad, buscador del sidebar filtrando módulos,
     y navegación sidebar → portafolio de eventos.
   - `apps/web/e2e/support/mock-api.ts`: doble de la capa `/api/*`.
   - `apps/web/playwright.config.ts`.

6. **A3-4 — CI.** El job `web` de `.github/workflows/ci.yml` pasa de
   `npm ci → tsc → build` a `npm ci → typecheck → build → playwright install
   chromium → e2e → upload del report`. Los dos jobs usan ahora los scripts
   npm en vez de `npx tsc` suelto, para que CI y local no se separen.

## Decisiones de diseño que hay que respetar

- **Los e2e del web NO necesitan Postgres ni el workspace `api` levantado.**
  El navegador siempre pega a `/api<path>` (rewrite de `next.config.js`) y
  Playwright intercepta con `page.route('**/api/**')` antes del rewrite. Lo
  que se prueba es el contrato de `lib/api.ts` + `lib/user-context.tsx`; el
  backend ya está cubierto por los e2e de `apps/api` contra BD real.
- **El host de los e2e es `arta.localhost:3100`**, porque `lib/domains.ts`
  mapea ese hostname a la entidad `ARTA` y así el middleware aplica el mismo
  gate de panel que en producción. La config fuerza
  `--host-resolver-rules=MAP *.localhost 127.0.0.1` para no depender del
  resolver de Windows.
- `webServer` corre `npm run build && npm run start:e2e`. En local reutiliza
  un server ya levantado (`reuseExistingServer: !CI`); en CI reconstruye
  aprovechando la caché de `.next` del paso `Build`.

## A medias — CUIDADO

- **`apps/web/app/(app)/finance/page.tsx`, `purchase-orders/page.tsx`,
  `users/page.tsx`, `security/page.tsx`** — items 6 y 7 de la Fase A.
  Compilan y renderizan, pero nadie ha verificado que la "consistency" de UI
  que pedía el plan esté realmente cerrada. No los reescribas: ábrelos,
  compáralos con `dashboard` y `events` (que sí quedaron al nivel objetivo)
  y cierra la diferencia.
- **`next start` avisa** `"next start" does not work with "output: standalone"`
  en cada arranque del webServer de Playwright. **Hoy funciona igual** (los 6
  specs pasan), pero es una advertencia real de Next: si una versión futura la
  convierte en error, hay que servir los e2e con
  `node .next/standalone/server.js` (y copiar `public/` y `.next/static` al
  lado). No cambies `output: 'standalone'` en `next.config.js` — lo necesita
  el Docker de producción.
- **`deploy/ensure-traefik-route.sh`** (nuevo, del turno anterior) ya está
  cableado en `deploy/update.sh`, que dejó de hacer `cp -f` directo. **El cron
  de cada 5 min que lo reejecuta no está en el repo**, vive en el droplet.

## Siguiente paso

Por orden de valor:

1. **A3-2 (continuación)** — ampliar Playwright al hub de evento: `EventTabBar`
   + `useEventTab` + `EventTicketingPanel` son lo más nuevo y lo menos
   cubierto. La ruta `/events/[id]` es la más pesada del build (130 kB) y no
   tiene ni un spec.
2. **Cerrar los items 6 y 7 de la Fase A** (ver «A medias»).
3. **A3-5 — módulos operativos**: inventario técnico, calendario de producción
   y reportes ejecutivos. No existen. Ojo con la regla del plan: *un módulo a
   la vez, sin CRUD nuevo fuera del spine* (Event → checklist → OC → finance →
   boletera).
4. **A3-6 — manual de usuario del Auditorio**: extender
   `docs/guides/ARTA-Ops-Guia-de-Uso.html` con la operación del venue
   (entidad `EXPLANADA`, rol `dir_auditorio`).
5. **A3-7 — causa raíz de la ruta de Traefik**: el deploy de NEXARA borra
   `arta.yml` del directorio compartido del file provider
   (`/var/www/nexara-app/deploy/traefik/`) y tumba artaproducciones.com a 404.
   Hoy se parchea con `ensure-traefik-route.sh` + un cron cada 5 min en el
   droplet. **La causa raíz sigue sin resolver**: lo correcto es que NEXARA no
   sea dueño de ese directorio, o que ARTA publique su ruta por otro
   mecanismo (label de Docker o un file provider propio).
6. **A3-8 — falta `docs/ENTERPRISE_ITERATION_W2.md`**. La bitácora va W1, W3,
   W4W5, W6…W11. El W2 nunca se escribió; hay que reconstruirlo del `git log`
   de ese tramo o dejar constancia de que no existió.

## No tocar

- **`docs/ACCESS.md`** — 7 usuarios reales con nombre y correo. No se mueve, no
  se publica, no se cambia. Fuera de alcance también cualquier rotación o
  lectura de secretos.
- **`next.config.js` → `output: 'standalone'`** — lo exige el Dockerfile de
  producción, aunque haga ruido con `next start` en los e2e.
- **El commit `2c165a1`** — es el rescate del turno anterior. No se reescribe
  ni se hace squash hasta que Adam confirme que ese rediseño es el bueno.
- **`apps/api/test/*.e2e-spec.ts`** — corren contra BD real y el CI hace
  `prisma migrate deploy` antes. Están bien como están.
- **No se ha hecho push.** Todos los commits de este turno son locales.
