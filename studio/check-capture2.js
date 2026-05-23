const { spawn } = require('child_process');
const http = require('http');

// Check capture status
function httpPost(path) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3002, path, method: 'POST', timeout: 3000 }, (r) => {
      let d = ''; r.on('data', x => d += x); r.on('end', () => resolve(d));
    });
    req.on('error', (e) => resolve('ERROR: ' + e.message));
    req.on('timeout', () => { req.destroy(); resolve('TIMEOUT'); });
    req.end();
  });
}

async function main() {
  console.log('=== Capture status ===');
  const r = await httpPost('/capture');
  console.log(r);

  console.log('\n=== Agent logs (if any) ===');
  // The agent output went to background process. Let's restart it with output visible.
  const agent = spawn('node', ['dist/server.js'], {
    cwd: 'C:\\Users\\A.r.r.a.y.19\\fremio\\studio\\agent',
    shell: true, windowsHide: false, stdio: 'pipe'
  });

  let out = '';
  agent.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  agent.stderr.on('data', (d) => { out += d; process.stderr.write(d); });

  // Wait 5s for startup
  await new Promise(r => setTimeout(r, 5000));

  agent.kill();
  console.log('\nAgent died or killed. Checking...\n');

  // Try capture again
  const r2 = await httpPost('/capture');
  console.log('Capture after agent restart:', r2);
}

main().catch(console.error);