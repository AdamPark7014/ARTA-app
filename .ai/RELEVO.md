# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**Feedback Arturo (2ª ronda) — Excel multi-hoja, checklists, tareas:**

1. **Corrida + Campaña Excel:** SheetEditor con pestañas multi-hoja (+ Hoja / Renombrar), flush al cambiar de hoja, descarga .xlsx completo. Plantilla corrida: Resumen / Ingresos / Egresos / Notas. Campaña: Campaña / Medios / Notas. variant `finance`.
2. **Checklists:** modo por defecto = Formulario (claro). «Sobre el PDF» opcional; overlays semitransparentes, checks más chicos, sin `max-height: 70vh` que cortaba el PDF.
3. **Tareas:** tabs Mis tareas / Que pedí / Todas las tareas. `seenAt` en TaskAssignment (abrir Mis tareas = visto). Badge Sin abrir / Vio · sin avance. `convenios` (Marisol/Leida) ven Todas. Migración `20260831220000_task_seen_at`.

## A medias

Nada.

## Siguiente paso

1. Deploy + smoke: Corrida «Nueva hoja» (4 pestañas), checklist formulario, Tareas seguimiento.
2. Que Arturo hard-refresh.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
