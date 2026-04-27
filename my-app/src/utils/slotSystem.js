const toFiniteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sortByTopThenLeft = (a, b) => {
  if (Math.abs(a.top - b.top) > 0.0001) return a.top - b.top;
  return a.left - b.left;
};

export const detectFrameSlots = (
  dataUrl,
  { alphaThreshold = 128, maxSide = 400, minAreaRatio = 0.01 } = {}
) =>
  new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;

      const ctx = offscreen.getContext("2d", { alpha: true });
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const { data: pixels } = ctx.getImageData(0, 0, w, h);
      const transparent = new Uint8Array(w * h);

      for (let i = 0; i < w * h; i++) {
        transparent[i] = pixels[i * 4 + 3] < alphaThreshold ? 1 : 0;
      }

      const labels = new Int32Array(w * h).fill(-1);
      const bounds = [];
      const stack = [];

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (!transparent[idx] || labels[idx] !== -1) continue;

          const label = bounds.length;
          const b = { minX: x, minY: y, maxX: x, maxY: y, size: 0 };
          stack.push(idx);

          while (stack.length > 0) {
            const cur = stack.pop();
            if (labels[cur] !== -1) continue;

            labels[cur] = label;
            b.size += 1;

            const cx = cur % w;
            const cy = Math.floor(cur / w);

            if (cx < b.minX) b.minX = cx;
            if (cx > b.maxX) b.maxX = cx;
            if (cy < b.minY) b.minY = cy;
            if (cy > b.maxY) b.maxY = cy;

            if (cx > 0 && transparent[cur - 1] && labels[cur - 1] === -1)
              stack.push(cur - 1);
            if (cx < w - 1 && transparent[cur + 1] && labels[cur + 1] === -1)
              stack.push(cur + 1);
            if (cy > 0 && transparent[cur - w] && labels[cur - w] === -1)
              stack.push(cur - w);
            if (cy < h - 1 && transparent[cur + w] && labels[cur + w] === -1)
              stack.push(cur + w);
          }

          bounds.push(b);
        }
      }

      const minSize = w * h * minAreaRatio;
      const slots = bounds
        .filter((b) => b.size >= minSize)
        .map((b) => ({
          left: b.minX / w,
          top: b.minY / h,
          width: (b.maxX - b.minX + 1) / w,
          height: (b.maxY - b.minY + 1) / h,
        }));

      resolve(slots);
    };

    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });

const normalizeSlotGeometry = (slots) =>
  (Array.isArray(slots) ? slots : []).map((slot, index) => {
    const left = toFiniteNumber(slot?.left, 0);
    const top = toFiniteNumber(slot?.top, 0);
    const width = toFiniteNumber(slot?.width, 0);
    const height = toFiniteNumber(slot?.height, 0);
    return {
      index,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  });

export const buildSlotMaps = (slots) => {
  const geometry = normalizeSlotGeometry(slots).filter(
    (slot) => slot.width > 0 && slot.height > 0
  );

  const slotNumberMap = {};
  const photoIndexMap = {};

  if (geometry.length === 0) {
    return {
      mode: "single",
      slotNumberMap,
      photoIndexMap,
      crossCenter: false,
      leftCount: 0,
      rightCount: 0,
    };
  }

  const crossesCenter = geometry.some(
    (slot) => slot.left < 0.5 && slot.right > 0.5
  );

  const leftSlots = geometry.filter((slot) => slot.right <= 0.5);
  const rightSlots = geometry.filter((slot) => slot.left >= 0.5);

  const isDuplicateMode =
    !crossesCenter &&
    leftSlots.length > 0 &&
    leftSlots.length === rightSlots.length &&
    leftSlots.length + rightSlots.length === geometry.length;

  if (isDuplicateMode) {
    leftSlots.sort(sortByTopThenLeft);
    rightSlots.sort(sortByTopThenLeft);

    const rows = leftSlots.length;

    leftSlots.forEach((slot, idx) => {
      slotNumberMap[slot.index] = idx + 1;
      photoIndexMap[slot.index] = idx;
    });

    rightSlots.forEach((slot, idx) => {
      const displayNumber = rows - idx;
      slotNumberMap[slot.index] = displayNumber;
      photoIndexMap[slot.index] = displayNumber - 1;
    });

    return {
      mode: "duplicate",
      slotNumberMap,
      photoIndexMap,
      crossCenter: false,
      leftCount: leftSlots.length,
      rightCount: rightSlots.length,
    };
  }

  const ordered = [...geometry].sort(sortByTopThenLeft);
  ordered.forEach((slot, idx) => {
    slotNumberMap[slot.index] = idx + 1;
    photoIndexMap[slot.index] = idx;
  });

  return {
    mode: "single",
    slotNumberMap,
    photoIndexMap,
    crossCenter: crossesCenter,
    leftCount: leftSlots.length,
    rightCount: rightSlots.length,
  };
};
