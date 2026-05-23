# Kill ALL stale bridge/edsdk processes
Get-Process | Where-Object { $_.ProcessName -like '*bridge*' -or $_.ProcessName -like '*edsdk*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

Write-Host "=== 1. Checking agent is still running ==="
$agentHealth = Invoke-WebRequest -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5 -UseBasicParsing
Write-Host $agentHealth.Content

Write-Host "=== 2. Camera status ==="
$agentStatus = Invoke-WebRequest -Uri "http://127.0.0.1:3002/status" -TimeoutSec 10 -UseBasicParsing
Write-Host $agentStatus.Content

Write-Host "=== 3. Testing /capture endpoint ==="
$stopWatch = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $capture = Invoke-WebRequest -Uri "http://127.0.0.1:3002/capture" -Method POST -TimeoutSec 120 -UseBasicParsing
    $stopWatch.Stop()
    Write-Host "Capture SUCCEEDED in $($stopWatch.ElapsedMilliseconds)ms"
    Write-Host "Status: $($capture.StatusCode)"
    Write-Host "Response: $($capture.Content)"
} catch {
    $stopWatch.Stop()
    Write-Host "Capture FAILED after $($stopWatch.ElapsedMilliseconds)ms"
    Write-Host $_.Exception.Message
    Write-Host $_.Exception.Response.Content
}