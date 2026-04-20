import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/sessions — list sesi booth operator
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const boothId = searchParams.get("boothId");
  const limit   = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const sessions = await prisma.boothSession.findMany({
    where: {
      boothConfig: { operatorId: session.user.id },
      ...(boothId ? { boothConfigId: boothId } : {}),
    },
    orderBy: { startedAt: "desc" },
    take:    limit,
    include: { frame: { select: { id: true, name: true, thumbnailUrl: true } } },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: sessions });
}

// POST /api/sessions — mulai sesi baru (dipanggil dari booth UI)
export async function POST(req: Request) {
  // TODO: validasi agent token atau booth token (bukan session operator)
  const body = await req.json();

  const { boothConfigId, frameId } = body as { boothConfigId: string; frameId?: string };
  if (!boothConfigId) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "boothConfigId wajib diisi" },
      { status: 422 }
    );
  }

  const qrCode = crypto.randomUUID();

  const newSession = await prisma.boothSession.create({
    data: {
      boothConfigId,
      frameId: frameId ?? null,
      qrCode,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 jam
    },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: newSession }, { status: 201 });
}
