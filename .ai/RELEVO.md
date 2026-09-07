# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Checklist: campos ampliables.**

1. Sobre el PDF: clic en una caja de texto abre un editor grande (textarea /
   fecha / número) con título del campo; Esc o «Listo» cierra. El valor se
   guarda al instante; Guardar regenera el PDF.
2. En formulario: los campos de texto son textarea que crecen al escribir.
3. Hint actualizado: «Haz clic para ampliarla».

## A medias

1. Fórmulas al insertar/borrar filas en Excel embebido.
2. Precios campaña interno/externo sin llenar.
3. Estados oráculo solo en checklists.
4. `locked` en FinanceRun; EventDocument sin revisiones.
5. Auditoría incompleta fuera de OC/checklists.
6. Editor embebido de Excel/PDF de patrocinio (hoy Abrir / Documentos).

## Siguiente paso

Deploy + smoke: Sobre el PDF → clic en «Show / concierto» → escribir largo →
Listo → Guardar.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
