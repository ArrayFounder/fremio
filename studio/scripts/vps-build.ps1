$SSH_KEY = "$HOME\.ssh\fremio_deploy_nopass"
$SSH_CMD = "C:\Windows\System32\OpenSSH\ssh.exe"
$VPS = "root@76.13.192.32"
$STUDIO_PATH = "/root/fremio-studio/studio"

$buildCmd = "cd $STUDIO_PATH && npm run build 2>&1"
$proc = [System.Diagnostics.Process]::Start(@{
    FileName = $SSH_CMD
    Arguments = "-i `"$SSH_KEY`" -o StrictHostKeyChecking=no $VPS `"$buildCmd`"
    RedirectStandardOutput = $true
    RedirectStandardError = $true
    UseShellExecute = $false
    CreateNoWindow = $true
})
$stdout = $proc.StandardOutput.ReadToEnd()
$proc.WaitForExit()
$ec = $proc.ExitCode
Write-Host "status" $ec
$lines = $stdout -split "`n" | Where-Object { $_ }
$lines | Select-Object -Last 10