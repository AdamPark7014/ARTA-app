# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-06
- **Rama:** main

## Hecho en este turno

**Aislamiento de plataforma: proyectos no se pisan entre sí.**

1. **Principio aplicado en el VPS:** Traefik y rutas viven en `/opt/traefik/` (fuera de `/var/www/*`). Cada app solo instala **su** YAML; nada borra el de otra.
2. **Toolkit plataforma:**
   - `/opt/traefik/bin/install-route.sh` — instala un archivo (atómico, sin borrar vecinos)
   - `/opt/traefik/bin/sync-all-routes.sh` — junta `/var/www/*/deploy/traefik/*.yml` + `/opt/traefik/platform/`
   - `/opt/traefik/platform/` — última copia buena de rutas de plataforma (nexara.yml, tls, …)
   - `/opt/traefik/README.md` — reglas de oro
3. **Cron** cada minuto → `sync-all-routes.sh`.
4. **Hook Nexara** ya llama sync sin borrar guests; README en su carpeta traefik.
5. **ARTA:** `ensure-traefik-route.sh` usa el instalador de plataforma; doc `deploy/ISOLATION.md`.
6. Probado: wipe `arta.yml` → sync restaura; `school.yml` intacto; HTTP 200.

Compose projects ya estaban separados (`arta`, `nexara`, `agora`…): `--remove-orphans` no cruza proyectos.

## A medias

Nada. Pendientes de producto Claude (Fases 0–3 deploy) aparte.

## Siguiente paso

1. Hard-refresh panel ARTA.
2. Al deployar Nexara/otros, confirmar que ARTA no cae.
3. Deploy producto ARTA cuando Adam lo pida.

## No tocar

- `docs/ACCESS.md`, `.env.arta`.
- No meter YAML huésped en `nexara-app/deploy/traefik/`.
- No volver a symlinkar `/opt/traefik/config` → un repo de app.
