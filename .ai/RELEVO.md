# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-07
- **Rama:** main

## Hecho en este turno

**Convenios / patrocinios a nivel profesional.**

1. Schema: tier, status, contacto estructurado, benefits, deliverables,
   paymentTerms, vigencia (`20260907180000_sponsor_convenio_fields`).
2. Formulario por secciones (marca, aportación, contacto, alcance).
3. Generadores: Excel convenio (4 hojas), PDF convenio, Excel portafolio del
   evento — se suben como `module=sponsors`.
4. Subir convenio firmado (PDF/Excel/Word).
5. Documentos agrupa «Convenios y patrocinios».

## A medias

1. Fórmulas al insertar/borrar filas en Excel embebido.
2. Precios campaña interno/externo sin llenar.
3. Estados oráculo solo en checklists.
4. `locked` en FinanceRun; EventDocument sin revisiones.
5. Auditoría incompleta fuera de OC/checklists.
6. Editor embebido de Excel/PDF de patrocinio (hoy Abrir / Documentos).

## Siguiente paso

1. Deploy + migrate `sponsor_convenio_fields`.
2. Smoke: crear convenio Oro → Excel → PDF → subir firmado.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
- Conceptos de campaña: no romper al tocar Excel.
