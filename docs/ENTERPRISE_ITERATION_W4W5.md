# Enterprise iteration W4–W5

## Objetivo
Subir madurez de ~68 (post W3) hacia ~80+ con camino multi-org, auth endurecida y sell-through operativo — sin inventar dominios ERP ajenos al spine Event → checklist → OC → finance → boletera.

## Entregado

### Multi-org
- Modelos `Organization`, `OrgMembership`; `User.organizationId`, `Event.organizationId`
- Tenant default `org_arta_internal`
- Helpers `tenantIdOf` / `assertSameTenant` / `orgWhere`
- UI `/organizations` + stats del tenant
- Filtros de org en: events (list/create/get), analytics, finance, purchase-orders, ticketing, vendor, digests, users create

### Auth
- Cookie HttpOnly `arta_access` + soft `arta_session`
- Login/2FA cookie-first (deja de persistir JWT en `localStorage` salvo handoff)
- TOTP: setup / enable / disable / verify-login (`/security`)

### Sell-through
- `zonesJson.sold` editable en boletera
- Analytics: `soldTotal`, `sellThroughPct`, `realizedRevenue`

### Digests / jobs
- Cron diario por organización activa
- `JobRun` + `NotificationOutbox`
- SMTP real via nodemailer si `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- UI admin `/digests`

### Vendor
- Admin UI `/vendor` para generar/desactivar PINs (portal `/v/[pinId]`)

## Env SMTP (opcional)
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=arta@example.com
```

## Gap restante → ~100
- Sync externo boletera (sold automático)
- BullMQ/Redis durable
- Billing / plans self-serve
- CSRF + eliminar Bearer residual
- `WebhookEndpoint.organizationId`
- Studio/checklists polish
