"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCamera } from "../hooks/useCamera";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, FrameData, PhotoSlot } from "../types";
import { getEffectiveCaptureCount, getEffectiveSlots, isEffectiveDuplicateMode } from "../frameSlotUtils";
<<<<<<< HEAD

function isOverlayAsset(url: string): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return true;
  const lastDot = path.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const stem = path.substring(0, lastDot);
  return stem.endsWith("_png");
}
=======
import { isOverlayFrame } from "@/lib/frameEngine";
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

function useIsPortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return portrait;
}

function isChrome(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
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
  onVideoReady:    (videoBlob: Blob | null) => void;
  onProceed:       () => void;
  onRetakeSlot:    (slotIndex: number) => void;
}

type CountdownState = "READY" | "COUNTING" | "FLASH" | "DONE";

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

<<<<<<< HEAD
=======
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

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
interface LivePreviewCanvasProps {
  stream:          MediaStream | null;
  mirror:          boolean;
  frame:           FrameData;
  slots:           PhotoSlot[];
  capturedPhotos:  string[];
  isDuplicate:     boolean;
  allPhotosDone:   boolean;
  activeSlotIndex: number;
}

function LivePreviewCanvas({ stream, mirror, frame, slots, capturedPhotos, isDuplicate, allPhotosDone, activeSlotIndex }: LivePreviewCanvasProps) {
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const hiddenVidRef        = useRef<HTMLVideoElement>(null);
  const frameBaseImgRef     = useRef<HTMLImageElement | null>(null);
  const frameOverlayImgRef  = useRef<HTMLImageElement | null>(null);
  const photoImgsRef        = useRef<Map<number, HTMLImageElement>>(new Map());
  const photoUrlsRef        = useRef<Map<number, string>>(new Map());
  const capturedPhotosRef   = useRef<string[]>(capturedPhotos);
  const activeSlotRef       = useRef<number>(activeSlotIndex);
  const rafRef              = useRef<number>(0);

  const cw = frame.canvasWidth  || 1080;
  const ch = frame.canvasHeight || 1920;
  const n  = slots.length;
<<<<<<< HEAD
=======
  const resolveCaptureIndex = useMemo(
    () => toCaptureIndexResolver(slots, isDuplicate),
    [slots, isDuplicate]
  );
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

  // Keep refs fresh so the RAF loop always reads the latest values without restarting
  useEffect(() => { capturedPhotosRef.current = capturedPhotos; }, [capturedPhotos]);
  useEffect(() => { activeSlotRef.current = activeSlotIndex; }, [activeSlotIndex]);

  // Attach stream to hidden video + explicitly play (autoPlay can be blocked for invisible elements)
  useEffect(() => {
    const v = hiddenVidRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) {
      v.play().catch(() => {});
    }
  }, [stream]);

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
<<<<<<< HEAD
      const drawBaseAfterSlots = !!assetUrl && isOverlayAsset(assetUrl);
=======
      const drawBaseAfterSlots = !!assetUrl && isOverlayFrame(assetUrl);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

      // Background template draw (webp/jpg/opaque asset) BEFORE slots.
      if (!drawBaseAfterSlots && baseFrameImg?.complete) {
        ctx.drawImage(baseFrameImg, 0, 0, cw, ch);
      }

      // 2. Each slot: captured photo OR live video
