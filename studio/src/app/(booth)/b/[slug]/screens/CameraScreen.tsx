"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCamera } from "../hooks/useCamera";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, DraftSceneElement, FrameData, PhotoSlot } from "../types";
import { getEffectiveCaptureCount, getEffectiveSlots, isEffectiveDuplicateMode } from "../frameSlotUtils";
import { isOverlayFrame } from "@/lib/frameEngine";

import { CaptureHintOverlay } from "./CaptureHintOverlay";
function useIsPortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const orientationMq = window.matchMedia("(orientation: portrait)");
    const compactTabletMq = window.matchMedia("(max-width: 900px)");
    const check = () => {
      const visual = window.visualViewport;
      const byViewport = window.innerHeight >= window.innerWidth;
      const byVisualViewport = visual ? visual.height >= visual.width : false;
      const byMedia = orientationMq.matches;
      const byCompactTablet = compactTabletMq.matches && window.innerHeight >= 600;
      setPortrait(byMedia || byViewport || byVisualViewport || byCompactTablet);
    };

    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    if (typeof orientationMq.addEventListener === "function") {
      orientationMq.addEventListener("change", check);
      compactTabletMq.addEventListener("change", check);
    } else {
      orientationMq.addListener(check);
      compactTabletMq.addListener(check);
    }
    window.visualViewport?.addEventListener("resize", check);

    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
      if (typeof orientationMq.removeEventListener === "function") {
        orientationMq.removeEventListener("change", check);
        compactTabletMq.removeEventListener("change", check);
      } else {
        orientationMq.removeListener(check);
        compactTabletMq.removeListener(check);
      }
      window.visualViewport?.removeEventListener("resize", check);
    };
  }, []);
  return portrait;
}

function isChrome(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
}

function getBestRecordingMime(): string {
  for (const type of [
    "video/webm;codecs=h264",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Gagal membuat canvas context");
        ctx.drawImage(bitmap, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.95);
      } finally {
        bitmap.close();
      }
    } catch { /* fall through to Image-based path */ }
  }
  return await new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal konversi blob ke data URL"));
    };
    img.src = url;
  });
}

async function mirrorCapturedPhotoDataUrl(sourceDataUrl: string): Promise<string> {
  const quality = 0.95;

  if (typeof createImageBitmap === "function") {
    try {
      const response = await fetch(sourceDataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Gagal membuat context canvas mirror");
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(bitmap, 0, 0);
        return canvas.toDataURL("image/jpeg", quality);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fallback ke HTMLImageElement di bawah.
    }
  }

  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Gagal membuat context canvas mirror");
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    img.onerror = () => reject(new Error("Gagal memuat foto untuk proses mirror"));
    img.src = sourceDataUrl;
  });
}

declare global {
  interface Window {
    fremioBooth?: {
      getBridgeStatus?: () => Promise<unknown>;
      restartBridge?: () => Promise<unknown>;
      agentStatus: () => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      agentCapture: () => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      agentPreview: () => Promise<{ ok: boolean; base64?: string; mimeType?: string; error?: string }>;
      agentPreviewStreamUrl?: (cacheKey?: string | number) => string;
      agentPrint: (job: unknown) => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
    };
  }
}

interface CameraScreenProps {
  booth:           BoothConfigData;
  frame:           FrameData;
  photoIndex:      number;   // 1-based
  capturedCount:   number;   // index slot aktif (0-based)
  capturedPhotos:  string[]; // data URLs foto yang sudah diambil
  allPhotosDone:   boolean;  // semua slot sudah terisi
  retakeSlotIndex: number | null; // sedang retake slot tertentu
  onCapture:       (dataUrl: string) => void;
  onVideoReady:    (videoBlob: Blob | null, captureIndex?: number) => void;
  onProceed:       () => void;
  onRetakeSlot:    (slotIndex: number) => void;
  onCountdownChange?: (isCounting: boolean) => void; // fullscreen UX: sembunyikan overlay saat countdown
  livePhotoVideoEnabled?: boolean;
  mode?:           "live_view" | "fullscreen"; // mode sesi foto
  boothMirrorSetting?: boolean;
}

type CountdownState = "READY" | "COUNTING" | "FLASH" | "CAPTURING" | "DONE";

// ─── LivePreviewCanvas ────────────────────────────────────────────────────────
// Canvas menggambar background + foto/video per slot.
// Overlay frame (PNG) ditampilkan sebagai <img> HTML di atas canvas via CSS
// sehingga tidak butuh CORS dan bintang/dekorasi selalu di atas live stream.
function drawCoverToCanvas(
  ctx: CanvasRenderingContext2D,
  src: HTMLImageElement | HTMLVideoElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const sw = src instanceof HTMLVideoElement ? src.videoWidth  : src.naturalWidth;
  const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
  if (!sw || !sh) return;
  const scale  = Math.max(dw / sw, dh / sh);
  const scaledW = sw * scale;
  const scaledH = sh * scale;
  ctx.drawImage(src, dx + (dw - scaledW) / 2, dy + (dh - scaledH) / 2, scaledW, scaledH);
}

function appendRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }

  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }

  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSlotPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  borderRadius: number,
) {
  const safeRadius = Math.max(0, Math.min(borderRadius, Math.min(w, h) / 2));
  const lineWidth = Math.max(2, Math.min(4, Math.min(w, h) * 0.012));

  const fillGradient = ctx.createLinearGradient(x, y, x + w, y + h);
  fillGradient.addColorStop(0, "#e0e7ff");
  fillGradient.addColorStop(1, "#c7d2fe");
  ctx.beginPath();
  appendRoundedRectPath(ctx, x, y, w, h, safeRadius);
  ctx.fillStyle = fillGradient;
  ctx.fill();

  ctx.beginPath();
  appendRoundedRectPath(
    ctx,
    x + lineWidth / 2,
    y + lineWidth / 2,
    Math.max(0, w - lineWidth),
    Math.max(0, h - lineWidth),
    Math.max(0, safeRadius - lineWidth / 2),
  );
  ctx.strokeStyle = "rgba(129, 140, 248, 0.7)";
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([lineWidth * 3.2, lineWidth * 2.2]);
  ctx.stroke();
  ctx.setLineDash([]);

  const cx = x + w / 2;
  const cy = y + h / 2;
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.5));
  ctx.fillStyle = "rgba(99, 102, 241, 0.45)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(label, cx, cy - fontSize * 0.05);
}

type CanvasSceneElement = {
  type: "background-photo" | "upload" | "text" | "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  rotation: number;
  borderRadius: number;
  src?: string | null;
  objectFit?: "fill" | "cover" | "contain";
  text?: string;
  align?: "left" | "center" | "right";
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  fill?: string;
  stroke?: string | null;
  strokeWidth?: number;
  shapeType?: string;
};

function proxifySceneUrl(url: string): string {
  if (url.startsWith("https://fremio.id/") || url.startsWith("https://api.fremio.id/")) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function toCanvasSceneElements(
  elements: DraftSceneElement[] | null | undefined,
  cw: number,
  ch: number,
): CanvasSceneElement[] {
  if (!elements?.length) return [];
  return elements
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .map((el) => ({
      type: el.type,
      x: el.left * cw,
      y: el.top * ch,
      w: el.width * cw,
      h: el.height * ch,
      zIndex: Number.isFinite(el.zIndex) ? Number(el.zIndex) : 0,
      rotation: Number.isFinite(el.rotation) ? Number(el.rotation) : 0,
      borderRadius: Number.isFinite(el.borderRadius) ? Number(el.borderRadius) : 0,
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

function drawContainToCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
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

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!points.length) return;
  ctx.moveTo(x + points[0][0] * w, y + points[0][1] * h);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(x + points[index][0] * w, y + points[index][1] * h);
  }
  ctx.closePath();
}

function traceHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
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

function traceShapePath(ctx: CanvasRenderingContext2D, el: CanvasSceneElement) {
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
      appendRoundedRectPath(ctx, el.x, el.y, el.w, el.h, radius);
      break;
  }
}

function drawSceneElementsSync(
  ctx: CanvasRenderingContext2D,
  elements: CanvasSceneElement[],
  ch: number,
  images: Map<string, HTMLImageElement>,
) {
  elements.forEach((el) => {
    try {
      if (el.type === "text") {
        if (!el.text) return;
        const fontSize = Math.max(12, Math.round((el.fontSize ?? 0.05) * ch));
        const fontWeight = el.fontWeight ?? 600;
        const fontFamily = el.fontFamily ? `"${el.fontFamily}", sans-serif` : "sans-serif";
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
        lines.forEach((line) => {
          ctx.fillText(line, anchorX, y);
          y += lineHeight;
        });
        ctx.restore();
        return;
      }

      if (el.type === "shape") {
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
        return;
      }

      if (!el.src) return;
      const img = images.get(el.src);
      if (!img) return;

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
        appendRoundedRectPath(ctx, el.x, el.y, el.w, el.h, el.borderRadius);
        ctx.clip();
      }

      if (el.objectFit === "contain") {
        drawContainToCanvas(ctx, img, el.x, el.y, el.w, el.h);
      } else if (el.objectFit === "cover") {
        drawCoverToCanvas(ctx, img, el.x, el.y, el.w, el.h);
      } else {
        ctx.drawImage(img, el.x, el.y, el.w, el.h);
      }
      ctx.restore();
    } catch {
      // Best effort: skip element when rendering fails.
    }
  });
}

