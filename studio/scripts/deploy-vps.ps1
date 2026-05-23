$ErrorActionPreference = 'Stop'
$sshKey = "C:\Users\A.r.r.a.y.19\.ssh\fremio_deploy_nopass"
$vps = "root@76.13.192.32"
$localStudio = "C:\Users\A.r.r.a.y.19\fremio\studio"
$vpsStudio = "/root/fremio-studio/studio"

Write-Host "[deploy] SSH connection test..."
$result = & "C:\Windows\System32\OpenSSH\ssh.exe" -i $sshKey -o StrictHostKeyChecking=no -o ConnectTimeout=15 $vps "hostname" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[deploy] SSH FAILED: $result"
    exit 1
}
Write-Host "[deploy] SSH OK: $result"

Write-Host "[deploy] Uploading agent dist/server.js..."
& "C:\Windows\System32\OpenSSH\scp.exe" -i $sshKey -o StrictHostKeyChecking=no "$localStudio\agent\dist\server.js" "$vps`:$vpsStudio/agent/dist/server.js"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[deploy] Uploading agent bin/edsdk-bridge-native.exe..."
& "C:\Windows\System32\OpenSSH\scp.exe" -i $sshKey -o StrictHostKeyChecking=no "$localStudio\agent\bin\edsdk-bridge-native.exe" "$vps`:$vpsStudio/agent/bin/edsdk-bridge-native.exe"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[deploy] Git pull latest code..."
& "C:\Windows\System32\OpenSSH\ssh.exe" -i $sshKey -o StrictHostKeyChecking=no $vps "cd $vpsStudio && git pull" 2>&1

Write-Host "[deploy] Building Next.js (5-10 menit)..."
& "C:\Windows\System32\OpenSSH\ssh.exe" -i $sshKey -o StrictHostKeyChecking=no $vps "cd $vpsStudio && npm run build" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "[deploy] Build FAILED"; exit 1 }

Write-Host "[deploy] Restarting PM2..."
& "C:\Windows\System32\OpenSSH\ssh.exe" -i $sshKey -o StrictHostKeyChecking=no $vps "pm2 restart fremio-studio" 2>&1

Write-Host "[deploy] Done!"