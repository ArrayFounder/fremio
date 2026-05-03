import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
<<<<<<< HEAD
import { normalizeImportedSlots } from "@/lib/fremioSlots";
import type { ApiResponse } from "@/types";

const TRIAL_ONLY_MODE = true;

=======
import type { ApiResponse } from "@/types";

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
        select: { subscriptionTier: true, subscriptionExpiry: true, isActive: true },
=======
        select: { isActive: true, subscriptionTier: true, subscriptionExpiry: true },
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
      },
    },
  });

  if (!booth) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth tidak ditemukan" },
      { status: 404 }
    );
  }

<<<<<<< HEAD
  // Trial rollout: abaikan gate subscription sementara.
  if (
    !booth.operator.isActive ||
    (!TRIAL_ONLY_MODE &&
      (!booth.operator.subscriptionExpiry ||
        booth.operator.subscriptionExpiry < new Date()))
  ) {
=======
  // Booth hanya aktif jika operator-nya aktif
  if (!booth.operator.isActive) {
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Booth sedang tidak aktif" },
      { status: 403 }
    );
  }

<<<<<<< HEAD
  // Ambil frames yang tersedia
  // Jika allowedFrameIds kosong → ambil semua frame publik aktif
  const rawFrames = await prisma.frame.findMany({
    where: {
      isActive: true,
      ...(booth.allowedFrameIds.length > 0
        ? { id: { in: booth.allowedFrameIds } }
        : {}),
=======
  // Watermark trial: sembunyikan jika booth pakai kredit OR operator punya
  // subscription PRO/ENTERPRISE yang belum expired
  const op = booth.operator;
  const hasValidSubscription = op.subscriptionTier === "PRO" || op.subscriptionTier === "ENTERPRISE"
    ? (op.subscriptionExpiry && new Date(op.subscriptionExpiry) > new Date())
    : false;
  const showTrialWatermark = !(booth as any).usesCredit && !hasValidSubscription;

  // Ambil frames yang tersedia
  // Hanya tampilkan frame yang diimport dari fremio.id (prefix fremio_sb_)
  const rawFrames = await prisma.frame.findMany({
    where: {
      isActive: true,
      id: {
        startsWith: "fremio_sb_",
        ...(booth.allowedFrameIds.length > 0
          ? { in: booth.allowedFrameIds }
          : {}),
      },
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
    const maxCaptures = Number(f.maxCaptures ?? 1);
    const normalizedSlots = frameId.startsWith("fremio_")
      ? normalizeImportedSlots(f.slots ?? null, Number.isFinite(maxCaptures) ? maxCaptures : 1)
      : f.slots;
    return {
      ...f,
      slots: normalizedSlots,
=======
    return {
      ...f,
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
        showTrialWatermark:    TRIAL_ONLY_MODE,
=======
        showTrialWatermark:    showTrialWatermark,
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
