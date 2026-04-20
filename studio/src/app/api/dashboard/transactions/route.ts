import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/dashboard/transactions
// Query params:
//   from    — ISO date string awal rentang
//   to      — ISO date string akhir rentang
//   status  — SUCCESS | FAILED | PENDING | CANCELLED | EXPIRED
//   page    — nomor halaman (1-based, default 1)
//   limit   — jumlah per halaman (default 20, max 100)

export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from    = searchParams.get("from");
  const to      = searchParams.get("to");
  const status  = searchParams.get("status") as string | null;
  const page    = Math.max(1, Number(searchParams.get("page")  ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
  const skip    = (page - 1) * limit;

  const where = {
    operatorId: session.user.id,
    ...(status  ? { status: status as any } : {}),
    ...(from || to ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
      },
    } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      include: {
        boothSession: {
          include: {
            boothConfig: { select: { boothName: true, slug: true } },
            frame:       { select: { name: true } },
          },
        },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      transactions: transactions.map((t) => ({
        id:             t.id,
        amount:         t.amount,
        method:         t.method,
        status:         t.status,
        paidAt:         t.paidAt,
        createdAt:      t.createdAt,
        boothName:      t.boothSession?.boothConfig?.boothName ?? "—",
        frameName:      t.boothSession?.frame?.name ?? "—",
        midtransOrderId: t.midtransOrderId,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
}