<<<<<<< HEAD
      // Untuk duplicate 2-kolom: kiri-row-r berpasangan dengan kanan-row-(nRows-1-r)
      // Formula: col=pi%2, row=floor(pi/2), nRows=n/2
      //   kiri (col=0): captureIdx = row
      //   kanan (col=1): captureIdx = nRows - 1 - row
      const nRows = isDuplicate ? n / 2 : 0;
      slots.forEach((slot) => {
        const captureIdx = isDuplicate
          ? (slot.photoIndex % 2 === 0
              ? Math.floor(slot.photoIndex / 2)
              : nRows - 1 - Math.floor(slot.photoIndex / 2))
          : slot.photoIndex;
=======
      slots.forEach((slot) => {
        const captureIdx = resolveCaptureIndex(slot);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
        const x = slot.left   * cw;
        const y = slot.top    * ch;
        const w = slot.width  * cw;
        const h = slot.height * ch;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        const photoUrl = capturedPhotosRef.current[captureIdx];
        if (photoUrl) {
          // Tampilkan foto yang sudah diambil (non-empty URL)
          const img = photoImgsRef.current.get(captureIdx);
          if (img?.complete && img.naturalWidth) drawCoverToCanvas(ctx, img, x, y, w, h);
        } else if (!allPhotosDone && captureIdx === activeSlotRef.current) {
          // Tampilkan live stream untuk slot aktif (capture normal maupun retake).
          const vid = hiddenVidRef.current;
          if (vid && vid.readyState >= 2 && vid.videoWidth > 0) {
            if (mirror) {
              ctx.translate(x + w, y);
              ctx.scale(-1, 1);
              drawCoverToCanvas(ctx, vid, 0, 0, w, h);
            } else {
              drawCoverToCanvas(ctx, vid, x, y, w, h);
            }
          }
        }
        ctx.restore();
      });

      // Overlay frame draw AFTER slots for transparent overlays.
      if (drawBaseAfterSlots && baseFrameImg?.complete) {
        ctx.drawImage(baseFrameImg, 0, 0, cw, ch);
      }

      // Decoration overlay always above slots/frame base.
      const decorOverlay = frameOverlayImgRef.current;
      if (decorOverlay?.complete) {
        ctx.drawImage(decorOverlay, 0, 0, cw, ch);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  // capturedPhotos & activeSlotIndex intentionally omitted — read via refs to avoid restarting RAF loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
<<<<<<< HEAD
  }, [stream, cw, ch, frame.backgroundColor, slots, isDuplicate, n, mirror, allPhotosDone]);
=======
  }, [stream, cw, ch, frame.backgroundColor, slots, isDuplicate, n, mirror, allPhotosDone, resolveCaptureIndex]);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

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

export function CameraScreen({ booth, frame, photoIndex, capturedCount, capturedPhotos, allPhotosDone, retakeSlotIndex, onCapture, onVideoReady, onProceed, onRetakeSlot }: CameraScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.cameraBgColor as string | undefined ?? primaryColor;
  const { textPrimary, textSecondary, textTertiary } = getAdaptiveColors(bgColor);
  const isPortrait = useIsPortrait();
  const isDuplicate = isEffectiveDuplicateMode(frame);
  const effectiveSlots = useMemo(() => getEffectiveSlots(frame), [frame]);
<<<<<<< HEAD
=======
  const resolveCaptureIndex = useMemo(
    () => toCaptureIndexResolver(effectiveSlots, isDuplicate),
    [effectiveSlots, isDuplicate]
  );
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
    if (typeof sessionStorage === "undefined") return true;
    return sessionStorage.getItem("booth_camera_mirror") !== "false";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // ── DSLR via Local Agent ────────────────────────────────────────────────────
  const [dslrAvailable, setDslrAvailable] = useState<boolean>(false);
  const [dslrModel,     setDslrModel]     = useState<string | null>(null);
<<<<<<< HEAD
=======
  const [dslrSupportsCapture, setDslrSupportsCapture] = useState<boolean>(false);
  const [dslrSupportsLiveView, setDslrSupportsLiveView] = useState<boolean | null>(null);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
  const [dslrPreviewUrl, setDslrPreviewUrl] = useState<string | null>(null);
  const [dslrPreviewError, setDslrPreviewError] = useState<string | null>(null);
  const agentBaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
<<<<<<< HEAD
      const candidates = [
        "http://127.0.0.1:7432",
        "http://localhost:7432",
        "https://127.0.0.1:7432",
        "https://localhost:7432",
        "http://127.0.0.1:3002",
        "http://localhost:3002",
        "https://127.0.0.1:3002",
        "https://localhost:3002",
      ];
=======
      const isHttps = window.location.protocol === "https:";
      const candidates = isHttps
        ? [
            "https://localhost:7432",
            "https://127.0.0.1:7432",
            "https://localhost:3002",
            "https://127.0.0.1:3002",
          ]
        : [
            "http://localhost:7432",
            "http://127.0.0.1:7432",
            "https://localhost:7432",
            "https://127.0.0.1:7432",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "https://localhost:3002",
            "https://127.0.0.1:3002",
          ];
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

      let healthyBase: string | null = null;

      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(2500) });
          if (!res.ok) continue;
<<<<<<< HEAD
          const data = await res.json() as { camera?: { available: boolean; cameras?: { model: string }[] } };
          if (!healthyBase) healthyBase = base;
          if (data.camera?.available) {
            agentBaseRef.current = base;
            setDslrAvailable(true);
            setDslrModel(data.camera.cameras?.[0]?.model ?? "DSLR");
=======
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
            agentBaseRef.current = base;
            setDslrAvailable(true);
            setDslrModel(data.camera.cameras?.[0]?.model ?? "DSLR");
            setDslrSupportsCapture(capabilities?.supportsCapture !== false);
            setDslrSupportsLiveView(
              typeof capabilities?.supportsLiveView === "boolean"
                ? capabilities.supportsLiveView
                : null
            );
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
            return;
          }
        } catch { /* agent tidak ada atau error → skip */ }
      }

      if (healthyBase) {
        agentBaseRef.current = healthyBase;
      }
      setDslrAvailable(false);
      setDslrModel(null);
