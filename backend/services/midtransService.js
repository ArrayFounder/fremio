/**
 * Midtrans Payment Service
 * Handles all Midtrans payment operations
 */

import { createRequire } from "module";
import { URL } from "url";

const require = createRequire(import.meta.url);
const midtransClient = require("midtrans-client");

const getSafeFrontendBaseUrl = () => {
  const raw = String(process.env.FRONTEND_URL || "").trim();
  const defaultProd = "https://fremio.id";
  const defaultDev = "http://localhost:5180";

  const allowLocal =
    String(process.env.ALLOW_LOCALHOST_FRONTEND_URL || "").toLowerCase() ===
    "true";

  const isProd =
    String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
    String(process.env.MIDTRANS_IS_PRODUCTION || "").toLowerCase() === "true";

  if (!raw) return isProd ? defaultProd : defaultDev;

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    // Never send users to localhost in real deployments.
    if (isLocal && !allowLocal) return defaultProd;
    return parsed.origin;
  } catch {
    return isProd ? defaultProd : defaultDev;
  }
};

class MidtransService {
  constructor() {
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const clientKey = process.env.MIDTRANS_CLIENT_KEY;

    console.log("🔧 Initializing Midtrans Service:");
    console.log("   Mode:", isProduction ? "PRODUCTION" : "SANDBOX");
    console.log(
      "   Server Key:",
      serverKey ? `${serverKey.substring(0, 15)}...` : "MISSING"
    );
    console.log(
      "   Client Key:",
      clientKey ? `${clientKey.substring(0, 15)}...` : "MISSING"
    );

    if (!serverKey || !clientKey) {
      console.warn(
        "⚠️  MIDTRANS: Keys not configured. Payment features will be disabled."
      );
      console.warn(
        "   To enable payments, configure MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY in .env"
      );
      this.isDisabled = true;
      return;
    }

    this.isDisabled = false;

    // Initialize Snap API client
    this.snap = new midtransClient.Snap({
      isProduction,
      serverKey,
      clientKey,
    });

    // Initialize Core API client (for transaction status check)
    this.core = new midtransClient.CoreApi({
      isProduction,
      serverKey,
      clientKey,
    });

    console.log("✅ Midtrans Service initialized successfully");
  }

  /**
   * Create payment transaction
   * @param {Object} params - Transaction parameters
   * @param {string} params.orderId - Unique order ID
   * @param {number} params.grossAmount - Payment amount
   * @param {Object} params.customerDetails - Customer info
   * @returns {Promise<Object>} Snap token and redirect URL
   */
  async createTransaction({
    orderId,
    grossAmount,
    customerDetails,
    itemDetails,
    isInternational = false,
  }) {
    try {
      console.log("📤 Creating Midtrans transaction:");
      console.log("   Order ID:", orderId);
      console.log("   Amount:", grossAmount);
      console.log("   Customer:", customerDetails.email);
      console.log("   International:", isInternational);

      // International: credit card only. Indonesia: local methods only (no credit card fee).
      const enabledPayments = isInternational
        ? ["credit_card"]
        : ["gopay", "shopeepay", "dana", "ovo", "bca_va", "bni_va", "bri_va", "permata_va", "other_va", "qris"];

      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: grossAmount,
        },
        customer_details: customerDetails,
        item_details: itemDetails || [
          {
            id: "FRAME_PACKAGE_3X10",
            price: grossAmount,
            quantity: 1,
            name: "Fremio Premium Frame Collection",
          },
        ],
        enabled_payments: enabledPayments,
        credit_card: {
          secure: true,
        },
        callbacks: {
          // After successful payment (including VTWeb/e-wallets like DANA),
          // send user directly to Frames. Include order_id so the client can
          // self-heal by checking status/granting access.
          finish: `${getSafeFrontendBaseUrl()}/frames?order_id=${encodeURIComponent(
            orderId
          )}`,
          error: `${getSafeFrontendBaseUrl()}/pricing`,
          pending: `${getSafeFrontendBaseUrl()}/pricing`,
        },
        expiry: {
          unit: "hours",
          duration: 24,
        },
      };

      console.log("🔄 Calling Midtrans API...");
      const transaction = await this.snap.createTransaction(parameter);
      console.log(
        "✅ Midtrans transaction created:",
        transaction.token.substring(0, 20) + "..."
      );

      return {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
      };
    } catch (error) {
      console.error("❌ Midtrans create transaction error:");
      console.error("   Error message:", error.message);
      console.error("   Error stack:", error.stack);
      console.error(
        "   Error response:",
        error.response?.data || error.response || "No response data"
      );
      throw new Error(`Midtrans API Error: ${error.message}`);
    }
  }

  /**
   * Get transaction status
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Transaction status
   */
  async getTransactionStatus(orderId) {
    try {
      const status = await this.core.transaction.status(orderId);
      return status;
    } catch (error) {
      const http = error?.httpStatusCode || error?.status || null;
      const apiMsg =
        error?.ApiResponse?.status_message ||
        error?.ApiResponse?.statusMessage ||
        null;
      const msg = apiMsg || error?.message || String(error);

      // Keep logs readable; callers can still parse the message.
      console.error(
        `Midtrans status check error: ${http ? `HTTP ${http} ` : ""}${msg}`
      );
      throw new Error(`Failed to check status: ${msg}`);
    }
  }

  /**
   * Verify notification from Midtrans webhook
   * @param {Object} notification - Notification data
   * @returns {Promise<Object>} Verified notification
   */
  async verifyNotification(notification) {
    try {
      const statusResponse = await this.core.transaction.notification(
        notification
      );

      const orderId = statusResponse.order_id;
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;
      const paymentType = statusResponse.payment_type;

      let status = "pending";

      // Determine final status
      if (transactionStatus === "capture") {
        if (fraudStatus === "accept") {
          status = "settlement";
        } else if (fraudStatus === "challenge") {
          status = "pending";
        } else {
          status = "deny";
        }
      } else if (transactionStatus === "settlement") {
        status = "settlement";
      } else if (
        transactionStatus === "cancel" ||
        transactionStatus === "deny" ||
        transactionStatus === "expire"
      ) {
        status = transactionStatus;
      } else if (transactionStatus === "pending") {
        status = "pending";
      }

      return {
        orderId,
        transactionStatus: status,
        paymentType,
        transactionTime: statusResponse.transaction_time,
        settlementTime: statusResponse.settlement_time,
        midtransTransactionId: statusResponse.transaction_id,
        fullResponse: statusResponse,
      };
    } catch (error) {
      console.error("Midtrans verify notification error:", error);
      throw new Error(`Failed to verify notification: ${error.message}`);
    }
  }

  /**
   * Cancel transaction
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelTransaction(orderId) {
    try {
      const result = await this.core.transaction.cancel(orderId);
      return result;
    } catch (error) {
      console.error("Midtrans cancel transaction error:", error);
      throw new Error(`Failed to cancel transaction: ${error.message}`);
    }
  }

  /**
   * Generate unique order ID
   * @param {string} userId - User ID
   * @returns {string} Unique order ID
   */
  generateOrderId(userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `FRM-${userId.substring(0, 8)}-${timestamp}-${random}`;
  }
}

export default new MidtransService();
