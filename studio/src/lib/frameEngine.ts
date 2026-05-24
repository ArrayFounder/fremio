/**
 * frameEngine.ts — Client-side Frame Engine untuk Fremio Studio Booth
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Slot foto dari fremio.id (posisi dinormalisasi 0-1) */
export interface PhotoSlot {
  top:          number
  left:         number
  width:        number
  height:       number
  photoIndex:   number
  borderRadius?: number
  rotation?:    number  // derajat, searah jarum jam positif
  zIndex?:      number
}

export interface DraftSceneElement {
  type: "background-photo" | "upload" | "text" | "shape"
  top: number
  left: number
  width: number
  height: number
  zIndex: number
  rotation?: number
  borderRadius?: number
  src?: string | null
  objectFit?: "fill" | "cover" | "contain"
  text?: string
  align?: "left" | "center" | "right"
  color?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number | string
  fill?: string
  stroke?: string | null
  strokeWidth?: number
  shapeType?: string
}

/**
 * Fallback layout jika tidak ada slot data:
 * - "1full"  : 1 foto mengisi seluruh canvas
 * - "2strip" : 2 foto strip atas+bawah
 * - "4grid"  : 4 foto grid 2×2
 */
export type FrameLayout = "1full" | "2strip" | "4grid";

/**
 * Deteksi apakah frame asset harus digambar SETELAH foto (overlay / transparent PNG).
 * - Ekstensi .png → overlay
 * - ImageKit PNG-as-JPG: URL path sebelum ekstensi terakhir berakhiran "_png" (mis. "...overlay_upload_1_png.jpg")
 */
export function isOverlayFrame(url: string): boolean {
  if (!url) return false;

  const raw = url.trim().toLowerCase();
  if (raw.startsWith("data:image/png")) return true;

  const candidates = [url];
  try {
    const parsed = new URL(url, "https://fremio.local");
    const nestedUrl = parsed.searchParams.get("url");
    if (nestedUrl) candidates.push(decodeURIComponent(nestedUrl));
  } catch {
    // Ignore invalid URL parsing; fallback to raw candidate.
  }

  return candidates.some((candidate) => {
    const value = candidate.trim().toLowerCase();
    if (!value) return false;
    if (value.startsWith("data:image/png")) return true;

    const path = value.split("?")[0];
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "png") return true;

    // Deteksi ImageKit PNG yang dikonversi ke format lain (ekstensi bukan .png tapi stem berakhir "_png")
    const lastDot = path.lastIndexOf(".");
    if (lastDot <= 0) return false;
    const stem = path.substring(0, lastDot);
    return stem.endsWith("_png");
  });
}

export interface ComposeOptions {
  /** Slot posisi foto dari framio.id. Diutamakan di atas layout otomatis. */
  slots?: PhotoSlot[];
  /** Fallback layout. Default ditentukan otomatis dari jumlah foto. */
  layout?: FrameLayout;
  /** Lebar canvas output dalam piksel. Default: 1080 */
  canvasWidth?: number;
  /** Tinggi canvas output dalam piksel. Default: 1920 */
  canvasHeight?: number;
  /** Kualitas JPEG (0–1). Default: 0.92 */
  quality?: number;
  /** Warna background. Default: "#ffffff" */
  backgroundColor?: string;
  /**
   * URL overlay PNG dekorasi (teks, stiker, watermark, border foto).
   * Selalu digambar TERAKHIR setelah semua foto — memastikan layering elemen
   * frame (bunga, teks, Fremio watermark) tampil di atas foto.
   * Hanya ada pada frame webp (background template) yang memiliki lapisan dekorasi terpisah.
   */
  overlayUrl?: string | null;
  /** Layer scene untuk frame draft user dari Fremio editor */
  sceneElements?: DraftSceneElement[] | null;
  /**
   * CSS filter yang diterapkan HANYA pada area foto/slot.
   * Frame design (background & overlay) tidak terpengaruh.
   * Contoh: "grayscale(100%) contrast(135%)"
   */
  photoFilterCss?: string;
  /** Tampilkan watermark trial kuning di tengah hasil render. */
  trialWatermark?: boolean;
  trialWatermarkText?: string;
}

function drawCenteredWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  text: string,
): void {
  const fontSize = Math.max(34, Math.round(canvasHeight * 0.05));
  const paddingX = Math.round(fontSize * 0.55);
  const paddingY = Math.round(fontSize * 0.28);

  ctx.save();
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const x = (canvasWidth - boxWidth) / 2;
  const y = (canvasHeight - boxHeight) / 2;
  const radius = Math.round(boxHeight / 2);

  ctx.fillStyle = "rgba(17, 24, 39, 0.62)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, boxWidth, boxHeight, radius);
  } else {
    ctx.rect(x, y, boxWidth, boxHeight);
  }
  ctx.fill();

  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.round(fontSize * 0.32);
  ctx.shadowOffsetY = Math.round(fontSize * 0.08);
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.08));
  ctx.strokeStyle = "rgba(120, 53, 15, 0.85)";
  ctx.fillStyle = "#facc15";
  ctx.strokeText(text, canvasWidth / 2, y + boxHeight / 2);
  ctx.fillText(text, canvasWidth / 2, y + boxHeight / 2);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Muat gambar dari URL/data URL, return Promise<HTMLImageElement>.
 * crossOrigin="anonymous" diperlukan agar canvas tidak di-taint saat
 * memuat gambar dari domain lain (R2, CDN, dll).
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for HTTP(S) URLs — data: and blob: URLs do NOT need
    // CORS handling and in Safari setting crossOrigin on them causes onerror to fire.
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/**
 * Gambar `img` ke dalam kotak `(dx, dy, dw, dh)` di canvas menggunakan
 * strategi object-fit: cover — crop tengah gambar tanpa distorsi.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const srcAspect = img.naturalWidth / img.naturalHeight;
  const dstAspect = dw / dh;

  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

  if (srcAspect > dstAspect) {
    // Gambar lebih lebar dari kotak — crop kiri-kanan
    sw = img.naturalHeight * dstAspect;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    // Gambar lebih tinggi dari kotak — crop atas-bawah
    sh = img.naturalWidth / dstAspect;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Helper: tutup kanvas menjadi Blob (JPEG).
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob() mengembalikan null"));
      },
      "image/jpeg",
      quality
    );
  });
}

export async function applyTrialWatermarkToDataUrl(
  sourceDataUrl: string,
  options: { quality?: number; text?: string } = {}
): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("applyTrialWatermarkToDataUrl() harus dipanggil di browser");
  }

  const img = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak dapat membuat 2D context");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawCenteredWatermark(ctx, canvas.width, canvas.height, options.text ?? "Trial");
  return canvas.toDataURL("image/jpeg", options.quality ?? 0.92);
}

/**
 * Tentukan layout otomatis berdasarkan jumlah foto.
 */
