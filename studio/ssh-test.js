const { spawn } = require('child_process');
const path = require('path');

// Try both key locations
// Try all available key locations
const keyPaths = [
  'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio_deploy',   // older key (399 bytes)
  'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio-deploy',   // newer key (444 bytes)
];

const fs = require('fs');
const key = keyPaths.find(p => fs.existsSync(p));
if (!key) {
  console.error('No key found in:', keyPaths);
  process.exit(1);
}
console.log('Using key:', key);

const ssh = spawn('ssh', [
  '-i', key,
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=10',
  '-o', 'BatchMode=yes', // Don't prompt for password
  'root@76.13.192.32',
  'git -C /root/fremio-studio/studio log --oneline -3 && echo CONNECTED',
], {
  shell: false,
  windowsHide: false,
});

let stdout = '';
let stderr = '';

ssh.stdout.on('data', (data) => {
  stdout += data.toString();
  process.stdout.write(data);
});

ssh.stderr.on('data', (data) => {
  stderr += data.toString();
  process.stderr.write(data);
});

ssh.on('close', (code) => {
  console.log('Exit code:', code);
  process.exit(code);
});

ssh.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});