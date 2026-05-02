"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, FrameData } from "../types";

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
  booth:    BoothConfigData;
  frames:   FrameData[];
  onSelect: (frame: FrameData) => void;
}

/**
 * FRAME SELECT SCREEN — Grid thumbnail frame pilihan customer.
 * Tap untuk preview, tap lagi atau tekan "Pilih" untuk konfirmasi.
 * Hanya menampilkan frame dengan assetUrl nyata (id fremio_ atau assetUrl valid).
 */
export function FrameSelectScreen({ booth, frames, onSelect }: FrameSelectScreenProps) {
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

  const videoRef  = useRef<HTMLVideoElement>(null);
  const rafRef    = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

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
    setScannerOpen(false);
    setScanLog("Arahkan QR ke kamera");
  }, []);

  const handleQrDetected = useCallback(async (qrValue: string) => {
    stopScanner();
    setScanStatus("loading");
    try {
      const url = new URL(qrValue);
      const shareId = url.searchParams.get("share");
      if (!shareId) throw new Error("no share param");

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanLog("Arahkan QR ke kamera");

      // Pre-load jsQR once
      const useNative = "BarcodeDetector" in window;
      type NativeDetector = { detect: (img: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> };
      let nativeDetector: NativeDetector | null = null;
      let jsQRFn: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null = null;

      if (useNative) {
        nativeDetector = new (window as unknown as {
          BarcodeDetector: new (opts: { formats: string[] }) => NativeDetector;
        }).BarcodeDetector({ formats: ["qr_code"] });
      } else {
        jsQRFn = (await import("jsqr")).default;
      }

      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d");

      const tick = async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        if (video.readyState >= 2 && ctx && video.videoWidth > 0) {
          // Downscale to max 640px wide for jsQR performance
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width  = Math.round(video.videoWidth  * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            let rawValue: string | null = null;
            if (nativeDetector) {
              const results = await nativeDetector.detect(canvas);
              if (results.length > 0) rawValue = results[0].rawValue;
            } else if (jsQRFn) {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQRFn(imageData.data, canvas.width, canvas.height);
              if (code) rawValue = code.data;
            }
            if (rawValue) {
              setScanLog(`Kode terdeteksi ✓`);
              await handleQrDetected(rawValue);
              return;
            }
          } catch { /* ignore single-frame errors */ }
        }
        // Use setTimeout so we don't hammer the CPU — scan every 300ms
        rafRef.current = window.setTimeout(tick, 300) as unknown as number;
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
            <div className="flex flex-col items-center justify-center h-32 gap-1">
              <p className="text-sm" style={{ color: textSecondary }}>Tidak ada frame</p>
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
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="w-full max-w-sm rounded-2xl bg-black/50"
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
          />

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
