"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCamera } from "../hooks/useCamera";
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

interface LivePreviewCanvasProps {
  stream:         MediaStream | null;
  mirror:         boolean;
  frame:          FrameData;
  capturedPhotos: string[];
  isDuplicate:    boolean;
  allPhotosDone:  boolean;
}

function LivePreviewCanvas({ stream, mirror, frame, capturedPhotos, isDuplicate, allPhotosDone }: LivePreviewCanvasProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const hiddenVidRef = useRef<HTMLVideoElement>(null);
  const photoImgsRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const rafRef       = useRef<number>(0);

  const cw    = frame.canvasWidth  || 1080;
  const ch    = frame.canvasHeight || 1920;
  const slots = useMemo(() => frame.slots ?? [], [frame.slots]);
  const n     = slots.length;

  // Attach stream to hidden video
  useEffect(() => {
    const v = hiddenVidRef.current;
    if (v) v.srcObject = stream;
  }, [stream]);

  // Load captured photo images when new photos arrive
  useEffect(() => {
    capturedPhotos.forEach((url, i) => {
      if (!photoImgsRef.current.has(i) && url) {
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

      // 2. Each slot: captured photo OR live video
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
        const x = slot.left   * cw;
        const y = slot.top    * ch;
        const w = slot.width  * cw;
        const h = slot.height * ch;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        if (captureIdx < capturedPhotos.length) {
          // Tampilkan foto yang sudah diambil
          const img = photoImgsRef.current.get(captureIdx);
          if (img?.complete && img.naturalWidth) drawCoverToCanvas(ctx, img, x, y, w, h);
        } else if (!allPhotosDone && captureIdx === capturedPhotos.length) {
          // Tampilkan live stream HANYA untuk pair yang sedang akan diambil.
          // Slot dengan captureIdx > capturedPhotos.length (pair berikutnya) tetap blank/putih.
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

      // Tidak ada overlay di canvas — overlay ditampilkan sebagai <img> di atas
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, cw, ch, frame.backgroundColor, slots, isDuplicate, n, capturedPhotos.length, mirror, allPhotosDone]);

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
      {/* Overlay PNG: bintang, border, dekorasi frame — pakai objectFit:fill
          agar tidak ada letterbox yang menyebabkan misalign dgn canvas. */}
      {frame.assetUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frame.assetUrl}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ objectFit: "fill", zIndex: 1 }}
        />
      )}
    </>
  );
}