function inferLayout(count: number): FrameLayout {
  if (count >= 4) return "4grid";
  if (count >= 2) return "2strip";
  return "1full";
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot definitions
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasSlot { x: number; y: number; w: number; h: number; photoIndex: number; borderRadius: number; rotation: number; zIndex: number }
interface CanvasSceneElement {
  type: "background-photo" | "upload" | "text" | "shape"
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  rotation: number
  borderRadius: number
  src?: string | null
  objectFit?: "fill" | "cover" | "contain"
  text?: string
  align?: "left" | "center" | "right"
  color?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number | string
  fill?: string
  stroke?: string | null
  strokeWidth?: number
  shapeType?: string
}

/** Konversi slot fremio.id (normalized 0-1) ke pixel coordinates */
function slotsToCanvas(slots: PhotoSlot[], cw: number, ch: number): CanvasSlot[] {
  return slots
    .slice()
    .sort((a, b) => {
      const zA = Number.isFinite(a.zIndex) ? Number(a.zIndex) : 0;
      const zB = Number.isFinite(b.zIndex) ? Number(b.zIndex) : 0;
      if (zA !== zB) return zA - zB;
      return a.photoIndex - b.photoIndex;
    })
    .map((s) => ({
      x: s.left * cw,
      y: s.top * ch,
      w: s.width * cw,
      h: s.height * ch,
      photoIndex: s.photoIndex,
      borderRadius: s.borderRadius ?? 0,
      rotation: s.rotation ?? 0,
      zIndex:      s.zIndex ?? 0,
    }));
}

function sceneToCanvas(elements: DraftSceneElement[], cw: number, ch: number): CanvasSceneElement[] {
  return elements
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((el) => ({
      type: el.type,
      x: el.left * cw,
      y: el.top * ch,
      w: el.width * cw,
      h: el.height * ch,
      zIndex: el.zIndex,
      rotation: el.rotation ?? 0,
      borderRadius: el.borderRadius ?? 0,
      src: el.src,
      objectFit: el.objectFit ?? (el.type === "background-photo" ? "fill" : "contain"),
      text: el.text,
      align: el.align ?? "center",
      color: el.color ?? "#000000",
      fontSize: el.fontSize,
      fontFamily: el.fontFamily,
      fontWeight: el.fontWeight,
      fill: el.fill,
      stroke: el.stroke,
      strokeWidth: el.strokeWidth,
      shapeType: el.shapeType,
    }));
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!points.length) return;
  ctx.moveTo(x + points[0][0] * w, y + points[0][1] * h);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(x + points[index][0] * w, y + points[index][1] * h);
  }
  ctx.closePath();
}

function traceHeart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const px = (value: number) => x + value * w;
  const py = (value: number) => y + value * h;
  ctx.moveTo(px(0.5), py(0.88));
  ctx.bezierCurveTo(px(0.2), py(0.6), px(0.05), py(0.4), px(0.05), py(0.25));
  ctx.bezierCurveTo(px(0.05), py(0.1), px(0.2), py(0.05), px(0.35), py(0.05));
  ctx.bezierCurveTo(px(0.45), py(0.05), px(0.5), py(0.15), px(0.5), py(0.15));
  ctx.bezierCurveTo(px(0.5), py(0.15), px(0.55), py(0.05), px(0.65), py(0.05));
  ctx.bezierCurveTo(px(0.8), py(0.05), px(0.95), py(0.1), px(0.95), py(0.25));
  ctx.bezierCurveTo(px(0.95), py(0.4), px(0.8), py(0.6), px(0.5), py(0.88));
  ctx.closePath();
}

function traceShapePath(ctx: CanvasRenderingContext2D, el: CanvasSceneElement): void {
  const shapeType = el.shapeType ?? "rectangle";
  const radius = Math.max(0, Math.min(el.borderRadius ?? 0, Math.min(el.w, el.h) / 2));

  ctx.beginPath();

  switch (shapeType) {
    case "circle":
      ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      tracePolygon(ctx, [[0.5, 0.05], [0.95, 0.95], [0.05, 0.95]], el.x, el.y, el.w, el.h);
      break;
    case "star":
      tracePolygon(ctx, [[0.5, 0.05], [0.61, 0.4], [0.98, 0.4], [0.68, 0.62], [0.79, 0.97], [0.5, 0.75], [0.21, 0.97], [0.32, 0.62], [0.02, 0.4], [0.39, 0.4]], el.x, el.y, el.w, el.h);
      break;
    case "heart":
      traceHeart(ctx, el.x, el.y, el.w, el.h);
      break;
    case "hexagon":
      tracePolygon(ctx, [[0.5, 0.03], [0.93, 0.25], [0.93, 0.75], [0.5, 0.97], [0.07, 0.75], [0.07, 0.25]], el.x, el.y, el.w, el.h);
      break;
    case "diamond":
      tracePolygon(ctx, [[0.5, 0.05], [0.95, 0.5], [0.5, 0.95], [0.05, 0.5]], el.x, el.y, el.w, el.h);
      break;
    case "pentagon":
      tracePolygon(ctx, [[0.5, 0.05], [0.97, 0.38], [0.79, 0.95], [0.21, 0.95], [0.03, 0.38]], el.x, el.y, el.w, el.h);
      break;
    case "octagon":
      tracePolygon(ctx, [[0.3, 0.05], [0.7, 0.05], [0.95, 0.3], [0.95, 0.7], [0.7, 0.95], [0.3, 0.95], [0.05, 0.7], [0.05, 0.3]], el.x, el.y, el.w, el.h);
      break;
    case "arrow-right":
      tracePolygon(ctx, [[0.05, 0.3], [0.6, 0.3], [0.6, 0.1], [0.95, 0.5], [0.6, 0.9], [0.6, 0.7], [0.05, 0.7]], el.x, el.y, el.w, el.h);
      break;
    case "arrow-up":
      tracePolygon(ctx, [[0.5, 0.05], [0.9, 0.4], [0.7, 0.4], [0.7, 0.95], [0.3, 0.95], [0.3, 0.4], [0.1, 0.4]], el.x, el.y, el.w, el.h);
      break;
    case "cross":
      tracePolygon(ctx, [[0.35, 0.05], [0.65, 0.05], [0.65, 0.35], [0.95, 0.35], [0.95, 0.65], [0.65, 0.65], [0.65, 0.95], [0.35, 0.95], [0.35, 0.65], [0.05, 0.65], [0.05, 0.35], [0.35, 0.35]], el.x, el.y, el.w, el.h);
      break;
    case "line-horizontal":
      ctx.rect(el.x, el.y + el.h * 0.45, el.w, el.h * 0.1);
      break;
    case "line-vertical":
      ctx.rect(el.x + el.w * 0.45, el.y, el.w * 0.1, el.h);
      break;
    case "rectangle":
    default:
      if (radius > 0 && typeof ctx.roundRect === "function") {
        ctx.roundRect(el.x, el.y, el.w, el.h, radius);
      } else {
        ctx.rect(el.x, el.y, el.w, el.h);
      }
      break;
  }
}

