# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Checklist: llenado más eficiente (sin modal).**

1. Sobre el PDF: se escribe directo en las cajas; al enfocar crecen en sitio
   (textarea ~320×96). Tab al siguiente. Sin modal ni clic extra.
2. PDF abre a pantalla completa; al abrir un formato la lista izquierda se
   oculta (← Formatos) para usar todo el ancho.
3. Formulario rápido: sin ExpandBox de más; textareas que crecen.
4. CSS del modal muerto eliminado; e2e alineados.

## A medias

1. Fórmulas al insertar/borrar filas en Excel embebido.
2. Precios campaña interno/externo sin llenar.
3. Estados oráculo solo en checklists.
4. `locked` en FinanceRun; EventDocument sin revisiones.
5. Auditoría incompleta fuera de OC/checklists.
6. Editor embebido de Excel/PDF de patrocinio (hoy Abrir / Documentos).

## Siguiente paso

Deploy + smoke: Sobre el PDF → clic en caja → escribir largo sin modal →
Tab → Guardar.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
