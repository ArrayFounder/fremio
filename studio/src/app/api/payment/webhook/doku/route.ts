import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyDokuWebhook,
  mapDokuStatus,
  type DokuWebhookPayload,
} from "@/lib/doku";
import { emitSessionUnlocked, emitSessionExpired } from "@/lib/socket";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment/webhook/doku
//
// Endpoint publik — JANGAN butuh auth, DOKU mengirim notifikasi ke sini.
// Daftarkan URL ini di DOKU Jokul Dashboard:
//   Settings → Notification URL → https://studio.fremio.id/api/payment/webhook/doku
//
// Idempotent: selalu return 200 agar DOKU tidak retry terus-menerus.
//
// Flow setelah SUCCESS:
//  1. Verify HMAC signature dari header
//  2. Update Transaction status di DB
//  3. Update BoothSession status → ACTIVE
//  4. Emit Socket.io 'session:unlocked' ke booth UI
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // 1. Baca raw body + headers untuk verifikasi signature
  let rawBody: string;
  let payload: DokuWebhookPayload;
  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody) as DokuWebhookPayload;
  } catch {
    console.warn("[webhook/doku] Body bukan JSON, diabaikan.");
    return NextResponse.json({ received: true });
  }

  const invoiceNumber = payload?.order?.invoice_number;
  if (!invoiceNumber) {
    console.warn("[webhook/doku] Tidak ada invoice_number dalam payload.");
    return NextResponse.json({ received: true });
  }

  // 2. Cari Transaction berdasarkan invoice_number (= midtransOrderId kita)
  const txForVerify = await prisma.transaction.findUnique({
    where:   { midtransOrderId: invoiceNumber },
    include: {
      operator: { select: { dokuClientId: true, dokuSecretKey: true } },
    },
  });

  // Abaikan jika bukan transaksi DOKU
  if (!txForVerify || txForVerify.gateway !== "DOKU") {
    console.warn(`[webhook/doku] Order ${invoiceNumber} tidak ditemukan atau bukan DOKU.`);
    return NextResponse.json({ received: true });
  }

  // 3. Verifikasi HMAC signature dari DOKU
  const signatureHeader = req.headers.get("Signature") ?? "";
  const clientId        = req.headers.get("Client-Id") ?? "";
  const requestId       = req.headers.get("Request-Id") ?? "";
  const timestamp       = req.headers.get("Request-Timestamp") ?? "";

  const { dokuClientId, dokuSecretKey } = txForVerify.operator;

  if (dokuSecretKey && !verifyDokuWebhook(
    signatureHeader,
    dokuClientId ?? clientId,
    requestId,
    timestamp,
    rawBody,
    dokuSecretKey,
  )) {
    console.error(`[webhook/doku] Signature invalid untuk order=${invoiceNumber}`);
    return NextResponse.json({ received: true, warning: "signature mismatch" });
  }

  // 4. Idempotency check
  if (["SUCCESS", "CANCELLED", "FAILED", "EXPIRED"].includes(txForVerify.status)) {
    return NextResponse.json({ received: true, note: "already processed" });
  }

  const txStatus = payload?.transaction?.status;
  const newStatus = mapDokuStatus(txStatus ?? "");
  if (!newStatus) {
    return NextResponse.json({ received: true, note: `status ${txStatus} belum final` });
  }

  // 5. Update Transaction di DB
  await prisma.transaction.update({
    where: { id: txForVerify.id },
    data:  {
      status:  newStatus,
      paidAt:  newStatus === "SUCCESS" ? new Date() : undefined,
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
      `[webhook/doku] ✅ Session UNLOCKED: session=${session.id}, booth=${session.boothConfigId}`
    );
  } else if (["FAILED", "EXPIRED"].includes(newStatus) && session) {
    await prisma.boothSession.update({
      where: { id: session.id },
      data:  { status: "COMPLETED", completedAt: new Date() },
    });

    emitSessionExpired(session.boothConfigId, session.id);

    console.log(
      `[webhook/doku] ❌ Session cancelled: session=${session.id}, status=${newStatus}`
    );
  }

  return NextResponse.json({ received: true });
}
