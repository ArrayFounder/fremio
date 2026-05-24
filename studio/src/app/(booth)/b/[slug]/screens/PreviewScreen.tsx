"use client";

import { useEffect, useRef, useState } from "react";
import { composePhoto, applyFilterToBlob, uploadToR2, uploadVideo, uploadGif, uploadRawPhoto, encodeGif, applyPixelFiltersToData, isOverlayFrame, applyTrialWatermarkToDataUrl } from "@/lib/frameEngine";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, FrameData } from "../types";
import { getEffectiveSlots, isEffectiveDuplicateMode, mapSlotsToCaptureIndexes } from "../frameSlotUtils";

// ── Filter presets (sama seperti EditPhoto di fremio.id) ──────────────────
const FILTER_PRESETS = [
  { name: "Original",     icon: "📷", color: "linear-gradient(135deg,#f0ebe4,#a09488)", filters: { brightness:100, contrast:100, saturate:100, grayscale:0,   sepia:0,  hueRotate:0   } },
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
  livePhotoVideoEnabled?: boolean;
  onSaved:  (result: { photoUrl: string; videoUrl: string | null; downloadUrl: string; printImageDataUrl?: string }) => void;
  onRetake: () => void;
  mode?:                  "live_view" | "fullscreen"; // mode sesi foto
}

