#Requires -Version 7.0
<#
.SYNOPSIS
    Crea o vuelve a sembrar en producción la cuenta de revisión de App Store / Google Play de ARTA.

.DESCRIPTION
    Corre `prisma/seed-store-reviewer.ts` dentro del contenedor `arta-api` del Hetzner. El sembrador es
    idempotente y deja la cuenta así (detalle en docs/store/CUENTA-REVISION.md):

        - en la organización aislada «ARTA Demo · Revisión de tiendas», nunca en la de Arta
        - activa, sin 2FA, sin candado, con la contraseña que escribas aquí
        - con eventos, tareas, aprobaciones, avisos y chat ficticios, con fechas recalculadas a hoy

    Pasos:
        1. Pide la contraseña dos veces con Read-Host -AsSecureString (no se ve, no queda en el historial).
        2. Sube TU copia de prisma/seed-store-reviewer.ts al contenedor (scp + docker cp) y compara el
           SHA-256: la imagen de producción solo trae el archivo si se construyó después de que existiera,
           y así siempre corre la versión que tienes en el repo.
        3. Corre el sembrador con --dry y te enseña qué haría.
        4. Si escribes SI, lo aplica con --confirm-produccion.
        5. Corre verificar-cuenta-revision.ps1 (login real contra el API público).

    La contraseña viaja al servidor por la entrada estándar de SSH: no aparece en la línea de comandos de
    ningún proceso ni en el historial. En el servidor se lee con `read`, se exporta y se pasa al contenedor
    con `docker exec -e STORE_REVIEWER_PASSWORD` (sin valor: docker la toma del entorno). El sembrador la
    borra de su entorno al leerla y nunca la imprime.

.EXAMPLE
    pwsh -File apps\api\scripts\resembrar-cuenta-revision.ps1

.EXAMPLE
    pwsh -File apps\api\scripts\resembrar-cuenta-revision.ps1 -SoloDry

.EXAMPLE
    # Sin preguntas (lo usa un agente): la contraseña sale de la primera línea de un archivo fuera de git.
    pwsh -File apps\api\scripts\resembrar-cuenta-revision.ps1 -ArchivoContrasena C:\dev\secrets\arta-store\cuenta-revision.txt -Confirmar
#>
[CmdletBinding()]
param(
    [string]$Servidor = '5.78.215.109',
    [int]$Puerto = 2222,
    [string]$Usuario = 'root',
    [string]$Llave = (Join-Path $HOME '.ssh\id_ed25519_nexara_hetzner'),
    [string]$Contenedor = 'arta-api',
    [string]$Email = 'revision.tiendas@artaproducciones.com',
    # Solo muestra lo que haría (--dry); no pregunta ni aplica.
    [switch]$SoloDry,
    # No corre verificar-cuenta-revision.ps1 al final.
    [switch]$SinVerificar,
    # Toma la contraseña de la primera línea de este archivo (fuera de git) en vez de pedirla.
    [string]$ArchivoContrasena,
    # Aplica sin preguntar «SI» después de la simulación.
    [switch]$Confirmar
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# La contraseña viaja por stdin: en UTF-8, para que acentos o ñ lleguen igual que en el teléfono.
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$SeedRemoto = '/app/apps/api/prisma/seed-store-reviewer.ts'
$TmpRemoto = '/tmp/arta-seed-store-reviewer.ts'
$Destino = "$Usuario@$Servidor"

function Salir([string]$Mensaje, [int]$Codigo = 1) {
    Write-Host $Mensaje -ForegroundColor $(if ($Codigo -eq 0) { 'Green' } else { 'Red' })
    exit $Codigo
}

function ConvertTo-Plano([SecureString]$Secreto) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secreto)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# ── Comprobaciones locales ──────────────────────────────────────────────────
foreach ($cmd in 'ssh', 'scp') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Salir "No encuentro '$cmd' (OpenSSH de Windows)." }
}
if (-not (Test-Path -LiteralPath $Llave)) { Salir "No existe la llave SSH: $Llave" }
$SeedLocal = Join-Path $PSScriptRoot '..\prisma\seed-store-reviewer.ts'
if (-not (Test-Path -LiteralPath $SeedLocal)) { Salir "No encuentro el sembrador: $SeedLocal" }
$SeedLocal = (Resolve-Path -LiteralPath $SeedLocal).Path

$Email = $Email.Trim().ToLowerInvariant()
# Va dentro de comillas simples en el comando remoto: solo caracteres seguros.
if ($Email -notmatch '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$') { Salir "Correo no válido: $Email" }

