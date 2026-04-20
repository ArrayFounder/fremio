"use client";

import { useEffect, useRef, useState } from "react";
import { composePhoto, applyFilterToBlob, uploadToR2, uploadVideo, composeVideoLive, applyPixelFiltersToData, isOverlayFrame } from "@/lib/frameEngine";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, FrameData } from "../types";

// ── Filter presets (sama seperti EditPhoto di fremio.id) ──────────────────
const FILTER_PRESETS = [
  { name: "Original",     icon: "📷", color: "linear-gradient(135deg,#f0ebe4,#a09488)", filters: { brightness:100, contrast:100, saturate:100, grayscale:0,   sepia:0,  hueRotate:0   } },
  { name: "Instant Soft", icon: "🫧", color: "linear-gradient(135deg,#e8eeff,#9aa8e8)", filters: { brightness:110, contrast: 88, saturate: 92, grayscale:0,   sepia:5,  hueRotate:0   } },
  { name: "Warm Film",    icon: "🎞️",  color: "linear-gradient(135deg,#f8e4b0,#c07030)", filters: { brightness:106, contrast:104, saturate:112, grayscale:0,   sepia:18, hueRotate:12  } },
  { name: "Muted Color",  icon: "🪵", color: "linear-gradient(135deg,#ddd8cc,#928878)", filters: { brightness:104, contrast: 98, saturate: 70, grayscale:0,   sepia:0,  hueRotate:0   } },
  { name: "Pastel Soft",  icon: "🍬", color: "linear-gradient(135deg,#fde8e8,#d898c0)", filters: { brightness:112, contrast: 86, saturate: 80, grayscale:0,   sepia:0,  hueRotate:-4  } },
  { name: "Retro Matte",  icon: "🧃", color: "linear-gradient(135deg,#e8d8b0,#a07840)", filters: { brightness:104, contrast: 85, saturate: 90, grayscale:0,   sepia:6,  hueRotate:-8  } },
  { name: "Soft Grain",   icon: "✨", color: "linear-gradient(135deg,#faf4e8,#c8bc9c)", filters: { brightness:104, contrast:102, saturate: 92, grayscale:0,   sepia:8,  hueRotate:0   } },
  { name: "Soft Mono",    icon: "🕊️",  color: "linear-gradient(135deg,#f0f0f0,#404040)", filters: { brightness:108, contrast: 92, saturate:  0, grayscale:100, sepia:0,  hueRotate:0   } },
  { name: "Film Noir",    icon: "🎬", color: "linear-gradient(135deg,#484848,#080808)", filters: { brightness: 98, contrast:135, saturate:  0, grayscale:100, sepia:0,  hueRotate:0   } },
] as const;

type FilterPreset = typeof FILTER_PRESETS[number];

