# Restart agent with 1500ms USB settle fix
Get-Process | Where-Object { $_.ProcessName -like '*bridge*' -or $_.ProcessName -like '*edsdk*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Id 18320 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2
Write-Host "Bridges and old agent killed."

$agentDir = "C:\Users\A.r.r.a.y.19\fremio\studio\agent"
$proc = Start-Process -FilePath "node" -ArgumentList "dist/server.js" -WorkingDirectory $agentDir -WindowStyle Hidden -PassThru
Write-Host "Agent started PID: $($proc.Id)"
Start-Sleep 4

try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Agent UP: $($r.Content)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}