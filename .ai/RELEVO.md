# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** main

## Hecho en este turno

**Fix 404 en arta.artaproducciones.com (Traefik):**

1. Faltaba `/var/www/nexara-app/deploy/traefik/arta.yml` (probablemente limpio por deploy de Nexara). Contenedores `arta-*` seguían healthy.
2. Se restauró la ruta; `/login` vuelve a HTTP 200 en arta / auditorio / apex.
3. El cron `arta-traefik-ensure` fallaba con **Permission denied**: los `.sh` de deploy estaban en git como `100644` y `git archive` los dejaba sin `+x`. Se marcó `+x` en git y `update.sh` hace `chmod +x deploy/*.sh` antes de instalar la ruta.

## A medias

Nada de este incidente. Siguen pendientes del turno Claude (Fase 3): deploy de migraciones doc status / Excel / smoke Arturo.

## Siguiente paso

1. Deploy completo de `main` (Fases 0–3 + este fix de scripts) cuando Adam lo pida.
2. Confirmar que el cron ya escribe `restored`/`synced` en `/var/log/arta-traefik-ensure.log` sin Permission denied.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
