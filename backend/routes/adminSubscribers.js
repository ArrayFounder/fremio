/**
 * Admin Subscribers Routes
 * Admin-only endpoints to view active subscribers (email + remaining duration)
 */

import express from "express";
import { verifyToken, requireAdmin } from "../middleware/auth.js";
import paymentDB from "../services/paymentDatabaseService.js";
import { getAuth } from "../config/firebase.js";
import midtransService from "../services/midtransService.js";

const router = express.Router();

router.use(verifyToken, requireAdmin);

const formatRemaining = (ms) => {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return { days, hours, minutes };
};

const formatPaymentMethod = (value) => {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return "-";
  if (s === "qris") return "Qris";
  if (s === "gopay") return "Gopay";
  if (s === "dana") return "Dana";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }).map(
    async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) return;
        results[current] = await mapper(items[current], current);
      }
    }
  );

  await Promise.all(workers);
  return results;
};

/**
 * GET /api/admin/subscribers
 * Returns active subscribers with access end and remaining duration.
 * Query params:
 * - limit (default 500, max 2000)
 * - offset (default 0)
 */
router.get("/", async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);

    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(2000, limitRaw))
      : 500;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const rows = await paymentDB.getActiveSubscribers({ limit, offset });

    const auth = (() => {
      try {
        return getAuth();
      } catch {
        return null;
      }
    })();

    const emailCache = new Map();

    const resolveFirebaseEmail = async (uid) => {
      if (!auth || !uid) return null;
      if (emailCache.has(uid)) return emailCache.get(uid);

      try {
        const userRecord = await auth.getUser(String(uid));
        const email = userRecord?.email || null;
        emailCache.set(uid, email);
        return email;
      } catch {
        emailCache.set(uid, null);
        return null;
      }
    };

    const now = Date.now();

    const data = await mapLimit(rows, 10, async (row) => {
      const accessEnd = row.access_end ? new Date(row.access_end) : null;
      const remainingMs = accessEnd ? accessEnd.getTime() - now : 0;
      const remaining = formatRemaining(remainingMs);

      const email =
        row.email || (await resolveFirebaseEmail(row.user_id)) || null;

      return {
        userId: row.user_id,
        email,
        accessEnd: row.access_end,
        remaining,
        remainingMs: Math.max(0, remainingMs),
        paymentMethod: formatPaymentMethod(row.payment_method),
      };
    });

    return res.json({
      success: true,
      data: {
        items: data,
        limit,
        offset,
        count: data.length,
      },
    });
  } catch (error) {
    console.error("Get admin subscribers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get subscribers",
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/subscribers/grant
 * Body: { email: string, durationDays: number }
 * Grants premium access for the given duration.
 */
router.post("/grant", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const durationDaysRaw = Number(req.body?.durationDays);

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        success: false,
        message: "Email tidak valid",
      });
    }

    const durationDays = Number.isFinite(durationDaysRaw) ? durationDaysRaw : NaN;
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "durationDays harus angka > 0",
      });
    }

    // Resolve userId: try local DB first, then Firebase Auth by email.
    let userId = null;
    try {
      userId = await paymentDB.findLocalUserIdByEmail(email);
    } catch (e) {
      console.warn("⚠️ findLocalUserIdByEmail failed:", e?.message || e);
    }

    if (!userId) {
      const auth = (() => {
        try {
          return getAuth();
        } catch {
          return null;
        }
      })();

      if (auth) {
        try {
          const record = await auth.getUserByEmail(email);
          userId = record?.uid ? String(record.uid) : null;
        } catch {
          userId = null;
        }
      }
    }

    if (!userId) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan untuk email tersebut",
      });
    }

    // Use all active packages as metadata (access model is subscription-like anyway).
    let packageIds = [];
    try {
      const packages = await paymentDB.getAllPackages();
      packageIds = (packages || [])
        .map((p) => Number(p.id))
        .filter((n) => Number.isFinite(n));
    } catch {
      packageIds = [];
    }
    if (packageIds.length === 0) {
      packageIds = [1];
    }

    const tx = await paymentDB.createManualTransaction({ userId, amount: 0 });
    if (!tx?.id) {
      return res.status(500).json({
        success: false,
        message: "Gagal membuat transaksi manual",
      });
    }

    const access = await paymentDB.grantPackageAccess({
      userId,
      transactionId: tx.id,
      packageIds,
      durationDays,
    });

    return res.json({
      success: true,
      message: "Akses berhasil diberikan",
      data: {
        userId,
        email,
        durationDays,
        accessEnd: access?.access_end || null,
      },
    });
  } catch (error) {
    console.error("Grant admin access error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to grant access",
      error: error.message,
    });
  }
});

