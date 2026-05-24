# Restart agent from correct directory with FPS counter
$agentDir = "C:\Users\A.r.r.a.y.19\fremio\studio\agent"
$nodeProc = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -notlike "*npm*" }
if ($nodeProc) {
    Write-Host "Killing old node PIDs: $($nodeProc.Id)"
    Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
}

# Kill any stale bridges
Get-Process | Where-Object { $_.ProcessName -like '*bridge*' -or $_.ProcessName -like '*edsdk*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Stale bridges cleaned."

Start-Sleep 1

$proc = Start-Process -FilePath "node" -ArgumentList "dist/server.js" -WorkingDirectory $agentDir -WindowStyle Hidden -PassThru
Write-Host "Agent started PID: $($proc.Id) from: $agentDir"
Start-Sleep 4

try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Agent UP: $($r.Content)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}