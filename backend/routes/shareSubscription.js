/**
 * Share Plus Subscription Routes
 * Handles monthly access-quota subscriptions (Membership Plus / Fremio Share)
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import midtransService from "../services/midtransService.js";
import paymentDB from "../services/paymentDatabaseService.js";
import pg from "pg";

const router = express.Router();

// Shared DB pool
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
});

// ── Plans ─────────────────────────────────────────────────────────────────────
export const SHARE_PLUS_PLANS = {
  starter: { label: "Starter", grossAmount: 35000, originalAmount: 45000, dailyQuota: 50,  durationDays: 30 },
  pro:     { label: "Pro",     grossAmount: 45000, originalAmount: 65000, dailyQuota: 100, durationDays: 30 },
  max:     { label: "Max",     grossAmount: 65000, originalAmount: 100000, dailyQuota: 200, durationDays: 30 },
};

// ── DB setup ──────────────────────────────────────────────────────────────────
let ensureSharePlusTablePromise = null;

function ensureSharePlusTable() {
  if (!ensureSharePlusTablePromise) {
    ensureSharePlusTablePromise = (async () => {
      await pool.query(`
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
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_share_plus_email_status
        ON share_plus_subscriptions (user_email, status, expires_at DESC)
      `);
    })().catch((err) => {
      ensureSharePlusTablePromise = null;
      throw err;
    });
  }
  return ensureSharePlusTablePromise;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveDbUserId = async (req) => {
  try {
    const email = req.user?.email || null;
    if (email) {
      const local = await paymentDB.findLocalUserIdByEmail(email);
      if (local) return String(local);
    }
    const candidate = req.user?.userId || req.user?.uid;
    return candidate ? String(candidate) : null;
  } catch {
    return null;
  }
};

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/share-subscription/plans
 * Public: return plan definitions
 */
router.get("/plans", (_req, res) => {
  res.json({ success: true, plans: SHARE_PLUS_PLANS });
});

/**
 * GET /api/share-subscription/status
 * Auth required: return current user's active share+ tier
 */
