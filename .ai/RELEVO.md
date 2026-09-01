# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-01
- **Rama:** main

## Hecho en este turno

**Tareas con evidencia, aprobación del solicitante e historial documentado:**

1. **Schema** — `PENDING_APPROVAL`; campos entrega/aprobación/rechazo; `TaskEvidence` + `TaskActivity`; migración `20260901120000_task_evidence_approval`.
2. **API** — `POST /tasks/:id/submit` (nota + archivos), `approve`, `reject`, `evidence`; no marcar DONE directo si hay quien apruebe; auditLog + actividades por transacción.
3. **UI** — `/tasks` y panel del evento: modal «Entregar», aprobar/rechazar en «Que pedí», historial por tarea.

## A medias

Nada (pendiente deploy + migración en prod).

## Siguiente paso

1. Deploy + `prisma migrate deploy` en Hetzner.
2. Smoke: asignar tarea → entregar con foto/nota → aprobar/rechazar → ver historial.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
