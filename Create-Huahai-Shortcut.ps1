[CmdletBinding()]
param(
    [switch]$SkipDesktop
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $projectRoot 'run.bat'
$iconPath = Join-Path $projectRoot 'static\images\huahai-launcher.ico'
$huahaiName = -join @(
    [char]0x82B1,
    [char]0x6D77,
    [char]0x753B,
    [char]0x5E03
)
$launchName = (-join @([char]0x542F, [char]0x52A8)) + $huahaiName

if (-not (Test-Path -LiteralPath $targetPath)) {
    throw "Launcher not found: $targetPath"
}

if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Icon not found: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell

function New-HuahaiShortcut {
    param([Parameter(Mandatory)][string]$ShortcutPath)

    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $targetPath
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Description = $launchName
    $shortcut.WindowStyle = 1
    $shortcut.Save()
}

$projectShortcut = Join-Path $projectRoot ($launchName + '.lnk')
New-HuahaiShortcut -ShortcutPath $projectShortcut
Write-Host "Created: $projectShortcut" -ForegroundColor Cyan

if (-not $SkipDesktop) {
    $desktopPath = $shell.SpecialFolders.Item('Desktop')
    $desktopShortcut = Join-Path $desktopPath ($launchName + '.lnk')
    New-HuahaiShortcut -ShortcutPath $desktopShortcut
    Write-Host "Created: $desktopShortcut" -ForegroundColor Cyan
}
