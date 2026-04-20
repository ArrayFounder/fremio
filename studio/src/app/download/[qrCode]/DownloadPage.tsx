"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadData } from "@/app/api/download/[qrCode]/route";

interface Props {
  data: DownloadData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark helpers (canvas)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bake foto + watermark "fremio.id" ke canvas, return sebagai Blob JPEG.
 * Dipanggil hanya saat tombol download ditekan — tidak untuk render biasa.
 */
async function buildWatermarkedBlob(photoUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas  = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2D context tidak tersedia"));

      // Foto asli
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob gagal"))),
        "image/jpeg",
        0.93
      );
    };
    img.onerror = () => reject(new Error("Gagal memuat foto"));
    img.src = photoUrl;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Countdown to expiry
// ─────────────────────────────────────────────────────────────────────────────

function useCountdown(expiresAt: string) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);             // eslint-disable-line react-hooks/exhaustive-deps

  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return { secondsLeft, label, expired: secondsLeft <= 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function DownloadPage({ data }: Props) {
  const {
    photoUrl, videoUrl, operatorName, boothName, logoUrl,
    primaryColor, accentColor, expiresAt, completedAt,
  } = data;

  const { label: countdownLabel, expired: hasExpiredLive } = useCountdown(expiresAt);
  const isExpired = data.isExpired || hasExpiredLive;

  const downloadLinkRef  = useRef<HTMLAnchorElement>(null);
  const videoLinkRef     = useRef<HTMLAnchorElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareError, setShareError]       = useState<string | null>(null);

  // Format tanggal WITA/WIB dari completedAt
  const fmtDate = new Intl.DateTimeFormat("id-ID", {
    day:    "2-digit",
    month:  "long",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const sessionDate = fmtDate.format(new Date(completedAt));

  // ─── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const blob = await buildWatermarkedBlob(photoUrl);
      const url  = URL.createObjectURL(blob);
      const a    = downloadLinkRef.current!;
      a.href     = url;
      a.download = `foto-${boothName.replace(/\s+/g, "-").toLowerCase()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Gagal mengunduh foto");
    } finally {
      setIsDownloading(false);
    }
  }, [photoUrl, boothName]);

  // ─── Web Share API (untuk IG Stories & WhatsApp via share sheet) ─────────
  const handleNativeShare = useCallback(async () => {
    setShareError(null);
    try {
      const blob = await buildWatermarkedBlob(photoUrl);
      const file = new File([blob], "foto-fremio.jpg", { type: "image/jpeg" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Foto dari ${boothName}`,
          text:  `Foto saya dari ${boothName} oleh ${operatorName} • via fremio.id`,
        });
      } else {
        // Fallback: share URL saja
        await navigator.share({
          title: `Foto dari ${boothName}`,
          text:  `Foto saya dari ${boothName} oleh ${operatorName}`,
          url:   window.location.href,
        });
      }
    } catch (err) {
      // AbortError = user batalkan — bukan error
      if (err instanceof Error && err.name !== "AbortError") {
        setShareError("Gagal membuka share. Coba simpan foto dulu lalu upload manual.");
      }
    }
  }, [photoUrl, boothName, operatorName]);

  // ─── Download video ───────────────────────────────────────────────────────
  const handleDownloadVideo = useCallback(async () => {
    if (!videoUrl) return;
    setIsDownloadingVideo(true);
    try {
      const res  = await fetch(videoUrl);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = videoLinkRef.current!;
      a.href     = url;
      const videoExt = videoUrl?.endsWith(".mp4") ? "mp4" : "webm";
      a.download = `video-${boothName.replace(/\s+/g, "-").toLowerCase()}.${videoExt}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadError("Gagal mengunduh video");
    } finally {
      setIsDownloadingVideo(false);
    }
  }, [videoUrl, boothName]);

  // ─── WhatsApp link ────────────────────────────────────────────────────────
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Foto saya dari ${boothName} oleh ${operatorName} 📸\n${window?.location?.href ?? ""}`
  )}`;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pb-16">
      {/* Hidden anchors untuk trigger download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={downloadLinkRef} className="hidden" aria-hidden />
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={videoLinkRef} className="hidden" aria-hidden />

      {/* ── Header operator ── */}
      <header
        className="w-full flex items-center gap-3 px-5 py-4 shadow-sm"
        style={{ backgroundColor: primaryColor }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={operatorName} className="h-9 w-auto object-contain" />
        ) : (
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-lg font-black shrink-0"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            {operatorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base leading-tight truncate">{boothName}</p>
          <p className="text-white/60 text-xs truncate">{operatorName}</p>
        </div>
        {/* Fremio badge */}
        <span className="shrink-0 text-white/40 text-xs">via fremio.id</span>
      </header>

      {/* ── Expired state ── */}
      {isExpired ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="text-5xl mb-5">⏳</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Link Sudah Kedaluwarsa</h2>
          <p className="text-gray-500 text-sm max-w-xs">
            Link download aktif selama 24 jam. Hubungi operator booth untuk mendapatkan foto ulang.
          </p>
        </div>
      ) : (
        <>
          {/* ── Foto + watermark display ── */}
          <div className="w-full max-w-sm mx-auto mt-6 px-4">
            <div className="relative rounded-2xl overflow-hidden shadow-xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Foto kamu"
                className="w-full h-auto object-contain"
                loading="eager"
              />
            </div>

            {/* Tanggal sesi */}
            <p className="text-center text-gray-400 text-xs mt-2">{sessionDate}</p>
          </div>

          {/* ── Live Mode video ── */}
          {videoUrl && (
            <div className="w-full max-w-sm mx-auto mt-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🎬</span>
                <p className="text-sm font-semibold text-gray-700">Video Live Mode</p>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ backgroundColor: accentColor + "22", color: accentColor !== "#d4a017" ? accentColor : "#0a1a4a" }}
                >
                  BARU
                </span>
              </div>
              <div className="rounded-2xl overflow-hidden shadow-lg bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full max-h-72 object-contain"
                />
              </div>
              <button
                onClick={handleDownloadVideo}
                disabled={isDownloadingVideo}
                className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold text-gray-600
                           border border-gray-300 bg-white active:bg-gray-50 transition-colors
                           flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDownloadingVideo ? (
                  <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  "⬇️"
                )}
                {isDownloadingVideo ? "Mengunduh…" : "Simpan Video"}
              </button>
            </div>
          )}

          {/* ── Countdown ── */}
          <div className="mt-5 flex flex-col items-center gap-1">
            <p className="text-gray-400 text-xs uppercase tracking-wider">Link aktif selama</p>
            <p
              className="text-2xl font-black tabular-nums"
              style={{ color: accentColor !== "#d4a017" ? accentColor : "#0a1a4a" }}
            >
              {countdownLabel}
            </p>
          </div>

          {/* ── Error messages ── */}
          {(downloadError || shareError) && (
            <div className="mx-4 mt-3 max-w-sm w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-red-600 text-sm">{downloadError ?? shareError}</p>
            </div>
          )}

          {/* ── CTA buttons ── */}
          <div className="mt-6 px-4 w-full max-w-sm flex flex-col gap-3">
            {/* Download */}
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              style={{
                backgroundColor: isDownloading ? `${accentColor}88` : accentColor,
                color: primaryColor,
              }}
              className="w-full py-4 rounded-2xl text-lg font-black
                         active:scale-95 transition-transform disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 rounded-full border-4 border-current border-t-transparent animate-spin" />
                  Menyiapkan…
                </span>
              ) : (
                "⬇️  Simpan ke HP"
              )}
            </button>

            {/* Native share (Web Share API — WhatsApp, IG Stories, dll via share sheet) */}
            {"share" in navigator ? (
              <button
                onClick={handleNativeShare}
                className="w-full py-4 rounded-2xl text-lg font-semibold text-gray-700
                           border-2 border-gray-300 bg-white active:bg-gray-50
                           transition-colors flex items-center justify-center gap-2"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Bagikan Foto
              </button>
            ) : (
              /* Fallback desktop — WhatsApp link */
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 rounded-2xl text-lg font-semibold text-white
                           bg-[#25D366] active:opacity-80 transition-opacity
                           flex items-center justify-center gap-2"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.058 23.547a.5.5 0 00.609.61l5.753-1.485A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.694-.498-5.25-1.371l-.374-.216-3.882 1L3.416 17.5l-.23-.388A10 10 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
                Kirim via WhatsApp
              </a>
            )}

            {/* Instagram Stories hint — instruksi simpel */}
            <div className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">📸</span>
              <div>
                <p className="text-sm font-semibold text-gray-700">Share ke Instagram Stories</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Simpan foto ke HP → buka Instagram → buat Stories → pilih foto dari galeri.
                </p>
              </div>
            </div>
          </div>

          {/* ── Footer fremio branding ── */}
          <div className="mt-10 text-center">
            <p className="text-xs text-gray-300">
              Powered by{" "}
              <a
                href="https://fremio.id"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-gray-400 hover:text-gray-600 transition-colors"
              >
                fremio.id
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
