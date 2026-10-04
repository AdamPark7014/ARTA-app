# Sube la cuenta de servicio de Firebase de ARTA al servidor y reinicia arta-api.
#
# Lo corre Adam (no un agente): la clave privada va de Descargas al .env.arta
# del servidor por SSH, sin imprimirse ni quedar en el repo.
#
#   pwsh -File deploy\firebase-cuenta-servicio.ps1                 # toma el JSON más nuevo de Descargas
#   pwsh -File deploy\firebase-cuenta-servicio.ps1 -Archivo C:\ruta\clave.json
param([string]$Archivo)
$ErrorActionPreference = 'Stop'
$proyecto = 'arta-app-fde07'

if (-not $Archivo) {
  $Archivo = Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "$proyecto-*.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Archivo -or -not (Test-Path $Archivo)) {
  throw "No encontré en Descargas el JSON de la cuenta de servicio ($proyecto-*.json)."
}
$cuenta = Get-Content $Archivo -Raw | ConvertFrom-Json
if ($cuenta.type -ne 'service_account' -or $cuenta.project_id -ne $proyecto) {
  throw "Ese archivo no es la cuenta de servicio de $proyecto."
}

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Archivo))
$remoto = @"
set -e
cd /var/www/arta-app
cp deploy/.env.arta /root/env.arta.bak-`$(date +%Y%m%d-%H%M%S)
grep -v '^FIREBASE_SERVICE_ACCOUNT_JSON=' deploy/.env.arta > /tmp/env.arta.new || true
printf 'FIREBASE_SERVICE_ACCOUNT_JSON=%s\n' '$b64' >> /tmp/env.arta.new
cat /tmp/env.arta.new > deploy/.env.arta
rm -f /tmp/env.arta.new
docker compose --env-file deploy/.env.arta -f deploy/docker-compose.arta.yml up -d api
sleep 25
docker exec arta-api sh -c 'test -n "`$FIREBASE_SERVICE_ACCOUNT_JSON" && echo "FIREBASE listo en arta-api" || echo "FALTA FIREBASE en arta-api"'
# fin
"@ -replace "`r", ''

$remoto | ssh -i "$env:USERPROFILE\.ssh\id_ed25519_nexara_hetzner" -p 2222 root@5.78.215.109 'bash -s'
Write-Host "Listo. Ya puedes borrar $Archivo de Descargas (la clave queda solo en el servidor)."