function drawSceneShapeElementSync(
  ctx: CanvasRenderingContext2D,
  el: CanvasSceneElement,
): void {
  ctx.save();
  if (el.rotation !== 0) {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  traceShapePath(ctx, el);

  const fill = el.fill ?? "#d9b9ab";
  if (fill && fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const strokeWidth = Math.max(0, el.strokeWidth ?? 0);
  if (el.stroke && strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  ctx.restore();
}

/** Fallback: slot grid sederhana */
function inferSlots(count: number, cw: number, ch: number): CanvasSlot[] {
  return inferSlotsWithPadding(count, cw, ch, 0);
}

/**
 * Fallback dengan padding uniform — dipakai saat frame adalah background opaque
 * (webp/jpg) tanpa slot data. Padding memberi ruang agar border frame terlihat.
 */
function inferSlotsWithPadding(count: number, cw: number, ch: number, padding: number): CanvasSlot[] {
  const px = Math.round(cw * padding);
  const py = Math.round(ch * padding);
  const aw = cw - 2 * px;
  const ah = ch - 2 * py;
  const layout = inferLayout(count);
  switch (layout) {
    case "1full":
      return [{ x: px, y: py, w: aw, h: ah, photoIndex: 0, borderRadius: 0, rotation: 0, zIndex: 0 }];
    case "2strip":
      return [
        { x: px, y: py,           w: aw, h: ah / 2, photoIndex: 0, borderRadius: 0, rotation: 0, zIndex: 0 },
        { x: px, y: py + ah / 2,  w: aw, h: ah / 2, photoIndex: 1, borderRadius: 0, rotation: 0, zIndex: 0 },
      ];
    case "4grid":
      return [
        { x: px,           y: py,           w: aw / 2, h: ah / 2, photoIndex: 0, borderRadius: 0, rotation: 0, zIndex: 0 },
        { x: px + aw / 2,  y: py,           w: aw / 2, h: ah / 2, photoIndex: 1, borderRadius: 0, rotation: 0, zIndex: 0 },
        { x: px,           y: py + ah / 2,  w: aw / 2, h: ah / 2, photoIndex: 2, borderRadius: 0, rotation: 0, zIndex: 0 },
        { x: px + aw / 2,  y: py + ah / 2,  w: aw / 2, h: ah / 2, photoIndex: 3, borderRadius: 0, rotation: 0, zIndex: 0 },
      ];
  }
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const srcAspect = img.naturalWidth / img.naturalHeight;
  const dstAspect = dw / dh;
  let rw = dw;
  let rh = dh;
  let rx = dx;
  let ry = dy;

  if (srcAspect > dstAspect) {
    rh = dw / srcAspect;
    ry = dy + (dh - rh) / 2;
  } else {
    rw = dh * srcAspect;
    rx = dx + (dw - rw) / 2;
  }
  ctx.drawImage(img, rx, ry, rw, rh);
}

async function drawSceneImageElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasSceneElement,
): Promise<void> {
  if (!el.src) return;
  const img = await loadImage(proxifyUrl(el.src));
  drawSceneImageElementSync(ctx, el, img);
}

function drawSceneImageElementSync(
  ctx: CanvasRenderingContext2D,
  el: CanvasSceneElement,
  img: HTMLImageElement,
): void {
  ctx.save();
  if (el.rotation !== 0) {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (el.borderRadius > 0) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(el.x, el.y, el.w, el.h, el.borderRadius);
    else ctx.rect(el.x, el.y, el.w, el.h);
    ctx.clip();
  }

  if (el.objectFit === "contain") drawContain(ctx, img, el.x, el.y, el.w, el.h);
  else if (el.objectFit === "cover") drawCover(ctx, img, el.x, el.y, el.w, el.h);
  else ctx.drawImage(img, el.x, el.y, el.w, el.h);
  ctx.restore();
}

async function drawSceneTextElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasSceneElement,
  ch: number,
): Promise<void> {
  if (!el.text) return;
  const fontSize = Math.max(12, Math.round((el.fontSize ?? 0.05) * ch));
  const fontWeight = el.fontWeight ?? 600;
  const fontFamily = el.fontFamily ? `\"${el.fontFamily}\", sans-serif` : "sans-serif";

  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await document.fonts.load(`${fontWeight} ${fontSize}px ${fontFamily}`);
    }
  } catch {
    // Best-effort only.
  }

  drawSceneTextElementSync(ctx, el, ch);
}

function drawSceneTextElementSync(
  ctx: CanvasRenderingContext2D,
  el: CanvasSceneElement,
  ch: number,
): void {
  if (!el.text) return;
  const fontSize = Math.max(12, Math.round((el.fontSize ?? 0.05) * ch));
  const fontWeight = el.fontWeight ?? 600;
  const fontFamily = el.fontFamily ? `\"${el.fontFamily}\", sans-serif` : "sans-serif";
  const lines = el.text.split("\n");
  const lineHeight = fontSize * 1.1;
  const totalHeight = lines.length * lineHeight;

  ctx.save();
  if (el.rotation !== 0) {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = el.color ?? "#000000";
  ctx.textBaseline = "top";
  ctx.textAlign = el.align ?? "center";
  const anchorX = (el.align ?? "center") === "left"
    ? el.x
    : (el.align ?? "center") === "right"
      ? el.x + el.w
      : el.x + el.w / 2;
  let y = el.y + Math.max(0, (el.h - totalHeight) / 2);
  for (const line of lines) {
    ctx.fillText(line, anchorX, y);
    y += lineHeight;
  }
  ctx.restore();
}

async function drawSceneElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasSceneElement[],
  ch: number,
): Promise<void> {
  for (const el of elements) {
    try {
      if (el.type === "text") await drawSceneTextElement(ctx, el, ch);
      else if (el.type === "shape") drawSceneShapeElementSync(ctx, el);
      else await drawSceneImageElement(ctx, el);
    } catch (err) {
      console.warn("[frameEngine] Gagal render scene element", el.type, err);
    }
  }
}

function drawSceneElementsSync(
  ctx: CanvasRenderingContext2D,
  elements: CanvasSceneElement[],
  ch: number,
  images: Map<string, HTMLImageElement>,
): void {
  for (const el of elements) {
    try {
      if (el.type === "text") {
        drawSceneTextElementSync(ctx, el, ch);
        continue;
      }
      if (el.type === "shape") {
        drawSceneShapeElementSync(ctx, el);
        continue;
      }
      if (!el.src) continue;
      const img = images.get(el.src);
      if (!img) continue;
      drawSceneImageElementSync(ctx, el, img);
    } catch (err) {
      console.warn("[frameEngine] Gagal render scene element sync", el.type, err);
    }
  }
}

/**
 * Proxy URL untuk gambar dari fremio.id — hindari CORS saat loading ke canvas.
 */
