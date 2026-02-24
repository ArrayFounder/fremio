/**
 * Payment Routes
 * Handles payment-related API endpoints
 */

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import paymentDB from "../services/paymentDatabaseService.js";
import midtransService from "../services/midtransService.js";
import n8nWebhook from "../services/n8nWebhookService.js";

const router = express.Router();
const isUuidLike = (value) => {
  const v = String(value || "").trim();
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
};

// Many parts of the backend use DB user ids (UUID). When auth is via Firebase,
// req.user.userId defaults to the Firebase UID, so we resolve to the local DB
// UUID via email when possible.
const resolveDbUserId = async (req, { allowBodyEmail = false } = {}) => {
  const candidate = req.user?.userId || req.user?.uid;
  if (candidate && isUuidLike(candidate)) return String(candidate);

  const email =
    req.user?.email || (allowBodyEmail ? req.body?.email : null) || null;
  if (email) {
    const local = await paymentDB.findLocalUserIdByEmail(email);
    if (local) return String(local);
  }

  return candidate ? String(candidate) : null;
};

const getAccessDurationDays = () => {
  const raw = Number(process.env.PAYMENT_ACCESS_DURATION_DAYS ?? process.env.PAYMENT_DURATION_DAYS ?? 30);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// Midtrans may temporarily return 404 for very recent orders (eventual consistency / propagation).
// To avoid breaking legitimate payments, only mark a missing order as failed after some time.
const getMissingMidtransFailAfterMinutes = () => {
  const raw = Number(process.env.MIDTRANS_MISSING_FAIL_AFTER_MINUTES ?? 15);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
};

const isOlderThanMinutes = (dateLike, minutes) => {
  const d = dateLike ? new Date(dateLike) : null;
  if (!d || Number.isNaN(d.getTime())) return true; // if unknown, err on the side of cleanup
  const ageMs = Date.now() - d.getTime();
  return ageMs >= minutes * 60 * 1000;
};

// Checkout gating to protect users during integration testing.
// PAYMENT_CHECKOUT_MODE: disabled | whitelist | enabled (default: enabled)
// PAYMENT_CHECKOUT_WHITELIST: comma-separated user IDs or emails allowed when mode=whitelist
const getCheckoutMode = () => {
  const mode = String(
    process.env.PAYMENT_CHECKOUT_MODE || "enabled"
  ).toLowerCase();
  return ["disabled", "whitelist", "enabled"].includes(mode) ? mode : "enabled";
};

const isWhitelisted = ({ userId, email }) => {
  const raw = String(process.env.PAYMENT_CHECKOUT_WHITELIST || "");
  if (!raw.trim()) return false;
  const allow = new Set(
    raw
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );

  if (userId && allow.has(String(userId).toLowerCase())) return true;
  if (email && allow.has(String(email).toLowerCase())) return true;
  return false;
};

const determinePackageIdsToGrant = ({ packages }) => {
  // Deterministic package selection for the Rp 10.000 offer.
  // Configure on staging/production via env:
  // PAYMENT_GRANT_PACKAGE_IDS="1,2" (comma-separated)
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

  // Fallback: try to pick December + January packages by name
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

  // Final fallback: just grant the first 2 active packages
  if (packageIds.length === 0) {
    packageIds = (packages || []).slice(0, 2).map((p) => p.id);
  }

  return packageIds;
};

/**
 * GET /api/payment/config
 * Public config endpoint so the frontend can load Midtrans Snap correctly.
 * This prevents environment/key mismatches between frontend build-time vars
 * and backend runtime configuration.
 */
router.get("/config", (req, res) => {
  const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || "").toLowerCase() === "true";
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || null;
  const snapScriptUrl = isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

  return res.json({
    success: true,
    data: {
      isProduction,
      snapScriptUrl,
      clientKey,
    },
  });
});

/**
 * POST /api/payment/create
 * Create new payment transaction
 */
