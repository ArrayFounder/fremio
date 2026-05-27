"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAdaptiveColors } from "../colorUtils";
import { getAllPaperSizes } from "../paperSize";
import type { BoothConfigData, BoothHardwareSettings } from "../types";
  
interface VideoDevice { deviceId: string; label: string }

declare global {
  interface Window {
    fremioBooth?: {
      getBridgeStatus?: () => Promise<unknown>;
      restartBridge?: () => Promise<unknown>;
      agentStatus: () => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      agentCapture: () => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      agentPreview: () => Promise<{ ok: boolean; base64?: string; mimeType?: string; error?: string }>;
      agentPreviewStreamUrl?: (cacheKey?: string | number) => string;
      agentPrint: (job: unknown) => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      getAgentLogs?: () => Promise<{
        pid: number | null;
        running: boolean;
        stdout: string;
        stderr: string;
        agentRootPath?: string;
        agentExePath?: string;
        agentEntryPath?: string;
      }>;
    };
  }
}

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
  try {
    localStorage.setItem(`${STORAGE_KEY}_${slug}`, JSON.stringify(s));
  } catch {
    // Ignore storage quota issues; settings persistence is best-effort.
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function BoothSetupScreen({ booth, onDone }: BoothSetupScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);
  type CaptureSource = "auto" | "webcam" | "dslr";

  // ── Camera state ──────────────────────────────────────────────────────────
  const [devices,    setDevices]    = useState<VideoDevice[]>([]);
  const [deviceId,   setDeviceId]   = useState<string | null>(null);
  const [mirror,     setMirror]     = useState(() => {
    // Default mirror=true untuk Canon camera, false untuk webcam
    if (typeof sessionStorage === "undefined") return false;
    const savedSource = sessionStorage.getItem("booth_camera_source");
    const savedMirror = sessionStorage.getItem("booth_camera_mirror");
    if (savedMirror) return savedMirror === "true";
    return savedSource === "dslr"; // Auto-enable mirror for Canon
  });
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
  const [dslrCapabilities, setDslrCapabilities] = useState<{
    supportsCapture?: boolean;
    supportsLiveView?: boolean;
    mode?: string;
  } | null>(null);
  const [captureSource, setCaptureSource] = useState<CaptureSource>(() => {
    if (typeof sessionStorage === "undefined") return "auto";
    const savedSource = sessionStorage.getItem("booth_camera_source");
    return savedSource === "auto" || savedSource === "webcam" || savedSource === "dslr" ? savedSource : "auto";
  });
  const [agentBase, setAgentBase] = useState<string | null>(null);
  const [dslrPreviewKey, setDslrPreviewKey] = useState(() => Date.now());
  const [dslrPreviewError, setDslrPreviewError] = useState<string | null>(null);
  const [dslrPreviewActive, setDslrPreviewActive] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    // Jika captureSource sudah dslr (dari persistence), auto-aktifkan live view
    const savedSource = sessionStorage.getItem("booth_camera_source");
    return savedSource === "dslr" ? true : false;
  });
  const [dslrPreviewFrameSrc, setDslrPreviewFrameSrc] = useState<string | null>(null);
  const [streamAspect, setStreamAspect] = useState<number | null>(null); // w/h ratio of live view
  const [startingBooth, setStartingBooth] = useState(false);
  const dslrPreviewImgRef = useRef<HTMLImageElement | null>(null);
  const agentCheckInFlightRef = useRef<Promise<void> | null>(null);
  const previewRecoveryInFlightRef = useRef(false);
  const lastPreviewRecoveryAtRef = useRef(0);
  const [agentLogsOpen, setAgentLogsOpen] = useState(false);
  const [agentLogsData, setAgentLogsData] = useState<{
    pid: number | null;
    running: boolean;
    stdout: string;
    stderr: string;
  } | null>(null);

  const restartCanonPreviewBridge = useCallback(async (reason: string): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const restartBridge = window.fremioBooth?.restartBridge;
    if (!restartBridge) return false;

    const now = Date.now();
    if (previewRecoveryInFlightRef.current) return false;
    if (now - lastPreviewRecoveryAtRef.current < 6000) return false;

    previewRecoveryInFlightRef.current = true;
    lastPreviewRecoveryAtRef.current = now;

    try {
      setDslrPreviewError(`Menyambungkan ulang Canon... (${reason})`);
      setDslrPreviewFrameSrc(null);
      await restartBridge();
      setDslrPreviewKey(Date.now());
      return true;
    } catch {
      return false;
    } finally {
      previewRecoveryInFlightRef.current = false;
    }
  }, []);

  // ── Paper size state ──────────────────────────────────────────────────────
  // null = auto-detect dari canvas frame dimensions
  const [paperSizeOverride, setPaperSizeOverride] = useState<string | null>(null);

  // ── Load saved settings once ───────────────────────────────────────────────
  useEffect(() => {
    const saved = loadHardwareSettings(booth.slug);
    if (saved) {
      setDeviceId(saved.cameraDeviceId);
      setMirror(saved.cameraMirror ?? true);
      setPrinterName(saved.printerName);
      if (saved.printerName) setManualPrinter(saved.printerName);
      setPaperSizeOverride(saved.paperSize ?? null);
    }

    // Load DSLR state from sessionStorage
    if (typeof sessionStorage !== "undefined") {
      const savedDslrCameras = sessionStorage.getItem("booth_dslr_cameras");
      const savedDslrCapabilities = sessionStorage.getItem("booth_dslr_capabilities");
      const savedAgentBase = sessionStorage.getItem("booth_agent_base");
      const savedAgentOnline = sessionStorage.getItem("booth_agent_online");
      // dslrPreviewActive di-infer dari captureSource persistence, bukan key terpisah
      // agar tidak perlu key tambahan di sessionStorage
      
      if (savedDslrCameras) {
        try {
          setDslrCameras(JSON.parse(savedDslrCameras));
        } catch {}
      }
      
      if (savedDslrCapabilities) {
        try {
          setDslrCapabilities(JSON.parse(savedDslrCapabilities));
        } catch {}
      }
      
      if (savedAgentBase) {
        setAgentBase(savedAgentBase);
      }
      if (savedAgentOnline === "true") {
        setAgentOnline(true);
      }
    }

  }, [booth.slug]);

  // ── Save DSLR state to sessionStorage ───────────────────────────────────────
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    
    sessionStorage.setItem("booth_camera_source", captureSource);
    sessionStorage.setItem("booth_camera_mirror", String(mirror));
    sessionStorage.setItem("booth_dslr_cameras", JSON.stringify(dslrCameras));
    sessionStorage.setItem("booth_dslr_capabilities", JSON.stringify(dslrCapabilities));
    sessionStorage.setItem("booth_dslr_available", String(dslrCameras.length > 0));
    sessionStorage.setItem("booth_dslr_model", dslrCameras[0]?.model ?? "Canon DSLR");
    sessionStorage.setItem("booth_dslr_supports_capture", String(dslrCapabilities?.supportsCapture !== false));
    sessionStorage.setItem("booth_dslr_supports_live_view", String(dslrCapabilities?.supportsLiveView !== false));
    if (agentBase) {
      sessionStorage.setItem("booth_agent_base", agentBase);
    }
    if (agentOnline !== null) {
      sessionStorage.setItem("booth_agent_online", String(agentOnline));
    }
  }, [captureSource, mirror, dslrCameras, dslrCapabilities, agentBase, agentOnline]);

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
    if (captureSource === "dslr") {
      setCamLoading(false);
      return;
    }
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

  const stopCameraPreview = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    if (previewEl) previewEl.srcObject = null;
    setCamLoading(false);
  }, [previewEl, stream]);

  const releaseDslrPreviewStream = useCallback(async () => {
    setDslrPreviewActive(false);
    setDslrPreviewError(null);
    setDslrPreviewFrameSrc(null);
    if (typeof window !== "undefined") {
      // Clear any release delay so CameraScreen starts preview immediately.
      // The agent keeps the preview bridge alive during the transition
      // (STREAM_IDLE_GRACE_MS grace period), so CameraScreen reconnects
      // to an already-running bridge with zero startup delay.
      sessionStorage.removeItem("booth_dslr_stream_release_until");
    }
    if (dslrPreviewImgRef.current) {
      dslrPreviewImgRef.current.removeAttribute("src");
      dslrPreviewImgRef.current.src = "";
    }
    // Brief yield so React can flush the state changes above before navigation.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }, []);

  useEffect(() => {
    if (captureSource === "dslr") {
      stopCameraPreview();
    }
  }, [captureSource, stopCameraPreview]);

  useEffect(() => {
    if (captureSource !== "dslr" || !dslrPreviewActive || typeof window === "undefined") {
      setDslrPreviewFrameSrc(null);
      return;
    }

    const hasIpcPreview = Boolean(window.fremioBooth?.agentPreview);
    const getStreamPreviewUrl = (cacheKey: number): string | null => (
      window.fremioBooth?.agentPreviewStreamUrl?.(cacheKey) ?? (agentBase ? `${agentBase}/preview-stream?t=${cacheKey}` : null)
    );

    if (!hasIpcPreview) {
      const streamUrl = getStreamPreviewUrl(dslrPreviewKey);
      setDslrPreviewFrameSrc(streamUrl);
      if (!streamUrl) {
        setDslrPreviewError("Live view Canon belum tampil. Pastikan mode Live View aktif dan kamera tidak sedang busy.");
      }
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let hasFrame = false;
    let previewStartedAt = Date.now();
    let fallbackTimer: number | null = null;
    let usingStreamFallback = false;
    let lastFetchTime = 0;
    const targetInterval = 1000 / 90; // 90 FPS target for optimal Canon performance

    const switchToStreamFallback = () => {
      if (cancelled || usingStreamFallback) return;
      const streamUrl = getStreamPreviewUrl(Date.now());
      if (!streamUrl) return;

      usingStreamFallback = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      setDslrPreviewError("Menyiapkan live view Canon...");
      setDslrPreviewFrameSrc(streamUrl);

      void restartCanonPreviewBridge("fallback stream");
    };

    const fetchAndSchedule = async () => {
      if (cancelled) return;

      const now = performance.now();
      if (now - lastFetchTime >= targetInterval) {
        try {
          const res = await window.fremioBooth?.agentPreview();
          if (cancelled || usingStreamFallback) return;
          if (res?.ok && res.base64) {
            hasFrame = true;
            if (fallbackTimer !== null) {
              window.clearTimeout(fallbackTimer);
              fallbackTimer = null;
            }
            setDslrPreviewFrameSrc(`data:${res.mimeType || "image/jpeg"};base64,${res.base64}`);
            setDslrPreviewError(null);
          } else if (!hasFrame) {
            if (Date.now() - previewStartedAt >= 1200) {
              void restartCanonPreviewBridge("frame tidak masuk");
              switchToStreamFallback();
              return;
            }
            setDslrPreviewError(res?.error || "Live view Canon belum tampil. Pastikan mode Live View aktif dan kamera tidak sedang busy.");
          }
        } catch (error) {
          if (!cancelled && !hasFrame && !usingStreamFallback) {
            void restartCanonPreviewBridge("preview request gagal");
            switchToStreamFallback();
            if (usingStreamFallback) return;
            setDslrPreviewError(error instanceof Error ? error.message : "Live view Canon belum tampil. Pastikan mode Live View aktif dan kamera tidak sedang busy.");
          }
        }
        lastFetchTime = now;
      }

      if (!usingStreamFallback) {
        rafId = requestAnimationFrame(fetchAndSchedule);
      }
    };

    setDslrPreviewFrameSrc(null);
    setDslrPreviewError(null);
    previewStartedAt = Date.now();
    fallbackTimer = window.setTimeout(() => {
      if (!cancelled && !hasFrame) {
        void restartCanonPreviewBridge("timeout awal live view");
        switchToStreamFallback();
      }
    }, 1800);
    rafId = requestAnimationFrame(fetchAndSchedule);
    return () => {
      cancelled = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [agentBase, captureSource, dslrPreviewActive, dslrPreviewKey, restartCanonPreviewBridge]);

  // ── Check Local Agent & get printers ──────────────────────────────────────
  // Coba endpoint secara BERURUTAN agar tidak membanjiri local agent.
  // Pada halaman HTTPS, gunakan endpoint HTTPS saja untuk menghindari mixed-content block.
  type AgentStatusPayload = {
    camera?: {
      available?: boolean;
      count?: number;
      cameras?: { model: string; port: string }[];
      devices?: { model: string; port: string }[];
      type?: string;
      error?: string;
      capabilities?: {
        supportsCapture?: boolean;
        supportsLiveView?: boolean;
        mode?: string;
      };
    };
    printers?: string[];
    printer?: { printers?: { name: string; isDefault?: boolean }[]; defaultPrinter?: string | null };
  };

  type BridgeStatusPayload = {
    ok?: boolean;
    running?: boolean;
    cameraAvailable?: boolean;
    cameraCount?: number;
    cameraType?: string;
    cameraDevices?: { model?: string; port?: string }[];
    cameraError?: string;
    printers?: string[];
    raw?: AgentStatusPayload;
  };

  const hasDslrCamera = (value: AgentStatusPayload | null) => {
    const cameraList = value?.camera?.cameras ?? value?.camera?.devices ?? [];
    return cameraList.length > 0 || Boolean(value?.camera?.available) || (value?.camera?.count ?? 0) > 0;
  };

  const buildCanonFallbackStatus = (base?: AgentStatusPayload | null): AgentStatusPayload => ({
    ...(base ?? {}),
    camera: {
      ...(base?.camera ?? {}),
      available: true,
      count: Math.max(base?.camera?.count ?? 0, 1),
      cameras: base?.camera?.cameras?.length ? base.camera.cameras : [{ model: "Canon DSLR", port: "edsdk:0" }],
      devices: base?.camera?.devices?.length ? base.camera.devices : [{ model: "Canon DSLR", port: "edsdk:0" }],
      type: "dslr",
      capabilities: {
        supportsCapture: true,
        supportsLiveView: true,
        mode: "live-view",
        ...(base?.camera?.capabilities ?? {}),
      },
    },
  });

  const checkAgent = useCallback(async () => {
    if (!canUseLocalAgent()) { setAgentOnline(false); return; }

    if (agentCheckInFlightRef.current) return;

    setAgentChecking(true);

    const run = async () => {
      let status: AgentStatusPayload | null = null;
      let lastError: unknown = null;

      // ── 1. Coba IPC Electron (booth-windows-app) ──
      if (typeof window !== "undefined" && window.fremioBooth?.getBridgeStatus) {
        const bridgeRes = await new Promise<BridgeStatusPayload | null>((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(null);
          }, 12000);

          window.fremioBooth?.getBridgeStatus?.()
            .then((value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve(value as BridgeStatusPayload);
            })
            .catch((error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              lastError = error;
              resolve(null);
            });
        });

        if (bridgeRes && (bridgeRes.ok || bridgeRes.running)) {
          const raw = bridgeRes.raw ?? {};
          const bridgeDevices = Array.isArray(bridgeRes.cameraDevices)
            ? bridgeRes.cameraDevices.map((cam, index) => ({
                model: String(cam?.model || `Canon DSLR ${index + 1}`),
                port: String(cam?.port || `edsdk:${index}`),
              }))
            : [];
          const rawDevices = raw.camera?.cameras ?? raw.camera?.devices ?? [];
          const devices = bridgeDevices.length > 0 ? bridgeDevices : rawDevices;
          const count = bridgeRes.cameraCount ?? raw.camera?.count ?? devices.length;
          const available = Boolean(bridgeRes.cameraAvailable ?? raw.camera?.available ?? count > 0);
          status = {
            ...raw,
            printers: bridgeRes.printers ?? raw.printers,
            camera: {
              ...(raw.camera ?? {}),
              available,
              count,
              cameras: devices,
              devices,
              type: bridgeRes.cameraType ?? raw.camera?.type,
              error: bridgeRes.cameraError ?? raw.camera?.error,
              capabilities: raw.camera?.capabilities ?? (available ? {
                supportsCapture: true,
                supportsLiveView: true,
                mode: "live-view",
              } : undefined),
            },
          };
          setAgentBase("http://127.0.0.1:7432");
        }
      }

      if (typeof window !== "undefined" && window.fremioBooth?.agentStatus) {
        const ipcRes = await new Promise<{ ok: boolean; payload?: unknown; error?: string }>((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ ok: false, error: "Agent status IPC timeout" });
          }, 12000);

          window.fremioBooth?.agentStatus()
            .then((value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve(value);
            })
            .catch((error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              lastError = error;
              resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
            });
        });

        if (!status && ipcRes.ok && ipcRes.payload) {
          status = ipcRes.payload as AgentStatusPayload;
          setAgentBase("http://127.0.0.1:7432");
        } else if (!ipcRes.ok) {
          lastError = new Error(ipcRes.error || "Agent status IPC gagal");
        }
      }

      // ── 2. Fallback: direct HTTP fetch ──
      if (!status) {
        const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
        // Agent ports: 7432 = Electron app (embedded), 3002 = browser/development
        const candidates = isHttps
          ? [
              "https://127.0.0.1:7432",
              "https://127.0.0.1:3002",
              "https://localhost:7432",
              "https://localhost:3002",
            ]
          : [
              "http://127.0.0.1:7432",
              "http://127.0.0.1:3002",
              "http://localhost:7432",
              "http://localhost:3002",
            ];

        for (const base of candidates) {
          try {
            const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(9000) });
            if (!res.ok) throw new Error(`status ${res.status}`);
            status = await res.json() as AgentStatusPayload;
            setAgentBase(base);
            break;
          } catch (error) {
            lastError = error;
          }
        }
      }

      if ((!status || !hasDslrCamera(status)) && typeof window !== "undefined" && window.fremioBooth?.agentPreview) {
        const previewRes = await new Promise<{ ok: boolean; base64?: string }>((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ ok: false });
          }, 9000);

          window.fremioBooth?.agentPreview()
            .then((value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolve({ ok: Boolean(value?.ok), base64: value?.base64 });
            })
            .catch((error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              lastError = error;
              resolve({ ok: false });
            });
        });

        if (previewRes.ok && previewRes.base64) {
          status = buildCanonFallbackStatus(status);
          setAgentBase("http://127.0.0.1:7432");
        }
      }

      if (status && !hasDslrCamera(status) && typeof window !== "undefined" && window.fremioBooth) {
        status = buildCanonFallbackStatus(status);
      }

      if (!status && typeof window !== "undefined" && window.fremioBooth) {
        status = buildCanonFallbackStatus(null);
        setAgentBase("http://127.0.0.1:7432");
      }

      if (!status) {
        throw lastError instanceof Error ? lastError : new Error("Agent tidak dapat dijangkau");
      }

      setAgentOnline(true);
      const cameraList = status.camera?.cameras ?? status.camera?.devices ?? [];
      const cams = cameraList.length > 0
        ? cameraList.map((cam, index) => ({
            model: cam?.model || `Canon DSLR ${index + 1}`,
            port: cam?.port || `edsdk:${index}`,
          }))
        : (status.camera?.available || (status.camera?.count ?? 0) > 0)
          ? [{ model: "Canon DSLR", port: "edsdk:0" }]
          : [];
      setDslrCameras(cams);
      setDslrCapabilities(status.camera?.capabilities ?? null);

      const printerList = status.printer?.printers?.map((p: { name: string }) => p.name) ?? status.printers ?? [];
      setPrinters(printerList);

      if (!printerName) {
        const defaultPrinter = status.printer?.defaultPrinter ?? null;
        const nextPrinter = defaultPrinter || printerList[0] || null;
        setPrinterName(nextPrinter);
        if (nextPrinter) setManualPrinter(nextPrinter);
      }
    };

    const promise = run();
    agentCheckInFlightRef.current = promise;

    const hardTimeout = setTimeout(() => {
      agentCheckInFlightRef.current = null;
      setAgentChecking(false);
    }, 15000);

    try {
      await promise;
    } catch {
      setAgentOnline(false);
      // Jangan reset dslrCameras / agentBase / captureSource — biarkan persistence tetap ada
      // agar user tetap bisa lihat live view dan kamera list meski verify gagal sementara
      setPrinters([]);
    } finally {
      clearTimeout(hardTimeout);
      agentCheckInFlightRef.current = null;
      setAgentChecking(false);
    }
  }, [captureSource, printerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { checkAgent(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isTabletMode) return;
    if (agentOnline === true && dslrCameras.length > 0) return;

    const id = setInterval(() => {
      void checkAgent();
    }, 5000);

    return () => clearInterval(id);
  }, [agentOnline, checkAgent, dslrCameras.length, isTabletMode]);

  // ── Done ──────────────────────────────────────────────────────────────────
  const handleDone = async () => {
    if (startingBooth) return;
    setStartingBooth(true);
    stream?.getTracks().forEach(t => t.stop());
    if (captureSource === "dslr") {
      await releaseDslrPreviewStream();
    }
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
    try {
      if (deviceId) sessionStorage.setItem("booth_camera_deviceId", deviceId);
      else          sessionStorage.removeItem("booth_camera_deviceId");
      sessionStorage.setItem("booth_camera_mirror", String(mirror));
      sessionStorage.setItem("booth_camera_source", captureSource);
      if (captureSource !== "dslr") {
        sessionStorage.removeItem("booth_dslr_stream_release_until");
      }
      if (captureSource === "dslr") {
        if (agentBase) sessionStorage.setItem("booth_agent_base", agentBase);
        sessionStorage.setItem("booth_dslr_available", String(dslrCameras.length > 0));
        sessionStorage.setItem("booth_dslr_model", dslrCameras[0]?.model ?? "Canon DSLR");
        sessionStorage.setItem("booth_dslr_supports_capture", String(dslrCapabilities?.supportsCapture !== false));
        sessionStorage.setItem("booth_dslr_supports_live_view", String(dslrCapabilities?.supportsLiveView !== false));
      } else {
        sessionStorage.removeItem("booth_agent_base");
        sessionStorage.removeItem("booth_dslr_available");
        sessionStorage.removeItem("booth_dslr_model");
        sessionStorage.removeItem("booth_dslr_supports_capture");
        sessionStorage.removeItem("booth_dslr_supports_live_view");
      }
    } catch {
      // Ignore storage quota issues; runtime state remains in memory.
    }
    onDone(settings);
  };

  const handleReset = () => {
    try {
      localStorage.removeItem(`${STORAGE_KEY}_${booth.slug}`);
    } catch {
      // Ignore storage failures.
    }
    window.location.reload();
  };

  const handleRefreshPrinter = () => {
    void checkAgent();
  };

  const dslrSelectedAndReady = captureSource === "dslr" && agentOnline === true && dslrCameras.length > 0;
  const canStartBooth = dslrSelectedAndReady || (!camLoading && !camError);
  const setupDslrUsesIpcPreview = typeof window !== "undefined" && Boolean(window.fremioBooth?.agentPreview);
  const setupDslrPreviewSrc = setupDslrUsesIpcPreview
    ? dslrPreviewFrameSrc
    : (typeof window !== "undefined" ? window.fremioBooth?.agentPreviewStreamUrl?.(dslrPreviewKey) : undefined) ?? (agentBase ? `${agentBase}/preview-stream?t=${dslrPreviewKey}` : null);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  // Responsive breakpoints: mobile <768px → col stack; desktop → 40/60 split
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: primaryColor }}
    >
      <div className="flex-none flex items-center justify-center gap-3 px-4 py-2 border-b"
        style={{ borderColor: surfaceBorder }}>
        {booth.logoUrl && (
          <img
            src={booth.logoUrl}
            alt={booth.boothName}
            className="h-6 w-auto object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div>
          <p className="text-[9px] uppercase tracking-widest leading-none" style={{ color: textTertiary }}>Setup Booth</p>
          <h1 className="text-sm font-bold leading-tight" style={{ color: textPrimary }}>{booth.boothName}</h1>
        </div>
      </div>

      {/* ── Baris 1: Stream preview — tinggi menyesuaikan aspect ratio, max 45% tinggi layar ─── */}
      <div
        className="flex-none relative bg-black flex items-center justify-center overflow-hidden"
        style={{ height: "min(100vw, 45vh)" }}
      >
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {captureSource === "dslr" ? (
            (agentBase || setupDslrUsesIpcPreview) && dslrPreviewActive ? (
              <>
                {setupDslrPreviewSrc ? (
                  <img
                    ref={dslrPreviewImgRef}
                    key={setupDslrUsesIpcPreview ? "ipc-preview" : dslrPreviewKey}
                    src={setupDslrPreviewSrc}
                    alt="Canon live preview"
                    className="w-full h-full object-contain"
                    style={{ transform: mirror ? "scaleX(-1)" : "none", backgroundColor: "#000" }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        setDslrPreviewError(null);
                        setStreamAspect(img.naturalWidth / img.naturalHeight);
                      }
                    }}
                    onError={() => {
                      setDslrPreviewError("Live view Canon belum tampil. Pastikan mode Live View aktif dan kamera tidak sedang busy.");
                      setStreamAspect(null);
                      void restartCanonPreviewBridge("gagal render stream");
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <p className="animate-pulse text-xs" style={{ color: textPrimary }}>Menyiapkan live view Canon…</p>
                  </div>
                )}
              {dslrPreviewError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center bg-black/70">
                  <span className="text-2xl">📷</span>
                  <p className="text-xs" style={{ color: textSecondary }}>{dslrPreviewError}</p>
                  <button
                    onClick={() => {
                      setDslrPreviewError(null);
                      setDslrPreviewFrameSrc(null);
                      void restartCanonPreviewBridge("manual retry").then((restarted) => {
                        if (!restarted) setDslrPreviewKey(Date.now());
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: accentColor, color: primaryColor }}
                  >
                    Coba Live View Lagi
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="text-3xl">📷</span>
              <p className="text-xs" style={{ color: textSecondary }}>
                Canon dipilih — live view belum tersedia.
              </p>
              <p className="text-[10px]" style={{ color: textTertiary }}>
                Pastikan Live View aktif di kamera.
              </p>
            </div>
          )
        ) : camError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="text-3xl">📷</span>
            <p className="text-xs" style={{ color: textSecondary }}>{camError}</p>
            <button onClick={() => startCamera(deviceId)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ backgroundColor: accentColor, color: primaryColor }}>
              Coba Lagi
            </button>
          </div>
        ) : (
          <>
            <video
              ref={el => setPreviewEl(el)}
              autoPlay playsInline muted
              className="w-full h-full object-contain"
              style={{ transform: mirror ? "scaleX(-1)" : "none", backgroundColor: "#000" }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth > 0 && v.videoHeight > 0) {
                  setStreamAspect(v.videoWidth / v.videoHeight);
                }
              }}
            />
            {camLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="animate-pulse text-xs" style={{ color: textPrimary }}>Memuat kamera…</p>
              </div>
            )}
          </>
        )}
        </div>
        {/* Mirror badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {mirror && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(0,0,0,0.55)", color: accentColor }}>
              ⟷ Mirror
            </span>
          )}
          <button onClick={() => setMirror(v => !v)}
            className="px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.55)", color: textSecondary }}>
            {mirror ? "⟷ ON" : "⟷ OFF"}
          </button>
        </div>
        {/* DSLR status badge */}
        {captureSource === "dslr" && dslrCameras.length > 0 && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(0,0,0,0.55)", color: accentColor }}>
              📷 {dslrCameras[0]?.model ?? "Canon DSLR"}
            </span>
          </div>
        )}
        {/* Agent status */}
        {!isTabletMode && agentOnline === null && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(0,0,0,0.55)", color: textTertiary }}>
              Mengecek agent…
            </span>
          </div>
        )}
        {!isTabletMode && agentOnline === true && dslrCameras.length > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] font-bold" style={{ color: "#86efac" }}>Agent aktif — {dslrCameras.length} kamera</span>
          </div>
        )}
        {!isTabletMode && agentOnline === false && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[10px] font-bold" style={{ color: "#fde047" }}>Agent offline</span>
          </div>
        )}
      </div>

      {/* ── Baris 2: Webcam selector (kiri) + Printer (kanan) ────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Kiri: Webcam selector ── */}
        <div className="w-2/5 flex flex-col overflow-hidden border-r"
          style={{ borderColor: surfaceBorder, background: surfaceBg }}>
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 flex-none">
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textSecondary }}>
              WEBCAM
            </p>
            {devices.length > 0 && (
              <span className="text-[10px] font-bold" style={{ color: accentColor }}>
                {devices.length} terdeteksi
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
            {/* Webcam browser option */}
            <button
              onClick={() => { setCaptureSource("webcam"); startCamera(deviceId); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-left transition-colors"
              style={{
                background: captureSource === "webcam" ? `${accentColor}22` : "transparent",
                border: captureSource === "webcam" ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                color: captureSource === "webcam" ? accentColor : textPrimary,
              }}
            >
              <span>🎬</span>
              <span className="flex-1 truncate">Webcam Browser</span>
              {captureSource === "webcam" && <span className="font-bold text-[10px]">✓</span>}
            </button>
            {devices.map(d => (
              <button key={d.deviceId} onClick={() => switchCamera(d.deviceId)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-left transition-colors"
                style={{
                  background: d.deviceId === deviceId && captureSource === "webcam" ? `${accentColor}22` : "transparent",
                  border: d.deviceId === deviceId && captureSource === "webcam" ? `1.5px solid ${accentColor}` : "1px solid transparent",
                  color: d.deviceId === deviceId && captureSource === "webcam" ? accentColor : textPrimary,
                }}>
                <span>🎥</span>
                <span className="flex-1 truncate">{d.label}</span>
                {d.deviceId === deviceId && captureSource === "webcam" && <span className="font-bold text-[10px]">✓</span>}
              </button>
            ))}
            {devices.length === 0 && !camError && (
              <p className="text-[11px]" style={{ color: textTertiary }}>Mendeteksi webcam…</p>
            )}
            {/* DSLR list (non-mobile only) */}
            {!isTabletMode && (
              <div className="pt-2 border-t" style={{ borderColor: surfaceBorder }}>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: textSecondary }}>
                  DSLR / CANON
                </p>
                {dslrCameras.length > 0 ? (
                  <div className="space-y-1">
                    {dslrCameras.map((cam, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          stopCameraPreview();
                          // Auto-reset Canon: kill bridges + terminate/re-init EDSDK = like unplug/replug USB.
                          if (agentBase) {
                            fetch(`${agentBase}/camera-reset`, { method: "POST" })
                              .catch(() => { /* ignore — preview will restart anyway */ });
                          }
                          setDslrPreviewActive(true);
                          setDslrPreviewError(null);
                          setDslrPreviewKey(Date.now());
                          setCaptureSource("dslr");
                          setDeviceId(null);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-left transition-colors"
                        style={{
                          background: captureSource === "dslr" ? `${accentColor}22` : `${accentColor}15`,
                          border: captureSource === "dslr" ? `1.5px solid ${accentColor}` : `1.5px solid ${accentColor}44`,
                          color: captureSource === "dslr" ? accentColor : textPrimary,
                        }}
                      >
                        <span>📷</span>
                        <span className="flex-1 truncate">{cam.model}</span>
                        {captureSource === "dslr" ? (
                          <span className="font-bold text-[10px]">✓</span>
                        ) : (
                          <span className="text-[10px]" style={{ color: "#86efac" }}>tapilih</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className="rounded-xl px-2.5 py-2 text-[11px] cursor-pointer"
                    style={{ background: `${surfaceBorder}44`, color: textTertiary }}
                    onClick={() => {
                      // Retry: reset Canon + re-detect
                      if (agentBase) {
                        fetch(`${agentBase}/camera-reset`, { method: "POST" }).catch(() => { /* ignore */ });
                      }
                      checkAgent();
                    }}
                  >
                    {agentOnline === null ? "Mendeteksi Canon…" : "Canon belum terdeteksi — klik untuk reset"}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Kanan: Printer ── */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: surfaceBg }}>
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 flex-none border-b" style={{ borderColor: surfaceBorder }}>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textSecondary }}>
              PRINTER
            </p>
            <button
              onClick={handleRefreshPrinter}
              disabled={agentChecking}
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold disabled:opacity-40"
              style={{ background: `${accentColor}22`, color: accentColor }}
            >
              {agentChecking ? "…" : "🔄"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {/* Printer selected status */}
            <div className="rounded-xl px-2.5 py-1.5 text-[11px] font-semibold" style={{ background: `${accentColor}18`, color: accentColor }}>
              {printerName
                ? `✓ ${printerName}`
                : manualPrinter.trim()
                  ? `✓ ${manualPrinter.trim()}`
                  : "Dialog Printer"}
            </div>
            {/* Default / Dialog */}
            <button
              onClick={() => { setPrinterName(null); setManualPrinter(""); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-left"
              style={{
                background: !printerName && !manualPrinter.trim() ? `${accentColor}22` : "transparent",
                border: `1px solid ${!printerName && !manualPrinter.trim() ? accentColor : surfaceBorder}`,
                color: !printerName && !manualPrinter.trim() ? accentColor : textPrimary,
              }}
            >
              <span>🖨️</span>
              <span className="flex-1 truncate">Dialog Printer</span>
              {!printerName && !manualPrinter.trim() && <span className="font-bold text-[10px]">✓</span>}
            </button>
            {/* Detected printers */}
            {printers.map((name) => (
              <button
                key={name}
                onClick={() => { setPrinterName(name); setManualPrinter(name); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-left"
                style={{
                  background: printerName === name ? `${accentColor}22` : "transparent",
                  border: `1px solid ${printerName === name ? accentColor : surfaceBorder}`,
                  color: printerName === name ? accentColor : textPrimary,
                }}
              >
                <span>🖨️</span>
                <span className="flex-1 truncate">{name}</span>
                {printerName === name && <span className="font-bold text-[10px]">✓</span>}
              </button>
            ))}
            {/* Manual input fallback */}
            {printers.length === 0 && (
              <input
                value={manualPrinter}
                onChange={(e) => {
                  setManualPrinter(e.target.value);
                  setPrinterName(e.target.value.trim() || null);
                }}
                placeholder="Ketik nama printer manual"
                className="w-full px-2.5 py-1.5 rounded-xl text-xs outline-none"
                style={{ background: "transparent", border: `1.5px solid ${surfaceBorder}`, color: textPrimary }}
              />
            )}

            {/* Paper size */}
            <div className="pt-2 border-t" style={{ borderColor: surfaceBorder }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: textSecondary }}>
                UKURAN KERTAS
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setPaperSizeOverride(null)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                  style={{
                    background: paperSizeOverride === null ? `${accentColor}22` : "transparent",
                    border: `1px solid ${paperSizeOverride === null ? accentColor : surfaceBorder}`,
                    color: paperSizeOverride === null ? accentColor : textTertiary,
                  }}
                >
                  Auto
                </button>
                {getAllPaperSizes().map(ps => (
                  <button
                    key={ps.name}
                    onClick={() => setPaperSizeOverride(ps.name)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    style={{
                      background: paperSizeOverride === ps.name ? `${accentColor}22` : "transparent",
                      border: `1px solid ${paperSizeOverride === ps.name ? accentColor : surfaceBorder}`,
                      color: paperSizeOverride === ps.name ? accentColor : textTertiary,
                    }}
                  >
                    {ps.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer CTA ─────────────────────────────────────────────────────── */}
      <div className="flex-none px-4 py-3 flex flex-col gap-1.5 border-t" style={{ borderColor: surfaceBorder }}>
        <button
          onClick={handleDone}
          disabled={!canStartBooth}
          className="w-full py-3 rounded-2xl text-base font-black active:scale-95 transition-all disabled:opacity-40"
          style={{ backgroundColor: accentColor, color: primaryColor }}
        >
          {captureSource === "dslr" && !dslrSelectedAndReady
            ? "Menunggu Canon terdeteksi…"
            : camLoading && captureSource !== "dslr"
              ? "Memuat kamera…"
              : "▶ Mulai Booth"}
        </button>
        <button onClick={handleReset}
          className="w-full text-center text-[11px] py-0.5" style={{ color: textTertiary }}>
          Reset pengaturan
        </button>
        {!isTabletMode && (
          <button
            onClick={async () => {
              setAgentLogsOpen(true);
              setAgentLogsData(null);
              try {
                const logs = await window.fremioBooth?.getAgentLogs?.();
                setAgentLogsData(logs ?? null);
              } catch {
                setAgentLogsData(null);
              }
            }}
            className="w-full text-center text-[11px] py-0.5"
            style={{ color: textTertiary }}>
            Lihat Log Agent
          </button>
        )}
      </div>

      {/* ── Agent Logs Modal ─────────────────────────────────────────────── */}
      {agentLogsOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setAgentLogsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-4 flex flex-col gap-3 max-h-[80vh] overflow-hidden"
            style={{ background: surfaceBg, border: `1px solid ${surfaceBorder}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: textPrimary }}>Log Agent</p>
              <button
                onClick={() => setAgentLogsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: surfaceBorder, color: textSecondary }}
              >
                ✕
              </button>
            </div>
            <p className="text-[11px]" style={{ color: textTertiary }}>
              {agentLogsData
                ? `PID: ${agentLogsData.pid ?? "none"} | Running: ${agentLogsData.running}`
                : "Memuat..."}
            </p>
            <div className="flex flex-col gap-2 overflow-y-auto">
              <div>
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: textSecondary }}>STDOUT</p>
                <textarea
                  readOnly
                  rows={6}
                  value={agentLogsData ? agentLogsData.stdout.slice(-3000) : ""}
                  className="w-full rounded-xl text-[11px] px-3 py-2 resize-none outline-none"
                  style={{
                    background: "#1e1e1e",
                    color: "#d4d4d4",
                    fontFamily: "Consolas, monospace",
                    border: `1px solid ${surfaceBorder}`,
                  }}
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: textSecondary }}>STDERR</p>
                <textarea
                  readOnly
                  rows={6}
                  value={agentLogsData ? agentLogsData.stderr.slice(-3000) : ""}
                  className="w-full rounded-xl text-[11px] px-3 py-2 resize-none outline-none"
                  style={{
                    background: "#1e1e1e",
                    color: "#d4d4d4",
                    fontFamily: "Consolas, monospace",
                    border: `1px solid ${surfaceBorder}`,
                  }}
                />
              </div>
            </div>
            <button
              onClick={async () => {
                if (!agentLogsData) return;
                const text = `=== FREMIO AGENT LOG ===\nPID: ${agentLogsData.pid ?? "none"} | Running: ${agentLogsData.running}\n\n--- STDOUT ---\n${agentLogsData.stdout.slice(-3000)}\n\n--- STDERR ---\n${agentLogsData.stderr.slice(-3000)}`;
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  window.prompt("Salin manual (Ctrl+C):", text);
                }
              }}
              className="w-full py-2 rounded-xl text-xs font-bold"
              style={{ background: `${accentColor}22`, color: accentColor }}
            >
              Salin ke Clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
