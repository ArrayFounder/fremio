import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const schema = z.object({
  code:         z.string().min(1).transform((v) => v.toUpperCase().trim()),
  boothConfigId: z.string().min(1),
});

export interface VoucherValidateResult {
  voucherId:     string;
  type:          "FREE" | "FIXED" | "PERCENT";
  discountValue: number;
  /** Harga setelah diskon diterapkan (tidak pernah negatif) */
  finalAmount:   number;
  discountAmount: number;
}

// ─── POST /api/vouchers/validate ─────────────────────────────────────────────
// Dipanggil oleh booth (publik, tidak perlu auth operator).

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiResponse>({ success: false, error: "Body harus JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Input tidak valid" }, { status: 422 });
  }

  const { code, boothConfigId } = parsed.data;

  // Ambil booth + harga per sesi
  const booth = await prisma.boothConfig.findUnique({
    where:  { id: boothConfigId, isActive: true },
    select: { pricePerSession: true, printPricePerSheet: true },
  });
  if (!booth) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  }

  const voucher = await prisma.voucher.findUnique({
    where: { boothConfigId_code: { boothConfigId, code } },
  });

  if (!voucher || !voucher.isActive) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Kode voucher tidak valid" }, { status: 404 });
  }

  // Cek batas pemakaian
  if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Voucher sudah mencapai batas pemakaian" }, { status: 409 });
  }

  // Hitung diskon
  const price = booth.pricePerSession;
  let discountAmount = 0;

  if (voucher.type === "FREE") {
    discountAmount = price;
  } else if (voucher.type === "FIXED") {
    discountAmount = Math.min(voucher.discountValue, price);
  } else if (voucher.type === "PERCENT") {
    discountAmount = Math.floor((price * voucher.discountValue) / 100);
  }

  const finalAmount = Math.max(0, price - discountAmount);

  const result: VoucherValidateResult = {
    voucherId:     voucher.id,
    type:          voucher.type,
    discountValue: voucher.discountValue,
    discountAmount,
    finalAmount,
  };

  return NextResponse.json<ApiResponse<VoucherValidateResult>>({ success: true, data: result });
}
