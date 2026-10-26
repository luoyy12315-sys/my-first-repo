<#
.SYNOPSIS
    Create (or remove) Lumina desktop + Start Menu shortcuts.

.DESCRIPTION
    Lumina ships as a folder app (desktop\dist\Lumina-win32-x64\Lumina.exe).
    This script makes "double-click on the desktop" work by creating .lnk files
    that point at that exe, using the icon embedded in the exe.

    Idempotent: running it twice just overwrites the same two shortcuts.
    Use -Remove to delete them again (e.g. before uninstalling).

    NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads
    BOM-less files as ANSI, and a GBK lead byte can swallow a closing quote,
    which makes the whole script fail to parse. Keep it ASCII if you edit it,
    or save it as UTF-8 *with* BOM.

.PARAMETER ExePath
    Path to Lumina.exe. Defaults to desktop\dist\Lumina-win32-x64\Lumina.exe
    next to this script.

.PARAMETER Remove
    Delete the shortcuts instead of creating them.

.PARAMETER AllUsers
    Create the Start Menu entry under the machine-wide Start Menu
    (requires an elevated PowerShell session).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-shortcut.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-shortcut.ps1 -Remove
#>
[CmdletBinding()]
param(
    [string]$ExePath,
    [switch]$Remove,
    [switch]$AllUsers
)

$ErrorActionPreference = 'Stop'
$AppName = 'Lumina'

function Write-Step([string]$Message) {
    Write-Host "[shortcut] $Message"
}

# --- resolve the exe -------------------------------------------------------
if (-not $ExePath) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ExePath = Join-Path $scriptDir 'dist\Lumina-win32-x64\Lumina.exe'
}
try {
    $ExePath = (Resolve-Path -LiteralPath $ExePath -ErrorAction Stop).Path
} catch {
    if (-not $Remove) {
        throw "Lumina.exe not found at '$ExePath'. Build it first: cd desktop; npm run build"
    }
    $ExePath = $null
}

# --- target folders --------------------------------------------------------
$desktopDir = [Environment]::GetFolderPath('Desktop')
if (-not $desktopDir) { $desktopDir = Join-Path $env:USERPROFILE 'Desktop' }

if ($AllUsers) {
    $programsDir = [Environment]::GetFolderPath('CommonPrograms')
} else {
    $programsDir = [Environment]::GetFolderPath('Programs')
}
if (-not $programsDir) {
    $programsDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
}

$targets = @(
    (Join-Path $desktopDir "$AppName.lnk"),
    (Join-Path $programsDir "$AppName.lnk")
)

# --- remove ----------------------------------------------------------------
if ($Remove) {
    $removed = 0
    foreach ($lnk in $targets) {
        if (Test-Path -LiteralPath $lnk) {
            Remove-Item -LiteralPath $lnk -Force
            Write-Step "removed $lnk"
            $removed++
        }
    }
    if ($removed -eq 0) { Write-Step 'nothing to remove (already clean).' }
    exit 0
}

# --- create ----------------------------------------------------------------
if (-not (Test-Path -LiteralPath $desktopDir)) {
    New-Item -ItemType Directory -Path $desktopDir -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $programsDir)) {
    New-Item -ItemType Directory -Path $programsDir -Force | Out-Null
}

$workingDir = Split-Path -Parent $ExePath
$iconLocation = "$ExePath,0"

$shell = New-Object -ComObject WScript.Shell
foreach ($lnk in $targets) {
    $shortcut = $shell.CreateShortcut($lnk)
    $shortcut.TargetPath = $ExePath
    $shortcut.WorkingDirectory = $workingDir
    $shortcut.IconLocation = $iconLocation
    $shortcut.Description = 'Lumina - local AI learning workspace'
    $shortcut.WindowStyle = 1
    $shortcut.Save()
    Write-Step "created $lnk"
}

[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
Write-Step "target : $ExePath"
Write-Step 'done. Double-click the Lumina icon on your desktop to start.'