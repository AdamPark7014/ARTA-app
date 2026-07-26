# Plan de profesionalización ARTA → nivel enterprise ops

Referencia: Linear (densidad/UX), Stripe Dashboard (métricas + drill-down), Atlassian (modularidad), spine propio (Event → checklist → OC → finance → boletera).

## Norte (~95/100)
Producto de **ops de eventos** vendible a N orgs: craft UI = function, sin inventar ERP (inventario/HR/POS).

## Fases

### A — Craft UI (esta iteración)
1. Skeleton / empty-state compartidos
2. Event hub: tab bar profesional
3. Ticketing unificado (sold + sync en panel de evento)
4. Events list: risk badges + jerarquía
5. Dashboard alert-first
6. Finance + OC tables
7. Users / Security consistency

### B — Producto comercial
- ~~Stripe billing self-serve por `Organization.plan`~~ (W9)
- ~~Adapter live boletera (`TICKETING_SYNC_URL`)~~ (W10)
- ~~Invites / onboarding org~~ (hecho)
- ~~Tenant isolation folders/digests/automations + org ACL~~ (W7)
- ~~CSRF + cookie-only staff auth~~ (W6/W8)

### C — Escala / ops
- ~~Observabilidad (health, JSON logs, Sentry opcional)~~ (W11)
- Redis/BullMQ si JobRun no basta
- OpenTelemetry / Prometheus (si SRE lo exige)
- Stripe Tax registrations (si cobras en regiones con VAT/IVA)

## Regla
Un módulo a la vez: terminar → siguiente. No CRUD nuevo fuera del spine.
