#!/usr/bin/env bash
# Instala (o actualiza) las tareas programadas de ARTA en el servidor. Correr una vez como root:
#   sudo bash deploy/install-cron.sh
# Es idempotente: reescribe /etc/cron.d/arta-ops y la rotación de sus logs.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR"/*.sh

cat >/etc/cron.d/arta-ops <<EOF
# ARTA — generado por deploy/install-cron.sh (no editar a mano)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Respaldo completo (BD + archivos) cada noche, 03:30 hora del servidor
30 3 * * * root bash $SCRIPT_DIR/backup.sh >>/var/log/arta-backup.log 2>&1
# Salud de API/web, disco y respaldos cada 5 minutos
*/5 * * * * root bash $SCRIPT_DIR/monitor.sh >>/var/log/arta-monitor.log 2>&1
# Ruta de Traefik (por si un deploy de Nexara la borra)
*/5 * * * * root bash $SCRIPT_DIR/ensure-traefik-route.sh >>/var/log/arta-traefik-ensure.log 2>&1
EOF
chmod 644 /etc/cron.d/arta-ops

cat >/etc/logrotate.d/arta-ops <<'EOF'
/var/log/arta-backup.log /var/log/arta-monitor.log /var/log/arta-traefik-ensure.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
EOF

# Si existía el cron suelto de Traefik de docs/DOMAINS.md, ya lo cubre arta-ops.
rm -f /etc/cron.d/arta-traefik-ensure

echo "Listo: /etc/cron.d/arta-ops"
cat /etc/cron.d/arta-ops
echo
echo "Prueba ahora: bash $SCRIPT_DIR/backup.sh && bash $SCRIPT_DIR/monitor.sh"
