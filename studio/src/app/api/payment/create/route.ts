import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createQrisCharge,
  createSnapToken,
  buildBoothOrderId,
} from "@/lib/midtrans";
import { createXenditQrCharge } from "@/lib/xendit";
import { createDokuQrisCharge } from "@/lib/doku";
import { createPaymentSchema } from "@/lib/validations/payment";
import type { ApiResponse } from "@/types";
import type { CreatePaymentResponse } from "@/lib/validations/payment";

const TRIAL_ONLY_MODE = true;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment/create
//
// Dipanggil oleh booth UI setelah customer memilih frame.
// Tidak memerlukan operator auth — booth berjalan sebagai publik.
//
// Gateway selection (prioritas):
//  1. DOKU      — jika dokuClientId + dokuSecretKey tersedia
//  2. Xendit    — jika xenditSecretKey tersedia
//  3. Midtrans  — jika midtransServerKey tersedia
//
// Flow:
//  1. Validasi input
//  2. Ambil BoothConfig + semua gateway keys
//  3. Pilih gateway aktif berdasarkan keys yang tersedia
//  4. Panggil gateway terpilih → dapatkan QR code
//  5. Tulis Transaction (PENDING) + BoothSession (PENDING) di DB
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
  const requestedFrameId = typeof frameId === "string" && frameId.trim().length > 0
    ? frameId.trim()
    : null;

  // 2. Ambil BoothConfig — pastikan booth aktif dan operator masih subscribe
  const boothConfig = await prisma.boothConfig.findUnique({
    where:   { id: boothConfigId, isActive: true },
    include: {
      operator: {
        select: {
          id:                true,
          subscriptionTier:  true,
          subscriptionExpiry: true,
          isActive:          true,
          midtransServerKey: true,
          midtransClientKey: true,
          xenditSecretKey:   true,
          dokuClientId:      true,
          dokuSecretKey:     true,
          paymentGateway:    true,
        },
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

  if (
    !TRIAL_ONLY_MODE &&
    (!operator.subscriptionExpiry || operator.subscriptionExpiry < new Date())
  ) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Subscription operator sudah berakhir. Hubungi operator booth." },
      { status: 403 }
    );
  }

  const preferredGateway: "MIDTRANS" | "XENDIT" | "DOKU" =
    operator.paymentGateway === "DOKU" || operator.paymentGateway === "XENDIT" || operator.paymentGateway === "MIDTRANS"
      ? operator.paymentGateway
      : "MIDTRANS";
  const gatewayReady: Record<"MIDTRANS" | "XENDIT" | "DOKU", boolean> = {
    MIDTRANS: !!operator.midtransServerKey,
    XENDIT:   !!operator.xenditSecretKey,
    DOKU:     !!operator.dokuClientId && !!operator.dokuSecretKey,
  };
  const activeGateway: "MIDTRANS" | "XENDIT" | "DOKU" | null =
    gatewayReady[preferredGateway] ? preferredGateway : null;

  if (!activeGateway) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: `${preferredGateway} belum dikonfigurasi lengkap. Pilih gateway aktif lain atau lengkapi API key di dashboard.` },
      { status: 503 }
    );
  }

  // Jika frameId diberikan, pastikan frame ada di allowedFrameIds (jika diset)
  if (
    requestedFrameId &&
    boothConfig.allowedFrameIds.length > 0 &&
    !boothConfig.allowedFrameIds.includes(requestedFrameId)
  ) {
    const exists = await prisma.frame.findUnique({
      where: { id: requestedFrameId },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Frame tidak tersedia di booth ini" },
        { status: 422 }
      );
    }
  }

  let persistedFrameId: string | null = null;
  if (requestedFrameId) {
    const frame = await prisma.frame.findUnique({
      where: { id: requestedFrameId },
      select: { id: true, isActive: true },
    });
    if (frame?.isActive) {
      persistedFrameId = frame.id;
    }
  }

  // 3. Generate ID untuk Transaction dan BoothSession
  const sessionId    = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const txId         = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const orderId      = buildBoothOrderId(boothConfig.slug); // universal order ID lintas gateway
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

  // 4. Panggil gateway terpilih untuk membuat QR code
  //    Jika gateway gagal, kita tidak meninggalkan record orphan di DB.
  let qrString:   string = "";
  let qrImageUrl: string = "";
  let snapToken:  string = "";
  let snapRedirectUrl: string = "";
  let snapClientKey: string = "";
  let expiresAt:  Date   = new Date(Date.now() + 15 * 60 * 1000);
  let gatewayTxId: string = "";

  try {
    if (activeGateway === "MIDTRANS") {
      // Coba QRIS Core API dulu; jika 402 (channel belum aktif), fallback ke Snap
      try {
        const result = await createQrisCharge(
          { orderId, amount, description },
          operator.midtransServerKey,
        );
        qrString    = result.qrString;
        qrImageUrl  = result.qrImageUrl;
        expiresAt   = result.expiresAt;
        gatewayTxId = result.midtransTransactionId;
      } catch (qrisErr) {
        const qrisMsg = qrisErr instanceof Error ? qrisErr.message : "";
        // 402 = Payment channel not activated — fallback ke Snap token
        if (qrisMsg.includes("[402]") || qrisMsg.includes("not activated")) {
          console.warn("[payment/create] QRIS not active, falling back to Snap token");
          const snapResult = await createSnapToken(
            { orderId, amount, description },
            operator.midtransServerKey,
          );
          snapToken      = snapResult.snapToken;
          snapRedirectUrl = snapResult.redirectUrl;
          snapClientKey   = operator.midtransClientKey ?? "";
          gatewayTxId = orderId; // Snap tidak return txId sampai bayar
        } else {
          throw qrisErr; // lempar ulang error lain (401, 500, dll)
        }
      }

    } else if (activeGateway === "XENDIT") {
      const result = await createXenditQrCharge(
        { referenceId: orderId, amount, description },
        operator.xenditSecretKey!,
      );
      qrString    = result.qrString;
      qrImageUrl  = ""; // Xendit tidak return image URL — render qrString di client
      expiresAt   = result.expiresAt;
      gatewayTxId = result.xenditQrId;

    } else if (activeGateway === "DOKU") {
      const result = await createDokuQrisCharge(
        { invoiceNumber: orderId, amount, description },
        operator.dokuClientId!,
        operator.dokuSecretKey!,
      );
      qrString    = result.qrString;
      qrImageUrl  = result.qrImageUrl;
      expiresAt   = result.expiresAt;
      gatewayTxId = result.invoiceNumber;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal membuat QR pembayaran. Coba lagi.";
    console.error(`[payment/create] ${activeGateway} error:`, msg);
    return NextResponse.json<ApiResponse>(
      { success: false, error: msg },
      { status: 502 }
    );
  }

  // 5. Tulis Transaction + BoothSession secara atomic
  try {
    const txCreate = prisma.transaction.create({
      data: {
        id:              txId,
        sessionId,
        operatorId:      operator.id,
        amount,
        method:          "QRIS",
        gateway:         activeGateway,
        midtransOrderId: orderId,   // universal order ID untuk semua gateway
        midtransId:      gatewayTxId,
        status:          "PENDING",
      },
    });
    const sessionCreate = prisma.boothSession.create({
      data: {
        id:            sessionId,
        boothConfigId,
        frameId:       persistedFrameId,
        status:        "PENDING",
        transactionId: txId,
        expiresAt,
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
    orderId,
    amount,
    qrImageUrl: qrImageUrl || null,
    qrString:   qrString   || null,
    expiresAt:  expiresAt.toISOString(),
    snapToken:  snapToken  || null,
    snapRedirectUrl: snapRedirectUrl || null,
    snapClientKey:   snapClientKey || null,
  };

  return NextResponse.json<ApiResponse<CreatePaymentResponse>>(
    { success: true, data: responseData },
    { status: 201 }
  );
}
