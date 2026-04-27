import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/dashboard/overview
// Stats ringkasan untuk halaman beranda dashboard operator

export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const operatorId = session.user.id;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  type BoothBreakdownRow = { id: string; boothName: string; revenue: bigint; sessions: bigint };

  const [
    sessionsToday,
    sessionsTotal,
    revenueToday,
    revenueTotal,
    activeBooths,
    recentSessions,
    popularFrames,
    boothBreakdownRaw,
  ] = await Promise.all([
    // Sesi hari ini
    prisma.boothSession.count({
      where: {
        boothConfig: { operatorId },
        startedAt:   { gte: todayStart },
        status:      "COMPLETED",
      },
    }),
    // Total sesi all-time
    prisma.boothSession.count({
      where: { boothConfig: { operatorId }, status: "COMPLETED" },
    }),
    // Revenue hari ini
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        operatorId,
        status:  "SUCCESS",
        paidAt:  { gte: todayStart },
      },
    }),
    // Revenue all-time
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { operatorId, status: "SUCCESS" },
    }),
    // Booth aktif
    prisma.boothConfig.count({
      where: { operatorId, isActive: true },
    }),
    // 5 sesi terakhir
    prisma.boothSession.findMany({
      where:   { boothConfig: { operatorId }, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take:    5,
      include: {
        frame:       { select: { name: true } },
        boothConfig: { select: { boothName: true } },
      },
    }),
    // Frame terpopuler (top 5)
    prisma.boothSession.groupBy({
      by:      ["frameId"],
      _count:  { frameId: true },
      where:   { boothConfig: { operatorId }, status: "COMPLETED", frameId: { not: null } },
      orderBy: { _count: { frameId: "desc" } },
      take:    5,
    }),
    // Revenue + sesi per booth (per-cabang breakdown)
    prisma.$queryRaw<BoothBreakdownRow[]>`
      SELECT
        bc.id,
        bc."boothName",
        COALESCE(SUM(CASE WHEN t.status = 'SUCCESS' THEN t.amount ELSE 0 END), 0) AS revenue,
        COUNT(DISTINCT CASE WHEN bs.status = 'COMPLETED' THEN bs.id ELSE NULL END) AS sessions
      FROM booth_configs bc
      LEFT JOIN booth_sessions bs ON bs."boothConfigId" = bc.id
      LEFT JOIN transactions t ON bs."transactionId" = t.id
      WHERE bc."operatorId" = ${operatorId}
      GROUP BY bc.id, bc."boothName"
      ORDER BY revenue DESC
    `,
  ]);

  // Resolve frame names untuk popularFrames
  const frameIds = popularFrames.map((f) => f.frameId!).filter(Boolean);
  const frames   = await prisma.frame.findMany({
    where:  { id: { in: frameIds } },
    select: { id: true, name: true, thumbnailUrl: true },
  });
  const frameMap = Object.fromEntries(frames.map((f) => [f.id, f]));

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      sessionsToday,
      sessionsTotal,
      revenueToday:  revenueToday._sum.amount  ?? 0,
      revenueTotal:  revenueTotal._sum.amount   ?? 0,
      activeBooths,
      recentSessions: recentSessions.map((s) => ({
        id:          s.id,
        boothName:   s.boothConfig.boothName,
        frameName:   s.frame?.name ?? "—",
        completedAt: s.completedAt,
        photoUrl:    s.photoUrl,
      })),
      popularFrames: popularFrames.map((f) => ({
        frameId:     f.frameId,
        count:       f._count.frameId,
        name:        frameMap[f.frameId!]?.name ?? "Unknown",
        thumbnailUrl: frameMap[f.frameId!]?.thumbnailUrl ?? "",
      })),
      boothBreakdown: boothBreakdownRaw.map((b) => ({
        id:        b.id,
        boothName: b.boothName,
        revenue:   Number(b.revenue),
        sessions:  Number(b.sessions),
      })),
    },
  });
}
