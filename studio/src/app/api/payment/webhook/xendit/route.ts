import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyXenditWebhook,
  mapXenditStatus,
  type XenditWebhookPayload,
} from "@/lib/xendit";
import { emitSessionUnlocked, emitSessionExpired } from "@/lib/socket";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment/webhook/xendit
//
// Endpoint publik — JANGAN butuh auth, Xendit mengirim notifikasi ke sini.
// Daftarkan URL ini di Xendit Dashboard:
//   Dashboard → Settings → Webhooks → QR Code Payment
//   → https://studio.fremio.id/api/payment/webhook/xendit
//
// Verification Token (x-callback-token) simpan sebagai "Public Key" di Fremio.
//
// Idempotent: selalu return 200 agar Xendit tidak retry terus-menerus.
//
// Flow setelah SUCCEEDED:
//  1. Verify x-callback-token
//  2. Update Transaction status di DB
//  3. Update BoothSession status → ACTIVE
//  4. Emit Socket.io 'session:unlocked' ke booth UI
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // 1. Baca raw body untuk verifikasi signature
  let rawBody: string;
  let payload: XenditWebhookPayload;
  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody) as XenditWebhookPayload;
  } catch {
    console.warn("[webhook/xendit] Body bukan JSON, diabaikan.");
    return NextResponse.json({ received: true });
  }

  const { reference_id, status, event } = payload;

  // Hanya proses event QR payment
  if (event !== "qr.payment" && event !== "qr.payment.succeeded") {
    return NextResponse.json({ received: true, note: "event bukan qr.payment" });
  }

  // 2. Cari Transaction berdasarkan reference_id (= midtransOrderId kita)
  const txForVerify = await prisma.transaction.findUnique({
    where:   { midtransOrderId: reference_id },
    include: {
      operator: { select: { xenditPublicKey: true } },
    },
  });

  // Abaikan jika bukan transaksi Xendit
  if (!txForVerify || txForVerify.gateway !== "XENDIT") {
    console.warn(`[webhook/xendit] Order ${reference_id} tidak ditemukan atau bukan XENDIT.`);
    return NextResponse.json({ received: true });
  }

  // 3. Verifikasi callback token
  const callbackToken = req.headers.get("x-callback-token") ?? "";
  const expectedToken = txForVerify.operator.xenditPublicKey ?? "";

  if (expectedToken && !verifyXenditWebhook(callbackToken, expectedToken)) {
    console.error(`[webhook/xendit] Callback token invalid untuk order=${reference_id}`);
    // Return 200 agar Xendit tidak retry dengan request yang jelas tidak valid
    return NextResponse.json({ received: true, warning: "token mismatch" });
  }

  // 4. Idempotency check — jika status sudah final, skip update
  if (["SUCCESS", "CANCELLED", "FAILED", "EXPIRED"].includes(txForVerify.status)) {
    return NextResponse.json({ received: true, note: "already processed" });
  }

  const newStatus = mapXenditStatus(status);
  if (!newStatus) {
    // Status belum final (ACTIVE, dll.) — tidak ada yang perlu dilakukan
    return NextResponse.json({ received: true, note: `status ${status} belum final` });
  }

  // 5. Update Transaction di DB
  await prisma.transaction.update({
    where: { id: txForVerify.id },
    data:  {
      status:     newStatus,
      midtransId: payload.id ?? txForVerify.midtransId,
      paidAt:     newStatus === "SUCCESS" ? new Date() : undefined,
    },
  });

  // 6. Handle berdasarkan status baru
  const session = await prisma.boothSession.findUnique({
    where:  { transactionId: txForVerify.id },
    select: { id: true, boothConfigId: true, frameId: true, status: true },
  });

  if (newStatus === "SUCCESS" && session) {
    await prisma.boothSession.update({
      where: { id: session.id },
      data:  {
        status:    "ACTIVE",
        startedAt: new Date(),
        expiresAt: null,
      },
    });

    emitSessionUnlocked(session.boothConfigId, {
      sessionId: session.id,
      frameId:   session.frameId,
      expiresAt: new Date(),
    });

    console.log(
      `[webhook/xendit] ✅ Session UNLOCKED: session=${session.id}, booth=${session.boothConfigId}`
    );
  } else if (newStatus === "EXPIRED" && session) {
    await prisma.boothSession.update({
      where: { id: session.id },
      data:  { status: "COMPLETED", completedAt: new Date() },
    });

    emitSessionExpired(session.boothConfigId, session.id);

    console.log(
      `[webhook/xendit] ❌ Session expired: session=${session.id}`
    );
  }

  return NextResponse.json({ received: true });
}
