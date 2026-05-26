"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, FrameData } from "../types";

const RAW_SHARE_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

function parseShareIdFromInput(rawValue: string): string | null {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const directMatch = value.match(/(?:^|[?&])share=([a-zA-Z0-9_-]{4,64})(?:$|&)/i);
  if (directMatch?.[1]) return directMatch[1];

  try {
    const decoded = decodeURIComponent(value);
    const decodedMatch = decoded.match(/(?:^|[?&])share=([a-zA-Z0-9_-]{4,64})(?:$|&)/i);
    if (decodedMatch?.[1]) return decodedMatch[1];
  } catch {
    // ignore invalid URI encoding
  }

  const normalized = value.includes("://") ? value : `https://fremio.id/${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(normalized);
    const fromParam = url.searchParams.get("share");
    if (fromParam && RAW_SHARE_ID_RE.test(fromParam)) return fromParam;

    const pathSegments = url.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || "";
    if (RAW_SHARE_ID_RE.test(lastSegment)) return lastSegment;
  } catch {
    // ignore invalid URL, fallback below
  }

  if (RAW_SHARE_ID_RE.test(value)) return value;
  return null;
}

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

interface FrameSelectScreenProps {
  booth:            BoothConfigData;
  frames:          FrameData[];
  cameraDeviceId?: string | null; // ← gunakan kamera dari setting booth
  onSelect:         (frame: FrameData) => void;
  onBack?:          () => void;
}

/**
 * FRAME SELECT SCREEN — Grid thumbnail frame pilihan customer.
 * Tap untuk preview, tap lagi atau tekan "Pilih" untuk konfirmasi.
 * Hanya menampilkan frame dengan assetUrl nyata (id fremio_ atau assetUrl valid).
 */
export function FrameSelectScreen({ booth, frames, cameraDeviceId, onSelect, onBack }: FrameSelectScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor    = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.frameSelectBgColor as string | undefined ?? primaryColor;
  const panelColor  = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.frameSelectPanelColor as string | undefined;
  const { textPrimary, textSecondary } = getAdaptiveColors(bgColor);
  const { textPrimary: panelTP, textSecondary: panelTS } = getAdaptiveColors(panelColor ?? bgColor);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isPortrait = useIsPortrait();

  // Frames injected via QR scan
  const [extraFrames,  setExtraFrames]  = useState<FrameData[]>([]);
  const [scannerOpen,  setScannerOpen]  = useState(false);
  const [scanStatus,   setScanStatus]   = useState<"idle" | "scanning" | "loading" | "error">("idle");
  const [scanLog,      setScanLog]      = useState("Arahkan QR ke kamera");
  const [manualInput,  setManualInput]  = useState("");

  const videoRef      = useRef<HTMLVideoElement>(null);
  const canonVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef       = useRef<number>(0);
  const streamRef    = useRef<MediaStream | null>(null);

  // Regular frames + scanned frames merged
  // Include all frames regardless of thumbnail — custom frames may have no thumbnail yet
  const regularFrames = frames.filter(
    (f) => !f.thumbnailUrl?.includes("placeholder.com")
  );
  const allFrames = [...regularFrames, ...extraFrames];

  // ── Kategori (dari field category setiap frame) ──────────────────────────
  const categories = useMemo(() => {
    const map = new Map<string, FrameData>();
    for (const f of allFrames) {
      if (!map.has(f.category)) map.set(f.category, f);
    }
    return Array.from(map.entries()).map(([name, rep]) => ({ name, rep }));
  }, [allFrames]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Auto-pilih kategori pertama
  useEffect(() => {
    if (categories.length > 0 && selectedCategory === null) {
      setSelectedCategory(categories[0].name);
    }
  }, [categories, selectedCategory]);

  const filteredFrames = selectedCategory
    ? allFrames.filter((f) => f.category === selectedCategory)
    : allFrames;

  const selectedFrame = allFrames.find((f) => f.id === selectedId) ?? null;

  const handleSelectFrame = (frame: FrameData) => {
    setSelectedId(frame.id);
    setSelectedCategory(frame.category);
  };

  const stopScanner = useCallback(() => {
    clearTimeout(rafRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canonVideoRef.current) canonVideoRef.current.src = "";
    setScannerOpen(false);
    setScanLog("Arahkan QR ke kamera");
  }, []);

  const handleQrDetected = useCallback(async (qrValue: string) => {
    stopScanner();
    setScanStatus("loading");
    try {
      const shareId = parseShareIdFromInput(qrValue);
      if (!shareId) throw new Error("invalid share format");

      const res = await fetch(`/api/booth/frame-by-share/${encodeURIComponent(shareId)}`);
      if (!res.ok) throw new Error("frame not found");
      const data = await res.json();
      const frame = data.frame as FrameData;

      setExtraFrames((prev) =>
        prev.some((f) => f.id === frame.id) ? prev : [...prev, frame]
      );
      setSelectedId(frame.id);
      setScanStatus("idle");
    } catch {
      setScanStatus("error");
      setTimeout(() => setScanStatus("idle"), 3000);
    }
  }, [stopScanner]);

  const startScanner = useCallback(async () => {
    setScannerOpen(true);
    setScanStatus("scanning");
    setScanLog("Membuka kamera...");
    setManualInput("");

    // ── Load jsQR library (shared by both browser-cam and Canon MJPEG) ─────
    let jsQRFn: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null = null;
    let nativeDetector: { detect: (img: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> } | null = null;

    const useNative = "BarcodeDetector" in window;
    if (useNative) {
      nativeDetector = new (window as unknown as {
        BarcodeDetector: new (opts: { formats: string[] }) => { detect: (img: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> };
      }).BarcodeDetector({ formats: ["qr_code"] });
    } else {
      jsQRFn = (await import("jsqr")).default;
    }

    const canvas = document.createElement("canvas");
    const ctx    = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

    // Shared QR detection helper
    const detectQr = async (source: HTMLVideoElement | HTMLImageElement): Promise<string | null> => {
      if (!ctx || (source instanceof HTMLVideoElement && source.readyState < 2)) return null;
      if (source instanceof HTMLVideoElement && source.videoWidth === 0) return null;

      const scale = Math.min(1, 640 / (source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth));
      canvas.width  = Math.round((source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth)  * scale);
      canvas.height = Math.round((source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight) * scale);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      try {
        if (nativeDetector) {
          const results = await nativeDetector.detect(canvas);
          return results.length > 0 ? results[0].rawValue : null;
        } else if (jsQRFn) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQRFn(imageData.data, canvas.width, canvas.height);
          return code ? code.data : null;
        }
      } catch { /* ignore single-frame errors */ }
      return null;
    };

    // ── Try Canon MJPEG stream first (when DSLR is selected) ──────────────
    const captureSource = typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("booth_camera_source") ?? "auto"
      : "auto";

    if (captureSource === "dslr") {
      // Discover agent base — same logic as CameraScreen:
      // 1. Try IPC Electron app first
      // 2. Fallback to direct HTTP discovery (same origin allows HTTP for 127.0.0.1)
      setScanLog("Menghubungi Canon...");

      let canonUrl: string | null = null;

      try {
        // ── Option 1: IPC Electron app (booth-windows-app) ──────────────────
        const useIpc = typeof window !== "undefined" && Boolean(window.fremioBooth?.agentStatus);

          && !window.location.hostname.includes("fremio.id");

        if (useIpc) {
          try {
            const ipcStatus = await window.fremioBooth!.agentStatus!();
            if (ipcStatus?.ok) {
              canonUrl = "http://127.0.0.1:3002/preview-stream?t=" + Date.now();
            }
          } catch { /* fall through to HTTP fallback */ }
        }

        // ── Option 2: Direct HTTP discovery (CameraScreen candidates) ───────
        if (!canonUrl) {
          const candidates = [
            "http://127.0.0.1:3002",
            "http://localhost:3002",
          ];
          for (const base of candidates) {
            try {
              const res = await fetch(`${base}/status`, {
                signal: AbortSignal.timeout(2500),
              });
              if (res.ok) {
                canonUrl = `${base}/preview-stream?t=${Date.now()}`;
                break;
              }
            } catch { /* try next candidate */ }
          }
        }

        // ── Option 3: stored sessionStorage agent base (if set by CameraScreen) ──
        if (!canonUrl) {
          const saved = typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem("booth_agent_base")
            : null;
          if (saved) {
            try {
              const res = await fetch(`${saved}/status`, {
                signal: AbortSignal.timeout(2500),
              });
              if (res.ok) {
                canonUrl = `${saved}/preview-stream?t=${Date.now()}`;
              }
            } catch { /* try next */ }
          }
        }

        if (!canonUrl) throw new Error("agent not found");

        // Use video element for Canon MJPEG stream — gives reliable videoWidth/videoHeight
        const canon = canonVideoRef.current;
        if (!canon) return;

        canon.src = canonUrl;
        canon.play().catch(() => {});
        canon.onloadedmetadata = () => setScanLog("Arahkan QR ke kamera");

        const tick = () => {
          const el = canonVideoRef.current;
          if (!el || el.readyState < 2 || el.videoWidth === 0) {
            rafRef.current = window.setTimeout(tick, 200) as unknown as number;
            return;
          }

          detectQr(el).then((rawValue) => {
            if (rawValue) {
              setScanLog("Kode terdeteksi ✓");
              void handleQrDetected(rawValue);
              return;
            }
            rafRef.current = window.setTimeout(tick, 200) as unknown as number;
          });
        };
        rafRef.current = window.setTimeout(tick, 500) as unknown as number;
        return; // Don't use getUserMedia in DSLR mode
      } catch (err) {
        console.warn("[scanner] Canon MJPEG failed, falling back to browser camera:", err);
        setScanLog("Canon tidak terhubung — fallback ke webcam");
        // Fall through to browser camera below
      }
    }

    // ── Browser camera (webcam mode) ────────────────────────────────────────
    try {
      let videoConstraints: MediaTrackConstraints;
      if (cameraDeviceId) {
        videoConstraints = { deviceId: { exact: cameraDeviceId }, facingMode: { ideal: "environment" }, width: { ideal: 1280 } };
      } else {
        videoConstraints = { facingMode: { ideal: "environment" }, width: { ideal: 1280 } };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanLog("Arahkan QR ke kamera");

      const tick = () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        detectQr(video).then((rawValue) => {
          if (rawValue) {
            setScanLog("Kode terdeteksi ✓");
            void handleQrDetected(rawValue);
            return;
          }
          rafRef.current = window.setTimeout(tick, 300) as unknown as number;
        });
      };
      rafRef.current = window.setTimeout(tick, 300) as unknown as number;
    } catch (err) {
      console.error("[scanner] error:", err);
      setScanLog("Gagal membuka kamera");
      setScanStatus("error");
      setTimeout(() => setScanStatus("idle"), 4000);
    }
  }, [handleQrDetected, stopScanner]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(rafRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{
        backgroundColor: bgColor,
        flexDirection: isPortrait ? "column" : "row",
        gap: 12,
        padding: 12,
      }}
    >
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute rounded-full p-3 active:scale-95 transition-transform shadow-lg z-50"
          style={{
            left: "2%",
            top: "2%",
            backgroundColor: "rgba(0,0,0,0.2)",
            color: textPrimary,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
      )}
      {/* ─── PORTRAIT: Kategori horizontal scroll strip ─── */}
      {isPortrait && (
        <div className="shrink-0 flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
          {categories.map(({ name, rep }) => {
            const isActive = selectedCategory === name;
            return (
              <button
                key={name}
                onClick={() => setSelectedCategory(name)}
                className="shrink-0 flex flex-col items-center rounded-xl overflow-hidden active:scale-95 transition-transform"
                style={{
                  width: 72,
                  outline: isActive ? `2.5px solid ${accentColor}` : "2.5px solid transparent",
                  outlineOffset: 2,
                }}
              >
                <div style={{ width: 72, height: 96, overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={rep.thumbnailUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <p className="text-[10px] font-semibold text-center w-full px-1 py-0.5 leading-tight line-clamp-1"
                  style={{ color: textPrimary, backgroundColor: "rgba(255,255,255,0.10)" }}>
                  {name}
                </p>
              </button>
            );
          })}
          {/* Tombol Scan QR — portrait */}
          <button
            onClick={startScanner}
            disabled={scanStatus === "loading" || scanStatus === "scanning"}
            className="shrink-0 flex flex-col items-center justify-center rounded-xl overflow-hidden active:scale-95 transition-transform disabled:opacity-40"
            style={{ width: 72, height: 108, backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            {scanStatus === "loading" ? (
              <svg className="animate-spin h-5 w-5 mb-1" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="2" height="2" />
                <rect x="17" y="14" width="4" height="2" /><rect x="14" y="17" width="2" height="4" />
                <rect x="17" y="17" width="4" height="4" />
              </svg>
            )}
            <p className="text-[10px] font-semibold text-center px-1 leading-tight"
              style={{ color: "rgba(255,255,255,0.8)" }}>
              {scanStatus === "loading" ? "Memuat..." : scanStatus === "error" ? "Gagal ✕" : "Scan QR"}
            </p>
          </button>
        </div>
      )}

      {/* ─── LANDSCAPE: Kategori vertical panel ─── */}
      {!isPortrait && (
        <div
          className="w-44 shrink-0 flex flex-col rounded-2xl overflow-hidden"
          style={{ backgroundColor: panelColor ?? "rgba(255,255,255,0.12)" }}
        >
          {/* Header */}
          <div className="shrink-0 px-3 pt-3 pb-2">
            <p className="font-bold text-sm leading-tight" style={{ color: panelColor ? panelTP : textPrimary }}>Pilih Kategori</p>
            <p className="text-[10px] mt-0.5" style={{ color: panelColor ? panelTS : textSecondary }}>Klik Icon untuk memilih</p>
          </div>

          {/* Category list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
            {categories.length === 0 ? (
              <p className="text-[10px] text-center mt-4" style={{ color: textSecondary }}>Tidak ada frame</p>
            ) : (
              categories.map(({ name, rep }) => {
                const isActive = selectedCategory === name;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedCategory(name)}
                    className="relative rounded-xl overflow-hidden text-left active:scale-95 transition-transform w-full"
                    style={{
                      outline:       isActive ? `2.5px solid ${accentColor}` : "2.5px solid transparent",
                      outlineOffset: "2px",
                    }}
                  >
                    {/* Thumbnail kategori — pakai frame pertama */}
                    <div className="w-full" style={{ aspectRatio: "2 / 3" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={rep.thumbnailUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Gradient overlay + nama */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent flex flex-col justify-end p-2">
                      <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2">{name}</p>
                    </div>

                    {/* Checkmark aktif */}
                    {isActive && (
                      <span
                        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center text-xs font-black shadow-lg"
                        style={{ backgroundColor: accentColor, color: primaryColor }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            )}

            {/* Tombol scan QR */}
            <button
              onClick={startScanner}
              disabled={scanStatus === "loading" || scanStatus === "scanning"}
              className="w-full mt-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl
                         text-[11px] font-bold active:scale-95 transition-all disabled:opacity-40"
              style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}
            >
              {scanStatus === "loading" ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="2" height="2" />
                  <rect x="17" y="14" width="4" height="2" /><rect x="14" y="17" width="2" height="4" />
                  <rect x="17" y="17" width="4" height="4" />
                </svg>
              )}
              {scanStatus === "loading" ? "Memuat..."
                : scanStatus === "error" ? "Gagal ✕"
                : "Scan QR"}
            </button>
          </div>
        </div>
      )}

      {/* ─── TENGAH: Pilih Frame ──────────────────────────────────────────── */}
      <div
        className="flex-1 min-w-0 flex flex-col rounded-2xl overflow-hidden"
        style={{ backgroundColor: panelColor ?? "rgba(0,0,0,0.35)" }}
      >
        {/* Header */}
        <div className="shrink-0 px-3 pt-3 pb-2">
          <p className="font-bold text-sm" style={{ color: panelColor ? panelTP : textPrimary }}>
            {(booth.welcomeScreenPrefs as Record<string, unknown> | null)?.frameSelectHeaderText as string | undefined ?? "Pilih Frame"}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: panelColor ? panelTS : textSecondary }}>{selectedCategory ?? "Semua frame"}</p>
        </div>

        {/* Frame grid */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filteredFrames.length === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center">
              <div className="text-4xl mb-2 opacity-30">🖼️</div>
              <p className="font-semibold" style={{ color: textPrimary }}>Tidak ada frame</p>
              <p className="text-xs" style={{ color: textSecondary }}>di kategori ini</p>
            </div>
          ) : (
            <div className={`grid gap-1.5 ${isPortrait ? "grid-cols-3" : "grid-cols-6"}`}>
              {filteredFrames.map((frame) => {
                const isSelected = selectedId === frame.id;
                const cw = frame.canvasWidth  || 1080;
                const ch = frame.canvasHeight || 1920;

                return (
                  <button
                    key={frame.id}
                    onClick={() => handleSelectFrame(frame)}
                    className="relative flex flex-col items-stretch rounded-xl overflow-hidden
                               active:scale-95 transition-transform duration-100 text-left"
                    style={{
                      outline:       isSelected ? `2.5px solid ${accentColor}` : "2.5px solid transparent",
                      outlineOffset: "2px",
                    }}
                  >
                    <div
                      className="w-full bg-white/10 overflow-hidden rounded-xl"
                      style={{ aspectRatio: `${cw} / ${ch}` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={frame.thumbnailUrl}
                        alt={frame.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>

                    <p className="text-[10px] text-center font-medium mt-1 mb-0.5
                                  px-0.5 leading-tight line-clamp-2" style={{ color: textPrimary }}>
                      {frame.name}
                    </p>

                    {isSelected && (
                      <span
                        className="absolute top-1 left-1 h-5 w-5 rounded-full flex items-center
                                   justify-center text-[10px] font-black"
                        style={{ backgroundColor: accentColor, color: primaryColor }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── KANAN: Preview frame terpilih (landscape only) ─── */}
      {!isPortrait && (
        <div
          className="w-80 shrink-0 flex flex-col rounded-2xl overflow-hidden"
          style={{ backgroundColor: panelColor ?? "rgba(255,255,255,0.10)" }}
        >
        {/* Area preview */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          {selectedFrame ? (
            <div className="w-full h-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedFrame.thumbnailUrl}
                alt={selectedFrame.name}
                className="max-w-full max-h-full object-contain rounded-2xl"
                style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              {/* Placeholder dua frame bertumpuk */}
              <div className="relative h-28 w-20">
                <div className="absolute top-2 left-2 w-16 h-24 rounded-xl bg-white/10" />
                <div className="absolute top-0 left-0 w-16 h-24 rounded-xl bg-white/20 border border-white/20" />
              </div>
              <p className="text-white/40 text-xs leading-tight">Pilih frame<br />untuk preview</p>
            </div>
          )}
        </div>

        {/* Bottom bar: nama + harga + tombol konfirmasi */}
        <div
          className="shrink-0 flex items-center gap-2 px-3 py-3 rounded-b-2xl"
          style={{ backgroundColor: panelColor ? panelColor : "rgba(0,0,0,0.3)", filter: panelColor ? "brightness(0.80)" : undefined }}
        >
          {/* Icon frame */}
          <div className="shrink-0 relative h-8 w-6">
            <div className="absolute bottom-0 left-0 w-5 h-6 rounded-md bg-white/20" />
            <div className="absolute bottom-1 left-1 w-5 h-6 rounded-md bg-white/35 border border-white/30" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight truncate" style={{ color: panelColor ? panelTP : textPrimary }}>
              {selectedFrame ? selectedFrame.name : "Belum dipilih"}
            </p>
            {selectedFrame && (
              <p className="text-[11px] mt-0.5" style={{ color: panelColor ? panelTS : textSecondary }}>
                Rp {booth.pricePerSession.toLocaleString("id-ID")}
              </p>
            )}
          </div>

          <button
            onClick={() => selectedFrame && onSelect(selectedFrame)}
            disabled={!selectedFrame}
            className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center
                       text-base font-black active:scale-95 transition-transform disabled:opacity-30"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            →
          </button>
        </div>
      </div>
      )} {/* end !isPortrait right panel */}

      {/* ─── PORTRAIT: Bottom bar konfirmasi ─── */}
      {isPortrait && (
        <div
          className="shrink-0 flex items-center gap-3 px-3 py-3 rounded-2xl"
          style={{ backgroundColor: panelColor ?? "rgba(0,0,0,0.3)" }}
        >
          {selectedFrame && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedFrame.thumbnailUrl} alt="" className="h-14 w-auto rounded-lg object-contain"
              style={{ maxWidth: 40 }} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate" style={{ color: textPrimary }}>
              {selectedFrame ? selectedFrame.name : "Pilih frame di atas"}
            </p>
            {selectedFrame && (
              <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                Rp {booth.pricePerSession.toLocaleString("id-ID")}
              </p>
            )}
          </div>
          <button
            onClick={() => selectedFrame && onSelect(selectedFrame)}
            disabled={!selectedFrame}
            className="shrink-0 px-5 py-3 rounded-2xl text-sm font-black active:scale-95 transition-transform disabled:opacity-30"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            Pilih →
          </button>
        </div>
      )}

      {/* ─── QR Scanner overlay ──────────────────────────────────────────── */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/92">
          <button
            onClick={stopScanner}
            className="absolute top-5 right-5 text-white/70 hover:text-white text-sm font-bold
                       px-3 py-1.5 rounded-xl bg-white/10 active:scale-95 transition-all"
          >
            ✕ Tutup
          </button>

          <p className="text-white/50 text-xs mb-4 tracking-wide">Arahkan kamera ke QR Code</p>
          {/* Show separate video element for Canon MJPEG stream; videoRef for browser camera */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          {scannerOpen && (() => {
            const src = typeof sessionStorage !== "undefined"
              ? sessionStorage.getItem("booth_camera_source") ?? "auto"
              : "auto";
            return src === "dslr" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                ref={canonVideoRef}
                className="w-full max-w-sm rounded-2xl bg-black/50 object-cover"
                style={{ transform: "scaleX(-1)", maxHeight: "45vh" }}
                playsInline
                muted
                alt="Canon preview"
              />
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                ref={videoRef}
                className="w-full max-w-sm rounded-2xl bg-black/50"
                playsInline
                muted
                style={{ transform: "scaleX(-1)" }}
              />
            );
          })()}

          <div className="mt-4 flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full animate-pulse ${scanStatus === "loading" ? "bg-yellow-400" : "bg-red-400"}`} />
            <p className="text-white/60 text-xs">{scanLog}</p>
          </div>

          <div className="mt-5 w-full max-w-sm px-4">
            <p className="text-white/30 text-xs text-center mb-2">Atau tempel link share di sini:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="https://fremio.id/take-moment?share=..."
                className="flex-1 px-3 py-2 rounded-xl text-xs bg-white/10 text-white placeholder-white/30 border border-white/20 outline-none"
              />
              <button
                onClick={() => {
                  if (manualInput.trim()) {
                    stopScanner();
                    setScanStatus("loading");
                    handleQrDetected(manualInput.trim()).catch(() => setScanStatus("error"));
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white/20 text-white active:scale-95 transition-all"
              >
                Muat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
