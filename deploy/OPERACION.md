# Operación de producción

Servidor: VPS compartido con Nexara, código en `/var/www/arta-app`, Traefik delante.

## Una sola vez (después de este cambio)

```bash
cd /var/www/arta-app
git pull --ff-only origin main
sudo bash deploy/install-cron.sh        # respaldo nocturno + monitor cada 5 min + ruta de Traefik
```

Luego, en `deploy/.env.arta` (ver `deploy/.env.arta.example`, sección «Operación»):

| Variable | Qué hace | Cómo conseguirla |
|---|---|---|
| `ALERT_WEBHOOK_URL` | Avisos de caída, disco y respaldos | Lo más fácil: instala la app **ntfy** en el teléfono, suscríbete a un tema difícil de adivinar (p. ej. `arta-ops-8f3k2`) y pon `https://ntfy.sh/arta-ops-8f3k2`. También sirve un webhook de Slack/Discord. |
| `ARTA_BACKUP_REMOTE` | Copia de los respaldos fuera del VPS | Instala rclone (`curl https://rclone.org/install.sh \| sudo bash`), `rclone config` con Backblaze B2 o Google Drive, y pon `remoto:carpeta`. |
| `SENTRY_DSN` | Errores de la API con detalle | sentry.io → proyecto Node.js → DSN. |

Prueba que todo funciona:

```bash
bash deploy/backup.sh          # debe terminar en «Respaldo OK»
bash deploy/notify.sh "prueba" # debe llegarte el aviso
bash deploy/monitor.sh         # sin salida = todo bien
```

## Qué corre solo

- **03:30 cada noche** `backup.sh`: dump de Postgres + tar de `/app/uploads`, verifica que no estén vacíos,
  guarda 14 días en `/root/arta-backups/diarios/` y, si hay `ARTA_BACKUP_REMOTE`, sube copia (60 días).
  Si falla, avisa. Log: `/var/log/arta-backup.log`.
- **Cada 5 min** `monitor.sh`: `/api/ready` y `/login` por HTTPS (avisa a la segunda falla seguida y al recuperarse),
  disco (avisa a 80 %, limpia caché de Docker a 85 %; a 90 % se cae Postgres) y respaldo de más de 36 h.
- **Cada 5 min** `ensure-traefik-route.sh` (por si un deploy de Nexara borra la ruta).
- Logs de contenedores con tope de 5 × 20 MB por servicio (`docker-compose.arta.yml`).

## Desplegar

`bash deploy/update.sh` — respalda la BD, limpia caché de build, **no construye si el disco queda arriba de
80 %** (`ARTA_DEPLOY_MAX_DISK`), construye, levanta y borra imágenes sin etiqueta (las `:prev` se quedan para
`rollback.sh`).

## Restaurar un respaldo

```bash
ls -lh /root/arta-backups/diarios/                     # o: rclone ls "$ARTA_BACKUP_REMOTE/diarios"
# Base de datos (DESTRUCTIVO: reemplaza la actual)
bash deploy/rollback.sh --dump diarios/AAAAMMDD-HHMM-db.sql.gz
# Archivos subidos
gunzip -c /root/arta-backups/diarios/AAAAMMDD-HHMM-uploads.tar.gz \
  | docker compose --env-file deploy/.env.arta -f deploy/docker-compose.arta.yml exec -T api tar -C /app/uploads -xzf -
```

Conviene probar una restauración completa en otra máquina una vez al trimestre.

## Archivos subidos y quién los ve

Desde nov-2026 `/uploads` exige sesión del panel (o del portal de proveedores) salvo las **fotos sueltas en la
raíz** (`/uploads/x.jpg|png|webp|gif|avif`) y las imágenes de `uploads/site/` (portada y galería), que usa el sitio público. PDF, Excel, Word, audio, video y todo lo de
subcarpetas (`chat/`, `documents/`, `testigos/`, `checklists/`…) responde 401 sin sesión. Regla en
`apps/api/src/uploads/static-access.ts`.
