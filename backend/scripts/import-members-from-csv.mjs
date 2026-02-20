#!/usr/bin/env node
/**
 * Import Members from CSV Files
 * 
 * This script imports transaction data from CSV files and creates active members
 * with access until March 20, 2026.
 * 
 * Usage: node import-members-from-csv.mjs <csv-file-1> <csv-file-2> ...
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import { parse } from "csv-parse/sync";

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
});

/**
 * Create the deactivate_expired_access function if it doesn't exist
 */
async function createDeactivateFunction() {
  console.log("📝 Creating deactivate_expired_access function...");
  
  const sql = `
    CREATE OR REPLACE FUNCTION deactivate_expired_access()
    RETURNS void AS $$
    BEGIN
      UPDATE user_package_access
      SET is_active = FALSE
      WHERE is_active = TRUE
        AND access_end <= NOW();
    END;
    $$ LANGUAGE plpgsql;
  `;
  
  try {
    await pool.query(sql);
    console.log("✅ Function created successfully");
  } catch (error) {
    console.error("❌ Error creating function:", error.message);
    throw error;
  }
}

/**
 * Get or create user ID from email
 */
async function getOrCreateUserId(email) {
  if (!email) return null;
  
  // First, try to find existing user
  const findQuery = `
    SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1
  `;
  
  const result = await pool.query(findQuery, [email.toLowerCase()]);
  
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  
  // If user doesn't exist, create a new one with a dummy password hash
  // Users will need to reset password if they want to login
  const dummyPasswordHash = "$2b$10$dummyhashforcsvimp0rtedusers1234567890abcdefghij";
  
  const insertQuery = `
    INSERT INTO users (email, password_hash, display_name, email_verified, created_at, updated_at)
    VALUES ($1, $2, $3, FALSE, NOW(), NOW())
    RETURNING id
  `;
  
  // Extract name from email (before @)
  const displayName = email.split("@")[0];
  
  const insertResult = await pool.query(insertQuery, [email.toLowerCase(), dummyPasswordHash, displayName]);
  return insertResult.rows[0].id;
}

/**
 * Create or update payment transaction
 */
async function createOrUpdateTransaction(orderId, transactionId, email, amount = 10000) {
  // Check if transaction already exists by order ID
  const checkQuery = `
    SELECT id FROM payment_transactions 
    WHERE invoice_number = $1
    LIMIT 1
  `;
  
  const checkResult = await pool.query(checkQuery, [orderId]);
  
  if (checkResult.rows.length > 0) {
    return checkResult.rows[0].id;
  }
  
  // Get or create user
  const userId = await getOrCreateUserId(email);
  
  if (!userId) {
    console.warn(`⚠️  No user ID for email: ${email}`);
    return null;
  }
  
  // Generate a UUID for the transaction ID
  // If transactionId is already a valid UUID, use it; otherwise generate new one
  let txUuid;
  try {
    // Try to parse as UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(transactionId)) {
      txUuid = transactionId;
    } else {
      // Generate new UUID
      const { rows } = await pool.query('SELECT gen_random_uuid() as uuid');
      txUuid = rows[0].uuid;
    }
  } catch (error) {
    // If error, generate new UUID
    const { rows } = await pool.query('SELECT gen_random_uuid() as uuid');
    txUuid = rows[0].uuid;
  }
  
  // Create new transaction
  const insertQuery = `
    INSERT INTO payment_transactions (
      id,
      user_id,
      invoice_number,
      amount,
      currency,
      status,
      gateway,
      gateway_transaction_id,
      payment_method,
      transaction_type,
      paid_at,
      created_at,
      updated_at
    ) VALUES (
      $1::uuid,
      $2,
      $3,
      $4,
      'IDR',
      'completed',
      'midtrans',
      $5,
      'gopay',
      'one_time',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (invoice_number) DO UPDATE
    SET updated_at = NOW()
    RETURNING id
  `;
  
  try {
    const insertResult = await pool.query(insertQuery, [
      txUuid,
      userId,
      orderId,
      amount,
      transactionId  // Store original transaction ID as gateway_transaction_id
    ]);
    
    return insertResult.rows.length > 0 ? insertResult.rows[0].id : txUuid;
  } catch (error) {
    console.error(`❌ Error creating transaction for ${orderId}:`, error.message);
    return null;
  }
}

/**
 * Grant access to user until March 20, 2026
 */
