#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.arta.yml"
ENV_FILE="$SCRIPT_DIR/.env.arta"
TRAEFIK_SRC="$SCRIPT_DIR/traefik/arta.yml"
TRAEFIK_DST="/var/www/nexara-app/deploy/traefik/arta.yml"

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

echo "Installing Traefik route → $TRAEFIK_DST"
bash "$SCRIPT_DIR/ensure-traefik-route.sh"

echo "Building images..."
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 \
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build

echo "Starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "Done."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
