#!/bin/bash
# Grant 30 days access untuk nandaajeng706@gmail.com
# Jalankan: ssh root@76.13.192.32 "bash /tmp/grant-ajeng-30days.sh"
# Atau paste langsung di VPS console

cd /var/www/fremio-backend 2>/dev/null || cd /root/fremio/backend 2>/dev/null || { echo "❌ Cannot find backend dir"; exit 1; }

node --input-type=module << 'EOF'
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

// Try to load .env for DB credentials
try { dotenv.config({ path: ".env" }); } catch {}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD,
});

const TARGET_EMAIL = "nandaajeng706@gmail.com";
const DURATION_DAYS = 30;

async function run() {
  const client = await pool.connect();
  try {
    // 1. Find user
    const uRes = await client.query(
      "SELECT id, email FROM users WHERE lower(email) = $1 LIMIT 1",
      [TARGET_EMAIL.toLowerCase()]
    );
    if (uRes.rows.length === 0) {
      console.error("❌ User tidak ditemukan:", TARGET_EMAIL);
      return;
    }
    const userId = uRes.rows[0].id;
    console.log("✅ User ditemukan:", userId, uRes.rows[0].email);

    // 2. Check existing active access
    const existing = await client.query(
      "SELECT id, access_end, is_active FROM user_package_access WHERE user_id::text = $1 AND is_active = true ORDER BY access_end DESC LIMIT 1",
      [String(userId)]
    );
    if (existing.rows.length > 0) {
      console.log("ℹ️  User sudah punya akses aktif sampai:", existing.rows[0].access_end);
      console.log("   → Akan di-override dengan 30 hari dari sekarang");
    }

    // 3. Create manual transaction
    const invoice = `manual_ajeng_${Date.now()}`;
    const txRes = await client.query(
      `INSERT INTO payment_transactions
         (user_id, invoice_number, amount, status, currency, gateway, transaction_type, created_at, updated_at)
       VALUES ($1, $2, 5000, 'completed', 'IDR', 'manual', 'manual', NOW(), NOW())
       RETURNING id, invoice_number`,
      [userId, invoice]
    );
    const transactionId = txRes.rows[0].id;
    console.log("✅ Manual transaction dibuat:", txRes.rows[0].invoice_number);

    // 4. Deactivate old access
    await client.query(
      "UPDATE user_package_access SET is_active = false WHERE user_id::text = $1 AND is_active = true",
      [String(userId)]
    );

    // 5. Grant 30 days
    const accessEnd = new Date();
    accessEnd.setDate(accessEnd.getDate() + DURATION_DAYS);

    const accessRes = await client.query(
      `INSERT INTO user_package_access
         (user_id, transaction_id, package_ids, access_end, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, access_end, is_active`,
      [userId, transactionId, [1], accessEnd]
    );
    const row = accessRes.rows[0];
    console.log("\n🎉 AKSES 30 HARI BERHASIL DIBERIKAN!");
    console.log("   Email   :", TARGET_EMAIL);
    console.log("   User ID :", userId);
    console.log("   Berlaku sampai:", row.access_end);
    console.log("   Active  :", row.is_active);
    console.log("\n✅ Cek di: https://fremio.id/admin/subscribers");
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
EOF
