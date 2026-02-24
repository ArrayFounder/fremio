#!/usr/bin/env node
/**
 * Check Active Subscribers
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

async function checkSubscribers() {
  try {
    const result = await pool.query(`
      SELECT 
        u.email,
        u.display_name,
        upa.access_end,
        upa.is_active,
        upa.created_at as subscribed_at
      FROM user_package_access upa
      JOIN users u ON upa.user_id::text = u.id::text
      WHERE upa.is_active = true
      ORDER BY upa.created_at DESC
    `);

    console.log("\n📋 Active Subscribers:\n");
    console.log("Total:", result.rows.length);
    console.log("");

    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.email || "No email"}`);
      console.log(`   Name: ${row.display_name || "Unknown"}`);
      console.log(`   Subscribed: ${row.subscribed_at}`);
      console.log(`   Valid until: ${row.access_end}`);
      console.log(`   Active: ${row.is_active}`);
      console.log("");
    });

    await pool.end();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

checkSubscribers();
