// ─────────────────────────────────────────────────────────────────────────────
// Xendit Integration — Fremio Studio
//
// Menggunakan Xendit QR Codes v2 API untuk QRIS.
// Docs: https://developers.xendit.co/api-reference/#create-qr-code
//
// Setup operator di Xendit Dashboard:
//  1. Buat akun Xendit (xendit.co)
//  2. Masuk ke Settings → API Keys → salin Secret Key → masukkan di dashboard Fremio
//  3. Masuk ke Settings → Webhooks → Verification Token → masukkan sebagai Public Key di Fremio
//  4. Tambahkan webhook URL: https://studio.fremio.id/api/payment/webhook/xendit
// ─────────────────────────────────────────────────────────────────────────────

const XENDIT_BASE = "https://api.xendit.co";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface XenditQrRequest {
  referenceId:  string;  // our order ID — dikirim sebagai reference_id
  amount:       number;  // IDR penuh
  description?: string;
}

export interface XenditQrResult {
  xenditQrId:  string;  // Xendit internal QR ID
  referenceId: string;
  qrString:    string;  // QRIS raw string untuk di-encode ke QR
  expiresAt:   Date;
}

export interface XenditWebhookPayload {
  id:           string;
  reference_id: string;
  status:       string;   // "SUCCEEDED" | "INACTIVE"
  event:        string;   // "qr.payment"
  type:         string;
  currency:     string;
  amount:       number;
  payment_detail?: {
    receipt_id: string;
    source:     string;
  };
  expires_at?: string;
  created:     string;
  updated:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. XENDIT QRIS — buat QR code dinamis
// ─────────────────────────────────────────────────────────────────────────────

function makeAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

/**
 * Buat QRIS dinamis via Xendit QR Codes v2.
 * Mengembalikan qrString yang bisa di-render menjadi gambar QR di booth.
 */
export async function createXenditQrCharge(
  req: XenditQrRequest,
  secretKey: string,
): Promise<XenditQrResult> {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const body = {
    reference_id: req.referenceId,
    type:         "DYNAMIC",
    currency:     "IDR",
    amount:       req.amount,
    expires_at:   expiresAt.toISOString(),
  };

  const res = await fetch(`${XENDIT_BASE}/v2/qr_codes`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  makeAuthHeader(secretKey),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    throw new Error(
      `Xendit QR charge gagal: [${data["error_code"] ?? res.status}] ${data["message"] ?? "Unknown error"}`
    );
  }

  return {
    xenditQrId:  String(data["id"] ?? ""),
    referenceId: String(data["reference_id"] ?? req.referenceId),
    qrString:    String(data["qr_string"] ?? ""),
    expiresAt:   data["expires_at"] ? new Date(String(data["expires_at"])) : expiresAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WEBHOOK VERIFICATION — verifikasi callback dari Xendit
//
// Xendit mengirim header "x-callback-token" dengan nilai yang sama
// seperti Webhook Verification Token yang di-set di Xendit Dashboard.
// Simpan token ini sebagai "Public Key" di dashboard Fremio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifikasi keaslian webhook Xendit.
 * callbackToken = nilai header x-callback-token dari request Xendit.
 * expectedToken = operator.xenditPublicKey (webhook verification token).
 */
export function verifyXenditWebhook(
  callbackToken: string,
  expectedToken: string,
): boolean {
  if (!callbackToken || !expectedToken) return false;
  // Gunakan timing-safe comparison untuk mencegah timing attack
  const a = Buffer.from(callbackToken);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Map Xendit QR status ke TransactionStatus kita.
 */
export function mapXenditStatus(status: string): "SUCCESS" | "EXPIRED" | null {
  switch (status.toUpperCase()) {
    case "SUCCEEDED": return "SUCCESS";
    case "INACTIVE":  return "EXPIRED";
    default:          return null; // ACTIVE / PENDING — belum final
  }
}
