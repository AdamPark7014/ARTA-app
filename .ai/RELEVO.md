# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

Quitado el banner falso de «Sync boletera en modo demo / TICKETING_SYNC_*»
en la pestaña de boletera del evento. Esa integración no está en uso y no
debía verse.

## A medias

1. Fórmulas al insertar/borrar filas en Excel embebido.
2. Precios campaña interno/externo sin llenar.
3. Estados oráculo solo en checklists.
4. `locked` en FinanceRun; EventDocument sin revisiones.
5. Auditoría incompleta fuera de OC/checklists.

## Siguiente paso

Deploy de este commit si se prueba en producción.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
