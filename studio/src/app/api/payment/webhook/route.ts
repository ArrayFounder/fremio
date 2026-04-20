import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyMidtransSignature,
  mapMidtransStatus,
  type MidtransNotification,
} from "@/lib/midtrans";
import { emitSessionUnlocked, emitSessionExpired } from "@/lib/socket";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment/webhook
//
// Endpoint publik — JANGAN butuh auth, Midtrans mengirim notifikasi ke sini.
// Daftarkan URL ini di Midtrans Dashboard:
//   Sandbox → Settings → Configuration → Payment Notification URL
//   → https://studio.fremio.id/api/payment/webhook
//
// Idempotent: Midtrans bisa mengirim notifikasi yang sama beberapa kali.
// Selalu return 200 agar Midtrans tidak retry terus-menerus.
//
// Flow setelah SUCCESS:
//  1. Verify signature
//  2. Update Transaction status di DB
//  3. Update BoothSession status → ACTIVE
//  4. Emit Socket.io 'session:unlocked' ke booth UI
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // 1. Parse body
  let notification: MidtransNotification;
  try {
    notification = await req.json();
  } catch {
    // Midtrans kadang kirim form-urlencoded — return 200 agar tidak di-retry
    console.warn("[webhook] Body bukan JSON, diabaikan.");
    return NextResponse.json({ received: true });
  }

  const {
    order_id,
    transaction_id,
    transaction_status,
    fraud_status,
    payment_type,
  } = notification;

  // 2. Cari Transaction terlebih dahulu untuk mendapat operator key
  //    lalu verifikasi signature dengan key yang tepat (operator atau global)
  const txForSig = await prisma.transaction.findUnique({
    where:   { midtransOrderId: order_id },
    include: {
      operator: { select: { midtransServerKey: true } },
    },
  });
  const operatorKey = txForSig?.operator?.midtransServerKey ?? null;

  const isValid = verifyMidtransSignature(notification, operatorKey);
  if (!isValid) {
    console.error(`[webhook] Signature invalid untuk order_id=${order_id}`);
    return NextResponse.json({ received: true, warning: "signature mismatch" });
  }

  // 3. Cari Transaction di DB berdasarkan midtransOrderId
  const transaction = await prisma.transaction.findUnique({
    where:   { midtransOrderId: order_id },
    include: {
      boothSession: {
        select: { id: true, boothConfigId: true, frameId: true, status: true },
      },
    },
  });

  if (!transaction) {
    // Bisa terjadi jika webhook datang sebelum DB selesai ditulis (race condition).
    // Midtrans akan retry — return 404 agar di-retry.
    console.warn(`[webhook] Transaction tidak ditemukan: order_id=${order_id}`);
    return NextResponse.json({ received: false }, { status: 404 });
  }

  // 4. Idempotency check — jika status sudah final, skip update
  if (["SUCCESS", "CANCELLED", "FAILED", "EXPIRED"].includes(transaction.status)) {
    return NextResponse.json({ received: true, note: "already processed" });
  }

  const newStatus = mapMidtransStatus(transaction_status, fraud_status);

  // 5. Update Transaction di DB
  await prisma.transaction.update({
    where: { id: transaction.id },
    data:  {
      status:      newStatus,
      midtransId:  transaction_id,
      paidAt:      newStatus === "SUCCESS" ? new Date() : undefined,
    },
  });

  // 6. Handle berdasarkan status baru
  const session = transaction.boothSession;

  if (newStatus === "SUCCESS" && session) {
    // Unlock booth session
    await prisma.boothSession.update({
      where: { id: session.id },
      data:  {
        status:    "ACTIVE",
        startedAt: new Date(),
        // Sesi aktif selama durasi di BoothConfig; expiresAt diupdate di sini
        // (akan diset oleh booth handler saat sesi selesai)
        expiresAt: null,
      },
    });

    // Emit ke booth UI via Socket.io
    emitSessionUnlocked(session.boothConfigId, {
      sessionId: session.id,
      frameId:   session.frameId,
      expiresAt: new Date(),
    });

    console.log(
      `[webhook] ✅ Session UNLOCKED: session=${session.id}, booth=${session.boothConfigId}`
    );
  } else if (["CANCELLED", "FAILED", "EXPIRED"].includes(newStatus) && session) {
    // Batalkan sesi jika payment gagal/expire
    await prisma.boothSession.update({
      where: { id: session.id },
      data:  { status: "COMPLETED", completedAt: new Date() },
    });

    emitSessionExpired(session.boothConfigId, session.id);

    console.log(
      `[webhook] ❌ Session cancelled: session=${session.id}, status=${newStatus}`
    );
  }

  return NextResponse.json({ received: true });
}
