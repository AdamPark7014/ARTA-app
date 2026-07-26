# Enterprise transformation — Iteration W3

## Cambios realizados
- Event Detail modularizado (~870 LOC orchestrator + paneles por tab).
- `@nestjs/schedule` cron horario + dispatch de webhooks en señales.
- Modelos Prisma: `UserSession`, `AuthHandoff`, `WebhookEndpoint`, `WebhookDelivery`.
- SSO cross-host con código one-time (ya no JWT en query por defecto).
- Sesiones activas: crear en login, listar/revocar en `/auth/sessions*`.
- OpenAPI en `/docs` (Swagger).
- Package compartido `@arta/rbac` (fuente única permisos).
- Shell móvil con hamburger / drawer.
- Página Admin Webhooks + Tasks workload KPIs.
- Canvas de auditoría recalibrado (live).

## Justificación técnica
Cerrar gaps High del audit: automatización real, auth harden, modularidad del hub,
RBAC drift, DX API (OpenAPI), UX móvil.

## Beneficio de negocio
- Alertas operativas salen hacia sistemas externos (Slack/Make/n8n vía webhook).
- Menos riesgo de fuga de JWT en URLs/referrers.
- Dirección ve sesiones y puede revocar.
- Onboarding API vía Swagger.

## Escalabilidad / mantenibilidad
Event hub decomposable; jobs desacoplados; RBAC unificado.

## Riesgos mitigados
JWT en query, cero jobs, god-page, drift RBAC, N/A mobile nav.

## Qué falta para ~80+ / vendible a N orgs (W4–W5)
1. Multi-org tenancy (Organization model + isolation).
2. HttpOnly cookie auth (salir de localStorage).
3. 2FA / device trust.
4. Sell-through boletera (API externa).
5. Email/push digests.
6. Cola durable (BullMQ) vs cron in-process.
