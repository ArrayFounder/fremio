import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const booth = await prisma.boothConfig.findUnique({
    where: { slug: params.slug, isActive: true },
    select: { id: true },
  });

  if (!booth) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth tidak ditemukan" },
      { status: 404 }
    );
  }

  const lookback = new Date(Date.now() - 2 * RETENTION_MS);
  const transactions = await prisma.transaction.findMany({
    where: {
      boothSession: { boothConfigId: booth.id },
      createdAt: { gte: lookback },
    },
    orderBy: { createdAt: "desc" },
    include: {
      boothSession: {
        select: {
          id: true,
          status: true,
          frameId: true,
          completedAt: true,
          startedAt: true,
          photoUrl: true,
          frame: { select: { name: true } },
        },
      },
    },
  });

  const items = transactions
    .map((transaction) => {
      const referenceAt = transaction.paidAt ?? transaction.createdAt;
      const expiresAt = new Date(referenceAt.getTime() + RETENTION_MS);
      return {
        id: transaction.id,
        orderId: transaction.midtransOrderId,
        amount: transaction.amount,
        method: transaction.method,
        status: transaction.status,
        paidAt: transaction.paidAt,
        createdAt: transaction.createdAt,
        expiresAt,
        boothSession: transaction.boothSession
          ? {
              id: transaction.boothSession.id,
              status: transaction.boothSession.status,
              frameId: transaction.boothSession.frameId,
              frameName: transaction.boothSession.frame?.name ?? null,
              startedAt: transaction.boothSession.startedAt,
              completedAt: transaction.boothSession.completedAt,
              photoUrl: transaction.boothSession.photoUrl,
            }
          : null,
      };
    })
    .filter((item) => item.expiresAt.getTime() > Date.now());

  return NextResponse.json<ApiResponse>({
    success: true,
    data: items,
  });
}