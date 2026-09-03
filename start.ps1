# start.ps1 - Windows equivalent of start.sh: runs the API + static frontend
# as background jobs from a single PowerShell window, so you don't have to
# keep multiple terminal tabs open (and accidentally close one of them).
#
# Assumes one-time setup is already done: PostgreSQL running, server\.env
# configured, and `npm install` + `npm run migrate` already run inside
# server\ (see CLAUDE.md "Running the dev server").
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File start.ps1
# (or, if your PowerShell execution policy already allows local scripts:
#   .\start.ps1
# )

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$envFile = Join-Path $root "server\.env"
if (-not (Test-Path $envFile)) {
    Write-Error "server\.env not found - create it first (see CLAUDE.md 'Running the dev server')."
    exit 1
}
if (-not (Test-Path (Join-Path $root "server\node_modules"))) {
    Write-Error "server\node_modules not found - run 'npm install' inside server\ first."
    exit 1
}

$portLine = Get-Content $envFile | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
$apiPort = if ($portLine) { ($portLine -split '=', 2)[1].Trim() } else { "8790" }
$staticPort = 8743

# Clean up jobs left over from an earlier run of this script in the same session.
Get-Job -Name "pm-board-api", "pm-board-static" -ErrorAction SilentlyContinue |
    Stop-Job -PassThru -ErrorAction SilentlyContinue | Remove-Job -ErrorAction SilentlyContinue

Write-Host "Starting API on http://localhost:$apiPort ..."
Start-Job -Name "pm-board-api" -ScriptBlock {
    Set-Location (Join-Path $using:root "server")
    npm start
} | Out-Null

Write-Host "Starting static frontend on http://localhost:$staticPort ..."
Start-Job -Name "pm-board-static" -ScriptBlock {
    Set-Location $using:root
    python -m http.server $using:staticPort
} | Out-Null

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "Ready:"
Write-Host "  API      http://localhost:$apiPort/api"
Write-Host "  Frontend http://localhost:$staticPort/login.html"
Write-Host ""
Write-Host "Press Ctrl+C to stop both. Streaming logs below:"
Write-Host ""

try {
    while ($true) {
        Receive-Job -Name "pm-board-api" -ErrorAction SilentlyContinue
        Receive-Job -Name "pm-board-static" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping..."
    Get-Job -Name "pm-board-api", "pm-board-static" -ErrorAction SilentlyContinue |
        Stop-Job -PassThru -ErrorAction SilentlyContinue | Remove-Job -ErrorAction SilentlyContinue
}
