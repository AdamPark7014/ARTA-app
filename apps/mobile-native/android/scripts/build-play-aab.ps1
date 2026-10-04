param(
  [switch]$BumpVersionCode,
  [int]$VersionCode = 0,
  [string]$VersionName = "",
  [switch]$Clean,
  # Sobrescribe un arta-<versión>-<código>.aab que ya exista en la carpeta de salida.
  [switch]$Force,
  [string]$OutputDir = (Join-Path $env:USERPROFILE "Documents\ARTA-builds")
)

# ============================================================================
# Android App Bundle (.aab) de ARTA firmado con la llave de subida de Play.
# Adaptado del de NEXARA.
#
# Uso (desde cualquier carpeta):
#   pwsh -File apps/mobile-native/android/scripts/build-play-aab.ps1 -BumpVersionCode
#   pwsh -File apps/mobile-native/android/scripts/build-play-aab.ps1 -VersionCode 3 -VersionName 1.0.2
#
# Salida:
#   %USERPROFILE%\Documents\ARTA-builds\arta-<versionName>-<versionCode>.aab
#   (+ el mapping.txt de R8 de esa versión al lado)
#
# Notas de release:
#   - NO genera keystore. arta-upload.jks + key.properties son la llave de subida
#     ya registrada en Play; una llave nueva no puede actualizar la app.
#   - Play NUNCA reutiliza un versionCode, aunque el bundle se descartara:
#     usa -BumpVersionCode en cada intento de subida.
#   - El AAB anterior se BORRA antes de compilar: si el build falla no queda un
#     bundle viejo en disco que alguien suba creyendo que es el nuevo.
#   - Tras compilar se comprueba que el AAB está firmado con la llave de subida
#     y NO con la de debug. Solo se imprimen huellas SHA-256, nunca contraseñas.
# ============================================================================

$ErrorActionPreference = "Stop"

$androidDir = Split-Path -Parent $PSScriptRoot
$keyPropsPath = Join-Path $androidDir "key.properties"
$gradlePropsPath = Join-Path $androidDir "gradle.properties"
$aabPath = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"
$mappingPath = Join-Path $androidDir "app\build\outputs\mapping\release\mapping.txt"
$debugKeystore = Join-Path $env:USERPROFILE ".android\debug.keystore"