router.post("/create", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req, { allowBodyEmail: true });
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }
    const { email, name, phone } = req.body;

    console.log("💰 Creating payment for user:", userId);

    // Optional checkout gating (protect users while Midtrans integration is being tested)
    const checkoutMode = getCheckoutMode();
    if (checkoutMode === "disabled") {
      return res.status(503).json({
        success: false,
        message: "Checkout sedang ditutup sementara. Silakan coba lagi nanti.",
      });
    }

    if (checkoutMode === "whitelist" && !isWhitelisted({ userId, email })) {
      return res.status(403).json({
        success: false,
        message:
          "Checkout belum dibuka untuk umum (mode testing). Silakan coba lagi nanti.",
      });
    }

    // Try database operations with fallback
    let hasAccess = false;
    let hasPending = false;

    try {
      // Check if user already has active access
      hasAccess = await paymentDB.hasActiveAccess(userId);

      if (hasAccess) {
        return res.status(400).json({
          success: false,
          message:
            "Anda masih memiliki akses aktif. Tidak bisa membeli paket baru sebelum masa aktif berakhir.",
        });
      }

      // Check if there's pending transaction
      const userTransactions = await paymentDB.getUserTransactions(userId);
      const pendingTx = (userTransactions || []).filter(
        (t) => String(t.status || "").toLowerCase() === "pending"
      );

      // If there's a pending tx, sanity-check the latest one against Midtrans.
      // If Midtrans doesn't know it (404), mark it failed so checkout is not blocked.
      if (pendingTx.length > 0) {
        const latest = pendingTx[0];
        const orderId = latest?.invoice_number || null;
        if (orderId) {
          try {
            const st = await midtransService.getTransactionStatus(String(orderId));
            const txStatus = String(st?.transaction_status || "").trim().toLowerCase();

            // If Midtrans already expired/cancelled/denied, update DB so it won't block checkout.
            if (txStatus && txStatus !== "pending") {
              try {
                await paymentDB.updateTransactionStatus({
                  orderId: String(orderId),
                  transactionStatus: txStatus,
                  paymentType: st?.payment_type || null,
                  transactionTime: st?.transaction_time || new Date().toISOString(),
                  settlementTime: st?.settlement_time || null,
                  midtransTransactionId: st?.transaction_id || null,
                  midtransResponse: st,
                });
              } catch {
                // ignore
              }
            }
          } catch (e) {
            const msg = String(e?.message || "");
            const msgLower = msg.toLowerCase();
            const isMissingOnMidtrans =
              msgLower.includes("http status code: 404") ||
              msgLower.includes("status_code\":\"404\"") ||
              /transaction\s+doesn['’]\s*t\s+exist/.test(msgLower) ||
              msgLower.includes("transaction does not exist") ||
              msgLower.includes("transaction not found");

            if (isMissingOnMidtrans) {
              const thresholdMin = getMissingMidtransFailAfterMinutes();
              const createdAt = latest?.created_at || latest?.createdAt || null;
              // If it's very recent, treat it as still pending to avoid double-checkout.
              if (!isOlderThanMinutes(createdAt, thresholdMin)) {
                hasPending = true;
              } else {
                try {
                  await paymentDB.markTransactionFailed({
                    orderId: String(orderId),
                    reason: "midtrans_missing_on_create_precheck",
                    details: msg,
                  });
                } catch {
                  // ignore
                }
              }
            } else {
              // Midtrans temporarily unreachable: keep it pending to be safe.
              hasPending = true;
            }
          }
        } else {
          hasPending = true;
        }

        // Recompute pending after potential cleanup.
        if (!hasPending) {
          const tx2 = await paymentDB.getUserTransactions(userId);
          hasPending = (tx2 || []).some(
            (t) => String(t.status || "").toLowerCase() === "pending"
          );
        }
      } else {
        hasPending = false;
      }

      if (hasPending) {
        return res.status(400).json({
          success: false,
          message:
            "Anda memiliki transaksi yang sedang pending. Silakan selesaikan pembayaran terlebih dahulu.",
        });
      }
    } catch (dbError) {
      console.log(
        "⚠️  Database unavailable for payment check, continuing without validation"
      );
      // Continue without database validation in fallback mode
    }

    // Generate order ID
    const orderId = midtransService.generateOrderId(userId);
    const grossAmount = 10000; // Rp 10.000

    console.log("📝 Order ID generated:", orderId);

    // Create transaction in database FIRST (required for status check later)
    await paymentDB.createTransaction({
      userId,
      orderId,
      grossAmount,
    });
    console.log("✅ Transaction saved to database");

    // Create Midtrans transaction
    const customerDetails = {
      email: email || `${userId}@fremio.app`,
      first_name: name || "Fremio User",
      phone: phone || "08123456789",
    };

    console.log("🔄 Creating Midtrans transaction...");

    let transaction;
    try {
      transaction = await midtransService.createTransaction({
        orderId,
        grossAmount,
        customerDetails,
      });
    } catch (e) {
      // If Midtrans creation fails after we inserted a DB row, don't leave it stuck as 'pending'.
      try {
        await paymentDB.markTransactionFailed({
          orderId,
          reason: "midtrans_create_failed",
          details: e?.message || String(e),
        });
      } catch {
        // ignore secondary failure
      }
      throw e;
    }

    console.log("✅ Midtrans transaction created successfully");

    // Persist checkout info so user can resume pending payment later.
    try {
      await paymentDB.setTransactionCheckoutInfo({
        orderId,
        snapToken: transaction.token,
        redirectUrl: transaction.redirect_url,
      });
    } catch (e) {
      console.warn("⚠️ Failed to store checkout info:", e?.message || e);
    }

    res.json({
      success: true,
      data: {
        orderId,
        token: transaction.token,
        redirectUrl: transaction.redirect_url,
      },
    });
  } catch (error) {
    console.error("❌ Create payment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment",
      error: error.message,
    });
  }
});

