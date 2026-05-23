$ErrorActionPreference = 'Continue'
$netstat = & netstat -ano
$line = $netstat | Where-Object { $_ -match ':3002\s+.*LISTENING' }
if ($line -match '\s(\d+)\s*$') {
    $procId = $matches[1]
    Write-Host "Killing PID $procId"
    Stop-Process -Id $procId -Force
    Start-Sleep -Milliseconds 2000
}
Write-Host "Starting agent..."
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "C:\Users\A.r.r.a.y.19\fremio\studio\agent\dist\server.js" -WorkingDirectory "C:\Users\A.r.r.a.y.19\fremio\studio\agent" -NoNewWindow -RedirectStandardOutput "C:\Users\A.r.r.a.y.19\agent-out.log"
Start-Sleep -Milliseconds 2000
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5
    Write-Host "Agent up: $($r.Content)"
} catch {
    Write-Host "Agent check failed: $_"
}