export function PreviewScreen({
  booth,
  frame,
  capturedPhotos,
  capturedVideos,
  mirrorVideo = false,
  livePhotoVideoEnabled = true,
  sessionId,
  liveVideoState,
  liveVideoCompositeBlob,
  onSaved,
  onRetake,
  mode = "live_view",
}: PreviewScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.previewBgColor as string | undefined ?? primaryColor;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(bgColor);

  // ── Orientation detection (portrait vs landscape) ────────────────────────
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight > window.innerWidth : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mq.addEventListener("change", handler);
    setIsPortrait(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Photo composite ────────────────────────────────────────────────────────
  const [compositeDataUrl, setCompositeDataUrl] = useState<string | null>(null);
  const [isCompositing, setIsCompositing]         = useState(true);
  const [composeError, setComposeError]           = useState<string | null>(null);
  const compositeBlobRef                          = useRef<Blob | null>(null);

  const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  // ── Video preview URL ──────────────────────────────────────────────────────
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const gifCanvasRef   = useRef<HTMLCanvasElement>(null);

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
  const effectiveSlots = getEffectiveSlots(frame);
  const isDuplicate = isEffectiveDuplicateMode(frame);
  const resolvedEffectiveSlots = mapSlotsToCaptureIndexes(effectiveSlots, isDuplicate);
  const showTrialWatermark = booth.showTrialWatermark === true;

  const frameOpts = {
    canvasWidth:     frame.canvasWidth  || 1080,
    canvasHeight:    frame.canvasHeight || 1920,
    slots:           resolvedEffectiveSlots,
    backgroundColor: frame.backgroundColor || "#ffffff",
    overlayUrl:      frame.overlayUrl ?? undefined,
    sceneElements:   frame.sceneElements ?? undefined,
    trialWatermark:  booth.showTrialWatermark === true,
    trialWatermarkText: "Trial",
  } as const;

  const renderTrialBadge = () => (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-[0.16em] pointer-events-none"
      style={{
        zIndex: 4,
        background: "rgba(17,24,39,0.62)",
        color: "#facc15",
        border: "1px solid rgba(250,204,21,0.35)",
        textShadow: "0 1px 8px rgba(0,0,0,0.4)",
      }}
    >
      Trial
    </div>
  );

  // ─── Composite foto via frameEngine ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsCompositing(true);

    console.log("[PreviewScreen] Starting composite photo generation", { capturedPhotos: capturedPhotos.length, mode });

    // Pre-apply filter ke setiap foto via pixel manipulation (TIDAK ctx.filter)
    // agar filter HANYA mengenai area foto — frame/overlay tidak tersentuh sama sekali.
    const applyAndCompose = async () => {
      const filteredPhotos = photoIsOriginal
        ? capturedPhotos
        : await Promise.all(
            capturedPhotos.map((p) => applyFilterToPhotoDataUrl(p, photoPreset.filters))
          );
      if (cancelled) return;
      console.log("[PreviewScreen] Photos filtered, calling composePhoto");
      return composePhoto(filteredPhotos, frame.assetUrl, frameOpts);
    };

    applyAndCompose()
      .then((blob) => {
        if (cancelled || !blob) return;
        compositeBlobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setCompositeDataUrl(objectUrl);
        setIsCompositing(false);
        console.log("[PreviewScreen] Composite photo generated successfully", { objectUrl });
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
    let imagesReady = false;
    Promise.resolve().then(() => { imagesReady = true; });

    videoEl.src = videoPreviewUrl;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;

    // Sync canvas intrinsic size to video's actual dimensions to preserve aspect ratio
    const onMeta = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        canvas.width  = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
      }
      videoEl.play().catch(() => {});
    };
    videoEl.addEventListener("loadedmetadata", onMeta, { once: true });
    // Fallback: kalau metadata sudah ada, langsung sync
    if (videoEl.readyState >= 1 && videoEl.videoWidth) {
      canvas.width  = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      videoEl.play().catch(() => {});
    }

    const slots = frame.slots ?? [];
    let raf: number;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      if (imagesReady && videoEl.readyState >= 2) {
        if (mirrorVideo) { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); }
        ctx.drawImage(videoEl, 0, 0, W, H);
        if (mirrorVideo) { ctx.restore(); }
        // Filter pixel-by-pixel hanya pada bounding-box slot — area frame tidak tersentuh
        // Frame sudah baked-in di dalam video (dirender oleh CameraScreen RAF loop),
        // jadi TIDAK perlu di-draw ulang — akan menyebabkan double overlay.
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
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      videoEl.removeEventListener("loadedmetadata", onMeta);
      videoEl.pause();
      videoEl.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVideoState, videoPreviewUrl, videoIsOriginal, activeVideoFilter, frame]);

  // ─── GIF slideshow: cycling raw photos 0.5s/foto ─────────────────────────
  useEffect(() => {
    if (capturedPhotos.length === 0) return;
    const images = capturedPhotos.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    let currentIdx = 0;
    let sizeSet = false;
    const draw = () => {
      const canvas = gifCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = images[currentIdx];
      if (!img) return;
      const render = () => {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (!iw || !ih) return;
        // Set canvas size to match photo aspect ratio on first load
        if (!sizeSet) {
          canvas.width  = iw;
          canvas.height = ih;
          sizeSet = true;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      if (img.complete && img.naturalWidth > 0) render();
      else img.onload = render;
    };
    draw();
    const interval = setInterval(() => {
      currentIdx = (currentIdx + 1) % images.length;
      draw();
    }, 500);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedPhotos]);

  // ─── Upload ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const blob = compositeBlobRef.current;
    if (!blob) return;
    setIsUploading(true);
    setUploadError(null);

    // Debug: log capturedPhotos before processing
    console.log("[PreviewScreen handleSave] capturedPhotos:", capturedPhotos.length, capturedPhotos.map(p => `${p.substring(0, 30)}... (${p.length} chars)`));
    console.log("[PreviewScreen handleSave] composite blob size:", blob?.size);

    try {
      // ── Filter foto: pixel-level manipulation (tidak pakai ctx.filter) ──────
      // Setiap foto diproses satu per satu menggunakan getImageData/putImageData.
      // Tidak ada ketergantungan pada ctx.filter yang bermasalah.
      // Raw/plain foto selalu original — filter hanya untuk composite & live video.
      const photosForCompose = photoIsOriginal
        ? capturedPhotos
        : await Promise.all(
            capturedPhotos.map((photo) => applyFilterToPhotoDataUrl(photo, photoPreset.filters))
          );
      const rawPhotosForUpload = showTrialWatermark
        ? await Promise.all(
            capturedPhotos.map((photo) => applyTrialWatermarkToDataUrl(photo, { text: "Trial" }))
          )
        : capturedPhotos;

      console.log("[PreviewScreen handleSave] rawPhotosForUpload:", rawPhotosForUpload.map(p => `${p.substring(0,30)}... (${p.length})`));
      console.log("[PreviewScreen handleSave] calling composePhoto...");
      const filteredBlob = await composePhoto(photosForCompose, frame.assetUrl, frameOpts);
      console.log("[PreviewScreen handleSave] composePhoto done, size:", filteredBlob.size);

      const [photoUrl, videoUrl, gifUrl, rawPhotoUrls] = await Promise.all([
        uploadToR2(filteredBlob, sessionId),
        // Always upload the composite video blob directly.
        // BoothClient already re-renders with filters via the compositing effect,
        // so we don't re-compose here (that would be a second render with different timing).
        // If liveVideoCompositeBlob is null (render failed or device doesn't support),
        // this resolves to null and video is skipped.
        livePhotoVideoEnabled && liveVideoCompositeBlob
          ? (async () => {
              console.log("[PreviewScreen handleSave] video upload: blob size =", liveVideoCompositeBlob.size, "type =", liveVideoCompositeBlob.type, "sessionId =", sessionId);
              try {
                const url = await uploadVideo(liveVideoCompositeBlob, sessionId);
                console.log("[PreviewScreen handleSave] video upload SUCCESS:", url?.slice(0, 80));
                return url;
              } catch (err) {
                console.error("[PreviewScreen handleSave] video upload FAILED:", err instanceof Error ? err.message : String(err));
                return null;
              }
            })()
          : Promise.resolve<string | null>(null),
        // GIF slideshow — encode & upload; jika gagal, abaikan (non-fatal)
        encodeGif(capturedPhotos, {
          delayMs: 500,
          maxSize: 540,
          trialWatermark: booth.showTrialWatermark === true,
          trialWatermarkText: "Trial",
        })
          .then((gifBlob) => uploadGif(gifBlob, sessionId))
          .catch(() => null),
        // Foto mentah per-capture (tanpa frame) — upload semua, log kegagalan individual
        Promise.all(
          rawPhotosForUpload.map(async (dataUrl, i) => {
            try {
              const res = await fetch(dataUrl);
              if (!res.ok) throw new Error(`fetch gagal HTTP ${res.status}`);
              const blob = await res.blob();
              if (!blob || blob.size === 0) throw new Error(`blob kosong (size=0)`);
              const url = await uploadRawPhoto(blob, sessionId, i);
              if (!url) throw new Error("uploadRawPhoto kosong");
              console.log(`[handleSave] raw photo ${i} uploaded:`, url.slice(0, 60));
              return url;
            } catch (err) {
              console.error(`[handleSave] raw photo ${i} gagal:`, err instanceof Error ? err.message : err);
              return null;
            }
          })
        ),
      ]);

      const form = new FormData();
      form.append("frameId",  frame.id);
      form.append("photoUrl", photoUrl);
      if (videoUrl) form.append("videoUrl", videoUrl);
      if (gifUrl)   form.append("gifUrl",   gifUrl);
      const validRawUrls = rawPhotoUrls.filter((u): u is string => u !== null);
      console.log("[PreviewScreen handleSave] photoUrl:", photoUrl?.slice(0, 60), "videoUrl:", videoUrl?.slice(0, 60) ?? null, "gifUrl:", gifUrl?.slice(0, 60) ?? null, "validRawUrls:", validRawUrls.length);
      if (validRawUrls.length > 0) form.append("rawPhotoUrls", JSON.stringify(validRawUrls));
      else console.warn("[PreviewScreen handleSave] PERINGATAN: validRawUrls KOSONG — foto asli tidak akan tampil di download page");

      const resp = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
        body:   form,
      });
      const body = await resp.json() as {
        success: boolean;
        data?:   { photoUrl: string; videoUrl: string | null; gifUrl: string | null; downloadUrl: string };
        error?:  string;
      };

      if (!body.success || !body.data) throw new Error(body.error ?? "Gagal menyimpan");

      // ── Auto-download semua hasil ke device booth jika diaktifkan ──────────
      if (booth.welcomeScreenPrefs?.autoDownloadEnabled) {
        const slug  = booth.boothName.replace(/\s+/g, "-").toLowerCase();
        const files: { url: string; name: string }[] = [
          { url: photoUrl, name: `foto-${slug}.jpg` },
        ];
        if (gifUrl)   files.push({ url: gifUrl,   name: `slideshow-${slug}.gif` });
        if (videoUrl) {
          files.push({ url: videoUrl, name: `video-${slug}.mp4` });
        }
        validRawUrls.forEach((url, i) =>
          files.push({ url, name: `foto-${i + 1}-original-${slug}.jpg` })
        );
        files.forEach(({ url, name }, i) => {
          setTimeout(() => {
            fetch(url)
              .then((r) => r.blob())
              .then((blob) => {
                const a    = document.createElement("a");
                a.href     = URL.createObjectURL(blob);
                a.download = name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              })
              .catch(() => {});
          }, i * 600);
        });
      }

      onSaved({ ...body.data, printImageDataUrl: await blobToDataUrl(filteredBlob) });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Gagal menyimpan foto");
    } finally {
      setIsUploading(false);
    }
  };

  const hasVideo     = livePhotoVideoEnabled && liveVideoState !== "idle";
  const videoReady   = livePhotoVideoEnabled && liveVideoState === "done" && !!videoPreviewUrl;
  const videoLoading = livePhotoVideoEnabled && liveVideoState === "compositing";
  const videoError   = livePhotoVideoEnabled && liveVideoState === "error";
  const showVideoColumn = livePhotoVideoEnabled && (hasVideo || capturedVideos.some(Boolean));



  return (
    <div
      className="flex flex-col h-full w-full items-center justify-between py-2 px-3 select-none"
      style={{ backgroundColor: bgColor }}
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
            {liveVideoState === "error" && (
              <p className="text-sm" style={{ color: "#ef4444" }}>⚠️ Video gagal dirender</p>
            )}
          </div>
        )}
      </div>

      {/* ── Layout (semua mode: photo+frame, gif, live video) ── */}
      {isPortrait ? (
            /* ── PORTRAIT: GIF (atas) | [Foto | Video?] (bawah) ── */
            <div className="flex-1 flex flex-col w-full gap-2 min-h-0 overflow-hidden mt-4 pt-14 pb-0">

              {/* Baris atas: GIF — flex grow 18 (kecil) */}
              <div style={{ flex: "18 1 0", minHeight: 0 }}
                   className="relative rounded-xl overflow-hidden shadow-2xl">
                <canvas ref={gifCanvasRef}
                        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                     style={{ zIndex: 3, background: accentColor + "cc", color: primaryColor }}>
                  🎞 GIF
                </div>
                {showTrialWatermark && renderTrialBadge()}
              </div>

              {/* Baris bawah: Foto + Video(optional) — flex grow 62 */}
          <div style={{ flex: "62 1 0", minHeight: 0 }} className={`flex flex-row gap-1.5 ${showVideoColumn ? "" : "justify-center"}`}>

            {/* Foto */}
            <div className={`flex flex-col min-w-0 min-h-0 ${showVideoColumn ? "flex-1" : "w-full max-w-[420px]"}`}>
              <div className="min-h-0 relative rounded-xl overflow-hidden shadow-2xl" style={{ flex: 1, maxHeight: "44vh" }}>
                {isCompositing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                       style={{ color: textPrimary }}>
                    <span className="h-8 w-8 rounded-full border-4 border-current border-t-transparent animate-spin" />
                    <p className="text-xs" style={{ color: textSecondary }}>Memproses…</p>
                  </div>
                )}
                {!isCompositing && composeError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-2"
                       style={{ color: textPrimary }}>
                    <p className="text-lg">⚠️</p>
                    <p className="text-xs font-bold">Gagal</p>
                  </div>
                )}
                {!isCompositing && !composeError && compositeDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={compositeDataUrl} alt="Preview foto"
                       style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                )}
              </div>
              {!isCompositing && !composeError && (
                <div className="shrink-0 mt-2 pt-1 pb-0.5">
                  <div className="flex justify-center gap-1.5">
                    {FILTER_PRESETS.map((preset) => {
                      const isActive = activePhotoFilter === preset.name;
                      return (
                        <button key={preset.name} onClick={() => setActivePhotoFilter(preset.name)}
                                className="flex-shrink-0 flex flex-col items-center gap-1 transition-all active:scale-95">
                          <div className="rounded-lg shadow-sm"
                               style={{
                                 width: 44, height: 44, background: preset.color,
                                 outline: isActive ? `3px solid ${accentColor}` : "2px solid transparent",
                                 outlineOffset: 2,
                               }} />
                          <span className="font-semibold whitespace-nowrap"
                                style={{ fontSize: 10, color: isActive ? accentColor : textSecondary }}>
                            {preset.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Video */}
            {showVideoColumn && (
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <div className="min-h-0 relative rounded-xl overflow-hidden shadow-2xl"
                   style={{ flex: 1, maxHeight: "44vh", opacity: (videoReady || videoError) ? 1 : 0.6, transition: "opacity 0.3s ease" }}>
                {/* Placeholder saat video belum siap */}
                {!videoReady && !videoError && compositeDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={compositeDataUrl} alt=""
                       style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: 0.15 }} />
                )}
                {!videoReady && !videoError && videoLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <span className="h-7 w-7 rounded-full border-4 border-white/60 border-t-transparent animate-spin" />
                    <p className="text-xs text-center px-1" style={{ color: textSecondary }}>Merender…</p>
                  </div>
                )}
                {videoError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-2"
                       style={{ background: "rgba(0,0,0,0.5)" }}>
                    <p className="text-lg">📵</p>
                    <p className="text-xs font-bold" style={{ color: "#fbbf24" }}>Video tidak</p>
                    <p className="text-xs font-bold" style={{ color: "#fbbf24" }}>tersedia</p>
                  </div>
                )}
                {/* Video siap */}
                {videoReady && videoPreviewUrl && (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={videoRef} src={videoPreviewUrl} autoPlay loop muted playsInline
                           onCanPlay={(e) => { e.currentTarget.play().catch(() => {}); }}
                           style={{ width: "100%", height: "100%", objectFit: "contain", display: videoIsOriginal ? "block" : "none", transform: mirrorVideo ? "scaleX(-1)" : "none" }} />
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={hiddenVideoRef} style={{ display: "none", transform: mirrorVideo ? "scaleX(-1)" : "none" }} />
                    {!videoIsOriginal && (
                      <canvas ref={videoCanvasRef} width={frameOpts.canvasWidth} height={frameOpts.canvasHeight}
                              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                         style={{ zIndex: 3, background: accentColor + "cc", color: primaryColor }}>
                      🎬 LIVE
                    </div>
                    {showTrialWatermark && renderTrialBadge()}
                  </>
                )}
              </div>
              {!videoError && (
                <div className="shrink-0 mt-2 pt-1 pb-0.5">
                  <div className="flex justify-center gap-1.5">
                    {FILTER_PRESETS.map((preset) => {
                      const isActive = activeVideoFilter === preset.name;
                      return (
                        <button key={preset.name} onClick={() => setActiveVideoFilter(preset.name)}
                                className="flex-shrink-0 flex flex-col items-center gap-1 transition-all active:scale-95">
                          <div className="rounded-lg shadow-sm"
                               style={{
                                 width: 44, height: 44, background: preset.color,
                                 outline: isActive ? `3px solid ${accentColor}` : "2px solid transparent",
                                 outlineOffset: 2,
                               }} />
                          <span className="font-semibold whitespace-nowrap"
                                style={{ fontSize: 10, color: isActive ? accentColor : textSecondary }}>
                            {preset.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            )}

          </div>
        </div>
      ) : (
        /* ── LANDSCAPE: Foto | GIF | Video(optional) ── */
        <div className={`flex-1 flex flex-row w-full gap-1.5 min-h-0 overflow-hidden ${showVideoColumn ? "" : "justify-center"}`}>

          {/* Foto */}
          <div style={showVideoColumn ? { flex: "1 1 0" } : { flex: "0 1 34vw", maxWidth: 430 }} className="flex flex-col min-w-0 min-h-0">
            <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden shadow-2xl">
              {isCompositing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                     style={{ color: textPrimary }}>
                  <span className="h-9 w-9 rounded-full border-4 border-current border-t-transparent animate-spin" />
                  <p className="text-xs" style={{ color: textSecondary }}>Memproses…</p>
                </div>
              )}
              {!isCompositing && composeError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-3"
                     style={{ color: textPrimary }}>
                  <p className="text-xl">⚠️</p>
                  <p className="text-xs font-bold">Gagal memproses foto</p>
                </div>
              )}
              {!isCompositing && !composeError && compositeDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={compositeDataUrl} alt="Preview foto"
                     style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              )}
            </div>
            {!isCompositing && !composeError && (
              <div className="shrink-0 pt-2 pb-1">
                <div className="flex justify-center gap-1.5">
                  {FILTER_PRESETS.map((preset) => {
                    const isActive = activePhotoFilter === preset.name;
                    return (
                      <button key={preset.name} onClick={() => setActivePhotoFilter(preset.name)}
                              className="flex-shrink-0 flex flex-col items-center gap-0.5 transition-all active:scale-95">
                        <div className="rounded-md shadow-sm"
                             style={{
                               width: 38, height: 38, background: preset.color,
                               outline: isActive ? `2px solid ${accentColor}` : "2px solid transparent",
                               outlineOffset: 1,
                             }} />
                        <span className="font-semibold whitespace-nowrap"
                              style={{ fontSize: 8, color: isActive ? accentColor : textSecondary }}>
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* GIF */}
          <div style={{ flex: "1 1 0" }} className="flex flex-col min-w-0 min-h-0">
            <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden shadow-2xl">
              <canvas ref={gifCanvasRef}
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                   style={{ zIndex: 3, background: accentColor + "cc", color: primaryColor }}>
                🎞 GIF
              </div>
              {showTrialWatermark && renderTrialBadge()}
            </div>
            {/* Spacer supaya kolom GIF setinggi kolom dengan filter strip */}
            <div className="shrink-0 pt-2 pb-1" style={{ height: 54 }} />
          </div>

          {/* Video */}
          {showVideoColumn && (
            <div style={{ flex: "1 1 0" }} className="flex flex-col min-w-0 min-h-0">
              <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden shadow-2xl"
                   style={{ opacity: (videoReady || videoError) ? 1 : 0.6, transition: "opacity 0.3s ease" }}>
                {!videoReady && !videoError && compositeDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={compositeDataUrl} alt=""
                       style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: 0.15 }} />
                )}
                {!videoReady && !videoError && videoLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="h-9 w-9 rounded-full border-4 border-white/60 border-t-transparent animate-spin" />
                    <p className="text-xs text-center px-3" style={{ color: textSecondary }}>Merender video…</p>
                  </div>
                )}
                {videoError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4"
                       style={{ background: "rgba(0,0,0,0.45)" }}>
                    <p className="text-2xl">📵</p>
                    <p className="text-sm font-bold" style={{ color: "#fbbf24" }}>Video tidak tersedia</p>
                    <p className="text-xs" style={{ color: textSecondary }}>Perangkat ini tidak mendukung Live Mode</p>
                  </div>
                )}
                {videoReady && videoPreviewUrl && (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={videoRef} src={videoPreviewUrl} autoPlay loop muted playsInline
                           onCanPlay={(e) => { e.currentTarget.play().catch(() => {}); }}
                           style={{ width: "100%", height: "100%", objectFit: "contain", display: videoIsOriginal ? "block" : "none", transform: mirrorVideo ? "scaleX(-1)" : "none" }} />
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={hiddenVideoRef} style={{ display: "none", transform: mirrorVideo ? "scaleX(-1)" : "none" }} />
                    {!videoIsOriginal && (
                      <canvas ref={videoCanvasRef} width={frameOpts.canvasWidth} height={frameOpts.canvasHeight}
                              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold"
                         style={{ zIndex: 3, background: accentColor + "cc", color: primaryColor }}>
                      🎬 LIVE
                    </div>
                    {showTrialWatermark && renderTrialBadge()}
                  </>
                )}
              </div>
              <div className="shrink-0 pt-2 pb-1">
                <div className="flex justify-center gap-1.5">
                  {FILTER_PRESETS.map((preset) => {
                    const isActive = activeVideoFilter === preset.name;
                    return (
                      <button key={preset.name} onClick={() => setActiveVideoFilter(preset.name)}
                              className="flex-shrink-0 flex flex-col items-center gap-0.5 transition-all active:scale-95">
                        <div className="rounded-md shadow-sm"
                             style={{
                               width: 38, height: 38, background: preset.color,
                               outline: isActive ? `2px solid ${accentColor}` : "2px solid transparent",
                               outlineOffset: 1,
                             }} />
                        <span className="font-semibold whitespace-nowrap"
                              style={{ fontSize: 8, color: isActive ? accentColor : textSecondary }}>
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
      )}

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
