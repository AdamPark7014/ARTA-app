#Requires -Version 7.0
<#
.SYNOPSIS
    Comprueba que la cuenta de revisión de App Store / Google Play entra a ARTA como lo hará el revisor.

.DESCRIPTION
    Hace, contra el API público, lo mismo que las apps nativas:

        1. POST auth/login (correo + contraseña). La sesión queda en la cookie `arta_access`.
        2. Revisa que el API NO pida 2FA (`requires2fa` = código TOTP del usuario,
           `requiresTotpEnrollment` = la organización exige 2FA).
        3. Con esa sesión: auth/me y organizations/me (que sea la organización demo), y cuenta lo que
           verá el revisor en Inicio, Eventos, Tareas, Avisos, Aprobaciones y Chats.
        4. Revoca la sesión que abrió esta comprobación (solo las de este script, por su User-Agent),
           para no dejar sesiones colgando ni tocar la del revisor de Apple/Google.

    Solo imprime OK/FALLA, si se pidió 2FA y conteos. Nunca la contraseña, la cookie ni el cuerpo crudo
    de las respuestas. La contraseña se pide con Read-Host -AsSecureString (o llega como SecureString
    desde resembrar-cuenta-revision.ps1).

    Sale con 0 si todo pasa y 1 si algo falla.

.EXAMPLE
    pwsh -File apps\api\scripts\verificar-cuenta-revision.ps1

.EXAMPLE
    pwsh -File apps\api\scripts\verificar-cuenta-revision.ps1 -SoloLogin
#>
[CmdletBinding()]
param(
    [string]$Api = 'https://arta.artaproducciones.com/api',
    [string]$Email = 'revision.tiendas@artaproducciones.com',
    [SecureString]$Contrasena,
    # Solo login + 2FA; no revisa el contenido de las pantallas.
    [switch]$SoloLogin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Net.Http

$DemoOrgId = 'org_arta_store_review'
$DemoSlug = 'arta-demo-revision-tiendas'
$UserAgent = 'ArtaStoreReviewCheck/1.0'
$Api = $Api.TrimEnd('/')
$Email = $Email.Trim().ToLowerInvariant()

$propia = $null
if (-not $Contrasena) {
    $Contrasena = Read-Host "Contraseña de $Email" -AsSecureString
    $propia = $Contrasena
}

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.UseCookies = $true
$handler.CookieContainer = [System.Net.CookieContainer]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)

function Invoke-Api {
    param([string]$Method, [string]$Path, [string]$Json = $null, [hashtable]$Headers = @{})
    $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), "$Api/$Path")
    $req.Headers.TryAddWithoutValidation('Accept', 'application/json') | Out-Null
    $req.Headers.TryAddWithoutValidation('User-Agent', $UserAgent) | Out-Null
    foreach ($k in $Headers.Keys) { $req.Headers.TryAddWithoutValidation($k, $Headers[$k]) | Out-Null }
    if ($Json) { $req.Content = [System.Net.Http.StringContent]::new($Json, [Text.Encoding]::UTF8, 'application/json') }
    try {
        $res = $client.SendAsync($req).GetAwaiter().GetResult()
        $txt = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $data = $null
        try { $data = $txt | ConvertFrom-Json -Depth 20 -ErrorAction Stop } catch { }
        return [pscustomobject]@{ Status = [int]$res.StatusCode; Data = $data; Error = '' }
    } catch {
        return [pscustomobject]@{ Status = 0; Data = $null; Error = $_.Exception.GetBaseException().Message }
    } finally {
        $req.Dispose()
    }
}

function Prop($Obj, [string]$Name) {
    if ($null -ne $Obj -and $Obj.PSObject.Properties.Name -contains $Name) { return $Obj.$Name }
    return $null
}

# Mensaje de error de Nest ({ message }) sin volcar el cuerpo.
function Motivo($Res) {
    if ($Res.Status -eq 0) { return "sin respuesta: $($Res.Error)" }
    $m = Prop $Res.Data 'message'
    if ($m -is [array]) { $m = $m -join '; ' }
    if ($m) { return "HTTP $($Res.Status): $m" }
    return "HTTP $($Res.Status)"
}

