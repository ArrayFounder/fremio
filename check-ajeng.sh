#!/bin/bash
# Run on server: ssh root@server "bash /tmp/check-ajeng.sh"
cd /root/fremio
node -e "
const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
async function run() {
  // Find user by name
  const u = await pool.query(\"SELECT id, email, display_name FROM users WHERE display_name ILIKE '%ajeng%' OR email ILIKE '%ajeng%' LIMIT 5\");
  console.log('USERS:', JSON.stringify(u.rows));
  
  // Find transactions 
  const t = await pool.query(\"SELECT id, user_id, invoice_number, amount, status, created_at FROM payment_transactions WHERE invoice_number LIKE 'FRM-8ffa%' OR invoice_number LIKE 'FRM-%ULEMS%' ORDER BY created_at DESC LIMIT 10\");
  console.log('TRANSACTIONS:', JSON.stringify(t.rows));
  
  // Check access table
  const a = await pool.query(\"SELECT * FROM user_package_access WHERE created_at > NOW() - INTERVAL '2 days' ORDER BY created_at DESC LIMIT 10\");
  console.log('ACCESS:', JSON.stringify(a.rows));
  
  pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
"
