#!/usr/bin/env bash
# Install ARTA Traefik routes into the SHARED platform dir (/opt/traefik/config).
# Never writes into another project's tree. Never deletes other routes.
set -Eeuo pipefail

ARTA_ROOT="${ARTA_ROOT:-/var/www/arta-app}"
SRC="$ARTA_ROOT/deploy/traefik/arta.yml"
INSTALL="${TRAEFIK_INSTALL:-/opt/traefik/bin/install-route.sh}"
DST="${ARTA_TRAEFIK_DST:-/opt/traefik/config/arta.yml}"
LOG_TAG="arta-traefik-ensure"

log() {
  echo "[$(date -Iseconds)] [$LOG_TAG] $*"
}

if [[ ! -f "$SRC" ]]; then
  log "ERROR missing source: $SRC"
  exit 1
fi

if [[ -x "$INSTALL" ]]; then
  bash "$INSTALL" "$SRC" arta.yml
  exit 0
fi

# Fallback if platform installer is missing (should not happen on Hetzner)
mkdir -p "$(dirname "$DST")"
if [[ ! -f "$DST" ]] || ! cmp -s "$SRC" "$DST"; then
  cp -f "$SRC" "$DST"
  log "restored/synced (fallback) → $DST"
fi
if ! grep -q 'arta-web' "$DST" 2>/dev/null; then
  cp -f "$SRC" "$DST"
  log "replaced invalid route file → $DST"
fi
exit 0