function toCaptureIndexResolver(slots: PhotoSlot[], isDuplicate: boolean): (slot: PhotoSlot) => number {
  if (!isDuplicate) {
    return (slot) => Math.max(0, Math.floor(Number(slot.photoIndex) || 0));
  }

  const finiteIndexes = slots
    .map((slot) => Number(slot.photoIndex))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.floor(value));

  const uniqueSorted = Array.from(new Set(finiteIndexes)).sort((a, b) => a - b);
  const looksGroupedDuplicate = uniqueSorted.length > 0 && uniqueSorted.length <= Math.ceil(slots.length / 2);

  if (looksGroupedDuplicate) {
    const indexMap = new Map<number, number>(uniqueSorted.map((value, idx) => [value, idx]));
    return (slot) => {
      const raw = Math.floor(Number(slot.photoIndex) || 0);
      return indexMap.get(raw) ?? 0;
    };
  }

  const nRows = Math.max(1, Math.floor(slots.length / 2));
  return (slot) => {
    const pi = Math.max(0, Math.floor(Number(slot.photoIndex) || 0));
    return pi % 2 === 0
      ? Math.floor(pi / 2)
      : nRows - 1 - Math.floor(pi / 2);
  };
}
interface LivePreviewCanvasProps {
  stream:          MediaStream | null;
  dslrImageRef?:   React.RefObject<HTMLImageElement | null>;
  dslrPosterSrc?:  string | null;
  dslrPosterActive?: boolean;
  dslrPosterMirror?: boolean;
  mirror:          boolean;
  frame:           FrameData;
  slots:           PhotoSlot[];
  capturedPhotos:  string[];
  isDuplicate:     boolean;
  allPhotosDone:   boolean;
  activeSlotIndex: number;
}

function LivePreviewCanvas({ stream, dslrImageRef, dslrPosterSrc, dslrPosterActive, dslrPosterMirror = false, mirror, frame, slots, capturedPhotos, isDuplicate, allPhotosDone, activeSlotIndex }: LivePreviewCanvasProps) {
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const hiddenVidRef        = useRef<HTMLVideoElement>(null);
  const frameBaseImgRef     = useRef<HTMLImageElement | null>(null);
  const frameOverlayImgRef  = useRef<HTMLImageElement | null>(null);
  const dslrPosterImgRef    = useRef<HTMLImageElement | null>(null);
  const photoImgsRef        = useRef<Map<number, HTMLImageElement>>(new Map());
  const photoUrlsRef        = useRef<Map<number, string>>(new Map());
  const sceneImgsRef        = useRef<Map<string, HTMLImageElement>>(new Map());
  const capturedPhotosRef   = useRef<string[]>(capturedPhotos);
  const activeSlotRef       = useRef<number>(activeSlotIndex);
  const dslrPosterActiveRef = useRef<boolean>(dslrPosterActive ?? false);
  const dslrPosterMirrorRef = useRef<boolean>(dslrPosterMirror);
  const rafRef              = useRef<number>(0);

  const cw = frame.canvasWidth  || 1080;
  const ch = frame.canvasHeight || 1920;
  const n  = slots.length;
  const resolveCaptureIndex = useMemo(
    () => toCaptureIndexResolver(slots, isDuplicate),
    [slots, isDuplicate]
  );
  const canvasScene = useMemo(
    () => toCanvasSceneElements(frame.sceneElements ?? null, cw, ch),
    [frame.sceneElements, cw, ch]
  );
  const photoLayerZ = useMemo(
    () => (slots.length > 0
      ? slots.reduce((min, slot) => Math.min(min, Number.isFinite(slot.zIndex) ? Number(slot.zIndex) : 0), Infinity)
      : 0),
    [slots]
  );
  const sceneBeforePhotos = useMemo(
    () => canvasScene.filter((el) => el.zIndex < photoLayerZ),
    [canvasScene, photoLayerZ]
  );
  const sceneAfterPhotos = useMemo(
    () => canvasScene.filter((el) => el.zIndex >= photoLayerZ),
    [canvasScene, photoLayerZ]
  );
  const useSceneRendering = canvasScene.length > 0;

  // Keep refs fresh so the RAF loop always reads the latest values without restarting
  useEffect(() => { capturedPhotosRef.current = capturedPhotos; }, [capturedPhotos]);
  useEffect(() => { activeSlotRef.current = activeSlotIndex; }, [activeSlotIndex]);
  useEffect(() => { dslrPosterActiveRef.current = Boolean(dslrPosterActive); }, [dslrPosterActive]);
  useEffect(() => { dslrPosterMirrorRef.current = dslrPosterMirror; }, [dslrPosterMirror]);

  // Attach stream to hidden video + explicitly play (autoPlay can be blocked for invisible elements)
  useEffect(() => {
    const v = hiddenVidRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) {
      v.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    if (!dslrPosterSrc) {
      dslrPosterImgRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) dslrPosterImgRef.current = img;
    };
    img.onerror = () => {
      if (!cancelled) dslrPosterImgRef.current = null;
    };
    img.src = dslrPosterSrc;
    return () => {
      cancelled = true;
    };
  }, [dslrPosterSrc]);

  // Muat frame base + overlay dekorasi.
  useEffect(() => {
    frameBaseImgRef.current = null;
    frameOverlayImgRef.current = null;

    const baseSrc = (frame.assetUrl && frame.assetUrl.trim()) || (frame.thumbnailUrl && frame.thumbnailUrl.trim()) || "";
    if (baseSrc) {
      const baseImg = new Image();
      baseImg.onload = () => { frameBaseImgRef.current = baseImg; };
      baseImg.onerror = () => { frameBaseImgRef.current = null; };
      baseImg.src = baseSrc;
    }

    if (frame.overlayUrl && frame.overlayUrl.trim()) {
      const overlayImg = new Image();
      overlayImg.onload = () => { frameOverlayImgRef.current = overlayImg; };
      overlayImg.onerror = () => { frameOverlayImgRef.current = null; };
      overlayImg.src = frame.overlayUrl;
    }

    return () => {
      frameBaseImgRef.current = null;
      frameOverlayImgRef.current = null;
    };
  }, [frame.assetUrl, frame.thumbnailUrl, frame.overlayUrl]);

  // Load/reload captured photo images — track URL per slot to handle retake
  // When URL is cleared (retake), remove from cache so draw loop shows blank immediately
  useEffect(() => {
    capturedPhotos.forEach((url, i) => {
      if (!url) {
        photoImgsRef.current.delete(i);
        photoUrlsRef.current.delete(i);
        return;
      }
      if (photoUrlsRef.current.get(i) !== url) {
        photoUrlsRef.current.set(i, url);
        const img = new Image();
        img.onload = () => { photoImgsRef.current.set(i, img); };
        img.src = url;
      }
    });
  }, [capturedPhotos]);

  useEffect(() => {
    let cancelled = false;
    const imageElements = canvasScene.filter((el) => el.type !== "text" && !!el.src);
    if (imageElements.length === 0) {
      sceneImgsRef.current.clear();
      return;
    }

    const uniqueSrc = Array.from(new Set(imageElements.map((el) => el.src as string)));
    Promise.allSettled(uniqueSrc.map(async (src) => {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error("failed to load scene image"));
        node.src = proxifySceneUrl(src);
      });
      return [src, img] as const;
    })).then((results) => {
      if (cancelled) return;
      const loadedEntries = results
        .filter((result): result is PromiseFulfilledResult<readonly [string, HTMLImageElement]> => result.status === "fulfilled")
        .map((result) => result.value);
      sceneImgsRef.current = new Map(loadedEntries);
    });

    return () => {
      cancelled = true;
    };
  }, [canvasScene]);

  // Draw loop (requestAnimationFrame)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      // 1. Background
      ctx.fillStyle = frame.backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, cw, ch);

      const baseFrameImg = frameBaseImgRef.current;
      const assetUrl = frame.assetUrl || "";
      const drawBaseAfterSlots = !!assetUrl && isOverlayFrame(assetUrl);

      // Background template draw (webp/jpg/opaque asset) BEFORE slots.
      if (!useSceneRendering && !drawBaseAfterSlots && baseFrameImg?.complete) {
        ctx.drawImage(baseFrameImg, 0, 0, cw, ch);
      }

      if (useSceneRendering && sceneBeforePhotos.length > 0) {
        drawSceneElementsSync(ctx, sceneBeforePhotos, ch, sceneImgsRef.current);
      }

      // 2. Each slot: captured photo OR live video
      slots.forEach((slot) => {
        const captureIdx = resolveCaptureIndex(slot);
        const x = slot.left   * cw;
        const y = slot.top    * ch;
        const w = slot.width  * cw;
        const h = slot.height * ch;
        const borderRadius = Number.isFinite(slot.borderRadius) ? Number(slot.borderRadius) : 0;
        const rotationDeg = Number.isFinite(slot.rotation) ? Number(slot.rotation) : 0;

        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        if (rotationDeg !== 0) {
          ctx.rotate((rotationDeg * Math.PI) / 180);
        }
        ctx.beginPath();
        appendRoundedRectPath(ctx, -w / 2, -h / 2, w, h, borderRadius);
        ctx.clip();

        const photoUrl = capturedPhotosRef.current[captureIdx];
        if (photoUrl) {
          // Tampilkan foto yang sudah diambil (non-empty URL)
          const img = photoImgsRef.current.get(captureIdx);
          if (img?.complete && img.naturalWidth) {
            drawCoverToCanvas(ctx, img, -w / 2, -h / 2, w, h);
          }
        } else if (!allPhotosDone && captureIdx === activeSlotRef.current) {
          // Tampilkan live stream untuk slot aktif (capture normal maupun retake).
          const dslrImg = dslrImageRef?.current;
          const dslrPosterImg = dslrPosterImgRef.current;
          const vid = hiddenVidRef.current;
          const posterSource = dslrPosterImg && dslrPosterImg.complete && dslrPosterImg.naturalWidth > 0 ? dslrPosterImg : null;
          const usingPosterSource = Boolean(dslrPosterActiveRef.current && posterSource);
          const liveSource = usingPosterSource
            ? posterSource
            : dslrImg && dslrImg.naturalWidth > 0
            ? dslrImg
            : posterSource
            ? posterSource
            : vid && vid.readyState >= 2 && vid.videoWidth > 0 ? vid : null;
          const shouldMirrorLiveSource = usingPosterSource ? dslrPosterMirrorRef.current : mirror;
          if (liveSource) {
            if (shouldMirrorLiveSource) {
              ctx.save();
              ctx.scale(-1, 1);
              drawCoverToCanvas(ctx, liveSource, -w / 2, -h / 2, w, h);
              ctx.restore();
            } else {
              drawCoverToCanvas(ctx, liveSource, -w / 2, -h / 2, w, h);
            }
          }
        } else {
          // Slot belum terisi dan bukan slot aktif: tampilkan placeholder bernomor.
          drawSlotPlaceholder(ctx, -w / 2, -h / 2, w, h, String(captureIdx + 1), borderRadius);
        }
        ctx.restore();
      });

      // Overlay frame draw AFTER slots for transparent overlays.
      if (!useSceneRendering && drawBaseAfterSlots && baseFrameImg?.complete) {
        ctx.drawImage(baseFrameImg, 0, 0, cw, ch);
      }

      if (useSceneRendering && sceneAfterPhotos.length > 0) {
        drawSceneElementsSync(ctx, sceneAfterPhotos, ch, sceneImgsRef.current);
      }

      // Decoration overlay always above slots/frame base.
      const decorOverlay = frameOverlayImgRef.current;
      if (!useSceneRendering && decorOverlay?.complete) {
        ctx.drawImage(decorOverlay, 0, 0, cw, ch);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  // capturedPhotos & activeSlotIndex intentionally omitted — read via refs to avoid restarting RAF loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, dslrImageRef, cw, ch, frame.backgroundColor, slots, isDuplicate, n, mirror, allPhotosDone, resolveCaptureIndex, useSceneRendering, sceneBeforePhotos, sceneAfterPhotos]);

  return (
    <>
      {/* visibility:hidden agar browser tetap decode frame (display:none bikin black di iOS/tablet) */}
      <video ref={hiddenVidRef} autoPlay playsInline muted
        style={{ position: "absolute", visibility: "hidden", width: 1, height: 1, pointerEvents: "none" }} />
      {/* Canvas: background + foto/video per slot
          Canvas TIDAK pakai objectFit — ia scale natural ke CSS box-nya.
          objectFit: contain pada canvas tidak bekerja di Safari/iPad. */}
      <canvas
        ref={canvasRef}
        width={cw}
        height={ch}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />
    </>
  );
}

