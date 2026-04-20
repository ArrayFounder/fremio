/**
 * Migration: Grant basic (30/day) share quota to ALL active frame-membership
 * subscribers who don't already have an active share_plus_subscriptions record.
 *
 * Run on VPS:
 *   node scripts/migrate-basic-share-quota.mjs
 *
 * Or with a dry-run flag:
 *   node scripts/migrate-basic-share-quota.mjs --dry-run
 */

import pg from "pg";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load env from backend directory (both dev and production)
try {
  const dotenv = require("dotenv");
  // Try loading from the directory where the script runs (backend root)
  const backendDir = path.join(__dirname, "..");
  dotenv.config({ path: path.join(backendDir, ".env") });
} catch {
  // dotenv might not be required if env vars are set in the shell
}

const isDryRun = process.argv.includes("--dry-run");

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔍 Finding active frame-membership subscribers without share quota...");
    if (isDryRun) console.log("⚠️  DRY RUN — no changes will be written\n");

    // Ensure share_plus_subscriptions table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS share_plus_subscriptions (
        id               BIGSERIAL PRIMARY KEY,
        user_email       VARCHAR(255) NOT NULL,
        tier             VARCHAR(32)  NOT NULL,
        daily_quota      INT          NOT NULL,
        status           VARCHAR(32)  NOT NULL DEFAULT 'pending',
        started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ  NOT NULL,
        payment_order_id VARCHAR(255),
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Find all active frame-membership holders without an active share quota
    const result = await client.query(`
      SELECT DISTINCT u.email, upa.access_end
      FROM user_package_access upa
      JOIN users u ON upa.user_id::text = u.id::text
      WHERE upa.is_active = true
        AND upa.access_end > NOW()
        AND NOT EXISTS (
          SELECT 1
          FROM share_plus_subscriptions sps
          WHERE sps.user_email = LOWER(TRIM(u.email))
            AND sps.status = 'active'
            AND sps.expires_at > NOW()
        )
      ORDER BY upa.access_end DESC
    `);

    console.log(`Found ${result.rows.length} subscriber(s) to migrate\n`);

    if (result.rows.length === 0) {
      console.log("✅ Nothing to migrate — all active subscribers already have share quota.");
      return;
    }

    let success = 0;
    let failed = 0;

    for (const row of result.rows) {
      const email = String(row.email || "").trim().toLowerCase();
      if (!email) continue;

      console.log(`→ ${email}  (expires: ${new Date(row.access_end).toLocaleDateString("id-ID")})`);

      if (!isDryRun) {
        try {
          await client.query(
            `INSERT INTO share_plus_subscriptions
               (user_email, tier, daily_quota, status, started_at, expires_at, payment_order_id)
             VALUES ($1, 'basic', 30, 'active', NOW(), $2, 'migration-auto')`,
            [email, row.access_end]
          );
          success++;
        } catch (err) {
          console.warn(`  ⚠️  Failed: ${err.message}`);
          failed++;
        }
      } else {
        success++;
      }
    }

    console.log(`\n✅ Migration complete: ${success} granted, ${failed} failed`);
    if (isDryRun) console.log("(Dry run — re-run without --dry-run to apply changes)");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
});