/**
 * GET /api/payment/pending
 * Get user's latest pending transaction (if any) so UI can resume payment.
 */
router.get("/pending", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }

    const latestPending = await paymentDB.getLatestPendingTransaction(userId);
    if (!latestPending) {
      return res.json({ success: true, hasPending: false, data: null });
    }

    // Refresh status from Midtrans to avoid stale "pending".
    let midtransStatus = null;
    try {
      midtransStatus = await midtransService.getTransactionStatus(
        latestPending.invoice_number
      );

      if (midtransStatus?.transaction_status) {
        const newStatus = midtransStatus.transaction_status;
        if (newStatus && newStatus !== latestPending.status) {
          await paymentDB.updateTransactionStatus({
            orderId: latestPending.invoice_number,
            transactionStatus: newStatus,
            paymentType: midtransStatus.payment_type,
            transactionTime: midtransStatus.transaction_time,
            settlementTime: midtransStatus.settlement_time,
            midtransTransactionId: midtransStatus.transaction_id,
            midtransResponse: midtransStatus,
          });
          latestPending.status = newStatus;
        }
      }
    } catch (e) {
      const msg = String(e?.message || "");
      const msgLower = msg.toLowerCase();

      const isMissingOnMidtrans =
        msgLower.includes("http status code: 404") ||
        msgLower.includes("status_code\":\"404\"") ||
        /transaction\s+doesn['’]\s*t\s+exist/.test(msgLower) ||
        msgLower.includes("transaction does not exist") ||
        msgLower.includes("transaction not found");

      if (isMissingOnMidtrans && latestPending?.status === "pending") {
        const thresholdMin = getMissingMidtransFailAfterMinutes();
        const createdAt = latestPending?.created_at || latestPending?.createdAt || null;
        if (isOlderThanMinutes(createdAt, thresholdMin)) {
          try {
            await paymentDB.markTransactionFailed({
              orderId: latestPending.invoice_number,
              reason: "midtrans_missing_on_status",
              details: msg,
            });
            latestPending.status = "failed";
          } catch {
            // ignore
          }
        }
      }

      // If Midtrans is unreachable or missing, return DB state (possibly updated above).
      console.warn("⚠️ Failed to refresh Midtrans status:", msg || e);
    }

    // If it already settled, the client should just sync access.
    if (
      latestPending.status === "settlement" ||
      latestPending.status === "capture" ||
      latestPending.status === "completed"
    ) {
      // Self-heal: if webhook didn't grant access, grant here.
      try {
        const alreadyGranted = await paymentDB.hasAccessForTransaction(
          latestPending.id
        );

        if (!alreadyGranted) {
          const packages = await paymentDB.getAllPackages();
          let packageIds = determinePackageIdsToGrant({ packages });
          if (packageIds.length === 0) packageIds = [1];
          await paymentDB.grantPackageAccess({
            userId,
            transactionId: latestPending.id,
            packageIds,
          });
        }
      } catch (e) {
        console.warn("⚠️ Failed to self-heal access on /pending:", e?.message || e);
      }

      return res.json({
        success: true,
        hasPending: false,
        data: {
          orderId: latestPending.invoice_number,
          status: latestPending.status,
        },
      });
    }

    const snapToken = latestPending.gateway_response?.snapToken || null;
    const redirectUrl = latestPending.invoice_url || latestPending.gateway_response?.redirectUrl || null;

    return res.json({
      success: true,
      hasPending: latestPending.status === "pending",
      data: {
        orderId: latestPending.invoice_number,
        status: latestPending.status,
        snapToken,
        redirectUrl,
        createdAt: latestPending.created_at,
      },
    });
  } catch (error) {
    console.error("Get pending payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get pending payment",
      error: error.message,
    });
  }
});

