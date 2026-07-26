# Enterprise iteration W10

## Objetivo
Adapter boletera **live** endurecido: sin fallback silencioso a stub (corrupción de `sold`), retries, auth token, errores por setup en JobRun.

## Entregado
- `LiveHttpTicketingProvider` separado de stub
- `TICKETING_SYNC_MODE=live` → live only; falla con error explícito
- `TICKETING_SYNC_TOKEN` → Bearer opcional
- 3 intentos con backoff; normaliza zonas (sold ≤ aforo)
- Sync por setup: fallos parciales no abortan todo el batch
- Tests de provider

## Env
```
TICKETING_SYNC_MODE=stub|live
TICKETING_SYNC_URL=https://boletera.example/sync
TICKETING_SYNC_TOKEN=...
TICKETING_STUB_OCCUPANCY=0.42
```

## Contrato HTTP esperado
`POST TICKETING_SYNC_URL`
```json
{ "provider": "arema", "event": "Nombre", "eventId": "...", "zones": [{ "zona", "aforo", "precio", "sold" }] }
```
Respuesta: `{ "zones": [{ "zona", "aforo", "precio", "sold" }] }`

## Gap restante
- Observabilidad (Sentry / OTel)
- Tax Stripe registrations (si aplica)
- Coverage e2e ampliada (billing webhook mock)
