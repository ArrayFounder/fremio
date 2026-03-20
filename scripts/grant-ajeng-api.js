#!/usr/bin/env node
/**
 * Grant 30 days access to nandaajeng706@gmail.com via API
 */
const https = require('https');

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'fremio.id',
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      timeout: 25000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (postData) req.write(postData);
    req.end();
  });
}

function apiPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const opts = {
      hostname: 'fremio.id',
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`,
      },
      timeout: 25000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(postData);
    req.end();
  });
}

async function main() {
  // Step 1: Login as admin
  console.log('🔐 Logging in as admin...');
  const loginRes = await apiCall('POST', '/api/auth/login', {
    email: 'admin@fremio.com',
    password: 'admin123',
  });
  console.log(`   Login status: ${loginRes.status}`);

  if (loginRes.status !== 200 || !loginRes.body?.token) {
    console.error('❌ Login gagal:', JSON.stringify(loginRes.body, null, 2));
    process.exit(1);
  }

  const token = loginRes.body.token;
  console.log('✅ Login berhasil');

  // Step 2: Grant 30 days using sync-order (to check Midtrans status first)
  console.log('\n📡 Calling /api/admin/subscribers/sync-order ...');
  const result = await apiCall('POST', '/api/admin/subscribers/sync-order', {
    orderId: 'FRM-8ffa2912-1772070349488-ULEMS1',
    email: 'nandaajeng706@gmail.com',
  }, token);

  console.log(`\n📥 Status: ${result.status}`);
  console.log('📦 Response:', JSON.stringify(result.body, null, 2));

  if (result.status === 200 && result.body?.success) {
    console.log('\n✅ Sync-order berhasil!', result.body.message);
    if (result.body.data?.status === 'settlement') {
      console.log('   Akses sudah diberikan sesuai jumlah pembayaran.');
    } else {
      console.log('   Status Midtrans:', result.body.data?.status);
      console.log('\n   Jika status bukan settlement, akan grant manual 30 hari...');
      await grantManual30Days(token);
    }
  } else {
    console.log('\n⚠️  Sync-order response, lanjut ke grant manual...');
    console.log('Response:', JSON.stringify(result.body));
    await grantManual30Days(token);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