/**
 * POST /api/payment/pending/cancel
 * Cancel user's latest pending transaction so they can create a new one.
 */
router.post("/pending/cancel", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }

    // Cancel ALL pending transactions for this user (some older records may not
    // have snapToken/redirectUrl and can otherwise block checkout forever).
    const pending = await paymentDB.getUserTransactions(userId);
    const pendingTx = (pending || []).filter((t) => t.status === "pending");

    if (pendingTx.length === 0) {
      return res.json({ success: true, message: "Tidak ada transaksi pending" });
    }

    const cancelledOrderIds = [];

    for (const tx of pendingTx) {
      const orderId = tx.invoice_number;
      if (!orderId) continue;

      let cancelResult = null;
      try {
        cancelResult = await midtransService.cancelTransaction(orderId);
      } catch (e) {
        const msg = String(e?.message || "");
        const msgLower = msg.toLowerCase();

        const isMissingOnMidtrans =
          msgLower.includes("http status code: 404") ||
          msgLower.includes("status_code\":\"404\"") ||
          /transaction\s+doesn['’]\s*t\s+exist/.test(msgLower) ||
          msgLower.includes("transaction does not exist") ||
          msgLower.includes("transaction not found");

        // For missing/unknown orders, still cancel locally.
        // For other errors, also cancel locally to unblock the user, but record the error.
        await paymentDB.updateTransactionStatus({
          orderId,
          transactionStatus: "cancel",
          paymentType: cancelResult?.payment_type || null,
          transactionTime: new Date().toISOString(),
          settlementTime: cancelResult?.settlement_time || null,
          midtransTransactionId: cancelResult?.transaction_id || null,
          midtransResponse: {
            error: msg,
            note: isMissingOnMidtrans
              ? "Cancelled locally because Midtrans reported missing transaction"
              : "Cancelled locally because Midtrans cancel failed",
          },
        });

        cancelledOrderIds.push(orderId);
        continue;
      }

      await paymentDB.updateTransactionStatus({
        orderId,
        transactionStatus: "cancel",
        paymentType: cancelResult?.payment_type,
        transactionTime: cancelResult?.transaction_time,
        settlementTime: cancelResult?.settlement_time,
        midtransTransactionId: cancelResult?.transaction_id,
        midtransResponse: cancelResult,
      });

      cancelledOrderIds.push(orderId);
    }

    return res.json({
      success: true,
      message: "Transaksi pending dibatalkan",
      data: { orderIds: cancelledOrderIds },
    });
  } catch (error) {
    console.error("Cancel pending payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel pending payment",
      error: error.message,
    });
  }
});

/**
 * POST /api/payment/webhook
 * Midtrans webhook notification handler
 */
const isPaidTxStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return s === "settlement" || s === "capture" || s === "completed";
};

