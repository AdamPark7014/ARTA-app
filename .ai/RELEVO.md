# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** main

## Hecho en este turno

**ARTA ya no depende del árbol git de Nexara para Traefik (fin del 404 al deployar otros proyectos):**

1. **Causa raíz:** Traefik montaba `/opt/traefik/config` → symlink a `/var/www/nexara-app/deploy/traefik`. Los YAML huéspedes (`arta.yml`, `school.yml`) vivían *dentro* del repo Nexara (untracked). Un pull/clean/rsync de Nexara los borraba → 404 negro de Traefik aunque `arta-web` estuviera healthy.
2. **Fix estructural:** `/opt/traefik/config` es ahora un **directorio real** con copias. ARTA se instala en `/opt/traefik/config/arta.yml` desde `/var/www/arta-app/deploy/traefik/arta.yml`.
3. **Cron cada minuto** (`/etc/cron.d/traefik-guest-routes`) con `bash …` (no depende de `+x`): restaura arta/school/udlagora + nexara-owned.
4. **Hook en** `/var/www/nexara-app/deploy/update.sh`: tras el deploy solo sincroniza YAML de Nexara (`sync-nexara-routes.sh`) y reasegura guests — **nunca borra** arta/school.
5. Quitados los YAML huéspedes del folder de Nexara + README de aviso.
6. Probado wipe → restore → HTTP 200 en arta/auditorio.

## A medias

Nada de este incidente. Pendientes Claude (Fases 0–3 deploy/smoke) siguen aparte.

## Siguiente paso

1. Hard-refresh Arturo en `arta.artaproducciones.com`.
2. Cuando se despliegue Nexara de nuevo, confirmar que el hook corre y ARTA no cae.
3. Deploy completo de `main` ARTA (doc status etc.) cuando Adam lo pida.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No volver a copiar `arta.yml` dentro de `nexara-app/deploy/traefik/`.
