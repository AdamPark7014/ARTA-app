# Dominios y SSO ARTA

## Hosts

| Host | Entidad | Uso |
|------|---------|-----|
| `artaproducciones.com` / `www` | — | Sitio público Arta (`/` → `/p/arta`) |
| `arta.artaproducciones.com` | ARTA | Panel Arta + Studio |
| `auditorio.artaproducciones.com` | EXPLANADA | Panel Auditorio Arema |
| `localhost:3000` | (switch in-app) | Dev sin subdominio |

Sitio público: `/p/arta` (sin gate de sesión).

## Producción (Hetzner + Traefik)

```bash
# En el server
cd /var/www/arta-app
cp deploy/.env.arta.example deploy/.env.arta   # editar secretos
bash deploy/update.sh --force-all
```

- Compose: [`deploy/docker-compose.arta.yml`](../deploy/docker-compose.arta.yml) (red `proxy` externa).
- Rutas TLS: [`deploy/traefik/arta.yml`](../deploy/traefik/arta.yml) → se copia a `/var/www/nexara-app/deploy/traefik/arta.yml` (config de `traefik-main`).
- **Protección:** [`deploy/ensure-traefik-route.sh`](../deploy/ensure-traefik-route.sh) restaura `arta.yml` si falta o difiere (también lo invoca `deploy/update.sh`). En el server conviene cron cada 5 min (ver abajo).
- Certs: Let's Encrypt vía Traefik (`certResolver: letsencrypt`). DNS A debe apuntar a `5.78.215.109` (DNS only o proxied con SSL Full).

### Cron en el server (recomendado)

Nexara no versiona `arta.yml` en su repo; un deploy de Nexara puede borrar el archivo copiado. Instalar:

```bash
chmod +x /var/www/arta-app/deploy/ensure-traefik-route.sh
cat >/etc/cron.d/arta-traefik-ensure <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root /var/www/arta-app/deploy/ensure-traefik-route.sh >> /var/log/arta-traefik-ensure.log 2>&1
EOF
```

Log: `/var/log/arta-traefik-ensure.log` (solo escribe cuando restaura o sincroniza).

### Aislamiento Nexara ↔ Arta

En el server comparten solo la red Docker `proxy` y el proceso Traefik (`traefik-main`). **No comparten** base de datos, volúmenes ni contenedores de app:

| Recurso | Arta | Nexara |
|---------|------|--------|
| Web/API/DB | `arta-web`, `arta-api`, `arta-db` | `nexara-web`, `nexara-api`, `nexara-db` |
| Datos | volúmenes `arta_*` | volúmenes `nexara_*` |
| Rutas TLS | `deploy/traefik/arta.yml` (copiado, no en git Nexara) | `deploy/traefik/nexara.yml` |
| Hosts | `*.artaproducciones.com` | dominios Nexara (sin overlap) |

Un deploy de Nexara **no debe** tocar contenedores Arta; el único efecto colateral observado fue borrar `arta.yml` del folder Traefik — mitigado con `ensure-traefik-route.sh` + cron. **No agregar `arta.yml` al repo Nexara** sin revisar prioridades de router.

## SSO (patrón Nexara)

1. Login setea cookie `arta_session=1` con `Domain=.artaproducciones.com` (en prod HTTPS).
2. Al cambiar Arta ↔ Auditorio en el sidebar, se navega al otro host con `?_nxt=<base64 JWT+user>`.
3. El destino consume `_nxt`, guarda el token y setea la cookie; no pide login de nuevo.
4. Middleware exige `arta_session` (o `_nxt`) en rutas de panel bajo esos subdominios.

## Prueba local (hosts)

En `C:\Windows\System32\drivers\etc\hosts` (como admin):

```
127.0.0.1 arta.artaproducciones.com
127.0.0.1 auditorio.artaproducciones.com
```

Abrir `http://arta.artaproducciones.com:3000` (cookie `Secure` off en http local).
