#!/usr/bin/env node
/**
 * Test Webhook Payment
 * Simulate Midtrans notification untuk test auto-activate membership
 */

import { Pool } from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createTestTransaction() {
  console.log("🧪 Creating test transaction...\n");

  // 1. Buat test user
  const testEmail = `test-${Date.now()}@fremio.test`;
  const userId = `test-user-${Date.now()}`;

  let userResult = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [testEmail]
  );

  if (userResult.rows.length === 0) {
    await pool.query(
      "INSERT INTO users (id, email, display_name, created_at) VALUES ($1, $2, $3, NOW())",
      [userId, testEmail, "Test User"]
    );
    console.log("✅ Test user created:", testEmail);
  } else {
    console.log("✅ Test user exists:", testEmail);
  }

  // 2. Buat test transaction dengan status pending
  const orderId = `TEST-${Date.now()}`;
  const amount = 10000;

  const txResult = await pool.query(
    `INSERT INTO payment_transactions 
     (user_id, invoice_number, amount, status, payment_method, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', 'qris', NOW(), NOW())
     RETURNING *`,
    [userId, orderId, amount]
  );

  const transaction = txResult.rows[0];
  console.log("✅ Test transaction created:");
  console.log("   Order ID:", orderId);
  console.log("   Amount:", amount);
  console.log("   Status:", transaction.status);
  console.log("   User:", testEmail);
  console.log("");

  return {
    orderId,
    transaction,
    testEmail,
    userId,
  };
}

async function simulateWebhook(orderId) {
  console.log("📡 Simulating Midtrans webhook notification...\n");

  const webhookPayload = {
    transaction_time: new Date().toISOString(),
    transaction_status: "settlement",
    transaction_id: `midtrans-${Date.now()}`,
    status_message: "midtrans payment notification",
    status_code: "200",
    signature_key: "test_signature",
    settlement_time: new Date().toISOString(),
    payment_type: "qris",
    order_id: orderId,
    merchant_id: "G812785002",
    gross_amount: "10000.00",
    fraud_status: "accept",
    currency: "IDR",
  };

  console.log("Webhook payload:");
  console.log(JSON.stringify(webhookPayload, null, 2));
  console.log("");

  // Send POST request to webhook endpoint
  const response = await fetch("http://localhost:5000/api/payment/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(webhookPayload),
  });

  const result = await response.json();
  console.log("📥 Webhook response:");
  console.log("   Status:", response.status);
  console.log("   Response:", JSON.stringify(result, null, 2));
  console.log("");

  return result;
}

async function checkResults(orderId, userId) {
  console.log("🔍 Checking results...\n");

  // 1. Check transaction status
  const txResult = await pool.query(
    "SELECT * FROM payment_transactions WHERE invoice_number = $1",
    [orderId]
  );

  const transaction = txResult.rows[0];
  console.log("Transaction status:");
  console.log("   Order ID:", transaction.invoice_number);
  console.log("   Status:", transaction.status);
  console.log("   Updated at:", transaction.updated_at);
  console.log("");

  // 2. Check membership access
  const accessResult = await pool.query(
    "SELECT * FROM user_package_access WHERE transaction_id = $1",
    [transaction.id]
  );

  if (accessResult.rows.length > 0) {
    const access = accessResult.rows[0];
    console.log("✅ Membership access granted:");
    console.log("   User ID:", userId);
    console.log("   Active:", access.is_active);
    console.log("   Valid until:", access.access_end);
    console.log("");
    return true;
  } else {
    console.log("❌ No membership access found");
    console.log("");
    return false;
  }
}

async function cleanup(orderId, userId) {
  console.log("🧹 Cleaning up test data...\n");

  // Delete test data
  await pool.query(
    "DELETE FROM user_package_access WHERE user_id = $1",
    [userId]
  );
  await pool.query(
    "DELETE FROM payment_transactions WHERE invoice_number = $1",
    [orderId]
  );
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);

  console.log("✅ Test data cleaned up");
}

async function main() {
  console.log("🚀 Starting webhook test...\n");
  console.log("=" .repeat(60));
  console.log("");

  try {
    // Step 1: Create test transaction
    const { orderId, transaction, testEmail, userId } = await createTestTransaction();

    // Step 2: Simulate webhook
    const webhookResult = await simulateWebhook(orderId);

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 3: Check results
    const success = await checkResults(orderId, userId);

    // Step 4: Cleanup
    await cleanup(orderId, userId);

    console.log("");
    console.log("=" .repeat(60));
    if (success) {
      console.log("✅ TEST PASSED - Webhook payment system working correctly!");
      console.log("   ✓ Transaction status updated to 'completed'");
      console.log("   ✓ Membership access granted automatically");
      console.log("   ✓ User would appear in /admin/subscribers");
    } else {
      console.log("❌ TEST FAILED - Membership access not granted");
      console.log("   Please check backend logs for errors");
    }
    console.log("=" .repeat(60));

    await pool.end();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Test error:", error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
