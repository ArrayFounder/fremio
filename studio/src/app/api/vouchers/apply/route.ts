import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const TRIAL_ONLY_MODE = true;

const schema = z.object({
  boothConfigId: z.string().min(1),
  voucherId:     z.string().min(1),
  code:          z.string().min(1).transform((v) => v.toUpperCase().trim()),
  printCount:    z.number().int().min(1).max(10).default(1),
});

export interface VoucherSessionResponse {
  sessionId:     string;
  amount:        number;
  finalAmount:   number;
  discountAmount: number;
  voucherType:   "FREE" | "FIXED" | "PERCENT";
}

// ─── POST /api/vouchers/apply ─────────────────────────────────────────────────
// Dipakai ketika customer memakai voucher FIXED atau PERCENT.
// Untuk FREE, booth langsung skip ke CAMERA.
// Endpoint ini: (1) validasi ulang, (2) catat usedCount+1, (3) kembalikan session info.

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiResponse>({ success: false, error: "Body harus JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Input tidak valid" }, { status: 422 });
  }

  const { boothConfigId, voucherId, code, printCount } = parsed.data;

  const [booth, voucher] = await Promise.all([
    prisma.boothConfig.findUnique({
      where:   { id: boothConfigId, isActive: true },
      include: {
        operator: {
          select: { id: true, subscriptionExpiry: true, isActive: true },
        },
      },
    }),
    prisma.voucher.findUnique({ where: { id: voucherId } }),
  ]);

  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  if (
    !booth.operator.isActive ||
    (!TRIAL_ONLY_MODE &&
      booth.operator.subscriptionExpiry &&
      booth.operator.subscriptionExpiry < new Date())
  ) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Operator tidak aktif" }, { status: 403 });
  }
  if (!voucher || voucher.boothConfigId !== boothConfigId || voucher.code !== code || !voucher.isActive) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Voucher tidak valid" }, { status: 404 });
  }
  if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Voucher sudah habis" }, { status: 409 });
  }

  const price = booth.pricePerSession;
  const extraPrintCost = (printCount - 1) * booth.printPricePerSheet;
  let discountAmount = 0;
  if (voucher.type === "FREE")    discountAmount = price;
  else if (voucher.type === "FIXED")   discountAmount = Math.min(voucher.discountValue, price);
  else if (voucher.type === "PERCENT") discountAmount = Math.floor((price * voucher.discountValue) / 100);
  // Voucher hanya mengurangi harga dasar; print tambahan tetap dikenakan
  const discountedBase = Math.max(0, price - discountAmount);
  const finalAmount = discountedBase + extraPrintCost;

  // Buat BoothSession (tanpa Transaction untuk FREE)
  const sessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 25);

  await prisma.$transaction([
    prisma.boothSession.create({
      data: {
        id:            sessionId,
        boothConfigId,
        status:        "ACTIVE",    // langsung ACTIVE karena sudah lunas via voucher
        expiresAt:     new Date(Date.now() + booth.sessionDurationSeconds * 1000),
      },
    }),
    prisma.voucher.update({
      where: { id: voucherId },
      data:  { usedCount: { increment: 1 } },
    }),
  ]);

  const result: VoucherSessionResponse = {
    sessionId,
    amount:        price,
    finalAmount,
    discountAmount,
    voucherType:   voucher.type,
  };

  return NextResponse.json<ApiResponse<VoucherSessionResponse>>({ success: true, data: result }, { status: 201 });
}