export function CameraScreen({ booth, frame, photoIndex, capturedCount, capturedPhotos, allPhotosDone, retakeSlotIndex, onCapture, onVideoReady, onProceed, onRetakeSlot }: CameraScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, textTertiary } = getAdaptiveColors(primaryColor);
  const isPortrait = useIsPortrait();
  const isDuplicate = !!(frame.slots && frame.slots.length >= 2 && frame.slots.length % 2 === 0);
  const totalPhotos = isDuplicate
    ? frame.slots!.length / 2
    : (frame.slots && frame.slots.length > 0 ? frame.slots.length : (frame.maxCaptures || 1));
  const remaining = totalPhotos - capturedCount;

  // ── Device + mirror state (persisted in sessionStorage) ────────────────────────
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(() => {
    if (typeof sessionStorage === "undefined") return undefined;
    return sessionStorage.getItem("booth_camera_deviceId") ?? undefined;
  });
  const [mirror, setMirror] = useState(() => {
    if (typeof sessionStorage === "undefined") return true;
    return sessionStorage.getItem("booth_camera_mirror") !== "false";
  });
  const [showSettings, setShowSettings] = useState(false);

  const { videoRef, stream, isReady, permissionError, devices, start, stop, capture, startRecording, stopRecording } = useCamera({
    canvasWidth:  1920,
    canvasHeight: 1080,
    deviceId:     selectedDeviceId,
    mirror,
  });

  // ── Hitung zona aktif di viewfinder sesuai slot saat ini ──────────────────
  const slotOverlay = useMemo(() => {
    if (!frame.slots || frame.slots.length === 0) return null;
    // En mode duplicate, le slot actif est capturedCount (pas n-1-capturedCount)
    const currentSlot = frame.slots.find((s) => s.photoIndex === capturedCount);
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
  }, [frame.slots, frame.canvasWidth, frame.canvasHeight, capturedCount]);

  const [countdown, setCountdown]       = useState<number | null>(null);
  const [cdState, setCdState]           = useState<CountdownState>("READY");
  const countdownTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset cdState ke READY saat berpindah ke slot foto berikutnya
  useEffect(() => {
    setCdState("READY");
    setCountdown(null);
  }, [photoIndex, retakeSlotIndex]);

  // Restart camera when device or mirror changes
  useEffect(() => {
    start();
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, mirror]);

  const changeDevice = (deviceId: string) => {
    sessionStorage.setItem("booth_camera_deviceId", deviceId);
    stop();
    setSelectedDeviceId(deviceId);
    setCdState("READY");
    setShowSettings(false);
  };

  const toggleMirror = () => {
    const next = !mirror;
    sessionStorage.setItem("booth_camera_mirror", String(next));
    setMirror(next);
  };

  const startCountdown = useCallback(() => {
    if (cdState !== "READY") return;
    setCdState("COUNTING");
    setCountdown(3);

    // ── Live Mode: mulai rekam saat countdown dimulai ──────────────────────
    startRecording();

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
          // Ambil foto
          const dataUrl = capture();
          setCdState("DONE");
          if (!dataUrl) {
            stopRecording().catch(() => {});
            return;
          }
          // Tampilkan foto review segera — jangan tunggu video
          onCapture(dataUrl);
          // Proses video di background (~800ms setelah shutter)
          void (async () => {
            await new Promise<void>((r) => setTimeout(r, 800));
            const videoBlob = await stopRecording();
            onVideoReady(videoBlob);
          })();
        }, 300);
      }
    };
    countdownTimerRef.current = setTimeout(tick, 1000);
  }, [cdState, capture, onCapture, onVideoReady, startRecording, stopRecording]);

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

  return (
    <div
      className="flex h-full select-none overflow-hidden"
      style={{
        backgroundColor: primaryColor,
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: mirror ? "scaleX(-1)" : "none" }}
          />

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
        </div>
      </div>

      {/* Error izin kamera */}
      {permissionError && (() => {
        const chrome = isChrome();
        const chromeUrl = `googlechrome://${typeof location !== "undefined" ? location.href.replace(/^https?:\/\//, "") : ""}`;
        return (
          <div className="absolute inset-0 flex items-center justify-center px-6"
            style={{ backgroundColor: primaryColor }}>
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
              disabled={!isReady || cdState !== "READY"}
              style={{
                backgroundColor: !isReady || cdState !== "READY" ? `${accentColor}55` : accentColor,
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

      {/* ═══ KANAN/BAWAH: Frame Preview ═══ */}
      <div
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={isPortrait
          ? { width: "100%", height: "30vh", flexDirection: "row", gap: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 8 }
          : { width: "clamp(200px, 30vw, 400px)", flexDirection: "column", paddingTop: 24, paddingBottom: 24, paddingRight: 16, paddingLeft: 8 }
        }
      >
        {!isPortrait && <p className="text-xs uppercase tracking-widest mb-3" style={{ color: textTertiary }}>Preview</p>}
        {/* Kontainer frame — aspect ratio menyesuaikan frame */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-2xl"
          style={{
            aspectRatio: String(frameAspect),
            ...(isPortrait
              ? { height: "100%", maxWidth: "100%" }
              : { width: "100%", maxHeight: "calc(100vh - 8rem)" }
            ),
            backgroundColor: frame.backgroundColor || "#ffffff",
          }}
        >
          {/* Canvas live composite — background + foto/video per slot + overlay PNG */}
          <LivePreviewCanvas
            stream={stream}
            mirror={mirror}
            frame={frame}
            capturedPhotos={capturedPhotos}
            isDuplicate={isDuplicate}
            allPhotosDone={allPhotosDone}
          />

          {/* Tombol × retake — overlay di atas canvas saat semua foto sudah diambil */}
          {allPhotosDone && frame.slots && frame.slots.map((slot) => {
            // Untuk duplicate mode 2-kolom: col=pi%2, row=floor(pi/2), nRows=n/2
            const n = frame.slots!.length;
            const _nr = isDuplicate ? n / 2 : 0;
            const captureIdx = isDuplicate
              ? (slot.photoIndex % 2 === 0
                  ? Math.floor(slot.photoIndex / 2)
                  : _nr - 1 - Math.floor(slot.photoIndex / 2))
              : slot.photoIndex;
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
              >
                ×
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-3 text-center" style={{ color: textTertiary }}>
          {capturedCount}/{totalPhotos} foto
        </p>
        {isPortrait && <p className="text-xs uppercase tracking-widest" style={{ color: textTertiary }}>Preview</p>}
      </div>
    </div>
  );
}
