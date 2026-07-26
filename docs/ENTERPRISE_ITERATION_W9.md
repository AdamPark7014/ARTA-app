# Enterprise iteration W9

## Objetivo
Self-serve billing por `Organization.plan` con Stripe Checkout (subscription) + Customer Portal + webhooks. Soft caps (`plan-limits`) ya existen; ahora el plan puede cambiarse por pago, no solo por platform admin.

## Entregado

### Schema
- `Organization.stripeCustomerId` / `stripeSubscriptionId` / `stripePriceId` / `billingStatus`

### API (`/billing`)
- `GET /billing/status` — plan + estado Stripe (org-admin)
- `POST /billing/checkout` `{ plan: OPS | ENTERPRISE }` → Checkout Session `mode: subscription`
- `POST /billing/portal` → Billing Portal
- `POST /billing/webhook` — firma Stripe, raw body; CSRF exempt
- Eventos: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
- Cancelación → plan `TRIAL` + `billingStatus=canceled`

### Web
- `/organizations`: botones Suscribir Ops / Enterprise + Portal Stripe

### Env
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_OPS=price_...
STRIPE_PRICE_ENTERPRISE=price_...
WEB_ORIGIN=https://app.example.com
```

Sin esas vars, checkout responde 503 claro; platform admin sigue pudiendo PATCH plan.

## Notas Stripe
- Sin `payment_method_types` (dynamic payment methods)
- Un Product/Price por tier (OPS vs ENTERPRISE)
- Webhook local: `stripe listen --forward-to localhost:4000/billing/webhook`

## Gap restante
- Adapter boletera producción
- Observabilidad (Sentry / OTel)
- Tax registrations si se cobra en regiones con VAT/IVA
