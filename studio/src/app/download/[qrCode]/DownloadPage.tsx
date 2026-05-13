"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadData } from "@/app/api/download/[qrCode]/route";

interface Props {
  data: DownloadData;
}

interface UpgradeResponse {
  qrCode: string;
  expiresAt: string;
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
    setSecondsLeft(
      Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    );
  }, [expiresAt]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

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
    qrCode,
    photoUrl,
    videoUrl,
    gifUrl,
    rawPhotoUrls,
    operatorName,
    boothName,
    logoUrl,
    primaryColor,
    accentColor,
    expiresAt,
    completedAt,
    isTrial,
    canUpgrade,
    socialCtaText,
    instagramUrl,
    tiktokUrl,
  } = data;

  const [effectiveExpiresAt, setEffectiveExpiresAt] = useState(expiresAt);
  const [upgradeStatus, setUpgradeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const { label: countdownLabel, expired: hasExpiredLive } = useCountdown(effectiveExpiresAt);
  const isExpired = hasExpiredLive;

  const downloadLinkRef  = useRef<HTMLAnchorElement>(null);
  const videoLinkRef     = useRef<HTMLAnchorElement>(null);
  const gifLinkRef       = useRef<HTMLAnchorElement>(null);
  const rawLinkRef       = useRef<HTMLAnchorElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [isDownloadingGif, setIsDownloadingGif] = useState(false);
  const [downloadingRawIndex, setDownloadingRawIndex] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareError, setShareError]       = useState<string | null>(null);

  useEffect(() => {
    setEffectiveExpiresAt(expiresAt);
  }, [expiresAt]);


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
      a.download = `video-${boothName.replace(/\s+/g, "-").toLowerCase()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadError("Gagal mengunduh video");
    } finally {
      setIsDownloadingVideo(false);
    }
  }, [videoUrl, boothName]);

  // ─── Download GIF ─────────────────────────────────────────────────────────
  const handleDownloadGif = useCallback(async () => {
    if (!gifUrl) return;
    setIsDownloadingGif(true);
    try {
      const res  = await fetch(gifUrl);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = gifLinkRef.current!;
      a.href     = url;
      a.download = `slideshow-${boothName.replace(/\s+/g, "-").toLowerCase()}.gif`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadError("Gagal mengunduh GIF");
    } finally {
      setIsDownloadingGif(false);
    }
  }, [gifUrl, boothName]);

  // ─── Download foto mentah (tanpa frame) ────────────────────────────────────
  const handleDownloadRaw = useCallback(async (url: string, index: number) => {
    setDownloadingRawIndex(index);
    setDownloadError(null);
    try {
      const blob    = await buildWatermarkedBlob(url);
      const objUrl  = URL.createObjectURL(blob);
      const a       = rawLinkRef.current!;
      a.href        = objUrl;
      a.download    = `foto-${index + 1}-${boothName.replace(/\s+/g, "-").toLowerCase()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Gagal mengunduh foto");
    } finally {
      setDownloadingRawIndex(null);
    }
  }, [boothName]);

  const handleUpgradeAccess = useCallback(async () => {
    setUpgradeStatus("loading");
    setShareError(null);

    try {
      const res = await fetch(`/api/download/${qrCode}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const body = await res.json() as
        | { success: true; data: UpgradeResponse }
        | { success: false; error?: string };

      if (!res.ok || !body.success) {
        throw new Error("Gagal mengaktifkan akses 24 jam");
      }

      setEffectiveExpiresAt(body.data.expiresAt);
      setUpgradeStatus("success");
    } catch (err) {
      setUpgradeStatus("error");
      setShareError(err instanceof Error ? err.message : "Gagal upgrade trial");
    }
  }, [qrCode]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pb-16">
      {/* Hidden anchors untuk trigger download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={downloadLinkRef} className="hidden" aria-hidden />
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={videoLinkRef} className="hidden" aria-hidden />
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={gifLinkRef} className="hidden" aria-hidden />
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={rawLinkRef} className="hidden" aria-hidden />

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
            {isTrial
              ? "Mode trial: link aktif 5 menit. Upgrade subscription untuk memperpanjang jadi 24 jam."
              : "Link download aktif selama 24 jam. Hubungi operator booth untuk mendapatkan foto ulang."}
          </p>

          {isTrial && canUpgrade && (
            <button
              onClick={handleUpgradeAccess}
              disabled={upgradeStatus === "loading"}
              className="mt-6 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {upgradeStatus === "loading"
                ? "Memproses Upgrade..."
                : "Upgrade Subscription • Aktifkan 24 Jam"}
            </button>
          )}

          {upgradeStatus === "success" && (
            <p className="mt-3 text-xs text-green-600 font-medium">
              Upgrade berhasil. Link sekarang aktif 24 jam.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ── Countdown (di paling atas) ── */}
          <div className="mt-5 flex flex-col items-center gap-1">
            <p className="text-gray-400 text-xs uppercase tracking-wider">Link aktif selama</p>
            <p
              className="text-2xl font-black tabular-nums"
              style={{ color: accentColor !== "#d4a017" ? accentColor : "#0a1a4a" }}
            >
              {countdownLabel}
            </p>
            <p className="text-[11px] font-semibold text-center px-4" style={{ color: isTrial ? "#d97706" : "#16a34a" }}>
              {isTrial
                ? "(Link trial aktif selama 5 menit, upgrade subscription untuk tingkatkan hingga 24 jam)"
                : "(Link PRO aktif selama 24 jam)"}
            </p>
          </div>

          {/* ── Framed Photos ── */}
          <div className="w-full max-w-sm mx-auto mt-6 px-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📸</span>
              <p className="text-sm font-semibold text-gray-700">Framed Photos</p>
            </div>
            <div className="relative rounded-2xl overflow-hidden shadow-xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Foto kamu"
                className="w-full h-auto object-contain"
                loading="eager"
              />
            </div>

            {/* Tombol download foto+frame (gaya sama seperti tombol lainnya) */}
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold text-gray-600
                         border border-gray-300 bg-white active:bg-gray-50 transition-colors
                         flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isDownloading ? (
                <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                "⬇️"
              )}
              {isDownloading ? "Mengunduh…" : "Simpan photo"}
            </button>
          </div>

          {/* ── GIF slideshow ── */}
          {gifUrl && (
            <div className="w-full max-w-sm mx-auto mt-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">�</span>
                <p className="text-sm font-semibold text-gray-700">Slideshow GIF</p>
              </div>
              <div className="rounded-2xl overflow-hidden shadow-lg bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gifUrl}
                  alt="Slideshow foto"
                  className="w-full h-auto object-contain"
                  loading="lazy"
                />
              </div>
              <button
                onClick={handleDownloadGif}
                disabled={isDownloadingGif}
                className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold text-gray-600
                           border border-gray-300 bg-white active:bg-gray-50 transition-colors
                           flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDownloadingGif ? (
                  <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  "⬇️"
                )}
                {isDownloadingGif ? "Mengunduh…" : "Simpan GIF"}
              </button>
            </div>
          )}

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

          {/* ── Error messages ── */}
          {(downloadError || shareError) && (
            <div className="mx-4 mt-3 max-w-sm w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-red-600 text-sm">{downloadError ?? shareError}</p>
            </div>
          )}

          {/* ── Foto Original (Tanpa Frame) ── */}
          {rawPhotoUrls && rawPhotoUrls.length > 0 && (
            <div className="w-full max-w-sm mx-auto mt-8 px-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📷</span>
                <p className="text-sm font-semibold text-gray-700">Foto Original (Tanpa Frame)</p>
              </div>
              <div className="flex flex-col gap-4">
                {rawPhotoUrls.map((url, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden shadow-lg bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Foto original ${i + 1}`}
                      className="w-full h-auto object-contain"
                      loading="lazy"
                    />
                    <button
                      onClick={() => handleDownloadRaw(url, i)}
                      disabled={downloadingRawIndex === i}
                      className="w-full py-2.5 text-sm font-semibold text-gray-600
                                 border-t border-gray-700 bg-white active:bg-gray-50 transition-colors
                                 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {downloadingRawIndex === i ? (
                        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        "⬇️"
                      )}
                      {downloadingRawIndex === i ? "Mengunduh…" : `Simpan Foto ${i + 1}`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Social Media Links ── */}
          {(instagramUrl || tiktokUrl) && (
            <div className="w-full max-w-sm mx-auto mt-8 px-4">
              <p className="text-center text-sm font-semibold text-gray-700 mb-3">
                {socialCtaText}
              </p>
              <div className="flex justify-center gap-4">
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 hover:opacity-90 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/instagram.png"
                      alt="Instagram"
                      className="w-6 h-6"
                    />
                  </a>
                )}
                {tiktokUrl && (
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-12 h-12 rounded-full bg-black hover:opacity-90 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/tiktok.png"
                      alt="TikTok"
                      className="w-6 h-6"
                    />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Footer fremio branding ── */}
          <div className="mt-10 text-center">
            <p className="text-xs text-gray-300 mb-1">Powered by</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fremio_studio.png"
              alt="Fremio Studio"
              className="h-8 w-auto mx-auto opacity-60 hover:opacity-80 transition-opacity"
            />
          </div>
        </>
      )}
    </div>
  );
}
