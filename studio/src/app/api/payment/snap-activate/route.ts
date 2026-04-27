import { NextResponse }          from "next/server";
import { prisma }                from "@/lib/prisma";
import { getMidtransStatus, mapMidtransStatus } from "@/lib/midtrans";
import { emitSessionUnlocked }   from "@/lib/socket";
import { z }                     from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment/snap-activate
//
// Dipanggil dari booth UI setelah Snap onSuccess callback.
// Karena Snap onSuccess bersifat client-side only, kita perlu verifikasi
// status pembayaran ke Midtrans server-side sebelum mengaktifkan sesi.
//
// Flow:
//  1. Terima orderId dari client
//  2. Cek status ke Midtrans Core API
//  3. Jika SUCCESS/settlement → update Transaction + BoothSession ke ACTIVE
//  4. Emit socket 'session:unlocked'
//  5. Return { activated: true, sessionId }
// ─────────────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  orderId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "orderId wajib diisi" }, { status: 400 });
  }

  const { orderId } = body;

  // 1. Cari transaksi + operator key
  const transaction = await prisma.transaction.findUnique({
    where:   { midtransOrderId: orderId },
    include: {
      operator:    { select: { midtransServerKey: true } },
      boothSession: { select: { id: true, boothConfigId: true, frameId: true, status: true } },
    },
  });

  if (!transaction) {
    return NextResponse.json({ success: false, error: "Transaksi tidak ditemukan" }, { status: 404 });
  }

  const session = transaction.boothSession;
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesi tidak ditemukan" }, { status: 404 });
  }

  // 2. Jika sesi sudah ACTIVE, langsung return (idempotent)
  if (session.status === "ACTIVE") {
    return NextResponse.json({ success: true, data: { activated: true, sessionId: session.id } });
  }

  // 3. Verifikasi status ke Midtrans
  let midtransStatus;
  try {
    midtransStatus = await getMidtransStatus(
      orderId,
      transaction.operator?.midtransServerKey ?? null,
    );
  } catch (err) {
    console.error("[snap-activate] Midtrans status check error:", err);
    return NextResponse.json(
      { success: false, error: "Gagal memverifikasi status pembayaran ke Midtrans" },
      { status: 502 },
    );
  }

  const newStatus = mapMidtransStatus(
    midtransStatus.transaction_status,
    midtransStatus.fraud_status,
  );

  if (newStatus !== "SUCCESS") {
    return NextResponse.json(
      { success: false, error: `Pembayaran belum berhasil (status: ${midtransStatus.transaction_status})` },
      { status: 402 },
    );
  }

  // 4. Update Transaction status jika belum
  if (transaction.status !== "SUCCESS") {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data:  {
        status:     "SUCCESS",
        midtransId: midtransStatus.transaction_id,
        paidAt:     new Date(),
      },
    });
  }

  // 5. Aktifkan BoothSession
  await prisma.boothSession.update({
    where: { id: session.id },
    data:  {
      status:    "ACTIVE",
      startedAt: new Date(),
      expiresAt: null,
    },
  });

  // 6. Emit socket event ke booth UI
  emitSessionUnlocked(session.boothConfigId, {
    sessionId: session.id,
    frameId:   session.frameId,
    expiresAt: new Date(),
  });

  console.log(`[snap-activate] ✅ Session ACTIVATED: session=${session.id}, order=${orderId}`);

  return NextResponse.json({
    success: true,
    data: { activated: true, sessionId: session.id },
  });
}
