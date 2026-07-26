# Enterprise iteration W7

## Objetivo
Cerrar fugas multi-tenant **fuera** del spine Event (folders, digests/outbox, automations/webhooks) y endurecer ACL de org-admin (invites / plan). Madurez multi-tenancy ~72 → ~86.

## Entregado

### SharedFolder tenant-scoped
- Columna `SharedFolder.organizationId` (+ FK / índice compuesto)
- CRUD folders filtra y valida tenant (`orgWhere` / `assertSameTenant`)
- Migration backfill → `org_arta_internal`

### Digests / jobs / outbox
- `JobRun.organizationId` + `NotificationOutbox.organizationId` (nullable, indexados)
- Creates de digest, invites y ticketing sync escriben org
- UI admin: org-admin solo ve jobs/outbox de su tenant; `super_admin` ve todos
- `POST /digests/run-daily` scoped al tenant salvo platform admin

### Automations
- Scan por organización activa (no agrega global sin scope)
- `webhooks.dispatch` **requiere** `organizationId` (sin org = no-op, no fan-out cruzado)
- Manual `POST /automations/scan` scoped al tenant del caller

### Org admin ACL
- `assertTenantAdminAccess`: solo `super_admin` cruza tenants (`dir_general` ya no)
- Crear org + cambiar plan = platform-only
- UI `/organizations`: form create + select plan ocultos salvo `super_admin`

### Tests
- Unit: `assertTenantAdminAccess` / `isPlatformAdmin`
- E2E: folders isolation, outbox leak, org ACL

## Gap restante (siguiente)
- Cookie-only residual (Bearer / localStorage)
- Stripe billing self-serve
- Adapter boletera producción
- Observabilidad (Sentry / OTel)
