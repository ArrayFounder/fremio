const { spawn } = require('child_process');
const KEY = 'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio_deploy';
const VPS = 'root@76.13.192.32';
const cmd = [
  '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', VPS,
  'cd /root/fremio-studio/studio && git log --oneline -5 && echo "" && pm2 show fremio-studio | grep -E "uptime|status"'
];
const ssh = spawn('ssh', cmd, { shell: false, windowsHide: false });
ssh.stdout.on('data', (d) => process.stdout.write(d));
ssh.stderr.on('data', (d) => process.stderr.write(d));
ssh.on('close', (code) => process.exit(code));