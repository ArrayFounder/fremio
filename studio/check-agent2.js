const { spawn } = require('child_process');
const http = require('http');

const KEY = 'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio_deploy';
const VPS = 'root@76.13.192.32';
const LOCAL = '127.0.0.1:3002';

function httpPost(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname,
      method: 'POST', timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  // Check local agent
  console.log('=== LOCAL AGENT (127.0.0.1:3002) ===');
  try {
    const h = await new Promise((res, rej) => {
      http.get('http://127.0.0.1:3002/health', (r) => { let d=''; r.on('data',(x)=>d+=x); r.on('end',()=>res(d)); }).on('error',rej);
    });
    console.log('Health:', h);
  } catch(e) { console.error('Health failed:', e.message); }

  // Try POST /capture - if it says "capture sedang berlangsung", agent is stuck
  console.log('\n--- Testing /capture (POST) ---');
  try {
    const r = await httpPost('http://127.0.0.1:3002/capture');
    console.log('Capture result:', r.data);
  } catch(e) { console.error('Capture failed:', e.message); }

  // Check on VPS
  console.log('\n=== VPS AGENT ===');
  const cmd = [
    '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', VPS,
    'curl -s http://127.0.0.1:3002/health && echo "" && ps aux | grep -i "edsdk\\|bridge\\|fremio" | grep -v grep'
  ];
  const ssh = spawn('ssh', cmd, { shell: false, windowsHide: false });
  let out = '';
  ssh.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  ssh.stderr.on('data', (d) => { process.stderr.write(d); });
  ssh.on('close', () => console.log('\nVPS check done.'));
}

main().catch(console.error);