import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  maxUses:  z.number().int().min(1).nullable().optional(),
});

// ─── PATCH /api/dashboard/vouchers/[id] ──────────────────────────────────────

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const voucher = await prisma.voucher.findUnique({
    where:   { id: params.id },
    include: { boothConfig: { select: { operatorId: true } } },
  });
  if (!voucher || voucher.boothConfig.operatorId !== session.user.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Voucher tidak ditemukan" }, { status: 404 });
  }

  const body   = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Input tidak valid" }, { status: 422 });
  }

  const updated = await prisma.voucher.update({
    where: { id: params.id },
    data:  parsed.data,
  });

  return NextResponse.json<ApiResponse>({ success: true, data: updated });
}

// ─── DELETE /api/dashboard/vouchers/[id] ─────────────────────────────────────

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const voucher = await prisma.voucher.findUnique({
    where:   { id: params.id },
    include: { boothConfig: { select: { operatorId: true } } },
  });
  if (!voucher || voucher.boothConfig.operatorId !== session.user.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Voucher tidak ditemukan" }, { status: 404 });
  }

  await prisma.voucher.delete({ where: { id: params.id } });
  return NextResponse.json<ApiResponse>({ success: true, data: null });
}
