#!/usr/bin/env node
/**
 * Production Database Setup Script
 * Runs SQL files and imports members using credentials from .env
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
});

console.log("🚀 Starting production database setup...\n");

async function runSQLFile(filePath) {
  console.log(`📝 Running SQL file: ${filePath}`);
  
  const sql = fs.readFileSync(filePath, "utf-8");
  
  try {
    await pool.query(sql);
    console.log("✅ SQL file executed successfully\n");
    return true;
  } catch (error) {
    console.error("❌ Error running SQL file:", error.message);
    return false;
  }
}

async function main() {
  try {
    // Test connection
    console.log("🔌 Testing database connection...");
    await pool.query("SELECT NOW()");
    console.log("✅ Connected to database\n");
    
    // Run setup SQL
    const sqlPath = path.join(__dirname, "..", "setup-package-tables.sql");
    const success = await runSQLFile(sqlPath);
    
    if (!success) {
      console.error("❌ Failed to setup database tables");
      process.exit(1);
    }
    
    console.log("✅ Database setup completed successfully!");
    console.log("📊 Tables created:");
    console.log("  - frame_packages (3 packages)");
    console.log("  - user_package_access");
    console.log("  - deactivate_expired_access() function");
    
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
