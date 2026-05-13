import { NextResponse } from "next/server";
import { normalizeImportedSlots } from "@/lib/fremioSlots";

const FREMIO_API = "https://fremio.id/api";
const SLOT_DUPLICATE_TOLERANCE = 0.5;

// Validates shareId to prevent path traversal
const SHARE_ID_RE = /^[a-zA-Z0-9_-]{4,32}$/;

function toAbsoluteFremioUrl(input: string | null | undefined): string {
  if (!input) return "";
  if (input.startsWith("data:")) return input;
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  if (input.startsWith("/")) return `https://fremio.id${input}`;
  return `https://fremio.id/${input}`;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeSlotMetric(value: unknown, canvasSize: number): number {
  const numeric = toFiniteNumber(value, 0);
  if (numeric <= 0) return 0;
  // Legacy format sering menyimpan slot dalam pixel (basis canvas).
  // Format baru menyimpan normalized unit (0-1).
  const normalized = numeric > 1 ? numeric / Math.max(canvasSize, 1) : numeric;
  return clampUnit(normalized);
}

function resolveSlotPhotoIndex(slot: Record<string, unknown>, fallbackIndex: number): number {
  const candidates = [slot.photoIndex, slot.slotIndex, slot.index];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallbackIndex;
}

function areClose(left: unknown, right: unknown, tolerance = SLOT_DUPLICATE_TOLERANCE): boolean {
  return Math.abs(toFiniteNumber(left) - toFiniteNumber(right)) <= tolerance;
}

function getPhotoIndex(element: Record<string, unknown>): number | null {
  const data = (element.data as Record<string, unknown>) ?? {};
  const candidate = data.photoIndex;
  return Number.isFinite(candidate) ? Number(candidate) : null;
}

function getPhotoElementScore(element: Record<string, unknown>): number {
  const data = (element.data as Record<string, unknown>) ?? {};
  let score = 0;

  if (getPhotoIndex(element) !== null) score += 4;
  if (typeof element.id === "string" && element.id.length > 0) score += 2;
  if (Number.isFinite(data.borderRadius)) score += 1;

  return score;
}

function areEquivalentPhotoElements(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftIndex = getPhotoIndex(left);
  const rightIndex = getPhotoIndex(right);

  if (leftIndex !== null && rightIndex !== null && leftIndex !== rightIndex) {
    return false;
  }

  const leftData = (left.data as Record<string, unknown>) ?? {};
  const rightData = (right.data as Record<string, unknown>) ?? {};

  return (
    areClose(left.x, right.x) &&
    areClose(left.y, right.y) &&
    areClose(left.width, right.width) &&
    areClose(left.height, right.height) &&
    areClose(left.rotation, right.rotation) &&
    areClose(leftData.borderRadius, rightData.borderRadius)
  );
}

function dedupePhotoElements(elements: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const deduped: Array<Record<string, unknown>> = [];

  elements.forEach((element) => {
    const duplicateIndex = deduped.findIndex((candidate) =>
      areEquivalentPhotoElements(candidate, element)
    );

    if (duplicateIndex === -1) {
      deduped.push(element);
      return;
    }

    const existing = deduped[duplicateIndex];
    if (getPhotoElementScore(element) > getPhotoElementScore(existing)) {
      deduped[duplicateIndex] = element;
    }
  });

  return deduped;
}

type NormalizedSlot = {
  top: number;
  left: number;
  width: number;
  height: number;
  photoIndex: number;
  borderRadius: number;
  rotation: number;
  zIndex: number;
};

function dedupeNormalizedSlots(slots: NormalizedSlot[]): NormalizedSlot[] {
  const deduped: NormalizedSlot[] = [];

  slots.forEach((slot) => {
    const duplicateIndex = deduped.findIndex((candidate) => {
      if (candidate.photoIndex !== slot.photoIndex) {
        return false;
      }

      return (
        areClose(candidate.top, slot.top, 0.001) &&
        areClose(candidate.left, slot.left, 0.001) &&
        areClose(candidate.width, slot.width, 0.001) &&
        areClose(candidate.height, slot.height, 0.001) &&
        areClose(candidate.rotation, slot.rotation, 0.1) &&
        areClose(candidate.borderRadius, slot.borderRadius, 0.5)
      );
    });

    if (duplicateIndex === -1) {
      deduped.push(slot);
    }
  });

  return deduped;
}

export async function GET(
  _req: Request,
  { params }: { params: { shareId: string } },
) {
  const { shareId } = params;

  if (!shareId || !SHARE_ID_RE.test(shareId)) {
    return NextResponse.json({ error: "Invalid shareId" }, { status: 400 });
  }

  try {
    const res = await fetch(`${FREMIO_API}/drafts/share/${shareId}`, {
      next: { revalidate: 60 },
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Frame not found" }, { status: res.status });
    }

    const data = await res.json();
    const draft = data?.draft;
    if (!draft) {
      return NextResponse.json({ error: "Frame not found" }, { status: 404 });
    }

    // Parse frame_data
    let frameData: Record<string, unknown> = {};
    try {
      frameData =
        typeof draft.frame_data === "string"
          ? JSON.parse(draft.frame_data)
          : (draft.frame_data ?? {});
    } catch {
      // use empty fallback
    }

    const elements: Array<Record<string, unknown>> = Array.isArray(frameData.elements)
      ? (frameData.elements as Array<Record<string, unknown>>)
      : [];
    const canvasWidth  = Number(frameData.canvasWidth  ?? 1080);
    const canvasHeight = Number(frameData.canvasHeight ?? 1920);
    const backgroundColor =
      typeof frameData.canvasBackground === "string" && frameData.canvasBackground.trim().length > 0
        ? frameData.canvasBackground
        : "#ffffff";

    const explicitSlots = Array.isArray(frameData.slots)
      ? frameData.slots
          .map((slot, index) => {
            if (!slot || typeof slot !== "object") return null;

            const slotObject = slot as Record<string, unknown>;
            const slotData = (slotObject.data as Record<string, unknown>) ?? {};
            const normalizedWidth = normalizeSlotMetric(slotObject.width ?? slotObject.w ?? slotData.width ?? slotData.w, canvasWidth);
            const normalizedHeight = normalizeSlotMetric(slotObject.height ?? slotObject.h ?? slotData.height ?? slotData.h, canvasHeight);

            if (normalizedWidth <= 0 || normalizedHeight <= 0) {
              return null;
            }

            return {
              top: normalizeSlotMetric(slotObject.top ?? slotObject.y ?? slotData.top ?? slotData.y, canvasHeight),
              left: normalizeSlotMetric(slotObject.left ?? slotObject.x ?? slotData.left ?? slotData.x, canvasWidth),
              width: normalizedWidth,
              height: normalizedHeight,
              photoIndex: resolveSlotPhotoIndex(slotObject, index),
              borderRadius: toFiniteNumber(slotObject.borderRadius ?? slotData.borderRadius, 0),
              rotation: toFiniteNumber(slotObject.rotation ?? slotData.rotation, 0),
              zIndex: toFiniteNumber(slotObject.zIndex ?? slotData.zIndex, 0),
            } satisfies NormalizedSlot;
          })
          .filter((slot): slot is NormalizedSlot => Boolean(slot))
      : [];

    const normalizedSlotsFromLayout = normalizeImportedSlots(
      (frameData as {
        slots?: unknown;
        photoSlots?: unknown;
        photoAreas?: unknown;
        data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
      }).slots
      ?? (frameData as {
        slots?: unknown;
        photoSlots?: unknown;
        photoAreas?: unknown;
        data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
      }).photoSlots
      ?? (frameData as {
        slots?: unknown;
        photoSlots?: unknown;
        photoAreas?: unknown;
        data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
      }).photoAreas
      ?? (frameData as {
        slots?: unknown;
        photoSlots?: unknown;
        photoAreas?: unknown;
        data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
      }).data?.slots
      ?? (frameData as {
        slots?: unknown;
        photoSlots?: unknown;
        photoAreas?: unknown;
        data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
      }).data?.photoSlots
      ?? (frameData as {
        slots?: unknown;
        photoSlots?: unknown;
        photoAreas?: unknown;
        data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
      }).data?.photoAreas
      ?? null,
      Math.max(
        1,
        toFiniteNumber(
          (draft as { maxCaptures?: unknown } | null)?.maxCaptures
          ?? (frameData as { maxCaptures?: unknown } | null)?.maxCaptures,
          1,
        ),
      ),
      {
        canvasWidth,
        canvasHeight,
        layout: frameData,
      }
    );

    // Extract photo slots (type === "photo"), sorted top-to-bottom then left-to-right
    const photoEls = dedupePhotoElements(
      elements.filter((el) => {
        const type = String(el?.type ?? "").toLowerCase();
        const dataObj = (el?.data as Record<string, unknown>) ?? {};
        const hasPhotoIndex = Number.isFinite(Number(dataObj.photoIndex));
        const hasSlotMarker = dataObj.slotNumber !== undefined || dataObj.isPhotoSlot === true || dataObj.isPhotoArea === true;
        const rawImage =
          (typeof dataObj.image === "string" ? dataObj.image : "") ||
          (typeof el?.src === "string" ? String(el.src) : "");
        const hasSourceImage = rawImage.trim().length > 0;

        if (type === "photo" || type === "photo-slot" || type === "photo_area") return true;
        if (type === "background-photo" && (hasPhotoIndex || hasSlotMarker || !hasSourceImage)) return true;
        return false;
      })
    )
      .sort((a, b) => {
        const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
        return dy !== 0 ? dy : (Number(a.x) || 0) - (Number(b.x) || 0);
      });

    const derivedSlots = photoEls.map((el, i) => ({
      top:         normalizeSlotMetric(el.y ?? el.top, canvasHeight),
      left:        normalizeSlotMetric(el.x ?? el.left, canvasWidth),
      width:       normalizeSlotMetric(el.width ?? el.w ?? 200, canvasWidth),
      height:      normalizeSlotMetric(el.height ?? el.h ?? 200, canvasHeight),
      photoIndex:  (el.data as Record<string, unknown>)?.photoIndex !== undefined
                     ? Number((el.data as Record<string, unknown>).photoIndex)
                     : i,
      borderRadius:
        Number(el.borderRadius) ||
        Number((el.data as Record<string, unknown>)?.borderRadius) ||
        0,
      rotation: Number(el.rotation) || 0,
      zIndex: Number(el.zIndex) || 0,
    } satisfies NormalizedSlot));

    const slots = dedupeNormalizedSlots(
      normalizedSlotsFromLayout.length > 0
        ? normalizedSlotsFromLayout
        : (explicitSlots.length > 0 ? explicitSlots : derivedSlots)
    ).sort((a, b) => {
      if (a.photoIndex !== b.photoIndex) return a.photoIndex - b.photoIndex;
      const dy = a.top - b.top;
      return dy !== 0 ? dy : a.left - b.left;
    });

    const sceneElements = elements
      .filter((el) => {
        const type = String(el?.type ?? "");
        return type === "background-photo" || type === "upload" || type === "text" || type === "shape";
      })
      .map((el) => {
        const type = String(el.type ?? "upload") as "background-photo" | "upload" | "text" | "shape";
        const dataObj = (el.data as Record<string, unknown>) ?? {};
        const textValue =
          typeof dataObj.text === "string" ? dataObj.text :
          typeof el.text === "string" ? el.text :
          typeof dataObj.content === "string" ? dataObj.content :
          typeof el.content === "string" ? el.content :
          typeof dataObj.value === "string" ? dataObj.value :
          typeof el.value === "string" ? el.value :
          undefined;
        const rawImage =
          (typeof dataObj.image === "string" ? dataObj.image : "") ||
          (typeof el.src === "string" ? (el.src as string) : "");

        return {
          type,
          top: (Number(el.y) || 0) / canvasHeight,
          left: (Number(el.x) || 0) / canvasWidth,
          width: (Number(el.width) || canvasWidth) / canvasWidth,
          height: (Number(el.height) || canvasHeight) / canvasHeight,
          zIndex: Number(el.zIndex) || 0,
          rotation: Number(el.rotation) || 0,
          borderRadius:
            Number(el.borderRadius) ||
            Number(dataObj.borderRadius) ||
            0,
          src: rawImage ? toAbsoluteFremioUrl(rawImage) : null,
          objectFit:
            dataObj.objectFit === "contain" ||
            dataObj.objectFit === "cover" ||
            dataObj.objectFit === "fill"
              ? dataObj.objectFit
              : type === "background-photo"
                ? "fill"
                : "contain",
          text: textValue,
          align:
            dataObj.align === "left" || dataObj.align === "right" || dataObj.align === "center"
              ? dataObj.align
              : el.align === "left" || el.align === "right" || el.align === "center"
                ? el.align
                : dataObj.textAlign === "left" || dataObj.textAlign === "right" || dataObj.textAlign === "center"
                  ? dataObj.textAlign
                  : el.textAlign === "left" || el.textAlign === "right" || el.textAlign === "center"
                    ? el.textAlign
                    : "center",
          color:
            typeof dataObj.color === "string" ? dataObj.color :
            typeof el.color === "string" ? el.color :
            undefined,
          fontSize: Number(dataObj.fontSize ?? el.fontSize ?? 0) / canvasHeight,
          fontFamily:
            typeof dataObj.fontFamily === "string" ? dataObj.fontFamily :
            typeof el.fontFamily === "string" ? el.fontFamily :
            undefined,
          fontWeight:
            typeof dataObj.fontWeight === "number" || typeof dataObj.fontWeight === "string"
              ? dataObj.fontWeight
              : typeof el.fontWeight === "number" || typeof el.fontWeight === "string"
                ? el.fontWeight
              : undefined,
          fill: typeof dataObj.fill === "string" ? dataObj.fill : undefined,
          stroke: typeof dataObj.stroke === "string" ? dataObj.stroke : null,
          strokeWidth: Number(dataObj.strokeWidth || 0),
          shapeType: typeof dataObj.shapeType === "string" ? dataObj.shapeType : undefined,
        };
      })
      .sort((a, b) => a.zIndex - b.zIndex);

    // Extract upload image layers from frame_data.elements.
    // Fremio designer biasanya menyimpan URL di el.data.image (sering berupa path relatif /uploads/...).
    const uploadEls = elements.filter((el) => el?.type === "upload");

    const uploads = uploadEls
      .map((el) => {
        const dataObj = (el.data as Record<string, unknown>) ?? {};
        const rawImage =
          (typeof dataObj.image === "string" ? dataObj.image : "") ||
          (typeof el.src === "string" ? (el.src as string) : "");

        return {
          url: toAbsoluteFremioUrl(rawImage),
          isOverlay: Boolean(dataObj.__isOverlay),
          isCapturedOverlay: Boolean(dataObj.__capturedOverlay),
          zIndex: Number(el.zIndex) || 0,
        };
      })
      .filter((u) => !!u.url && !u.isCapturedOverlay);

    // overlayUrl: hanya untuk kompatibilitas frame booth lama.
    // Untuk draft QR frame, overlay sudah ada di sceneElements — jangan gunakan sebagai
    // full-canvas overlay karena akan menimpa semua layer.
    const overlayUrl: string | null = null;

    const thumbnailUrl = toAbsoluteFremioUrl(
      typeof draft.preview_url === "string" ? draft.preview_url : "",
    );
    // assetUrl: prioritas background-photo, lalu background (non-overlay) upload, lalu thumbnail.
    // Jangan gunakan overlay sticker sebagai assetUrl karena akan di-draw full-canvas.
    const backgroundPhoto = sceneElements.find((el) => el.type === "background-photo" && el.src);
    const backgroundUpload = uploads.find((u) => !u.isOverlay) ?? null;
    const assetUrl = backgroundPhoto?.src || backgroundUpload?.url || thumbnailUrl;

    const frame = {
      id:          `draft-${shareId}`,
      name:        typeof draft.title === "string" ? draft.title : "Draft Frame",
      category:    "CUSTOM",
      thumbnailUrl,
      assetUrl,
      backgroundColor,
      isPremium:   false,
      canvasWidth,
      canvasHeight,
      maxCaptures: slots.length || 1,
      slots:       slots.length > 0 ? slots : null,
      overlayUrl,
      sceneElements: sceneElements.length > 0 ? sceneElements : null,
    };

    return NextResponse.json({ frame });
  } catch (err) {
    console.error("[frame-by-share] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
