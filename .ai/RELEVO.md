# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Hubs de archivos por sección: más claros y profesionales (copy + UI).**

1. **`SectionFileCreate`**: iconos por tono (Excel/PDF/Word/Subir), etiqueta «Qué pasa después», énfasis primary/secondary, modo `compact` / `hideHint`.
2. **Campaña / Corrida**: con archivos existentes las tarjetas de crear quedan compactas; badges «Copia de trabajo» vs «PDF oficial» (`(salida).pdf`); acciones «Editar aquí» / «Ver PDF» / «Abrir PDF» (sin «Descargar» en xlsx). Tabla de conceptos intacta.
3. **Checklists · Archivos**: empty state más amable + create cards con after-copy; «Ver PDF» en adjuntos.
4. **Documentos**: blurb del modelo (entra Word/Excel → edita embebido → sale PDF); grupos con contador; badges de rol; «Editar aquí» / «Ver PDF».
5. **Helpers** en `file-modules.ts`: `isSalidaPdf`, `isWorkSheet`, `fileRoleLabel`.
6. **SCSS**: compact cards, after microcopy, iconos, `file-section-group__count`, `file-card__badges`.

Handlers/props existentes preservados (solo UX/copy/visual).

## A medias

Nada de este alcance.

## Siguiente paso

1. Hard-refresh de un evento: revisar Campaña, Corrida, Checklists (adjuntos) y Documentos.
2. Confirmar badges cuando haya un `(salida).pdf` generado desde SheetEditor/DocEditor.
3. Deploy producto ARTA cuando Adam lo pida.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña (tabla precio interno/externo): no romper al tocar Excel.
