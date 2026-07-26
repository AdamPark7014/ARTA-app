# Enterprise transformation — Iteration W1

## Cambios realizados
- Auditoría CTO completa (canvas interactivo).
- Módulo `analytics`: overview, finance, purchase-orders, ops, users.
- Módulo `automations`: scan de riesgo/aging en boot + `POST /automations/scan`.
- Dashboard → centro de comando con KPIs, alertas, riesgo, margen, tendencias.
- Ops indexes (hospitality…pendones) → workspace con KPIs/riesgo (sin N+1).
- Finanzas / OC / Eventos / Usuarios → control towers con filtros e inteligencia.
- Seed demo portfolio idempotente (`[SEED_DEMO]`).

## Justificación técnica
Los índices hacían N+1 por evento. La inteligencia vivía solo en el cliente sumando listas.
Se centralizó en el API (single query path) para escala y una sola fuente de verdad.

## Beneficio de negocio
Dirección responde en segundos: ¿qué show está en riesgo?, ¿cuánto cash sale?, ¿quién no entra?, ¿qué disciplina atrasa firmas?

## Escalabilidad
Agregaciones server-side; ops indexes dejan de multiplicar requests.

## UX
De tablas vacías / counts a decision surfaces con alertas y drill-down.

## Rendimiento
Eliminado fetch N+1 en módulos ops/finance/OC (rutas de analytics).

## Mantenibilidad
Servicio de analytics reutilizable; UI charts livianos sin dependencia nueva.

## Riesgos mitigados
- Sobreventa de módulos thin como producto.
- Seed vacío que impedía demos comerciales.
- Ceguera operativa (sin alertas).

## Próximas prioridades (W2+)
1. Descomponer Event Detail god-page en tabs/componentes.
2. Jobs reales (`@nestjs/schedule` / cola) + notificaciones.
3. Ticketing sell-through a partir de `zonesJson`.
4. OpenAPI cableado + packages compartidos RBAC.
5. Camino multi-org (tenancy) sin romper dual-entity actual.
6. Mobile ops shell (nav colapsable).
