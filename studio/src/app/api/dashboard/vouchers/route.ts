import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const createSchema = z.object({
  boothConfigId: z.string().min(1),
  code:          z.string().min(1).max(50).transform((v) => v.toUpperCase().trim()),
  type:          z.enum(["FREE", "FIXED", "PERCENT"]),
  discountValue: z.number().int().min(0).default(0),
  maxUses:       z.number().int().min(1).nullable().optional(),
});

// ─── GET /api/dashboard/vouchers?boothConfigId=xxx ───────────────────────────

export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const boothConfigId = searchParams.get("boothConfigId");
  if (!boothConfigId) return NextResponse.json<ApiResponse>({ success: false, error: "boothConfigId required" }, { status: 400 });

  // Pastikan booth milik operator yang login
  const booth = await prisma.boothConfig.findFirst({ where: { id: boothConfigId, operatorId: session.user.id } });
  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });

  const vouchers = await prisma.voucher.findMany({
    where:   { boothConfigId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: vouchers });
}

// ─── POST /api/dashboard/vouchers ────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { boothConfigId, code, type, discountValue, maxUses } = parsed.data;

  // Pastikan booth milik operator yang login
  const booth = await prisma.boothConfig.findFirst({ where: { id: boothConfigId, operatorId: session.user.id } });
  if (!booth) return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });

  // Validasi logika discount
  if (type === "PERCENT" && (discountValue < 1 || discountValue > 100)) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Diskon persen harus antara 1-100" }, { status: 422 });
  }
  if (type === "FIXED" && discountValue < 1) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Potongan harga harus lebih dari 0" }, { status: 422 });
  }

  try {
    const voucher = await prisma.voucher.create({
      data: { boothConfigId, code, type, discountValue, maxUses: maxUses ?? null },
    });
    return NextResponse.json<ApiResponse>({ success: true, data: voucher }, { status: 201 });
  } catch (err: unknown) {
    const isUniqueViolation = err instanceof Error && err.message.includes("Unique constraint");
    if (isUniqueViolation) {
      return NextResponse.json<ApiResponse>({ success: false, error: `Kode "${code}" sudah ada di booth ini` }, { status: 409 });
    }
    console.error("[vouchers POST]", err);
    return NextResponse.json<ApiResponse>({ success: false, error: "Gagal membuat voucher" }, { status: 500 });
  }
}
