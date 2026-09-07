# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**SheetEditor UX: jerarquía clara, barra de fórmulas y estados amables.**

1. Toolbar sticky (`sheet-chrome`) con CTA primario **Salir en PDF**, secundario **Guardar**, terciario historial.
2. Barra de fórmulas (`sheet-fxbar`) con ref de celda + edición del valor/fórmula.
3. Selección más visible (anillo verde, columna/fila resaltadas); Esc limpia selección; Ctrl+S intacto.
4. Estados loading/error/vacío en español; tip contextual campaña/finanzas; franja de éxito PDF con enlace; historial enmarcado.
5. Chrome Excel más compacto (letras de columna, nº de fila). `fileId` sigue opcional. Sin «Descargar .xlsx».

Archivos: `SheetEditor.tsx`, `globals.scss` (clases `sheet-*`).

## A medias

Nada de este turno. El rescate previo (`b58122a`) trae WIP de documentos/PDF/event panels — no tocado aquí salvo estilos `sheet-*` compartidos.

## Siguiente paso

1. Probar SheetEditor en evento (campaña/finanzas) y en carpetas sin `fileId`.
2. Continuar WIP rescatado de documentos/PDF si Adam lo pide.
3. Hard-refresh panel ARTA al desplegar.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- No reintroducir descarga .xlsx como acción primaria en el editor.
