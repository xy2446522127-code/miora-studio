[CmdletBinding()]
param(
    [int]$Port = 3000,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$activateScript = Join-Path $projectRoot '.venv\Scripts\Activate.ps1'
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw "Virtual environment not found. Run: py -3.12 -m venv `"$projectRoot\.venv`""
}

& $activateScript
$env:PORT = [string]$Port
Set-Location -LiteralPath $projectRoot

Write-Host "花海画布" -ForegroundColor Cyan
Write-Host "Python: $pythonExe"
Write-Host "Open: http://127.0.0.1:$Port/"

if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
        param($Url)
        Start-Sleep -Seconds 3
        Start-Process $Url -WindowStyle Hidden
    } -ArgumentList "http://127.0.0.1:$Port/" | Out-Null
}

& $pythonExe (Join-Path $projectRoot 'main.py')
