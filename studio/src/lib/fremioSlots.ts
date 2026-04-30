type RawSlot = {
  top?: unknown;
  left?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  photoIndex?: unknown;
  borderRadius?: unknown;
  rotation?: unknown;
  zIndex?: unknown;
  data?: {
    photoIndex?: unknown;
    borderRadius?: unknown;
  } | null;
};

type RawLayout = {
  elements?: unknown;
} | null;

type NormalizeSlotOptions = {
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  layout?: unknown;
};

export type NormalizedSlot = {
  top: number;
  left: number;
  width: number;
  height: number;
  photoIndex: number;
  borderRadius: number;
  rotation: number;
  zIndex: number;
};

function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      const pct = Number(trimmed.slice(0, -1));
      if (Number.isFinite(pct)) return pct / 100;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asSlotArray(rawSlots: unknown): RawSlot[] {
  const parsed = parseJsonIfString(rawSlots);
  if (Array.isArray(parsed)) return parsed as RawSlot[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as {
      slots?: unknown;
      photoSlots?: unknown;
      photoAreas?: unknown;
      data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null;
    };
    const candidates = [
      obj.slots,
      obj.photoSlots,
      obj.photoAreas,
      obj.data?.slots,
      obj.data?.photoSlots,
      obj.data?.photoAreas,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as RawSlot[];
    }
  }
  return [];
}

function normalizeAxis(value: number, axisSize: number): number {
  if (value > 1 && axisSize > 1 && value <= axisSize + 1) {
    return value / axisSize;
  }
  return value;
}

function mapRawSlots(
  slots: RawSlot[],
  canvasWidth: number,
  canvasHeight: number
): NormalizedSlot[] {
  return slots
    .map((slot, index) => {
      const rawLeft = toNum(slot?.left ?? slot?.x, 0);
      const rawTop = toNum(slot?.top ?? slot?.y, 0);
      const rawWidth = toNum(slot?.width, 0);
      const rawHeight = toNum(slot?.height, 0);

      return {
        top: clamp01(normalizeAxis(rawTop, canvasHeight)),
        left: clamp01(normalizeAxis(rawLeft, canvasWidth)),
        width: clamp01(normalizeAxis(rawWidth, canvasWidth)),
        height: clamp01(normalizeAxis(rawHeight, canvasHeight)),
        photoIndex: Number.isFinite(Number(slot?.photoIndex))
          ? Number(slot?.photoIndex)
          : Number.isFinite(Number(slot?.data?.photoIndex))
          ? Number(slot?.data?.photoIndex)
          : index,
        borderRadius: toNum(slot?.borderRadius ?? slot?.data?.borderRadius, 0),
        rotation: toNum(slot?.rotation, 0),
        zIndex: toNum(slot?.zIndex, 1),
      };
    })
    .filter((slot) => slot.width > 0 && slot.height > 0);
}

