const http = require('http');
const fs = require('fs');

// Try to get a preview frame from the agent
function httpReq(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
        // As we receive data, write to stdout so we can see something
        process.stdout.write(chunk.slice(0, 100).toString('hex').slice(0, 80) + '...');
      });
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('=== Testing /preview-stream ===');
  try {
    const reqOptions = {
      hostname: '127.0.0.1', port: 3002, path: '/preview-stream',
      method: 'GET', timeout: 5000
    };
    const r = await httpReq(reqOptions);
    console.log('\nStatus:', r.status);
    console.log('Content-Type:', r.headers['content-type']);
    console.log('Data received:', r.data.length, 'bytes');
    if (r.data.length > 0) {
      // Check if it's JPEG header
      const hex = r.data.slice(0, 4).toString('hex');
      console.log('First 4 bytes hex:', hex, '(FFD8FF = JPEG start)');
    }
  } catch(e) {
    console.error('Preview stream error:', e.message);
  }

  console.log('\n=== Testing /preview-frame ===');
  try {
    const reqOptions = {
      hostname: '127.0.0.1', port: 3002, path: '/preview-frame',
      method: 'GET', timeout: 5000
    };
    const r = await httpReq(reqOptions);
    console.log('\nStatus:', r.status);
    console.log('Content-Type:', r.headers['content-type']);
    console.log('Data received:', r.data.length, 'bytes');
  } catch(e) {
    console.error('Preview frame error:', e.message);
  }

  console.log('\n=== Testing /capture (POST - should be rejected if still busy) ===');
  try {
    const reqOptions = {
      hostname: '127.0.0.1', port: 3002, path: '/capture',
      method: 'POST', timeout: 3000
    };
    const r = await httpReq(reqOptions);
    console.log('Capture:', r.data);
  } catch(e) {
    console.error('Capture:', e.message);
  }
}

main().catch(console.error);