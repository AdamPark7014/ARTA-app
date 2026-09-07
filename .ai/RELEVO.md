# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Boletera profesional + zonas editables por venue.**

1. `TicketZonesEditor`: renombrar zonas, agregar/quitar, reordenar (↑↓).
2. Presets de arranque: Metal/VIP, Teatro, Estadio, Una sola zona, En blanco.
3. Totales de aforo / vendidos / potencial en vivo.
4. Formulario de boletera en secciones; «Otra» boletera más clara; logo con
   botón Subir (no input feo).
5. Misma UX en pestaña del evento y `/ticketing`.

## A medias

1. Fórmulas al insertar/borrar filas en Excel embebido.
2. Precios campaña interno/externo sin llenar.
3. Estados oráculo solo en checklists.
4. `locked` en FinanceRun; EventDocument sin revisiones.
5. Auditoría incompleta fuera de OC/checklists.
6. Migraciones acumuladas en Hetzner (si aún no corrieron).

## Siguiente paso

1. Smoke boletera: preset teatro → renombrar zona → guardar → editar.
2. Smoke OC Otro + efectivo/transferencia.
3. Deploy si falta en el entorno donde se prueba.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