const handleMidtransNotification = async (req, res) => {
  try {
    // Log raw webhook for debugging (especially for DANA which uses different order_id)
    const rawBody = req.body || {};
    console.log("📥 Raw webhook received:", JSON.stringify({
      order_id: rawBody.order_id,
      transaction_status: rawBody.transaction_status,
      payment_type: rawBody.payment_type,
      gross_amount: rawBody.gross_amount,
      email: rawBody.customer_details?.email,
    }));

    // Verify notification from Midtrans.
    // If verification fails (payload format mismatch), fall back to status check using order_id.
    let notification;
    try {
      notification = await midtransService.verifyNotification(req.body);
    } catch (e) {
      const rawOrderId =
        req.body?.order_id ||
        req.body?.orderId ||
        req.body?.transaction_details?.order_id ||
        null;
      const orderId = rawOrderId ? String(rawOrderId).trim() : "";
      if (!orderId) throw e;

      const st = await midtransService.getTransactionStatus(orderId);
      notification = {
        orderId,
        transactionStatus: st?.transaction_status,
        paymentType: st?.payment_type,
        transactionTime: st?.transaction_time,
        settlementTime: st?.settlement_time,
        midtransTransactionId: st?.transaction_id,
        fullResponse: st,
      };
    }

    console.log("📥 Payment notification received:", {
      orderId: notification.orderId,
      status: notification.transactionStatus,
      paymentType: notification.paymentType,
    });

    // Update transaction in database (may return null if orderId not found)
    let transaction = await paymentDB.updateTransactionStatus({
      orderId: notification.orderId,
      transactionStatus: notification.transactionStatus,
      paymentType: notification.paymentType,
      transactionTime: notification.transactionTime,
      settlementTime: notification.settlementTime,
      midtransTransactionId: notification.midtransTransactionId,
      midtransResponse: notification.fullResponse,
    });

    // DANA/E-wallet fix: If order_id from webhook doesn't match our DB (DANA uses different order_id format),
    // try to find pending transaction by email + amount
    if (!transaction && isPaidTxStatus(notification.transactionStatus)) {
      const email =
        notification.fullResponse?.customer_details?.email ||
        notification.fullResponse?.customer_details?.email_address ||
        rawBody.customer_details?.email ||
        null;
      const grossAmount = Number(notification.fullResponse?.gross_amount || rawBody.gross_amount || 0);

      if (email && grossAmount > 0) {
        console.log("🔍 Order ID not found, searching by email:", email, "amount:", grossAmount);
        
        // Find pending transaction for this email with matching amount (within last 48 hours)
        const pendingTx = await paymentDB.findPendingTransactionByEmailAndAmount(email, grossAmount);
        
        if (pendingTx) {
          console.log("✅ Found matching pending transaction:", pendingTx.invoice_number);
          
          // Update the found transaction
          transaction = await paymentDB.updateTransactionStatus({
            orderId: pendingTx.invoice_number,
            transactionStatus: notification.transactionStatus,
            paymentType: notification.paymentType,
            transactionTime: notification.transactionTime,
            settlementTime: notification.settlementTime,
            midtransTransactionId: notification.midtransTransactionId,
            midtransResponse: {
              ...notification.fullResponse,
              _matched_by: "email_amount",
              _original_webhook_order_id: notification.orderId,
            },
          });
        }
      }
    }

    // Safety-net: if we still don't have a local transaction row, create one from webhook.
    if (!transaction) {
      const email =
        notification.fullResponse?.customer_details?.email ||
        notification.fullResponse?.customer_details?.email_address ||
        null;

      const localUserId = email
        ? await paymentDB.findLocalUserIdByEmail(email)
        : null;

      if (localUserId) {
        transaction = await paymentDB.createTransactionFromWebhook({
          userId: localUserId,
          orderId: notification.orderId,
          grossAmount: notification.fullResponse?.gross_amount,
          transactionStatus: notification.transactionStatus,
          paymentType: notification.paymentType,
          transactionTime: notification.transactionTime,
          midtransTransactionId: notification.midtransTransactionId,
          midtransResponse: notification.fullResponse,
        });
      }
    }

    // If payment is successful, grant package access
    if (isPaidTxStatus(notification.transactionStatus)) {
      console.log("✅ Payment successful, granting access...");

      if (!transaction) {
        // We can't grant without a local transaction record.
        console.warn(
          "⚠️ Webhook success but transaction row not found/created:",
          notification.orderId
        );
        return res.json({ success: true });
      }

      const packages = await paymentDB.getAllPackages();
      let packageIds = determinePackageIdsToGrant({ packages });
      // Subscription-based: always grant access even if packages table is empty
      if (packageIds.length === 0) packageIds = [1];

      let effectiveUserId = transaction.user_id;
      if (!isUuidLike(effectiveUserId)) {
        const email = notification.fullResponse?.customer_details?.email || null;
        if (email) {
          const local = await paymentDB.findLocalUserIdByEmail(email);
          if (local) effectiveUserId = local;
        }
      }

      await paymentDB.grantPackageAccess({
        userId: effectiveUserId,
        transactionId: transaction.id,
        packageIds,
      });

      console.log("✅ Access granted to user:", transaction.user_id);

      // Send email notification via n8n (idempotent - only sends once)
      try {
        const alreadySent = await paymentDB.isReceiptEmailSent(transaction.invoice_number);
        if (!alreadySent) {
          const marked = await paymentDB.markReceiptEmailSent(transaction.invoice_number);
          if (marked > 0) {
            const customerEmail =
              notification.fullResponse?.customer_details?.email ||
              transaction.customer_email ||
              null;
            const customerName =
              notification.fullResponse?.customer_details?.first_name ||
              notification.fullResponse?.customer_details?.name ||
              "Fremio User";
            const paymentMethod = notification.paymentType || transaction.payment_method || "Unknown";
            const amount = transaction.amount || notification.fullResponse?.gross_amount || 0;

            // Calculate access end date (default 30 days from now)
            const accessDurationDays = getAccessDurationDays();
            const accessEndDate = addDays(new Date(), accessDurationDays).toISOString();

            if (customerEmail) {
              await n8nWebhook.sendPaymentSuccessEvent({
                email: customerEmail,
                orderId: transaction.invoice_number,
                customerName,
                paymentMethod,
                amount,
                accessEndDate,
              });
            }
          }
        }
      } catch (emailErr) {
        // Non-blocking: log but don't fail the webhook
        console.error("⚠️ Failed to send email notification:", emailErr.message);
        // Optionally clear the flag so it can retry next time
        try {
          await paymentDB.clearReceiptEmailSent(transaction.invoice_number);
        } catch {
          // ignore
        }
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    // Returning 200 prevents endless retries if something is misconfigured.
    // We still log the error for investigation.
    return res.status(200).json({
      success: false,
      message: "Webhook processing failed",
      error: error.message,
    });
  }
};

router.post("/webhook", handleMidtransNotification);
router.post("/notification", handleMidtransNotification);
router.post("/midtrans/notification", handleMidtransNotification);

router.get(["/webhook", "/notification", "/midtrans/notification"], (req, res) => {
  res.json({ success: true, message: "OK" });
});

/**
 * GET /api/payment/status/:orderId
 * Check payment status
 */
router.get("/status/:orderId", verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = await resolveDbUserId(req);
    const rawUid = req.user?.uid ? String(req.user.uid) : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }

    // Get transaction from database
    const transaction = await paymentDB.getTransactionByOrderId(orderId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Verify ownership
    if (
      String(transaction.user_id) !== String(userId) &&
      (!rawUid || String(transaction.user_id) !== rawUid)
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get latest status from Midtrans
    const midtransStatus = await midtransService.getTransactionStatus(orderId);

    // Update in database if status changed
    const localStatus =
      transaction.status || transaction.transaction_status || "pending";
    if (midtransStatus.transaction_status !== localStatus) {
      await paymentDB.updateTransactionStatus({
        orderId,
        transactionStatus: midtransStatus.transaction_status,
        paymentType: midtransStatus.payment_type,
        transactionTime: midtransStatus.transaction_time,
        settlementTime: midtransStatus.settlement_time,
        midtransTransactionId: midtransStatus.transaction_id,
        midtransResponse: midtransStatus,
      });
    }

    // Self-heal: if webhook failed but Midtrans confirms settlement, grant access here.
    const finalStatus = midtransStatus.transaction_status;
    if (finalStatus === "settlement" || finalStatus === "capture") {
      const alreadyGranted = await paymentDB.hasAccessForTransaction(
        transaction.id
      );
      if (!alreadyGranted) {
        const packages = await paymentDB.getAllPackages();
        let packageIds = determinePackageIdsToGrant({ packages });
        if (packageIds.length === 0) packageIds = [1];
        const effectiveUserId = isUuidLike(transaction.user_id)
          ? transaction.user_id
          : userId;
        await paymentDB.grantPackageAccess({
          userId: effectiveUserId,
          transactionId: transaction.id,
          packageIds,
        });
      }
    }

    res.json({
      success: true,
      data: {
        orderId: transaction.invoice_number || orderId,
        status: midtransStatus.transaction_status,
        paymentType: midtransStatus.payment_type,
        grossAmount: transaction.amount,
      },
    });
  } catch (error) {
    console.error("Check status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check status",
      error: error.message,
    });
  }
});

