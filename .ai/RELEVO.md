# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-27
- **Rama:** main
  (Adam es el único programador).
- **Producción:** `f5e0c52` desplegado desde `main` el 2026-09-27 14:54 UTC

## Regla de ramas (pedido de Adam, 2026-09-27)

- Todo el trabajo va a `main`. No crear ramas `cursor/*`, `feature/*` ni `hotfix/*`.
- Commit en `main`, `git push origin main` y deploy desde `main`.
- El servidor (`/var/www/arta-app`) está en `main`, sin otras ramas.

## Turno claude-code (2026-09-27, 15:30): «Salir en PDF» daba 500 y la cuadrícula llena de vacíos

Adam, con el editor del Excel de pendones: «server error, y muestra solo las casillas escritas
en el Excel con posibilidad de ampliarse».
- **500**: `exportPdf` anotaba una `DocRevision` sobre el Excel de origen con la versión del
  Excel, que no cambia al exportar; la segunda exportación chocaba con la única
  (`docType, docId, revision`). Ahora la exportación queda en el `auditLog`
  (`file.export.pdf`) y en la revisión del PDF de salida (que sí sube de versión), y
  `recordFileRevision` ignora un P2002 en vez de tumbar la operación.
- **Cuadrícula**: `SheetEditor` rellenaba 24 filas × 9 columnas mínimo. Ahora `trimGrid`
  recorta filas y columnas vacías del final y muestra solo lo escrito (más una fila libre si
  se puede editar); «+ Fila», «+ 10 al final» y «+ Columna al final» amplían.
- e2e: `checklist-sheet` 3/3 en verde (build real, puerto 3101 porque el 3100 lo ocupa ahora el
  Docker local). `editors.spec` y `excel-hf.spec` **fallan desde antes**: piden el botón «Editar
  aquí» (ya es «Editar»; corregido) y cargan el Excel por `/api/files/:id/inline` (PR #5),
  ruta que su mock no responde → la celda A1 recibe «[]». Pendiente para Cursor: stub de
  `files/:id/inline` en `support/mock-api.ts` o en esos specs.
- **Desplegado `99c43b8` a producción 27-09 15:37**: api y web sanos, el `dist` incluye el
  arreglo (`file.export.pdf`). Falta que Adam pulse «Salir en PDF» en pendones para confirmar.

## Turno claude-code (2026-09-27, 14:00): PDFs «horribles» y hoja en blanco

Adam, con el PDF de `Distribución de Pendones (Excel)` en producción: «tus pdfs salen
horribles raros y además dejan hoja en blanco al inicio».
- Causa 1 (hoja en blanco): `PdfBrandingService.drawHeaderFooter` (PR #3) escribía el pie en
  `y=570` fijo; en carta apaisada eso cae bajo el margen y pdfkit abre página nueva. Ahora
  el servicio usa `doc.page.width/height`, pinta el pie con el margen inferior en cero
  (`inFooterZone`) y trae la marca real (logo, banda, «Página n de N»). Lo usan documentos,
  boletera, historial y Excel.
- Causa 2 (raro): el exportador de Excel recorría celda por celda: el título combinado
  A1:E5 salía 25 veces, anchos iguales, sin estilos, fórmulas vacías. Nuevo
  `sheet-layout.ts` (modelo de hoja: merges, anchos/altos, estilos, bordes, formatos de
  número, fórmulas con `fast-formula-parser`, fórmulas compartidas trasladadas, imágenes
  ancladas) + `excel-pdf.service.ts` reescrito (ajuste a lo ancho, apaisado si hace falta,
  encoger antes de cortar, paginación por filas). `scripts/render-sheet-samples.ts`.
- Causa 3: Cursor había enganchado ese servicio de marca al PDF de checklists **encima** de
  la primera página que ya tenía logo y título: salía texto plano, pie a media página y
  «BORRADOR» gigante. Restaurado `newPage(cur, true)`; el folio de Cursor se imprime en
  el pie; la marca de agua de borrador queda tenue (9 %).
- Pruebas: `sheet-layout.spec.ts` (con los libros base del cliente) y
  `excel-pdf.service.spec.ts` (sin hoja en blanco, conteo de páginas). Jest API en verde.
- Revisado a ojo: pendones (1 página, título una vez, totales), corrida (apaisada,
  moneda, banda negra con texto blanco, logo), campaña (2 páginas), checklist Hospedaje.
- **Desplegado `88ec1c3` a producción 27-09 14:24** (bundle + `update.sh --no-pull`,
  respaldo automático del deploy). api y web sanos; el Excel real de pendones impreso en el
  contenedor con el exportador nuevo: 1 página, sin hoja en blanco. Adam debe volver a
  pulsar «Salir en PDF» en cada Excel para regenerar los PDF ya existentes.

## Turno claude-code (2026-09-27, 12:30): retomar tras Cursor

- Mi trabajo del 24-09 (campos de texto que crecen, Catering y Mantenimiento con campos y
  tablas en el catálogo v2, Corrida y Campaña abriendo en el editor de hoja, filtro de
  formatos retirados corregido) lo rescató Cursor en `e7d27f6` y está en `main`; Cursor
  siguió encima (PR #2, #3, #5) y lo desplegó. Verificado en producción: Catering y
  Mantenimiento ya en v2 (plantillas e instancias), `upgrade-format-templates.ts --dry`
  → «9 ya al día · 0 migrados · 11 sellados intactos». Nada que correr.
- Quitado `apps/web/e2e/_shot.spec.ts` (spec temporal de capturas que entró en el rescate).
- Regla «solo main» revisada: ya está en `~/.claude/CLAUDE.md` (regla 5), `C:\dev\CLAUDE.md`,
  `GIT-SOLO-MAIN.md` y el hook; guardada también como memoria por defecto de Claude. Se
  quitaron los restos de «un writer por worktree» en `.cursor/rules/fusion-boot.mdc`,
  `packet.ps1` y `boot-fusion.ps1`, y la sección Worktrees del EXEC-PACKET dice «no aplica».

## Turno cursor (2026-09-27)

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
