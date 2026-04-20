import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/booth/[slug]
//
// Publik — dipanggil oleh Booth UI saat mount.
// Returns: booth config + list frame yang tersedia untuk booth ini.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const booth = await prisma.boothConfig.findUnique({
    where:   { slug: params.slug, isActive: true },
    include: {
      operator: {
        select: { subscriptionTier: true, subscriptionExpiry: true, isActive: true },
      },
    },
  });

  if (!booth) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth tidak ditemukan" },
      { status: 404 }
    );
  }

  // Cek subscription aktif
  if (
    !booth.operator.isActive ||
    !booth.operator.subscriptionExpiry ||
    booth.operator.subscriptionExpiry < new Date()
  ) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth sedang tidak aktif" },
      { status: 403 }
    );
  }

  // Ambil frames yang tersedia
  // Jika allowedFrameIds kosong → ambil semua frame publik aktif
  const frames = await prisma.frame.findMany({
    where: {
      isActive: true,
      ...(booth.allowedFrameIds.length > 0
        ? { id: { in: booth.allowedFrameIds } }
        : {}),
    },
    select: {
      id:           true,
      name:         true,
      category:     true,
      thumbnailUrl: true,
      assetUrl:     true,
      isPremium:    true,
      canvasWidth:  true,
      canvasHeight: true,
      maxCaptures:  true,
      slots:        true,
      overlayUrl:   true,
      captureMode:  true,
    } as Record<string, true>,
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      booth: {
        id:                    booth.id,
        boothName:             booth.boothName,
        slug:                  booth.slug,
        pricePerSession:       booth.pricePerSession,
        printPricePerSheet:    booth.printPricePerSheet,
        sessionDurationSeconds: booth.sessionDurationSeconds,
        allowedFrameIds:       booth.allowedFrameIds,
        printEnabled:          booth.printEnabled,
        primaryColor:          booth.primaryColor,
        accentColor:           booth.accentColor,
        logoUrl:               booth.logoUrl,
        welcomeScreenPrefs:    booth.welcomeScreenPrefs ?? null,
        timerTutorialSeconds:    booth.timerTutorialSeconds,
        timerFrameSelectSeconds: booth.timerFrameSelectSeconds,
        timerPrintCountSeconds:  booth.timerPrintCountSeconds,
        timerPaymentSeconds:     booth.timerPaymentSeconds,
        timerCameraSeconds:      booth.timerCameraSeconds,
        timerPreviewSeconds:     booth.timerPreviewSeconds,
        timerDeliverySeconds:    booth.timerDeliverySeconds,
      },
      frames,
    },
  });
}
