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

<<<<<<< HEAD
=======
function toAbsoluteFremioUrl(value: string): string {
  if (!value) return "";
  return value.startsWith("http") ? value : `https://fremio.id${value}`;
}

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
          if (img) return img.startsWith("http") ? img : `https://fremio.id${img}`;
=======
          if (img) return toAbsoluteFremioUrl(img);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
        }
      }
    }
  } catch {
    // fall through
  }
<<<<<<< HEAD
  // Fallback: thumbnail / imageUrl / imagePath
  return (frame.thumbnailUrl ?? frame.imageUrl ?? frame.imagePath ?? "") as string;
=======
  // Fallback priority: imagePath (actual frame asset) > imageUrl > thumbnail.
  // Using thumbnail first can break overlay detection and layering.
  const fallback = (frame.imagePath ?? frame.image_path ?? frame.imageUrl ?? frame.thumbnailUrl ?? "") as string;
  return toAbsoluteFremioUrl(fallback);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
          return img.startsWith("http") ? img : `https://fremio.id${img}`;
=======
          return toAbsoluteFremioUrl(img);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
=======
      const backgroundAssetUrl = extractBackgroundUrl(f);
      const overlayAssetUrl = extractOverlayUrl(f);
      const resolvedAssetUrl = backgroundAssetUrl || overlayAssetUrl || toAbsoluteFremioUrl(String(f.imagePath ?? f.image_url ?? f.imageUrl ?? f.thumbnailUrl ?? ""));
      const resolvedOverlayUrl = backgroundAssetUrl ? overlayAssetUrl : null;
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
      const aspectRatio = (layout?.aspectRatio as string | null) ?? "9:16";
      // Prefer explicit canvasWidth/Height from API, then from layout JSON
      // (AdminFrameCreator stores them there), then derive from aspectRatio.
      const layoutCw = layout?.canvasWidth  as number | null;
      const layoutCh = layout?.canvasHeight as number | null;
      const rawCw = (f.canvasWidth  as number | null) ?? layoutCw ?? null;
      const rawCh = (f.canvasHeight as number | null) ?? layoutCh ?? null;
      let canvasWidth  = rawCw ?? 1080;
      let canvasHeight = rawCh ?? 1920;
      if (!rawCw || !rawCh) {
        // Derive from aspect ratio so 2:3 frames get height=1620, not the
        // default 1920 which would shift slot coordinates and break the filter.
        const parts = aspectRatio.split(":").map(Number);
        const [rw, rh] = parts;
        if (rw > 0 && rh > 0) {
          canvasWidth  = 1080;
          canvasHeight = Math.round(1080 * rh / rw);
        }
      }

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
<<<<<<< HEAD
        thumbnailUrl:   (f.thumbnailUrl ?? f.imageUrl ?? f.imagePath) as string,
        assetUrl:       extractBackgroundUrl(f),
        overlayUrl:     extractOverlayUrl(f),
=======
        thumbnailUrl:   toAbsoluteFremioUrl(String(f.thumbnailUrl ?? f.thumbnailPath ?? f.imageUrl ?? f.imagePath ?? "")),
        assetUrl:       resolvedAssetUrl,
        overlayUrl:     resolvedOverlayUrl,
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
        aspectRatio,
        canvasWidth,
        canvasHeight,
        maxCaptures:    Math.max(1, (f.maxCaptures as number | null) ?? 1),
        isPremium:      (f.isPremium as boolean | null) ?? false,
        captureMode:    (f.captureMode as string | null) ?? (f.duplicatePhotos ? "duplicate" : "single"),
<<<<<<< HEAD
        slots:          normalizeImportedSlots((f.slots as unknown[] | null) ?? null, Math.max(1, (f.maxCaptures as number | null) ?? 1)),
=======
        rawSlots:       (f.slots as unknown) ?? null,
        layout,
        slots:          normalizeImportedSlots(
          (f.slots as unknown[] | null) ?? null,
          Math.max(1, (f.maxCaptures as number | null) ?? 1),
          {
            canvasWidth,
            canvasHeight,
            layout,
          }
        ),
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
