import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Payment Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/payment/create */
export const createPaymentSchema = z.object({
  boothConfigId: z
    .string({ required_error: "boothConfigId wajib diisi" })
    .min(1)
    .max(100),
  frameId:      z.string().min(1).max(100).optional(),
  printCount:   z.number().int().min(1).max(10).default(1),
  voucherId:    z.string().min(1).optional(),
  voucherCode:  z.string().min(1).max(50).transform((v) => v.toUpperCase()).optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Shape respons dari /api/payment/create */
export interface CreatePaymentResponse {
  sessionId:    string;
  orderId:      string;         // order ID yang kita generate (universal lintas gateway)
  amount:       number;         // IDR
  qrImageUrl:   string | null;  // URL gambar QR PNG (null jika gateway tidak support)
  qrString:     string | null;  // raw QR string untuk render sendiri (null jika tidak tersedia)
  expiresAt:    string;         // ISO string — QR expire dalam 15 menit
  snapToken:    string | null;  // Midtrans Snap token (dipakai jika QRIS Core API tidak aktif)
}

/** Shape respons dari /api/payment/status/[orderId] */
export interface PaymentStatusResponse {
  orderId:        string;
  status:         string;      // PENDING | SUCCESS | FAILED | CANCELLED | EXPIRED
  sessionId:      string;
  sessionStatus:  string;      // PENDING | ACTIVE | COMPLETED
  paidAt:         string | null;
}
