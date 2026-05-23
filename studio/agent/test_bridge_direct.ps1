# Run the bridge directly from the bin directory
$br = "C:\Users\A.r.r.a.y.19\fremio\studio\agent\bin\edsdk-bridge-native.exe"
$errLog = "$env:TEMP\bridge_direct_err.log"
$outLog = "$env:TEMP\bridge_direct_out.log"
$tmp = "$env:TEMP\fremio-direct-capture.jpg"

Write-Host "Running bridge with EDSDK.dll in same directory..."
Write-Host "Bridge: $br"
Write-Host "Log: $errLog"

$proc = Start-Process $br -ArgumentList "capture-armed","--output",$tmp -WorkingDirectory "C:\Users\A.r.r.a.y.19\fremio\studio\agent\bin" -NoNewWindow -PassThru -RedirectStandardError $errLog -RedirectStandardOutput $outLog
Write-Host "PID: $($proc.Id)"

# Wait 30 seconds for it to finish
$didExit = $proc.WaitForExit(30000)
Write-Host "Did exit: $didExit, ExitCode: $($proc.ExitCode)"

Write-Host "--- STDERR ---"
if (Test-Path $errLog) { Get-Content $errLog }
Write-Host "--- STDOUT ---"
if (Test-Path $outLog) { Get-Content $outLog }
Write-Host "Output file exists: $(Test-Path $tmp)"
if (Test-Path $tmp) {
    Write-Host "Size: $((Get-Item $tmp).Length) bytes"
}