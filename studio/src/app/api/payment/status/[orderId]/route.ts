import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMidtransStatus, mapMidtransStatus } from "@/lib/midtrans";
import type { ApiResponse } from "@/types";
import type { PaymentStatusResponse } from "@/lib/validations/payment";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payment/status/[orderId]
//
// Dipanggil oleh booth UI untuk polling status pembayaran.
// Publik — booth UI tidak memiliki operator session.
//
// Strategy:
//  1. Cek status di DB kita dulu (cepat, tidak perlu call Midtrans)
//  2. Jika masih PENDING dan belum expire, juga cek langsung ke Midtrans
//     (untuk kasus webhook belum datang / delay)
//  3. Jika Midtrans sudah SUCCESS tapi DB masih PENDING → update DB + emit unlock
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
): Promise<Response> {
  const { orderId } = params;

  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "orderId wajib diisi" },
      { status: 400 }
    );
  }

  // 1. Ambil dari DB
  const transaction = await prisma.transaction.findUnique({
    where:   { midtransOrderId: orderId },
    include: {
      boothSession: {
        select: {
          id:            true,
          boothConfigId: true,
          frameId:       true,
          status:        true,
        },
      },
    },
  });

  if (!transaction) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Transaksi tidak ditemukan" },
      { status: 404 }
    );
  }

  let currentStatus = transaction.status as string;
  const session     = transaction.boothSession;

  // 2. Jika masih PENDING, lakukan active check ke Midtrans untuk freshness
  if (currentStatus === "PENDING") {
    try {
      const midtransData = await getMidtransStatus(orderId);
      const remapped     = mapMidtransStatus(
        midtransData.transaction_status,
        midtransData.fraud_status
      );

      if (remapped !== "PENDING") {
        currentStatus = remapped;

        // 3. Self-heal: webhook belum datang — update DB langsung
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status:      remapped,
            midtransId:  midtransData.transaction_id,
            paidAt:      remapped === "SUCCESS" ? new Date() : undefined,
          },
        });

        if (remapped === "SUCCESS" && session) {
          await prisma.boothSession.update({
            where: { id: session.id },
            data:  { status: "ACTIVE", startedAt: new Date(), expiresAt: null },
          });

          // Emit unlock — webhook mungkin masih akan datang, emitSessionUnlocked
          // bersifat idempotent (IO just broadcasts, tidak ada side-effect DB)
          const { emitSessionUnlocked } = await import("@/lib/socket");
          emitSessionUnlocked(session.boothConfigId, {
            sessionId: session.id,
            frameId:   session.frameId,
            expiresAt: new Date(),
          });
        }
      }
    } catch (err) {
      // Midtrans tidak bisa dihubungi — tetap kembalikan status DB
      console.warn("[status check] Midtrans unreachable:", err);
    }
  }

  const responseData: PaymentStatusResponse = {
    orderId,
    status:        currentStatus,
    sessionId:     session?.id ?? transaction.sessionId,
    sessionStatus: session?.status ?? "PENDING",
    paidAt:        transaction.paidAt?.toISOString() ?? null,
  };

  return NextResponse.json<ApiResponse<PaymentStatusResponse>>(
    { success: true, data: responseData }
  );
}
