#!/usr/bin/env bash
# Keeps ARTA Traefik routes present in nexara's shared Traefik file provider dir.
# Nexara deploy/traefik/ is git-tracked without arta.yml; a Nexara pull or cleanup
# can remove the copied file and take artaproducciones.com offline (404).
set -Eeuo pipefail

ARTA_ROOT="${ARTA_ROOT:-/var/www/arta-app}"
SRC="$ARTA_ROOT/deploy/traefik/arta.yml"
DST="${ARTA_TRAEFIK_DST:-/var/www/nexara-app/deploy/traefik/arta.yml}"
LOG_TAG="arta-traefik-ensure"

log() {
  echo "[$(date -Iseconds)] [$LOG_TAG] $*"
}

if [[ ! -f "$SRC" ]]; then
  log "ERROR missing source: $SRC"
  exit 1
fi

mkdir -p "$(dirname "$DST")"

if [[ ! -f "$DST" ]]; then
  cp -f "$SRC" "$DST"
  log "restored missing route file → $DST"
  exit 0
fi

if ! cmp -s "$SRC" "$DST"; then
  cp -f "$SRC" "$DST"
  log "synced route file (content differed) → $DST"
  exit 0
fi

# Sanity: copied file must reference arta services (not nexara)
if ! grep -q 'arta-web' "$DST" 2>/dev/null; then
  cp -f "$SRC" "$DST"
  log "replaced invalid route file (missing arta-web) → $DST"
  exit 0
fi

exit 0
