#!/usr/bin/env bash
# Restore previous Arta images (:prev) and optionally a Postgres dump.
# Usage:
#   bash deploy/rollback.sh
#   bash deploy/rollback.sh --dump 20260830-1430.sql.gz
#   bash deploy/rollback.sh --list
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.arta.yml"
ENV_FILE="$SCRIPT_DIR/.env.arta"
BACKUP_DIR="${ARTA_BACKUP_DIR:-/root/arta-backups}"

DUMP_NAME=""
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) LIST_ONLY=true ;;
    --dump)
      shift
      DUMP_NAME="${1:-}"
      if [[ -z "$DUMP_NAME" ]]; then
        echo "Missing value for --dump"
        exit 1
      fi
      ;;
    --dump=*)
      DUMP_NAME="${1#--dump=}"
      ;;
    -h|--help)
      echo "Usage: bash deploy/rollback.sh [--dump YYYYMMDD-HHMM.sql.gz] [--list]"
      echo "  Restores arta-web:prev / arta-api:prev (tagged by update.sh) and optionally a dump."
      exit 0
      ;;
    *)
      echo "Unknown arg: $1"
      exit 1
      ;;
  esac
  shift
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ "$LIST_ONLY" == true ]]; then
  echo "Backups in $BACKUP_DIR:"
  ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "(none)"
  echo
  echo "Previous image tags:"
  docker image ls --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' \
    | grep -E 'arta-(web|api):prev' || echo "(no :prev tags — run update.sh once first)"
  exit 0
fi

cd "$SCRIPT_DIR"

restore_image() {
  local prev="$1"
  local latest="$2"
  if ! docker image inspect "$prev" >/dev/null 2>&1; then
    echo "Missing $prev — cannot roll back that service."
    return 1
  fi
  echo "Restoring $prev → $latest"
  docker tag "$prev" "$latest"
}

WEB_OK=0
API_OK=0
restore_image "arta-web:prev" "arta-web:latest" && WEB_OK=1 || true
restore_image "arta-api:prev" "arta-api:latest" && API_OK=1 || true

if [[ "$WEB_OK" -eq 0 && "$API_OK" -eq 0 ]]; then
  echo "No :prev images found. Aborting."
  echo "Hint: update.sh tags running images before build. Check: bash deploy/rollback.sh --list"
  exit 1
fi

echo "Recreating services from restored tags..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-build --force-recreate web api

if [[ -n "$DUMP_NAME" ]]; then
  DUMP_PATH="$BACKUP_DIR/$DUMP_NAME"
  if [[ ! -f "$DUMP_PATH" ]]; then
    if [[ -f "$DUMP_NAME" ]]; then
      DUMP_PATH="$DUMP_NAME"
    else
      echo "Dump not found: $DUMP_PATH"
      exit 1
    fi
  fi
  echo "Restoring Postgres from $DUMP_PATH (destructive)..."
  sleep 3
  gunzip -c "$DUMP_PATH" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
  echo "DB restore finished."
fi

echo "Rollback complete."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
echo "Smoke: curl -sI https://arta.artaproducciones.com/login | head -n1"
