const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Start the agent and capture its output
const agent = spawn('node', ['dist/server.js'], {
  cwd: 'C:\\Users\\A.r.r.a.y.19\\fremio\\studio\\agent',
  shell: false, windowsHide: false, stdio: ['pipe', 'pipe', 'pipe']
});

let agentOut = '';
agent.stdout.on('data', (d) => { agentOut += d; process.stdout.write(d); });
agent.stderr.on('data', (d) => { agentOut += d; process.stderr.write(d); });

// Test preview stream request
async function testPreview() {
  await new Promise(r => setTimeout(r, 3000)); // Wait for agent startup

  console.log('=== Requesting /preview-stream ===');
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 3002, path: '/preview-stream',
      method: 'GET', timeout: 10000
    }, (res) => {
      let bytes = 0;
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.on('end', () => {
        console.log(`/preview-stream returned ${bytes} bytes, status ${res.statusCode}`);
        resolve();
      });
    });
    req.on('error', (e) => { console.error('Preview stream error:', e.message); resolve(); });
    req.on('timeout', () => { req.destroy(); console.log('Preview stream timeout (no data)'); resolve(); });
    req.end();
  });
}

async function main() {
  await testPreview();

  console.log('\n=== Agent output ===');
  console.log(agentOut);

  agent.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); agent.kill(); process.exit(1); });