# ── Contraseña ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "Cuenta de revisión: $Email" -ForegroundColor Cyan
Write-Host 'Usa la MISMA contraseña que pegaste (o vas a pegar) en App Store Connect y Play Console.' -ForegroundColor DarkGray
if ($ArchivoContrasena) {
    if (-not (Test-Path -LiteralPath $ArchivoContrasena)) { Salir "No existe el archivo de contraseña: $ArchivoContrasena" }
    $plano = Get-Content -LiteralPath $ArchivoContrasena -TotalCount 1 -Encoding utf8
    if (-not $plano) { Salir 'El archivo de contraseña está vacío. No se hizo nada.' }
    $secreto = ConvertTo-SecureString -String $plano -AsPlainText -Force
    Write-Host "  contraseña tomada de $ArchivoContrasena" -ForegroundColor DarkGray
} else {
    $secreto = Read-Host 'Contraseña (mínimo 12 caracteres)' -AsSecureString
    $repetida = Read-Host 'Repítela' -AsSecureString
    $plano = ConvertTo-Plano $secreto
    $plano2 = ConvertTo-Plano $repetida
    $repetida.Dispose()
    if ($plano -cne $plano2) { $plano = $null; $plano2 = $null; Salir 'Las contraseñas no coinciden. No se hizo nada.' }
    $plano2 = $null
}
if ($plano.Length -lt 12) { $plano = $null; Salir 'La contraseña debe tener al menos 12 caracteres. No se hizo nada.' }
if ($plano -ne $plano.Trim() -or $plano -match '[\r\n]') { $plano = $null; Salir 'La contraseña no puede empezar/terminar con espacios ni llevar saltos de línea.' }

$ssh = @('-i', $Llave, '-p', "$Puerto", '-o', 'ConnectTimeout=20')

function Invoke-Sembrador([string]$Bandera) {
    # Primera línea de stdin = contraseña. `docker exec -e VAR` sin valor la toma del entorno del shell remoto.
    # PowerShell en Windows manda la línea con CRLF: `read` corta en \n y deja el \r, que se quita aquí
    # (printf es interno del shell y tr la recibe por stdin: no queda en la línea de comandos de nadie).
    $remoto = "IFS= read -r STORE_REVIEWER_PASSWORD && " +
        "STORE_REVIEWER_PASSWORD=`$(printf '%s' `"`$STORE_REVIEWER_PASSWORD`" | tr -d '\r') && " +
        "export STORE_REVIEWER_PASSWORD && " +
        "docker exec -e STORE_REVIEWER_PASSWORD -e STORE_REVIEWER_EMAIL='$Email' -w /app/apps/api $Contenedor " +
        "npx ts-node --transpile-only prisma/seed-store-reviewer.ts $Bandera"
    # Out-Host: que el informe se vea y no se mezcle con el código de salida que devuelve la función.
    $plano | & ssh @ssh $Destino $remoto | Out-Host
    return $LASTEXITCODE
}

try {
    # ── 1. Subir el sembrador al contenedor ─────────────────────────────────
    $hashLocal = (Get-FileHash -LiteralPath $SeedLocal -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host ''
    Write-Host "Subiendo el sembrador a ${Servidor}:${Puerto} → $Contenedor ($($hashLocal.Substring(0, 12))…)" -ForegroundColor Cyan
    & scp -q -i $Llave -P "$Puerto" -o ConnectTimeout=20 $SeedLocal "${Destino}:$TmpRemoto"
    if ($LASTEXITCODE -ne 0) { Salir "scp falló (código $LASTEXITCODE)." }
    $copia = "docker cp $TmpRemoto ${Contenedor}:$SeedRemoto && rm -f $TmpRemoto && docker exec $Contenedor sha256sum $SeedRemoto"
    $salida = & ssh @ssh $Destino $copia
    if ($LASTEXITCODE -ne 0) { Salir "No se pudo copiar al contenedor (¿está corriendo $Contenedor?)." }
    $hashRemoto = ("$salida" -split '\s+')[0].ToLowerInvariant()
    if ($hashRemoto -ne $hashLocal) { Salir "El archivo en el contenedor no coincide (remoto $hashRemoto)." }
    Write-Host '  copiado y verificado (SHA-256 igual al local)' -ForegroundColor DarkGray

    # ── 2. Dry run ──────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '── Simulación (--dry): no escribe nada ──' -ForegroundColor Cyan
    $codigo = Invoke-Sembrador '--dry'
    if ($codigo -ne 0) { Salir "La simulación terminó con código $codigo. No se aplicó nada." }
    if ($SoloDry) { Salir 'Solo simulación (-SoloDry). No se aplicó nada.' 0 }

    # ── 3. Confirmar y aplicar ──────────────────────────────────────────────
    Write-Host ''
    if (-not $Confirmar) {
        $respuesta = Read-Host 'Aplicar en PRODUCCIÓN? Escribe SI para continuar'
        if ($respuesta -cne 'SI') { Salir 'Cancelado. No se aplicó nada.' 0 }
    }

    Write-Host ''
    Write-Host '── Aplicando (--confirm-produccion) ──' -ForegroundColor Cyan
    $codigo = Invoke-Sembrador '--confirm-produccion'
    if ($codigo -ne 0) { Salir "El sembrador terminó con código $codigo. Revisa el informe de arriba (todo va en una transacción: si abortó, no quedó nada a medias)." }
    $plano = $null

    # ── 4. Verificar contra el API público ──────────────────────────────────
    if ($SinVerificar) { Salir 'Sembrado. Verifica con: pwsh -File apps\api\scripts\verificar-cuenta-revision.ps1' 0 }
    Write-Host ''
    & (Join-Path $PSScriptRoot 'verificar-cuenta-revision.ps1') -Email $Email -Contrasena $secreto
    exit $LASTEXITCODE
}
finally {
    $plano = $null
    if ($secreto) { $secreto.Dispose() }
}
