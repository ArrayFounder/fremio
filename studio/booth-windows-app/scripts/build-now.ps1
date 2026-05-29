$env:Path = "C:\Program Files\nodejs;C:\Users\A.r.r.a.y.19\AppData\Roaming\npm;" + $env:Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue

Set-Location "C:\Users\A.r.r.a.y.19\fremio\studio\booth-windows-app"
Write-Host "Node: $(node --version)"
Write-Host "CWD: $(Get-Location)"
Write-Host "Building Electron app..."

npm run build 2>&1
Write-Host "Exit code: $LASTEXITCODE"