function proxifyUrl(url: string): string {
  if (url.startsWith("https://fremio.id/") || url.startsWith("https://api.fremio.id/")) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/** Gambar foto ke slot dengan optional rounded corners dan rotation via clip */
function drawPhotoInSlot(
  ctx:    CanvasRenderingContext2D,
  img:    HTMLImageElement,
  slot:   CanvasSlot,
): void {
  ctx.save();
  // Jika ada rotasi, translate ke pusat slot lalu rotate
  if (slot.rotation !== 0) {
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((slot.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.beginPath();
  if (slot.borderRadius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(slot.x, slot.y, slot.w, slot.h, slot.borderRadius);
  } else {
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
  }
  ctx.clip();
  drawCover(ctx, img, slot.x, slot.y, slot.w, slot.h);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// composePhoto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composite foto-foto ke dalam frame PNG.
 * Jika `options.slots` tersedia (dari fremio.id), gunakan posisi slot yang tepat.
 * Otherwise fallback ke grid otomatis.
 */
export async function composePhoto(
  photoDataUrls: string | string[],
  frameAssetUrl: string,
  options: ComposeOptions = {}
): Promise<Blob> {
  const photos  = Array.isArray(photoDataUrls) ? photoDataUrls : [photoDataUrls];
  const cw      = options.canvasWidth  ?? 1080;
  const ch      = options.canvasHeight ?? 1920;
  const quality = options.quality      ?? 0.92;
  const bg      = options.backgroundColor ?? "#ffffff";
  const safeFrameUrl = proxifyUrl(frameAssetUrl);

  // Determine render mode:
  // - PNG with alpha = transparent overlay → draw AFTER photos
  // - WEBP / other = background template → draw BEFORE photos
  // NOTE: ImageKit mengonversi PNG ke JPG — deteksi via isOverlayFrame() helper.
  const isOverlay = isOverlayFrame(frameAssetUrl);

  // Tentukan slots:
  // - Jika ada slot data → gunakan posisi eksplisit (baik overlay maupun background)
  // - Jika tidak ada slot (overlay PNG) → inferSlots penuh (frame transparan menutup sisi foto)
  // - Jika tidak ada slot (background webp/jpg) → inferSlots dengan 8% padding
  //   agar border/dekorasi frame tetap terlihat di pinggiran
  const hasExplicitSlots = options.slots && options.slots.length > 0;
  const canvasSlots: CanvasSlot[] = hasExplicitSlots
    ? slotsToCanvas(options.slots!, cw, ch)
    : isOverlay
      ? inferSlots(photos.length, cw, ch)
      : inferSlotsWithPadding(photos.length, cw, ch, 0.08);
  const canvasScene = options.sceneElements?.length ? sceneToCanvas(options.sceneElements, cw, ch) : [];
  // Cari zIndex minimum slot foto → semua scene element di bawahnya digambar sebelum foto
  // PENTING: initial value harus Infinity (bukan 0) agar slot dengan zIndex=0 tetap terhitung
  const photoLayerZ = canvasSlots.length > 0
    ? canvasSlots.reduce((min, slot) => Math.min(min, slot.zIndex), Infinity)
    : 0;
  const sceneBeforePhotos = canvasScene.filter((el) => el.zIndex < photoLayerZ);
  const sceneAfterPhotos = canvasScene.filter((el) => el.zIndex >= photoLayerZ);

  // Jika frame memiliki sceneElements (draft QR frame), semua layer di-render
  // melalui scene pipeline. Skip full-canvas draw dari assetUrl & overlayUrl
  // karena mereka sudah tercakup di sceneBeforePhotos / sceneAfterPhotos.
  const useSceneRendering = canvasScene.length > 0;

  if (typeof document === "undefined") {
    throw new Error("composePhoto() harus dipanggil di browser");
  }

  const canvas  = document.createElement("canvas");
  canvas.width  = cw;
  canvas.height = ch;
  const ctx     = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak dapat membuat 2D context");

  // ─── 1. Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  // ─── 2. Background-mode frame (webp/jpg/template) — drawn BEFORE photos ──
  // Dilewati jika sceneElements aktif (background sudah ada di sceneBeforePhotos).
  if (!isOverlay && !useSceneRendering) {
    try {
      const frameImg = await loadImage(safeFrameUrl);
      ctx.drawImage(frameImg, 0, 0, cw, ch);
    } catch (err) {
      console.warn("[frameEngine] Frame background gagal dimuat:", safeFrameUrl, err);
    }
  }

  // ─── 2b. Draft scene elements below photo layer ──────────────────────────
  if (sceneBeforePhotos.length > 0) {
    await drawSceneElements(ctx, sceneBeforePhotos, ch);
  }

  // ─── 3. Gambar setiap foto ke slot yang sesuai ────────────────────────────
  // PENTING: jalankan SEQUENTIAL (bukan Promise.all) agar state ctx.filter
  // tidak berinterferensi antar slot saat dipanggil secara bersamaan.
  const photoFilter = options.photoFilterCss ?? "";
  for (const slot of canvasSlots) {
    const src = photos[slot.photoIndex % photos.length];
    try {
      const img = await loadImage(src);
      if (photoFilter) {
        ctx.save();
        ctx.filter = photoFilter;
        drawPhotoInSlot(ctx, img, slot);
        ctx.restore();  // restore juga reset ctx.filter ke nilai sebelumnya
      } else {
        drawPhotoInSlot(ctx, img, slot);
      }
    } catch (err) {
      console.error("[frameEngine] Gagal memuat foto untuk slot", slot.photoIndex, err);
      // Slot kosong jika foto gagal — biarkan background
    }
  }

  // ─── 4. Overlay-mode frame (transparent PNG) — drawn AFTER photos ─────────
  // Dilewati jika sceneElements aktif.
  if (isOverlay && !useSceneRendering) {
    try {
      const frameImg = await loadImage(safeFrameUrl);
      ctx.drawImage(frameImg, 0, 0, cw, ch);
    } catch (err) {
      console.warn("[frameEngine] Frame overlay gagal dimuat:", safeFrameUrl, err);
    }
  }

  // ─── 4b. Draft scene elements above photo layer ──────────────────────────
  if (sceneAfterPhotos.length > 0) {
    await drawSceneElements(ctx, sceneAfterPhotos, ch);
  }

  // ─── 5. Extra decoration overlay — hanya untuk frame biasa (non-scene) ────
  // Untuk frame webp booth, lapisan dekorasi PNG disimpan terpisah di overlayUrl.
  // Di-skip jika sceneElements aktif karena overlay sudah tercakup di sceneAfterPhotos.
  if (options.overlayUrl && !useSceneRendering) {
    try {
      const decorImg = await loadImage(proxifyUrl(options.overlayUrl));
      ctx.drawImage(decorImg, 0, 0, cw, ch);
    } catch (err) {
      console.warn("[frameEngine] Overlay dekorasi gagal dimuat:", options.overlayUrl, err);
    }
  }

  if (options.trialWatermark) {
    drawCenteredWatermark(ctx, cw, ch, options.trialWatermarkText ?? "Trial");
  }

  // ─── 6. Export JPEG ───────────────────────────────────────────────────────
  return canvasToBlob(canvas, quality);
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadToR2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload JPEG Blob ke server via /api/photos (multipart form).
 * Server menyimpan ke local storage di VPS.
 *
 * @param blob      - JPEG Blob hasil composePhoto()
 * @param sessionId - ID sesi booth yang sedang aktif
 * @returns Public URL foto
 */
// ─────────────────────────────────────────────────────────────────────────────
// applyFilterToBlob  — terapkan CSS filter ke seluruh gambar (post-process)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Terapkan CSS filter ke seluruh Blob gambar (JPEG/PNG) via canvas.
 * Lebih sederhana & andal daripada per-slot ctx.filter — tidak bergantung
 * pada async slot drawing. Filter diterapkan pada gambar komposit final.
 */
export async function applyFilterToBlob(
  sourceBlob: Blob,
  filterCss:  string,
  quality     = 0.92,
): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Browser only");
  const url = URL.createObjectURL(sourceBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i   = new Image();
      i.onload  = () => resolve(i);
      i.onerror = () => reject(new Error("Gagal memuat gambar untuk filter"));
      i.src     = url;
    });
    const canvas  = document.createElement("canvas");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx     = canvas.getContext("2d");
    if (!ctx) throw new Error("Tidak bisa membuat 2D context");
    ctx.filter    = filterCss;
    ctx.drawImage(img, 0, 0);
    return await canvasToBlob(canvas, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pixel filter helpers
// ─────────────────────────────────────────────────────────────────────────────

export type PixelFilters = {
  brightness: number;
  contrast:   number;
  saturate:   number;
  grayscale:  number;
  sepia:      number;
  hueRotate:  number;
};

/**
 * Terapkan pixel-level filter ke Uint8ClampedArray ImageData (in-place).
 * Tidak menggunakan ctx.filter — berjalan di semua environment.
 */
export function applyPixelFiltersToData(d: Uint8ClampedArray, filters: PixelFilters): void {
  const br = filters.brightness / 100;
  const co = filters.contrast   / 100;
  const sa = filters.saturate   / 100;
  const gr = filters.grayscale  / 100;
  const se = filters.sepia      / 100;
  const hr = (filters.hueRotate * Math.PI) / 180;
  const cosH = Math.cos(hr), sinH = Math.sin(hr);
  const s3 = 1 / 3, sq = Math.sqrt(1 / 3);
  const hm00 = cosH + s3 * (1 - cosH);
  const hm01 = s3 * (1 - cosH) - sq * sinH;
  const hm02 = s3 * (1 - cosH) + sq * sinH;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    r *= br; g *= br; b *= br;
    r = (r - 0.5) * co + 0.5;
    g = (g - 0.5) * co + 0.5;
    b = (b - 0.5) * co + 0.5;
    if (sa !== 1) {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = L + (r - L) * sa; g = L + (g - L) * sa; b = L + (b - L) * sa;
    }
    if (gr > 0) {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = r + (L - r) * gr; g = g + (L - g) * gr; b = b + (L - b) * gr;
    }
    if (se > 0) {
      const nr = r * (1 - 0.607 * se) + g * 0.769 * se + b * 0.189 * se;
      const ng = r * 0.349 * se       + g * (1 - 0.314 * se) + b * 0.168 * se;
      const nb = r * 0.272 * se       + g * 0.534 * se + b * (1 - 0.869 * se);
      r = nr; g = ng; b = nb;
    }
    if (hr !== 0) {
      const nr = hm00 * r + hm01 * g + hm02 * b;
      const ng = hm02 * r + hm00 * g + hm01 * b;
      const nb = hm01 * r + hm02 * g + hm00 * b;
      r = nr; g = ng; b = nb;
    }
    d[i]     = Math.max(0, Math.min(255, r * 255));
    d[i + 1] = Math.max(0, Math.min(255, g * 255));
    d[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// applyFilterToVideoBlob  — terapkan filter ke seluruh video (post-process)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Terapkan filter ke seluruh video Blob via canvas re-recording.
 * Menggunakan applyPixelFiltersToData per-frame — TIDAK menggunakan ctx.filter.
 * Catatan: filter diterapkan ke seluruh frame termasuk area frame desain.
 * Untuk filter hanya di area foto, gunakan composeVideoLive dengan opsi `filters`.
 */
export async function applyFilterToVideoBlob(
  sourceBlob: Blob,
  filters:    PixelFilters,
  origWidth:  number,
  origHeight: number,
  duration    = 4000,
  fps         = 30,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const scale = 0.5;
  const cw    = Math.round(origWidth  * scale);
  const ch    = Math.round(origHeight * scale);

  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:-9999px",
    "width:1px",
    "height:1px",
    "overflow:hidden",
    "opacity:0.001",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  document.body.appendChild(container);

  const objUrl = URL.createObjectURL(sourceBlob);
  const video  = document.createElement("video");
  video.src         = objUrl;
  video.loop        = true;
  video.muted       = true;
  video.playsInline = true;
  video.preload     = "auto";
  video.style.cssText = "width:1px;height:1px;display:block;";
  container.appendChild(video);

  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    URL.revokeObjectURL(objUrl);
    if (container.parentNode) document.body.removeChild(container);
  };

  video.load();
  await waitForVideo(video);
  await video.play().catch(() => {});
  await new Promise<void>((r) => setTimeout(r, 200));

  const canvas = document.createElement("canvas");
  canvas.width  = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) { cleanup(); return null; }

  const mimeType = getBestVideoMime();
  let stream: MediaStream;
  try { stream = canvas.captureStream(fps); }
  catch { cleanup(); return null; }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
  } catch { cleanup(); return null; }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);

  const endTime = performance.now() + duration;
  return new Promise<Blob | null>((resolve) => {
    const interval = setInterval(() => {
      ctx.drawImage(video, 0, 0, cw, ch);
      const imgData = ctx.getImageData(0, 0, cw, ch);
      applyPixelFiltersToData(imgData.data, filters);
      ctx.putImageData(imgData, 0, 0);

      if (performance.now() >= endTime) {
        clearInterval(interval);
        recorder.stop();
      }
    }, Math.round(1000 / fps));

    recorder.onstop = () => {
      cleanup();
      resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null);
    };
    recorder.onerror = () => {
      clearInterval(interval);
      cleanup();
      resolve(null);
    };
  });
}

export async function uploadToR2(blob: Blob, sessionId: string): Promise<string> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("photo", blob, "photo.jpg");

  const res = await fetch("/api/photos", {
    method: "POST",
    body:   form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal mengupload foto (${res.status}): ${text}`);
  }

  const body = (await res.json()) as { success: boolean; data?: { photoUrl: string }; error?: string };

  if (!body.success || !body.data?.photoUrl) {
    throw new Error(body.error ?? "Upload gagal");
  }

  return body.data.photoUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadVideo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload video Blob ke server via /api/videos (multipart form).
 * Disimpan dengan ekstensi .webm karena browser MediaRecorder menghasilkan WebM container.
 *
 * @param blob      - Blob video dari MediaRecorder (Live Mode)
 * @param sessionId - ID sesi booth yang sedang aktif
 * @returns Public URL video
 */
export async function uploadVideo(blob: Blob, sessionId: string): Promise<string> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  // Browser MediaRecorder menghasilkan WebM container (VP8/VP9/H.264).
  // Gunakan .webm agar file valid dan nginx serve dengan content-type video/webm.
  const file = new File([blob], "live.mp4", { type: "video/mp4" });
  form.append("video", file, "live.webm");
  console.log("[uploadVideo] uploading blob size =", blob.size, "type =", blob.type, "sessionId =", sessionId);

  const res = await fetch("/api/videos", {
    method: "POST",
    body: form,
  });

  console.log("[uploadVideo] /api/videos response status =", res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Upload video gagal: " + res.status + " " + text);
  }

  const body = await res.json() as { success: boolean; data?: { videoUrl: string }; error?: string };

  if (!body.success || !body.data) {
    throw new Error(body.error ?? "Upload video gagal");
  }

  console.log("[uploadVideo] videoUrl =", body.data.videoUrl);
  return body.data.videoUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// composeVideoLive
// ─────────────────────────────────────────────────────────────────────────────

/** Cari mimeType video terbaik yang didukung browser — prioritaskan H.264 (MP4-compatible) */
function getBestVideoMime(): string {
  for (const t of [
    "video/mp4;codecs=avc1", // Safari + Chrome H.264 in MP4 container → .mp4 file
    "video/mp4",             // Safari fallback
    "video/webm;codecs=h264", // Chrome/Edge H.264 in WebM (can rename to .mp4)
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/mp4";
}

/** Gambar video frame ke slot dengan object-fit:cover, optional rotation, dan rounded clip */
function drawVideoInSlot(
  ctx:    CanvasRenderingContext2D,
  video:  HTMLVideoElement,
  slot:   CanvasSlot,
  mirror: boolean = false,
): void {
  // Use ACTUAL video dimensions if available and non-zero.
  // If not yet decoded (videoWidth=0), fall back to canonical 1920×1080.
  // For Canon DSLR captures from 1920×1080 canvas: canonical matches actual.
  // SAFETY: if both are 0, use slot dimensions as fallback to avoid empty draws.
  const vw = video.videoWidth  || 1920;
  const vh = video.videoHeight || 1080;
  const hasValidDims = vw > 0 && vh > 0;
  const useFallback = !hasValidDims;

  const srcAspect = vw / vh;
  const dstAspect = slot.w / slot.h;

  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (hasValidDims && srcAspect > dstAspect) {
    sw = vh * dstAspect;
    sx = (vw - sw) / 2;
  } else if (hasValidDims) {
    sh = vw / dstAspect;
    sy = (vh - sh) / 2;
  }
  // If no valid dimensions, fill the entire slot (use slot dims as video source)
  if (useFallback) {
    sw = slot.w;
    sh = slot.h;
    sx = 0;
    sy = 0;
  }

  ctx.save();
  if (slot.rotation !== 0) {
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((slot.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.beginPath();
  if (slot.borderRadius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(slot.x, slot.y, slot.w, slot.h, slot.borderRadius);
  } else {
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
  }
  ctx.clip();
  if (mirror) {
    // Flip horizontal around center of slot
    ctx.translate(slot.x + slot.w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, slot.y, slot.w, slot.h);
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, slot.x, slot.y, slot.w, slot.h);
  }
  ctx.restore();
}

/** Tunggu video element siap di-play */
function waitForVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) { resolve(); return; }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      video.removeEventListener("canplay",    finish);
      video.removeEventListener("loadeddata", finish);
      resolve();   // always call resolve here
    };

    video.addEventListener("canplay",    finish);
    video.addEventListener("loadeddata", finish);

    // Polling tiap 80ms sebagai fallback
    const poll    = setInterval(() => { if (video.readyState >= 2) finish(); }, 80);
    // Hard timeout 8 detik
    const timeout = setTimeout(finish, 8000);
  });
}

export interface ComposeVideoOptions extends ComposeOptions {
  /** Durasi video output dalam ms. Default: 4000 (4 detik) */
  duration?: number;
  /** Frame rate rekaman canvas. Default: 25 */
  fps?: number;
  /** Mirror video horizontal — harus sama dengan setting mirror kamera saat capture */
  mirror?: boolean;
  /**
   * CSS filter string — DEPRECATED, ctx.filter tidak reliable di semua browser.
   * Gunakan `filters` sebagai gantinya.
   */
  filterCss?: string;
  /**
   * Nilai pixel filter yang diterapkan HANYA pada area slot video/foto,
   * sebelum frame overlay digambar. Frame design tidak terpengaruh.
   */
  filters?: PixelFilters;
}

/**
 * composeVideoLive — Buat video composite (Live Mode):
 * tiap slot di frame diisi oleh video clip yang direkam saat capture foto tersebut.
 *
 * @param videoBlobs    - Array Blob|null per slot (indeks sejajar capturedPhotos)
 * @param frameAssetUrl - URL frame PNG transparan
 * @param options       - Slot, canvas size, duration, fps
 * @returns Blob video composite (MP4-compatible/H.264), atau null jika tidak ada satu pun video yang valid
 */
export async function composeVideoLive(
  videoBlobs:    (Blob | null)[],
  frameAssetUrl: string,
  options:       ComposeVideoOptions = {}
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  if (!videoBlobs.some(Boolean)) return null;

  // Scale down 50% — rendering video 1080×1920 real-time terlalu berat
  // Hasil tetap bagus untuk video: 540×960
  const scale = 0.5;
  const cw    = Math.round((options.canvasWidth  ?? 1080) * scale);
  const ch    = Math.round((options.canvasHeight ?? 1920) * scale);
  const bg    = options.backgroundColor ?? "#ffffff";
  const duration = options.duration ?? 4000;
  const fps      = options.fps ?? 25;
  const safeFrameUrl = proxifyUrl(frameAssetUrl);

  // Determine render mode dari ekstensi file
  // NOTE: ImageKit mengonversi PNG ke JPG — deteksi via isOverlayFrame() helper.
  const isOverlay = isOverlayFrame(frameAssetUrl);


  // Slot coordinates di-scale otomatis karena kita pass cw/ch yang sudah di-scale
  const hasExplicitSlots = options.slots && options.slots.length > 0;
  const canvasSlots: CanvasSlot[] = hasExplicitSlots
    ? slotsToCanvas(options.slots!, cw, ch)
    : isOverlay
      ? inferSlots(videoBlobs.length, cw, ch)
      : inferSlotsWithPadding(videoBlobs.length, cw, ch, 0.08);
  const canvasScene = options.sceneElements?.length ? sceneToCanvas(options.sceneElements, cw, ch) : [];
  // Cari zIndex minimum slot foto → semua scene element di bawahnya digambar sebelum foto
  // PENTING: initial value harus Infinity (bukan 0) agar slot dengan zIndex=0 tetap terhitung
  const photoLayerZ = canvasSlots.length > 0
    ? canvasSlots.reduce((min, slot) => Math.min(min, slot.zIndex), Infinity)
    : 0;
  const sceneBeforePhotos = canvasScene.filter((el) => el.zIndex < photoLayerZ);
  const sceneAfterPhotos = canvasScene.filter((el) => el.zIndex >= photoLayerZ);
  const useSceneRendering = canvasScene.length > 0;

  // ── 1. Hidden container di DOM — Wajib agar video bisa decode di Chrome ───
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:-9999px",
    "width:1px",
    "height:1px",
    "overflow:hidden",
    "opacity:0.001",  // opacity:0 bisa dioptimasi browser jadi tidak dirender
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  document.body.appendChild(container);

  // Duplicate mode auto-detection:
  // Jika jumlah video = n/2 slot, berarti tiap video dipakai 2 slot simetris (palindrome).
  // captureIdx = min(photoIndex, n-1-photoIndex) agar slot mirror pakai video yang sama.
  const n = canvasSlots.length;
  const isDuplicateVideo =
    hasExplicitSlots && n >= 4 && n % 2 === 0 && videoBlobs.length === n / 2;

  type VideoEntry = { el: HTMLVideoElement; url: string; slot: CanvasSlot };
  const entries: VideoEntry[] = [];
  const objectUrls: string[] = [];

  // Buat map dari captureIdx → { el, url } agar slot mirror berbagi <video> element yang sama.
  // (Slot pi=0 dan pi=n-1 pakai captureIdx=0 → cukup 1 elemen video untuk keduanya)
  const blobIndexMap = new Map<number, { el: HTMLVideoElement; url: string }>();

  // 2-kolom duplicate: kiri-row-r ↔ kanan-row-(nRows-1-r)
  const _nRows = isDuplicateVideo ? n / 2 : 0;
  for (const slot of canvasSlots) {
    const captureIdx = isDuplicateVideo
      ? (slot.photoIndex % 2 === 0
          ? Math.floor(slot.photoIndex / 2)
          : _nRows - 1 - Math.floor(slot.photoIndex / 2))
      : slot.photoIndex;
    const blob = videoBlobs[captureIdx] ?? null;
    if (!blob) continue;

    // Reuse video element jika captureIdx sudah ada (slot mirror pakai video yang sama)
    let entry = blobIndexMap.get(captureIdx);
    if (!entry) {
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      const el = document.createElement("video");
      el.src        = url;
      el.loop       = true;
      el.muted      = true;
      el.playsInline = true;
      el.preload    = "auto";
      el.style.cssText = "width:1px;height:1px;display:block;";
      container.appendChild(el);   // Attach ke DOM — wajib untuk decode
      entry = { el, url };
      blobIndexMap.set(captureIdx, entry);
    }
    entries.push({ el: entry.el, url: entry.url, slot });
  }

  const cleanup = () => {
    blobIndexMap.forEach((e) => {
      e.el.pause();
      e.el.removeAttribute("src");
    });
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    if (container.parentNode) document.body.removeChild(container);
  };

  if (entries.length === 0) {
    cleanup();
    return null;
  }

  // ── 2. Load frame image + optional decoration overlay ────────────────────
  let frameImg: HTMLImageElement | null = null;
  try { frameImg = await loadImage(safeFrameUrl); } catch { /* overlay opsional */ }
  let decorImg: HTMLImageElement | null = null;
  if (options.overlayUrl) {
    try { decorImg = await loadImage(proxifyUrl(options.overlayUrl)); } catch { /* dekorasi opsional */ }
  }
  const sceneImages = new Map<string, HTMLImageElement>();
  await Promise.all(
    canvasScene
      .filter((el) => el.type !== "text" && !!el.src)
      .map(async (el) => {
        if (!el.src || sceneImages.has(el.src)) return;
        try {
          sceneImages.set(el.src, await loadImage(proxifyUrl(el.src)));
        } catch {
          // Optional per-element failures should not stop compose.
        }
      })
  );

  // ── 3. Load + tunggu setiap video siap ────────────────────────────────────
  await Promise.all(entries.map((e) => {
    e.el.load();
    return waitForVideo(e.el);
  }));

  // ── 4. Play + tunggu dimensi video aktual tersedia ────────────────────────
  await Promise.all(entries.map((e) => e.el.play().catch(() => {})));
  // Give video elements extra time to decode dimensions
  // (especially important for Canon blobs recorded from 1920×1080 canvas)
  await new Promise<void>((r) => setTimeout(r, 500));

  // ── 4b. Diagnostic: log video dimensions ─────────────────────────────────
  for (const { el, slot, url } of entries) {
    console.log(`[composeVideoLive] video dim check: url=${url.slice(0,50)} videoWidth=${el.videoWidth} videoHeight=${el.videoHeight} slot=${slot.x},${slot.y} ${slot.w}×${slot.h} readyState=${el.readyState}`);
  }
  // Force a draw so canvas sees video pixels before MediaRecorder starts
  // (ensures the encoder has real content to compress)
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width  = cw;
  probeCanvas.height = ch;
  const probeCtx = probeCanvas.getContext("2d");
  if (probeCtx) {
    probeCtx.fillStyle = bg;
    probeCtx.fillRect(0, 0, cw, ch);
    for (const { el, slot } of entries) {
      try { drawVideoInSlot(probeCtx, el, slot, options.mirror ?? false); } catch { /* ignore */ }
    }
    // Check a pixel in the CENTER of the first slot — should NOT be pure black
    if (entries.length > 0) {
      const s = entries[0].slot;
      const midX = Math.round(s.x + s.w / 2);
      const midY = Math.round(s.y + s.h / 2);
      const px = Math.min(midX, cw - 1);
      const py = Math.min(midY, ch - 1);
      const pxData = probeCtx.getImageData(px, py, 1, 1).data;
      console.log(`[composeVideoLive] probe mid-slot pixel(${px},${py}): RGBA=${pxData[0]},${pxData[1]},${pxData[2]},${pxData[3]}`);
    }
  }

  // ── 5. Canvas + MediaRecorder ─────────────────────────────────────────────
  const pixelFilters = options.filters ?? null;

  const canvas = document.createElement("canvas");
  canvas.width  = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", pixelFilters ? { willReadFrequently: true } : undefined);
  if (!ctx) { cleanup(); return null; }

  const mimeType = getBestVideoMime();
  console.log("[composeVideoLive] mimeType =", mimeType, "fps =", fps, "duration =", duration, "cw =", cw, "ch =", ch);
  console.log("[composeVideoLive] video/mp4;codecs=avc1 supported?", typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4;codecs=avc1"));
  console.log("[composeVideoLive] video/mp4 supported?", typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4"));
  console.log("[composeVideoLive] video/webm;codecs=h264 supported?", typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=h264"));
  console.log("[composeVideoLive] video/webm supported?", typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm"));

  // captureStream — check API availability first (Chrome Android supports this)
  const captureStreamFn = (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream;
  if (typeof captureStreamFn !== "function") {
    console.warn("[composeVideoLive] captureStream tidak tersedia di browser ini");
    cleanup();
    return null;
  }

  let stream: MediaStream;
  try {
    stream = captureStreamFn.call(canvas, fps);
    console.log("[composeVideoLive] captureStream created, stream.active =", stream.active);
  } catch (err) {
    console.warn("[composeVideoLive] captureStream gagal:", err);
    cleanup();
    return null;
  }

  // MediaRecorder dengan fallback chain — sama seperti useCamera.ts
  const tryCreateRecorder = (opts: MediaRecorderOptions) => {
    try { return new MediaRecorder(stream, opts); } catch { return null; }
  };
  const recorder =
    tryCreateRecorder({ mimeType, videoBitsPerSecond: 8_000_000 }) ?? // 8Mbps — handles 60fps @ 540×960 smooth with high-FPS source
    tryCreateRecorder({ mimeType }) ??
    tryCreateRecorder({});
  if (!recorder) {
    console.warn("[composeVideoLive] MediaRecorder tidak dapat dibuat");
    cleanup();
    return null;
  }
  console.log("[composeVideoLive] MediaRecorder created: mimeType =", recorder.mimeType, "state =", recorder.state);

  const chunks: Blob[] = [];
  let _chunkIdx = 0;
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      _chunkIdx++;
      chunks.push(e.data);
      console.log("[composeVideoLive] ondataavailable: chunk #", _chunkIdx, "size =", e.data.size, "total chunks =", chunks.length);
    }
  };
  recorder.onerror = (e) => { console.error("[composeVideoLive] recorder.onerror:", e); };
  // Start with 500ms timeslice (more reliable than 200ms for captureStream)
  try { recorder.start(500); } catch { try { recorder.start(); } catch (e) { console.warn("[composeVideoLive] recorder.start gagal:", e); cleanup(); return null; } }
  console.log("[composeVideoLive] recorder started: state =", recorder.state);

  // ── 6. Draw loop via requestAnimationFrame (throttled ke target fps) ─────
  const endTime = performance.now() + duration;

  return new Promise<Blob | null>((resolve) => {
    const mirrorVideo = options.mirror ?? false;
    let rafId = 0;
    let lastDrawTime = 0;
    const targetInterval = 1000 / fps;

    // Diagnostic: how many unique frames did we actually draw?
    let framesDrawn = 0;

    const drawComposite = () => {
      framesDrawn++;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);
      // Background-mode frame (webp): draw before videos — dilewati jika sceneElements aktif
      if (!isOverlay && !useSceneRendering && frameImg) ctx.drawImage(frameImg, 0, 0, cw, ch);
      if (sceneBeforePhotos.length > 0) drawSceneElementsSync(ctx, sceneBeforePhotos, ch, sceneImages);
      for (const { el, slot } of entries) {
        drawVideoInSlot(ctx, el, slot, mirrorVideo);
        if (pixelFilters) {
          // Pixel filter hanya pada bounding-box slot — frame overlay belum digambar
          const fx = Math.max(0, Math.floor(slot.x));
          const fy = Math.max(0, Math.floor(slot.y));
          const fw = Math.min(cw - fx, Math.ceil(slot.w));
          const fh = Math.min(ch - fy, Math.ceil(slot.h));
          if (fw > 0 && fh > 0) {
            const imgData = ctx.getImageData(fx, fy, fw, fh);
            applyPixelFiltersToData(imgData.data, pixelFilters);
            ctx.putImageData(imgData, fx, fy);
          }
        }
      }
      // Overlay-mode frame (transparent PNG): draw after videos — dilewati jika sceneElements aktif
      if (isOverlay && !useSceneRendering && frameImg) ctx.drawImage(frameImg, 0, 0, cw, ch);
      if (sceneAfterPhotos.length > 0) drawSceneElementsSync(ctx, sceneAfterPhotos, ch, sceneImages);
      // Extra decoration overlay — hanya untuk frame biasa (non-scene)
      if (decorImg && !useSceneRendering) ctx.drawImage(decorImg, 0, 0, cw, ch);
      if (options.trialWatermark) {
        drawCenteredWatermark(ctx, cw, ch, options.trialWatermarkText ?? "Trial");
      }
    };

    const scheduleDraw = (time: number) => {
      if (time - lastDrawTime >= targetInterval) {
        drawComposite();
        lastDrawTime = time;
      }
      if (performance.now() < endTime) {
        rafId = requestAnimationFrame(scheduleDraw);
      } else {
        console.log("[composeVideoLive] draw loop ended, flushing recorder buffers...");
        // Triple requestData with adequate wait (150ms) to ensure all pending
        // chunks (especially the last ~500ms buffer) reach ondataavailable before
        // stop() is called. With 500ms timeslice, a chunk fires at t=4500ms and
        // may not reach ondataavailable until ~t=5000ms. If stop() fires before
        // that, onstop fires with chunks.length=0. The 150ms wait gives the browser
        // enough time to dispatch the buffered data before we stop.
        try { recorder.requestData(); } catch { /* ignore */ }
        setTimeout(() => {
          try { recorder.requestData(); } catch { /* ignore */ }
          setTimeout(() => {
            try { recorder.requestData(); } catch { /* ignore */ }
            setTimeout(() => {
              console.log("[composeVideoLive] stopping recorder, chunks so far =", chunks.length);
              try { recorder.stop(); } catch { /* ignore */ }
            }, 150);
          }, 50);
        }, 50);
      }
    };

    rafId = requestAnimationFrame(scheduleDraw);

    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      console.log("[composeVideoLive] recorder.onstop: framesDrawn =", framesDrawn, "chunks.length =", chunks.length, "recorder.mimeType =", recorder.mimeType);
      cleanup();
      if (chunks.length === 0) { console.warn("[composeVideoLive] no chunks collected"); resolve(null); return; }
      // Output as H.264-in-MP4 for cross-browser playback (especially Safari/iOS).
      const blob = new Blob(chunks, { type: "video/mp4" });
      console.log("[composeVideoLive] blob created: size =", blob.size, "type =", blob.type);
      resolve(blob);
    };

    recorder.onerror = (e) => {
      console.error("[composeVideoLive] recorder.onerror:", e);
      cancelAnimationFrame(rafId);
      cleanup();
      resolve(null);
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// generateDownloadQR
// ─────────────────────────────────────────────────────────────────────────────

export interface QROptions {
  /** Ukuran QR dalam piksel. Default: 300 */
  size?: number;
  /** Warna modul QR. Default: "#000000" */
  darkColor?: string;
  /** Warna background QR. Default: "#ffffff" */
  lightColor?: string;
}

/**
 * Generate QR code sebagai data URL (PNG base64) dari URL halaman download.
 *
 * @param downloadUrl - URL lengkap halaman download customer
 *   (misal: "https://studio.fremio.id/download/{qrCode}")
 * @param options     - Opsional: ukuran dan warna QR
 * @returns Data URL PNG dari QR code (bisa langsung ke <img src={...} />)
 */
export async function generateDownloadQR(
  downloadUrl: string,
  options: QROptions = {}
): Promise<string> {
  const size  = options.size       ?? 300;
  const dark  = options.darkColor  ?? "#000000";
  const light = options.lightColor ?? "#ffffff";

  // Lazy-load qrcode untuk menghindari masuk SSR bundle
  const QRCode = await import("qrcode");

  return QRCode.toDataURL(downloadUrl, {
    width:       size,
    margin:      2,
    errorCorrectionLevel: "M",
    color: {
      dark:  dark,
      light: light,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// encodeGif + uploadGif
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode array data URL foto menjadi animated GIF Blob.
 * Setiap frame ditampilkan selama `delayMs` ms (default 500ms).
 * GIF di-scale ke maxSize (default 540px) untuk ukuran file yang wajar.
 */
export async function encodeGif(
  dataUrls: string[],
  options: { delayMs?: number; maxSize?: number; trialWatermark?: boolean; trialWatermarkText?: string } = {}
): Promise<Blob> {
  const { delayMs = 500, maxSize = 540 } = options;
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");

  // Muat semua image ke ImageBitmap terlebih dahulu
  const bitmaps = await Promise.all(
    dataUrls.map((url) => {
      return new Promise<ImageBitmap>((resolve, reject) => {
        const img = new Image();
        img.onload = () => createImageBitmap(img).then(resolve).catch(reject);
        img.onerror = reject;
        img.src = url;
      });
    })
  );

  if (bitmaps.length === 0) throw new Error("Tidak ada foto untuk di-encode");

  // Scale ke maxSize dengan mempertahankan aspek rasio foto pertama
  const srcW = bitmaps[0].width;
  const srcH = bitmaps[0].height;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const gif = GIFEncoder();

  for (const bmp of bitmaps) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (options.trialWatermark) {
      drawCenteredWatermark(ctx, w, h, options.trialWatermarkText ?? "Trial");
    }
    const imageData = ctx.getImageData(0, 0, w, h);
    const palette   = quantize(imageData.data, 256);
    const index     = applyPalette(imageData.data, palette);
    gif.writeFrame(index, w, h, { palette, delay: delayMs });
    bmp.close();
  }

  gif.finish();
  const rawBytes = gif.bytes();
  // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer compatibility issues
  const copy = new Uint8Array(rawBytes.length);
  copy.set(rawBytes);
  return new Blob([copy.buffer as ArrayBuffer], { type: "image/gif" });
}

/**
 * Upload foto mentah per-capture (tanpa frame) ke server via /api/raw-photos.
 *
 * @param blob      - JPEG Blob dari data URL kamera
 * @param sessionId - ID sesi booth yang sedang aktif
 * @param index     - Indeks capture (0-based)
 * @returns Public URL foto mentah
 */
export async function uploadRawPhoto(blob: Blob, sessionId: string, index: number): Promise<string> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("photo", blob, `raw-${index}.jpg`);
  form.append("index", String(index));

  const res = await fetch("/api/raw-photos", {
    method: "POST",
    body:   form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal mengupload foto mentah (${res.status}): ${text}`);
  }

  const body = (await res.json()) as { success: boolean; data?: { photoUrl: string }; error?: string };

  if (!body.success || !body.data?.photoUrl) {
    throw new Error(body.error ?? "Upload foto mentah gagal");
  }

  return body.data.photoUrl;
}

/**
 * Upload animated GIF Blob ke server via /api/gifs (multipart form).
 */
export async function uploadGif(blob: Blob, sessionId: string): Promise<string> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("gif", blob, "slideshow.gif");

  const res = await fetch("/api/gifs", {
    method: "POST",
    body:   form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal mengupload GIF (${res.status}): ${text}`);
  }

  const body = (await res.json()) as { success: boolean; data?: { gifUrl: string }; error?: string };

  if (!body.success || !body.data?.gifUrl) {
    throw new Error(body.error ?? "Upload GIF gagal");
  }

  return body.data.gifUrl;
}
