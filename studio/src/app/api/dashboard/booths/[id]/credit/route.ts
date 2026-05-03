import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dashboard/booths/[id]/credit
//
// Toggle penggunaan kredit pada booth. Operator harus memiliki cukup kredit
// yang tidak sedang digunakan booth lain untuk mengaktifkan.
// Body: { useCredit: boolean }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const { useCredit } = await req.json() as { useCredit?: boolean };
  if (typeof useCredit !== "boolean") {
    return NextResponse.json<ApiResponse>({ success: false, error: "useCredit boolean diperlukan" }, { status: 400 });
  }

  const booth = await prisma.boothConfig.findFirst({
    where:  { id: params.id, operatorId: session.user.id },
    select: { usesCredit: true },
  });
  if (!booth) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  }

  // Nonaktifkan kredit: selalu boleh
  if (!useCredit) {
    await prisma.boothConfig.update({
      where: { id: params.id },
      data:  { usesCredit: false },
    });
    return NextResponse.json<ApiResponse>({ success: true, data: { usesCredit: false } });
  }

  // Aktifkan kredit: cek sisa kredit operator yang belum dipakai
  const operator = await prisma.operator.findUnique({
    where:  { id: session.user.id },
    select: { credits: true },
  });
  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Operator tidak ditemukan" }, { status: 404 });

  const usedCredits = await prisma.boothConfig.count({
    where: { operatorId: session.user.id, usesCredit: true },
  });

  if (usedCredits >= operator.credits) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: `Kredit tidak cukup. Anda punya ${operator.credits} kredit dan sudah menggunakan ${usedCredits} pada booth lain.`,
    }, { status: 403 });
  }

  await prisma.boothConfig.update({
    where: { id: params.id },
    data:  { usesCredit: true },
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: { message: "Kredit diaktifkan pada booth ini. Watermark trial dihilangkan.", remainingCredits: operator.credits - usedCredits - 1 },
  });
}
