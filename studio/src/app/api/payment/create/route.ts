import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createQrisCharge,
  buildBoothOrderId,
} from "@/lib/midtrans";
import { createPaymentSchema } from "@/lib/validations/payment";
import type { ApiResponse } from "@/types";
import type { CreatePaymentResponse } from "@/lib/validations/payment";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment/create
//
// Dipanggil oleh booth UI setelah customer memilih frame.
// Tidak memerlukan operator auth — booth berjalan sebagai publik.
//
// Flow:
//  1. Validasi input
//  2. Ambil BoothConfig + harga per sesi
//  3. Buat Transaction (PENDING) + BoothSession (PENDING) di DB
//  4. Panggil Midtrans QRIS Core API → dapatkan QR code
//  5. Update Transaction dengan midtransOrderId + midtransTransactionId
//  6. Return QR data ke booth UI
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // 1. Parse + validasi body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Request body harus JSON" },
      { status: 400 }
    );
  }

  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { boothConfigId, frameId, printCount, voucherId, voucherCode } = parsed.data;

  // 2. Ambil BoothConfig — pastikan booth aktif dan operator masih subscribe
  const boothConfig = await prisma.boothConfig.findUnique({
    where:   { id: boothConfigId, isActive: true },
    include: {
      operator: {
        select: { id: true, subscriptionTier: true, subscriptionExpiry: true, isActive: true, midtransServerKey: true },
      },
    },
  });

  if (!boothConfig) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth tidak ditemukan atau tidak aktif" },
      { status: 404 }
    );
  }

  const { operator } = boothConfig;

  if (!operator.isActive) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Akun operator tidak aktif" },
      { status: 403 }
    );
  }

  if (!operator.subscriptionExpiry || operator.subscriptionExpiry < new Date()) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Subscription operator sudah berakhir. Hubungi operator booth." },
      { status: 403 }
    );
  }

  // Jika frameId diberikan, pastikan frame ada di allowedFrameIds (jika diset)
  if (
    frameId &&
    boothConfig.allowedFrameIds.length > 0 &&
    !boothConfig.allowedFrameIds.includes(frameId)
  ) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Frame tidak tersedia di booth ini" },
      { status: 422 }
    );
  }

  // 3. Generate ID untuk Transaction dan BoothSession
  const sessionId    = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const txId         = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const midtransOrderId = buildBoothOrderId(boothConfig.slug);
  const description  = `Sesi Foto — ${boothConfig.boothName}`;

  // Hitung amount:
  // - Harga dasar (termasuk 1 lembar cetak) = pricePerSession
  // - Lembar tambahan = (printCount - 1) × printPricePerSheet
  // - Voucher hanya mengurangi harga dasar (pricePerSession)
  const extraPrintCost = (printCount - 1) * boothConfig.printPricePerSheet;
  let baseAmount = boothConfig.pricePerSession;
  let appliedVoucher: { id: string } | null = null;

  if (voucherId && voucherCode) {
    const voucher = await prisma.voucher.findUnique({ where: { id: voucherId } });
    if (
      voucher &&
      voucher.boothConfigId === boothConfigId &&
      voucher.code === voucherCode &&
      voucher.isActive &&
      (voucher.maxUses === null || voucher.usedCount < voucher.maxUses)
    ) {
      if (voucher.type === "FIXED") {
        baseAmount = Math.max(0, baseAmount - voucher.discountValue);
      } else if (voucher.type === "PERCENT") {
        baseAmount = Math.max(0, baseAmount - Math.floor((baseAmount * voucher.discountValue) / 100));
      }
      appliedVoucher = { id: voucher.id };
    }
  }

  const amount = baseAmount + extraPrintCost;

  // 4. Panggil Midtrans QRIS sebelum menulis ke DB
  //    Jika Midtrans gagal, kita tidak meninggalkan record orphan di DB.
  let qrisResult: Awaited<ReturnType<typeof createQrisCharge>>;
  try {
    qrisResult = await createQrisCharge(
      { orderId: midtransOrderId, amount, description },
      operator.midtransServerKey,
    );
  } catch (err) {
    console.error("[payment/create] Midtrans QRIS error:", err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Gagal membuat QR pembayaran. Coba lagi." },
      { status: 502 }
    );
  }

  // 5. Tulis Transaction + BoothSession secara atomic
  try {
    const txCreate = prisma.transaction.create({
      data: {
        id:               txId,
        sessionId,
        operatorId:       operator.id,
        amount,
        method:           "QRIS",
        midtransOrderId,
        midtransId:       qrisResult.midtransTransactionId,
        status:           "PENDING",
      },
    });
    const sessionCreate = prisma.boothSession.create({
      data: {
        id:            sessionId,
        boothConfigId,
        frameId:       frameId ?? null,
        status:        "PENDING",
        transactionId: txId,
        expiresAt:     qrisResult.expiresAt,
      },
    });

    if (appliedVoucher) {
      await prisma.$transaction([
        txCreate,
        sessionCreate,
        prisma.voucher.update({ where: { id: appliedVoucher.id }, data: { usedCount: { increment: 1 } } }),
      ]);
    } else {
      await prisma.$transaction([txCreate, sessionCreate]);
    }
  } catch (err) {
    console.error("[payment/create] DB write error:", err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Gagal menyimpan data sesi. Hubungi operator." },
      { status: 500 }
    );
  }

  // 6. Return ke booth UI
  const responseData: CreatePaymentResponse = {
    sessionId,
    orderId:    midtransOrderId,
    amount,
    qrImageUrl: qrisResult.qrImageUrl,
    qrString:   qrisResult.qrString,
    expiresAt:  qrisResult.expiresAt.toISOString(),
  };

  return NextResponse.json<ApiResponse<CreatePaymentResponse>>(
    { success: true, data: responseData },
    { status: 201 }
  );
}
