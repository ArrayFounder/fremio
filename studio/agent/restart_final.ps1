# Restart agent with /prepare-capture fix
Get-Process | Where-Object { $_.ProcessName -like '*bridge*' -or $_.ProcessName -like '*edsdk*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object { $_.ProcessName -eq 'node' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 3
Write-Host "All processes killed."

$agentDir = "C:\Users\A.r.r.a.y.19\fremio\studio\agent"
$proc = Start-Process -FilePath "node" -ArgumentList "dist/server.js" -WorkingDirectory $agentDir -WindowStyle Hidden -PassThru
Write-Host "Agent PID: $($proc.Id)"
Start-Sleep 5

try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Agent UP: $($r.Content)"
} catch {
    Write-Host "Agent ERROR: $($_.Exception.Message)"
}