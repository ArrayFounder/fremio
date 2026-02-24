#!/usr/bin/env node
/**
 * Manual Reconciliation Script
 * Manually check Midtrans status for specific orders and activate membership
 */

import { Pool } from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import midtransClient from "midtrans-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Midtrans
const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const core = new midtransClient.CoreApi({
  isProduction,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

const ORDER_IDS = [
  "FRM-6b1f9eeb-1771589698466-DOD18W",
  "FRM-17e8b02b-1771572004595-GN7LU5",
];

async function reconcileOrder(orderId) {
  console.log(`\n🔍 Checking order: ${orderId}`);

  try {
    // 1. Get status from Midtrans
    console.log("📡 Fetching status from Midtrans...");
    const status = await core.transaction.status(orderId);
    console.log("Midtrans status:", {
      transaction_status: status.transaction_status,
      payment_type: status.payment_type,
      gross_amount: status.gross_amount,
      transaction_time: status.transaction_time,
      settlement_time: status.settlement_time,
    });

    // 2. Check if payment is successful
    const isPaid =
      status.transaction_status === "settlement" ||
      status.transaction_status === "capture" ||
      status.transaction_status === "completed";

    if (!isPaid) {
      console.log(`⚠️ Payment not settled yet. Status: ${status.transaction_status}`);
      return;
    }

    console.log("✅ Payment confirmed as PAID");

    // 3. Find or create transaction in database
    const email = status.customer_details?.email || status.customer_details?.email_address;
    console.log("📧 Customer email:", email);

    // Check if transaction exists
    let txResult = await pool.query(
      "SELECT * FROM payment_transactions WHERE invoice_number = $1",
      [orderId]
    );

    let transaction = txResult.rows[0];
    let userId;

    if (!transaction) {
      console.log("⚠️ Transaction not found in database, creating...");

      // Find user by email
      const userResult = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email]
      );

      if (userResult.rows.length === 0) {
        console.log(`❌ User not found with email: ${email}`);
        return;
      }

      userId = userResult.rows[0].id;

      // Create transaction
      const insertResult = await pool.query(
        `INSERT INTO payment_transactions 
         (user_id, invoice_number, customer_email, amount, status, payment_method, 
          midtrans_transaction_id, midtrans_response, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [
          userId,
          orderId,
          email,
          status.gross_amount,
          "completed",
          status.payment_type,
          status.transaction_id,
          JSON.stringify(status),
        ]
      );

      transaction = insertResult.rows[0];
      console.log("✅ Transaction created in database");
    } else {
      console.log("✅ Transaction found in database");
      userId = transaction.user_id;

      // Update status if needed
      if (transaction.status !== "completed") {
        await pool.query(
          `UPDATE payment_transactions 
           SET status = $1, updated_at = NOW()
           WHERE invoice_number = $2`,
          ["completed", orderId]
        );
        console.log("✅ Transaction status updated to completed");
      }
    }

    // 4. Grant membership access using user_package_access table
    // Check if access already granted for this transaction
    const accessCheck = await pool.query(
      "SELECT * FROM user_package_access WHERE transaction_id = $1",
      [transaction.id]
    );

    if (accessCheck.rows.length > 0) {
      console.log("✅ Access already granted. End date:", accessCheck.rows[0].access_end);
    } else {
      // Grant new access for 30 days
      const accessEndDate = new Date();
      accessEndDate.setDate(accessEndDate.getDate() + 30);

      // Deactivate any existing active access for this user
      await pool.query(
        "UPDATE user_package_access SET is_active = false WHERE user_id = $1 AND is_active = true",
        [userId]
      );

      // Grant new access
      await pool.query(
        `INSERT INTO user_package_access 
         (user_id, transaction_id, package_ids, access_end, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [userId, transaction.id, [], accessEndDate]
      );

      console.log("✅ Membership access granted! Valid until:", accessEndDate.toISOString());
    }

    console.log("🎉 Reconciliation complete for", orderId);
  } catch (error) {
    console.error(`❌ Error reconciling ${orderId}:`, error.message);
    if (error.httpStatusCode) {
      console.error(`HTTP Status: ${error.httpStatusCode}`);
    }
  }
}

async function main() {
  console.log("🚀 Starting manual reconciliation...");
  console.log("Orders to reconcile:", ORDER_IDS);

  for (const orderId of ORDER_IDS) {
    await reconcileOrder(orderId);
  }

  console.log("\n✅ All reconciliations complete!");
  await pool.end();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
