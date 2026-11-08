#!/usr/bin/env bash
# Manda un aviso operativo. Uso: bash deploy/notify.sh "mensaje"
#
# ALERT_WEBHOOK_URL (en deploy/.env.arta) acepta:
#   - Slack / Discord / Google Chat: URL del webhook entrante (se manda JSON con text/content).
#   - ntfy.sh: https://ntfy.sh/<tema-secreto> (se manda texto plano; la app de ntfy avisa al teléfono).
# Sin ALERT_WEBHOOK_URL solo se escribe en la salida (queda en el log del cron).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.arta"
if [[ -z "${ALERT_WEBHOOK_URL:-}" && -f "$ENV_FILE" ]]; then
  ALERT_WEBHOOK_URL="$(grep -E '^ALERT_WEBHOOK_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'" || true)"
fi

MSG="${1:-ARTA: aviso sin texto}"
echo "[$(date -Is)] AVISO: $MSG"
[[ -z "${ALERT_WEBHOOK_URL:-}" ]] && exit 0

if [[ "$ALERT_WEBHOOK_URL" == *ntfy* ]]; then
  curl -fsS -m 15 -H "Title: ARTA" -H "Priority: high" -d "$MSG" "$ALERT_WEBHOOK_URL" >/dev/null
else
  BODY="$(MSG="$MSG" python3 -c 'import json,os;m=os.environ["MSG"];print(json.dumps({"text":m,"content":m}))' 2>/dev/null \
    || printf '{"text":"%s","content":"%s"}' "${MSG//\"/\'}" "${MSG//\"/\'}")"
  curl -fsS -m 15 -H 'Content-Type: application/json' -d "$BODY" "$ALERT_WEBHOOK_URL" >/dev/null
fi
