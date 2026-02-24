#!/usr/bin/env node
import { Pool } from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const result = await pool.query(`
    SELECT 
      pt.invoice_number, 
      u.email as user_email, 
      u.display_name, 
      upa.is_active, 
      upa.access_end 
    FROM payment_transactions pt 
    LEFT JOIN users u ON pt.user_id::text = u.id::text 
    LEFT JOIN user_package_access upa ON upa.transaction_id = pt.id 
    WHERE pt.invoice_number IN ('FRM-6b1f9eeb-1771589698466-DOD18W', 'FRM-17e8b02b-1771572004595-GN7LU5')
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
}

main();
