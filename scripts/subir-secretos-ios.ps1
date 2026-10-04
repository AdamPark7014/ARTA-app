<#
.SINOPSIS
    Carga en el repo ARTA-app los secretos que necesita «iOS · TestFlight».

.DESCRIPCION
    ARTA se publica con el MISMO equipo de Apple que NEXARA (AHNW9K8745), así que
    reusa su certificado de distribución y su llave de App Store Connect: los toma
    de la carpeta que dejó `crear-certificado.ps1` de NEXARA y los publica como
    secretos de ESTE repo (GitHub no deja copiar secretos de un repo a otro).
    Ningún valor se imprime ni queda en el historial de PowerShell.

    Secretos que carga (los nombres que lee .github/workflows/ios-testflight.yml):

      APP_STORE_CONNECT_KEY_ID       del nombre AuthKey_XXXXXXXXXX.p8
      APP_STORE_CONNECT_ISSUER_ID    UUID de App Store Connect > Integraciones > API
      APP_STORE_CONNECT_PRIVATE_KEY  el texto del .p8
      BUILD_CERTIFICATE_BASE64       el .p12 de distribución en base64
      P12_PASSWORD                   la contraseña de ese .p12

    La llave de App Store Connect necesita rol Admin, o App Manager con acceso a
    «Certificates, Identifiers & Profiles»: el flujo registra los bundle id de ARTA
    y crea sus perfiles con ella (scripts/asc_signing.py).

.EJEMPLO
    pwsh -File scripts\subir-secretos-ios.ps1
    pwsh -File scripts\subir-secretos-ios.ps1 -IssuerId 69a6de70-0000-0000-0000-1f2b3c4d5e6f
#>
[CmdletBinding()]
param(
    [string]$Repo = 'AdamPark7014/ARTA-app',
    [string]$Carpeta = 'C:\dev\secrets\nexara-ios',
    [string]$IssuerId = ''
)

$ErrorActionPreference = 'Stop'
function Fallo($m) { Write-Host "  ERROR: $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Fallo "No hay 'gh' en el PATH. Instala GitHub CLI: https://cli.github.com"
}
& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  GitHub CLI no tiene sesión. Ejecuta primero:  gh auth login" -ForegroundColor Yellow
    exit 1
}

$rutaP12 = Join-Path $Carpeta 'ios_distribution.p12.base64.txt'
if (-not (Test-Path $rutaP12)) { Fallo "No encuentro $rutaP12 (lo genera crear-certificado.ps1 de NEXARA)." }

$p8 = Get-ChildItem -Path $Carpeta -Filter 'AuthKey_*.p8' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p8) {
    Fallo "Falta AuthKey_XXXXXXXXXX.p8 en $Carpeta (App Store Connect > Usuarios y acceso > Integraciones > API)."
}
$keyId = $p8.BaseName -replace '^AuthKey_', ''
Write-Host "Llave de App Store Connect: $($p8.Name) -> APP_STORE_CONNECT_KEY_ID = $keyId" -ForegroundColor DarkGray

if (-not $IssuerId) {
    $IssuerId = Read-Host 'APP_STORE_CONNECT_ISSUER_ID (UUID encima de la tabla de llaves en App Store Connect)'
}
if ($IssuerId -notmatch '^[0-9a-fA-F-]{36}$') { Fallo 'El Issuer ID debe ser un UUID de 36 caracteres.' }

$sec = Read-Host 'P12_PASSWORD (la contraseña del .p12 de distribución de NEXARA)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $p12Pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if (-not $p12Pass) { Fallo 'La contraseña del .p12 no puede ir vacía.' }

function Poner([string]$nombre, [string]$valor) {
    # Por stdin: el valor no aparece en la línea de comandos ni en el historial.
    $valor | & gh secret set $nombre --repo $Repo 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fallo "No se pudo guardar $nombre en $Repo." }
    Write-Host "  ok  $nombre" -ForegroundColor Green
}

Write-Host "Cargando secretos en $Repo ..."
Poner 'APP_STORE_CONNECT_KEY_ID' $keyId
Poner 'APP_STORE_CONNECT_ISSUER_ID' $IssuerId
Poner 'APP_STORE_CONNECT_PRIVATE_KEY' (Get-Content -Raw $p8.FullName)
Poner 'BUILD_CERTIFICATE_BASE64' ((Get-Content -Raw $rutaP12).Trim())
Poner 'P12_PASSWORD' $p12Pass
$p12Pass = $null

Write-Host ''
Write-Host 'Listo. Antes de lanzar «iOS · TestFlight» crea la app en App Store Connect:' -ForegroundColor Cyan
Write-Host '  Apps > + > Nueva app > iOS, bundle com.artaproducciones.ops (ver docs/store/IOS-APP-STORE.md).'
