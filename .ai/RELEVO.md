# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Formulario de OC más profesional + «Otro» se escribe.**

1. Rubro **Otro (especificar)** abre un campo de texto (ej. Escenografía,
   seguridad). Se guarda el nombre escrito, no la clave `otro`.
2. Forma de pago **Otro (especificar)** igual: cheque, depósito, etc. La nota
   va al inicio de `description` (`Forma de pago: …`) para no exigir migración.
3. Formulario en secciones (datos / partidas), placeholders en castellano de
   producción, columnas «Cantidad» / «Precio unitario», validación si falta
   especificar Otro.
4. Torre y tarjetas muestran el rubro/pago legible (`poRubroLabel` /
   `poPaymentLabel`).

## A medias

Igual que dejó Claude:

1. Fórmulas al insertar/borrar filas en Excel embebido.
2. Precios campaña interno/externo sin llenar (falta lista de Arta).
3. Estados oráculo solo en checklists.
4. `locked` sigue en FinanceRun; EventDocument sin revisiones.
5. Auditoría incompleta en campaigns/docs/folders/etc.
6. **Deploy** de este commit + migraciones pendientes en Hetzner (Claude dejó
   5 migraciones + este turno).

## Siguiente paso

1. Deploy + `prisma migrate deploy` en Hetzner.
2. Smoke OC: crear con rubro Otro escrito; pago Otro escrito; efectivo sin
   comprobante; transferencia con comprobante.
3. Backfill checklist progress (avisar al equipo).
4. Smoke Excel real de Arta.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña (tabla precio interno/externo): no romper al tocar Excel.
