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

  const mapped = (rawSlots as RawSlot[])
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
    .filter((slot) => slot.width > 0 && slot.height > 0);

  if (mapped.length === 0) {
    return inferSlotsFromCount(maxCaptures);
  }

  // Detect mirror/duplicate layout: two equal-count columns that together cover all slots.
  // A slot belongs to the left column when its horizontal center is left of the midpoint (0.5).
  const leftSlots  = mapped.filter(s => (s.left + s.width / 2) < 0.5);
  const rightSlots = mapped.filter(s => (s.left + s.width / 2) >= 0.5);
  const isMirror   =
    leftSlots.length > 0 &&
    leftSlots.length === rightSlots.length &&
    leftSlots.length + rightSlots.length === mapped.length;

  if (isMirror) {
    // Assign interleaved photoIndex: left[row]=row*2, right[row]=row*2+1.
    // This matches the scheme expected by the booth renderer's captureIdx formula:
    //   even photoIndex → left column  → captureIdx = photoIndex / 2
    //   odd  photoIndex → right column → captureIdx = nRows - 1 - floor(photoIndex / 2)
    // Resulting in "inverted" mirror mode: left-top ↔ right-bottom share the same capture.
    leftSlots.sort((a, b) => a.top - b.top || a.left - b.left);
    rightSlots.sort((a, b) => a.top - b.top || a.left - b.left);
    const result: NormalizedSlot[] = [];
    for (let row = 0; row < leftSlots.length; row++) {
      result.push({ ...leftSlots[row],  photoIndex: row * 2 });
      result.push({ ...rightSlots[row], photoIndex: row * 2 + 1 });
    }
    return result;
  }

  // Non-mirror: assign sequential photoIndex sorted by top-then-left position.
  return mapped
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((slot, index) => ({ ...slot, photoIndex: index }));
}
