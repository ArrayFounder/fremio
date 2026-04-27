import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// POST /api/sessions/[id]/print-success
// Dipanggil saat agent mengembalikan status print sukses.
// Mengurangi sisa kertas sebanyak 1 (minimal 0).
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await prisma.boothSession.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      boothConfig: {
        select: {
          id: true,
          printEnabled: true,
          welcomeScreenPrefs: true,
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Sesi tidak ditemukan" },
      { status: 404 }
    );
  }

  if (session.status !== "COMPLETED" && session.status !== "ACTIVE") {
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Sesi berstatus ${session.status}` },
      { status: 409 }
    );
  }

  if (!session.boothConfig.printEnabled) {
    return NextResponse.json<ApiResponse>({ success: true, data: { paperSheetsRemaining: null } });
  }

  const prefs = (session.boothConfig.welcomeScreenPrefs as Record<string, unknown> | null) ?? {};
  const currentRaw = Number(prefs.paperSheetsRemaining ?? 0);
  const current = Number.isFinite(currentRaw) ? Math.max(0, Math.floor(currentRaw)) : 0;
  const next = Math.max(0, current - 1);

  if (next !== current) {
    await prisma.boothConfig.update({
      where: { id: session.boothConfig.id },
      data: {
        welcomeScreenPrefs: {
          ...prefs,
          paperSheetsRemaining: next,
        } as Prisma.InputJsonValue,
      },
    });
  }

  return NextResponse.json<ApiResponse>({
    success: true,
    data: { paperSheetsRemaining: next },
  });
}
