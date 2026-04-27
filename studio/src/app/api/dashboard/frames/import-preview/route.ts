import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudioManagedFramesConfig } from "@/lib/studioManagedFrames";
import { normalizeImportedSlots } from "@/lib/fremioSlots";
import type { ApiResponse } from "@/types";

// Category mapping: fremio.id free-text → studio FrameCategory enum
const CATEGORY_MAP: Record<string, string> = {
  "Aesthetic Scrapbook & Retro": "AESTHETIC",
  "Romance":                     "AESTHETIC",
  "Self-love":                   "AESTHETIC",
  "Korean":                      "KOREAN",
  "Vintage":                     "VINTAGE",
  "Fremio Series":               "MINIMALIST",
  "Birthday":                    "BIRTHDAY",
  "Wedding":                     "WEDDING",
  "Graduation":                  "GRADUATION",
  "Holiday Fremio Series":       "SEASONAL",
  "Holiday":                     "SEASONAL",
  "Lebaran Series":              "SEASONAL",
  "Ramadan Series":              "SEASONAL",
  "Music":                       "CUSTOM",
  "Cute Characters":             "CUSTOM",
};

function mapCategory(raw: string): string {
  return CATEGORY_MAP[raw] ?? "CUSTOM";
}

/** URL gambar background frame (background-photo atau non-overlay upload). */
function extractBackgroundUrl(frame: Record<string, unknown>): string {
  try {
    const layout = frame.layout as Record<string, unknown> | null;
    if (layout?.elements && Array.isArray(layout.elements)) {
      for (const el of layout.elements as Record<string, unknown>[]) {
        if (el.type === "background-photo") {
          const data = el.data as Record<string, unknown> | null;
          const img = (typeof data?.image === "string" ? data.image : "") ||
                      (typeof el.src === "string" ? (el.src as string) : "");
          if (img) return img.startsWith("http") ? img : `https://fremio.id${img}`;
        }
      }
    }
  } catch {
    // fall through
  }
  // Fallback: thumbnail / imageUrl / imagePath
  return (frame.thumbnailUrl ?? frame.imageUrl ?? frame.imagePath ?? "") as string;
}

/** URL overlay PNG dekorasi (stiker, watermark) — null jika tidak ada. */
function extractOverlayUrl(frame: Record<string, unknown>): string | null {
  try {
    const layout = frame.layout as Record<string, unknown> | null;
    if (layout?.elements && Array.isArray(layout.elements)) {
      for (const el of layout.elements as Record<string, unknown>[]) {
        const data = el.data as Record<string, unknown> | null;
        if (data?.__isOverlay && typeof data.image === "string" && data.image) {
          const img = data.image as string;
          return img.startsWith("http") ? img : `https://fremio.id${img}`;
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

// GET /api/dashboard/frames/import-preview
// Sumber frame import studio booth adalah katalog khusus admin studio-booths.
export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const boothId = searchParams.get("boothId");
  const managedConfig = await getStudioManagedFramesConfig();
  const allowedIdsSet = new Set(managedConfig.allowedFrameIds);
  const whitelistActive =
    managedConfig.enforceWhitelist || managedConfig.allowedFrameIds.length > 0;

  // Fetch dari katalog source=studio_booth
  let sourceFrames: Record<string, unknown>[];
  try {
    const res = await fetch("https://fremio.id/api/frames?source=studio_booth&limit=1000", {
      cache: "no-store",
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    sourceFrames = json?.frames ?? json ?? [];
  } catch (err) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Gagal mengambil katalog studio booth dari fremio.id: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // Ambil ID studio yang sudah diimport + status isActive
  const existing = await prisma.frame.findMany({
    where: { id: { startsWith: "fremio_sb_" } },
    select: { id: true, isActive: true },
  });
  const importedMap = new Map(existing.map((f) => [f.id, f.isActive]));

  // Ambil booth punya user ini + allowedFrameIds
  let boothAllowedIds: string[] = [];
  let boothAllEnabled = true;
  if (boothId) {
    const booth = await prisma.boothConfig.findFirst({
      where: { id: boothId, operatorId: session.user.id },
      select: { allowedFrameIds: true },
    });
    if (booth) {
      boothAllowedIds = booth.allowedFrameIds;
      boothAllEnabled = booth.allowedFrameIds.length === 0;
    }
  }

  // Transform ke format preview, lalu filter hanya 4R
  const frames = sourceFrames
    .map((f) => {
      const sourceId = String(f.id ?? "").trim();
      const studioId = `fremio_sb_${sourceId}`;
      const layout = f.layout as Record<string, unknown> | null;
      const aspectRatio = (layout?.aspectRatio as string | null) ?? "9:16";
      const canvasWidth  = (f.canvasWidth  as number | null) ?? 1080;
      const canvasHeight = (f.canvasHeight as number | null) ?? 1920;

      // Tentukan status per-booth
      const inDb         = importedMap.has(studioId);
      const isActiveInDb = inDb && (importedMap.get(studioId) ?? false);

      // Frame "ada di booth" = ada di DB aktif DAN booth memakai frame ini
      let isInBooth = false;
      if (isActiveInDb) {
        if (!boothId)         isInBooth = true; // tidak ada context booth
        else if (boothAllEnabled) isInBooth = true; // booth allEnabled = semua frame aktif
        else                  isInBooth = boothAllowedIds.includes(studioId);
      }

      return {
        fremioId: sourceId,
        studioId,
        name:           f.name as string,
        category:       mapCategory(String(f.category ?? "")),
        fremioCategory: String(f.category ?? "CUSTOM"),
        thumbnailUrl:   (f.thumbnailUrl ?? f.imageUrl ?? f.imagePath) as string,
        assetUrl:       extractBackgroundUrl(f),
        overlayUrl:     extractOverlayUrl(f),
        aspectRatio,
        canvasWidth,
        canvasHeight,
        maxCaptures:    Math.max(1, (f.maxCaptures as number | null) ?? 1),
        isPremium:      (f.isPremium as boolean | null) ?? false,
        slots:          normalizeImportedSlots((f.slots as unknown[] | null) ?? null, Math.max(1, (f.maxCaptures as number | null) ?? 1)),
        // alreadyImported: frame aktif DAN sudah di booth (hijau, non-selectable)
        alreadyImported: isInBooth,
        // isDeactivated: frame ada di DB tapi belum/tidak aktif di booth (kuning, bisa dipilih ulang)
        isDeactivated: inDb && !isInBooth,
      };
    })
    .filter((f) => {
      if (!f.fremioId) return false;
      if (whitelistActive && !allowedIdsSet.has(f.fremioId)) {
        return false;
      }
      // Hanya 4R: rasio tinggi/lebar ≈ 1.5 (2:3 = canvasHeight 1620 untuk lebar 1080)
      const ratio = f.canvasHeight / f.canvasWidth;
      return ratio >= 1.45 && ratio <= 1.55;
    });

  return NextResponse.json<ApiResponse>({ success: true, data: frames });
}
