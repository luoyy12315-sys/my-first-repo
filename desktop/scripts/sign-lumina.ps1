<#
.SYNOPSIS
    Sign Lumina.exe with a locally-trusted self-signed code-signing certificate.

.DESCRIPTION
    Windows shows "cannot verify publisher / this app has been blocked" for any
    executable that has no Authenticode signature. There are two levels of fix:

      1) THIS MACHINE (what this script does)
         Create a self-signed code-signing certificate, install it into
         LocalMachine\Root + LocalMachine\TrustedPublisher, then sign the exe.
         After that Windows can verify the publisher and the warning stops.
         Cost: free. Scope: only this PC (and only machines that trust the cert).

      2) SHIPPING TO USERS (needs a real certificate, not this script)
         Buy an OV / EV code-signing certificate, or use Azure Trusted Signing
         (cheapest option for a solo developer, SmartScreen trusts it directly).
         Then sign inside the packaging pipeline - after `npm run build`,
         before zipping - otherwise every rebuild is "unknown publisher" again.

    Requirements: elevated PowerShell (Run as Administrator).
    The signing certificate's private key stays in the current user's store;
    only the public certificate is copied into the machine-wide trust stores.

.PARAMETER ExePath
    One or more executables to sign. Defaults to the dist builds under
    <repo>\test\desktop\dist and <repo>\release\desktop\dist.

.PARAMETER Subject
    Certificate subject. Keep it stable - changing it means re-trusting.

.PARAMETER Years
    Certificate lifetime in years (default 5).

.PARAMETER NoTimestamp
    Skip RFC3161 timestamping (use when offline).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\sign-lumina.ps1

.EXAMPLE
    ... -ExePath "D:\path\to\release\desktop\dist\Lumina-win32-x64\Lumina.exe"
#>
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files
# as ANSI, and a stray double-byte character can break parsing.
[CmdletBinding()]
param(
    [string[]]$ExePath,
    [string]$Subject = 'CN=Lumina Local Code Signing, O=Lumina, C=CN',
    [int]$Years = 5,
    [switch]$NoTimestamp
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$m) { Write-Host "[sign] $m" }
function Write-Ok([string]$m)   { Write-Host "[ ok ] $m" -ForegroundColor Green }
function Write-Warn2([string]$m) { Write-Host "[warn] $m" -ForegroundColor Yellow }

# --- 0. must be elevated ---------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host ''
    Write-Host 'This script must run as Administrator.' -ForegroundColor Red
    Write-Host 'Right-click PowerShell -> Run as administrator, then run:' -ForegroundColor Yellow
    Write-Host ("  powershell -NoProfile -ExecutionPolicy Bypass -File `"" + $PSCommandPath + "`"") -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# --- 1. resolve targets ----------------------------------------------------
if (-not $ExePath -or $ExePath.Count -eq 0) {
    $here = Split-Path -Parent $PSCommandPath          # <repo>\test\desktop\scripts
    $desktopDir = Split-Path -Parent $here             # <repo>\test\desktop
    $testRoot = Split-Path -Parent $desktopDir         # <repo>\test
    $repo = Split-Path -Parent $testRoot               # <repo>
    $ExePath = @(
        (Join-Path $testRoot   'desktop\dist\Lumina-win32-x64\Lumina.exe'),
        (Join-Path $repo       'release\desktop\dist\Lumina-win32-x64\Lumina.exe')
    )
}

$targets = @()
foreach ($p in $ExePath) {
    if ($p -and (Test-Path -LiteralPath $p)) {
        $targets += (Resolve-Path -LiteralPath $p).Path
    } else {
        Write-Warn2 "skip (not found): $p"
    }
}
if ($targets.Count -eq 0) { throw 'No Lumina.exe found to sign.' }

# --- 2. get or create the certificate --------------------------------------
Write-Step "certificate subject: $Subject"
$cert = Get-ChildItem Cert:\CurrentUser\My |
        Where-Object { $_.Subject -eq $Subject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1

if ($cert) {
    Write-Ok  "reuse existing certificate (thumbprint $($cert.Thumbprint), expires $($cert.NotAfter.ToString('yyyy-MM-dd')))"
} else {
    Write-Step 'creating self-signed code-signing certificate ...'
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $Subject `
        -KeyUsage DigitalSignature `
        -KeyExportPolicy Exportable `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -NotAfter (Get-Date).AddYears($Years)
    Write-Ok "created certificate (thumbprint $($cert.Thumbprint))"
}

# --- 3. make the machine trust it -----------------------------------------
$cerPath = Join-Path $env:TEMP ("lumina-codesign-" + $cert.Thumbprint + ".cer")
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null

foreach ($store in @('Cert:\LocalMachine\Root', 'Cert:\LocalMachine\TrustedPublisher')) {
    $already = Get-ChildItem $store | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    if ($already) {
        Write-Ok "already trusted in $store"
    } else {
        Import-Certificate -FilePath $cerPath -CertStoreLocation $store | Out-Null
        Write-Ok "installed into $store"
    }
}
Remove-Item -LiteralPath $cerPath -Force -ErrorAction SilentlyContinue

# --- 4. sign ---------------------------------------------------------------
$timestamp = 'http://timestamp.digicert.com'
foreach ($exe in $targets) {
    $size = [math]::Round((Get-Item -LiteralPath $exe).Length / 1MB, 1)
    Write-Step "signing $exe ($size MB) ..."

    $signed = $false
    if (-not $NoTimestamp) {
        try {
            $null = Set-AuthenticodeSignature -FilePath $exe -Certificate $cert `
                        -HashAlgorithm SHA256 -TimestampServer $timestamp -ErrorAction Stop
            $signed = $true
        } catch {
            Write-Warn2 "timestamp failed ($($_.Exception.Message)); signing without timestamp"
        }
    }
    if (-not $signed) {
        $null = Set-AuthenticodeSignature -FilePath $exe -Certificate $cert -HashAlgorithm SHA256 -ErrorAction Stop
    }

    $check = Get-AuthenticodeSignature -FilePath $exe
    if ($check.Status -eq 'Valid') {
        Write-Ok "signature valid -> $($check.SignerCertificate.Subject)"
    } else {
        Write-Warn2 "signature status = $($check.Status) : $($check.StatusMessage)"
    }
}

Write-Host ''
Write-Host 'Done. Notes:' -ForegroundColor Cyan
Write-Host '  - Windows may need a restart (or an Explorer restart) before the'
Write-Host '    "unknown publisher" prompt disappears for an already-cached file.'
Write-Host '  - Publishing to other machines still needs a real CA certificate'
Write-Host '    (OV cert or Azure Trusted Signing); a self-signed cert is only'
Write-Host '    trusted where it was installed.'
Write-Host '  - Re-run this script after every rebuild: the signature is per-file.'