function getFilterCss(f: FilterPreset["filters"]): string {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) hue-rotate(${f.hueRotate}deg)`;
}

/**
 * Terapkan filter ke sebuah foto (data URL) menggunakan pixel manipulation langsung.
 * TIDAK menggunakan ctx.filter — jauh lebih andal di semua browser/konteks.
 * Mengembalikan data URL baru yang sudah terfilter.
 */
function applyFilterToPhotoDataUrl(
  photo:   string,
  filters: FilterPreset["filters"],
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth  || 1920;
      const h = img.naturalHeight || 1080;
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);               // gambar TANPA filter dulu

      const imgData = ctx.getImageData(0, 0, w, h);
      const d       = imgData.data;

      const br = filters.brightness / 100;
      const co = filters.contrast   / 100;
      const sa = filters.saturate   / 100;
      const gr = filters.grayscale  / 100;
      const se = filters.sepia      / 100;
      const hr = (filters.hueRotate * Math.PI) / 180;

      // Pre-compute hue-rotate matrix (identitas jika hueRotate=0)
      const cosH = Math.cos(hr), sinH = Math.sin(hr);
      const s3 = 1 / 3, sq = Math.sqrt(1 / 3);
      const hm00 = cosH + s3 * (1 - cosH);
      const hm01 = s3 * (1 - cosH) - sq * sinH;
      const hm02 = s3 * (1 - cosH) + sq * sinH;

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] / 255;
        let g = d[i + 1] / 255;
        let b = d[i + 2] / 255;

        // 1. Brightness: multiply
        r *= br; g *= br; b *= br;

        // 2. Contrast: (x - 0.5) * amount + 0.5
        r = (r - 0.5) * co + 0.5;
        g = (g - 0.5) * co + 0.5;
        b = (b - 0.5) * co + 0.5;

        // 3. Saturate: lerp dari grayscale ke warna penuh
        if (sa !== 1) {
          const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = L + (r - L) * sa;
          g = L + (g - L) * sa;
          b = L + (b - L) * sa;
        }

        // 4. Grayscale: lerp ke luma
        if (gr > 0) {
          const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = r + (L - r) * gr;
          g = g + (L - g) * gr;
          b = b + (L - b) * gr;
        }

        // 5. Sepia: matrix lerp
        if (se > 0) {
          const nr = r * (1 - 0.607 * se) + g * 0.769 * se + b * 0.189 * se;
          const ng = r * 0.349 * se       + g * (1 - 0.314 * se) + b * 0.168 * se;
          const nb = r * 0.272 * se       + g * 0.534 * se + b * (1 - 0.869 * se);
          r = nr; g = ng; b = nb;
        }

        // 6. Hue-rotate: color matrix
        if (hr !== 0) {
          const nr = hm00 * r + hm01 * g + hm02 * b;
          const ng = hm02 * r + hm00 * g + hm01 * b;
          const nb = hm01 * r + hm02 * g + hm00 * b;
          r = nr; g = ng; b = nb;
        }

        d[i]     = Math.max(0, Math.min(255, r * 255));
        d[i + 1] = Math.max(0, Math.min(255, g * 255));
        d[i + 2] = Math.max(0, Math.min(255, b * 255));
        // alpha channel tidak disentuh
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(photo);   // fallback tanpa filter
    img.src = photo;
  });
}

// ─────────────────────────────────────────────────────────────────────────

interface PreviewScreenProps {
  booth:                  BoothConfigData;
  frame:                  FrameData;
  capturedPhotos:         string[];              // JPEG data URLs dari kamera (1-N foto)
  sessionId:              string;
  /** Live Mode — status dan hasil composite video (dikelola BoothClient) */
  liveVideoState:         "idle" | "compositing" | "done" | "error";
  liveVideoCompositeBlob: Blob | null;
  /** Raw per-slot video Blobs dari BoothClient — untuk re-komposisi dengan filter */
  capturedVideos:         (Blob | null)[];
  /** Mirror setting kamera — harus sama dengan saat rekaman original */
  mirrorVideo?:           boolean;
  onSaved:  (result: { photoUrl: string; videoUrl: string | null; downloadUrl: string }) => void;
  onRetake: () => void;
}

export function PreviewScreen({
  booth,
  frame,
  capturedPhotos,
  capturedVideos,
  mirrorVideo = false,
  sessionId,
  liveVideoState,
  liveVideoCompositeBlob,
  onSaved,
  onRetake,
}: PreviewScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);

  // ── Photo composite ────────────────────────────────────────────────────────
  const [compositeDataUrl, setCompositeDataUrl] = useState<string | null>(null);
  const [isCompositing, setIsCompositing]         = useState(true);
  const [composeError, setComposeError]           = useState<string | null>(null);
  const compositeBlobRef                          = useRef<Blob | null>(null);

  // ── Video preview URL ──────────────────────────────────────────────────────
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Upload state ───────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Filter state — foto & video terpisah ───────────────────────────────────────────────────────────
  const [activePhotoFilter, setActivePhotoFilter] = useState<string>("Original");
  const [activeVideoFilter, setActiveVideoFilter] = useState<string>("Original");

  const photoPreset     = FILTER_PRESETS.find((p) => p.name === activePhotoFilter) ?? FILTER_PRESETS[0];
  const photoFilterCss  = getFilterCss(photoPreset.filters);
  const photoIsOriginal = activePhotoFilter === "Original";

  const videoPreset     = FILTER_PRESETS.find((p) => p.name === activeVideoFilter) ?? FILTER_PRESETS[0];
  const videoFilterCss  = getFilterCss(videoPreset.filters);
  const videoIsOriginal = activeVideoFilter === "Original";

  const frameOpts = {
    canvasWidth:     frame.canvasWidth  || 1080,
    canvasHeight:    frame.canvasHeight || 1920,
    slots:           frame.slots ?? undefined,
    backgroundColor: frame.backgroundColor || "#ffffff",
    overlayUrl:      frame.overlayUrl ?? undefined,
    sceneElements:   frame.sceneElements ?? undefined,
  } as const;

  // Mode duplicate: expand photos array (slot j → capturedPhotos[min(j, n-1-j)])
  // Fallback heuristic: jika capturedPhotos.length === n/2, frame pasti duplicate
  // (single mode dengan n slot butuh n captures untuk sampai ke sini, bukan n/2)
  const _slotCount = frame.slots?.length ?? 0;
  const isDuplicate = !!(frame.slots && _slotCount >= 2 && _slotCount % 2 === 0);
  const expandPhotos = (photos: string[]): string[] => {
    if (!isDuplicate || !frame.slots) return photos;
    const n = frame.slots.length;
    const nRows = n / 2;
    // 2-kolom: kiri-row-r (pi%2===0) → photos[r]; kanan-row-r (pi%2===1) → photos[nRows-1-r]
    return Array.from({ length: n }, (_, j) => {
      const captureIdx = j % 2 === 0
        ? Math.floor(j / 2)
        : nRows - 1 - Math.floor(j / 2);
      return photos[captureIdx] ?? "";
    });
  };

  // ─── Composite foto via frameEngine ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsCompositing(true);

    // Pre-apply filter ke setiap foto via pixel manipulation (TIDAK ctx.filter)
    // agar filter HANYA mengenai area foto — frame/overlay tidak tersentuh sama sekali.
    const applyAndCompose = async () => {
      const filteredPhotos = photoIsOriginal
        ? capturedPhotos
        : await Promise.all(
            capturedPhotos.map((p) => applyFilterToPhotoDataUrl(p, photoPreset.filters))
          );
      if (cancelled) return;
      return composePhoto(expandPhotos(filteredPhotos), frame.assetUrl, frameOpts);
    };

    applyAndCompose()
      .then((blob) => {
        if (cancelled || !blob) return;
        compositeBlobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setCompositeDataUrl(objectUrl);
        setIsCompositing(false);
      })
      .catch((err) => {
        console.error("[PreviewScreen] composePhoto error:", err);
        if (!cancelled) {
          setComposeError(err instanceof Error ? err.message : String(err));
          setIsCompositing(false);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedPhotos, frame, activePhotoFilter]);

  // ─── Buat preview URL saat blob video siap ────────────────────────────────
  useEffect(() => {
    if (!liveVideoCompositeBlob) { setVideoPreviewUrl(null); return; }
    const url = URL.createObjectURL(liveVideoCompositeBlob);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [liveVideoCompositeBlob]);

  // ─── Canvas-based video rendering: filter hanya pada area slot foto ─────────
  useEffect(() => {
    const isVideoReady = liveVideoState === "done" && !!videoPreviewUrl;
    if (!isVideoReady || videoIsOriginal) return;
    const canvas  = videoCanvasRef.current;
    const videoEl = hiddenVideoRef.current;
    if (!canvas || !videoEl) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const safeUrl = (url: string) =>
      url.startsWith("https://fremio.id/") || url.startsWith("https://api.fremio.id/")
        ? `/api/proxy-image?url=${encodeURIComponent(url)}`
        : url;
    const loadImg = (url: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload  = () => res(img);
        img.onerror = rej;
        img.src = url;
      });

    let frameImg:   HTMLImageElement | null = null;
    let overlayImg: HTMLImageElement | null = null;
    let imagesReady = false;

    (async () => {
      if (isOverlayFrame(frame.assetUrl)) {
        try { frameImg = await loadImg(safeUrl(frame.assetUrl)); } catch {}
      }
      if (frame.overlayUrl) {
        try { overlayImg = await loadImg(safeUrl(frame.overlayUrl)); } catch {}
      }
      imagesReady = true;
    })();

    videoEl.src = videoPreviewUrl;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.play().catch(() => {});

    const slots = frame.slots ?? [];
    const W = canvas.width;
    const H = canvas.height;
    let raf: number;

    const draw = () => {
      if (imagesReady && videoEl.readyState >= 2) {
        ctx.drawImage(videoEl, 0, 0, W, H);
        // Filter pixel-by-pixel hanya pada bounding-box slot — area frame tidak tersentuh
        for (const slot of slots) {
          const sx = Math.floor(slot.left   * W);
          const sy = Math.floor(slot.top    * H);
          const sw = Math.ceil(slot.width   * W);
          const sh = Math.ceil(slot.height  * H);
          if (sw > 0 && sh > 0) {
            const imgData = ctx.getImageData(sx, sy, sw, sh);
            applyPixelFiltersToData(imgData.data, videoPreset.filters);
            ctx.putImageData(imgData, sx, sy);
          }
        }
        // Re-draw frame overlay di atas untuk restore warna frame yang asli
        if (frameImg)   ctx.drawImage(frameImg,   0, 0, W, H);
        if (overlayImg) ctx.drawImage(overlayImg, 0, 0, W, H);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      videoEl.pause();
      videoEl.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVideoState, videoPreviewUrl, videoIsOriginal, activeVideoFilter, frame]);

  // ─── Upload ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const blob = compositeBlobRef.current;
    if (!blob) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      // ── Filter foto: pixel-level manipulation (tidak pakai ctx.filter) ──────
      // Setiap foto diproses satu per satu menggunakan getImageData/putImageData.
      // Tidak ada ketergantungan pada ctx.filter yang bermasalah.
      const photosForCompose = photoIsOriginal
        ? capturedPhotos
        : await Promise.all(
            capturedPhotos.map((photo) => applyFilterToPhotoDataUrl(photo, photoPreset.filters))
          );

      const filteredBlob = await composePhoto(expandPhotos(photosForCompose), frame.assetUrl, frameOpts);

      const [photoUrl, videoUrl] = await Promise.all([
        uploadToR2(filteredBlob, sessionId),
        liveVideoCompositeBlob
          ? (async () => {
              if (!videoIsOriginal && capturedVideos.some(Boolean)) {
                try {
                  // Re-komposisi dari raw video clips dengan filter di-apply per-slot
                  // (sebelum frame overlay digambar) — frame design tidak ikut terfilter
                  const filteredVideoBlob = await composeVideoLive(
                    capturedVideos,
                    frame.assetUrl,
                    {
                      ...frameOpts,
                      filters:  videoPreset.filters,
                      mirror:   mirrorVideo,
                      duration: 4000,
                      fps:      30,
                    },
                  );
                  return filteredVideoBlob
                    ? uploadVideo(filteredVideoBlob, sessionId).catch(() => null)
                    : uploadVideo(liveVideoCompositeBlob, sessionId).catch(() => null);
                } catch (err) {
                  console.warn("[PreviewScreen] Video filter gagal, upload unfiltered:", err);
                  return uploadVideo(liveVideoCompositeBlob, sessionId).catch(() => null);
                }
              }
              return uploadVideo(liveVideoCompositeBlob, sessionId).catch(() => null);
            })()
          : Promise.resolve<string | null>(null),
      ]);

      const form = new FormData();
      form.append("frameId",  frame.id);
      form.append("photoUrl", photoUrl);
      if (videoUrl) form.append("videoUrl", videoUrl);

      const resp = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
        body:   form,
      });
      const body = await resp.json() as {
        success: boolean;
        data?:   { photoUrl: string; videoUrl: string | null; downloadUrl: string };
        error?:  string;
      };

      if (!body.success || !body.data) throw new Error(body.error ?? "Gagal menyimpan");
      onSaved(body.data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Gagal menyimpan foto");
    } finally {
      setIsUploading(false);
    }
  };

  const hasVideo     = liveVideoState !== "idle";
  const videoReady   = liveVideoState === "done" && !!videoPreviewUrl;
  const videoLoading = liveVideoState === "compositing";



  return (
    <div
      className="flex flex-col h-full items-center justify-between py-6 px-4 select-none"
      style={{ backgroundColor: primaryColor }}
    >
      {/* Header */}
      <div className="shrink-0 text-center">
        <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>Preview Foto</h2>
        {hasVideo && (
          <div className="mt-1 flex items-center justify-center gap-1.5">
            {videoLoading && (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: textSecondary, borderTopColor: "transparent" }} />
                <p className="text-sm" style={{ color: textSecondary }}>🎥 Live Mode sedang dirender…</p>
              </>
            )}
            {videoReady && (
              <p className="text-sm font-bold" style={{ color: accentColor }}>✓ 🎬 Live Mode siap</p>
            )}
          </div>
        )}
      </div>

      {/* ── Dua kolom: Foto (kiri) + Video (kanan), masing-masing dengan filter strip-nya ── */}
      <div className={`flex-1 flex w-full gap-3 overflow-hidden ${hasVideo ? "" : "justify-center"}`}>

        {/* ── Kolom Foto ── */}
        <div className={`flex flex-col overflow-hidden ${hasVideo ? "flex-1 min-w-0" : ""}`}>
          {/* Preview foto */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            {isCompositing ? (
              <div className="flex flex-col items-center gap-4" style={{ color: textPrimary }}>
                <span className="h-10 w-10 rounded-full border-4 border-current border-t-transparent animate-spin" />
                <p className="text-sm" style={{ color: textSecondary }}>Memproses foto…</p>
              </div>
            ) : composeError ? (
              <div className="flex flex-col items-center gap-3 text-center px-4" style={{ color: textPrimary }}>
                <p className="text-2xl">⚠️</p>
                <p className="font-bold">Gagal memproses foto</p>
                <p className="text-xs break-all" style={{ color: textSecondary }}>{composeError}</p>
                <p className="text-xs" style={{ color: textTertiary }}>
                  {capturedPhotos.length} foto · canvas {frameOpts.canvasWidth}×{frameOpts.canvasHeight}
                </p>
              </div>
            ) : compositeDataUrl ? (
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compositeDataUrl} alt="Preview foto" className="block w-auto h-auto"
                     style={{
                       maxHeight: "calc(100vh - 18rem)",
                       maxWidth:  hasVideo ? "44vw" : "min(88vw, calc((100vh - 18rem) * 9 / 16))",
                     }} />
              </div>
            ) : null}
          </div>
          {/* Filter strip foto */}
          {!isCompositing && !composeError && (
            <div className="shrink-0 py-2">
              <div className="flex flex-wrap justify-center gap-2 px-1 pb-1">
                {FILTER_PRESETS.map((preset) => {
                  const isActive = activePhotoFilter === preset.name;
                  return (
                    <button key={preset.name} onClick={() => setActivePhotoFilter(preset.name)}
                            className="flex-shrink-0 flex flex-col items-center gap-1 transition-all active:scale-95">
                      <div className="rounded-xl shadow-md"
                           style={{
                             width: 44, height: 44, background: preset.color,
                             outline: isActive ? `3px solid ${accentColor}` : "3px solid transparent",
                             outlineOffset: 2,
                           }} />
                      <span className="font-semibold whitespace-nowrap"
                            style={{ fontSize: 9, color: isActive ? accentColor : textSecondary }}>
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Kolom Video ── */}
        {hasVideo && (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Preview video */}
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shrink-0"
                   style={{ opacity: videoReady ? 1 : 0.6, transition: "opacity 0.3s ease" }}>
                {!videoReady && compositeDataUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={compositeDataUrl} alt="" className="block w-auto h-auto"
                         style={{ maxHeight: "calc(100vh - 18rem)", maxWidth: "44vw", opacity: 0.15 }} />
                    {videoLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <span className="h-10 w-10 rounded-full border-4 border-white/60 border-t-transparent animate-spin" />
                      <p className="text-xs text-center px-4" style={{ color: textSecondary }}>Merender video…</p>
                      </div>
                    )}
                  </>
                )}
                {videoReady && videoPreviewUrl && (
                  <>
                    {/* Video asli — ditampilkan hanya saat Original (tanpa filter) */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={videoRef} src={videoPreviewUrl} autoPlay loop muted playsInline
                           className="block w-auto h-auto"
                           style={{
                             maxHeight: "calc(100vh - 18rem)",
                             maxWidth:  "44vw",
                             display: videoIsOriginal ? undefined : "none",
                           }} />
                    {/* Hidden video source untuk canvas rendering */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={hiddenVideoRef} style={{ display: "none" }} />
                    {/* Canvas — ditampilkan saat filter aktif, filter hanya pada slot foto */}
                    {!videoIsOriginal && (
                      <canvas ref={videoCanvasRef} width={540} height={960}
                              className="block w-auto h-auto"
                              style={{ maxHeight: "calc(100vh - 18rem)", maxWidth: "44vw" }} />
                    )}
                    {/* overlayUrl HTML hanya saat Original — canvas menanganinya sendiri */}
                    {frame.overlayUrl && videoIsOriginal && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={frame.overlayUrl} alt=""
                           className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                           style={{ zIndex: 2 }} />
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                         style={{ zIndex: 3, background: accentColor + "cc", color: primaryColor }}>
                      🎬 LIVE
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* Filter strip video */}
            <div className="shrink-0 py-2">
              <div className="flex flex-wrap justify-center gap-2 px-1 pb-1">
                {FILTER_PRESETS.map((preset) => {
                  const isActive = activeVideoFilter === preset.name;
                  return (
                    <button key={preset.name} onClick={() => setActiveVideoFilter(preset.name)}
                            className="flex-shrink-0 flex flex-col items-center gap-1 transition-all active:scale-95">
                      <div className="rounded-xl shadow-md"
                           style={{
                             width: 44, height: 44, background: preset.color,
                             outline: isActive ? `3px solid ${accentColor}` : "3px solid transparent",
                             outlineOffset: 2,
                           }} />
                      <span className="font-semibold whitespace-nowrap"
                            style={{ fontSize: 9, color: isActive ? accentColor : textSecondary }}>
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Error upload */}
      {uploadError && (
        <div className="shrink-0 w-full max-w-md bg-red-900/80 rounded-2xl px-5 py-3 text-center">
          <p className="text-red-200 text-sm">{uploadError}</p>
        </div>
      )}

      {/* Tombol aksi */}
      <div className="shrink-0 w-full max-w-sm flex flex-row gap-3">
        <button
          onClick={onRetake}
          disabled={isUploading}
          className="flex-shrink-0 px-6 py-4 rounded-2xl text-lg font-semibold
                     active:scale-95 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: textSecondary, border: `1px solid ${surfaceBorder}`, backgroundColor: surfaceBg }}
        >
          🔄 Ulangi
        </button>
        <button
          onClick={handleSave}
          disabled={isCompositing || isUploading || !compositeDataUrl || videoLoading}
          style={{
            backgroundColor: isCompositing || isUploading || videoLoading ? `${accentColor}55` : accentColor,
            color:            primaryColor,
          }}
          className="flex-1 py-4 rounded-2xl text-xl font-black
                     transition-all active:scale-95 disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <span className="flex items-center justify-center gap-3">
              <span className="h-5 w-5 rounded-full border-4 border-current border-t-transparent animate-spin" />
              Menyimpan…
            </span>
          ) : videoLoading ? (
            <span className="flex items-center justify-center gap-3">
              <span className="h-5 w-5 rounded-full border-4 border-current border-t-transparent animate-spin" />
              🎞 Merender…
            </span>
          ) : (
            "✅ Simpan & Lanjut"
          )}
        </button>
      </div>
    </div>
  );
}