router.get("/status", verifyToken, async (req, res) => {
  try {
    await ensureSharePlusTable();
    const email = (req.user?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: "Email tidak ditemukan" });

    const result = await pool.query(
      `SELECT tier, daily_quota, status, started_at, expires_at, payment_order_id
       FROM share_plus_subscriptions
       WHERE user_email = $1 AND status = 'active' AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [email]
    );

    const sub = result.rows[0] || null;
    res.json({
      success: true,
      hasSubscription: !!sub,
      subscription: sub,
    });
  } catch (err) {
    console.error("❌ [ShareSub] Error getting status:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil status langganan" });
  }
});

/**
 * POST /api/share-subscription/create
 * Auth required: create a Midtrans transaction for a Share Plus tier
 * Body: { tier: 'starter'|'pro'|'max', name?, phone? }
 */
router.post("/create", verifyToken, async (req, res) => {
  try {
    await ensureSharePlusTable();

    const { tier, name, phone } = req.body || {};
    const email = (req.user?.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ success: false, message: "Autentikasi gagal" });

    const plan = SHARE_PLUS_PLANS[tier];
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: "Tier tidak valid. Pilih: starter, pro, atau max",
      });
    }

    const userId = await resolveDbUserId(req);
    const orderId = midtransService.generateOrderId(userId || email.split("@")[0]);
    const { grossAmount } = plan;

    // Create Midtrans Snap transaction
    const transaction = await midtransService.createTransaction({
      orderId,
      grossAmount,
      customerDetails: {
        email,
        first_name: name || "Fremio User",
        phone: phone || "08123456789",
      },
      isInternational: false,
    });

    // Store pending record
    await pool.query(
      `INSERT INTO share_plus_subscriptions
         (user_email, tier, daily_quota, status, started_at, expires_at, payment_order_id)
       VALUES ($1, $2, $3, 'pending', NOW(), NOW() + INTERVAL '30 days', $4)`,
      [email, tier, plan.dailyQuota, orderId]
    );

    res.json({
      success: true,
      data: {
        orderId,
        token: transaction.token,
        redirectUrl: transaction.redirect_url,
        tier,
        grossAmount,
      },
    });
  } catch (err) {
    console.error("❌ [ShareSub] Error creating subscription:", err);
    res.status(500).json({ success: false, message: err?.message || "Gagal membuat transaksi" });
  }
});

/**
 * POST /api/share-subscription/webhook
 * Midtrans webhook — activate or expire pending share+ subscriptions
 */
router.post("/webhook", async (req, res) => {
  try {
    await ensureSharePlusTable();

    const notification = await midtransService.verifyNotification(req.body);
    const orderId = notification?.order_id || req.body?.order_id;
    const txStatus = String(notification?.transaction_status || req.body?.transaction_status || "").toLowerCase();

    if (!orderId) return res.status(400).json({ success: false });

    if (txStatus === "settlement" || txStatus === "capture") {
      await pool.query(
        `UPDATE share_plus_subscriptions
         SET status = 'active', started_at = NOW(),
             expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()
         WHERE payment_order_id = $1 AND status = 'pending'`,
        [orderId]
      );
      console.log(`✅ [ShareSub] Activated subscription for order: ${orderId}`);

      // Also grant frame membership access (Semua benefit Membership)
      try {
        const subRow = await pool.query(
          `SELECT user_email FROM share_plus_subscriptions WHERE payment_order_id = $1 LIMIT 1`,
          [orderId]
        );
        const subEmail = subRow.rows[0]?.user_email || null;
        if (subEmail) {
          const userId = await paymentDB.findLocalUserIdByEmail(subEmail);
          if (userId) {
            const packages = await paymentDB.getAllPackages();
            const packageIds = packages.length > 0 ? packages.map((p) => p.id) : [1];
            await paymentDB.grantPackageAccess({
              userId,
              transactionId: null,
              packageIds,
              durationDays: 30,
            });
            console.log(`✅ [ShareSub] Also granted frame access to: ${subEmail}`);
          }
        }
      } catch (frameErr) {
        console.warn("⚠️ [ShareSub] Failed to grant frame access with share plus:", frameErr.message);
      }
    } else if (["expire", "cancel", "deny", "failure", "failed"].includes(txStatus)) {
      await pool.query(
        `UPDATE share_plus_subscriptions
         SET status = 'expired', updated_at = NOW()
         WHERE payment_order_id = $1 AND status = 'pending'`,
        [orderId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ [ShareSub] Webhook error:", err);
    res.status(500).json({ success: false });
  }
});

// ── Exported helper ───────────────────────────────────────────────────────────

/**
 * Grant a 'basic' (30/day) share quota to a user when they buy the 25k membership.
 * Skips if the user already has an active subscription (so higher tiers are not downgraded).
 */
export const grantBasicShareQuota = async (email, expiresAt) => {
  if (!email) return;
  try {
    await ensureSharePlusTable();
    const normalizedEmail = String(email).trim().toLowerCase();

    // Don't insert if user already has an active share subscription (basic or higher)
    const existing = await pool.query(
      `SELECT id FROM share_plus_subscriptions
       WHERE user_email = $1 AND status = 'active' AND expires_at > NOW()
       LIMIT 1`,
      [normalizedEmail]
    );
    if (existing.rows.length > 0) return;

    await pool.query(
      `INSERT INTO share_plus_subscriptions
         (user_email, tier, daily_quota, status, started_at, expires_at, payment_order_id)
       VALUES ($1, 'basic', 30, 'active', NOW(), $2, 'membership-30days-auto')`,
      [normalizedEmail, expiresAt]
    );
    console.log(`✅ [ShareSub] Granted basic (30/day) quota to: ${normalizedEmail}`);
  } catch (err) {
    console.warn("⚠️ [ShareSub] Failed to grant basic share quota:", err.message);
  }
};

export default router;
