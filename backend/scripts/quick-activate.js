#!/usr/bin/env node
/**
 * Quick Activation Script
 * Directly activate membership for paid users without Midtrans API calls
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

const ORDER_IDS = [
  "FRM-6b1f9eeb-1771589698466-DOD18W",
  "FRM-17e8b02b-1771572004595-GN7LU5",
];

async function activateMembership(orderId) {
  console.log(`\n🔍 Activating membership for order: ${orderId}`);

  try {
    // 1. Get transaction from database
    const txResult = await pool.query(
      "SELECT * FROM payment_transactions WHERE invoice_number = $1",
      [orderId]
    );

    if (txResult.rows.length === 0) {
      console.log(`❌ Transaction not found in database`);
      return;
    }

    const transaction = txResult.rows[0];
    console.log("✅ Transaction found:", {
      id: transaction.id,
      user_id: transaction.user_id,
      amount: transaction.amount,
      status: transaction.status,
      customer_email: transaction.customer_email,
    });

    // 2. Update status to completed if not already
    if (transaction.status !== "completed") {
      await pool.query(
        "UPDATE payment_transactions SET status = 'completed', updated_at = NOW() WHERE id = $1",
        [transaction.id]
      );
      console.log("✅ Transaction status updated to completed");
    }

    // 3. Check if access already granted
    const accessCheck = await pool.query(
      "SELECT * FROM user_package_access WHERE transaction_id = $1",
      [transaction.id]
    );

    if (accessCheck.rows.length > 0) {
      console.log("ℹ️ Access already granted. End date:", accessCheck.rows[0].access_end);
      console.log("ℹ️ Is active:", accessCheck.rows[0].is_active);
      return;
    }

    // 4. Grant membership access
    const accessEndDate = new Date();
    accessEndDate.setDate(accessEndDate.getDate() + 30); // 30 days

    // Deactivate any existing active access
    await pool.query(
      "UPDATE user_package_access SET is_active = false WHERE user_id = $1 AND is_active = true",
      [transaction.user_id]
    );

    // Grant new access
    await pool.query(
      `INSERT INTO user_package_access 
       (user_id, transaction_id, package_ids, access_end, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [transaction.user_id, transaction.id, [], accessEndDate]
    );

    console.log("🎉 Membership activated! Valid until:", accessEndDate.toISOString());
  } catch (error) {
    console.error(`❌ Error activating ${orderId}:`, error.message);
  }
}

async function main() {
  console.log("🚀 Starting quick membership activation...");

  for (const orderId of ORDER_IDS) {
    await activateMembership(orderId);
  }

  console.log("\n✅ All activations complete!");
  await pool.end();
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
