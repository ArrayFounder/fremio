Set-Location "C:\Users\A.r.r.a.y.19\fremio"

# Stage and commit
git add studio/src/app/"(booth)"/b/"[slug]"/screens/BoothSetupScreen.tsx
git commit -m "fix booth: always use port 3002 for agent if available"
git push origin main
Write-Host "Pushed commit."

# Deploy to VPS
$sshKey = "C:\Users\A.r.r.a.y.19\.ssh\fremio_deploy_nopass"
$vps = "root@76.13.192.32"

& "C:\Windows\System32\OpenSSH\ssh.exe" -i $sshKey -o StrictHostKeyChecking=no $vps "cd /root/fremio-studio/studio && git fetch origin && git reset --hard origin/main && npm run build 2>&1 | Select-Object -Last 20"
Write-Host "VPS build done."

& "C:\Windows\System32\OpenSSH\ssh.exe" -i $sshKey -o StrictHostKeyChecking=no $vps "pm2 restart fremio-studio"
Write-Host "Done."