// ─────────────────────────────────────────────────────────────────────────────
// Midtrans Integration — Fremio Studio
//
// Menggunakan raw fetch ke Midtrans REST API.
// Package yang digunakan: midtrans-client (sudah ada di dependencies).
// Note: @midtrans/snap adalah package browser-only; untuk server-side
//       gunakan midtrans-client atau raw fetch seperti implementasi ini.
//
// Dua mode:
//  1. QRIS via Core API  → dipakai booth (customer scan QR di layar)
//  2. Snap Token         → fallback / subscription operator
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";

const IS_PRODUCTION = process.env.MIDTRANS_ENV === "production";

// Midtrans API base URLs
const API_BASE = IS_PRODUCTION
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";

const SNAP_BASE = IS_PRODUCTION
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";

/** Resolve server key: pakai key operator jika ada, fallback ke env Fremio global */
function resolveServerKey(operatorKey?: string | null): string {
  const key = operatorKey ?? process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("Midtrans Server Key belum dikonfigurasi");
  return key;
}

function makeAuthHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface QrisChargeRequest {
  orderId:     string;  // unique order ID buatan kita
  amount:      number;  // IDR penuh, tanpa sen
  description: string;  // label item — tampil di notif customer
}

export interface QrisChargeResult {
  midtransTransactionId: string;  // transaction_id dari Midtrans
  orderId:               string;
  qrString:              string;  // raw QR string untuk di-encode sendiri
  qrImageUrl:            string;  // URL gambar QR PNG dari Midtrans
  expiresAt:             Date;    // biasanya +15 menit dari sekarang
}

export interface SnapTokenRequest {
  orderId:     string;
  amount:      number;
  description: string;
  email?:      string;
  name?:       string;
}

export interface SnapTokenResult {
  snapToken:   string;
  redirectUrl: string;
}

// Shape notifikasi webhook dari Midtrans
export interface MidtransNotification {
  order_id:           string;
  transaction_id:     string;
  transaction_status: string;
  fraud_status:       string;
  payment_type:       string;
  gross_amount:       string;
  signature_key:      string;
  status_code:        string;
  expiry_time?:       string;
}

// Shape respons status dari Midtrans Core API
export interface MidtransStatusResponse {
  transaction_id:      string;
  order_id:            string;
  transaction_status:  string;
  fraud_status:        string;
  payment_type:        string;
  gross_amount:        string;
  status_code:         string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. QRIS CHARGE — booth customer payment
//    Memanggil Core API /v2/charge dengan payment_type = qris
// ─────────────────────────────────────────────────────────────────────────────

export async function createQrisCharge(
  req: QrisChargeRequest,
  operatorServerKey?: string | null,
): Promise<QrisChargeResult> {
  const serverKey = resolveServerKey(operatorServerKey);
  const body = {
    payment_type:        "qris",
    transaction_details: { order_id: req.orderId, gross_amount: req.amount },
    item_details: [
      { id: req.orderId, price: req.amount, quantity: 1, name: req.description },
    ],
    qris: { acquirer: "gopay" },
  };

  const res = await fetch(`${API_BASE}/v2/charge`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: makeAuthHeader(serverKey) },
    body:    JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || (data.status_code !== "201" && data.status_code !== "200")) {
    // 401 = Server Key tidak valid — beri pesan spesifik agar mudah diagnosis
    if (data.status_code === "401" || res.status === 401) {
      throw new Error("Midtrans Server Key tidak valid atau tidak dikenali. Periksa kembali konfigurasi key di dashboard.");
    }
    throw new Error(
      `Midtrans QRIS charge gagal: [${data.status_code}] ${data.status_message ?? res.status}`
    );
  }

  // Midtrans mengembalikan array actions; cari URL gambar QR
  const qrAction = (data.actions as Array<{ name: string; url: string }> | undefined)?.find(
    (a) => a.name === "generate-qr-code"
  );

  return {
    midtransTransactionId: data.transaction_id,
    orderId:               data.order_id,
    qrString:              data.qr_string ?? "",
    qrImageUrl:            qrAction?.url ?? "",
    // Midtrans QRIS default expire 15 menit
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SNAP TOKEN — digunakan untuk subscription operator (embed payment page)
// ─────────────────────────────────────────────────────────────────────────────

export async function createSnapToken(
  req: SnapTokenRequest,
  operatorServerKey?: string | null,
): Promise<SnapTokenResult> {
  const serverKey = resolveServerKey(operatorServerKey);
  const body = {
    transaction_details: { order_id: req.orderId, gross_amount: req.amount },
    item_details: [
      { id: req.orderId, price: req.amount, quantity: 1, name: req.description },
    ],
    ...(req.email || req.name
      ? { customer_details: { email: req.email, first_name: req.name } }
      : {}),
    // Hanya tampilkan QRIS generik — semua e-wallet bisa scan, tidak auto-expand satu metode
    enabled_payments: ["other_qris", "qris"],
    // Cegah Snap meredirect halaman parent setelah selesai/ditutup
    callbacks: { finish: "" },
  };

  const res = await fetch(`${SNAP_BASE}/snap/v1/transactions`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: makeAuthHeader(serverKey) },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Midtrans Snap error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return { snapToken: data.token, redirectUrl: data.redirect_url };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STATUS CHECK — polling via Midtrans Core API
// ─────────────────────────────────────────────────────────────────────────────

export async function getMidtransStatus(
  orderId: string,
  operatorServerKey?: string | null,
): Promise<MidtransStatusResponse> {
  const serverKey = resolveServerKey(operatorServerKey);
  const res = await fetch(`${API_BASE}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: makeAuthHeader(serverKey) },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Midtrans status check error: ${res.status} — ${err}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SIGNATURE VERIFICATION
//    https://docs.midtrans.com/docs/verifying-payment-status
//    Hash = SHA512(orderId + statusCode + grossAmount + serverKey)
// ─────────────────────────────────────────────────────────────────────────────

export function verifyMidtransSignature(
  notification: MidtransNotification,
  operatorServerKey?: string | null,
): boolean {
  const serverKey = resolveServerKey(operatorServerKey);
  const { order_id, status_code, gross_amount, signature_key } = notification;

  const expected = createHash("sha512")
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest("hex");

  // Constant-time compare: prevents timing attacks
  return timingSafeEqual(expected, signature_key);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length &&
    // Node.js crypto.timingSafeEqual requires same-length buffers
    require("crypto").timingSafeEqual(bufA, bufB);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STATUS MAPPING — Midtrans → Prisma TransactionStatus
// ─────────────────────────────────────────────────────────────────────────────

export type PrismaTransactionStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus: string
): PrismaTransactionStatus {
  switch (transactionStatus) {
    case "capture":
      return fraudStatus === "challenge" ? "PENDING" : "SUCCESS";
    case "settlement": return "SUCCESS";
    case "pending":    return "PENDING";
    case "deny":       return "FAILED";
    case "cancel":     return "CANCELLED";
    case "expire":     return "EXPIRED";
    case "refund":     return "CANCELLED";
    default:           return "FAILED";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate Midtrans order ID unik untuk sesi booth.
 * Format: FRMIO-{SLUG_UPPER}-{TIMESTAMP}
 */
export function buildBoothOrderId(boothSlug: string): string {
  const slug = boothSlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 20);
  return `FRMIO-${slug}-${Date.now()}`;
}