const getAccessDurationDays = () => {
  const raw = Number(
    process.env.PAYMENT_ACCESS_DURATION_DAYS ??
      process.env.PAYMENT_DURATION_DAYS ??
      30
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const determinePackageIdsToGrant = ({ packages }) => {
  let packageIds = [];
  const configuredIds = String(process.env.PAYMENT_GRANT_PACKAGE_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  if (configuredIds.length > 0) {
    const available = new Set((packages || []).map((p) => Number(p.id)));
    packageIds = configuredIds.filter((id) => available.has(id));
  }

  if (packageIds.length === 0) {
    const picked = (packages || []).filter((p) => {
      const name = String(p.name || "").toLowerCase();
      return (
        name.includes("dec") ||
        name.includes("des") ||
        name.includes("december") ||
        name.includes("jan") ||
        name.includes("januari") ||
        name.includes("january") ||
        name.includes("new year")
      );
    });
    packageIds = picked.slice(0, 2).map((p) => p.id);
  }

  if (packageIds.length === 0) {
    packageIds = (packages || []).slice(0, 2).map((p) => p.id);
  }

  return packageIds;
};

/**
 * POST /api/admin/subscribers/sync-order
 * Body: { orderId: string, email: string }
 * Fetches Midtrans status for the order and self-heals local DB + access.
 */
router.post("/sync-order", async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || "").trim();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId wajib" });
    }
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Email tidak valid" });
    }

    const durationDays = getAccessDurationDays();

    // Resolve userId: local DB first, then Firebase Auth by email.
    let userId = null;
    try {
      userId = await paymentDB.findLocalUserIdByEmail(email);
    } catch (e) {
      console.warn("⚠️ findLocalUserIdByEmail failed:", e?.message || e);
    }

    if (!userId) {
      const auth = (() => {
        try {
          return getAuth();
        } catch {
          return null;
        }
      })();

      if (auth) {
        try {
          const record = await auth.getUserByEmail(email);
          userId = record?.uid ? String(record.uid) : null;
        } catch {
          userId = null;
        }
      }
    }

    if (!userId) {
      return res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan untuk email tersebut" });
    }

    // Pull authoritative status from Midtrans
    const st = await midtransService.getTransactionStatus(orderId);
    const txStatus = String(st?.transaction_status || "").trim().toLowerCase();

    // Ensure local transaction row exists and has latest status.
    let tx = await paymentDB.getTransactionByOrderId(orderId);

    if (tx) {
      await paymentDB.updateTransactionStatus({
        orderId,
        transactionStatus: txStatus || tx?.status || "pending",
        paymentType: st?.payment_type || tx?.payment_method || null,
        transactionTime: st?.transaction_time || new Date().toISOString(),
        settlementTime: st?.settlement_time || null,
        midtransTransactionId: st?.transaction_id || null,
        midtransResponse: st,
      });
      tx = await paymentDB.getTransactionByOrderId(orderId);
    } else {
      tx = await paymentDB.createTransactionFromWebhook({
        userId,
        orderId,
        grossAmount: st?.gross_amount,
        transactionStatus: txStatus || "pending",
        paymentType: st?.payment_type || null,
        transactionTime: st?.transaction_time || new Date().toISOString(),
        midtransTransactionId: st?.transaction_id || null,
        midtransResponse: st,
      });
    }

    // Grant access only when it's really paid.
    const isPaid = txStatus === "settlement" || txStatus === "capture";
    if (!isPaid) {
      return res.json({
        success: true,
        message: "Status Midtrans belum paid (tidak grant akses)",
        data: { orderId, status: txStatus || null },
      });
    }

    if (!tx?.id) {
      return res.status(500).json({
        success: false,
        message: "Gagal memastikan transaksi lokal untuk orderId ini",
      });
    }

    const alreadyGranted = await paymentDB.hasAccessForTransaction(tx.id);
    if (!alreadyGranted) {
      const packages = await paymentDB.getAllPackages();
      let packageIds = determinePackageIdsToGrant({ packages });
      // Subscription-based: always grant access even if packages table is empty
      if (packageIds.length === 0) packageIds = [1];

      const baseTime = st?.settlement_time || st?.transaction_time || new Date().toISOString();
      const accessEnd = addDays(new Date(baseTime), durationDays);

      await paymentDB.grantPackageAccess({
        userId,
        transactionId: tx.id,
        packageIds,
        durationDays,
        accessEnd,
      });
    }

    return res.json({
      success: true,
      message: alreadyGranted
        ? "Akses sudah ada (tidak perlu grant ulang)"
        : "OK: transaksi disinkronkan dan akses diberikan",
      data: {
        orderId,
        email,
        userId,
        status: txStatus,
      },
    });
  } catch (error) {
    console.error("Sync order error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to sync order",
      error: error.message,
    });
  }
});

export default router;
