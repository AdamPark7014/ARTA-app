# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-31
- **Rama:** main

## Hecho en este turno

**W3 Oleada B — UI RBAC gates** (surgical):

- OC hub + torre: `canAuthorize` / `canMarkPaid` (`po.authorize` / `po.mark_paid`)
- Event hub tabs: filtra finance/campaign/ticketing/sponsors; sponsors `canEdit`; checklists/files read-only sin `checklist.edit`
- Tasks: tab Equipo solo gerencia; finance portfolio vía `userHasPermission`; ticketing/advances/vendor mutaciones gated

## A medias

Nada de este bloque UI RBAC. Siguiente oleada W3 (SEO mega / calendario) la lleva el plan padre si aplica.

## Siguiente paso

1. Continuar plan W3 (closed API ya salvado en turno previo `87ba30c`; SEO/calendario).
2. Ops Adam: redes, deploy key, GSC, 2FA (sin cambio).

## No tocar

- `docs/ACCESS.md`, `.env.arta`, e2e API BD.
