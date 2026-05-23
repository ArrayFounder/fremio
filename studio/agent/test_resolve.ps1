foreach ($p in @(
    "C:\Users\A.r.r.a.y.19\fremio\studio\agent\dist\server.js",
    "C:\Users\A.r.r.a.y.19\fremio\dist\server.js",
    "C:\Users\A.r.r.a.y.19\fremio\agent\dist\server.js"
)) {
    Write-Host "$p : $(Test-Path $p)"
}

# Check node command line
$nodeProc = Get-CimInstance Win32_Process -Filter "ProcessId=10304"
Write-Host "Node CMD: $($nodeProc.CommandLine)"
Write-Host "Node CWD: $($nodeProc.WorkingDirectory)"

# Let's try to see if bridge has a specific resolve path from server.ts
# server.ts resolveEdsdkBridgePath checks these roots:
$roots = @(
    "C:\Users\A.r.r.a.y.19\fremio\studio\agent\dist",
    (Split-Path "C:\Users\A.r.r.a.y.19\fremio\studio\agent\dist" -Parent),
    (Split-Path (Get-Process -Id 10304).Path -Parent),
    (Split-Path (Get-Process -Id 10304).Path -Parent)
)
$roots = $roots | Select-Object -Unique
foreach ($r in $roots) {
    $br = Join-Path $r "bin\edsdk-bridge-native.exe"
    $dll = Join-Path $r "bin\EDSDK.dll"
    Write-Host "Bridge at $br : $(Test-Path $br)"
    Write-Host "EDSDK.dll at $dll : $(Test-Path $dll)"
}