/**
 * POST /api/payment/reconcile-latest
 * Fallback for users: find latest pending transaction and reconcile with Midtrans.
 * Useful when user doesn't know their orderId.
 */
router.post("/reconcile-latest", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }

    const latestPending = await paymentDB.getLatestPendingTransaction(userId);
    if (!latestPending) {
      return res.json({
        success: true,
        message: "Tidak ada transaksi pending untuk direkonsiliasi",
        data: null,
      });
    }

    const orderId = latestPending.invoice_number || latestPending.order_id;
    if (!orderId) {
      return res.status(500).json({
        success: false,
        message: "Failed to reconcile payment",
        error: "Missing orderId in latest pending transaction",
      });
    }

    const midtransStatus = await midtransService.getTransactionStatus(
      orderId
    );

    const localStatus =
      latestPending.status || latestPending.transaction_status || "pending";
    if (midtransStatus.transaction_status !== localStatus) {
      await paymentDB.updateTransactionStatus({
        orderId,
        transactionStatus: midtransStatus.transaction_status,
        paymentType: midtransStatus.payment_type,
        transactionTime: midtransStatus.transaction_time,
        settlementTime: midtransStatus.settlement_time,
        midtransTransactionId: midtransStatus.transaction_id,
        midtransResponse: midtransStatus,
      });
    }

    if (
      midtransStatus.transaction_status === "settlement" ||
      midtransStatus.transaction_status === "capture"
    ) {
      const alreadyGranted = await paymentDB.hasAccessForTransaction(
        latestPending.id
      );
      if (!alreadyGranted) {
        const packages = await paymentDB.getAllPackages();
        let packageIds = determinePackageIdsToGrant({ packages });
        if (packageIds.length === 0) packageIds = [1];
        await paymentDB.grantPackageAccess({
          userId: isUuidLike(latestPending.user_id) ? latestPending.user_id : userId,
          transactionId: latestPending.id,
          packageIds,
        });
      }
    }

    return res.json({
      success: true,
      data: {
        orderId,
        status: midtransStatus.transaction_status,
      },
    });
  } catch (error) {
    console.error("Reconcile latest error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reconcile payment",
      error: error.message,
    });
  }
});

