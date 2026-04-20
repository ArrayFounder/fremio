import { NextResponse } from "next/server";

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

            const normalizedWidth = toFiniteNumber((slot as Record<string, unknown>).width, 0);
            const normalizedHeight = toFiniteNumber((slot as Record<string, unknown>).height, 0);

            if (normalizedWidth <= 0 || normalizedHeight <= 0) {
              return null;
            }

            return {
              top: toFiniteNumber((slot as Record<string, unknown>).top, 0),
              left: toFiniteNumber((slot as Record<string, unknown>).left, 0),
              width: normalizedWidth,
              height: normalizedHeight,
              photoIndex: Number.isFinite((slot as Record<string, unknown>).photoIndex)
                ? Number((slot as Record<string, unknown>).photoIndex)
                : index,
              borderRadius: toFiniteNumber((slot as Record<string, unknown>).borderRadius, 0),
              rotation: toFiniteNumber((slot as Record<string, unknown>).rotation, 0),
              zIndex: toFiniteNumber((slot as Record<string, unknown>).zIndex, 0),
            } satisfies NormalizedSlot;
          })
          .filter((slot): slot is NormalizedSlot => Boolean(slot))
      : [];

    // Extract photo slots (type === "photo"), sorted top-to-bottom then left-to-right
    const photoEls = dedupePhotoElements(
      elements.filter((el) => el?.type === "photo")
    )
      .sort((a, b) => {
        const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
        return dy !== 0 ? dy : (Number(a.x) || 0) - (Number(b.x) || 0);
      });

    const derivedSlots = photoEls.map((el, i) => ({
      top:         (Number(el.y)      || 0) / canvasHeight,
      left:        (Number(el.x)      || 0) / canvasWidth,
      width:       (Number(el.width)  || 200) / canvasWidth,
      height:      (Number(el.height) || 200) / canvasHeight,
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
      explicitSlots.length > 0 ? explicitSlots : derivedSlots
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
          text: typeof dataObj.text === "string" ? dataObj.text : undefined,
          align:
            dataObj.align === "left" || dataObj.align === "right" || dataObj.align === "center"
              ? dataObj.align
              : "center",
          color: typeof dataObj.color === "string" ? dataObj.color : undefined,
          fontSize: Number(dataObj.fontSize || 0) / canvasHeight,
          fontFamily: typeof dataObj.fontFamily === "string" ? dataObj.fontFamily : undefined,
          fontWeight:
            typeof dataObj.fontWeight === "number" || typeof dataObj.fontWeight === "string"
              ? dataObj.fontWeight
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