export function CameraScreen({ booth, frame, photoIndex, capturedCount, capturedPhotos, allPhotosDone, retakeSlotIndex, onCapture, onVideoReady, onProceed, onRetakeSlot, onCountdownChange, livePhotoVideoEnabled = true, mode = "live_view", boothMirrorSetting }: CameraScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.cameraBgColor as string | undefined ?? primaryColor;
  const { textPrimary, textSecondary, textTertiary } = getAdaptiveColors(bgColor);
  const isPortrait = useIsPortrait();
  const isDuplicate = isEffectiveDuplicateMode(frame);
  const effectiveSlots = useMemo(() => getEffectiveSlots(frame), [frame]);
  const resolveCaptureIndex = useMemo(
    () => toCaptureIndexResolver(effectiveSlots, isDuplicate),
    [effectiveSlots, isDuplicate]
  );
  const totalPhotos = getEffectiveCaptureCount(frame);
  const remaining = totalPhotos - capturedCount;

  // ── Device + mirror state (persisted in sessionStorage) ────────────────────────
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(() => {
    if (typeof sessionStorage === "undefined") return undefined;
    return sessionStorage.getItem("booth_camera_deviceId") ?? undefined;
  });
  const [captureSource] = useState<"auto" | "webcam" | "dslr">(() => {
    if (typeof sessionStorage === "undefined") return "auto";
    const saved = sessionStorage.getItem("booth_camera_source");
    return saved === "webcam" || saved === "dslr" || saved === "auto" ? saved : "auto";
  });
  const dslrMode = captureSource === "dslr";
  const [mirror, setMirror] = useState(() => {
    if (typeof boothMirrorSetting === "boolean") return boothMirrorSetting;
    if (typeof sessionStorage === "undefined") return true;
    return sessionStorage.getItem("booth_camera_mirror") !== "false";
  });
  const mirrorRef = useRef(mirror);
  const boothMirrorSettingRef = useRef(boothMirrorSetting);
  boothMirrorSettingRef.current = boothMirrorSetting;
  useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);
  useEffect(() => {
    if (typeof boothMirrorSetting !== "boolean") return;
    mirrorRef.current = boothMirrorSetting;
    setMirror((prev) => (prev === boothMirrorSetting ? prev : boothMirrorSetting));
    try {
      sessionStorage.setItem("booth_camera_mirror", String(boothMirrorSetting));
    } catch {
      // Ignore storage quota issues; runtime state already synced.
    }
  }, [boothMirrorSetting]);

  // Sync dslrPosterMirror with mirror state when mirror changes
  // This ensures the last saved preview (poster) mirrors correctly when booth mirror setting changes
  useEffect(() => {
    setDslrPosterMirror(mirror);
  }, [mirror]);

  const [showSettings, setShowSettings] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // ── DSLR via Local Agent ────────────────────────────────────────────────────
  const cachedAgentBase = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("booth_agent_base");
  const cachedDslrAvailable = dslrMode && typeof sessionStorage !== "undefined" && sessionStorage.getItem("booth_dslr_available") === "true";
  const cachedDslrLiveView = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("booth_dslr_supports_live_view");
  const [agentBase, setAgentBase] = useState<string | null>(() => cachedAgentBase);
  const [dslrAvailable, setDslrAvailable] = useState<boolean>(() => cachedDslrAvailable);
  const [dslrModel,     setDslrModel]     = useState<string | null>(() => {
    if (!dslrMode || typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem("booth_dslr_model") ?? "Canon DSLR";
  });
  const [dslrSupportsCapture, setDslrSupportsCapture] = useState<boolean>(() => {
    if (!dslrMode || typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem("booth_dslr_supports_capture") !== "false";
  });
  const [dslrSupportsLiveView, setDslrSupportsLiveView] = useState<boolean | null>(() => (
    cachedDslrLiveView === "true" ? true : cachedDslrLiveView === "false" ? false : null
  ));
  const [dslrPreviewKey, setDslrPreviewKey] = useState(() => Date.now());
  const [dslrPreviewUrl, setDslrPreviewUrl] = useState<string | null>(null);
  const [dslrPreviewError, setDslrPreviewError] = useState<string | null>(null);
  const [dslrPreviewPaused, setDslrPreviewPaused] = useState(false);
  const [dslrPreviewReady, setDslrPreviewReady] = useState(false);
  // After this grace period, capture is enabled even if live preview never loads.
  // Prevents the capture button from being permanently blocked by a stalled preview.
  const [dslrCaptureGraceExpired, setDslrCaptureGraceExpired] = useState(false);
  // Once any countdown starts, suppress loading overlay for the rest of the session
  const [dslrSessionStarted, setDslrSessionStarted] = useState(false);
  const [dslrPosterSrc, setDslrPosterSrc] = useState<string | null>(null);
  const [dslrPosterActive, setDslrPosterActive] = useState(false);
  const [dslrPosterMirror, setDslrPosterMirror] = useState<boolean>(mirror);
  const DSLR_PREVIEW_ERROR_GRACE_MS = 7000; // Grace period for USB release + queue wait. Canon needs up to 2200ms to release USB + 2200ms recovery = 4400ms; 7s handles worst-case with margin.
  const dslrPreviewImgRef = useRef<HTMLImageElement | null>(null);
  const dslrRecordingPosterImgRef = useRef<HTMLImageElement | null>(null);
  const agentBaseRef = useRef<string | null>(cachedAgentBase);
  const useIpcAgentRef = useRef<boolean>(false);
  const previewRecoveryInFlightRef = useRef(false);
  const lastPreviewRecoveryAtRef = useRef(0);
  useEffect(() => {
    agentBaseRef.current = agentBase;
  }, [agentBase]);

  // After 6s of DSLR mode being active, allow capture even if live preview hasn't loaded.
  // This prevents a permanently-disabled capture button when preview stalls or fails.
  useEffect(() => {
    if (!dslrMode || !dslrAvailable) return;
    const timer = setTimeout(() => setDslrCaptureGraceExpired(true), 6000);
    return () => clearTimeout(timer);
  }, [dslrMode, dslrAvailable]);

  const restartCanonPreviewBridge = useCallback(async (reason: string): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const restartBridge = window.fremioBooth?.restartBridge;

    const now = Date.now();
    if (previewRecoveryInFlightRef.current) return false;
    if (now - lastPreviewRecoveryAtRef.current < 6000) return false;

    lastPreviewRecoveryAtRef.current = now;

    setDslrPreviewReady(false);
    setDslrPreviewError(`Menyambungkan ulang Canon... (${reason})`);
    setDslrPreviewUrl(null);

    if (!restartBridge) {
      setDslrPreviewKey(Date.now());
      return true;
    }

    previewRecoveryInFlightRef.current = true;
    try {
      await restartBridge();
      setDslrPreviewKey(Date.now());
      return true;
    } catch {
      setDslrPreviewKey(Date.now());
      return false;
    } finally {
      previewRecoveryInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.fremioBooth?.agentCapture) {
      useIpcAgentRef.current = true;
    }
    if (dslrMode && agentBaseRef.current && dslrAvailable) return;
    (async () => {
      // ── 1. Coba IPC Electron (booth-windows-app) ──
      if (window.fremioBooth?.agentStatus) {
        try {
          const ipcRes = await window.fremioBooth.agentStatus();
          if (ipcRes.ok && ipcRes.payload) {
            const data = ipcRes.payload as {
              camera?: {
                available: boolean;
                cameras?: { model: string }[];
                capabilities?: {
                  supportsCapture?: boolean;
                  supportsLiveView?: boolean;
                  mode?: string;
                };
              };
            };
            if (data.camera?.available) {
              const capabilities = data.camera.capabilities;
              useIpcAgentRef.current = true;
              setAgentBase("http://127.0.0.1:3002");
              setDslrAvailable(true);
              setDslrModel(data.camera.cameras?.[0]?.model ?? "DSLR");
              setDslrSupportsCapture(capabilities?.supportsCapture !== false);
              setDslrSupportsLiveView(
                typeof capabilities?.supportsLiveView === "boolean"
                  ? capabilities.supportsLiveView
                  : null
              );
              return;
            }
          }
        } catch { /* IPC tidak tersedia → fallback fetch */ }
      }

      // ── 2. Fallback: direct HTTP fetch ──
      const isHttps = window.location.protocol === "https:";
      const candidates = isHttps
        ? [
            "https://localhost:3002",
            "https://127.0.0.1:3002",
            "https://localhost:3002",
            "https://127.0.0.1:3002",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
          ]
        : [
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "https://localhost:3002",
            "https://127.0.0.1:3002",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "https://localhost:3002",
            "https://127.0.0.1:3002",
          ];

      let healthyBase: string | null = null;

      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(2500) });
          if (!res.ok) continue;
          const data = await res.json() as {
            camera?: {
              available: boolean;
              cameras?: { model: string }[];
              capabilities?: {
                supportsCapture?: boolean;
                supportsLiveView?: boolean;
                mode?: string;
              };
            };
          };
          if (!healthyBase) healthyBase = base;
          if (data.camera?.available) {
            const capabilities = data.camera.capabilities;
            setAgentBase(base);
            setDslrAvailable(true);
            setDslrModel(data.camera.cameras?.[0]?.model ?? "DSLR");
            setDslrSupportsCapture(capabilities?.supportsCapture !== false);
            setDslrSupportsLiveView(
              typeof capabilities?.supportsLiveView === "boolean"
                ? capabilities.supportsLiveView
                : null
            );
            return;
          }
        } catch { /* agent tidak ada atau error → skip */ }
      }

      if (healthyBase) {
        setAgentBase(healthyBase);
      }
      setDslrAvailable(false);
      setDslrModel(null);
      setDslrSupportsCapture(false);
      setDslrSupportsLiveView(null);
    })();
  }, []);

  useEffect(() => {
    if (!dslrMode) {
      setDslrPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setDslrPreviewError(null);
      setDslrPreviewReady(false);
      setDslrPosterSrc(null);
      setDslrPosterActive(false);
      setDslrPosterMirror(mirrorRef.current);
      return;
    }

    if (!useIpcAgentRef.current && !agentBase) {
      setDslrPreviewUrl(null);
      setDslrPreviewError(null);
      setDslrPreviewReady(false);
      return;
    }

    if (dslrSupportsLiveView === false) {
      setDslrPreviewError("Kamera berjalan di mode capture-only. Live preview DSLR tidak tersedia, tetapi capture tetap berfungsi.");
      setDslrPreviewReady(false);
      return;
    }

    // When paused, we still want to keep the preview recovery running in background
    // but with a longer delay so it doesn't interfere with capture flow
    if (dslrPreviewPaused) {
      // Check if we should start recovery based on sessionStorage timing
      const releaseUntil = typeof window === "undefined"
        ? 0
        : Number(sessionStorage.getItem("booth_dslr_stream_release_until") || 0);
      const delayMs = Math.max(0, releaseUntil - Date.now());
      
      if (delayMs <= 0) {
        // Recovery is due - start preview but don't block capture flow
        setTimeout(() => {
          setDslrPreviewPaused(false);
        }, 50);
      }
      return;
    }

    const hasIpcPreview = typeof window !== "undefined" && Boolean(window.fremioBooth?.agentPreview);
    const base = agentBaseRef.current || agentBase;
    if (!hasIpcPreview && !base) return;

    const releaseUntil = typeof window === "undefined"
      ? 0
      : Number(sessionStorage.getItem("booth_dslr_stream_release_until") || 0);
    const delayMs = Math.max(0, releaseUntil - Date.now());
    let timer: number | null = null;
    let cancelled = false;
    let hasFrame = false;
    let previewPollingStartedAt = 0;
    let ipcFallbackTimer: number | null = null;

    let rafId: number | null = null;
    let lastFetchTime = 0;
    const targetInterval = 1000 / 90; // 90 FPS target for optimal Canon performance

    const getStreamPreviewUrl = (cacheKey: number): string | null => {
      if (typeof window === "undefined") return null;
      return window.fremioBooth?.agentPreviewStreamUrl?.(cacheKey) ?? (base ? `${base}/preview-stream?t=${cacheKey}` : null);
    };

    let usingStreamFallback = false;
    const switchToStreamFallback = () => {
      if (cancelled || usingStreamFallback) return;
      const streamUrl = getStreamPreviewUrl(Date.now());
      if (!streamUrl) return;

      usingStreamFallback = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (ipcFallbackTimer !== null) {
        window.clearTimeout(ipcFallbackTimer);
        ipcFallbackTimer = null;
      }

      setDslrPreviewReady(false);
      setDslrPreviewError("Menyiapkan live preview Canon…");
      setDslrPreviewUrl(streamUrl);

      void restartCanonPreviewBridge("fallback stream");
    };

    const pollPreview = async () => {
      if (cancelled || captureInProgressRef.current) return;

      const now = performance.now();
      if (now - lastFetchTime >= targetInterval) {
        try {
          const res = await window.fremioBooth?.agentPreview();
          if (cancelled || usingStreamFallback) return;
          if (res?.ok && res.base64) {
            hasFrame = true;
            if (ipcFallbackTimer !== null) {
              window.clearTimeout(ipcFallbackTimer);
              ipcFallbackTimer = null;
            }
            setDslrPreviewUrl(`data:${res.mimeType || "image/jpeg"};base64,${res.base64}`);
            setDslrPreviewError(null);
            setDslrPreviewReady(true);
            setDslrPosterActive(false);
          } else if (!hasFrame) {
            if (Date.now() - previewPollingStartedAt >= 9000) {
              void restartCanonPreviewBridge("frame tidak masuk");
              switchToStreamFallback();
              if (usingStreamFallback) return;
            }
            setDslrPreviewReady(false);
            if (Date.now() - previewPollingStartedAt < DSLR_PREVIEW_ERROR_GRACE_MS) {
              setDslrPreviewError("Menyiapkan live preview Canon…");
            } else {
              setDslrPreviewError(res?.error || "Live preview Canon belum tersedia. Pastikan Live View aktif di kamera.");
            }
          }
        } catch (error) {
          if (!cancelled && !hasFrame && !usingStreamFallback) {
            void restartCanonPreviewBridge("preview request gagal");
            switchToStreamFallback();
            if (usingStreamFallback) return;
            setDslrPreviewReady(false);
            if (Date.now() - previewPollingStartedAt < DSLR_PREVIEW_ERROR_GRACE_MS) {
              setDslrPreviewError("Menyiapkan live preview Canon…");
            } else {
              setDslrPreviewError(error instanceof Error ? error.message : "Live preview Canon belum tersedia. Pastikan Live View aktif di kamera.");
            }
          }
        }
        lastFetchTime = now;
      }

      if (!usingStreamFallback) {
        rafId = requestAnimationFrame(pollPreview);
      }
    };

    const startPreview = () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("booth_dslr_stream_release_until");
      }
      setDslrPreviewReady(false);
      const cacheKey = dslrPreviewKey;
      previewPollingStartedAt = Date.now();
      setDslrPreviewError(null);
      if (hasIpcPreview) {
        setDslrPreviewUrl(null);
        if (ipcFallbackTimer !== null) {
          window.clearTimeout(ipcFallbackTimer);
        }
        ipcFallbackTimer = window.setTimeout(() => {
          if (!cancelled && !hasFrame) {
            void restartCanonPreviewBridge("timeout awal live view");
            switchToStreamFallback();
          }
        }, 10000);
        timer = window.setTimeout(pollPreview, 0);
      } else if (base) {
        const streamUrl = getStreamPreviewUrl(cacheKey);
        if (streamUrl) {
          setDslrPreviewUrl(streamUrl);
        }
      }
    };

    if (delayMs > 0) {
      setDslrPreviewError("Menyiapkan live preview Canon…");
      timer = window.setTimeout(startPreview, delayMs);
    } else {
      startPreview();
    }

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      if (ipcFallbackTimer !== null) window.clearTimeout(ipcFallbackTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      setDslrPreviewUrl(null);
      setDslrPreviewReady(false);
    };
  }, [agentBase, dslrMode, dslrPreviewKey, dslrSupportsLiveView, dslrPreviewPaused, restartCanonPreviewBridge]);

  const freezeDslrPreview = useCallback((mirrorEnabled = mirrorRef.current): string | null => {
    setDslrPosterMirror(mirrorEnabled);
    const img = dslrPreviewImgRef.current;
    let frozenDataUrl: string | null = null;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          frozenDataUrl = canvas.toDataURL("image/jpeg", 0.9);
          setDslrPosterSrc(frozenDataUrl);
        }
      } catch {}
    }
    setDslrPosterActive(true);
    setDslrPreviewPaused(true);
    // Return the data URL synchronously — callers that need the frozen image
    // immediately (e.g. startCountdown at count=1) use this instead of reading
    // the stale dslrPosterSrc React state (which hasn't re-rendered yet).
    return frozenDataUrl;
  }, []);

  const captureFromAgent = useCallback(async (captureMirror = mirrorRef.current): Promise<string> => {
    const base = agentBaseRef.current;
    if (!base && !(useIpcAgentRef.current && window.fremioBooth?.agentCapture)) {
      throw new Error("Agent lokal tidak terdeteksi. Pastikan Fremio Studio sudah dibuka.");
    }

    // /trigger-capture handles preview stop internally — no need to freeze here.
    // Removing freeze avoids race conditions with /trigger-capture's own stopActivePreviewStreams.

    try {
      let photoDataUrl: string = "";
      if (window.fremioBooth?.agentCapture) {
        const ipcRes = await window.fremioBooth.agentCapture();
        if (!ipcRes.ok) {
          throw new Error(ipcRes.error || "Gagal ambil foto dari agent (IPC).");
        }
        const ipcData = ipcRes.payload as { ok: boolean; error?: string; image?: { base64: string; mimeType: string } } | undefined;
        if (!ipcData?.ok) throw new Error(ipcData?.error || "Capture IPC gagal.");
        if (!ipcData.image) throw new Error("Capture gagal: agent IPC tidak mengembalikan gambar.");
        photoDataUrl = `data:${ipcData.image.mimeType};base64,${ipcData.image.base64}`;
      } else if (base) {
        // SPLIT FLOW: POST /trigger-shot (non-blocking) → switch to "preparing" → poll /get-capture-result
        // Step 1: Fire SHOOT — returns shootFiredAt immediately after shutter fires
        const shootFiredAt = Date.now();
        const triggerRes = await fetch(`${base}/trigger-shot`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(30000),
        });
        if (!triggerRes.ok) {
          const errBody = await triggerRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errBody.error || `Capture gagal (HTTP ${triggerRes.status})`);
        }
        const triggerData = await triggerRes.json() as { ok: boolean; shootFiredAt?: number; error?: string };
        if (!triggerData.ok) throw new Error(triggerData.error || "Trigger shot gagal");

        // Shot fired! Switch to "preparing" immediately
        setCapturePhase("preparing");
        setCountdown(null);

        // Step 2: Poll /get-capture-result until image is ready
        const pollStart = Date.now();
        const POLL_INTERVAL_MS = 150;
        const POLL_TIMEOUT_MS  = 25000;
        let pollRes: Response | null = null;

        while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
          await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
          try {
            pollRes = await fetch(`${base}/get-capture-result`, {
              signal: AbortSignal.timeout(5000),
            });
            if (pollRes.status === 200) {
              // JPEG ready!
              const blob = await pollRes.blob();
              photoDataUrl = await blobToDataUrl(blob);
              break;
            } else if (pollRes.status === 202) {
              // Still downloading — keep polling
              continue;
            } else {
              const errBody = await pollRes.json().catch(() => ({})) as { error?: string };
              throw new Error(errBody.error || `Poll gagal (HTTP ${pollRes.status})`);
            }
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.name === "AbortError") {
              // Timeout on poll request — retry
              continue;
            }
            throw pollErr;
          }
        }

        if (!photoDataUrl) throw new Error("Gagal mengambil hasil foto dari Canon.");
      } else {
        throw new Error("Agent tidak tersedia.");
      }

      if (captureMirror) {
        photoDataUrl = await mirrorCapturedPhotoDataUrl(photoDataUrl);
      }

      return photoDataUrl;
    } catch (err) {
      // Clear poster on error so user doesn't see stuck frozen preview
      setDslrPosterSrc(null);
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      // Resume live preview — /trigger-capture already cleared previewRestartBlockedUntil.
      // Canon USB release time (~2.2s) is handled by DSLR_PREVIEW_ERROR_GRACE_MS in pollPreview.
      captureInProgressRef.current = false;
      setDslrPreviewPaused(false);
    }
  }, [dslrPosterSrc, useIpcAgentRef]);

  const { videoRef, stream, isReady, permissionError, devices, start, stop, capture, startRecording, stopRecording } = useCamera({
    canvasWidth:  1920,
    canvasHeight: 1080,
    deviceId:     selectedDeviceId,
    mirror,
  });

  // ── Hitung zona aktif di viewfinder sesuai slot saat ini ──────────────────
  const slotOverlay = useMemo(() => {
    if (!effectiveSlots || effectiveSlots.length === 0) return null;
    const currentSlot = effectiveSlots
      .filter((s) => resolveCaptureIndex(s) === capturedCount)
      .sort((a, b) => (a.top - b.top) || (a.left - b.left))[0];
    if (!currentSlot) return null;

    const CAM_W = 1920, CAM_H = 1080;
    const cw = frame.canvasWidth  || 1080;
    const ch = frame.canvasHeight || 1920;
    const slotAspect = (currentSlot.width * cw) / (currentSlot.height * ch);
    const srcAspect  = CAM_W / CAM_H;

    if (srcAspect > slotAspect) {
      // kamera lebih lebar → crop kiri-kanan
      const activeFrac = (CAM_H * slotAspect) / CAM_W;  // 0-1
      return { type: "lr" as const, side: (1 - activeFrac) / 2 };
    } else {
      // kamera lebih tinggi → crop atas-bawah
      const activeFrac = (CAM_W / slotAspect) / CAM_H;  // 0-1
      return { type: "tb" as const, side: (1 - activeFrac) / 2 };
    }
  }, [effectiveSlots, frame.canvasWidth, frame.canvasHeight, capturedCount, resolveCaptureIndex]);

  const [countdown, setCountdown]       = useState<number | null>(null);
  const [cdState, setCdState]           = useState<CountdownState>("READY");
  type CapturePhase = "idle" | "filler" | "preparing";
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  // Immediately hide overlay once photo appears on screen — prevents stale preparing text
  const overlayShownRef = useRef<boolean>(false);

  const countdownTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref-based guard: prevent captureAndDisplay from running twice even if tick() fires
  // or React re-renders while a capture is already in flight. Checked synchronously
  // (no render-cycle delay) before any async work.
  const captureInFlightRef            = useRef<boolean>(false);
  const preCapturePromiseRef            = useRef<Promise<string> | null>(null); // Canon: pre-fired capture promise
  // Ref-based flag checked synchronously in the RAF preview poll loop.
  // React state (dslrPreviewPaused) has a render-cycle delay; this ref stops
  // preview HTTP requests IMMEDIATELY so they don't race with the capture command.
  const captureInProgressRef            = useRef<boolean>(false);
  const dslrPreviewPauseTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dslrRecorderRef                 = useRef<MediaRecorder | null>(null);
  const dslrRecordingChunksRef          = useRef<Blob[]>([]);
  const dslrRecordingCanvasRef          = useRef<HTMLCanvasElement | null>(null);
  const dslrRecordingDrawTimerRef       = useRef<number | null>(null);
  const dslrFrozenAtRef                 = useRef<number | null>(null); // timestamp saat MJPEG stop (count=3)

  useEffect(() => {
    if (!dslrPosterSrc) {
      dslrRecordingPosterImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      dslrRecordingPosterImgRef.current = img;
    };
    img.onerror = () => {
      if (dslrRecordingPosterImgRef.current === img) dslrRecordingPosterImgRef.current = null;
    };
    img.src = dslrPosterSrc;
    return () => {
      if (dslrRecordingPosterImgRef.current === img) dslrRecordingPosterImgRef.current = null;
    };
  }, [dslrPosterSrc]);

  const stopDslrLiveRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (dslrRecordingDrawTimerRef.current) {
        cancelAnimationFrame(dslrRecordingDrawTimerRef.current);
        dslrRecordingDrawTimerRef.current = null;
      }

      const recorder = dslrRecorderRef.current;
      if (!recorder) {
        dslrRecordingCanvasRef.current = null;
        resolve(null);
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(failsafe);
        const chunks = dslrRecordingChunksRef.current;
        const blob = chunks.length > 0
          ? new Blob(chunks, { type: recorder.mimeType || "video/webm" })
          : null;
        dslrRecordingChunksRef.current = [];
        dslrRecordingCanvasRef.current = null;
        dslrRecorderRef.current = null;
        resolve(blob);
      };

      const failsafe = setTimeout(finish, 3500);
      recorder.onstop = finish;
      recorder.onerror = finish;

      if (recorder.state === "inactive") {
        finish();
        return;
      }

      try { recorder.requestData(); } catch {}
      try { recorder.stop(); } catch { finish(); }
    });
  }, []);

  const startDslrLiveRecording = useCallback(() => {
    if (typeof MediaRecorder === "undefined") return;
    const captureStreamSupported = (() => {
      try {
        const probe = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream };
        return typeof probe.captureStream === "function";
      } catch {
        return false;
      }
    })();
    if (!captureStreamSupported) return;

    if (dslrRecordingDrawTimerRef.current) {
      cancelAnimationFrame(dslrRecordingDrawTimerRef.current);
      dslrRecordingDrawTimerRef.current = null;
    }
    if (dslrRecorderRef.current && dslrRecorderRef.current.state !== "inactive") {
      try { dslrRecorderRef.current.stop(); } catch {}
    }
    dslrRecorderRef.current = null;
    dslrRecordingChunksRef.current = [];
    dslrRecordingCanvasRef.current = null;
    dslrFrozenAtRef.current = null;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stream: MediaStream;
    try {
      stream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);
    } catch {
      return;
    }

    const mimeType = getBestRecordingMime();
    const createRecorder = (options: MediaRecorderOptions) => {
      try { return new MediaRecorder(stream, options); } catch { return null; }
    };
    const recorder =
      createRecorder({ mimeType, videoBitsPerSecond: 2_000_000 }) ??
      createRecorder({ mimeType }) ??
      createRecorder({});
    if (!recorder) return;

    const drawFrame = () => {
      const img = dslrPreviewImgRef.current;
      const fallback = dslrRecordingPosterImgRef.current;
      const source = (img && img.naturalWidth > 0 && img.naturalHeight > 0)
        ? img
        : (fallback && fallback.naturalWidth > 0 && fallback.naturalHeight > 0)
          ? fallback
          : null;

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (source) {
        // Subtle zoom-in (1.0 → 1.05) during frozen phase (count=3 → count=0)
        // Creates natural "build-up" tension while Canon prepares for shutter
        const frozenAt = dslrFrozenAtRef.current;
        const FREEZE_TOTAL_MS = 5000;
        const zoomProgress = frozenAt !== null
          ? Math.min((Date.now() - frozenAt) / FREEZE_TOTAL_MS, 1)
          : 0;
        const scale = 1.0 + 0.05 * zoomProgress; // 1.00 → 1.05

        ctx.save();
        if (scale !== 1.0) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(scale, scale);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }
        if (mirror) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        drawCoverToCanvas(ctx, source, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    };

    dslrRecordingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) dslrRecordingChunksRef.current.push(event.data);
    };
    recorder.onerror = () => {};
    dslrRecordingCanvasRef.current = canvas;
    dslrRecorderRef.current = recorder;

    let lastDrawTime = 0;
    const targetInterval = 1000 / 30;
    const scheduleDraw = (time: number) => {
      if (time - lastDrawTime >= targetInterval) {
        drawFrame();
        lastDrawTime = time;
      }
      dslrRecordingDrawTimerRef.current = requestAnimationFrame(scheduleDraw);
    };
    dslrRecordingDrawTimerRef.current = requestAnimationFrame(scheduleDraw);
    try { recorder.start(200); } catch {
      try { recorder.start(); } catch {
        void stopDslrLiveRecording();
      }
    }
  }, [dslrPosterSrc, mirror, stopDslrLiveRecording]);

  // Reset cdState ke READY saat berpindah ke slot foto berikutnya,
  // atau saat user klik Ulangi (capturedCount berkurang → cdState stuck di DONE tanpa ini)
  useEffect(() => {
    if (dslrPreviewPauseTimerRef.current) clearTimeout(dslrPreviewPauseTimerRef.current);
    setDslrPosterActive(false);
    setDslrPosterSrc(null); // Clear frozen poster for clean state
    setCdState("READY");
    setCountdown(null);
  }, [photoIndex, retakeSlotIndex, capturedCount]);

  // Komunikasi countdown ke parent (fullscreen UX: sembunyikan overlay saat countdown)
  useEffect(() => {
    if (mode === "fullscreen") {
      onCountdownChange?.(false);
      return;
    }
    onCountdownChange?.(cdState === "COUNTING");
  }, [cdState, mode, onCountdownChange]);

  // Restart camera when device or mirror changes
  useEffect(() => {
    if (dslrMode) {
      stop();
      return () => {
        if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
        if (dslrPreviewPauseTimerRef.current) clearTimeout(dslrPreviewPauseTimerRef.current);
        stop();
      };
    }
    start();
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (dslrPreviewPauseTimerRef.current) clearTimeout(dslrPreviewPauseTimerRef.current);
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, mirror, dslrMode]);

  const changeDevice = (deviceId: string) => {
    try {
      sessionStorage.setItem("booth_camera_deviceId", deviceId);
    } catch {
      // Ignore storage quota issues; keep runtime state in memory.
    }
    stop();
    setSelectedDeviceId(deviceId);
    setCdState("READY");
    setShowSettings(false);
  };

  const toggleMirror = () => {
    if (typeof boothMirrorSetting === "boolean") return;
    const next = !mirror;
    try {
      sessionStorage.setItem("booth_camera_mirror", String(next));
    } catch {
      // Ignore storage quota issues; keep runtime state in memory.
    }
    mirrorRef.current = next;
    setMirror(next);
  };

  const startCountdown = useCallback(() => {
    if (cdState !== "READY") return;
    if (dslrPreviewPauseTimerRef.current) clearTimeout(dslrPreviewPauseTimerRef.current);
    setCaptureError(null);
    setCdState("COUNTING");
    setDslrSessionStarted(true); // suppress loading overlay for rest of session
    setCountdown(5);
    const currentCaptureIndex = retakeSlotIndex !== null ? retakeSlotIndex : capturedCount;

    // ── Live Mode: mulai rekam saat countdown dimulai (jika diaktifkan) ────
    if (livePhotoVideoEnabled && !dslrMode) {
      startRecording();
    } else if (livePhotoVideoEnabled && dslrMode) {
      startDslrLiveRecording();
    }

    const willUseAgentCapture = captureSource === "dslr" || (captureSource === "auto" && dslrAvailable);

      const captureAndDisplay = async () => {
        // Double-shot guard: if capture is already in flight (timer fired twice,
        // React re-rendered, or stale closure), bail out immediately.
        if (captureInFlightRef.current) {
          console.warn("[CameraScreen] captureAndDisplay: already in flight, ignoring");
          return;
        }
        captureInFlightRef.current = true;

        const bs = boothMirrorSettingRef.current;
        const captureMirrorSnapshot = typeof bs === "boolean" ? bs : mirrorRef.current;

        let dataUrl: string | null = null;
        if (captureSource === "dslr" || (captureSource === "auto" && dslrAvailable)) {
          // DSLR: filler animation (Smile!/Cheese!...) while Canon prepares + fires SHOOT.
          // captureFromAgent() switches to "preparing" when /trigger-shot returns shootFiredAt,
          // then polls /get-capture-result until JPEG is ready.
          setCapturePhase("filler");
          setCountdown(null);
          try {
            dataUrl = await captureFromAgent(captureMirrorSnapshot);
            // captureFromAgent's finally block handles:
            // - captureInProgressRef.current = false (enables preview polling)
            // - setDslrPreviewPaused(false) (resumes preview stream)
          } catch (err) {
            captureInFlightRef.current = false;
            setCapturePhase("idle");
            // captureFromAgent already reset captureInProgressRef in its finally
            setCdState("READY");
            setCaptureError(err instanceof Error ? err.message : "Gagal ambil foto dari Canon.");
            return;
          }
        } else {
          // Webcam path: capture immediately
          setCapturePhase("preparing");
          setCountdown(null);
        }

        setCdState("DONE");
        captureInFlightRef.current = false;
        captureInProgressRef.current = false; // Allow preview polling to restart
        if (!dataUrl) {
          setCaptureError("Foto gagal diambil. Pastikan kamera siap lalu coba lagi.");
          setCapturePhase("idle");
          return;
        }
        onCapture(dataUrl);
        setCountdown(null);
        setCapturePhase("idle");
        if (livePhotoVideoEnabled && dslrMode) {
          void (async () => {
            await new Promise<void>((r) => setTimeout(r, 150));
            const videoBlob = await stopDslrLiveRecording();
            onVideoReady(videoBlob, currentCaptureIndex);
          })();
        } else {
          onVideoReady(null, currentCaptureIndex);
        }
      };

    let count = 5;
    const tick = () => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);

        // FREEZE preview + start capture at count=1: user sees frozen "1", then shot fires.
        // PRE-ARM at count=2: call /prepare-capture here so the armed bridge is ready
        // before count=1. This keeps live preview running until count=1 (4s of live view).
        if (willUseAgentCapture) {
          // PRE-ARM at count=3: bridge takes ~3-4s to be BRIDGE_READY.
          // With pre-arm at count=3, bridge is ready ~2s before shot.
          // Preview stays live for counts 5,4,3,2,1.
          if (count === 3) {
            // /arm-capture: arms camera WITHOUT stopping preview.
            // Preview stays live for counts 5,4,3,2,1 — no preview stop until /trigger-capture at count=1.
            const base = agentBaseRef.current;
            if (base) {
              fetch(`${base}/arm-capture`, { method: "POST", signal: AbortSignal.timeout(15000) })
                .catch((e) => console.warn("[CameraScreen] arm-capture error:", e));
            }
          }

          if (count === 1) {
            // Show "1" briefly (150ms) — then switch to filler animation.
            // This prevents jarring snap from countdown to filler.
            setCountdown(1);
            captureInProgressRef.current = true;

            // Clear timer — fire shot NOW, no more ticks.
            if (countdownTimerRef.current) {
              clearTimeout(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }

            // Brief delay so "1" is visible for one frame before filler starts
            setTimeout(() => {
              setCountdown(null);
              setCapturePhase("filler");
              captureAndDisplay();
            }, 150);
            return;
          }
        }
        countdownTimerRef.current = setTimeout(tick, 1000);
      } else {
        // count === 0 - Webcam path only (DSLR captured at count=1 via pre-arm).
        if (!willUseAgentCapture) {
          setCountdown(null);
          setCdState("FLASH");
          countdownTimerRef.current = setTimeout(captureAndDisplay, 0);
        }
      }
    };
    countdownTimerRef.current = setTimeout(tick, 1000);
  }, [boothMirrorSetting, captureSource, capturedCount, cdState, capture, captureFromAgent, dslrAvailable, dslrMode, livePhotoVideoEnabled, onCapture, onVideoReady, retakeSlotIndex, startDslrLiveRecording, startRecording, stopDslrLiveRecording, stopRecording]);

  // Viewfinder — landscape 16:9 di landscape, 4:3 di portrait
  const aspectStyle = isPortrait
    ? {
        aspectRatio: "4 / 3",
        width:       "100%",
        maxHeight:   "calc(100vh - 14rem)",
        maxWidth:    "100%",
      } as const
    : {
        aspectRatio: "16 / 9",
        width:       "100%",
        maxHeight:   "calc(100vh - 11rem)",
        maxWidth:    "100%",
      } as const;

  // ── Frame preview di sisi kanan ──────────────────────────────────────────
  const cw = frame.canvasWidth  || 1080;
  const ch = frame.canvasHeight || 1920;
  const frameAspect = cw / ch;
  const canTriggerCapture = dslrMode
    ? dslrAvailable && dslrSupportsCapture && (dslrSupportsLiveView === false || dslrPreviewReady || dslrCaptureGraceExpired) && cdState === "READY"
    : isReady && cdState === "READY";

  return (
    <div
      className="flex h-full select-none overflow-hidden"
      style={{
        backgroundColor: bgColor,
        flexDirection: mode === "fullscreen" ? "column" : (isPortrait ? "column" : "row"),
      }}
    >
      {mode === "fullscreen" ? (
        // Fullscreen mode: live stream fullscreen, captured photos overlay on left
        <div className="relative flex-1 w-full h-full">
          {/* Kamera video fullscreen */}
          {dslrMode ? (
            dslrPreviewUrl ? (
              <img
                ref={dslrPreviewImgRef}
                crossOrigin="anonymous"
                src={dslrPreviewUrl}
                alt="DSLR live preview"
                className="w-full h-full object-cover transition-opacity duration-200"
                style={{ transform: mirror ? "scaleX(-1)" : "none" }}
                onLoad={() => {
                  setDslrPreviewError(null);
                  setDslrPreviewReady(true);
                  setDslrPosterActive(false);
                }}
                onError={() => {
                  setDslrPreviewReady(false);
                  setDslrPreviewError("Live preview Canon belum tersedia. Pastikan Live View aktif di kamera.");
                  setDslrPreviewUrl(null);
                  void restartCanonPreviewBridge("gagal render stream");
                }}
              />
            ) : dslrPosterSrc ? (
              <img
                src={dslrPosterSrc}
                alt="Preview terakhir Canon"
                className="w-full h-full object-cover"
                style={{ transform: dslrPosterMirror ? "scaleX(-1)" : "none" }}
              />
            ) : (
              <div className="absolute inset-0 bg-black" />
            )
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: mirror ? "scaleX(-1)" : "none" }}
            />
          )
        }



        {/* Capture error overlay */}
        {captureError && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm px-6">
            <div className="text-5xl">⚠️</div>
            <p className="text-white font-bold text-center text-lg">{captureError}</p>
            <button
              onClick={() => setCaptureError(null)}
              className="mt-2 px-6 py-3 rounded-2xl font-bold text-lg active:scale-95 transition-all"
              style={{ backgroundColor: accentColor, color: primaryColor }}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Capture Hint Overlay — filler + preparing with smooth typing animation */}
        {capturePhase !== "idle" && <CaptureHintOverlay capturePhase={capturePhase} mode="fullscreen" />}

        {/* Flash effect */}
        {cdState === "FLASH" && (
          <div className="absolute inset-0 bg-white animate-ping-once pointer-events-none" />
        )}

        {/* Countdown overlay — fullscreen center */}
        {cdState === "COUNTING" && countdown !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <span
              className="text-white font-black drop-shadow-2xl animate-bounce"
              style={{ fontSize: "20vw", lineHeight: 1, color: accentColor }}
            >
              {countdown}
            </span>
          </div>
        )}

          {/* Unified bottom control panel — fullscreen */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 bottom-4 rounded-2xl backdrop-blur-sm p-3 ${
              isPortrait
                ? totalPhotos >= 4
                  ? "w-[calc(100vw-2rem)] flex flex-col items-center gap-2"
                  : "w-[calc(100vw-2rem)] grid items-center gap-3"
                : "w-[calc(100vw-1rem)] max-w-[98vw] grid items-center gap-3"
            }`}
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              ...(isPortrait && totalPhotos >= 4 ? {} : { gridTemplateColumns: "1fr auto 1fr" }),
            }}
          >
            {/* Portrait + ≥4 photos: counter above the row */}
            {isPortrait && totalPhotos >= 4 && (
              <div className="text-[10px] font-bold text-white shrink-0">
                Foto ({capturedPhotos.length}/{totalPhotos})
              </div>
            )}

            {/* Row: left | center button | right */}
            <div className={`items-center gap-3 ${isPortrait && totalPhotos >= 4 ? "flex w-full" : "contents"}`}>
              {/* LEFT */}
              {isPortrait && totalPhotos >= 4 ? (
                <div className="flex items-center gap-1 flex-1 justify-end">
                  {Array.from({ length: Math.ceil(totalPhotos / 2) }).map((_, idx) => {
                    const i = idx;
                    const photo = capturedPhotos[i] || null;
                    return photo ? (
                      <div key={i} className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden shadow-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded-full text-[8px] font-bold"
                            style={{ background: accentColor + "cc", color: primaryColor }}>
                          {i + 1}
                        </div>
                        <button
                          onClick={() => onRetakeSlot(i)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shadow-md transition-colors"
                          title="Retake foto ini"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div key={`empty-${i}`} className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center"
                          style={{ borderColor: "rgba(255,255,255,0.3)", opacity: 0.7 }}>
                        <span className="text-[8px] text-white">{i + 1}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] font-bold text-white shrink-0 px-1 justify-self-start self-center">
                  Foto ({capturedPhotos.length}/{totalPhotos})
                </div>
              )}

              {/* CENTER: capture button */}
              <div className={`flex justify-center ${isPortrait && totalPhotos >= 4 ? "shrink-0" : ""}`}>
                {allPhotosDone && retakeSlotIndex === null ? (
                  <button
                    onClick={onProceed}
                    style={{ backgroundColor: accentColor, color: primaryColor }}
                    className="px-8 py-4 rounded-full text-xl font-black active:scale-95 transition-all shadow-2xl"
                  >
                    ✅ Lanjut
                  </button>
                ) : (
                  <button
                    onClick={startCountdown}
                    disabled={!canTriggerCapture}
                    style={{
                      backgroundColor: !canTriggerCapture ? `${accentColor}55` : accentColor,
                      color: primaryColor,
                    }}
                    className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black
                             transition-all duration-200 active:scale-95 disabled:cursor-not-allowed shadow-2xl"
                  >
                    {cdState === "COUNTING"
                      ? "⏳"
                      : cdState === "FLASH" || cdState === "CAPTURING" || cdState === "DONE"
                      ? "⏳"
                      : retakeSlotIndex !== null
                      ? "🔄"
                      : "📸"}
                  </button>
                )}
              </div>

              {/* RIGHT */}
              <div className={`flex items-center gap-1 overflow-x-auto ${isPortrait && totalPhotos >= 4 ? "flex-1 justify-start" : "justify-self-end self-center"}`}>
                {(isPortrait && totalPhotos >= 4
                  ? Array.from({ length: Math.floor(totalPhotos / 2) }).map((_, idx) => {
                      const i = idx + Math.ceil(totalPhotos / 2);
                      return { i, photo: capturedPhotos[i] || null };
                    })
                  : Array.from({ length: totalPhotos }).map((_, i) => ({ i, photo: capturedPhotos[i] || null }))
                ).map(({ i, photo }) => (
                  photo ? (
                    <div key={i} className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden shadow-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded-full text-[8px] font-bold"
                          style={{ background: accentColor + "cc", color: primaryColor }}>
                        {i + 1}
                      </div>
                      <button
                        onClick={() => onRetakeSlot(i)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shadow-md transition-colors"
                        title="Retake foto ini"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div key={`empty-${i}`} className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center"
                        style={{ borderColor: "rgba(255,255,255,0.3)", opacity: 0.7 }}>
                      <span className="text-[8px] text-white">{i + 1}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>

        </div>
      ) : (
        // Live view mode (current behavior)
        <>
      {/* ═══ KIRI/ATAS: Kamera ═══ */}
      <div className="flex flex-col flex-1 min-w-0 items-center justify-between py-6 px-4" style={{ minHeight: 0 }}>
        {/* Header */}
        <div className="shrink-0 text-center">
          <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>
            {allPhotosDone && retakeSlotIndex === null
              ? "Review Foto"
              : retakeSlotIndex !== null
              ? `Ulangi Foto ${retakeSlotIndex + 1}`
              : "Berpose Sekarang!"}
          </h2>

          {totalPhotos > 1 && (
            <div className="flex flex-col items-center gap-2 mt-2">
              {/* Dots indikator foto */}
              <div className="flex gap-2">
                {Array.from({ length: totalPhotos }).map((_, i) => (
                  <div
                    key={i}
                    className="h-2.5 w-2.5 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: i < capturedCount
                        ? accentColor
                        : i === capturedCount
                        ? "white"
                        : "rgba(255,255,255,0.25)",
                      transform: i === capturedCount ? "scale(1.3)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
              <p className="text-sm" style={{ color: textSecondary }}>
                    {!allPhotosDone && (
                      <>Foto ke-<span style={{ color: accentColor }} className="font-bold">{photoIndex}</span>
                      {" · "}
                      <span style={{ color: textSecondary }}>
                        {remaining > 1 ? `sisa ${remaining} lagi` : remaining === 1 ? "terakhir!" : ""}
                      </span></>
                    )}
                    {allPhotosDone && retakeSlotIndex === null && (
                      <span style={{ color: textSecondary }}>Ketuk × di foto untuk mengulang</span>
                    )}
                    {retakeSlotIndex !== null && (
                      <span style={{ color: accentColor }}>Slot {retakeSlotIndex + 1} sedang diulang</span>
                    )}
                  </p>
            </div>
          )}
        </div>

        {/* Viewfinder */}
        <div className="relative flex-1 flex items-center justify-center w-full">
          <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={aspectStyle}>
          {/* Kamera video */}
          {dslrMode ? (
            dslrPreviewUrl ? (
              <img
                ref={dslrPreviewImgRef}
                crossOrigin="anonymous"
                src={dslrPreviewUrl}
                alt="DSLR live preview"
                className="w-full h-full object-cover transition-opacity duration-200"
                style={{ transform: mirror ? "scaleX(-1)" : "none" }}
                onLoad={() => {
                  setDslrPreviewError(null);
                  setDslrPreviewReady(true);
                  setDslrPosterActive(false);
                }}
                onError={() => {
                  setDslrPreviewReady(false);
                  setDslrPreviewError("Live preview Canon belum tersedia. Pastikan Live View aktif di kamera.");
                  setDslrPreviewUrl(null);
                  void restartCanonPreviewBridge("gagal render stream");
                }}
              />
            ) : dslrPosterSrc ? (
              <img
                src={dslrPosterSrc}
                alt="Preview terakhir Canon"
                className="w-full h-full object-cover"
                style={{ transform: dslrPosterMirror ? "scaleX(-1)" : "none" }}
              />
            ) : (
              <div className="absolute inset-0 bg-black" />
            )
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: mirror ? "scaleX(-1)" : "none" }}
            />
          )}



          {/* Capture error overlay */}
          {captureError && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm px-6">
              <div className="text-5xl">⚠️</div>
              <p className="text-white font-bold text-center text-lg">{captureError}</p>
              <button
                onClick={() => setCaptureError(null)}
                className="mt-2 px-6 py-3 rounded-2xl font-bold text-lg active:scale-95 transition-all"
                style={{ backgroundColor: accentColor, color: primaryColor }}
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Capture Hint Overlay — handles filler + preparing with smooth transition (live_view mode) */}
          {capturePhase !== "idle" && <CaptureHintOverlay capturePhase={capturePhase} mode="live_view" />}

          {/* ── Toolbar kanan atas: settings ── */}
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {/* Mirror toggle */}
            <button
              onClick={toggleMirror}
              disabled={typeof boothMirrorSetting === "boolean"}
              title={typeof boothMirrorSetting === "boolean"
                ? (mirror ? "Mirror mengikuti pengaturan booth (aktif)" : "Mirror mengikuti pengaturan booth (nonaktif)")
                : (mirror ? "Mirror aktif" : "Mirror nonaktif")}
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg
                         transition-opacity backdrop-blur-sm"
              style={{
                background: "rgba(0,0,0,0.45)",
                opacity: mirror ? 1 : 0.5,
                cursor: typeof boothMirrorSetting === "boolean" ? "not-allowed" : "pointer",
              }}
            >
              ↔
            </button>
            {/* Camera selector */}
            {devices.length > 1 && (
              <button
                onClick={() => setShowSettings((v) => !v)}
                title="Ganti kamera"
                className="w-9 h-9 rounded-full flex items-center justify-center text-lg backdrop-blur-sm"
                style={{ background: showSettings ? accentColor : "rgba(0,0,0,0.45)" }}
              >
                🎥
              </button>
            )}
          </div>

          {/* Camera selector dropdown */}
          {showSettings && devices.length > 1 && (
            <div className="absolute top-14 right-3 rounded-2xl overflow-hidden shadow-2xl z-10"
              style={{ background: "rgba(10,26,74,0.95)", border: "1px solid rgba(255,255,255,0.15)", minWidth: "220px" }}>
              <p className="px-4 pt-3 pb-1 text-xs uppercase tracking-widest" style={{ color: textTertiary }}>Pilih Kamera</p>
              {devices.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => changeDevice(d.deviceId)}
                  className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/10"
                  style={{ color: d.deviceId === selectedDeviceId ? accentColor : "rgba(255,255,255,0.8)" }}
                >
                  {d.deviceId === selectedDeviceId ? "✓ " : "    "}{d.label}
                </button>
              ))}
            </div>
          )}

          {/* Dim overlay — area di luar zona slot */}
          {slotOverlay && slotOverlay.type === "lr" && (
            <>
              <div className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: 0, width: `${slotOverlay.side * 100}%`, background: "rgba(0,0,0,0.55)" }} />
              <div className="absolute top-0 bottom-0 pointer-events-none"
                style={{ right: 0, width: `${slotOverlay.side * 100}%`, background: "rgba(0,0,0,0.55)" }} />
              {/* Border zona aktif */}
              <div className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left:   `${slotOverlay.side * 100}%`,
                  right:  `${slotOverlay.side * 100}%`,
                  border: "2px dashed rgba(255,255,255,0.6)",
                  borderLeft:  "2px dashed rgba(255,255,255,0.6)",
                  borderRight: "2px dashed rgba(255,255,255,0.6)",
                }} />
            </>
          )}
          {slotOverlay && slotOverlay.type === "tb" && (
            <>
              <div className="absolute left-0 right-0 pointer-events-none"
                style={{ top: 0, height: `${slotOverlay.side * 100}%`, background: "rgba(0,0,0,0.55)" }} />
              <div className="absolute left-0 right-0 pointer-events-none"
                style={{ bottom: 0, height: `${slotOverlay.side * 100}%`, background: "rgba(0,0,0,0.55)" }} />
              {/* Border zona aktif */}
              <div className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top:    `${slotOverlay.side * 100}%`,
                  bottom: `${slotOverlay.side * 100}%`,
                  border: "2px dashed rgba(255,255,255,0.6)",
                }} />
            </>
          )}

          {/* Flash effect */}
          {cdState === "FLASH" && (
            <div className="absolute inset-0 bg-white animate-ping-once pointer-events-none" />
          )}

          {/* Countdown overlay */}
          {cdState === "COUNTING" && countdown !== null && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
              <span
                className="text-white font-black drop-shadow-2xl animate-bounce"
                style={{ fontSize: "20vw", lineHeight: 1, color: accentColor }}
              >
                {countdown}
              </span>
            </div>
          )}

          {/* Nope — NOT the third overlay. Only two overlays: line 1956 (fullscreen) + line 2220 (live_view). */}

          {/* Belum siap */}
          {!dslrMode && !isReady && !permissionError && (
            <div className="absolute inset-0 bg-black" />
          )}
        </div>
      </div>

      {/* Error izin kamera */}
      {!dslrMode && permissionError && (() => {
        const chrome = isChrome();
        const chromeUrl = `googlechrome://${typeof location !== "undefined" ? location.href.replace(/^https?:\/\//, "") : ""}`;
        return (
          <div className="absolute inset-0 flex items-center justify-center px-6"
            style={{ backgroundColor: bgColor }}>
            <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
              style={{ backgroundColor: "rgba(128,128,128,0.15)", border: "1px solid rgba(128,128,128,0.25)" }}>

              {!chrome ? (
                /* ── Non-Chrome: suruh pakai Chrome ── */
                <div className="p-7 flex flex-col items-center gap-5 text-center">
                  <div className="text-5xl">🌐</div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: textPrimary }}>Gunakan Google Chrome</h3>
                    <p className="text-sm mt-2 leading-relaxed" style={{ color: textSecondary }}>
                      Booth ini dirancang untuk Chrome. <br />
                      Di Chrome, izin kamera <strong style={{ color: textPrimary }}>hanya ditanya sekali</strong> lalu diingat selamanya.
                    </p>
                  </div>
                  <a
                    href={chromeUrl}
                    className="w-full py-4 rounded-2xl text-center font-bold text-lg"
                    style={{ backgroundColor: accentColor, color: primaryColor }}
                  >
                    Buka di Chrome
                  </a>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-sm underline" style={{ color: textTertiary }}
                  >
                    Coba lagi di browser ini
                  </button>
                </div>
              ) : (
                /* ── Chrome: panduan allow kamera ── */
                <div className="p-7 flex flex-col items-center gap-5 text-center">
                  <div className="text-5xl">📷</div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: textPrimary }}>Izinkan Akses Kamera</h3>
                    <p className="text-sm mt-2 leading-relaxed" style={{ color: textSecondary }}>
                      Klik ikon kunci 🔒 di address bar Chrome,<br />
                      lalu set <strong style={{ color: textPrimary }}>Kamera → Izinkan</strong>.<br />
                      Setelah itu izin akan disimpan permanen.
                    </p>
                  </div>
                  <div className="w-full rounded-2xl p-4 text-left text-xs space-y-1.5"
                    style={{ backgroundColor: "rgba(0,0,0,0.15)", color: textSecondary }}>
                    <p>1. Klik 🔒 di sebelah kiri address bar</p>
                    <p>2. Pilih <span style={{ color: textPrimary }}>Izin situs</span></p>
                    <p>3. Set <span style={{ color: textPrimary }}>Kamera</span> → <span className="text-green-500">Izinkan</span></p>
                    <p>4. Muat ulang halaman ini</p>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 rounded-2xl font-bold text-lg"
                    style={{ backgroundColor: accentColor, color: primaryColor }}
                  >
                    🔄 Muat Ulang
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

        {/* Tombol ambil foto / lanjut */}
        <div className="shrink-0 w-full max-w-sm">
          {allPhotosDone && retakeSlotIndex === null ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={onProceed}
                style={{ backgroundColor: accentColor, color: primaryColor }}
                className="w-full py-6 rounded-3xl text-2xl font-black active:scale-95 transition-all"
              >
                ✅ Lanjut ke Preview
              </button>
            </div>
          ) : (
            <button
              onClick={startCountdown}
              disabled={!canTriggerCapture}
              style={{
                backgroundColor: !canTriggerCapture ? `${accentColor}55` : accentColor,
                color:            primaryColor,
              }}
              className="w-full py-6 rounded-3xl text-3xl font-black
                         transition-all duration-200 active:scale-95 disabled:cursor-not-allowed"
            >
              {cdState === "COUNTING"
                ? `${countdown ?? ""}`
                : cdState === "FLASH" || cdState === "CAPTURING" || cdState === "DONE"
                ? "…"
                : retakeSlotIndex !== null
                ? "�"
                : "📸"}
            </button>
          )}
        </div>
      </div>{/* akhir kolom kiri */}

      {/* ═══ KANAN/BAWAH (landscape) / BAWAH (portrait): Preview ═══ */}
      <div
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={isPortrait
          ? { width: "100%", height: "22vh", flexDirection: "row", gap: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: 12 }
          : { width: "clamp(200px, 30vw, 400px)", flexDirection: "column", paddingTop: 24, paddingBottom: 24, paddingRight: 16, paddingLeft: 8 }
        }
      >
        {isPortrait ? (
          /* Portrait: strip foto sederhana — tanpa frame, tanpa live canvas */
          <>
            {Array.from({ length: totalPhotos }).map((_, i) => {
              const photo = capturedPhotos[i] ?? null;
              return (
                <div key={i} className="flex-1 h-full rounded-xl overflow-hidden relative"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {photo ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      {allPhotosDone && (
                        <button
                          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold shadow-lg"
                          style={{ background: "rgba(15,15,15,0.88)", color: "white", border: "1.5px solid rgba(255,255,255,0.4)", zIndex: 10 }}
                          onClick={() => onRetakeSlot(i)}
                        >×</button>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl opacity-20" style={{ color: textPrimary }}>{i + 1}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          /* Landscape: frame + live canvas preview */
          <>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: textTertiary }}>Preview</p>
            {/* Kontainer frame — aspect ratio menyesuaikan frame */}
            <div
              className="relative overflow-hidden rounded-2xl shadow-2xl"
              style={{
                aspectRatio: String(frameAspect),
                width: "100%",
                maxHeight: "calc(100vh - 8rem)",
                backgroundColor: frame.backgroundColor || "#ffffff",
              }}
            >
              {/* Canvas live composite — background + foto/video per slot + overlay PNG */}
              <LivePreviewCanvas
                stream={stream}
                dslrImageRef={dslrMode ? dslrPreviewImgRef : undefined}
                dslrPosterSrc={dslrMode ? dslrPosterSrc : null}
                dslrPosterActive={dslrMode ? dslrPosterActive : false}
                dslrPosterMirror={dslrMode ? dslrPosterMirror : false}
                mirror={mirror}
                frame={frame}
                slots={effectiveSlots}
                capturedPhotos={capturedPhotos}
                isDuplicate={isDuplicate}
                allPhotosDone={allPhotosDone}
                activeSlotIndex={capturedCount}
              />
              {/* Tombol × retake */}
              {allPhotosDone && effectiveSlots.map((slot) => {
                const captureIdx = resolveCaptureIndex(slot);
                const photo = capturedPhotos[captureIdx] || null;
                if (!photo) return null;
                return (
                  <button
                    key={slot.photoIndex}
                    className="absolute w-7 h-7 rounded-full flex items-center justify-center text-base font-bold shadow-lg"
                    style={{
                      left:       `calc(${(slot.left + slot.width) * 100}% - 1.25rem)`,
                      top:        `calc(${slot.top * 100}% - 0.75rem)`,
                      background: "rgba(15,15,15,0.88)",
                      color:      "white",
                      border:     "2px solid rgba(255,255,255,0.4)",
                      zIndex:     30,
                    }}
                    onClick={() => onRetakeSlot(captureIdx)}
                    title="Ulangi foto ini"
                  >×</button>
                );
              })}
            </div>
            <p className="text-xs mt-3 text-center" style={{ color: textTertiary }}>
              {capturedCount}/{totalPhotos} foto
            </p>
          </>
        )}
      </div>
    </>
      )}
    </div>
  );
}
