/**
 * Payment Database Service
 * Handles all database operations for payment system
 */

import dotenv from "dotenv";
import pg from "pg";

// Allow this module to be imported by standalone scripts (node scripts/*.mjs)
// without relying on server entrypoints to call dotenv.config(). Safe to call
// multiple times.
dotenv.config();

const coerceString = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  return String(value);
};

const envInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const databaseUrl = String(process.env.DATABASE_URL || "").trim();

const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl:
        String(process.env.DB_SSL || "").toLowerCase() === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : new pg.Pool({
      host: coerceString(process.env.DB_HOST || process.env.PGHOST, "localhost"),
      port: envInt(process.env.DB_PORT || process.env.PGPORT, 5432),
      database: coerceString(
        process.env.DB_NAME || process.env.PGDATABASE,
        "fremio"
      ),
      user: coerceString(process.env.DB_USER || process.env.PGUSER, "salwa"),
      password: coerceString(
        process.env.DB_PASSWORD ?? process.env.PGPASSWORD,
        ""
      ),
    });

/**
 * Map raw Midtrans transaction_status to the values allowed by the DB
 * CHECK constraint: pending | processing | completed | failed | refunded | expired
 */
function mapMidtransStatus(rawStatus) {
  const s = String(rawStatus || "").trim().toLowerCase();
  if (s === "settlement" || s === "capture") return "completed";
  if (s === "deny" || s === "cancel" || s === "failure") return "failed";
  if (s === "expire") return "expired";
  if (s === "refund" || s === "partial_refund") return "refunded";
  if (s === "processing") return "processing";
  if (s === "pending") return "pending";
  // Unknown statuses: keep as-is if already valid, else default to pending
  const valid = ["pending", "processing", "completed", "failed", "refunded", "expired"];
  return valid.includes(s) ? s : "pending";
}

class PaymentDatabaseService {
  /**
   * Create payment transaction record
   */
  async createTransaction({ userId, orderId, grossAmount }) {
    const query = `
      INSERT INTO payment_transactions (
        user_id, invoice_number, amount, status, currency, gateway, transaction_type, created_at
      ) VALUES ($1, $2, $3, 'pending', 'IDR', 'midtrans', 'one_time', NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [userId, orderId, grossAmount]);
    return result.rows[0];
  }

  /**
   * Store checkout info for a transaction (Snap token + redirect URL).
   * This enables the frontend to resume a pending payment.
   */
  async setTransactionCheckoutInfo({ orderId, snapToken, redirectUrl }) {
    const query = `
      UPDATE payment_transactions
      SET
        invoice_url = COALESCE($1, invoice_url),
        gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $2::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_number = $3
      RETURNING *
    `;

    const payload = {
      ...(snapToken ? { snapToken } : {}),
      ...(redirectUrl ? { redirectUrl } : {}),
      storedAt: new Date().toISOString(),
    };

    const result = await pool.query(query, [
      redirectUrl || null,
      JSON.stringify(payload),
      orderId,
    ]);

    return result.rows[0];
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus({
    orderId,
    transactionStatus,
    paymentType,
    transactionTime,
    settlementTime,
    midtransTransactionId,
    midtransResponse,
  }) {
    const query = `
      UPDATE payment_transactions
      SET 
        status = $1,
        payment_method = $2,
        paid_at = $3,
        gateway_transaction_id = $4,
        gateway_response = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_number = $6
      RETURNING *
    `;

    const result = await pool.query(query, [
      mapMidtransStatus(transactionStatus),
      paymentType,
      transactionTime,
      midtransTransactionId,
      JSON.stringify(midtransResponse),
      orderId,
    ]);

    return result.rows[0];
  }

  /**
   * Webhook safety-net: create a transaction row when Midtrans notifies us
   * about an order_id that isn't present locally (e.g. legacy/failed create).
   */
  async createTransactionFromWebhook({
    userId,
    orderId,
    grossAmount,
    transactionStatus,
    paymentType,
    transactionTime,
    midtransTransactionId,
    midtransResponse,
  }) {
    if (!userId) return null;
    const amount = Number(grossAmount);
    const safeAmount = Number.isFinite(amount) ? amount : 0;

    const query = `
      INSERT INTO payment_transactions (
        user_id,
        invoice_number,
        amount,
        status,
        currency,
        gateway,
        transaction_type,
        payment_method,
        paid_at,
        gateway_transaction_id,
        gateway_response,
        created_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        'IDR',
        'midtrans',
        'one_time',
        $5,
        $6,
        $7,
        $8,
        NOW(),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (invoice_number)
      DO UPDATE SET
        status = EXCLUDED.status,
        payment_method = COALESCE(EXCLUDED.payment_method, payment_transactions.payment_method),
        paid_at = COALESCE(EXCLUDED.paid_at, payment_transactions.paid_at),
        gateway_transaction_id = COALESCE(EXCLUDED.gateway_transaction_id, payment_transactions.gateway_transaction_id),
        gateway_response = COALESCE(payment_transactions.gateway_response, '{}'::jsonb) || EXCLUDED.gateway_response,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      orderId,
      safeAmount,
      mapMidtransStatus(transactionStatus),
      paymentType || null,
      transactionTime || new Date().toISOString(),
      midtransTransactionId || null,
      JSON.stringify(midtransResponse || {}),
    ]);

