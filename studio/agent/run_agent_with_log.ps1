$ErrorActionPreference = 'Stop'
$agentDir = "C:\Users\A.r.r.a.y.19\fremio\studio\agent"

# Kill existing agent processes
Write-Host "[agent] Stopping existing agent processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start agent with log output
Write-Host "[agent] Starting agent..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Set-Location $agentDir
npm start 2>&1 | ForEach-Object {
    $line = $_
    # Color coding
    if ($line -match "error|Error|ERROR|fail|Fail|FAIL") {
        Write-Host $line -ForegroundColor Red
    } elseif ($line -match "warn|Warn|WARN") {
        Write-Host $line -ForegroundColor Yellow
    } elseif ($line -match "ready|Ready|READY|listening|started|BRIDGE_READY") {
        Write-Host $line -ForegroundColor Green
    } elseif ($line -match "SHOOT|capture|Capture|capture|CAPTURE") {
        Write-Host $line -ForegroundColor Magenta
    } elseif ($line -match "preview|Preview|PREVIEW|mjpeg|MJPEG|live view") {
        Write-Host $line -ForegroundColor Cyan
    } else {
        Write-Host $line -ForegroundColor White
    }
}