async function grantAccess(userId, transactionId, accessEnd = '2026-03-20 23:59:59') {
  // Get all available frame packages (we'll grant access to first 3)
  const packagesQuery = `
    SELECT id FROM frame_packages 
    WHERE is_active = true 
    ORDER BY id 
    LIMIT 3
  `;
  
  const packagesResult = await pool.query(packagesQuery);
  
  if (packagesResult.rows.length === 0) {
    console.warn("⚠️  No active frame packages found");
    return false;
  }
  
  const packageIds = packagesResult.rows.map(row => row.id);
  
  // Check if user already has active access
  const checkAccessQuery = `
    SELECT id FROM user_package_access
    WHERE user_id = $1 AND is_active = true
    LIMIT 1
  `;
  
  const accessCheck = await pool.query(checkAccessQuery, [userId]);
  
  if (accessCheck.rows.length > 0) {
    // Update existing access
    const updateQuery = `
      UPDATE user_package_access
      SET 
        access_end = $1,
        package_ids = $2,
        transaction_id = $3,
        updated_at = NOW()
      WHERE user_id = $4 AND is_active = true
    `;
    
    await pool.query(updateQuery, [accessEnd, packageIds, transactionId, userId]);
    return true;
  }
  
  // Create new access
  const insertQuery = `
    INSERT INTO user_package_access (
      user_id,
      transaction_id,
      package_ids,
      access_start,
      access_end,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      NOW(),
      $4,
      true,
      NOW(),
      NOW()
    )
  `;
  
  try {
    await pool.query(insertQuery, [userId, transactionId, packageIds, accessEnd]);
    return true;
  } catch (error) {
    console.error(`❌ Error granting access:`, error.message);
    return false;
  }
}

/**
 * Parse CSV file and import members
 */
async function importCSV(filePath) {
  console.log(`\n📂 Processing file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return { success: 0, failed: 0, skipped: 0 };
  }
  
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Parse CSV
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  
  console.log(`📊 Found ${records.length} transactions`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const record of records) {
    const orderId = record["Order ID"];
    const transactionId = record["Transaction ID"];
    const email = record["Customer e-mail"];
    const status = record["Transaction status"];
    const amount = parseInt(record["Amount"]) || 10000;
    
    // Only process settled transactions
    if (status !== "settlement") {
      console.log(`⏭️  Skipping ${orderId} (status: ${status})`);
      skipped++;
      continue;
    }
    
    if (!orderId || !transactionId || !email) {
      console.warn(`⚠️  Missing data: ${orderId || "no-order"} - ${email || "no-email"}`);
      skipped++;
      continue;
    }
    
    try {
      // Create transaction
      const txId = await createOrUpdateTransaction(orderId, transactionId, email, amount);
      
      if (!txId) {
        failed++;
        continue;
      }
      
      // Get user ID
      const userId = await getOrCreateUserId(email);
      
      if (!userId) {
        failed++;
        continue;
      }
      
      // Grant access until March 20, 2026
      const granted = await grantAccess(userId, txId);
      
      if (granted) {
        console.log(`✅ ${email} - ${orderId}`);
        success++;
      } else {
        console.error(`❌ Failed to grant access: ${email}`);
        failed++;
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${orderId}:`, error.message);
      failed++;
    }
  }
  
  return { success, failed, skipped };
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Starting member import from CSV...\n");
  
  // Get CSV file paths from command line arguments
  const csvFiles = process.argv.slice(2);
  
  if (csvFiles.length === 0) {
    console.error("❌ No CSV files provided");
    console.log("\nUsage: node import-members-from-csv.mjs <csv-file-1> <csv-file-2> ...");
    process.exit(1);
  }
  
  try {
    // Test database connection
    console.log("🔌 Testing database connection...");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected\n");
    
    // Create deactivate function
    await createDeactivateFunction();
    
    // Import from each CSV file
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    
    for (const csvFile of csvFiles) {
      const result = await importCSV(csvFile);
      totalSuccess += result.success;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
    }
    
    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 IMPORT SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Successfully imported: ${totalSuccess}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`⏭️  Skipped: ${totalSkipped}`);
    console.log(`📝 Total processed: ${totalSuccess + totalFailed + totalSkipped}`);
    console.log("=".repeat(50));
    
    // Verify active subscribers
    console.log("\n🔍 Verifying active subscribers...");
    const verifyQuery = `
      SELECT COUNT(*) as count
      FROM user_package_access
      WHERE is_active = true AND access_end > NOW()
    `;
    const verifyResult = await pool.query(verifyQuery);
    console.log(`📊 Total active members: ${verifyResult.rows[0].count}`);
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();
