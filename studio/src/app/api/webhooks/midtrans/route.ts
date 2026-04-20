import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyMidtransSignature,
  mapMidtransStatus,
  type MidtransNotification,
} from "@/lib/midtrans";
import { SUBSCRIPTION_DURATION_DAYS } from "@/types";
import type { ApiResponse } from "@/types";

// POST /api/webhooks/midtrans — notifikasi pembayaran subscription dari Midtrans
// Daftarkan URL ini di Midtrans Dashboard → Payment Notification URL
export async function POST(req: Request) {
  const body = (await req.json()) as MidtransNotification;

  // 1. Verifikasi signature
  const isValid = await verifyMidtransSignature(body);
  if (!isValid) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  const { order_id, transaction_id, transaction_status, fraud_status } = body;

  // 2. Temukan transaksi
  const transaction = await prisma.transaction.findUnique({
    where: { midtransOrderId: order_id },
  });

  if (!transaction) {
    console.warn(`[Midtrans webhook] Transaksi tidak ditemukan: ${order_id}`);
    return NextResponse.json({ received: true });
  }

  const newStatus = mapMidtransStatus(transaction_status, fraud_status);

  // 3. Update status transaksi
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status:    newStatus,
      midtransId: transaction_id,
      paidAt:    newStatus === "SUCCESS" ? new Date() : undefined,
    },
  });

  // 4. Jika SUCCESS, perpanjang subscription operator (simpan di Operator langsung)
  if (newStatus === "SUCCESS") {
    const now     = new Date();
    const expiry  = new Date(now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000);

    await prisma.operator.update({
      where: { id: transaction.operatorId },
      data:  { subscriptionExpiry: expiry },
    });
  }

  return NextResponse.json({ received: true });
}
