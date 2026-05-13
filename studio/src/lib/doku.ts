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

import { createHash, createHmac, timingSafeEqual } from "crypto";

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
 * componentSignature =
 * Client-Id:{clientId}
 * Request-Id:{requestId}
 * Request-Timestamp:{timestamp}
 * Request-Target:{requestTarget}
 * Digest:{digest}
 */
function makeDokuSignature(
  clientId: string,
  requestId: string,
  timestamp: string,
  requestTarget: string,
  digest: string,
  secretKey: string,
): string {
  const data = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${requestTarget}`,
    `Digest:${digest}`,
  ].join("\n");
  const hmacDigest = createHmac("sha256", secretKey).update(data).digest("base64");
  return `HMACSHA256=${hmacDigest}`;
}

function makeDokuDigest(body: string): string {
  return `SHA-256=${createHash("sha256").update(body).digest("base64")}`;
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
  const cleanClientId = clientId.trim();
  const cleanSecretKey = secretKey.trim();
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
  const requestPath = "/checkout/v1/payment";
  const digest = makeDokuDigest(bodyStr);
  const makeRequest = async (baseUrl: string, requestTargetForSignature: string) => {
    const signature = makeDokuSignature(
      cleanClientId,
      requestId,
      timestamp,
      requestTargetForSignature,
      digest,
      cleanSecretKey,
    );

    // Safe debug logging - don't log full secret key
    const maskedSecret = cleanSecretKey.slice(0, 8) + "***";
    console.log(`[DOKU DEBUG] Attempt: ${baseUrl}${requestPath}`);
    console.log(`[DOKU DEBUG] Request-Target: "${requestTargetForSignature}"`);
    console.log(`[DOKU DEBUG] Client-Id: ${cleanClientId}`);
    console.log(`[DOKU DEBUG] Secret-Key: ${maskedSecret}`);
    console.log(`[DOKU DEBUG] Request-Id: ${requestId}`);
    console.log(`[DOKU DEBUG] Timestamp: ${timestamp}`);
    console.log(`[DOKU DEBUG] Digest: ${digest}`);
    console.log(`[DOKU DEBUG] Signature: ${signature}`);

    const res = await fetch(`${baseUrl}${requestPath}`, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "Client-Id":         cleanClientId,
        "Request-Id":        requestId,
        "Request-Timestamp": timestamp,
        "Request-Target":    requestTargetForSignature,
        "Digest":            digest,
        "Signature":         signature,
      },
      body: bodyStr,
    });

    const data = await res.json() as DokuCheckoutResponse;
    
    // Log response for debugging
    console.log(`[DOKU DEBUG] Response status: ${res.status}`);
    console.log(`[DOKU DEBUG] Response body:`, JSON.stringify(data, null, 2));
    
    return { res, data };
  };

  const alternateBase = DOKU_BASE === "https://api.doku.com" ? "https://api-uat.doku.com" : "https://api.doku.com";
  const baseCandidates = [DOKU_BASE, alternateBase];
  const signatureTargets = [requestPath, `post ${requestPath}`, `POST ${requestPath}`];

  let res: Response | null = null;
  let data: DokuCheckoutResponse | null = null;
  let matchedAttempt = false;

  outer:
  for (const baseUrl of baseCandidates) {
    for (const target of signatureTargets) {
      const attempt = await makeRequest(baseUrl, target);
      const code = attempt.data?.response?.result?.code ?? (attempt.data as { error?: { code?: string } })?.error?.code;

      if (attempt.res.ok && (!code || code === "0000" || code === "00")) {
        res = attempt.res;
        data = attempt.data;
        matchedAttempt = true;
        break outer;
      }

      res = attempt.res;
      data = attempt.data;

      if (code !== "invalid_signature") {
        break outer;
      }
    }
  }

  if (!res || !data || !matchedAttempt) {
    const resultCode = data?.response?.result?.code ?? (data as { error?: { code?: string } })?.error?.code;
    throw new Error(
      `DOKU QRIS charge gagal: [${resultCode ?? res?.status ?? "UNKNOWN"}] ${data?.response?.result?.message ?? JSON.stringify(data)}`
    );
  }

  // Cek response code dari DOKU
  const resultCode = data?.response?.result?.code ?? (data as { error?: { code?: string } })?.error?.code;
  if (!res.ok || (resultCode && resultCode !== "0000" && resultCode !== "00")) {
    throw new Error(
      `DOKU QRIS charge gagal: [${resultCode ?? res.status}] ${data?.response?.result?.message ?? JSON.stringify(data)}`
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
 * HMACSHA256=Base64(HMAC-SHA256(componentSignature, SecretKey))
 */
export function verifyDokuWebhook(
  signatureHeader: string,
  clientId: string,
  requestId: string,
  timestamp: string,
  body: string,
  secretKey: string,
  requestTarget = "/api/payment/webhook/doku",
): boolean {
  if (!signatureHeader || !secretKey) return false;
  try {
    const expected = makeDokuSignature(clientId, requestId, timestamp, requestTarget, makeDokuDigest(body), secretKey);
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
