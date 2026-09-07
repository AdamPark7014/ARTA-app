# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**DocEditor UX: hoja tipo Word, toolbar clara y chips de bloque.**

1. Documento como **página blanca** sobre lienzo suave (`docedit-canvas` + `.docedit`).
2. Toolbar: primario **Salir en PDF**, secundario Guardar, Quién editó, Cerrar; versión + último editor siempre visibles.
3. Chips visuales de tipo de bloque (Título/Subtítulo/Párrafo/Viñeta/Separador); Enter/Backspace fluidos; hint de teclado.
4. Banner de política corto: Word → editar aquí → sale PDF. Estados ok/error/warn claros. Historial enmarcado.
5. `SectionFileCreate`: hint más corto; estilos para iconos / `after` / primary-secondary. Copy en Documentos (EventFilesPanel).

Archivos: `DocEditor.tsx`, `SectionFileCreate.tsx`, `EventFilesPanel.tsx`, `globals.scss` (`docedit-*`, `file-create-*`).

API contracts sin cambio.

## A medias

Nada de este turno.

## Siguiente paso

1. Probar DocEditor en un evento (nuevo + import .docx + Salir en PDF + Quién editó).
2. Probar SheetEditor (turno previo) en campaña/finanzas.
3. Hard-refresh panel ARTA al desplegar.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- No reintroducir descarga .xlsx como acción primaria en el editor.