<<<<<<< HEAD
=======
      setDslrSupportsCapture(false);
      setDslrSupportsLiveView(null);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    })();
  }, []);

  useEffect(() => {
    if (!dslrMode || !agentBaseRef.current) {
      setDslrPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setDslrPreviewError(null);
      return;
    }

<<<<<<< HEAD
=======
    if (dslrSupportsLiveView === false) {
      setDslrPreviewError("Kamera berjalan di mode capture-only. Live preview DSLR tidak tersedia, tetapi capture tetap berfungsi.");
      return;
    }

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    let mounted = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let currentObjectUrl: string | null = null;
    let consecutiveFails = 0;
    let pauseUntil = 0;

    const tick = async () => {
      if (!mounted || busy) return;
      if (pauseUntil > Date.now()) {
        timer = setTimeout(tick, Math.max(400, pauseUntil - Date.now()));
        return;
      }
      busy = true;
      try {
        const base = agentBaseRef.current;
        if (!base) return;
        const res = await fetch(`${base}/preview`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
<<<<<<< HEAD
        if (!res.ok) throw new Error(`preview ${res.status}`);
=======
        if (!res.ok) {
          if (res.status === 409) {
            setDslrSupportsLiveView(false);
            setDslrPreviewError("Kamera berjalan di mode capture-only. Live preview DSLR tidak tersedia, tetapi capture tetap berfungsi.");
          }
          throw new Error(`preview ${res.status}`);
        }
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
        const blob = await res.blob();
        if (!blob.size) throw new Error("preview empty");
        const nextUrl = URL.createObjectURL(blob);
        if (!mounted) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setDslrPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          currentObjectUrl = nextUrl;
          return nextUrl;
        });
        consecutiveFails = 0;
        setDslrPreviewError(null);
      } catch {
        consecutiveFails += 1;
        if (consecutiveFails >= 3) {
          pauseUntil = Date.now() + 15000;
          setDslrPreviewError("Live preview DSLR belum tersedia. Cek mode Live View kamera. Capture foto tetap bisa dipakai.");
        }
      } finally {
        busy = false;
        if (mounted) timer = setTimeout(tick, consecutiveFails >= 3 ? 15000 : 1200);
      }
    };

    void tick();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
<<<<<<< HEAD
  }, [dslrMode]);
