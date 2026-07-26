# Enterprise iteration W6

## Objetivo
Subir de ~78 hacia ~88: CSRF/cookie-only, webhooks multi-tenant, cola durable (Postgres), sync boletera, risk workspace y planes de org.

## Entregado
- **CSRF** double-submit (`arta_csrf` + `X-CSRF-Token`) en mutaciones autenticadas
- Login/handoff **sin JWT en body** (solo cookies HttpOnly)
- `WebhookEndpoint.organizationId` + list/create/deliveries scoped + retry fallidos
- **JobsService** cada 5 min: flush outbox, requeue failed emails, retry JobRun, webhook retries
- **Ticketing sync**: provider Arema stub / `TICKETING_SYNC_URL` live · cron 6h · `POST /ticketing/sync`
- UI `/risk` (risk workspace cruzado)
- Org **plan** patch TRIAL | OPS | ENTERPRISE
- Studio KPIs de salud CMS

## Env
```
TICKETING_SYNC_MODE=stub|live
TICKETING_STUB_OCCUPANCY=0.42
TICKETING_SYNC_URL=https://...
SMTP_HOST=...
```

## Gap → 100
- ~~Invites / onboarding~~ → entregado (API + UI accept + seat limits)
- Stripe billing self-serve
- Adapter boletera de producción
- Tenant isolation fuera del Event spine → **W7**
