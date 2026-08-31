# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**Feedback Arturo Taja — corrida + capas blancas en formatos:**

1. **Páginas en blanco encima de checklists/boletera:** ExpandBox ya no abre a pantalla completa por defecto (`FileViewer`, `ChecklistPdfEditor`, `PdfEditor`, `SheetEditor`, `DocEditor`). Vista previa PDF del checklist solo con «Ver PDF» (no monta iframe encima del formulario).
2. **Corrida financiera:** Excel embebido editable como campaña — «Nueva hoja de corrida» / «Subir mi Excel» (`module=finance`, `SheetEditor`). Tabla HTML queda como resumen opcional oculto. Create event ya no siembra conceptos inventados.
3. Plantilla `finance-sheet-template.ts`.

## A medias

Nada. Pendiente imagen que Arturo mencionó (no llegó adjunta en el chat).

## Siguiente paso

1. Deploy smoke: abrir checklist boletera (sin fullscreen blanco) + Corrida → Nueva hoja / Subir Excel.
2. Si Adam adjunta la imagen de Arturo, atender ese hallazgo.
3. Push origin cuando quieras.

## No tocar

- `docs/ACCESS.md`, `.env.arta`, e2e API BD.
