# Enterprise iteration W8

## Objetivo
Cerrar auth **cookie-only** de punta a punta: sin JWT en `localStorage`, sin `Authorization: Bearer` para staff, sin handoff legacy con JWT en query. Rotación de sesión al consumir handoff.

## Entregado

### API
- `JwtStrategy` ya era cookie-only (`arta_access`); tests confirman que Bearer se ignora
- CSRF: sesión = cookie únicamente (Bearer ya no dispara CSRF “como sesión”)
- `POST /auth/handoff`: exige cookie; ya no acepta Bearer
- `consumeHandoff`: **re-emite** sesión HttpOnly (rotation) en lugar de reusar JWT guardado
- `TotpAccessGuard` / `TotpEnrollGuard`: cookie o `enrollToken` en body — sin Bearer staff
- Swagger: solo `CookieAuth(arta_access)`

### Web
- `api.ts`: credentials + CSRF; purge `arta_token`; **nunca** envía Bearer
- `user-context`: hint de sesión = `arta_session` cookie
- Handoff: solo código one-time hex; payload base64 legacy rechazado
- `AppShell` switch entidad: solo `createSecureHandoffUrl`

### Tests
- `csrf.middleware.spec.ts`
- `jwt.strategy.spec.ts`

## Gap restante
- Stripe billing self-serve
- Adapter boletera producción
- Observabilidad (Sentry / OTel)
- Vendor portal sigue con Bearer propio (PIN session) — fuera de staff auth