    return result.rows[0] || null;
  }

  /**
   * Mark a transaction as failed (e.g., Midtrans createTransaction failed after DB insert)
   * so it doesn't remain stuck in 'pending'.
   */
  async markTransactionFailed({ orderId, reason, details }) {
    const payload = {
      failure: {
        reason: reason || "unknown",
        details: details || null,
        failedAt: new Date().toISOString(),
      },
    };

    const query = `
      UPDATE payment_transactions
      SET
        status = 'failed',
        gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $1::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_number = $2
      RETURNING *
    `;

    const result = await pool.query(query, [JSON.stringify(payload), orderId]);
    return result.rows[0] || null;
  }

  /**
   * Get transaction by order ID
   */
  async getTransactionByOrderId(orderId) {
    const query =
      "SELECT * FROM payment_transactions WHERE invoice_number = $1";
    const result = await pool.query(query, [orderId]);
    return result.rows[0];
  }

  /**
   * Get user's payment history
   */
  async getUserTransactions(userId) {
    const query = `
      SELECT * FROM payment_transactions 
      WHERE user_id::text = $1 
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get latest pending transaction for user (if any)
   */
  async getLatestPendingTransaction(userId) {
    const query = `
      SELECT * FROM payment_transactions
      WHERE user_id::text = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * System helper: get recent pending Midtrans transactions for reconciliation.
   * This enables automated backfill when webhooks/redirect callbacks are flaky.
   */
  async getPendingTransactionsForReconcile({
    limit = 25,
    minAgeMinutes = 1,
    maxAgeHours = 48,
  } = {}) {
    const safeLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(200, Number(limit)))
      : 25;

    const safeMinAge = Number.isFinite(Number(minAgeMinutes))
      ? Math.max(0, Number(minAgeMinutes))
      : 1;

    const safeMaxAge = Number.isFinite(Number(maxAgeHours))
      ? Math.max(1, Number(maxAgeHours))
      : 48;

    const query = `
      SELECT *
      FROM payment_transactions
      WHERE status = 'pending'
        AND gateway = 'midtrans'
        AND invoice_number IS NOT NULL
        AND created_at <= NOW() - ($1::int * INTERVAL '1 minute')
        AND created_at >= NOW() - ($2::int * INTERVAL '1 hour')
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const result = await pool.query(query, [safeMinAge, safeMaxAge, safeLimit]);
    return result.rows || [];
  }

  /**
   * System helper: get recent transactions that should be retried against Midtrans.
   * Includes pending transactions and some "failed" ones caused by temporary Midtrans 404s.
   */
  async getTransactionsForReconcile({
    limit = 25,
    minAgeMinutes = 1,
    maxAgeHours = 48,
  } = {}) {
    const safeLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(200, Number(limit)))
      : 25;

    const safeMinAge = Number.isFinite(Number(minAgeMinutes))
      ? Math.max(0, Number(minAgeMinutes))
      : 1;

    const safeMaxAge = Number.isFinite(Number(maxAgeHours))
      ? Math.max(1, Number(maxAgeHours))
      : 48;

    const query = `
      SELECT *
      FROM payment_transactions
      WHERE gateway = 'midtrans'
        AND invoice_number IS NOT NULL
        AND created_at <= NOW() - ($1::int * INTERVAL '1 minute')
        AND created_at >= NOW() - ($2::int * INTERVAL '1 hour')
        AND (
          status = 'pending'
          OR (
            status = 'failed'
            AND (
              (gateway_response->'failure'->>'reason') IN (
                'midtrans_missing_on_status',
                'midtrans_missing_on_create_precheck'
              )
            )
          )
        )
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const result = await pool.query(query, [safeMinAge, safeMaxAge, safeLimit]);
    return result.rows || [];
  }

  /**
   * Check whether access record exists for a transaction
   */
  async hasAccessForTransaction(transactionId) {
    const query =
      "SELECT 1 FROM user_package_access WHERE transaction_id::text = $1::text LIMIT 1";
    const result = await pool.query(query, [String(transactionId)]);
    return result.rowCount > 0;
  }

  /**
   * Get latest successful transaction for a user.
   * Some older deployments may have used status 'completed'.
   */
  async getLatestSuccessfulTransaction(userId) {
    const query = `
      SELECT *
      FROM payment_transactions
      WHERE user_id::text = $1
        AND status IN ('settlement','capture','completed')
      ORDER BY created_at DESC
      LIMIT 1
      -- Note: new rows use 'completed'; keep 'settlement'/'capture' for backward compat
    `;

    const result = await pool.query(query, [String(userId)]);
    return result.rows[0] || null;
  }

  /**
   * Grant package access to user
   */
  async grantPackageAccess({
    userId,
    transactionId,
    packageIds,
    durationDays = 30,
    accessEnd = null,
  }) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Desired access end.
      const finalAccessEnd = accessEnd ? new Date(accessEnd) : new Date();
      if (!accessEnd) {
        const days = Number.isFinite(Number(durationDays)) ? Number(durationDays) : 30;
        finalAccessEnd.setDate(finalAccessEnd.getDate() + days);
      }

      // Idempotency: if access already granted for this transaction, return it.
      const existingAccess = await client.query(
        "SELECT * FROM user_package_access WHERE transaction_id::text = $1::text ORDER BY created_at DESC LIMIT 1",
        [String(transactionId)]
      );

      if (existingAccess.rows[0]) {
        const existing = existingAccess.rows[0];
        const existingEnd = existing?.access_end ? new Date(existing.access_end) : null;
        const existingEndMs = existingEnd ? existingEnd.getTime() : NaN;
        const desiredEndMs = finalAccessEnd.getTime();
        const shouldUpdate =
          !Number.isFinite(existingEndMs) ||
          (Number.isFinite(desiredEndMs) && desiredEndMs > existingEndMs) ||
          existing?.is_active === false;

        if (!shouldUpdate) {
          await client.query("COMMIT");
          return existing;
        }

        // Ensure only one active access per user
        await client.query(
          "UPDATE user_package_access SET is_active = false WHERE user_id::text = $1 AND is_active = true AND transaction_id::text <> $2::text",
          [userId, String(transactionId)]
        );

        const shouldBeActive = Number.isFinite(desiredEndMs)
          ? desiredEndMs > Date.now()
          : true;

        const updated = await client.query(
          "UPDATE user_package_access SET access_end = $1, is_active = $2, package_ids = $3 WHERE id = $4 RETURNING *",
          [finalAccessEnd, shouldBeActive, packageIds, existing.id]
        );

        await client.query("COMMIT");
        return updated.rows[0] || existing;
      }

      // Deactivate any existing active access
      await client.query(
        "UPDATE user_package_access SET is_active = false WHERE user_id::text = $1 AND is_active = true",
        [userId]
      );

      const query = `
        INSERT INTO user_package_access (
          user_id, transaction_id, package_ids, access_end
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const result = await client.query(query, [
        userId,
        transactionId,
        packageIds,
        finalAccessEnd,
      ]);

      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Admin helper: find local DB user id by email.
   * Returns string id (uuid) or null.
   */
  async findLocalUserIdByEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return null;

    const result = await pool.query(
      "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1",
      [normalized]
    );

    const id = result.rows?.[0]?.id;
    return id ? String(id) : null;
  }

  /**
   * DANA/E-wallet fix: Find pending transaction by email and amount.
   * DANA uses a different order_id format in webhooks, so we match by email + amount instead.
   * Only searches transactions from the last 48 hours to avoid false matches.
   */
  async findPendingTransactionByEmailAndAmount(email, amount) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized || !amount) return null;

    const query = `
      SELECT pt.*
      FROM payment_transactions pt
      JOIN users u ON pt.user_id = u.id
      WHERE lower(u.email) = $1
        AND pt.amount = $2
        AND pt.status = 'pending'
        AND pt.created_at > NOW() - INTERVAL '48 hours'
      ORDER BY pt.created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [normalized, amount]);
    return result.rows[0] || null;
  }

  /**
   * Admin helper: create a manual transaction record.
   * Keeps schema usage minimal (columns used by createTransaction).
   */
  async createManualTransaction({ userId, amount = 0 }) {
    const invoice = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const query = `
      INSERT INTO payment_transactions (
        user_id, invoice_number, amount, status, currency, gateway, transaction_type, created_at
      ) VALUES ($1, $2, $3, 'completed', 'IDR', 'manual', 'manual', NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [userId, invoice, amount]);
    return result.rows[0];
  }

  /**
   * Get user's active package access
   */
  async getUserActiveAccess(userId) {
    // First, deactivate expired access
    await pool.query("SELECT deactivate_expired_access()");

    const query = `
      SELECT 
        upa.*,
        pt.invoice_number as order_id,
        pt.amount as gross_amount,
        pt.payment_method as payment_type
      FROM user_package_access upa
      LEFT JOIN payment_transactions pt ON upa.transaction_id::text = pt.id::text
      WHERE upa.user_id::text = $1 
        AND upa.is_active = true
        AND upa.access_end > CURRENT_TIMESTAMP
      ORDER BY upa.created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Admin: List active subscribers
   * Best-effort email resolution via users table (id match). If missing, caller
   * may fallback to Firebase Auth.
   */
  async getActiveSubscribers({ limit = 500, offset = 0 } = {}) {
    // First, deactivate expired access
    await pool.query("SELECT deactivate_expired_access()");

    const query = `
      SELECT
        upa.user_id,
        upa.access_end,
        upa.created_at,
        pt.invoice_number as order_id,
        pt.amount as gross_amount,
        pt.payment_method as payment_method,
        u.email
      FROM user_package_access upa
      LEFT JOIN payment_transactions pt ON upa.transaction_id::text = pt.id::text
      LEFT JOIN users u ON u.id::text = upa.user_id::text
      WHERE upa.is_active = true
        AND upa.access_end > CURRENT_TIMESTAMP
      ORDER BY upa.access_end ASC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);
    return result.rows || [];
  }

  /**
   * Check if user has active access
   */
  async hasActiveAccess(userId) {
    const access = await this.getUserActiveAccess(userId);
    return !!access;
  }

  /**
   * Get accessible frame IDs for user
   */
  async getUserAccessibleFrames(userId) {
    const access = await this.getUserActiveAccess(userId);

    // Subscription model: if the user has active access, they can access ALL
    // premium frames (including any newly uploaded premium frames) until expiry.
    if (!access) {
      return [];
    }

    const result = await pool.query(
      `
        SELECT id
        FROM frames
        WHERE is_active = true
          AND is_hidden = false
          AND is_premium = true
        ORDER BY created_at DESC
      `
    );

    return (result.rows || []).map((r) => r.id);
  }

  /**
   * Create or update frame package
   */
  async createPackage({ name, description, frameIds }) {
    if (frameIds.length > 10) {
      throw new Error("A package can contain maximum 10 frames");
    }

    const query = `
      INSERT INTO frame_packages (name, description, frame_ids)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await pool.query(query, [name, description, frameIds]);
    return result.rows[0];
  }

  /**
   * Get all active packages
   */
  async getAllPackages() {
    const query =
      "SELECT * FROM frame_packages WHERE is_active = true ORDER BY id";
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Get package by ID
   */
  async getPackageById(packageId) {
    const query = "SELECT * FROM frame_packages WHERE id = $1";
    const result = await pool.query(query, [packageId]);
    return result.rows[0];
  }

  /**
   * Update package
   */
  async updatePackage(packageId, { name, description, frameIds, isActive }) {
    if (frameIds && frameIds.length > 10) {
      throw new Error("A package can contain maximum 10 frames");
    }

    const query = `
      UPDATE frame_packages
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        frame_ids = COALESCE($3, frame_ids),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;

    const result = await pool.query(query, [
      name,
      description,
      frameIds,
      isActive,
      packageId,
    ]);

    return result.rows[0];
  }

  /**
   * Delete package
   */
  async deletePackage(packageId) {
    const query = "DELETE FROM frame_packages WHERE id = $1 RETURNING *";
    const result = await pool.query(query, [packageId]);
    return result.rows[0];
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats() {
    const query = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status IN ('settlement','completed') THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        SUM(CASE WHEN status IN ('settlement','completed') THEN amount ELSE 0 END) as total_revenue
      FROM payment_transactions
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Mark receipt email as sent (idempotent - only sets if not already set)
   * Returns the number of rows updated (1 if marked, 0 if already sent)
   */
  async markReceiptEmailSent(orderId) {
    const query = `
      UPDATE payment_transactions
      SET 
        receipt_email_sent_at = NOW(),
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_number = $1
        AND receipt_email_sent_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [orderId]);
    return result.rowCount || 0;
  }

  /**
   * Check if receipt email was already sent
   */
  async isReceiptEmailSent(orderId) {
    const query = `
      SELECT receipt_email_sent_at
      FROM payment_transactions
      WHERE invoice_number = $1
    `;

    const result = await pool.query(query, [orderId]);
    return !!(result.rows[0]?.receipt_email_sent_at);
  }

  /**
   * Clear receipt email sent flag (for retry on failure)
   */
  async clearReceiptEmailSent(orderId) {
    const query = `
      UPDATE payment_transactions
      SET 
        receipt_email_sent_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_number = $1
      RETURNING *
    `;

    const result = await pool.query(query, [orderId]);
    return result.rowCount || 0;
  }
}

export default new PaymentDatabaseService();
export { pool };