function Get-Keytool {
  if ($env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME "bin\keytool.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  $cmd = Get-Command keytool -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "No encuentro keytool. Define JAVA_HOME o pon el JDK en el PATH."
}

# Huella SHA-256 del primer certificado que imprima keytool (la etiqueta
# «SHA256:» no se traduce aunque el JDK esté en español).
function Get-Sha256Fingerprint([string[]]$keytoolOutput) {
  $m = $keytoolOutput | Select-String -Pattern 'SHA-?256:\s*([0-9A-F]{2}(?::[0-9A-F]{2}){31})' | Select-Object -First 1
  if (-not $m) { return $null }
  return $m.Matches[0].Groups[1].Value
}

if (-not (Test-Path (Join-Path $androidDir "gradlew.bat"))) {
  throw "No encuentro gradlew.bat en $androidDir"
}
# Solo se comprueba que exista: el contenido lo lee Gradle, nunca este script.
if (-not (Test-Path $keyPropsPath)) {
  throw "Falta $keyPropsPath. Recupéralo del respaldo junto con arta-upload.jks; no generes otra llave."
}

Push-Location $androidDir
try {
  # --- Versionado -----------------------------------------------------------
  $gradlePropsText = [System.IO.File]::ReadAllText($gradlePropsPath)
  $codeMatch = [regex]::Match($gradlePropsText, '(?m)^VERSION_CODE=(\d+)\s*$')
  $nameMatch = [regex]::Match($gradlePropsText, '(?m)^VERSION_NAME=(.+?)\s*$')
  if (-not $codeMatch.Success -or -not $nameMatch.Success) {
    throw "gradle.properties debe declarar VERSION_CODE y VERSION_NAME."
  }
  $currentCode = [int]$codeMatch.Groups[1].Value
  $currentName = $nameMatch.Groups[1].Value

  $targetCode = $currentCode
  $targetName = $currentName
  if ($VersionCode -gt 0) { $targetCode = $VersionCode }
  elseif ($BumpVersionCode) { $targetCode = $currentCode + 1 }
  if ($VersionName -ne "") { $targetName = $VersionName.Trim() }

  if ($targetCode -ne $currentCode -or $targetName -ne $currentName) {
    Write-Host "Actualizando gradle.properties: $currentCode/$currentName -> $targetCode/$targetName" -ForegroundColor Cyan
    $updated = [regex]::Replace($gradlePropsText, '(?m)^VERSION_CODE=\d+', "VERSION_CODE=$targetCode")
    $updated = [regex]::Replace($updated, '(?m)^VERSION_NAME=.+?(?=\r?$)', "VERSION_NAME=$targetName")
    # UTF-8 sin BOM y sin tocar los saltos de línea: así el diff es solo la versión.
    [System.IO.File]::WriteAllText($gradlePropsPath, $updated, [System.Text.UTF8Encoding]::new($false))
  }

  $outName = "arta-$targetName-$targetCode.aab"
  $outPath = Join-Path $OutputDir $outName
  if ((Test-Path $outPath) -and -not $Force) {
    throw "Ya existe $outPath. Si ese AAB se subió a Play, usa -BumpVersionCode; si nunca se subió, repite con -Force."
  }

  Write-Host ""
  Write-Host "Compilando versionCode=$targetCode versionName=$targetName" -ForegroundColor White
  Write-Host "RECUERDA: Play rechaza un versionCode ya SUBIDO, aunque el bundle se" -ForegroundColor Yellow
  Write-Host "descartara. Mira el mayor en Play Console -> Panel de la app -> Versiones." -ForegroundColor Yellow
  Write-Host ""

  # --- Borrar el bundle anterior -------------------------------------------
  if (Test-Path $aabPath) {
    Write-Host "Borrando AAB anterior ($((Get-Item $aabPath).LastWriteTime))..." -ForegroundColor DarkGray
    Remove-Item $aabPath -Force
  }

  # La versión va también por -P: si alguien edita gradle.properties a mano
  # entre medias, el AAB sale con la que este script anunció.
  $gradleArgs = @()
  if ($Clean) { $gradleArgs += "clean" }
  $gradleArgs += @(":app:bundleRelease", "-PVERSION_CODE=$targetCode", "-PVERSION_NAME=$targetName")
  Write-Host "gradlew $($gradleArgs -join ' ')" -ForegroundColor Cyan
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) { throw "bundleRelease falló (exit $LASTEXITCODE)" }
  if (-not (Test-Path $aabPath)) { throw "No se generó el AAB en $aabPath" }

  # --- Verificar la firma ----------------------------------------------------
  # Un AAB firmado con debug compila igual y Play solo lo rechaza al subirlo.
  $keytool = Get-Keytool
  $aabFingerprint = Get-Sha256Fingerprint (& $keytool -printcert -jarfile $aabPath 2>&1)
  if (-not $aabFingerprint) { throw "El AAB no está firmado (keytool no encontró certificado)." }

  # Huella de la llave de subida según Gradle (lee key.properties él, no este script).
  $report = & .\gradlew.bat --console=plain :app:signingReport 2>&1
  if ($LASTEXITCODE -ne 0) { throw "signingReport falló (exit $LASTEXITCODE)" }
  $inRelease = $false
  $uploadFingerprint = $null
  foreach ($line in $report) {
    $text = "$line"
    if ($text -match '^Variant:\s*(\S+)') { $inRelease = ($Matches[1] -eq 'release'); continue }
    if ($inRelease -and $text -match '^SHA-256:\s*([0-9A-F:]+)') { $uploadFingerprint = $Matches[1]; break }
  }
  if (-not $uploadFingerprint) { throw "signingReport no dio la huella de la llave de release." }

  $debugFingerprint = $null
  if (Test-Path $debugKeystore) {
    # La contraseña del keystore de debug es la pública de Android («android»).
    $debugFingerprint = Get-Sha256Fingerprint (& $keytool -list -v -keystore $debugKeystore -storepass android -alias androiddebugkey 2>&1)
  }

  if ($debugFingerprint -and $aabFingerprint -eq $debugFingerprint) {
    throw "El AAB está firmado con la llave de DEBUG ($aabFingerprint). No lo subas."
  }
  if ($aabFingerprint -ne $uploadFingerprint) {
    throw "La firma del AAB ($aabFingerprint) no coincide con la llave de subida ($uploadFingerprint)."
  }

  # --- Copiar a la carpeta de builds -----------------------------------------
  if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }
  Copy-Item $aabPath $outPath -Force
  # Sin el mapping de ESTA versión, sus crashes quedan ofuscados para siempre.
  if (Test-Path $mappingPath) {
    Copy-Item $mappingPath (Join-Path $OutputDir "arta-$targetName-$targetCode-mapping.txt") -Force
  } else {
    Write-Host "AVISO: no se encontró mapping.txt en $mappingPath" -ForegroundColor Yellow
  }

  $item = Get-Item $outPath
  $hash = (Get-FileHash $outPath -Algorithm SHA256).Hash
  Write-Host ""
  Write-Host "AAB listo y verificado:" -ForegroundColor Green
  Write-Host "  $($item.FullName)"
  Write-Host "  versionCode: $targetCode   versionName: $targetName"
  Write-Host "  Tamaño: $([math]::Round($item.Length / 1MB, 2)) MB"
  Write-Host "  SHA-256 del archivo: $hash"
  Write-Host "  Certificado (llave de subida) SHA-256: $aabFingerprint"
  if ($debugFingerprint) { Write-Host "  (distinto del de debug: $debugFingerprint)" -ForegroundColor DarkGray }
  Write-Host ""
  Write-Host "Siguiente paso: Play Console -> com.artaproducciones.ops -> Prueba interna o"
  Write-Host "Producción -> Crear versión -> subir este .aab."
  Write-Host ""
  Write-Host "ANTES de promover a Producción: prueba el build MINIFICADO (assembleRelease o" -ForegroundColor Yellow
  Write-Host "bundletool build-apks --local-testing). El debug no prueba R8." -ForegroundColor Yellow
}
finally {
  Pop-Location
}
