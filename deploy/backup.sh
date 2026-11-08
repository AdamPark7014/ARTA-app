#!/usr/bin/env bash
# Respaldo completo de ARTA: base de datos + archivos subidos (volumen de /app/uploads).
#
#   bash deploy/backup.sh            # respaldo ahora
#   bash deploy/backup.sh --list     # lista respaldos locales
#
# Lo instala deploy/install-cron.sh para correr cada noche. Variables (en deploy/.env.arta):
#   ARTA_BACKUP_DIR        carpeta local                     (default /root/arta-backups)
#   ARTA_BACKUP_DAYS       días de respaldos diarios a guardar (default 14)
#   ARTA_BACKUP_REMOTE     destino rclone fuera del servidor, p. ej. "b2:arta-respaldos" o
#                          "gdrive:ARTA/respaldos". Vacío = solo local (NO protege si se pierde el VPS).
#   ARTA_BACKUP_REMOTE_DAYS días a guardar en el remoto     (default 60)
#   ALERT_WEBHOOK_URL      si falla, avisa ahí (ver deploy/notify.sh)
#
# Restaurar: ver deploy/OPERACION.md («Restaurar un respaldo»).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.arta.yml"
ENV_FILE="$SCRIPT_DIR/.env.arta"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta $ENV_FILE"
  exit 1
fi
# Lee solo las claves que usa este script (el .env.arta tiene valores con espacios que no se
# pueden "source"-ar con seguridad).
env_get() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}
POSTGRES_USER="$(env_get POSTGRES_USER)"
POSTGRES_DB="$(env_get POSTGRES_DB)"
ARTA_BACKUP_DIR="${ARTA_BACKUP_DIR:-$(env_get ARTA_BACKUP_DIR)}"
ARTA_BACKUP_DAYS="${ARTA_BACKUP_DAYS:-$(env_get ARTA_BACKUP_DAYS)}"
ARTA_BACKUP_REMOTE="${ARTA_BACKUP_REMOTE:-$(env_get ARTA_BACKUP_REMOTE)}"
ARTA_BACKUP_REMOTE_DAYS="${ARTA_BACKUP_REMOTE_DAYS:-$(env_get ARTA_BACKUP_REMOTE_DAYS)}"

BACKUP_DIR="${ARTA_BACKUP_DIR:-/root/arta-backups}"
DAILY_DIR="$BACKUP_DIR/diarios"
KEEP_DAYS="${ARTA_BACKUP_DAYS:-14}"
REMOTE="${ARTA_BACKUP_REMOTE:-}"
REMOTE_DAYS="${ARTA_BACKUP_REMOTE_DAYS:-60}"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

on_error() {
  local line="$1"
  echo "Respaldo FALLÓ (línea $line)" >&2
  bash "$SCRIPT_DIR/notify.sh" "ARTA: el respaldo nocturno falló en $(hostname) (línea $line). Revisa /var/log/arta-backup.log" || true
}
trap 'on_error $LINENO' ERR

if [[ "${1:-}" == "--list" ]]; then
  ls -lh "$DAILY_DIR" 2>/dev/null || echo "(sin respaldos diarios)"
  exit 0
fi

mkdir -p "$DAILY_DIR"
STAMP="$(date +%Y%m%d-%H%M)"
DB_FILE="$DAILY_DIR/${STAMP}-db.sql.gz"
UP_FILE="$DAILY_DIR/${STAMP}-uploads.tar.gz"

# Necesita espacio: no llenar el disco con el respaldo (a 90 % se cae Postgres).
USED_PCT="$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ "${USED_PCT:-0}" -ge 85 ]]; then
  echo "Disco al ${USED_PCT}% — no respaldo localmente para no tumbar la BD."
  false
fi

echo "[$(date -Is)] BD → $DB_FILE"
compose exec -T db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl | gzip -c >"$DB_FILE.part"
# Un dump vacío o truncado no cuenta como respaldo.
gzip -t "$DB_FILE.part"
if [[ "$(gzip -dc "$DB_FILE.part" | head -c 200000 | grep -c 'CREATE TABLE' || true)" -eq 0 ]]; then
  echo "El dump no trae tablas"
  false
fi
mv "$DB_FILE.part" "$DB_FILE"

echo "[$(date -Is)] Archivos → $UP_FILE"
compose exec -T api tar -C /app/uploads -czf - . >"$UP_FILE.part"
gzip -t "$UP_FILE.part"
mv "$UP_FILE.part" "$UP_FILE"

ls -lh "$DB_FILE" "$UP_FILE"

# Rotación local
find "$DAILY_DIR" -type f -name '*.gz' -mtime +"$KEEP_DAYS" -delete
find "$DAILY_DIR" -type f -name '*.part' -mmin +120 -delete

# Copia fuera del servidor
if [[ -n "$REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "ARTA_BACKUP_REMOTE está puesto pero rclone no está instalado (curl https://rclone.org/install.sh | sudo bash)"
    false
  fi
  echo "[$(date -Is)] Subiendo a $REMOTE"
  rclone copy "$DB_FILE" "$REMOTE/diarios/" --retries 3
  rclone copy "$UP_FILE" "$REMOTE/diarios/" --retries 3
  rclone delete "$REMOTE/diarios/" --min-age "${REMOTE_DAYS}d" || true
else
  echo "AVISO: sin ARTA_BACKUP_REMOTE, los respaldos solo viven en este servidor."
fi

date -Is >"$BACKUP_DIR/.ultimo-respaldo-ok"
echo "[$(date -Is)] Respaldo OK"
