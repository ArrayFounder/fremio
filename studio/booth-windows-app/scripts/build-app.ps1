$env:Path = "C:\Program Files\nodejs;C:\Users\A.r.r.a.y.19\AppData\Roaming\npm;" + $env:Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue

Write-Host "Building ONLY NSIS installer (skip ZIP to save disk space)..."
Write-Host "Node: $(node --version)"

$output = npm run build -- --win nsis 2>&1
$output | Select-Object -Last 20
Write-Host "Exit code: $LASTEXITCODE"
