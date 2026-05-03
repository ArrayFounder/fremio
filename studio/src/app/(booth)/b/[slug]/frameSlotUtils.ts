import type { FrameData, PhotoSlot } from "./types";

function toFiniteNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeExplicitSlots(slots: PhotoSlot[]): PhotoSlot[] {
  return slots
    .filter((slot) => slot && slot.width > 0 && slot.height > 0)
    .map((slot, index) => ({
      top: toFiniteNumber(slot.top, 0),
      left: toFiniteNumber(slot.left, 0),
      width: toFiniteNumber(slot.width, 0),
      height: toFiniteNumber(slot.height, 0),
      photoIndex: Number.isFinite(slot.photoIndex) ? Number(slot.photoIndex) : index,
      borderRadius: toFiniteNumber(slot.borderRadius, 0),
      rotation: toFiniteNumber(slot.rotation, 0),
      zIndex: toFiniteNumber(slot.zIndex, 0),
    }))
<<<<<<< HEAD
    .sort((a, b) => a.photoIndex - b.photoIndex);
=======
    .sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.photoIndex - b.photoIndex;
    });
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
}

function inferAutoSlots(slotCount: number, forceTwoColumns: boolean): PhotoSlot[] {
  const count = Math.max(1, slotCount);
  const cols = forceTwoColumns ? 2 : (count <= 2 ? 1 : 2);
  const rows = Math.ceil(count / cols);

  // Untuk layout duplikat 2 kolom (ala frame vintage), gunakan jendela foto yang lebih kecil
  // agar tidak menutupi border/dekorasi frame saat metadata slot asli tidak tersedia.
  if (forceTwoColumns && rows >= 2) {
    const outerX = 0.08;
    const outerY = 0.08;
    const colGap = 0.08;

    const cellWidth = (1 - (2 * outerX) - colGap) / 2;
    const targetWH = 2.05; // normalized width/height untuk rasio slot landscape di canvas 2:3
    const height = Math.max(0.12, Math.min(0.22, cellWidth / targetWH));

    const totalSlotsHeight = rows * height;
    const totalFreeHeight = Math.max(0, 1 - (2 * outerY) - totalSlotsHeight);
    const rowGap = rows > 1 ? totalFreeHeight / (rows - 1) : 0;

    const slots: PhotoSlot[] = [];
    for (let row = 0; row < rows; row += 1) {
      const top = outerY + row * (height + rowGap);
      for (let col = 0; col < cols; col += 1) {
        const photoIndex = row * cols + col;
        if (photoIndex >= count) break;
        const left = col === 0 ? outerX : outerX + cellWidth + colGap;
        slots.push({
          top,
          left,
          width: cellWidth,
          height,
          photoIndex,
          borderRadius: 0,
          rotation: 0,
          zIndex: 0,
        });
      }
    }
    return slots;
  }

  const padX = 0.08;
  const padY = 0.08;
  const gapX = 0.04;
  const gapY = 0.035;

  const width = (1 - (2 * padX) - ((cols - 1) * gapX)) / cols;
  const height = (1 - (2 * padY) - ((rows - 1) * gapY)) / rows;

  if (width <= 0 || height <= 0) {
    return [{ top: 0.08, left: 0.08, width: 0.84, height: 0.84, photoIndex: 0 }];
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
      zIndex: 0,
    };
  });
}

function hasExplicitSlots(frame: FrameData): boolean {
  return Array.isArray(frame.slots) && frame.slots.length > 0;
}

export function isEffectiveDuplicateMode(frame: FrameData): boolean {
  if (frame.captureMode === "duplicate") return true;

  if (hasExplicitSlots(frame)) {
    const count = frame.slots!.length;
    return count >= 4 && count % 2 === 0;
  }

  return false;
}

/**
 * Returns ONLY the explicit slots defined in frame.slots.
 * Never generates fake/inferred slots — admin must define them via dashboard.
 */
export function getEffectiveSlots(frame: FrameData): PhotoSlot[] {
  if (hasExplicitSlots(frame)) {
    return normalizeExplicitSlots(frame.slots ?? []);
  }
  return [];
}

export function getEffectiveCaptureCount(frame: FrameData): number {
  const slots = getEffectiveSlots(frame);

  if (slots.length === 0) {
    // Tidak ada slot terdefinisi — gunakan maxCaptures sebagai jumlah foto
    return Math.max(1, frame.maxCaptures || 1);
  }

  if (isEffectiveDuplicateMode(frame)) {
    return Math.max(1, Math.floor(slots.length / 2));
  }

  return slots.length;
}