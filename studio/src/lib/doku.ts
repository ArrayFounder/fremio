// ─────────────────────────────────────────────────────────────────────────────
// DOKU Integration — Fremio Studio
//
// Menggunakan DOKU Checkout v1 API (Jokul) dengan HMAC-SHA256 signature.
// Docs: https://developers.doku.com/accept-payment/checkout
//
// Setup operator di DOKU Dashboard (jokul.doku.com):
//  1. Buat akun DOKU Jokul
//  2. Masuk ke Settings → Client ID & Secret Key
//  3. Masukkan Client ID dan Secret Key di dashboard Fremio
//  4. Set Notification URL: https://studio.fremio.id/api/payment/webhook/doku
//  5. Payment type QRIS harus aktif di akun DOKU
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

const IS_PRODUCTION = process.env.DOKU_ENV !== "sandbox";
const DOKU_BASE = IS_PRODUCTION
  ? "https://api.doku.com"
  : "https://api-uat.doku.com";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface DokuQrRequest {
  invoiceNumber: string;  // our order ID — dikirim sebagai invoice_number
  amount:        number;  // IDR penuh
  description?:  string;
}

export interface DokuQrResult {
  invoiceNumber: string;
  qrString:      string;  // QRIS raw string
  qrImageUrl:    string;  // URL gambar QR dari DOKU (jika tersedia)
  expiresAt:     Date;
}

// DOKU Jokul Checkout response shape
interface DokuCheckoutResponse {
  order?: {
    invoice_number: string;
    amount:         number;
  };
  payment?: {
    url?:       string;   // redirect URL (checkout page)
    qr_string?: string;   // QRIS string (jika tersedia)
    qr_url?:    string;   // QR image URL
    expiry_time?: number; // menit sampai kedaluwarsa
  };
  response?: {
    result?: {
      code:    string;
      message: string;
    };
  };
}

// DOKU webhook notification shape
export interface DokuWebhookPayload {
  order: {
    invoice_number: string;
    amount:         number;
  };
  transaction: {
    date:        string;
    original_request_id: string;
    status:      string;  // SUCCESS | FAILED | PENDING | EXPIRED
    type:        string;
  };
  service?: {
    id:   string;
    name: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SIGNATURE GENERATION — untuk request header
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buat HMAC-SHA256 signature untuk DOKU Jokul API request.
 * Format: "HMACSHA256=" + Base64(HMAC-SHA256(data, secretKey))
 *
 * data = Client-Id + "|" + Request-Id + "|" + Request-Timestamp + "|" + RequestBody
 */
function makeDokuSignature(
  clientId: string,
  requestId: string,
  timestamp: string,
  body: string,
  secretKey: string,
): string {
  const data = `${clientId}|${requestId}|${timestamp}|${body}`;
  const digest = createHmac("sha256", secretKey).update(data).digest("base64");
  return `HMACSHA256=${digest}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOKU QRIS CHARGE — buat QR code via Checkout API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buat QRIS dinamis via DOKU Jokul Checkout API.
 * Mengembalikan qrString atau qrImageUrl untuk ditampilkan di booth.
 *
 * Catatan: DOKU API untuk QRIS mengembalikan qr_string dalam payment object
 * ketika channel QRIS digunakan. Pastikan akun DOKU sudah aktif untuk QRIS.
 */
export async function createDokuQrisCharge(
  req: DokuQrRequest,
  clientId: string,
  secretKey: string,
): Promise<DokuQrResult> {
  const requestId  = crypto.randomUUID();
  const timestamp  = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const expiresAt  = new Date(Date.now() + 15 * 60 * 1000);

  const bodyObj = {
    order: {
      invoice_number: req.invoiceNumber,
      line_items: [
        {
          name:     req.description ?? "Sesi Foto",
          price:    req.amount,
          quantity: 1,
        },
      ],
      amount:   req.amount,
      currency: "IDR",
    },
    payment: {
      payment_due_date: 15, // 15 menit
    },
    additional_info: {
      channel: "QRIS",
    },
  };

  const bodyStr = JSON.stringify(bodyObj);
  const signature = makeDokuSignature(clientId, requestId, timestamp, bodyStr, secretKey);

  const res = await fetch(`${DOKU_BASE}/checkout/v1/payment`, {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "Client-Id":       clientId,
      "Request-Id":      requestId,
      "Request-Timestamp": timestamp,
      "Signature":       signature,
    },
    body: bodyStr,
  });

  const data = await res.json() as DokuCheckoutResponse;

  // Cek response code dari DOKU
  const resultCode = data?.response?.result?.code;
  if (!res.ok || (resultCode && resultCode !== "0000" && resultCode !== "00")) {
    throw new Error(
      `DOKU QRIS charge gagal: [${resultCode ?? res.status}] ${data?.response?.result?.message ?? "Unknown error"}`
    );
  }

  return {
    invoiceNumber: data?.order?.invoice_number ?? req.invoiceNumber,
    qrString:      data?.payment?.qr_string  ?? "",
    qrImageUrl:    data?.payment?.qr_url      ?? data?.payment?.url ?? "",
    expiresAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WEBHOOK VERIFICATION — verifikasi notifikasi dari DOKU
//
// DOKU mengirim header "Signature" dengan format HMACSHA256=...
// Verifikasi: hitung ulang signature dari body + secretKey, bandingkan.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifikasi keaslian webhook DOKU.
 * signatureHeader = nilai header "Signature" dari request DOKU.
 * clientId        = operator.dokuClientId
 * secretKey       = operator.dokuSecretKey
 *
 * DOKU webhook signature format:
 * HMACSHA256=Base64(HMAC-SHA256(Client-Id + "|" + Request-Id + "|" + Request-Timestamp + "|" + Body, SecretKey))
 */
export function verifyDokuWebhook(
  signatureHeader: string,
  clientId: string,
  requestId: string,
  timestamp: string,
  body: string,
  secretKey: string,
): boolean {
  if (!signatureHeader || !secretKey) return false;
  try {
    const expected = makeDokuSignature(clientId, requestId, timestamp, body, secretKey);
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Map DOKU transaction status ke TransactionStatus kita.
 */
export function mapDokuStatus(status: string): "SUCCESS" | "FAILED" | "EXPIRED" | null {
  switch (status.toUpperCase()) {
    case "SUCCESS":  return "SUCCESS";
    case "FAILED":   return "FAILED";
    case "EXPIRED":  return "EXPIRED";
    default:         return null; // PENDING — belum final
  }
}
