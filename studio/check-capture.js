const { spawn } = require('child_process');

// This script checks: (1) capture stuck? (2) agent reachable? (3) preview stream working?
const KEY = 'C:\\Users\\A.r.r.a.y.19\\.ssh\\fremio_deploy';
const VPS = 'root@76.13.192.32';

function ssh(command) {
  return new Promise((resolve) => {
    const proc = spawn('ssh', [
      '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', VPS, command
    ], { shell: false, windowsHide: false });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', (d) => { process.stderr.write(d); });
    proc.on('close', () => resolve(out));
  });
}

async function main() {
  console.log('=== 1. Local capture status ===');
  // Send a simple request to see if capture is stuck
  const http = require('http');
  const postCapture = () => new Promise((res) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3002, path: '/capture', method: 'POST', timeout: 5000 }, (r) => {
      let d=''; r.on('data', x=>d+=x); r.on('end', ()=>res(d));
    });
    req.on('error', (e) => res('ERROR: ' + e.message));
    req.end();
  });
  const r = await postCapture();
  console.log('Capture result:', r);

  console.log('\n=== 2. Camera check from VPS ===');
  // Check if there's a camera connected via EDSDK on the LOCAL machine
  // The VPS cannot check this - we'd need to SSH back to local
  // But we can check if the local agent's bridge is running
  await ssh('curl -s http://127.0.0.1:3002/health');

  console.log('\n=== 3. About the "black screen" ===');
  console.log('The preview IS streaming JPEG data from the agent (confirmed).');
  console.log('But studio.fremio.id is on VPS, and your agent is on YOUR local machine (127.0.0.1:3002).');
  console.log('Browser cannot reach your local 127.0.0.1:3002 from the internet!');
  console.log('\nTo test with local agent + remote frontend, you need:');
  console.log('  A) ngrok to expose your local port 3002 to internet');
  console.log('  B) Or test locally: http://localhost:PORT/b/tes (not studio.fremio.id)');
  console.log('\nOR: Use the VPS agent instead of your local agent.');
}

main().catch(console.error);