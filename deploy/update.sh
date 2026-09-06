#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.arta.yml"
ENV_FILE="$SCRIPT_DIR/.env.arta"
TRAEFIK_SRC="$SCRIPT_DIR/traefik/arta.yml"
TRAEFIK_DST="/var/www/nexara-app/deploy/traefik/arta.yml"
BACKUP_DIR="${ARTA_BACKUP_DIR:-/root/arta-backups}"
BACKUP_KEEP="${ARTA_BACKUP_KEEP:-10}"

FORCE_ALL=false
SKIP_PULL=false

for arg in "$@"; do
  case "$arg" in
    --force-all) FORCE_ALL=true ;;
    --no-pull) SKIP_PULL=true ;;
    *)
      echo "Usage: ./deploy/update.sh [--force-all] [--no-pull]"
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from deploy/.env.arta.example"
  exit 1
fi

cd "$REPO_ROOT"

if [[ "$SKIP_PULL" == false ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="${DEPLOY_BRANCH:-main}"
  echo "Pulling origin/${BRANCH}..."
  git pull --ff-only origin "$BRANCH"
fi

cd "$SCRIPT_DIR"

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

# git archive / tar often drop +x; cron needs the ensure script executable.
chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true

echo "Installing Traefik route → $TRAEFIK_DST"
bash "$SCRIPT_DIR/ensure-traefik-route.sh"

# Tag running images as :prev so rollback.sh can restore them.
WEB_IMG="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" images -q web 2>/dev/null | head -n1 || true)"
API_IMG="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" images -q api 2>/dev/null | head -n1 || true)"
if [[ -n "$WEB_IMG" ]]; then
  echo "Tagging web image → arta-web:prev"
  docker tag "$WEB_IMG" "arta-web:prev" 2>/dev/null || true
fi
if [[ -n "$API_IMG" ]]; then
  echo "Tagging api image → arta-api:prev"
  docker tag "$API_IMG" "arta-api:prev" 2>/dev/null || true
fi
# Fallback if compose image IDs unavailable (first deploy / older compose).
if docker image inspect "arta-web:latest" >/dev/null 2>&1; then
  docker tag "arta-web:latest" "arta-web:prev" 2>/dev/null || true
fi
if docker image inspect "arta-api:latest" >/dev/null 2>&1; then
  docker tag "arta-api:latest" "arta-api:prev" 2>/dev/null || true
fi

# Pre-deploy Postgres dump (retains last N).
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M)"
DUMP_FILE="$BACKUP_DIR/${STAMP}.sql.gz"
if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --status running -q db >/dev/null 2>&1 \
  && [[ -n "$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --status running -q db 2>/dev/null || true)" ]]; then
  echo "Backing up Postgres → $DUMP_FILE"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
    | gzip -c >"$DUMP_FILE"
  # Prune older dumps
  ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
else
  echo "Skip DB backup (db container not running yet)."
fi

echo "Building images..."
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 \
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build

echo "Starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "Done."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
echo "Rollback: bash deploy/rollback.sh [--dump YYYYMMDD-HHMM.sql.gz]"
