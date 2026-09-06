# Aislamiento de proyectos en el VPS

## Regla

- **Infra compartida** (Traefik, red `proxy`, certificados) vive en `/opt/…`, **fuera** de `/var/www/<proyecto>/`.
- Cada app solo toca **sus** contenedores (compose project propio: `arta`, `nexara`, `agora`…).
- Un deploy de A **no puede** borrar rutas, volúmenes ni contenedores de B.

## Traefik

| Qué | Dónde |
|-----|--------|
| Contenedor | `/opt/traefik/` (compose project `traefik`) |
| Rutas activas | `/opt/traefik/config/*.yml` |
| Instalar una ruta | `bash /opt/traefik/bin/install-route.sh deploy/traefik/arta.yml` |
| Resync todas | `bash /opt/traefik/bin/sync-all-routes.sh` |

Fuente de ARTA: `deploy/traefik/arta.yml` → se copia a `/opt/traefik/config/arta.yml` en cada `update.sh` / cron.

**Prohibido:** copiar `arta.yml` dentro de `nexara-app/deploy/traefik/`.

## Docker

- Red externa `proxy`: solo para que Traefik hable con cada `*-web` / `*-api`.
- Red interna por proyecto (`arta_internal`, etc.): DB y servicios privados.
- `--remove-orphans` solo limpia huérfanos del **mismo** compose project.
