import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/dashboard/analytics
// Query params:
//   from   — ISO date (YYYY-MM-DD), default: 7 days ago
//   to     — ISO date (YYYY-MM-DD), default: today
//
// Returns daily breakdown of transaction volume by payment method.

export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const operatorId = session.user.id;
  const { searchParams } = new URL(req.url);

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 7);

  const fromStr = searchParams.get("from") ?? defaultFrom.toISOString().slice(0, 10);
  const toStr   = searchParams.get("to")   ?? today.toISOString().slice(0, 10);

  const fromDate = new Date(fromStr);
  const toDate   = new Date(toStr);
  toDate.setHours(23, 59, 59, 999);

  // Pull all successful transactions in range
  const transactions = await prisma.transaction.findMany({
    where: {
      operatorId,
      status: "SUCCESS",
      paidAt: { gte: fromDate, lte: toDate },
    },
    select: { paidAt: true, amount: true, method: true },
  });

  // Build day-keyed map: { "2026-04-12": { QRIS: 50000, GOPAY: 25000, ... } }
  const dayMap: Record<string, Record<string, number>> = {};
  for (const tx of transactions) {
    const day = (tx.paidAt ?? fromDate).toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = {};
    const m = tx.method ?? "OTHER";
    dayMap[day][m] = (dayMap[day][m] ?? 0) + tx.amount;
  }

  // Fill every day in range even if no transactions
  const series: { date: string; [method: string]: number | string }[] = [];
  const cur = new Date(fromDate);
  while (cur <= toDate) {
    const day = cur.toISOString().slice(0, 10);
    series.push({ date: day, ...(dayMap[day] ?? {}) });
    cur.setDate(cur.getDate() + 1);
  }

  // Unique methods across the whole range
  const methods = Array.from(
    new Set(transactions.map((t) => t.method ?? "OTHER"))
  );

  // Summary totals
  const totalVolume = transactions.reduce((s, t) => s + t.amount, 0);
  const totalCount  = await prisma.transaction.count({
    where: { operatorId, paidAt: { gte: fromDate, lte: toDate } },
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: { series, methods, totalVolume, totalCount },
  });
}
