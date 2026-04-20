import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// POST /api/payment/simulate-paid
// Hanya untuk testing/development — langsung set session ke ACTIVE tanpa bayar.
// Diproteksi dengan AGENT_SECRET_TOKEN header.
export async function POST(req: Request): Promise<Response> {
  const token = req.headers.get("x-agent-token");
  if (!token || token !== process.env.AGENT_SECRET_TOKEN) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { sessionId } = (await req.json()) as { sessionId?: string };
  if (!sessionId) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "sessionId wajib diisi" },
      { status: 400 }
    );
  }

  const session = await prisma.boothSession.findUnique({
    where:  { id: sessionId },
    select: { id: true, status: true, transactionId: true },
  });

  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Sesi tidak ditemukan" },
      { status: 404 }
    );
  }

  // Update session → ACTIVE
  await prisma.boothSession.update({
    where: { id: sessionId },
    data:  { status: "ACTIVE", startedAt: new Date() },
  });

  // Update transaction → SUCCESS jika ada
  if (session.transactionId) {
    await prisma.transaction.update({
      where: { id: session.transactionId },
      data:  { status: "SUCCESS", paidAt: new Date() },
    });
  }

  return NextResponse.json<ApiResponse>({ success: true, data: { sessionId } });
}