/**
 * GET /api/payment/history
 * Get user's payment history
 */
router.get("/history", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }
    const transactions = await paymentDB.getUserTransactions(userId);

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payment history",
      error: error.message,
    });
  }
});

/**
 * GET /api/payment/access
 * Get user's current package access
 */
router.get("/access", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }

    try {
      let access = await paymentDB.getUserActiveAccess(userId);

      // Self-heal: if user paid successfully but access record is missing,
      // grant access using their latest successful transaction.
      if (!access) {
        const latestSuccess = await paymentDB.getLatestSuccessfulTransaction(
          userId
        );

        if (latestSuccess) {
          const alreadyGranted = await paymentDB.hasAccessForTransaction(
            latestSuccess.id
          );

          if (!alreadyGranted) {
            const packages = await paymentDB.getAllPackages();
            let packageIds = determinePackageIdsToGrant({ packages });
            if (packageIds.length === 0) packageIds = [1];
            const durationDays = getAccessDurationDays();
            const start = latestSuccess.paid_at || latestSuccess.created_at || new Date();
            const accessEnd = addDays(start, durationDays);

            await paymentDB.grantPackageAccess({
              userId,
              transactionId: latestSuccess.id,
              packageIds,
              accessEnd,
            });
          }

          access = await paymentDB.getUserActiveAccess(userId);
        }
      }

      // Self-heal (DANA-friendly): if DB still says "pending" but Midtrans has
      // already settled, reconcile the latest pending transaction here.
      if (!access) {
        try {
          const latestPending = await paymentDB.getLatestPendingTransaction(userId);
          const orderId = latestPending?.invoice_number || null;

          if (latestPending && orderId) {
            const midtransStatus = await midtransService.getTransactionStatus(orderId);
            const finalStatus = midtransStatus?.transaction_status;

            if (finalStatus && finalStatus !== latestPending.status) {
              await paymentDB.updateTransactionStatus({
                orderId,
                transactionStatus: finalStatus,
                paymentType: midtransStatus.payment_type,
                transactionTime: midtransStatus.transaction_time,
                settlementTime: midtransStatus.settlement_time,
                midtransTransactionId: midtransStatus.transaction_id,
                midtransResponse: midtransStatus,
              });
            }

            if (finalStatus === "settlement" || finalStatus === "capture") {
              const alreadyGranted = await paymentDB.hasAccessForTransaction(
                latestPending.id
              );

              if (!alreadyGranted) {
                const packages = await paymentDB.getAllPackages();
                let packageIds = determinePackageIdsToGrant({ packages });
                if (packageIds.length === 0) packageIds = [1];
                const durationDays = getAccessDurationDays();
                const start =
                  midtransStatus.settlement_time ||
                  midtransStatus.transaction_time ||
                  latestPending.paid_at ||
                  latestPending.created_at ||
                  new Date();
                const accessEnd = addDays(start, durationDays);

                await paymentDB.grantPackageAccess({
                  userId,
                  transactionId: latestPending.id,
                  packageIds,
                  accessEnd,
                });
              }

              access = await paymentDB.getUserActiveAccess(userId);
            }
          }
        } catch (e) {
          console.warn("⚠️ Failed to self-heal access from pending tx:", e?.message || e);
        }
      }

      if (!access) {
        return res.json({
          success: true,
          hasAccess: false,
          data: null,
        });
      }

      // Get accessible frames
      const frameIds = await paymentDB.getUserAccessibleFrames(userId);

      // Calculate days remaining
      const now = new Date();
      const accessEnd = new Date(access.access_end);
      const daysRemaining = Math.ceil(
        (accessEnd - now) / (1000 * 60 * 60 * 24)
      );

      res.json({
        success: true,
        hasAccess: true,
        data: {
          accessStart: access.access_start,
          accessEnd: access.access_end,
          daysRemaining,
          packageIds: access.package_ids,
          frameIds,
          totalFrames: frameIds.length,
        },
      });
    } catch (dbError) {
      console.log(
        "⚠️  Database error in /access, returning no access:",
        dbError.message
      );
      // Fallback: return no access if database fails
      return res.json({
        success: true,
        hasAccess: false,
        data: null,
      });
    }
  } catch (error) {
    console.error("Get access error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get access info",
      error: error.message,
    });
  }
});

/**
 * GET /api/payment/can-purchase
 * Check if user can purchase new package
 */
router.get("/can-purchase", verifyToken, async (req, res) => {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi gagal: userId tidak ditemukan",
      });
    }

    try {
      const hasAccess = await paymentDB.hasActiveAccess(userId);

      res.json({
        success: true,
        canPurchase: !hasAccess,
        message: hasAccess
          ? "Anda masih memiliki akses aktif"
          : "Anda dapat membeli paket baru",
      });
    } catch (dbError) {
      console.log(
        "⚠️  Database error in /can-purchase, allowing purchase:",
        dbError.message
      );
      // Fallback: allow purchase if database fails
      return res.json({
        success: true,
        canPurchase: true,
        message: "Anda dapat membeli paket baru",
      });
    }
  } catch (error) {
    console.error("Can purchase check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check purchase eligibility",
      error: error.message,
    });
  }
});

export default router;
