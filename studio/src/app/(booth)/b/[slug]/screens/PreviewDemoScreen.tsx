"use client";

import { useEffect, useRef, useState } from "react";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData, FrameData } from "../types";

// ── Filter presets (sama dengan PreviewScreen) ────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────

interface PreviewDemoScreenProps {
  booth: BoothConfigData;
  frame: FrameData;
}

/**
 * Demo version of PreviewScreen — tampil di preview mode booth dashboard.
 * Menampilkan live camera stream di setiap slot foto frame, dengan filter strip.
 */
export function PreviewDemoScreen({ booth, frame }: PreviewDemoScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);

  const [activeFilter, setActiveFilter] = useState("Original");
  const [cameraError, setCameraError]   = useState<string | null>(null);

  const streamRef  = useRef<MediaStream | null>(null);
  const videoRefs  = useRef<(HTMLVideoElement | null)[]>([]);

  const slots    = frame.slots ?? [];
  const cw       = frame.canvasWidth  || 1080;
  const ch       = frame.canvasHeight || 1920;

  const filterPreset = FILTER_PRESETS.find((p) => p.name === activeFilter) ?? FILTER_PRESETS[0];
  const filterCss    = getFilterCss(filterPreset.filters);

  // ── Attach stream ke video element saat tersedia ──────────────────────────
  function attachStream(el: HTMLVideoElement | null, stream: MediaStream | null) {
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch(() => { /* autoplay block, fine */ });
  }

  // ── Minta akses kamera ────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Browser tidak mendukung kamera");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        videoRefs.current.forEach((el) => attachStream(el, stream));
      })
      .catch((err) => {
        setCameraError(err?.message ?? "Kamera tidak tersedia");
      });
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Apakah frame punya slot data? ─────────────────────────────────────────
  const hasSlots = slots.length > 0;

  return (
    <div
      className="flex flex-col h-full items-center justify-between py-6 px-4 select-none"
      style={{ backgroundColor: primaryColor }}
    >
      {/* Header */}
      <div className="shrink-0 text-center">
        <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>Preview Foto</h2>
        <p className="text-sm mt-1" style={{ color: textSecondary }}>
          {cameraError ? "📷 Demo mode" : "🎥 Live preview"}
        </p>
      </div>

      {/* Frame container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden w-full my-2">
        {hasSlots ? (
          /* ── Frame dengan slot yang jelas → tampilkan video di setiap slot ── */
          <div
            className="relative overflow-hidden rounded-2xl shadow-2xl"
            style={{
              aspectRatio:     `${cw} / ${ch}`,
              maxHeight:       "calc(100vh - 20rem)",
              backgroundColor: frame.backgroundColor || "#ffffff",
            }}
          >
            {/* Video stream di setiap slot */}
            {slots.map((slot, i) => (
              <div
                key={i}
                className="absolute overflow-hidden"
                style={{
                  top:          `${slot.top    * 100}%`,
                  left:         `${slot.left   * 100}%`,
                  width:        `${slot.width  * 100}%`,
                  height:       `${slot.height * 100}%`,
                  borderRadius: slot.borderRadius ?? 0,
                  transform:    slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                  zIndex:       slot.zIndex ?? (i + 1),
                }}
              >
                {cameraError ? (
                  /* Fallback: kotak abu-abu dengan ikon kamera */
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
                  >
                    <span className="text-2xl opacity-60">📷</span>
                  </div>
                ) : (
                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el;
                      attachStream(el, streamRef.current);
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{
                      filter:    filterCss,
                      transform: "scaleX(-1)", // mirror seperti kamera selfie
                      transition: "filter 0.3s ease",
                    }}
                  />
                )}
              </div>
            ))}

            {/* Frame overlay (PNG dekorasi di atas foto) */}
            {frame.overlayUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frame.overlayUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ zIndex: 20 }}
              />
            )}
          </div>
        ) : (
          /* ── Tidak ada slot data → tampilkan preview statis frame ── */
          <div className="relative overflow-hidden rounded-2xl shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frame.thumbnailUrl || frame.assetUrl}
              alt={frame.name}
              className="block w-auto"
              style={{ maxHeight: "calc(100vh - 20rem)", maxWidth: "100%" }}
            />
            {/* Overlay kamera kecil */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.35)" }}
            >
              <p className="text-white text-sm font-medium">📷 Preview</p>
            </div>
          </div>
        )}
      </div>

      {/* Filter strip */}
      <div className="shrink-0 w-full py-2">
        <div className="flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
          {FILTER_PRESETS.map((preset) => {
            const isActive = activeFilter === preset.name;
            return (
              <button
                key={preset.name}
                onClick={() => setActiveFilter(preset.name)}
                className="flex-shrink-0 flex flex-col items-center gap-1 transition-all active:scale-95"
              >
                <div
                  className="rounded-xl shadow-md"
                  style={{
                    width:   56,
                    height:  56,
                    background: preset.color,
                    outline: isActive ? `3px solid ${accentColor}` : "none",
                    outlineOffset: 2,
                  }}
                />
                <span
                  className="text-xs whitespace-nowrap"
                  style={{ color: isActive ? accentColor : textSecondary, fontWeight: isActive ? 700 : 400 }}
                >
                  {preset.icon}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action buttons (disabled di demo mode) */}
      <div className="shrink-0 flex w-full gap-3 mt-2">
        <button
          disabled
          className="flex-1 py-3 rounded-2xl font-bold text-sm opacity-40"
          style={{ backgroundColor: surfaceBg, color: textPrimary, border: `1px solid ${surfaceBorder}` }}
        >
          Ulangi
        </button>
        <button
          disabled
          className="flex-1 py-3 rounded-2xl font-bold text-sm opacity-40"
          style={{ backgroundColor: accentColor, color: "#fff" }}
        >
          Simpan Foto
        </button>
      </div>
    </div>
  );
}