$fallas = 0
function Paso([string]$Nombre, [bool]$Ok, [string]$Detalle = '') {
    if ($Ok) { Write-Host ("  [ OK  ] {0}  {1}" -f $Nombre, $Detalle) -ForegroundColor Green }
    else { Write-Host ("  [FALLA] {0}  {1}" -f $Nombre, $Detalle) -ForegroundColor Red; $script:fallas++ }
}

function Count($Value) { if ($null -eq $Value) { return 0 }; return @($Value).Count }

Write-Host ''
Write-Host "Verificando $Email contra $Api" -ForegroundColor Cyan
Write-Host ''

try {
    # ── 1. Login ────────────────────────────────────────────────────────────
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Contrasena)
    try {
        $cuerpo = @{ email = $Email; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } | ConvertTo-Json -Compress
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $login = Invoke-Api -Method POST -Path 'auth/login' -Json $cuerpo
    $cuerpo = $null

    $pide2fa = [bool](Prop $login.Data 'requires2fa')
    $pideAlta2fa = [bool](Prop $login.Data 'requiresTotpEnrollment')
    $usuario = Prop $login.Data 'user'
    $loginOk = $login.Status -ge 200 -and $login.Status -lt 300 -and $null -ne $usuario

    if (-not $loginOk) {
        $pista = switch ($login.Status) {
            401 { ' → contraseña distinta a la sembrada, cuenta inactiva o bloqueada 5 min por intentos. Vuelve a sembrar.' }
            429 { ' → demasiados intentos desde esta IP; espera un minuto.' }
            default { '' }
        }
        Paso 'login' $false "$(Motivo $login)$pista"
        Write-Host ''
        Write-Host 'RESULTADO: la cuenta NO entra.' -ForegroundColor Red
        exit 1
    }

    Paso 'login' $true "HTTP $($login.Status)"
    if ($pide2fa) {
        Paso '2FA' $false 'el API pidió código TOTP (el usuario tiene 2FA propio). Resembrar lo apaga.'
    } elseif ($pideAlta2fa) {
        Paso '2FA' $false 'la organización exige 2FA (require2fa). Resembrar lo apaga.'
    } else {
        Paso '2FA' $true 'no se pidió'
    }

    if ($pide2fa -or $pideAlta2fa) {
        Write-Host ''
        Write-Host 'RESULTADO: el revisor se toparía con la pantalla de 2FA.' -ForegroundColor Red
        exit 1
    }

    if (-not $SoloLogin) {
        Write-Host ''
        # ── 2. Identidad y organización ─────────────────────────────────────
        $me = Invoke-Api -Method GET -Path 'auth/me'
        $u = Prop $me.Data 'user'
        $org = Prop $u 'organizationId'
        Paso 'auth/me' ($me.Status -eq 200 -and $org -eq $DemoOrgId) $(if ($me.Status -eq 200) { "rol=$(Prop $u 'roleKey') permisos=$((@(Prop $u 'permissions')) -join ',') organización=$org" } else { Motivo $me })
        if ($me.Status -eq 200 -and $org -ne $DemoOrgId) {
            Paso 'aislamiento' $false "el revisor está en '$org', no en '$DemoOrgId'. NO entregues la cuenta."
        }

        $o = Invoke-Api -Method GET -Path 'organizations/me'
        $slug = Prop $o.Data 'slug'
        Paso 'organización demo' ($o.Status -eq 200 -and $slug -eq $DemoSlug) $(if ($o.Status -eq 200) { "slug=$slug" } else { Motivo $o })

        # ── 3. Lo que verá en cada pantalla ─────────────────────────────────
        $ev = Invoke-Api -Method GET -Path 'events?scope=active'
        $nEv = Count $ev.Data
        Paso 'Eventos' ($ev.Status -eq 200 -and $nEv -gt 0) $(if ($ev.Status -eq 200) { "$nEv evento(s) actuales" } else { Motivo $ev })

        $t = Invoke-Api -Method GET -Path 'tasks/mine'
        $nT = Count $t.Data
        $nAbiertas = Count (@($t.Data) | Where-Object { $_ -and (Prop $_ 'status') -ne 'DONE' })
        Paso 'Tareas' ($t.Status -eq 200 -and $nT -gt 0) $(if ($t.Status -eq 200) { "$nT mías ($nAbiertas abiertas)" } else { Motivo $t })

        $n = Invoke-Api -Method GET -Path 'notifications?take=50'
        $nN = Count $n.Data
        $nNuevos = Count (@($n.Data) | Where-Object { $_ -and -not (Prop $_ 'readAt') })
        Paso 'Avisos' ($n.Status -eq 200 -and $nN -gt 0) $(if ($n.Status -eq 200) { "$nN avisos ($nNuevos sin leer)" } else { Motivo $n })

        $req = Invoke-Api -Method GET -Path 'tasks/requested'
        $nEntregas = Count (@($req.Data) | Where-Object { $_ -and (Prop $_ 'status') -eq 'PENDING_APPROVAL' })
        $nOc = 0
        foreach ($ent in 'ARTA', 'EXPLANADA') {
            $po = Invoke-Api -Method GET -Path "analytics/purchase-orders?entity=$ent"
            if ($po.Status -eq 200) { $nOc += Count (@(Prop $po.Data 'orders') | Where-Object { $_ -and (Prop $_ 'status') -eq 'PENDING_AUTH' }) }
        }
        $adv = Invoke-Api -Method GET -Path 'finance/advances/pending'
        $nAnt = Count (@($adv.Data) | Where-Object { $_ -and (Prop $_ 'advanceStatus') -eq 'PENDING' })
        Paso 'Aprobaciones' (($nEntregas + $nOc + $nAnt) -gt 0) "$nEntregas entrega(s), $nOc OC, $nAnt anticipo(s) por aprobar"

        $ch = Invoke-Api -Method GET -Path 'chat/channels'
        $nCh = Count $ch.Data
        $nDm = Count (@($ch.Data) | Where-Object { $_ -and (Prop $_ 'kind') -eq 'DIRECT' })
        Paso 'Chats' ($ch.Status -eq 200 -and $nCh -gt 0) $(if ($ch.Status -eq 200) { "$nCh conversación(es), $nDm directo(s)" } else { Motivo $ch })
    }

    # ── 4. Cerrar la sesión de esta comprobación ────────────────────────────
    $csrf = ($handler.CookieContainer.GetCookies([Uri]$Api) | Where-Object { $_.Name -eq 'arta_csrf' } | Select-Object -First 1)
    $ses = Invoke-Api -Method GET -Path 'auth/sessions'
    $mias = @($ses.Data) | Where-Object { $_ -and (Prop $_ 'userAgent') -eq $UserAgent }
    $revocadas = 0
    if ($csrf) {
        foreach ($s in $mias) {
            $r = Invoke-Api -Method POST -Path "auth/sessions/$(Prop $s 'id')/revoke" -Headers @{ 'x-csrf-token' = $csrf.Value }
            if ($r.Status -ge 200 -and $r.Status -lt 300) { $revocadas++ }
        }
    }
    Write-Host ''
    Write-Host "  (sesiones de esta comprobación revocadas: $revocadas)" -ForegroundColor DarkGray

    Write-Host ''
    if ($fallas -eq 0) {
        Write-Host 'RESULTADO: la cuenta entra sin 2FA, cae en la organización demo y cada pantalla tiene contenido.' -ForegroundColor Green
        exit 0
    }
    Write-Host "RESULTADO: $fallas comprobación(es) fallaron. Resiembra con resembrar-cuenta-revision.ps1." -ForegroundColor Red
    exit 1
}
finally {
    $client.Dispose()
    if ($propia) { $propia.Dispose() }
}
