"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { getAdaptiveColors } from "../colorUtils";
import { getAllPaperSizes } from "../paperSize";
import type { BoothConfigData, BoothHardwareSettings } from "../types";

interface VideoDevice { deviceId: string; label: string }

interface BoothSetupScreenProps {
  booth:    BoothConfigData;
  onDone:   (settings: BoothHardwareSettings) => void;
}

const STORAGE_KEY = "fremio_booth_hw_settings";

/**
 * Local agent dipakai untuk desktop booth (DSLR/printer),
 * sementara mobile/tablet tetap native browser-only.
 */
function canUseLocalAgent(): boolean {
  if (typeof window === "undefined") return false;
  return !isNoAgentDevice();
}

/** Detect iOS / iPadOS */
function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /ipad|iphone|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Detect Android tablet / phone */
function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/** Detect any mobile/tablet device that doesn't need local agent */
function isNoAgentDevice(): boolean {
  return isIOSDevice() || isAndroidDevice();
}

export function loadHardwareSettings(slug: string): BoothHardwareSettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${slug}`);
    return raw ? (JSON.parse(raw) as BoothHardwareSettings) : null;
  } catch { return null; }
}

function saveHardwareSettings(slug: string, s: BoothHardwareSettings) {
  localStorage.setItem(`${STORAGE_KEY}_${slug}`, JSON.stringify(s));
}

// ─────────────────────────────────────────────────────────────────────────────

export function BoothSetupScreen({ booth, onDone }: BoothSetupScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);

  // ── Camera state ──────────────────────────────────────────────────────────
  const [devices,    setDevices]    = useState<VideoDevice[]>([]);
  const [deviceId,   setDeviceId]   = useState<string | null>(null);
  const [mirror,     setMirror]     = useState(true);
  const [camLoading, setCamLoading] = useState(true);
  const [camError,   setCamError]   = useState<string | null>(null);
  const [previewEl,  setPreviewEl]  = useState<HTMLVideoElement | null>(null);
  const [stream,     setStream]     = useState<MediaStream | null>(null);

  // ── Printer state ─────────────────────────────────────────────────────────
  const [printers,       setPrinters]       = useState<string[]>([]);
  const [printerName,    setPrinterName]     = useState<string | null>(null);
  const [agentOnline,    setAgentOnline]     = useState<boolean | null>(null); // null=checking
  const [agentChecking,  setAgentChecking]   = useState(false);
  const [manualPrinter,  setManualPrinter]   = useState(""); // manual input when agent offline
  // Mobile/tablet mode: tanpa local agent.
  const isTabletMode = isNoAgentDevice();

  // ── DSLR state ────────────────────────────────────────────────────
  const [dslrCameras, setDslrCameras] = useState<{ model: string; port: string }[]>([]);

  // ── Paper size state ──────────────────────────────────────────────────────
  // null = auto-detect dari canvas frame dimensions
  const [paperSizeOverride, setPaperSizeOverride] = useState<string | null>(null);

  // ── Load saved settings once ───────────────────────────────────────────────
  useEffect(() => {
    const saved = loadHardwareSettings(booth.slug);
    if (saved) {
      setDeviceId(saved.cameraDeviceId);
      setMirror(saved.cameraMirror);
      setPrinterName(saved.printerName);
      if (saved.printerName) setManualPrinter(saved.printerName);
      setPaperSizeOverride(saved.paperSize ?? null);
    }
  }, [booth.slug]);

  // ── Enumerate cameras ──────────────────────────────────────────────────────
  const startCamera = useCallback(async (targetDeviceId?: string | null) => {
    setCamLoading(true); setCamError(null);
    // Stop existing stream
    stream?.getTracks().forEach(t => t.stop());

    try {
      const constraint: MediaTrackConstraints = targetDeviceId
        ? { deviceId: { exact: targetDeviceId } }
        : { facingMode: "user" };

      const ms = await navigator.mediaDevices.getUserMedia({ video: constraint, audio: false });
      setStream(ms);

      // After permission granted, enumerate devices to get labels
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter(d => d.kind === "videoinput").map((d, i) => ({
        deviceId: d.deviceId,
        label:    d.label || `Kamera ${i + 1}`,
      }));
      setDevices(vids);

      // If no device selected yet, pick active track's device
      if (!targetDeviceId && vids.length > 0) {
        const activeId = ms.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        setDeviceId(activeId ?? vids[0].deviceId);
      }

      if (previewEl) {
        previewEl.srcObject = ms;
        previewEl.play().catch(() => {});
      }
      setCamLoading(false);
    } catch (err) {
      setCamError(
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
          ? "Izin kamera ditolak. Klik Allow di popup browser."
          : "Kamera tidak bisa diakses. Pastikan kamera terpasang."
      );
      setCamLoading(false);
    }
  }, [stream, previewEl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial camera start
  useEffect(() => {
    startCamera(deviceId);
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream to video element when both are ready
  useEffect(() => {
    if (previewEl && stream) {
      previewEl.srcObject = stream;
      previewEl.play().catch(() => {});
    }
  }, [previewEl, stream]);

  // Switch camera
  const switchCamera = (id: string) => {
    setDeviceId(id);
    startCamera(id);
  };

  // ── Check Local Agent & get printers ──────────────────────────────────────
  // Semua kandidat dicoba PARALLEL (Promise.any) agar tidak ada waktu terbuang
  // menunggu satu-per-satu timeout. Yang pertama OK langsung dipakai.
  const checkAgent = useCallback(async () => {
    if (!canUseLocalAgent()) { setAgentOnline(false); return; }
    setAgentChecking(true);
    try {
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

      const status = await Promise.any(
        candidates.map(async (base) => {
          const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(2500) });
          if (!res.ok) throw new Error(`status ${res.status}`);
          const data = await res.json() as {
            camera?: { available?: boolean; cameras?: { model: string; port: string }[] };
            printer?: { printers?: { name: string; isDefault?: boolean }[]; defaultPrinter?: string | null };
          };
          return data;
        })
      );

      setAgentOnline(true);
      const cams = status.camera?.cameras ?? [];
      setDslrCameras(cams);

      const printerList = status.printer?.printers?.map((p) => p.name) ?? [];
      setPrinters(printerList);

      if (!printerName) {
        const defaultPrinter = status.printer?.defaultPrinter ?? null;
        const nextPrinter = defaultPrinter || printerList[0] || null;
        setPrinterName(nextPrinter);
        if (nextPrinter) setManualPrinter(nextPrinter);
      }
    } catch {
      setAgentOnline(false);
      setDslrCameras([]);
      setPrinters([]);
    } finally {
      setAgentChecking(false);
    }
  }, [printerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { checkAgent(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Done ──────────────────────────────────────────────────────────────────
  const handleDone = () => {
    stream?.getTracks().forEach(t => t.stop());
    const resolvedPrinter = printerName ?? (manualPrinter.trim() || null);
    const settings: BoothHardwareSettings = {
      cameraDeviceId: deviceId,
      cameraMirror:   mirror,
      printerName:    resolvedPrinter,
      paperSize:      paperSizeOverride,
      setupCompleted: true,
    };
    saveHardwareSettings(booth.slug, settings);
    // Sync to sessionStorage so CameraScreen picks up the same deviceId + mirror
    if (deviceId) sessionStorage.setItem("booth_camera_deviceId", deviceId);
    else          sessionStorage.removeItem("booth_camera_deviceId");
    sessionStorage.setItem("booth_camera_mirror", String(mirror));
    onDone(settings);
  };

  const handleReset = () => {
    localStorage.removeItem(`${STORAGE_KEY}_${booth.slug}`);
    window.location.reload();
  };

  const handleRefreshPrinter = () => {
    if (!printerName && printers.length > 0) {
      setPrinterName(printers[0]);
    }
    window.print();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center py-4 px-4 select-none overflow-y-auto"
      style={{ backgroundColor: primaryColor }}
    >
      <div className="w-full max-w-2xl space-y-3">

        {/* Header — compact horizontal */}
        <div className="flex items-center justify-center gap-3">
          {booth.logoUrl && (
            <Image src={booth.logoUrl} alt={booth.boothName} width={64} height={32}
              className="h-7 w-auto object-contain" />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: textTertiary }}>Setup Booth</p>
            <h1 className="text-lg font-bold leading-tight" style={{ color: textPrimary }}>{booth.boothName}</h1>
          </div>
        </div>

        {/* ── Kamera ───────────────────────────────────────────────────────── */}
        <div>

          <div className="rounded-2xl overflow-hidden"
            style={{ background: surfaceBg, border: `1px solid ${surfaceBorder}` }}>

            {/* Preview — fixed height */}
            <div className="relative bg-black" style={{ height: "200px" }}>
              {camError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <span className="text-2xl">📷</span>
                  <p className="text-xs" style={{ color: textSecondary }}>{camError}</p>
                  <button onClick={() => startCamera(deviceId)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: accentColor, color: primaryColor }}>
                    Coba Lagi
                  </button>
                </div>
              ) : (
                <video
                  ref={el => setPreviewEl(el)}
                  autoPlay playsInline muted
                  className="w-full h-full object-cover"
                  style={{ transform: mirror ? "scaleX(-1)" : "none" }}
                />
              )}
              {camLoading && !camError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <p className="animate-pulse text-xs" style={{ color: textPrimary }}>Memuat kamera…</p>
                </div>
              )}
              <div className="absolute top-2 right-2">
                <button onClick={() => setMirror(v => !v)}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-sm"
                  style={{ background: "rgba(0,0,0,0.5)", color: mirror ? accentColor : textTertiary }}>
                  {mirror ? "⟷ Mirror ON" : "⟷ Mirror OFF"}
                </button>
              </div>
            </div>

            {/* Camera selector */}
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textSecondary }}>
                Kamera {devices.length > 1 ? `(${devices.length} terdeteksi)` : ""}
              </p>
              {devices.length === 0 && !camError && (
                <p className="text-xs" style={{ color: textTertiary }}>Mendeteksi kamera…</p>
              )}
              <div className="space-y-1.5">
                {devices.map(d => (
                  <button key={d.deviceId} onClick={() => switchCamera(d.deviceId)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                    style={{
                      background: d.deviceId === deviceId ? `${accentColor}22` : surfaceBg,
                      border:     d.deviceId === deviceId ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                      color:      d.deviceId === deviceId ? accentColor : textPrimary,
                    }}>
                    <span>🎥</span>
                    <span className="flex-1 truncate">{d.label}</span>
                    {d.deviceId === deviceId && <span className="font-bold">✓ Aktif</span>}
                  </button>
                ))}
                {/* Tip DSLR */}
                <div className="rounded-xl px-2.5 py-2 text-[10px] leading-relaxed"
                  style={{ background: surfaceBg, color: textTertiary }}>
                  💡 DSLR tidak muncul? Install{" "}
                  <span style={{ color: textSecondary }}>Canon EOS Webcam Utility / Nikon Webcam / Sony Imaging Edge / OBS</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Kamera DSLR / Mirrorless ────────────────────────────────────── */}
        {!isTabletMode && (
          <div className="rounded-2xl p-3 space-y-2" style={{ background: surfaceBg, border: `1px solid ${surfaceBorder}` }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textSecondary }}>KAMERA DSLR / MIRRORLESS</p>
              {agentOnline === true && dslrCameras.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-900/50 text-green-400">
                  ✓ {dslrCameras.length} Terdeteksi
                </span>
              )}
              {agentOnline === true && dslrCameras.length === 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: surfaceBg, color: textTertiary }}>Belum ada</span>
              )}
            </div>

            {/* Daftar kamera terdeteksi */}
            {agentOnline === true && dslrCameras.length > 0 && (
              <div className="space-y-1">
                {dslrCameras.map((cam, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs"
                    style={{ background: `${accentColor}15`, border: `1.5px solid ${accentColor}44`, color: textPrimary }}>
                    <span>📷</span>
                    <span className="flex-1">{cam.model}</span>
                    <span className="text-[10px] opacity-60">{cam.port}</span>
                    <span className="text-[10px] font-bold text-green-400">✓ Siap</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tutorial cara hubungkan DSLR */}
            <div className="rounded-xl px-3 py-3 space-y-2.5"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${surfaceBorder}` }}>
              <p className="text-xs font-bold" style={{ color: textPrimary }}>📸 Cara Hubungkan Kamera DSLR / Mirrorless</p>
              <ol className="space-y-2 text-[11px] leading-relaxed" style={{ color: textSecondary }}>
                <li>
                  <span className="font-semibold" style={{ color: textPrimary }}>1. Jalankan Local Agent</span><br/>
                  Untuk DSLR Canon/Nikon di Windows, jalankan Hardware Agent lokal terpisah yang membuka endpoint <strong>127.0.0.1:7432</strong>.
                  Launcher booth / printer saja tidak cukup untuk mendeteksi kamera DSLR.
                </li>
                <li>
                  <span className="font-semibold" style={{ color: textPrimary }}>2. Hubungkan kamera via kabel USB</span><br/>
                  Gunakan kabel USB bawaan kamera (biasanya USB-A ke Mini-USB atau Micro-USB).
                </li>
                <li>
                  <span className="font-semibold" style={{ color: textPrimary }}>3. Set mode kamera ke PTP / PC Remote</span><br/>
                  Di menu kamera: <em>Connection → PC Remote</em> atau <em>USB → PTP / Transfer Mode</em>.<br/>
                  <span style={{ color: textTertiary }}>&#9888; Jangan pilih MTP / Mass Storage — mode itu tidak didukung.</span>
                </li>
                <li>
                  <span className="font-semibold" style={{ color: textPrimary }}>4. Khusus Mac — matikan PTPCamera daemon</span><br/>
                  macOS secara otomatis mengklaim kamera. Buka Terminal, ketik:<br/>
                  <code className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: "rgba(255,255,255,0.1)", color: textPrimary }}>sudo killall PTPCamera</code>
                </li>
                <li>
                  <span className="font-semibold" style={{ color: textPrimary }}>5. Verifikasi status agent lalu klik “Coba Lagi”</span><br/>
                  Pastikan <strong>http://127.0.0.1:7432/status</strong> bisa dibuka dan kamera terdeteksi, lalu refresh deteksi di halaman booth.
                </li>
              </ol>
              <div className="pt-1 space-y-1.5">
                <p className="text-[10px] font-semibold" style={{ color: textTertiary }}>Kamera yang didukung (via gphoto2):</p>
                <div className="flex flex-wrap gap-1">
                  {["Canon EOS", "Canon PowerShot", "Nikon D / Z", "Fujifilm X", "Sony Alpha", "Olympus OM-D", "Panasonic Lumix"].map(brand => (
                    <span key={brand} className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{ background: "rgba(255,255,255,0.08)", color: textSecondary }}>
                      {brand}
                    </span>
                  ))}
                </div>
              </div>
              {agentOnline === false && (
                <div className="rounded-xl px-2.5 py-2 text-[10px]"
                  style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#fde047" }}>
                  ⚠️ Agent DSLR belum aktif. Jalankan hardware agent lokal di 127.0.0.1:7432, lalu klik Coba Lagi.
                </div>
              )}
              {agentOnline === true && dslrCameras.length === 0 && (
                <div className="rounded-xl px-2.5 py-2 text-[10px]"
                  style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#fde047" }}>
                  ⚠️ Agent aktif tapi kamera belum terdeteksi. Pastikan kabel USB terpasang, kamera menyala, dan mode diset ke PTP.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Ukuran Kertas ────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-3 space-y-2" style={{ background: surfaceBg, border: `1px solid ${surfaceBorder}` }}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: textSecondary }}>PRINTER</p>
              <button
                onClick={handleRefreshPrinter}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold transition-opacity active:opacity-60"
                style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}55` }}
              >
                🔄 Refresh Printer
              </button>
            </div>

            <div className="rounded-xl px-2.5 py-2 text-xs" style={{ background: surfaceBg, border: `1.5px solid ${surfaceBorder}`, color: textSecondary }}>
              {printerName
                ? `Printer aktif: ${printerName}`
                : printers.length > 0
                  ? `Printer terdeteksi: ${printers[0]}`
                  : "Belum ada printer terdeteksi."}
            </div>
          </div>

          <div className="pt-1" />
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: textSecondary }}>UKURAN KERTAS</p>
          <div className="flex flex-wrap gap-1.5">
            {/* Opsi Otomatis */}
            <button
              onClick={() => setPaperSizeOverride(null)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              style={{
                background: paperSizeOverride === null ? `${accentColor}22` : "transparent",
                border:     paperSizeOverride === null ? `1.5px solid ${accentColor}` : `1.5px solid ${surfaceBorder}`,
                color:      paperSizeOverride === null ? accentColor : textTertiary,
              }}
            >
              Otomatis
            </button>
            {/* Ukuran manual */}
            {getAllPaperSizes().map(ps => (
              <button
                key={ps.name}
                onClick={() => setPaperSizeOverride(ps.name)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                style={{
                  background: paperSizeOverride === ps.name ? `${accentColor}22` : "transparent",
                  border:     paperSizeOverride === ps.name ? `1.5px solid ${accentColor}` : `1.5px solid ${surfaceBorder}`,
                  color:      paperSizeOverride === ps.name ? accentColor : textTertiary,
                }}
              >
                {ps.name}
                <span className="ml-1 opacity-60 font-normal">{ps.widthMm}×{ps.heightMm}mm</span>
              </button>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: textTertiary }}>
            {paperSizeOverride === null
              ? "Ukuran kertas terdeteksi otomatis dari frame yang dipilih."
              : `Semua cetak akan menggunakan ukuran ${paperSizeOverride}.`}
          </p>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <button
          onClick={handleDone}
          disabled={camLoading || !!camError}
          className="w-full py-4 rounded-3xl text-xl font-black active:scale-95 transition-all disabled:opacity-40"
          style={{ backgroundColor: accentColor, color: primaryColor }}
        >
          {camLoading ? "Memuat kamera…" : "▶ Mulai Booth"}
        </button>

        <button onClick={handleReset}
          className="w-full text-center text-xs py-1 transition-colors" style={{ color: textTertiary }}>
          Reset pengaturan ini
        </button>
      </div>
    </div>
  );
}
