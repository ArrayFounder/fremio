import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const TRIAL_ONLY_MODE = true;
const UPGRADED_EXPIRY_HOURS = 24;

interface UpgradeResponse {
  qrCode: string;
  expiresAt: string;
}

// POST /api/download/[qrCode]/upgrade
// Trial flow sementara: extend masa aktif link download menjadi 24 jam.
export async function POST(
  _req: Request,
  { params }: { params: { qrCode: string } }
): Promise<Response> {
  if (!TRIAL_ONLY_MODE) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Mode trial tidak aktif" },
      { status: 400 }
    );
  }

  const session = await prisma.boothSession.findUnique({
    where: { qrCode: params.qrCode },
    select: {
      id: true,
      qrCode: true,
      status: true,
      completedAt: true,
      startedAt: true,
      photoUrl: true,
    },
  });

  if (!session || session.status !== "COMPLETED" || !session.photoUrl) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Sesi download tidak valid" },
      { status: 404 }
    );
  }

  const anchorTime = session.completedAt ?? session.startedAt;
  const upgradedExpiry = new Date(
    anchorTime.getTime() + UPGRADED_EXPIRY_HOURS * 60 * 60 * 1000
  );

  const updated = await prisma.boothSession.update({
    where: { id: session.id },
    data: { expiresAt: upgradedExpiry },
    select: { qrCode: true, expiresAt: true },
  });

  const data: UpgradeResponse = {
    qrCode: updated.qrCode ?? params.qrCode,
    expiresAt: (updated.expiresAt ?? upgradedExpiry).toISOString(),
  };

  return NextResponse.json<ApiResponse<UpgradeResponse>>({ success: true, data });
}
