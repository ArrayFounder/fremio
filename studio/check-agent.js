const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const KEY = 'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio_deploy';
const VPS = 'root@76.13.192.32';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Agent Health ===');
  try {
    const health = await httpGet('http://127.0.0.1:3002/health');
    console.log(health.data);
  } catch (e) {
    console.error('Agent not reachable:', e.message);
  }

  console.log('\n=== VPS Agent Health ===');
  const ssh = spawn('ssh', [
    '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', VPS,
    'curl -s http://127.0.0.1:3002/health && echo "" && ps aux | grep -i edsdk | grep -v grep'
  ], { shell: false, windowsHide: false });
  let out = '';
  ssh.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  ssh.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
  ssh.on('close', (code) => {
    if (code !== 0) console.error('VPS SSH exit:', code);
  });
}

main().catch(console.error);