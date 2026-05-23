const { spawn } = require('child_process');

const KEY = 'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio_deploy';
const VPS = 'root@76.13.192.32';
const STUDIO_DIR = '/root/fremio-studio/studio';

function ssh(command) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', [
      '-i', KEY,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=15',
      VPS, command
    ], { shell: false, windowsHide: false });

    let out = '';
    proc.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    proc.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`Exit ${code}: ${out}`)));
    proc.on('error', reject);
  });
}

async function deploy() {
  console.log('=== 1. Git pull ===');
  await ssh(`cd ${STUDIO_DIR} && git pull`);

  console.log('=== 2. NPM build ===');
  await ssh(`cd ${STUDIO_DIR} && npm run build`);

  console.log('=== 3. PM2 restart ===');
  await ssh('pm2 restart fremio-studio');

  console.log('=== DONE ===');
}

deploy().catch((e) => {
  console.error('DEPLOY FAILED:', e.message);
  process.exit(1);
});