=======
  }, [dslrMode, dslrSupportsLiveView]);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

  const captureFromAgent = useCallback(async (): Promise<string | null> => {
    const base = agentBaseRef.current;
    if (!base) return null;
    try {
      const res = await fetch(`${base}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { ok: boolean; image?: { base64: string; mimeType: string } };
      if (!data.ok || !data.image) return null;
      return `data:${data.image.mimeType};base64,${data.image.base64}`;
    } catch { return null; }
  }, []);

  const { videoRef, stream, isReady, permissionError, devices, start, stop, capture, startRecording, stopRecording } = useCamera({
    canvasWidth:  1920,
    canvasHeight: 1080,
    deviceId:     selectedDeviceId,
    mirror,
  });

  // ── Hitung zona aktif di viewfinder sesuai slot saat ini ──────────────────
  const slotOverlay = useMemo(() => {
    if (!effectiveSlots || effectiveSlots.length === 0) return null;
<<<<<<< HEAD
    // En mode duplicate, le slot actif est capturedCount (pas n-1-capturedCount)
    const currentSlot = effectiveSlots.find((s) => s.photoIndex === capturedCount);
=======
    const currentSlot = effectiveSlots
      .filter((s) => resolveCaptureIndex(s) === capturedCount)
      .sort((a, b) => (a.top - b.top) || (a.left - b.left))[0];
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
  }, [effectiveSlots, frame.canvasWidth, frame.canvasHeight, capturedCount]);
=======
  }, [effectiveSlots, frame.canvasWidth, frame.canvasHeight, capturedCount, resolveCaptureIndex]);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

  const [countdown, setCountdown]       = useState<number | null>(null);
  const [cdState, setCdState]           = useState<CountdownState>("READY");
  const countdownTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset cdState ke READY saat berpindah ke slot foto berikutnya,
  // atau saat user klik Ulangi (capturedCount berkurang → cdState stuck di DONE tanpa ini)
  useEffect(() => {
    setCdState("READY");
    setCountdown(null);
  }, [photoIndex, retakeSlotIndex, capturedCount]);

  // Restart camera when device or mirror changes
  useEffect(() => {
    start();
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, mirror, dslrMode]);

  const changeDevice = (deviceId: string) => {
<<<<<<< HEAD
    sessionStorage.setItem("booth_camera_deviceId", deviceId);
=======
    try {
      sessionStorage.setItem("booth_camera_deviceId", deviceId);
    } catch {
      // Ignore storage quota issues; keep runtime state in memory.
    }
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    stop();
    setSelectedDeviceId(deviceId);
    setCdState("READY");
    setShowSettings(false);
  };

  const toggleMirror = () => {
    const next = !mirror;
<<<<<<< HEAD
    sessionStorage.setItem("booth_camera_mirror", String(next));
=======
    try {
      sessionStorage.setItem("booth_camera_mirror", String(next));
    } catch {
      // Ignore storage quota issues; keep runtime state in memory.
    }
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    setMirror(next);
  };

  const startCountdown = useCallback(() => {
    if (cdState !== "READY") return;
    setCaptureError(null);
    setCdState("COUNTING");
    setCountdown(3);

    // ── Live Mode: mulai rekam saat countdown dimulai ──────────────────────
    if (!dslrMode) {
      startRecording();
    }

    let count = 3;
    const tick = () => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        countdownTimerRef.current = setTimeout(tick, 1000);
      } else {
        // Flash
        setCountdown(null);
        setCdState("FLASH");
        countdownTimerRef.current = setTimeout(async () => {
          // Ambil foto sesuai sumber yang dipilih operator di setup.
          let dataUrl: string | null = null;
          if (captureSource === "dslr") {
            dataUrl = await captureFromAgent();
            if (!dataUrl) {
              setCaptureError("DSLR dipilih tapi gagal ambil foto dari local agent. Cek koneksi kamera lalu coba lagi.");
              if (!dslrMode) {
                stopRecording().catch(() => {});
              }
              setCdState("READY");
              return;
            }
          } else if (captureSource === "auto" && dslrAvailable) {
            dataUrl = await captureFromAgent();
          }

          if (!dataUrl && captureSource !== "dslr") {
            dataUrl = capture() ?? null;
          }

          setCdState("DONE");
          if (!dataUrl) {
            setCaptureError("Foto gagal diambil. Pastikan kamera siap lalu coba lagi.");
            if (!dslrMode) {
              stopRecording().catch(() => {});
            }
            return;
          }
          // Tampilkan foto review segera — jangan tunggu video
          onCapture(dataUrl);
          if (!dslrMode) {
            // Proses video di background (~800ms setelah shutter)
            void (async () => {
              await new Promise<void>((r) => setTimeout(r, 800));
              const videoBlob = await stopRecording();
              onVideoReady(videoBlob);
            })();
          } else {
            onVideoReady(null);
          }
        }, 300);
      }
    };
    countdownTimerRef.current = setTimeout(tick, 1000);
  }, [captureSource, cdState, capture, captureFromAgent, dslrAvailable, dslrMode, onCapture, onVideoReady, startRecording, stopRecording]);

  // Viewfinder — landscape 16:9 di landscape, 4:3 di portrait
  const aspectStyle = isPortrait
    ? {
        aspectRatio: "4 / 3",
        maxHeight:   "calc(100vw * 3 / 4)",
        maxWidth:    "100%",
      } as const
    : {
        aspectRatio: "16 / 9",
        maxHeight:   "calc(100vh - 11rem)",
        maxWidth:    "100%",
      } as const;

  // ── Frame preview di sisi kanan ──────────────────────────────────────────
  const cw = frame.canvasWidth  || 1080;
  const ch = frame.canvasHeight || 1920;
  const frameAspect = cw / ch;
<<<<<<< HEAD
  const canTriggerCapture = dslrMode ? cdState === "READY" : isReady && cdState === "READY";
=======
  const canTriggerCapture = dslrMode
    ? dslrAvailable && dslrSupportsCapture && cdState === "READY"
    : isReady && cdState === "READY";
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

  return (
    <div
      className="flex h-full select-none overflow-hidden"
      style={{
        backgroundColor: bgColor,
        flexDirection: isPortrait ? "column" : "row",
      }}
    >
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
          <div className="relative rounded-2xl overflow-hidden bg-black" style={aspectStyle}>
          {/* Kamera video */}
          {dslrMode ? (
            dslrPreviewUrl ? (
              <img
                src={dslrPreviewUrl}
                alt="DSLR live preview"
                className="w-full h-full object-cover"
                style={{ transform: mirror ? "scaleX(-1)" : "none" }}
              />
            ) : isReady ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: mirror ? "scaleX(-1)" : "none" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center px-6" style={{ color: textSecondary }}>
                <p className="text-sm">{dslrPreviewError ?? "Menunggu live preview DSLR…"}</p>
              </div>
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

          {/* Badge DSLR terhubung */}
          {dslrAvailable && (
            <div
              className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm text-[11px] font-bold pointer-events-none"
              style={{ background: "rgba(0,0,0,0.60)", color: "#4ade80" }}
            >
              📷 {dslrModel ?? "DSLR"} — aktif
            </div>
          )}

          {/* Badge sumber capture yang dipilih di setup */}
          <div
            className="absolute top-3 right-14 px-2.5 py-1 rounded-full backdrop-blur-sm text-[10px] font-bold pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.60)",
              color: captureSource === "dslr" ? "#4ade80" : "#facc15",
            }}
          >
            {captureSource === "dslr" ? "Sumber Foto: DSLR" : captureSource === "webcam" ? "Sumber Foto: Webcam" : "Sumber Foto: Auto"}
          </div>

          {captureSource === "dslr" && (
            <div
              className="absolute left-3 right-3 top-12 rounded-xl px-3 py-1.5 text-[10px] font-semibold pointer-events-none"
              style={{ background: "rgba(15,23,42,0.75)", color: "#e2e8f0" }}
            >
<<<<<<< HEAD
              {dslrPreviewUrl
=======
              {dslrSupportsLiveView === false
                ? "Mode capture-only aktif. Live preview DSLR tidak tersedia, capture tetap dari DSLR local agent."
                : dslrPreviewUrl
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
                ? "Live preview dari DSLR aktif."
                : "Preview pakai webcam sebagai fallback. Capture tetap diambil dari DSLR local agent."}
            </div>
          )}

          {booth.showTrialWatermark && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
              <div
                className="rounded-full px-4 py-1.5 text-sm font-black uppercase tracking-[0.18em] shadow-lg"
                style={{
                  background: "rgba(17,24,39,0.62)",
                  color: "#facc15",
                  border: "1px solid rgba(250,204,21,0.35)",
                  textShadow: "0 1px 8px rgba(0,0,0,0.4)",
                }}
              >
                Trial
              </div>
            </div>
          )}

          {/* ── Toolbar kanan atas: settings ── */}
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {/* Mirror toggle */}
            <button
              onClick={toggleMirror}
              title={mirror ? "Mirror aktif" : "Mirror nonaktif"}
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg
                         transition-opacity backdrop-blur-sm"
              style={{ background: "rgba(0,0,0,0.45)", opacity: mirror ? 1 : 0.5 }}
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="text-white font-black drop-shadow-2xl animate-bounce"
                style={{ fontSize: "20vw", lineHeight: 1, color: accentColor }}
              >
                {countdown}
              </span>
            </div>
          )}

          {/* Belum siap */}
          {!isReady && !permissionError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="animate-pulse text-lg" style={{ color: textPrimary }}>Memuat kamera…</p>
            </div>
          )}

          {captureError && (
            <div className="absolute left-3 right-3 bottom-3 rounded-xl px-3 py-2 text-[11px] font-semibold"
              style={{ background: "rgba(220,38,38,0.82)", color: "#fff" }}>
              {captureError}
            </div>
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
                ? `Siapkan diri… ${countdown ?? ""}`
                : cdState === "FLASH" || cdState === "DONE"
                ? "📹 Menyimpan…"
                : retakeSlotIndex !== null
                ? `📸 Ulangi Foto ${retakeSlotIndex + 1}`
                : "📸 Ambil Foto"}
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
<<<<<<< HEAD
                const n = effectiveSlots.length;
                const _nr = isDuplicate ? n / 2 : 0;
                const captureIdx = isDuplicate
                  ? (slot.photoIndex % 2 === 0
                      ? Math.floor(slot.photoIndex / 2)
                      : _nr - 1 - Math.floor(slot.photoIndex / 2))
                  : slot.photoIndex;
=======
                const captureIdx = resolveCaptureIndex(slot);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
    </div>
  );
}
