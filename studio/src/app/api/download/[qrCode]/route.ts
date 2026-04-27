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

const TRIAL_ONLY_MODE = true;
const TRIAL_EXPIRY_MINUTES = 5;
const DEFAULT_EXPIRY_HOURS = 24;

export interface DownloadData {
  qrCode:       string;
  sessionId:    string;
  photoUrl:     string;
  videoUrl:     string | null;
  gifUrl:       string | null;
  rawPhotoUrls: string[];      // foto per-capture tanpa frame
  operatorName: string;   // businessName operator
  boothName:    string;
  logoUrl:      string | null;
  primaryColor: string;
  accentColor:  string;
  completedAt:  string;   // ISO 8601
  expiresAt:    string;   // ISO 8601
  isExpired:    boolean;
  isTrial:      boolean;
  canUpgrade:   boolean;
  // Social media links (from welcomeScreenPrefs)
  socialCtaText: string;
  instagramUrl:  string | null;
  tiktokUrl:     string | null;
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
  const fallbackExpiresAt = TRIAL_ONLY_MODE
    ? new Date(completedAt.getTime() + TRIAL_EXPIRY_MINUTES * 60 * 1000)
    : new Date(completedAt.getTime() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);

  const expiresAt = session.expiresAt ?? fallbackExpiresAt;
  const trialLimitAt = new Date(completedAt.getTime() + TRIAL_EXPIRY_MINUTES * 60 * 1000);
  const isUpgradedWindow = expiresAt.getTime() > trialLimitAt.getTime();
  const isTrial = TRIAL_ONLY_MODE && !isUpgradedWindow;
  const canUpgrade = TRIAL_ONLY_MODE;
  const isExpired = new Date() > expiresAt;

  // Extract social media from welcomeScreenPrefs
  const prefs = session.boothConfig.welcomeScreenPrefs as Record<string, unknown> | null;
  const socialCtaText = typeof prefs?.socialCtaText === "string" ? prefs.socialCtaText : "Ikuti kami";
  const instagramUrl = typeof prefs?.instagramUrl === "string" ? prefs.instagramUrl : null;
  const tiktokUrl = typeof prefs?.tiktokUrl === "string" ? prefs.tiktokUrl : null;

  const data: DownloadData = {
    qrCode:       session.qrCode ?? params.qrCode,
    sessionId:    session.id,
    photoUrl:     session.photoUrl,
    videoUrl:     session.videoUrl ?? null,
    gifUrl:       session.gifUrl   ?? null,
    rawPhotoUrls: session.rawPhotoUrls ?? [],
    operatorName: session.boothConfig.operator.businessName,
    boothName:    session.boothConfig.boothName,
    logoUrl:      session.boothConfig.logoUrl,
    primaryColor: session.boothConfig.primaryColor,
    accentColor:  session.boothConfig.accentColor,
    completedAt:  completedAt.toISOString(),
    expiresAt:    expiresAt.toISOString(),
    isExpired,
    isTrial,
    canUpgrade,
    socialCtaText,
    instagramUrl,
    tiktokUrl,
  };

  return NextResponse.json<ApiResponse>({ success: true, data });
}
