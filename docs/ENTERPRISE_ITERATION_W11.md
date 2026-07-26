# Enterprise iteration W11

## Objetivo
Observabilidad operativa mínima vendible: health/readiness, logs JSON + requestId, Sentry opcional, tests del webhook Stripe sin red.

## Entregado

### Health
- `GET /health` · `GET /healthz` — liveness
- `GET /ready` — Postgres `SELECT 1` + flags Stripe/Sentry/ticketing
- CSRF + throttle skip en probes
- Docker Compose `api` healthcheck → `/health`

### Logging
- `JsonLogger` (`LOG_FORMAT=json` o `NODE_ENV=production`)
- `RequestIdMiddleware` — `x-request-id` in/out + access log JSON (`LOG_HTTP=0` para apagar)

### Sentry
- API: `@sentry/node` si `SENTRY_DSN`
- Web: `error.tsx` / `global-error.tsx` + `reportClientError` (DSN opcional `NEXT_PUBLIC_SENTRY_DSN`)

### Billing tests
- `processStripeEvent` público
- Unit: subscription.updated → ENTERPRISE, deleted → TRIAL, payment_failed → past_due, checkout sin sub

### Env
```
LOG_FORMAT=json
LOG_HTTP=1
SENTRY_DSN=
SENTRY_ENV=production
SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_DSN=
```

## Gap restante
- OpenTelemetry traces (si SRE lo pide)
- Stripe Tax registrations (solo si cobras con VAT/IVA)
- Dashboard métricas Prometheus (opcional)
