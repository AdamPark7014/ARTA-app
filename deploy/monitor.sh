#!/usr/bin/env bash
# Vigilancia básica de producción (cron cada 5 min, lo instala deploy/install-cron.sh):
#   - API lista (/ready: proceso + BD) y web respondiendo, vistos desde fuera (HTTPS por Traefik).
#   - Disco: aviso a ARTA_DISK_WARN % (default 80) y limpieza de caché de Docker a ARTA_DISK_PRUNE % (default 85).
#     A 90 % Postgres se cae.
#   - Respaldo nocturno: aviso si el último respaldo OK tiene más de 36 h.
# Solo avisa cuando cambia el estado (cae / se recupera), no cada 5 minutos.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.arta"
# Lee solo las claves que usa este script (el .env.arta tiene valores con espacios que no se
# pueden "source"-ar con seguridad).
env_get() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}
for k in NEXT_PUBLIC_ARTA_HOST ARTA_DISK_WARN ARTA_DISK_PRUNE ARTA_BACKUP_DIR ARTA_MONITOR_STATE; do
  [[ -z "${!k:-}" ]] && printf -v "$k" '%s' "$(env_get "$k")"
done

STATE_DIR="${ARTA_MONITOR_STATE:-/var/lib/arta-monitor}"
mkdir -p "$STATE_DIR"
HOST="${NEXT_PUBLIC_ARTA_HOST:-arta.artaproducciones.com}"
WARN="${ARTA_DISK_WARN:-80}"
PRUNE="${ARTA_DISK_PRUNE:-85}"
BACKUP_DIR="${ARTA_BACKUP_DIR:-/root/arta-backups}"

# check <nombre> <ok:0|1> <mensaje si falla> <mensaje al recuperarse> [fallas antes de avisar]
check() {
  local name="$1" ok="$2" bad="$3" good="$4" need="${5:-2}"
  local file="$STATE_DIR/$name.down"
  if [[ "$ok" == 1 ]]; then
    if [[ -f "$file" ]]; then
      rm -f "$file"
      bash "$SCRIPT_DIR/notify.sh" "✅ $good"
    fi
  else
    # API/web: dos fallas seguidas antes de avisar (evita falsos positivos por un despliegue).
    local n=0
    [[ -f "$file.count" ]] && n="$(cat "$file.count")"
    n=$((n + 1)); echo "$n" >"$file.count"
    if [[ "$n" -ge "$need" && ! -f "$file" ]]; then
      touch "$file"
      bash "$SCRIPT_DIR/notify.sh" "🚨 $bad"
    fi
    return
  fi
  rm -f "$file.count"
}

api_ok=0
curl -fsS -m 15 "https://$HOST/api/ready" >/dev/null 2>&1 && api_ok=1
check api "$api_ok" "ARTA: la API no responde o no llega a la BD (https://$HOST/api/ready)" "ARTA: la API volvió"

web_ok=0
curl -fsS -m 20 -o /dev/null "https://$HOST/login" >/dev/null 2>&1 && web_ok=1
check web "$web_ok" "ARTA: el panel web no responde (https://$HOST/login)" "ARTA: el panel web volvió"

used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
used_docker="$(df -P "$docker_root" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
[[ -n "$used_docker" && "$used_docker" -gt "$used" ]] && used="$used_docker"
if [[ "$used" -ge "$PRUNE" ]]; then
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
fi
disk_ok=1
[[ "$used" -ge "$WARN" ]] && disk_ok=0
check disk "$disk_ok" "ARTA: disco al ${used}% en $(hostname). A 90 % se cae la BD: libera espacio (docker system df)." "ARTA: disco de vuelta a ${used}%" 1

backup_ok=1
stamp_file="$BACKUP_DIR/.ultimo-respaldo-ok"
if [[ -f "$stamp_file" ]]; then
  age=$(( $(date +%s) - $(stat -c %Y "$stamp_file") ))
  [[ "$age" -gt $((36 * 3600)) ]] && backup_ok=0
elif [[ -f /etc/cron.d/arta-ops ]] && [[ $(( $(date +%s) - $(stat -c %Y /etc/cron.d/arta-ops) )) -gt $((36 * 3600)) ]]; then
  backup_ok=0  # cron instalado hace más de 36 h y nunca terminó un respaldo
fi
check backup "$backup_ok" "ARTA: no hay respaldo exitoso en más de 36 h (ver /var/log/arta-backup.log)" "ARTA: respaldos al día otra vez" 1
exit 0
