# Kill ALL stale processes
Get-Process | Where-Object { $_.ProcessName -like '*bridge*' -or $_.ProcessName -like '*edsdk*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object { $_.ProcessName -eq 'node' } | Select-Object Id, Path | Format-Table -AutoSize

# Kill node process 10304 (the agent)
$node = Get-Process -Id 10304 -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "Stopping node agent PID 10304..."
    Stop-Process -Id 10304 -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    Write-Host "Node stopped."
}

# Verify agent is down
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 2 -UseBasicParsing
    Write-Host "WARNING: Agent still up: $($r.Content)"
} catch {
    Write-Host "Agent confirmed stopped."
}

# Restart the agent from the correct working directory
$agentDir = "C:\Users\A.r.r.a.y.19\fremio\studio\agent"
Write-Host "Starting agent from: $agentDir"
$proc = Start-Process -FilePath "node" -ArgumentList "dist/server.js" -WorkingDirectory $agentDir -WindowStyle Hidden -PassThru
Write-Host "Agent started as PID: $($proc.Id)"
Start-Sleep 3

# Verify agent is up
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Agent UP: $($r.Content)"
} catch {
    Write-Host "ERROR: Agent not responding: $($_.Exception.Message)"
}

Write-Host "=== Agent is ready for testing ==="