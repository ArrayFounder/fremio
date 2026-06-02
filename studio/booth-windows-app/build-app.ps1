$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue
$sevenZip = ".\node_modules\7zip-bin\win\x64\7za.exe"
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
New-Item -Path $cacheDir -ItemType Directory -Force
if (Test-Path "$env:TEMP\winCodeSign-2.6.0.7z") {
    & $sevenZip x -bd "$env:TEMP\winCodeSign-2.6.0.7z" "-o$cacheDir" -y 2>$null
}
New-Item -Path "$cacheDir\darwin\10.12\lib" -ItemType Directory -Force
"" | Set-Content "$cacheDir\darwin\10.12\lib\libcrypto.dylib"
"" | Set-Content "$cacheDir\darwin\10.12\lib\libssl.dylib"

$ErrorActionPreference = "Continue"
Write-Host "=== Building Windows installer ==="
npm run build
Write-Host "=== Build exit code: $LASTEXITCODE ==="