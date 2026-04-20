"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import type { BoothConfigData, BoothHardwareSettings } from "../types";

interface VideoDevice { deviceId: string; label: string }

interface BoothSetupScreenProps {
  booth:    BoothConfigData;
  onDone:   (settings: BoothHardwareSettings) => void;
}

const STORAGE_KEY = "fremio_booth_hw_settings";

/**
 * Chrome allows mixed-content requests to http://localhost from HTTPS pages,
 * so we always try reaching the local agent regardless of protocol/hostname.
 */
function canUseLocalAgent(): boolean {
  return typeof window !== "undefined";
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

  // ── Load saved settings once ───────────────────────────────────────────────
  useEffect(() => {
    const saved = loadHardwareSettings(booth.slug);
    if (saved) {
      setDeviceId(saved.cameraDeviceId);
      setMirror(saved.cameraMirror);
      setPrinterName(saved.printerName);
      if (saved.printerName) setManualPrinter(saved.printerName);
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
  // Mac agent → HTTPS; Windows agent → HTTP. Try https first, fallback to http.
  const checkAgent = useCallback(async () => {
    if (!canUseLocalAgent()) { setAgentOnline(false); return; }
    setAgentChecking(true);
    try {
      let res: Response;
      try {
        res = await fetch("https://127.0.0.1:3002/status", {
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        res = await fetch("http://127.0.0.1:3002/status", {
          signal: AbortSignal.timeout(3000),
        });
      }
      if (res.ok) {
        const data = await res.json() as { ok: boolean; printers: string[] };
        setAgentOnline(true);
        const list = data.printers ?? [];
        setPrinters(list);
        // Auto-select first printer if none selected yet
        if (printerName === null && list.length > 0) {
          // keep null (= dialog browser) as default; let user pick
        }
      } else {
        setAgentOnline(false);
      }
    } catch {
      setAgentOnline(false);
    } finally {
      setAgentChecking(false);
    }
  }, [printerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { checkAgent(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Done ──────────────────────────────────────────────────────────────────
  const handleDone = () => {
    stream?.getTracks().forEach(t => t.stop());
    // When agent is offline, use manual printer input if provided; otherwise null
    const resolvedPrinter = agentOnline
      ? printerName
      : (manualPrinter.trim() || null);
    const settings: BoothHardwareSettings = {
      cameraDeviceId: deviceId,
      cameraMirror:   mirror,
      printerName:    resolvedPrinter,
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
            <p className="text-white/50 text-[10px] uppercase tracking-widest">Setup Booth</p>
            <h1 className="text-white text-lg font-bold leading-tight">{booth.boothName}</h1>
          </div>
        </div>

        {/* ── Two-column: Kamera (kiri) + Printer (kanan) ─────────────────── */}
        <div className="grid grid-cols-2 gap-3">

          {/* ── Kamera ────────────────────────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>

            {/* Preview — fixed height */}
            <div className="relative bg-black" style={{ height: "200px" }}>
              {camError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <span className="text-2xl">📷</span>
                  <p className="text-white/60 text-xs">{camError}</p>
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
                  <p className="text-white animate-pulse text-xs">Memuat kamera…</p>
                </div>
              )}
              <div className="absolute top-2 right-2">
                <button onClick={() => setMirror(v => !v)}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-sm"
                  style={{ background: "rgba(0,0,0,0.5)", color: mirror ? accentColor : "rgba(255,255,255,0.4)" }}>
                  {mirror ? "⟷ Mirror ON" : "⟷ Mirror OFF"}
                </button>
              </div>
            </div>

            {/* Camera selector */}
            <div className="p-3 space-y-2">
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide">
                Kamera {devices.length > 1 ? `(${devices.length} terdeteksi)` : ""}
              </p>
              {devices.length === 0 && !camError && (
                <p className="text-white/40 text-xs">Mendeteksi kamera…</p>
              )}
              <div className="space-y-1.5">
                {devices.map(d => (
                  <button key={d.deviceId} onClick={() => switchCamera(d.deviceId)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                    style={{
                      background: d.deviceId === deviceId ? `${accentColor}22` : "rgba(255,255,255,0.04)",
                      border:     d.deviceId === deviceId ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                      color:      d.deviceId === deviceId ? accentColor : "rgba(255,255,255,0.7)",
                    }}>
                    <span>🎥</span>
                    <span className="flex-1 truncate">{d.label}</span>
                    {d.deviceId === deviceId && <span className="font-bold">✓ Aktif</span>}
                  </button>
                ))}
                {/* Tip DSLR */}
                <div className="rounded-xl px-2.5 py-2 text-[10px] leading-relaxed"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
                  💡 DSLR tidak muncul? Install{" "}
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Canon EOS Webcam Utility / Nikon Webcam / Sony Imaging Edge / OBS</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Printer ───────────────────────────────────────────────────── */}
          <div className="rounded-2xl p-3 space-y-2"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>

            <div className="flex items-center justify-between">
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide">PRINTER</p>
              <div className="flex items-center gap-1.5">
                {!isNoAgentDevice() && agentOnline === null && <span className="text-white/30 text-[10px] animate-pulse">Mengecek…</span>}
                {!isNoAgentDevice() && agentOnline === true  && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-900/50 text-green-400">✓ Aktif</span>
                )}
                {!isNoAgentDevice() && agentOnline === false && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/5 text-white/30">Tidak aktif</span>
                )}
                {isIOSDevice() && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-900/50 text-blue-300">📲 AirPrint</span>
                )}
                {isAndroidDevice() && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-900/50 text-green-300">🖨️ Print Dialog</span>
                )}
                {!isNoAgentDevice() && (
                  <button
                    onClick={checkAgent}
                    disabled={agentChecking || agentOnline === null}
                    className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold transition-opacity disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                    title="Cek ulang status agent">
                    {agentChecking ? "…" : "🔄 Coba Lagi"}
                  </button>
                )}
              </div>
            </div>

            {/* iOS AirPrint info */}
            {isIOSDevice() && (
              <div className="rounded-xl px-2.5 py-2 text-[11px] leading-relaxed space-y-1"
                style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "rgba(255,255,255,0.75)" }}>
                <p className="font-semibold text-blue-300">✅ Tidak perlu agent di iPad/iPhone</p>
                <p className="text-white/50">Pastikan printer WiFi tersambung ke jaringan yang sama. Dialog print muncul otomatis saat sesi selesai.</p>
              </div>
            )}

            {/* Android Print Dialog info */}
            {isAndroidDevice() && (
              <div className="rounded-xl px-2.5 py-2 text-[11px] leading-relaxed space-y-1"
                style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)", color: "rgba(255,255,255,0.75)" }}>
                <p className="font-semibold text-green-300">✅ Tidak perlu agent di Android</p>
                <p className="text-white/50">Install <strong className="text-white/70">Mopria Print Service</strong> (Play Store), pastikan printer di WiFi yang sama. Dialog print muncul otomatis.</p>
              </div>
            )}

            {/* Desktop: download buttons — 3 kolom horizontal */}
            {!isNoAgentDevice() && agentOnline !== true && (
              <div className="space-y-1.5">
                <p className="text-white/40 text-[10px]">Download agent untuk cetak silent:</p>
                <div className="flex gap-1.5">
                  <a href="/downloads/fremio-agent-mac-arm64" download="fremio-agent-mac-arm64"
                    className="flex-1 flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-xl text-[10px] font-bold transition-opacity hover:opacity-80 text-center"
                    style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(255,255,255,0.18)" }}>
                    <span>🍎</span><span>Mac Silicon</span>
                  </a>
                  <a href="/downloads/fremio-agent-mac-x64" download="fremio-agent-mac-x64"
                    className="flex-1 flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-xl text-[10px] font-bold transition-opacity hover:opacity-80 text-center"
                    style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(255,255,255,0.18)" }}>
                    <span>🍎</span><span>Mac Intel</span>
                  </a>
                  <a href="/downloads/fremio-agent-win.exe" download="fremio-agent-win.exe"
                    className="flex-1 flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-xl text-[10px] font-bold transition-opacity hover:opacity-80 text-center"
                    style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(255,255,255,0.18)" }}>
                    <span>🪟</span><span>Windows</span>
                  </a>
                </div>
                <p className="text-white/25 text-[10px]">
                  Setelah dijalankan, klik 🔄 Coba Lagi di atas.
                </p>
                <div className="rounded-xl px-2.5 py-2 text-[10px] leading-relaxed"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>
                  💡 Pakai tablet Android atau iPad? Tidak perlu agent — buka link booth dari browser tablet.
                </div>
              </div>
            )}

            {/* Manual printer input (desktop, agent offline) */}
            {!isNoAgentDevice() && agentOnline === false && (
              <div className="space-y-1">
                <p className="text-white/40 text-[10px] px-0.5">Atau ketik nama printer manual:</p>
                <input
                  type="text"
                  value={manualPrinter}
                  onChange={e => setManualPrinter(e.target.value)}
                  placeholder="Contoh: Canon SELPHY CP1500"
                  className="w-full px-2.5 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background:  "rgba(255,255,255,0.07)",
                    border:      manualPrinter.trim() ? `1.5px solid ${accentColor}` : "1.5px solid rgba(255,255,255,0.15)",
                    color:       "rgba(255,255,255,0.85)",
                  }}
                />
                {manualPrinter.trim() && (
                  <p className="text-[10px] px-0.5" style={{ color: accentColor }}>
                    🖨️ "{manualPrinter.trim()}" akan disimpan.
                  </p>
                )}
              </div>
            )}

            {/* Agent active: printer list */}
            {agentOnline === true && (
              <div className="space-y-1.5">
                <button onClick={() => setPrinterName(null)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                  style={{
                    background: printerName === null ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                    border:     printerName === null ? "1.5px solid rgba(255,255,255,0.25)" : "1.5px solid transparent",
                    color:      printerName === null ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)",
                  }}>
                  <span>🚫</span>
                  <span className="flex-1">Tanpa printer</span>
                  {printerName === null && <span className="font-bold text-[10px]">✓</span>}
                </button>
                {printers.map(p => (
                  <button key={p} onClick={() => setPrinterName(p)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
                    style={{
                      background: p === printerName ? `${accentColor}22` : "rgba(255,255,255,0.04)",
                      border:     p === printerName ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                      color:      p === printerName ? accentColor : "rgba(255,255,255,0.7)",
                    }}>
                    <span>🖨️</span>
                    <span className="flex-1 truncate">{p}</span>
                    {p === printerName && <span className="font-bold text-[10px]">✓ Aktif</span>}
                  </button>
                ))}
                {printers.length === 0 && (
                  <p className="text-white/30 text-[10px] px-0.5">Tidak ada printer terdeteksi di OS.</p>
                )}
              </div>
            )}
          </div>
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
          className="w-full text-center text-white/25 text-xs py-1 hover:text-white/50 transition-colors">
          Reset pengaturan ini
        </button>
      </div>
    </div>
  );
}
