# Restart agent with new /logs endpoint
$node = Get-Process -Id 18108 -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "Stopping agent PID 18108..."
    Stop-Process -Id 18108 -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
}
# Kill any stale bridges
Get-Process | Where-Object { $_.ProcessName -like '*bridge*' -or $_.ProcessName -like '*edsdk*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Bridges cleaned."

# Start agent from correct directory
$agentDir = "C:\Users\A.r.r.a.y.19\fremio\studio\agent"
Write-Host "Starting agent from: $agentDir"
$proc = Start-Process -FilePath "node" -ArgumentList "dist/server.js" -WorkingDirectory $agentDir -WindowStyle Hidden -PassThru
Write-Host "Agent PID: $($proc.Id)"

Start-Sleep 4

# Verify
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Agent UP: $($r.Content)"
    $logs = Invoke-WebRequest -Uri "http://127.0.0.1:3002/logs" -TimeoutSec 5 -UseBasicParsing
    $logData = $logs.Content | ConvertFrom-Json
    Write-Host "Logs endpoint: $($logData.total) lines buffered, uptime=$($logData.uptime)s"
    Write-Host "Latest log lines:"
    $logData.lines | Select-Object -Last 10 | ForEach-Object { Write-Host "  $_" }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}