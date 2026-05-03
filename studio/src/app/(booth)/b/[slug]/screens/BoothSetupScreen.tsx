"use client";

import { useEffect, useState, useCallback } from "react";
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
<<<<<<< HEAD
  localStorage.setItem(`${STORAGE_KEY}_${slug}`, JSON.stringify(s));
=======
  try {
    localStorage.setItem(`${STORAGE_KEY}_${slug}`, JSON.stringify(s));
  } catch {
    // Ignore storage quota issues; settings persistence is best-effort.
  }
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
}

// ─────────────────────────────────────────────────────────────────────────────

export function BoothSetupScreen({ booth, onDone }: BoothSetupScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);
  type CaptureSource = "auto" | "webcam" | "dslr";

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
<<<<<<< HEAD
=======
  const [dslrCapabilities, setDslrCapabilities] = useState<{
    supportsCapture?: boolean;
    supportsLiveView?: boolean;
    mode?: string;
  } | null>(null);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
  const [captureSource, setCaptureSource] = useState<CaptureSource>("auto");

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

    if (typeof sessionStorage !== "undefined") {
      const savedSource = sessionStorage.getItem("booth_camera_source");
      if (savedSource === "auto" || savedSource === "webcam" || savedSource === "dslr") {
        setCaptureSource(savedSource);
      }
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
    setCaptureSource("webcam");
    setDeviceId(id);
    startCamera(id);
  };

  // ── Check Local Agent & get printers ──────────────────────────────────────
  // Coba endpoint secara BERURUTAN agar tidak membanjiri local agent.
<<<<<<< HEAD
  // Endpoint HTTP diprioritaskan untuk localhost bridge (tanpa TLS).
=======
  // Pada halaman HTTPS, gunakan endpoint HTTPS saja untuk menghindari mixed-content block.
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
  const checkAgent = useCallback(async () => {
    if (!canUseLocalAgent()) { setAgentOnline(false); return; }
    setAgentChecking(true);
    try {
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

      let status: {
        camera?: { available?: boolean; cameras?: { model: string; port: string }[] };
=======
      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
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

      let status: {
        camera?: {
          available?: boolean;
          cameras?: { model: string; port: string }[];
          capabilities?: {
            supportsCapture?: boolean;
            supportsLiveView?: boolean;
            mode?: string;
          };
        };
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
        printer?: { printers?: { name: string; isDefault?: boolean }[]; defaultPrinter?: string | null };
      } | null = null;
      let connectedBase: string | null = null;

      let lastError: unknown = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error(`status ${res.status}`);
          status = await res.json() as {
<<<<<<< HEAD
            camera?: { available?: boolean; cameras?: { model: string; port: string }[] };
=======
            camera?: {
              available?: boolean;
              cameras?: { model: string; port: string }[];
              capabilities?: {
                supportsCapture?: boolean;
                supportsLiveView?: boolean;
                mode?: string;
              };
            };
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
            printer?: { printers?: { name: string; isDefault?: boolean }[]; defaultPrinter?: string | null };
          };
          connectedBase = base;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!status) {
        throw lastError instanceof Error ? lastError : new Error("Agent tidak dapat dijangkau");
      }

      setAgentOnline(true);
      const cams = status.camera?.cameras ?? [];
      setDslrCameras(cams);
<<<<<<< HEAD
=======
      setDslrCapabilities(status.camera?.capabilities ?? null);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

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
<<<<<<< HEAD
=======
      setDslrCapabilities(null);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
      setPrinters([]);
      if (captureSource === "dslr") {
        setCaptureSource("auto");
      }
    } finally {
      setAgentChecking(false);
    }
  }, [captureSource, printerName]); // eslint-disable-line react-hooks/exhaustive-deps

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
<<<<<<< HEAD
    if (deviceId) sessionStorage.setItem("booth_camera_deviceId", deviceId);
    else          sessionStorage.removeItem("booth_camera_deviceId");
    sessionStorage.setItem("booth_camera_mirror", String(mirror));
    sessionStorage.setItem("booth_camera_source", captureSource);
