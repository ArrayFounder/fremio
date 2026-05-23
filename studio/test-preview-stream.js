const { spawn } = require('child_process');

// Start agent with output visible
const agent = spawn('node', ['dist/server.js'], {
  cwd: 'C:\\Users\\A.r.r.a.y.19\\fremio\\studio\\agent',
  shell: false, windowsHide: false, stdio: ['pipe', 'pipe', 'pipe']
});

agent.stdout.on('data', (d) => process.stdout.write(d));
agent.stderr.on('data', (d) => process.stderr.write(d));

// After 3s, request preview stream from a new HTTP request
setTimeout(() => {
  const http = require('http');
  const req = http.request({
    hostname: '127.0.0.1', port: 3002, path: '/preview-stream',
    method: 'GET', timeout: 20000
  }, (res) => {
    let bytes = 0;
    let firstJpeg = false;
    res.on('data', (chunk) => {
      bytes += chunk.length;
      if (!firstJpeg && chunk.indexOf(Buffer.from([0xFF, 0xD8, 0xFF])) >= 0) {
        firstJpeg = true;
        console.log('\n>>> JPEG FRAME RECEIVED! ' + bytes + ' bytes so far\n');
      }
    });
    res.on('end', () => {
      console.log('\n=== Stream ended. Total: ' + bytes + ' bytes ===');
      agent.kill();
      process.exit(0);
    });
  });
  req.on('error', (e) => { console.error('Error:', e.message); agent.kill(); process.exit(1); });
  req.on('timeout', () => { req.destroy(); console.log('\n=== Stream timeout after 20s ==='); agent.kill(); process.exit(0); });
  req.end();
}, 3000);

process.on('SIGINT', () => { agent.kill(); process.exit(0); });