function mapSlotsFromLayout(
  rawLayout: unknown,
  canvasWidth: number,
  canvasHeight: number
): NormalizedSlot[] {
  const layout = parseJsonIfString(rawLayout) as RawLayout;
  const layoutSlotCandidates = [
    (layout as { slots?: unknown } | null)?.slots,
    (layout as { photoSlots?: unknown } | null)?.photoSlots,
    (layout as { photoAreas?: unknown } | null)?.photoAreas,
    (layout as { data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null } | null)?.data?.slots,
    (layout as { data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null } | null)?.data?.photoSlots,
    (layout as { data?: { slots?: unknown; photoSlots?: unknown; photoAreas?: unknown } | null } | null)?.data?.photoAreas,
  ];
  for (const candidate of layoutSlotCandidates) {
    const mapped = mapRawSlots(asSlotArray(candidate), canvasWidth, canvasHeight);
    if (mapped.length > 0) return mapped;
  }

  const elements = Array.isArray(layout?.elements) ? layout.elements : [];

  return elements
    .filter((el) => {
      if (!el || typeof el !== "object") return false;
      const typeValue = String((el as { type?: unknown }).type ?? "").toLowerCase();
      return typeValue.includes("photo") && !typeValue.includes("background");
    })
    .map((el, index) => {
      const item = el as {
        x?: unknown;
        y?: unknown;
        left?: unknown;
        top?: unknown;
        width?: unknown;
        height?: unknown;
        xNorm?: unknown;
        yNorm?: unknown;
        leftNorm?: unknown;
        topNorm?: unknown;
        widthNorm?: unknown;
        heightNorm?: unknown;
        photoIndex?: unknown;
        borderRadius?: unknown;
        rotation?: unknown;
        zIndex?: unknown;
        data?: { photoIndex?: unknown; borderRadius?: unknown } | null;
      };

      const left = item.xNorm !== undefined || item.leftNorm !== undefined
        ? toNum(item.xNorm ?? item.leftNorm, 0)
        : normalizeAxis(toNum(item.x ?? item.left, 0), canvasWidth);
      const top = item.yNorm !== undefined || item.topNorm !== undefined
        ? toNum(item.yNorm ?? item.topNorm, 0)
        : normalizeAxis(toNum(item.y ?? item.top, 0), canvasHeight);
      const width = item.widthNorm !== undefined
        ? toNum(item.widthNorm, 0)
        : normalizeAxis(toNum(item.width, 0), canvasWidth);
      const height = item.heightNorm !== undefined
        ? toNum(item.heightNorm, 0)
        : normalizeAxis(toNum(item.height, 0), canvasHeight);

      return {
        top: clamp01(Number.isFinite(top) ? top : 0),
        left: clamp01(left),
        width: clamp01(width),
        height: clamp01(height),
        photoIndex: Number.isFinite(Number(item.photoIndex))
          ? Number(item.photoIndex)
          : Number.isFinite(Number(item.data?.photoIndex))
          ? Number(item.data?.photoIndex)
          : index,
        borderRadius: toNum(item.borderRadius ?? item.data?.borderRadius, 0),
        rotation: toNum(item.rotation, 0),
        zIndex: toNum(item.zIndex, 1),
      };
    })
    .filter((slot) => slot.width > 0 && slot.height > 0);
}

function sortSlotsStable(mapped: NormalizedSlot[]): NormalizedSlot[] {
  return mapped
    .slice()
    .sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      if (a.photoIndex !== b.photoIndex) return a.photoIndex - b.photoIndex;
      if (a.top !== b.top) return a.top - b.top;
      return a.left - b.left;
    });
}

function inferSlotsFromCount(maxCaptures: number): NormalizedSlot[] {
  const count = Math.max(1, Math.min(12, Math.floor(toNum(maxCaptures, 1))));
  const cols = count <= 2 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const padX = 0.08;
  const padY = 0.08;
  const gapX = 0.04;
  const gapY = 0.035;

  const width = (1 - (2 * padX) - ((cols - 1) * gapX)) / cols;
  const height = (1 - (2 * padY) - ((rows - 1) * gapY)) / rows;

  if (width <= 0 || height <= 0) {
    return [{ top: 0.08, left: 0.08, width: 0.84, height: 0.84, photoIndex: 0, borderRadius: 0, rotation: 0, zIndex: 1 }];
  }

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      top: padY + row * (height + gapY),
      left: padX + col * (width + gapX),
      width,
      height,
      photoIndex: index,
      borderRadius: 0,
      rotation: 0,
      zIndex: 1,
    };
  });
}

export function normalizeImportedSlots(
  rawSlots: unknown,
  maxCaptures: number,
  options: NormalizeSlotOptions = {}
): NormalizedSlot[] {
  const canvasWidth = Math.max(1, Math.floor(toNum(options.canvasWidth, 1080)));
  const canvasHeight = Math.max(1, Math.floor(toNum(options.canvasHeight, 1920)));

  const mappedFromSlots = mapRawSlots(asSlotArray(rawSlots), canvasWidth, canvasHeight);
  if (mappedFromSlots.length > 0) {
    return sortSlotsStable(mappedFromSlots);
  }

  const mappedFromLayout = mapSlotsFromLayout(options.layout, canvasWidth, canvasHeight);
  if (mappedFromLayout.length > 0) {
    return sortSlotsStable(mappedFromLayout);
  }

  return inferSlotsFromCount(maxCaptures);
}
