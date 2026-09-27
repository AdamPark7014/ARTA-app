# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-27
- **Rama:** main
  (Adam es el único programador).
- **Producción:** `f5e0c52` desplegado desde `main` el 2026-09-27 14:54 UTC

## Regla de ramas (pedido de Adam, 2026-09-27)

- Todo el trabajo va a `main`. No crear ramas `cursor/*`, `feature/*` ni `hotfix/*`.
- Commit en `main`, `git push origin main` y deploy desde `main`.
- El servidor (`/var/www/arta-app`) está en `main`, sin otras ramas.

## Hecho en este turno

Pedido: «todo mergeado y fusionado, canónico en `main`; no quiero ramas sobreescribiéndose».

### Limpieza de ramas
- Sin copias de ramas (pedido de Adam: todo canónico en `main`).
- `feature/mobile-chat-push` fusionada en `main` por fast-forward y borrada.
- GitHub iba 11 commits atrás (sin el chat ni las apps móviles). Ahora `origin/main` está al día.
- Borradas de GitHub porque ya estaban en `main` (se comparó el contenido, no solo el historial):
  - `cursor/new-formats-import-excel-docx-37b5`: idéntica al PR #2.
  - `cursor/formats-professionalization-37b5`: idéntica al PR #3.
  - `cursor/fix-boot-di-and-scripts-d788`: el PR #4; solo le sobraban notas viejas de RELEVO.
  - `cursor/doc-campaign-locks-cd94`: idéntica a `bf03c56`.
  - `hotfix/sheet-editor-dark-contrast`: el PR #6, ya fusionado.

### PR #5 `cursor/excel-professional-ui-ff0d` fusionado en `main` (decisión de Adam)
- Se trae todo **menos el editor y el evaluador de Excel**, que se quedan como en producción (PR #6):
  - `SheetEditor.tsx`, `lib/sheet-evaluator.ts` y `types/fast-formula-parser.d.ts` = versión de `main`.
  - Motivo: las dos ramas rehicieron el evaluador de fórmulas en paralelo (`createEvaluator` frente a
    `buildDisplayGrid`) y el editor chocaba en 15 puntos. Se protege Campaña/Corrida en producción.
- Lo que entra del PR #5:
  - Word: las tablas del `.docx` se importan y se editan como tablas (`documents.controller`, `DocEditor`).
  - Mejoras en `FileViewer`, `FormatSheet`, checklists y carpetas.
  - `GET folders/files/:id/inline`, con controles de organización, entidad, roles y ruta dentro de uploads.
  - `files/:id/inline`: un archivo sin evento ahora solo lo abre dirección (antes, cualquier usuario con sesión).
  - Workflow de CI, pruebas e2e (`real-stack-files`, `excel-snapshots`, `docx-viewer`…) y `test/excel-evaluator.spec.ts`.
  - Página interna `/dev/sheet-snap` (con login) y capturas en `docs/pr5-screens/`.
- Dependencias:
  - web: `docx-preview`; en desarrollo, `@types/pngjs`, `jszip` y `mammoth`.
  - api: `fast-formula-parser`.
- Verificación:
  - `tsc` web y API limpios; `next build` en verde.
  - Jest API 303 en verde y 1 omitido.
  - Las e2e de Playwright del PR #5 no se corrieron. Algunas (`excel-snapshots`, `real-stack-files`)
    esperan el editor del PR #5 y pueden fallar contra el editor de producción. Revisarlas o quitarlas
    si molestan en CI.

### Turno anterior (mismo día): paridad web y móvil del chat
- Chat web sobre `chat/channels/*` + socket: hilos, reacciones, fijados, «escribiendo…», «Visto».
- Adjuntos nativos (fotos HEIC, video, notas de voz m4a/WAV, Office, zip) en web, Android e iOS.
- Campana web en vivo y aviso de escritorio. Push de procesos: evento cerrado, reabierto, cancelado o
  reprogramado; anticipos; comprobantes de OC.
- Desplegado `735c8c7` el 2026-09-27 06:40 UTC. Respaldo `/root/arta-backups/20260927-0640.sql.gz`.

## Deploy

- `f5e0c52` desplegado desde `main` (bundle + `update.sh --no-pull`) el 2026-09-27 14:54 UTC.
- Respaldo de la base: `/root/arta-backups/20260927-1454.sql.gz`.
- Estado tras el deploy:
  - Sin migraciones pendientes; «Nest application successfully started»; api, web y db healthy.
  - `/api/ready` 200, `/login` 200, `/chat` sin sesión → `/login?next=%2Fchat`.
  - Socket.IO con el Origin de la web responde 200. `folders/files/:id/inline` sin sesión responde 401.
- El servidor solo tiene `main`; se borró la referencia vieja `remotes/bundle/main`.
- Rollback: `bash deploy/rollback.sh` (añadir `--dump 20260927-1454.sql.gz` para restaurar también la base).

## A medias

1. **Push apagado en producción**: `FIREBASE_SERVICE_ACCOUNT_JSON` no está en `deploy/.env.arta` del
   servidor. Adam lo añade (no el agente) y reinicia el API:
   `docker compose --env-file deploy/.env.arta -f deploy/docker-compose.arta.yml up -d api`.
2. **iOS nunca se ha compilado**: lanzar `ios-build.yml` (workflow_dispatch) y corregir.
3. Web Push con el navegador cerrado (VAPID y service worker): no está hecho.
4. Android y iOS sin probar en dispositivo real.
5. Las e2e del PR #5 están sin revisar contra el editor de Excel de producción.

## Siguiente paso

1. Adam: Firebase de ARTA (Android e iOS, clave APNs `.p8`) y la cuenta de servicio en `.env.arta`.
   Pasos en `apps/mobile-native/README.md`.
2. Correr «iOS · compilar» en GitHub Actions hasta verde.
3. Probar en teléfonos: adjuntos en ambos sentidos, responder desde la notificación y leído sincronizado.
4. Revisar visualmente en producción las tablas de Word y el visor de Excel (Campaña y Corrida).
5. Pendientes de antes: deploy key de ARTA en GitHub, quitar `[SEED_DEMO]` con visto bueno.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` a un repo de app.
- No mover Traefik de puerto.
- Conceptos de campaña: no romper al tocar Excel. El editor y el evaluador de Excel son los del PR #6.
- Credenciales de Firebase: nunca en git.
  - `google-services.json` y `GoogleService-Info.plist` están en `.gitignore`.
  - La cuenta de servicio solo va por variable de entorno.
- No crear ramas: todo va a `main`.
