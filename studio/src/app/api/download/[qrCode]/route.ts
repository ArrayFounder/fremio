import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/download/[qrCode]
//
// Publik — dipanggil halaman download customer.
// Diidentifikasi dengan qrCode (UUID) bukan sessionId, agar URL tidak
// mudah di-enumerate.
//
// Returns: session + operator + booth branding, status expiry
// ─────────────────────────────────────────────────────────────────────────────

const EXPIRY_HOURS = 24;

export interface DownloadData {
  sessionId:    string;
  photoUrl:     string;
  videoUrl:     string | null;
  operatorName: string;   // businessName operator
  boothName:    string;
  logoUrl:      string | null;
  primaryColor: string;
  accentColor:  string;
  completedAt:  string;   // ISO 8601
  expiresAt:    string;   // ISO 8601 (completedAt + 24h)
  isExpired:    boolean;
}

export async function GET(
  _req: Request,
  { params }: { params: { qrCode: string } }
): Promise<Response> {
  const session = await prisma.boothSession.findUnique({
    where: { qrCode: params.qrCode },
    include: {
      boothConfig: {
        include: {
          operator: {
            select: { businessName: true, isActive: true },
          },
        },
      },
    },
  });

  if (!session || session.status !== "COMPLETED" || !session.photoUrl) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Foto tidak ditemukan atau sesi belum selesai" },
      { status: 404 }
    );
  }

  const completedAt = session.completedAt ?? session.startedAt;
  const expiresAt   = new Date(completedAt.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);
  const isExpired   = new Date() > expiresAt;

  const data: DownloadData = {
    sessionId:    session.id,
    photoUrl:     session.photoUrl,
    videoUrl:     session.videoUrl ?? null,
    operatorName: session.boothConfig.operator.businessName,
    boothName:    session.boothConfig.boothName,
    logoUrl:      session.boothConfig.logoUrl,
    primaryColor: session.boothConfig.primaryColor,
    accentColor:  session.boothConfig.accentColor,
    completedAt:  completedAt.toISOString(),
    expiresAt:    expiresAt.toISOString(),
    isExpired,
  };

  return NextResponse.json<ApiResponse>({ success: true, data });
}