=======
    try {
      if (deviceId) sessionStorage.setItem("booth_camera_deviceId", deviceId);
      else          sessionStorage.removeItem("booth_camera_deviceId");
      sessionStorage.setItem("booth_camera_mirror", String(mirror));
      sessionStorage.setItem("booth_camera_source", captureSource);
    } catch {
      // Ignore storage quota issues; runtime state remains in memory.
    }
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    onDone(settings);
  };

  const handleReset = () => {
<<<<<<< HEAD
    localStorage.removeItem(`${STORAGE_KEY}_${booth.slug}`);
=======
    try {
      localStorage.removeItem(`${STORAGE_KEY}_${booth.slug}`);
    } catch {
      // Ignore storage failures.
    }
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
            <img
              src={booth.logoUrl}
              alt={booth.boothName}
              className="h-7 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
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
              {captureSource === "dslr" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <span className="text-2xl">📷</span>
                  <p className="text-xs" style={{ color: textSecondary }}>
                    DSLR dipilih. Live preview tampil di sesi foto, bukan di halaman setup.
                  </p>
                </div>
              ) : camError ? (
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
              {captureSource !== "dslr" && camLoading && !camError && (
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
                Kamera Webcam Browser {devices.length > 1 ? `(${devices.length} terdeteksi)` : ""}
              </p>
              {devices.length === 0 && !camError && (
                <p className="text-xs" style={{ color: textTertiary }}>Mendeteksi kamera…</p>
              )}
              <div className="space-y-1.5">
                <button
                  onClick={() => setCaptureSource("webcam")}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                  style={{
                    background: captureSource === "webcam" ? `${accentColor}22` : surfaceBg,
                    border: captureSource === "webcam" ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                    color: captureSource === "webcam" ? accentColor : textPrimary,
                  }}
                >
                  <span>🎬</span>
                  <span className="flex-1 truncate">Gunakan Webcam Browser</span>
                  {captureSource === "webcam" && <span className="font-bold">✓ Dipilih</span>}
                </button>
                {devices.map(d => (
                  <button key={d.deviceId} onClick={() => switchCamera(d.deviceId)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                    style={{
                      background: d.deviceId === deviceId && captureSource === "webcam" ? `${accentColor}22` : surfaceBg,
                      border:     d.deviceId === deviceId && captureSource === "webcam" ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                      color:      d.deviceId === deviceId && captureSource === "webcam" ? accentColor : textPrimary,
                    }}>
                    <span>🎥</span>
                    <span className="flex-1 truncate">{d.label}</span>
                    {d.deviceId === deviceId && captureSource === "webcam" && <span className="font-bold">✓ Aktif</span>}
                  </button>
                ))}
                {/* Tip DSLR */}
                <div className="rounded-xl px-2.5 py-2 text-[10px] leading-relaxed"
                  style={{ background: surfaceBg, color: textTertiary }}>
                  💡 List ini hanya webcam browser. DSLR dipilih di panel "Kamera DSLR / Mirrorless" di bawah.
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
<<<<<<< HEAD
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-900/50 text-green-400">
                  ✓ {dslrCameras.length} Terdeteksi
                </span>
=======
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-900/50 text-green-400">
                    ✓ {dslrCameras.length} Terdeteksi
                  </span>
                  {dslrCapabilities?.mode === "capture-only" && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(234,179,8,0.15)", color: "#fde047" }}>
                      Capture-only
                    </span>
                  )}
                  {dslrCapabilities?.mode === "live-view" && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(34,197,94,0.18)", color: "#86efac" }}>
                      Live View
                    </span>
                  )}
                </div>
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
              )}
              {agentOnline === true && dslrCameras.length === 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: surfaceBg, color: textTertiary }}>Belum ada</span>
              )}
            </div>

            {/* Daftar kamera terdeteksi */}
            {agentOnline === true && dslrCameras.length > 0 && (
              <div className="space-y-1">
                {dslrCameras.map((cam, i) => (
                  <button
                    key={i}
                    onClick={() => setCaptureSource("dslr")}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                    style={{
                      background: captureSource === "dslr" ? `${accentColor}22` : `${accentColor}15`,
                      border: captureSource === "dslr" ? `1.5px solid ${accentColor}` : `1.5px solid ${accentColor}44`,
                      color: captureSource === "dslr" ? accentColor : textPrimary,
                    }}
                  >
                    <span>📷</span>
                    <span className="flex-1">{cam.model}</span>
                    <span className="text-[10px] opacity-60">{cam.port}</span>
                    {captureSource === "dslr" ? (
                      <span className="text-[10px] font-bold">✓ Dipilih</span>
                    ) : (
                      <span className="text-[10px] font-bold text-green-400">✓ Siap</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Tutorial cara hubungkan DSLR */}
            <div className="rounded-xl px-3 py-3 space-y-2.5"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${surfaceBorder}` }}>
              <p className="text-xs font-bold" style={{ color: textPrimary }}>📸 Cara Hubungkan Kamera DSLR / Mirrorless</p>
              <ol className="space-y-2 text-[11px] leading-relaxed" style={{ color: textSecondary }}>
                <li>
<<<<<<< HEAD
                  <span className="font-semibold" style={{ color: textPrimary }}>1. Jalankan Local Agent</span><br/>
                  Untuk DSLR Canon/Nikon di Windows, jalankan Hardware Agent lokal terpisah yang membuka endpoint <strong>127.0.0.1:7432</strong>.
                  Launcher booth / printer saja tidak cukup untuk mendeteksi kamera DSLR.
=======
                  <span className="font-semibold" style={{ color: textPrimary }}>1. Buka Studio Booth App (agent auto-start)</span><br/>
                  Versi terbaru app akan menyalakan hardware agent lokal otomatis di background (<strong>127.0.0.1:7432</strong>) saat aplikasi dibuka.
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
<<<<<<< HEAD
=======
              {agentOnline === true && dslrCapabilities?.mode === "capture-only" && (
                <div className="rounded-xl px-2.5 py-2 text-[10px]"
                  style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#bfdbfe" }}>
                  ℹ️ Kamera terdeteksi di mode capture-only. Live preview mungkin tidak tersedia, tetapi tombol Ambil Foto tetap akan men-trigger shutter DSLR.
                </div>
              )}
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
