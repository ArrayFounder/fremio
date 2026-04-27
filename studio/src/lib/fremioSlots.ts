type RawSlot = {
  top?: unknown;
  left?: unknown;
  width?: unknown;
  height?: unknown;
  photoIndex?: unknown;
  borderRadius?: unknown;
  rotation?: unknown;
  zIndex?: unknown;
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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
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

export function normalizeImportedSlots(rawSlots: unknown, maxCaptures: number): NormalizedSlot[] {
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    return inferSlotsFromCount(maxCaptures);
  }

  const normalized = (rawSlots as RawSlot[])
    .map((slot, index) => ({
      top: clamp01(toNum(slot?.top, 0)),
      left: clamp01(toNum(slot?.left, 0)),
      width: clamp01(toNum(slot?.width, 0)),
      height: clamp01(toNum(slot?.height, 0)),
      photoIndex: Number.isFinite(Number(slot?.photoIndex)) ? Number(slot?.photoIndex) : index,
      borderRadius: toNum(slot?.borderRadius, 0),
      rotation: toNum(slot?.rotation, 0),
      zIndex: toNum(slot?.zIndex, 1),
    }))
    .filter((slot) => slot.width > 0 && slot.height > 0)
    .sort((a, b) => a.photoIndex - b.photoIndex)
    .map((slot, index) => ({ ...slot, photoIndex: index }));

  if (normalized.length === 0) {
    return inferSlotsFromCount(maxCaptures);
  }

  return normalized;
}
