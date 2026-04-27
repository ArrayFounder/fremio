import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeImportedSlots } from "@/lib/fremioSlots";
import type { ApiResponse } from "@/types";

const TRIAL_ONLY_MODE = true;

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

  // Trial rollout: abaikan gate subscription sementara.
  if (
    !booth.operator.isActive ||
    (!TRIAL_ONLY_MODE &&
      (!booth.operator.subscriptionExpiry ||
        booth.operator.subscriptionExpiry < new Date()))
  ) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth sedang tidak aktif" },
      { status: 403 }
    );
  }

  // Ambil frames yang tersedia
  // Jika allowedFrameIds kosong → ambil semua frame publik aktif
  const rawFrames = await prisma.frame.findMany({
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

  const prefs = (booth.welcomeScreenPrefs as Record<string, unknown> | null) ?? null;
  const rawOverrides = prefs?.frameCategoryOverrides;
  const frameCategoryOverrides: Record<string, string> =
    rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)
      ? Object.fromEntries(
          Object.entries(rawOverrides as Record<string, unknown>)
            .filter(([k, v]) => typeof k === "string" && typeof v === "string" && v.trim().length > 0)
            .map(([k, v]) => [k, String(v)])
        )
      : {};

  const frames = (rawFrames as Array<{ id: string; category: string } & Record<string, unknown>>).map((f) => {
    const frameId = String(f.id);
    const override = frameCategoryOverrides[frameId];
    const maxCaptures = Number(f.maxCaptures ?? 1);
    const normalizedSlots = frameId.startsWith("fremio_")
      ? normalizeImportedSlots(f.slots ?? null, Number.isFinite(maxCaptures) ? maxCaptures : 1)
      : f.slots;
    return {
      ...f,
      slots: normalizedSlots,
      category: override && override.trim().length > 0 ? override : f.category,
    };
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      booth: {
        id:                    booth.id,
        boothName:             booth.boothName,
        slug:                  booth.slug,
        showTrialWatermark:    TRIAL_ONLY_MODE,
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
