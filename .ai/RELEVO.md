# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-11-22
- **Rama:** main
  (Adam es el único programador).
- **Producción:** sigue en `0f68a31` (2026-11-07). Laptop en `7507d40` (Node 22 Docker + deps 15-11). **NO desplegado / NO push este turno.**

## Turno cursor (2026-11-22): huecos memoria vs verificación

Adam: continuar ARTA producciones; árbol limpio; huecos RELEVO/memoria (GPS tiendas, chat `@tarea`, formatos) o verificar typecheck/tests; 1 módulo si hay cascarón; Ollama; commit solo con cambio real; sin push.

### Hecho
- Árbol limpio al entrar (`7507d40`).
- **Sin cascarón claro** en los tres frentes de memoria: ya están implementados.
  - **GPS / ubicación:** API `apps/api/src/ubicacion/*`, web `/ubicacion`, Android `location/`, iOS `LocationTracker`, docs `UBICACION.md`, e2e `ubicacion.spec.ts`. Tiendas = proceso Adam (Chrome/2FA), no hueco de código.
  - **Chat `@tarea` / refs:** `chat-refs.service` + specs API; web `components/chat/chat-refs.ts`; Android/iOS `ChatRefs` + UI; contrato `docs/CHAT-V2-CONTRATO.md` § 9.
  - **Formatos:** catálogo `STANDARD_FORMAT_VERSION = 5`, `FormatSheet`, `docs/FORMATOS.md`.
- **Verificación en verde (laptop, Node 26):**
  - `npm run typecheck` (API + web) OK.
  - API: **78 suites / 1216 pruebas** (+1 omitida) OK. Incluye `chat-refs`, `ubicacion`, `format-catalog`.
  - E2E Chromium: **306/307**. La que falla es `real-stack-files.spec.ts` (necesita API real en `:4000`); igual que el 15-11.
- Tras el bump a Playwright 1.65, el e2e falló primero por Chromium headless **no instalado** (`chromium_headless_shell-1255`). Se instaló con `npx playwright install chromium` en `apps/web` (solo máquina local; no va al repo). Con `E2E_PREBUILT=1` quedó 306/307.
- Aviso menor: `next start` avisa que con `output: 'standalone'` conviene `node .next/standalone/.../server.js`; el e2e igual sirve hoy.

### A medias / no tocado
- Nada de código de producto este turno (no había módulo cascarón).
- Ollama: status vivo; `find`/`generate` MCP/shell a menudo `fetch failed` / timeout; verificación fue NO_LLM + rg.

### Siguiente
- Desplegar cuando Adam lo pida (`docker builder prune -af` antes; disco).
- Tras bump Playwright en otra máquina/CI: `npx playwright install chromium` (o el job de CI ya lo hace).
- Pendientes viejos del barrido 07-11 (sin cambio): avisos en teléfono real; `/calendar?date=` sigue abriendo web en apps; opcional endurecer `start:e2e` a standalone.
- Tiendas / GPS en App Store & Play: solo con OK de Adam y su Chrome ([[arta-ubicacion-tiendas-2026-11]]).

### No tocar
- Secretos, firma iOS/Android, push a remoto, deploy sin pedido.
- `uploads/` (machote OC en servidor).

---

- **2026-11-15 (claude-code) — Imágenes de Docker de `node:20-bookworm-slim` a `node:22-bookworm-slim` (Node 20 ya sin soporte). NO desplegado.**
  - `apps/api/Dockerfile` y `apps/web/Dockerfile` (las tres etapas de cada uno). CI (`ci.yml`, `medir-safari.yml`,
    `web-safari.yml`) también pasa a `node-version: 22`.
  - Pruebas API en Node 22 (builder): 1216 pasan, 1 omitida. Laptop Node 26: API verde, e2e 306/307.

- **2026-11-15 (claude-code) — Dependencias al día con Node 26 / npm 12 (parches y menores). NO desplegado.**
  - Playwright 1.65, maplibre 6.18, mammoth 1.13, etc. `allowScripts` por npm 12. Mayores: `C:\dev\.ai\dependencias-2026-11.md`.

- **2026-11-14 (claude-code) — Limpieza de documentación.** Índice: `docs/INDICE.md`. Memoria: `C:\dev\.ai\memoria`.

_Turnos anteriores: `git log -p -- .ai/RELEVO.md`._
