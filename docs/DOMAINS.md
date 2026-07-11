# Dominios y SSO ARTA

## Hosts

| Host | Entidad | Uso |
|------|---------|-----|
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
- Certs: Let's Encrypt vía Traefik (`certResolver: letsencrypt`). DNS A debe apuntar a `5.78.215.109` (DNS only o proxied con SSL Full).

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
