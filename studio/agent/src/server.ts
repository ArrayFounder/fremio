/**
 * Fremio Studio Local Agent
 *
 * Jalan di mesin booth (background process).
 * Browser booth UI berkomunikasi via HTTP ke localhost:3002.
 *
 * Fitur:
 *  - GET  /status      → health check + info printer tersedia
 *  - GET  /printers    → list semua printer di OS
 *  - POST /print       → cetak foto tanpa dialog
 *
 * Cross-platform: Windows ✓  macOS ✓
 * Tidak ada dependency native; hanya memanggil OS print command.
 */

import express, { Request, Response } from "express";
import cors   from "cors";
import https  from "https";
import http   from "http";
import fs     from "fs";
import path   from "path";
import os     from "os";
import { execFile, exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PORT    = Number(process.env.AGENT_PORT ?? 3002);
const VERSION = "1.0.14";
const MAX_LOG_LINES = 500;

// ── In-memory circular log buffer ─────────────────────────────────────────────
// Captures all console output so user can retrieve via GET /logs
const logBuffer: string[] = [];
const startTime = Date.now();

function captureLog(prefix: string, ...args: unknown[]) {
  const ts = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logBuffer.push(`${ts} [${prefix}] ${msg}`);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
}

// Monkey-patch console.log / console.error / console.warn to capture all output
const origLog   = console.log;
const origError = console.error;
const origWarn  = console.warn;

console.log = (...args: unknown[]) => {
  captureLog('INFO', ...args);
  origLog.apply(console, args);
};
console.error = (...args: unknown[]) => {
  captureLog('ERROR', ...args);
  origError.apply(console, args);
};
console.warn = (...args: unknown[]) => {
  captureLog('WARN', ...args);
  origWarn.apply(console, args);
};

// ── App setup ────────────────────────────────────────────────────────────────

const app = express();
const activePreviewStreams = new Set<ReturnType<typeof spawn>>();
type CameraStatusResult = {
  available: boolean;
  count: number;
  devices: { model: string; port: string }[];
  type: "dslr" | "none";
  error?: string;
  capabilities?: {
    supportsCapture?: boolean;
    supportsLiveView?: boolean;
    mode?: "live-view" | "capture-only";
  };
};
type PreviewFrameWaiter = {
  resolve: (frame: Buffer) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type PreviewFrameSubscriber = (frame: Buffer) => void;
let sharedPreviewProcess: ReturnType<typeof spawn> | null = null;
let sharedPreviewBuffer = Buffer.alloc(0);
let latestPreviewFrame: Buffer | null = null;
let latestPreviewFrameAt = 0;
let previewFrameCount = 0;
let previewFpsLastLoggedAt = 0;
const PREVIEW_FPS_LOG_INTERVAL_MS = 5000;
const previewFrameWaiters = new Set<PreviewFrameWaiter>();
const previewFrameSubscribers = new Set<PreviewFrameSubscriber>();
let previewIdleTimer: ReturnType<typeof setTimeout> | null = null;
let lastPreviewConsumerAt = 0;
let cameraStatusCache: CameraStatusResult | null = null;
let cameraStatusCacheAt = 0;
let cameraStatusInFlight: Promise<CameraStatusResult> | null = null;
let previewStallMonitorTimer: ReturnType<typeof setTimeout> | null = null;
let previewRestartTimer: ReturnType<typeof setTimeout> | null = null;
let previewRestartWindowStartedAt = 0;
let previewRestartAttemptsInWindow = 0;
const plannedPreviewRestarts = new Set<ReturnType<typeof spawn>>();
/** Timestamp when the preview bridge last exited. Used to ensure camera USB port is fully released. */
let lastPreviewBridgeExitedAt = 0;
/** @deprecated — unused, kept for compatibility */
let previewPreStoppedAt = 0;
let captureInProgress = false; // Prevent preview auto-restart during capture
let previewRestartBlockedUntil = 0; // Block preview restart for this window (timestamp). Prevents zombie preview bridge from grabbing USB between /prepare-capture and /capture.
let captureHandlerInFlight = false; // Prevent duplicate /capture calls (separate from captureInProgress)
let preArmedCaptureInFlight: ArmedCaptureState | null = null; // Guard: prevent second SHOOT during BRIDGE_READY wait
/** Atomic lock — set the moment pre-armed SHOOT fires. Prevents inline path from firing a second SHOOT. */
let preArmedShootFired = false;
/** Latest capture result — filled after shootFn() fires, consumed by GET /get-capture-result */
let latestCaptureResult: { path: string; shootFiredAt: number; captureDoneAt: number } | null = null;
/** Pending result resolver — resolves the GET /get-capture-result response */
let pendingCaptureResultResolver: ((path: string) => void) | null = null;
/** Timestamp of last SHOOT — prevents double firing between pre-armed and inline paths */
let shootLastFiredAt = 0;
/** Timestamp of last image captured — prevents inline path from firing SHOOT if pre-armed already shot */
let imageCapturedAt = 0;
/** Set to Date.now() when SHOOT fires — prevents second SHOOT from timeout or inline path */
let captureLockFiredAt = 0;
/** Timestamp when armed bridge last exited. Used to ensure next capture waits for camera USB to be free. */
let lastArmedBridgeExitedAt = 0;
/** Timestamp when an inline capture bridge last exited. Used to prevent USB conflicts. */
let lastInlineCaptureBridgeExitedAt = 0;
/**
 * Pending capture responses keyed by a session ID.
 * @deprecated — replaced by streamingJPEG mechanism.
 */
const pendingCaptures = new Map<string, { res: Response; wantsBinary: boolean }>();
/**
 * For streaming JPEG delivery: the Response object of the in-flight /capture call.
 * shootFn writes JPEG directly to this response after SHOOT fires.
 * CameraScreen reads JPEG directly from the streaming response — no file polling.
 */
let pendingCaptureResponse: Response | null = null;

interface ArmedCaptureState {
  outputPath: string;
  process: ReturnType<typeof spawn>;
  /** Resolves when BRIDGE_READY is printed to stderr */
  readyPromise: Promise<void>;
  /** Send SHOOT command to the armed bridge */
  shootFn: () => void;
  /** Resolves with output path when bridge exits (0=success), rejects on non-zero */
  completionPromise: Promise<string>;
}
let armedCapture: ArmedCaptureState | null = null;


const CAMERA_STATUS_CACHE_MS = 4000;
const PREVIEW_STALL_TIMEOUT_MS = 3500;
const PREVIEW_RESTART_WINDOW_MS = 30_000;
const PREVIEW_RESTART_MAX_IN_WINDOW = 6;
const PREVIEW_RESTART_KILL_GRACE_MS = 100; // OPTIMIZED: was 350ms — faster preview kill
const PREVIEW_RESTART_START_DELAY_MS = 100; // OPTIMIZED: was 650ms — faster preview recovery

function isRunning(child: ReturnType<typeof spawn> | null): child is ReturnType<typeof spawn> {
  return !!child && !child.killed && child.exitCode === null;
}

function failPreviewFrameWaiters(error: Error) {
  for (const waiter of Array.from(previewFrameWaiters)) {
    clearTimeout(waiter.timer);
    previewFrameWaiters.delete(waiter);
    waiter.reject(error);
  }
}

function publishPreviewFrame(frame: Buffer) {
  latestPreviewFrame = Buffer.from(frame);
  latestPreviewFrameAt = Date.now();
  previewFrameCount++;
  const now = Date.now();
  const fpsElapsed = now - previewFpsLastLoggedAt;
  if (fpsElapsed >= PREVIEW_FPS_LOG_INTERVAL_MS && previewFrameCount > 0) {
    const fps = Math.round((previewFrameCount / fpsElapsed) * 1000);
    console.log(`[agent] Live view FPS: ~${fps} (${previewFrameCount} frames in ${fpsElapsed}ms)`);
    previewFrameCount = 0;
    previewFpsLastLoggedAt = now;
  }
  previewRestartAttemptsInWindow = 0;
  previewRestartWindowStartedAt = 0;

  for (const subscriber of Array.from(previewFrameSubscribers)) {
    try {
      subscriber(latestPreviewFrame);
    } catch {
      previewFrameSubscribers.delete(subscriber);
    }
  }

  for (const waiter of Array.from(previewFrameWaiters)) {
    clearTimeout(waiter.timer);
    previewFrameWaiters.delete(waiter);
    waiter.resolve(latestPreviewFrame);
  }

  armPreviewStallMonitor();
}

function stopSharedPreviewProcess() {
  if (previewStallMonitorTimer) {
    clearTimeout(previewStallMonitorTimer);
    previewStallMonitorTimer = null;
  }
  if (previewRestartTimer) {
    clearTimeout(previewRestartTimer);
    previewRestartTimer = null;
  }
  plannedPreviewRestarts.clear();

  const child = sharedPreviewProcess;
  if (!isRunning(child)) {
    sharedPreviewProcess = null;
    sharedPreviewBuffer = Buffer.alloc(0);
    return;
  }

  child.stdin?.end();
  setTimeout(() => {
    if (!child.killed && child.exitCode === null) {
      child.kill();
    }
  }, 50); // OPTIMIZED: faster graceful kill
}

function scheduleSharedPreviewStop(delayMs = 5000) { // Keep bridge alive long enough for CameraScreen to pick up after BoothSetupScreen
  if (previewIdleTimer) clearTimeout(previewIdleTimer);
  previewIdleTimer = setTimeout(() => {
    previewIdleTimer = null;
    if (previewFrameSubscribers.size > 0) return;
    // Always reschedule — keep preview alive even when no browser consumer is active.
    // Camera's live view stays ON so it responds instantly when the booth session starts.
    scheduleSharedPreviewStop(delayMs);
  }, delayMs);
}

function markPreviewConsumer() {
  lastPreviewConsumerAt = Date.now();
  if (previewIdleTimer) {
    clearTimeout(previewIdleTimer);
    previewIdleTimer = null;
  }
  armPreviewStallMonitor();
}

function hasPreviewDemand() {
  return (
    previewFrameSubscribers.size > 0 ||
    previewFrameWaiters.size > 0 ||
    Date.now() - lastPreviewConsumerAt < 2000
  );
}

function armPreviewStallMonitor(delayMs = PREVIEW_STALL_TIMEOUT_MS) {
  if (previewStallMonitorTimer) clearTimeout(previewStallMonitorTimer);

  previewStallMonitorTimer = setTimeout(() => {
    previewStallMonitorTimer = null;
    if (!isRunning(sharedPreviewProcess)) return;
    if (!hasPreviewDemand()) return;

    const staleForMs = latestPreviewFrameAt > 0
      ? Date.now() - latestPreviewFrameAt
      : Number.POSITIVE_INFINITY;

    if (staleForMs >= PREVIEW_STALL_TIMEOUT_MS) {
      restartSharedPreviewProcess(`frame live view macet ${Math.round(staleForMs)}ms`);
      return;
    }

    armPreviewStallMonitor(PREVIEW_STALL_TIMEOUT_MS);
  }, delayMs);
}

function restartSharedPreviewProcess(reason: string) {
  if (!hasPreviewDemand()) return;

  const now = Date.now();
  if (previewRestartWindowStartedAt === 0 || now - previewRestartWindowStartedAt > PREVIEW_RESTART_WINDOW_MS) {
    previewRestartWindowStartedAt = now;
    previewRestartAttemptsInWindow = 0;
  }

  if (previewRestartAttemptsInWindow >= PREVIEW_RESTART_MAX_IN_WINDOW) {
    console.error(`[agent] Preview recovery dihentikan sementara: terlalu sering restart (${previewRestartAttemptsInWindow}/${PREVIEW_RESTART_MAX_IN_WINDOW}).`);
    armPreviewStallMonitor(PREVIEW_RESTART_WINDOW_MS);
    return;
  }

  previewRestartAttemptsInWindow += 1;
  console.warn(`[agent] Preview recovery #${previewRestartAttemptsInWindow}: ${reason}`);

  if (previewStallMonitorTimer) {
    clearTimeout(previewStallMonitorTimer);
    previewStallMonitorTimer = null;
  }

  const current = sharedPreviewProcess;
  sharedPreviewProcess = null;
  sharedPreviewBuffer = Buffer.alloc(0);

  if (isRunning(current)) {
    plannedPreviewRestarts.add(current);
    current.stdin?.end();
    setTimeout(() => {
      if (!current.killed && current.exitCode === null) {
        current.kill();
      }
    }, PREVIEW_RESTART_KILL_GRACE_MS);
  }

  if (previewRestartTimer) clearTimeout(previewRestartTimer);
  const tryStartRecoveredPreview = () => {
    previewRestartTimer = null;
    if (!hasPreviewDemand()) return;

    if (isRunning(current)) {
      current.kill();
      previewRestartTimer = setTimeout(tryStartRecoveredPreview, 220);
      return;
    }

    try {
      startSharedPreviewProcess();
      armPreviewStallMonitor();
    } catch (error) {
      console.error("[agent] Preview recovery gagal start ulang:", error);
      armPreviewStallMonitor(1200);
    }
  };
  previewRestartTimer = setTimeout(tryStartRecoveredPreview, PREVIEW_RESTART_START_DELAY_MS);
}

function updateCameraStatusCache(status: CameraStatusResult) {
  cameraStatusCache = status;
  cameraStatusCacheAt = Date.now();
}

function isPreviewSessionActive() {
  return (
    isRunning(sharedPreviewProcess) ||
    previewFrameSubscribers.size > 0 ||
    previewFrameWaiters.size > 0 ||
    Date.now() - lastPreviewConsumerAt < 1500
  );
}

function buildPreviewActiveCameraStatus(): CameraStatusResult {
  const cachedDevices = cameraStatusCache?.devices ?? [];
  const devices = cachedDevices.length > 0
    ? cachedDevices
    : [{ model: "Canon DSLR", port: "edsdk:0" }];

  return {
    available: true,
    count: devices.length,
    devices,
    type: "dslr",
    capabilities: {
      supportsCapture: true,
      supportsLiveView: true,
      mode: "live-view",
    },
  };
}

async function getCameraStatusForRoute(): Promise<CameraStatusResult> {
  if (isPreviewSessionActive()) {
    const liveStatus = buildPreviewActiveCameraStatus();
    updateCameraStatusCache(liveStatus);
    return liveStatus;
  }

  if (cameraStatusCache && Date.now() - cameraStatusCacheAt < CAMERA_STATUS_CACHE_MS) {
    return cameraStatusCache;
  }

  if (!cameraStatusInFlight) {
    cameraStatusInFlight = detectCameras()
      .then((status) => {
        updateCameraStatusCache(status);
        return status;
      })
      .finally(() => {
        cameraStatusInFlight = null;
      });
  }

  return cameraStatusInFlight;
}

function startSharedPreviewProcess() {
  if (isRunning(sharedPreviewProcess)) return;

  // FIX 2: Don't restart preview while an armed capture bridge is holding the camera.
  // This prevents the preview bridge from colliding with the armed bridge on USB.
  if (armedCapture) {
    console.log("[agent] startSharedPreviewProcess: blocked (armedCapture active)");
    return;
  }

  // FIX 6: Don't restart preview during capture preparation (/prepare-capture sets captureInProgress).
  // Without this, a restarted preview can grab the USB session before the armed bridge spawns,
  // causing 0x000000C0 CommPortIsAlreadyOpen on ALL 8 armed bridge retries.
  if (captureInProgress) {
    console.log("[agent] startSharedPreviewProcess: blocked (captureInProgress)");
    return;
  }

  // Block preview restart during the critical window between /prepare-capture and /capture.
  // Without this, if /prepare-capture is abandoned (countdown cancelled), preview restarts
  // while the armed bridge is still trying to open the USB session → 0xC0.
  if (Date.now() < previewRestartBlockedUntil) {
    console.log("[agent] startSharedPreviewProcess: blocked (previewRestartBlockedUntil)");
    return;
  }

  updateCameraStatusCache(buildPreviewActiveCameraStatus());

  const bridgePath = resolveEdsdkBridgePath();
  const streamArgs = parseBridgeArgs(process.env.EDSDK_BRIDGE_STREAM_ARGS, "preview-stream");
  const dllPath = resolveEdsdkLibraryPath(bridgePath);
  const { command, args } = withBridgeCommand(bridgePath, streamArgs);

  sharedPreviewBuffer = Buffer.alloc(0);
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...(dllPath ? { EDSDK_DLL_PATH: dllPath } : {}),
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  sharedPreviewProcess = child;
  activePreviewStreams.add(child);
  armPreviewStallMonitor();

  child.stdout?.on("error", (err) => {
    // Suppress ECONNRESET/EPIPE that occurs when process is force-killed mid-stream.
    console.error("[agent] Preview stdout pipe error (suppressed):", err.message);
  });
  child.stdin?.on("error", () => {
    // Suppress EPIPE when writing to stdin of an already-dead process.
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    sharedPreviewBuffer = Buffer.concat([sharedPreviewBuffer, chunk]);

    while (sharedPreviewBuffer.length >= 4) {
      const frameLength = sharedPreviewBuffer.readUInt32BE(0);
      if (frameLength <= 0 || frameLength > 20 * 1024 * 1024) {
        const error = new Error(`Frame live view Canon tidak valid (${frameLength})`);
        console.error("[agent] Preview stream:", error.message);
        failPreviewFrameWaiters(error);
        child.kill();
        return;
      }
      if (sharedPreviewBuffer.length < 4 + frameLength) return;

      const frame = Buffer.from(sharedPreviewBuffer.subarray(4, 4 + frameLength));
      sharedPreviewBuffer = sharedPreviewBuffer.subarray(4 + frameLength);
      publishPreviewFrame(frame);
    }
  });

  child.stderr?.on("data", (chunk) => {
    console.error("[agent] Preview stream:", String(chunk));
  });

  child.on("error", (error) => {
    activePreviewStreams.delete(child);
    const wasPlanned = plannedPreviewRestarts.has(child);
    if (wasPlanned) plannedPreviewRestarts.delete(child);
    if (sharedPreviewProcess === child) {
      sharedPreviewProcess = null;
      // Only clear buffer if NO planned restart — new process will fill it.
      // Keep last good frame so browser sees no black gap.
      if (!wasPlanned) sharedPreviewBuffer = Buffer.alloc(0);
    }
    if (wasPlanned) return;
    failPreviewFrameWaiters(error instanceof Error ? error : new Error(String(error)));
    if (hasPreviewDemand()) {
      restartSharedPreviewProcess("preview process error");
    }
  });

  child.on("exit", (code, signal) => {
    activePreviewStreams.delete(child);
    const wasPlanned = plannedPreviewRestarts.has(child);
    if (wasPlanned) plannedPreviewRestarts.delete(child);
    if (sharedPreviewProcess === child) {
      sharedPreviewProcess = null;
      lastPreviewBridgeExitedAt = Date.now();
      // Only clear buffer if NOT a planned restart — the replacement process will fill it.
      // Keep last good frame so browser sees no black gap.
      if (!wasPlanned) sharedPreviewBuffer = Buffer.alloc(0);
    }
    if (wasPlanned) {
      if (hasPreviewDemand()) {
        armPreviewStallMonitor(200);
      }
      return;
    }
    failPreviewFrameWaiters(new Error(`Live view Canon berhenti (${signal || (code ?? "unknown")})`));
    // Do NOT restart preview if capture is in progress — camera must stay free for the capture bridge.
    if (hasPreviewDemand() && !captureInProgress) {
      restartSharedPreviewProcess(`preview process exit (${signal || (code ?? "unknown")})`);
    }
  });
}

function getPreviewFrame(timeoutMs = 10000): Promise<Buffer> {
  markPreviewConsumer();

  if (latestPreviewFrame && Date.now() - latestPreviewFrameAt < 1000) {
    return Promise.resolve(Buffer.from(latestPreviewFrame));
  }

  try {
    startSharedPreviewProcess();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  return new Promise((resolve, reject) => {
    const waiter: PreviewFrameWaiter = {
      resolve: (frame) => resolve(Buffer.from(frame)),
      reject,
      timer: setTimeout(() => {
        previewFrameWaiters.delete(waiter);
        if (latestPreviewFrame) {
          resolve(Buffer.from(latestPreviewFrame));
          return;
        }
        reject(new Error("Timeout menunggu frame live view Canon"));
      }, timeoutMs),
    };
    previewFrameWaiters.add(waiter);
  });
}

function stopActivePreviewStreams(killDelayMs = 1500): Promise<boolean> {
  if (previewIdleTimer) {
    clearTimeout(previewIdleTimer);
    previewIdleTimer = null;
  }
  if (previewStallMonitorTimer) {
    clearTimeout(previewStallMonitorTimer);
    previewStallMonitorTimer = null;
  }
  if (previewRestartTimer) {
    clearTimeout(previewRestartTimer);
    previewRestartTimer = null;
  }
  plannedPreviewRestarts.clear();

  const processes = Array.from(activePreviewStreams);
  if (processes.length === 0) return Promise.resolve(false);

  return new Promise((resolve) => {
    let remaining = processes.length;
    const t0 = Date.now();
    console.log(`[agent] stopActivePreviewStreams: killing ${remaining} process(es), killDelay=${killDelayMs}ms, maxWait=${killDelayMs+200}ms`);
    const done = () => {
      remaining -= 1;
      console.log(`[agent] stopActivePreviewStreams: process exited, remaining=${remaining} elapsed=${Date.now()-t0}ms`);
      if (remaining <= 0) resolve(true);
    };
    const maxWait = killDelayMs + 200;
    const timer = setTimeout(() => {
      console.log(`[agent] stopActivePreviewStreams: maxWait timer fired at ${Date.now()-t0}ms`);
      resolve(true);
    }, maxWait);

    for (const child of processes) {
      if (child.killed || child.exitCode !== null) {
        activePreviewStreams.delete(child);
        done();
        continue;
      }
      child.once("exit", () => {
        activePreviewStreams.delete(child);
        done();
      });
      // FIX 3: Graceful shutdown — send stdin EOF first, give C# bridge 1500ms to
      // call EdsCloseSession and exit cleanly. Only then kill if still alive.
      child.stdin?.end();
      setTimeout(() => {
        if (!child.killed && child.exitCode === null) {
          child.kill();
        }
      }, killDelayMs);
    }

    setTimeout(() => clearTimeout(timer), maxWait + 100);
  });
}

// Chrome Private Network Access — HARUS sebelum cors agar masuk ke preflight response
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        /^https?:\/\/([a-z0-9-]+\.)*fremio\.id$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"));
    }
  },
}));

app.use(express.json({ limit: "50mb" }));

// ── Helpers ───────────────────────────────────────────────────────────────────

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

function timeoutFallback<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

type BridgeStatusPayload = {
  ok?: boolean;
  backend?: string;
  cameras?: { model?: string; port?: string }[];
  capabilities?: {
    supportsCapture?: boolean;
    supportsLiveView?: boolean;
    mode?: "live-view" | "capture-only";
  };
  error?: string | null;
};

function getAgentRuntimeRoots(): string[] {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, ".."),
    path.resolve(path.dirname(process.execPath), ".."),
    path.dirname(process.execPath),
    path.resolve(path.dirname(process.execPath), "resources", "embedded-agent", "agent"),
    // Development: native/edsdk-bridge/bin/Release/net8.0/win-x64/edsdk-bridge-native.exe
    path.resolve(__dirname, "..", "native", "edsdk-bridge", "bin", "Release", "net8.0", "win-x64"),
    path.resolve(__dirname, "..", "native", "edsdk-bridge", "bin", "Release", "net8.0"),
  ];
  return Array.from(new Set(roots));
}

function resolveEdsdkBridgePath(): string {
  const explicit = process.env.EDSDK_BRIDGE_PATH?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const isWindowsExe = process.platform === "win32" ? "edsdk-bridge-native.exe" : "edsdk-bridge-native";
  for (const root of getAgentRuntimeRoots()) {
    const candidates = [
      // Check root directly (for native/.../win-x64/ structure)
      path.join(root, isWindowsExe),
      // Check root/bin/ (for bin/edsdk-bridge-native.exe structure)
      path.join(root, "bin", isWindowsExe),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  throw new Error("Bridge Canon EDSDK tidak ditemukan. Pastikan bin/edsdk-bridge-native.exe tersedia.");
}

function resolveEdsdkLibraryPath(bridgePath: string): string | null {
  const explicit = process.env.EDSDK_DLL_PATH?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const bridgeDir = path.dirname(bridgePath);
  const candidates = [
    path.join(bridgeDir, "EDSDK.dll"),
    path.join(process.cwd(), "bin", "EDSDK.dll"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function parseBridgeArgs(envValue: string | undefined, fallback: string): string[] {
  const raw = (envValue && envValue.trim().length > 0 ? envValue : fallback).trim();
  return raw.split(/\s+/).filter(Boolean);
}

function withBridgeCommand(bridgePath: string, bridgeArgs: string[]): { command: string; args: string[] } {
  const isNativeExe = bridgePath.toLowerCase().endsWith(".exe") || bridgePath.toLowerCase().endsWith("edsdk-bridge-native");
  if (isNativeExe) return { command: bridgePath, args: bridgeArgs };
  return { command: process.execPath, args: [bridgePath, ...bridgeArgs] };
}

function execBridgeBuffer(bridgePath: string, bridgeArgs: string[], timeout = 8000): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const dllPath = resolveEdsdkLibraryPath(bridgePath);
    const env = {
      ...process.env,
      ...(dllPath ? { EDSDK_DLL_PATH: dllPath } : {}),
    };

    const { command, args } = withBridgeCommand(bridgePath, bridgeArgs);
    execFile(
      command,
      args,
      {
        env,
        windowsHide: true,
        timeout,
        encoding: "buffer",
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const stderrText = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr || "");
        const stdoutBuffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout || ""), "utf8");

        if (error) {
          reject(new Error(stderrText.trim() || error.message));
          return;
        }

        resolve({ stdout: stdoutBuffer, stderr: stderrText });
      }
    );
  });
}

function normalizeBridgeErrorMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  if (!trimmed) return "Operasi kamera Canon gagal";

  const normalizedNonJpegMessage = trimmed.replace(
    /Capture Canon menghasilkan file\s*['".\s]*\.\s*Ubah Image Quality kamera ke JPEG \(L\/Fine\) agar foto bisa diproses\./i,
    "Capture Canon menghasilkan file non-JPEG. Ubah Image Quality kamera ke JPEG (L/Fine) agar foto bisa diproses."
  );

  const lines = normalizedNonJpegMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      const payload = JSON.parse(line) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        return payload.error.trim();
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  const nonBridgeLines = lines.filter((line) => !line.startsWith("[bridge]"));
  if (nonBridgeLines.length > 0) {
    return nonBridgeLines[nonBridgeLines.length - 1];
  }

  return lines[lines.length - 1].replace(/^\[bridge\]\s*/i, "") || "Operasi kamera Canon gagal";
}

function isRetryableCaptureFailure(rawMessage: string): boolean {
  const message = rawMessage.toLowerCase();
  return (
    message.includes("gagal trigger shutter canon")
    || message.includes("device busy")
    || message.includes("kamera canon sedang busy")
    || message.includes("000000c0") // CommPortIsAlreadyOpen — session not yet released
  );
}

async function detectCameras(): Promise<CameraStatusResult> {
  try {
    const bridgePath = resolveEdsdkBridgePath();
    const statusArgs = parseBridgeArgs(process.env.EDSDK_BRIDGE_STATUS_ARGS, "status --json");
    const { stdout, stderr } = await execBridgeBuffer(bridgePath, statusArgs, 12000);

    // Always surface bridge diagnostic output to console so operator can see it
    if (stderr.trim()) {
      stderr.trim().split(/\r?\n/).forEach((line) => {
        if (line.trim()) console.log(`[camera-detect] ${line.trim()}`);
      });
    }

    const payload = JSON.parse(stdout.toString("utf8")) as BridgeStatusPayload;

    const cameras = Array.isArray(payload.cameras)
      ? payload.cameras.map((c) => ({ model: String(c.model || "Canon"), port: String(c.port || "") }))
      : [];

    if (cameras.length > 0) {
      console.log(`[agent] Kamera Canon terdeteksi: ${cameras.map((c) => c.model).join(", ")}`);
    } else {
      console.warn(`[agent] Kamera Canon tidak terdeteksi. ${payload.error ?? "Cek koneksi USB dan mode kamera."}`);
    }

    return {
      available: cameras.length > 0,
      count: cameras.length,
      devices: cameras,
      type: cameras.length > 0 ? "dslr" : "none",
      error: payload.error || undefined,
      capabilities: payload.capabilities,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[agent] detectCameras error: ${msg}`);
    return {
      available: false,
      count: 0,
      devices: [],
      type: "none",
      error: msg,
    };
  }
}

/** Tulis base64 image (raw/dataURL) atau ambil dari URL ke file temp, return path */
async function resolveToTempFile(input: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `fremio-print-${Date.now()}.jpg`);

  // base64 data URL
  if (input.startsWith("data:")) {
    const base64 = input.split(",")[1] ?? "";
    fs.writeFileSync(tmpFile, Buffer.from(base64, "base64"));
    return tmpFile;
  }

  // raw base64 (tanpa prefix data URL)
  const looksLikeRawBase64 = !input.startsWith("http://") && !input.startsWith("https://") && /^[A-Za-z0-9+/=\r\n]+$/.test(input);
  if (looksLikeRawBase64) {
    fs.writeFileSync(tmpFile, Buffer.from(input, "base64"));
    return tmpFile;
  }

  // HTTP/HTTPS URL — download dulu
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpFile);
    const get  = input.startsWith("https") ? https : http;
    get.get(input, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(tmpFile, () => {});
        resolveToTempFile(new URL(res.headers.location, input).toString()).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlink(tmpFile, () => {});
        reject(new Error(`Gagal download gambar print: HTTP ${res.statusCode}`));
        return;
      }
      const contentType = String(res.headers["content-type"] || "");
      if (contentType && !contentType.toLowerCase().startsWith("image/")) {
        file.close();
        fs.unlink(tmpFile, () => {});
        reject(new Error(`URL print bukan gambar (${contentType})`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(tmpFile); });
    }).on("error", (err) => {
      fs.unlink(tmpFile, () => {});
      reject(err);
    });
  });
}

/** Daftar printer via OS command */
async function listPrinters(): Promise<string[]> {
  if (isWin) {
    // Method 1: Get-Printer (Windows 8+ / Server 2012+, butuh Print Management module)
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"`,
        { timeout: 6000 }
      );
      const list = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (list.length > 0) return list;
    } catch { /* lanjut ke fallback */ }

    // Method 2: WMI Win32_Printer — tersedia di semua edisi Windows
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name"`,
        { timeout: 6000 }
      );
      const list = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (list.length > 0) return list;
    } catch { /* lanjut ke fallback */ }

    // Method 3: wmic printer get name (kompatibel Windows XP–11, tanpa modul PS)
    try {
      const { stdout } = await execAsync(
        `wmic printer get name /format:list`,
        { timeout: 6000 }
      );
      const list = stdout.split(/\r?\n/)
        .filter(line => /^Name=/i.test(line.trim()))
        .map(line => line.trim().replace(/^Name=/i, "").trim())
        .filter(Boolean);
      if (list.length > 0) return list;
    } catch { /* lanjut ke fallback */ }

    // Method 4: CIM (PowerShell 3+) — terakhir coba
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"`,
        { timeout: 6000 }
      );
      const list = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (list.length > 0) return list;
    } catch { /* no printers */ }

    return [];
  }

  // macOS / Linux
  try {
    const { stdout } = await execAsync("lpstat -a 2>/dev/null | awk '{print $1}'", { timeout: 5000 });
    return stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Buat PowerShell script untuk mencetak gambar pada ukuran fisik yang tepat.
 *
 * photoWidthMm / photoHeightMm adalah dimensi FOTO (mis. 4R = 102×152 mm),
 * bukan ukuran kertas. Gambar akan ditempatkan di tengah halaman sehingga
 * jika kertasnya A4 tetapi fotonya 4R, hasilnya adalah cetakan 4R di tengah A4.
 */
function buildPSPrintScript(
  filePath: string,
  printerName?: string,
  copies = 1,
  photoWidthMm = 102,
  photoHeightMm = 152,
): string {
  const safeFilePath    = filePath.replace(/\\/g, "\\\\").replace(/'/g, "''");
  const safePrinterName = (printerName ?? "").replace(/'/g, "''");

  // Nilai mm di-embed langsung ke string PowerShell agar tidak ada masalah closure scope
  const wMm = Number.isFinite(photoWidthMm)  && photoWidthMm  > 0 ? photoWidthMm  : 102;
  const hMm = Number.isFinite(photoHeightMm) && photoHeightMm > 0 ? photoHeightMm : 152;

  return `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Printing

$filePath = '${safeFilePath}'
$bitmap   = [System.Drawing.Image]::FromFile($filePath)

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
${safePrinterName ? `$printDoc.PrinterSettings.PrinterName = '${safePrinterName}'` : '# Using default printer'}

if (-not $printDoc.PrinterSettings.IsValid) {
  Write-Error "Printer tidak valid: '$($printDoc.PrinterSettings.PrinterName)'"
  $bitmap.Dispose()
  exit 1
}

# Sembunyikan notifikasi printer dari taskbar
$printDoc.PrinterSettings.PrintToFile = $false
try {
  $regPath = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows'
  Set-ItemProperty -Path $regPath -Name 'PrintWhilePrintingError' -Value 0 -ErrorAction SilentlyContinue
} catch {}

$printDoc.add_PrintPage({
  param($sender, $ev)

  # System.Drawing.Printing PageBounds dan DrawImage menggunakan unit 1/100 inch.
  # JANGAN gunakan DPI — itu untuk pixel, bukan untuk unit grafik PrintDocument.
  # Konversi mm → 1/100 inch:  mm × (100 / 25.4) = mm × 3.93701
  # Nilai foto di-embed: ${wMm} x ${hMm} mm
  $photoW = [float](${wMm} * 100.0 / 25.4)
  $photoH = [float](${hMm} * 100.0 / 25.4)

  # Posisikan di tengah halaman (A4 = 827×1169, atau ukuran apapun)
  $pageW = [float]$ev.PageBounds.Width
  $pageH = [float]$ev.PageBounds.Height
  $x     = [float](($pageW - $photoW) / 2.0)
  $y     = [float](($pageH - $photoH) / 2.0)
  if ($x -lt 0.0) { $x = 0.0 }
  if ($y -lt 0.0) { $y = 0.0 }

  $destRect = New-Object System.Drawing.RectangleF($x, $y, $photoW, $photoH)
  $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  # DrawImage dengan RectangleF: seluruh bitmap di-scale masuk ke destRect
  $ev.Graphics.DrawImage($bitmap, $destRect)
})

for ($i = 0; $i -lt ${copies}; $i++) {
  $printDoc.Print()
}

$bitmap.Dispose()
Write-Output "OK: print job selesai (${copies} copy, ${wMm}x${hMm}mm)"
`;
}

async function printWindows(
  filePath: string,
  printerName?: string,
  copies = 1,
  photoWidthMm = 102,
  photoHeightMm = 152,
): Promise<void> {
  const psFile = path.join(os.tmpdir(), `fremio-print-${Date.now()}.ps1`);
  fs.writeFileSync(psFile, buildPSPrintScript(filePath, printerName, copies, photoWidthMm, photoHeightMm), "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", psFile],
        { timeout: 30000, windowsHide: true },
        (err, _stdout, stderr) => {
          if (err) {
            reject(new Error(stderr || err.message));
            return;
          }
          resolve();
        }
      );
    });
  } finally {
    fs.unlink(psFile, () => {});
  }
}

/** Print file ke printer */
async function printFile(
  filePath: string,
  printerName?: string,
  copies = 1,
  photoWidthMm = 102,
  photoHeightMm = 152,
): Promise<void> {
  if (isWin) {
    await printWindows(filePath, printerName, copies, photoWidthMm, photoHeightMm);
    return;
  }

  // macOS / Linux: lp command
  // -o media=Custom.WxHmm  → minta ukuran kertas sesuai foto (bukan A4)
  // -o fit-to-page=false   → jangan scale gambar
  // -o scaling=100         → cetak 100% (actual size)
  const dest     = printerName ? `-d "${printerName}"` : "";
  const nCopies  = copies > 1  ? `-n ${copies}` : "";
  const wMm = Number.isFinite(photoWidthMm)  && photoWidthMm  > 0 ? Math.round(photoWidthMm)  : 102;
  const hMm = Number.isFinite(photoHeightMm) && photoHeightMm > 0 ? Math.round(photoHeightMm) : 152;
  const mediaOpt = `-o media=Custom.${wMm}x${hMm}mm -o fit-to-page=false -o scaling=100`;
  await execAsync(`lp ${dest} ${nCopies} ${mediaOpt} "${filePath}"`, { timeout: 15000 });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/status", async (_req: Request, res: Response) => {
  const [printers, camera] = await Promise.all([
    timeoutFallback(listPrinters(), 2500, []),
    getCameraStatusForRoute(),
  ]);
  res.json({
    ok:       true,
    version:  VERSION,
    platform: process.platform,
    printers,
    camera: {
      available: camera.available,
      count:     camera.count,
      cameras:   camera.devices,
      devices:   camera.devices,
      type:      camera.type,
      error:     camera.error,
      capabilities: camera.capabilities,
    },
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    version: VERSION,
    platform: process.platform,
  });
});

app.get("/logs", (_req: Request, res: Response) => {
  const tail = Math.min(Number(_req.query.tail ?? MAX_LOG_LINES), MAX_LOG_LINES);
  const lines = logBuffer.slice(-tail);
  res.json({
    ok: true,
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lines,
    total: logBuffer.length,
  });
});

app.post("/camera-reset", async (_req: Request, res: Response) => {
  // Full EDSDK reset: kill all bridges, terminate/re-init SDK, then restart preview.
  // Simulates unplugging and replugging the camera USB.
  console.log("[agent] /camera-reset: resetting Canon camera...");

  // 1. Kill all active preview streams
  const killPromise = stopActivePreviewStreams(100);

  // 2. Kill any armed capture bridge
  const armed = armedCapture;
  if (armed) {
    try { armed.process.kill(); } catch { /* ignore */ }
  }

  // 3. Wait for streams to die
  await killPromise;
  await new Promise<void>((r) => setTimeout(r, 300));

  // 4. Call the C# bridge reset command (terminate + re-init EDSDK)
  const bridgePath = resolveEdsdkBridgePath();
  try {
    const { stdout } = await execBridgeBuffer(bridgePath, ["reset"], 8000);
    console.log(`[agent] /camera-reset: bridge output: ${stdout.toString().trim()}`);
  } catch (err) {
    console.error(`[agent] /camera-reset: bridge error: ${(err as Error).message}`);
    // Non-fatal — we still want to restart preview even if bridge reset fails
  }

  // 5. Clear state
  sharedPreviewProcess = null;
  lastPreviewBridgeExitedAt = 0;
  previewRestartBlockedUntil = 0;

  // 6. Re-detect camera status
  const status = await detectCameras();
  console.log(`[agent] /camera-reset: done — cameras found: ${status.count}`);

  res.json({ ok: true, count: status.count, devices: status.devices });
});

app.get("/printers", async (_req: Request, res: Response) => {
  const printers = await listPrinters();
  res.json({ ok: true, printers });
});

app.post("/arm-capture", async (_req: Request, res: Response) => {
  // ARMS the camera for capture.
  // Called at count=3 so the armed bridge is ready by count=1.
  // NOTE: Preview stays ALIVE during countdown 3→2→1. /trigger-shot (count=1)
  // handles preview stop right before SHOOT. This keeps live view visible for
  // the customer through the countdown and only stops at the moment of capture.
  console.log("[agent] /arm-capture: arming capture");
  const t0 = Date.now();

  // RESET capture guards for new session — camera is starting a fresh capture cycle.
  // Without this, imageCapturedAt from the previous session (60s window) blocks new captures.
  imageCapturedAt = 0;
  preArmedShootFired = false;
  shootLastFiredAt = 0;
  captureLockFiredAt = 0;
  preArmedCaptureInFlight = null;

  // Wait for camera USB to be free from previous capture.
  // If the previous bridge crashed (AccessViolation, exited with non-zero code),
  // give it extra settle time — the USB session may be in a bad state.
  const CRASH_SUSPECT_MS = 5000;
  let USB_SETTLE_MS = 1500;
  if (lastArmedBridgeExitedAt > 0) {
    const elapsed = Date.now() - lastArmedBridgeExitedAt;
    if (elapsed < CRASH_SUSPECT_MS) {
      // Recent crash or unexpected exit — double settle time
      USB_SETTLE_MS = 2500;
      console.log(`[agent] /arm-capture: recent bridge exit (${elapsed}ms ago), using extended settle ${USB_SETTLE_MS}ms`);
    }
    if (elapsed < USB_SETTLE_MS) {
      console.log(`[agent] /arm-capture: waiting ${USB_SETTLE_MS - elapsed}ms for USB settle`);
      await new Promise<void>((r) => setTimeout(r, USB_SETTLE_MS - elapsed));
    }
  }

  // Clean up any previous armed bridge that wasn't used.
  if (armedCapture) {
    console.log("[agent] /arm-capture: killing previous armed bridge");
    try { armedCapture.process.stdin?.write("NOCAPTURE\n"); } catch { /* ignore */ }
    setTimeout(() => { try { armedCapture!.process.kill(); } catch { /* ignore */ } }, 100);
    armedCapture = null;
  }

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `fremio-capture-${Date.now()}.jpg`);
  const bridgePath = resolveEdsdkBridgePath();
  const armedArgs = ["capture-armed", "--output", tmpFile];

  const armedProcess = spawn(bridgePath, armedArgs, { stdio: ["pipe", "pipe", "pipe"] });

  let readyResolve: () => void;
  let readyReject: (err: Error) => void;
  const readyPromise = new Promise<void>((res, rej) => { readyResolve = res; readyReject = rej; });

  let completionResolve: (path: string) => void;
  let completionReject: (err: Error) => void;
  const completionPromise = new Promise<string>((res, rej) => { completionResolve = res; completionReject = rej; });

  let stderrBuf = "";
  let bridgeReady = false;
  armedProcess.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() ?? "";
    for (const line of lines) {
      console.log(`[armed-bridge] ${line}`);
      if (!bridgeReady && line.includes("BRIDGE_READY")) {
        bridgeReady = true;
        console.log(`[agent] BRIDGE_READY received at ${Date.now()-t0}ms after arm-capture`);
        readyResolve!();
      }
    }
  });

  armedProcess.on("exit", (code) => {
    if (stderrBuf) { console.log(`[armed-bridge] ${stderrBuf}`); stderrBuf = ""; }
    console.log(`[agent] Armed bridge exited code=${code}`);
    if (!bridgeReady) { readyReject!(new Error(`Armed bridge exited before BRIDGE_READY (code ${code})`)); }
    // Only resolve completion if the bridge actually captured an image (file exists).
    // If bridge exited via NOCAPTURE/timeout/cancelled, no image was taken → reject.
    // We detect this by checking: file exists + bridge exited with code=0.
    if (code === 0 && bridgeReady) {
      if (fs.existsSync(tmpFile)) {
        completionResolve!(tmpFile);
        lastArmedBridgeExitedAt = Date.now();
      } else {
        completionReject!(new Error("Armed bridge exited without capture (NOCAPTURE or timeout)"));
      }
    } else {
      completionReject!(new Error(`Armed bridge exited without capture (code ${code})`));
    }
    if (armedCapture?.process === armedProcess) armedCapture = null;
  });

  armedProcess.on("error", (err) => {
    console.error(`[agent] Armed bridge spawn error: ${err.message}`);
    readyReject!(err);
    completionReject!(err);
  });

  armedCapture = {
    outputPath: tmpFile,
    process: armedProcess,
    readyPromise,
    shootFn: () => {
      // ATOMIC DOUBLE-SHOT GUARD: set the lock BEFORE writing to stdin.
      // This prevents a second SHOOT from firing if another path calls shootFn
      // concurrently (e.g. inline /capture path fires while pre-armed is still running).
      if (preArmedShootFired) {
        console.warn("[agent] shootFn: preArmedShootFired already set — skipping SHOOT");
        return;
      }
      preArmedShootFired = true;
      shootLastFiredAt = Date.now();
      captureLockFiredAt = Date.now();
      console.log(`[agent] Sending SHOOT to armed bridge`);
      armedProcess.stdin?.write("SHOOT\n");
    },
    completionPromise,
  };

  readyPromise.catch(() => {});
  completionPromise.catch(() => {});

  // Wait for BRIDGE_READY before responding so /trigger-capture always finds armedCapture ready.
  try {
    await readyPromise;
    console.log(`[agent] /arm-capture: BRIDGE_READY confirmed at ${Date.now()-t0}ms`);
    res.json({ ok: true, armedBridgePid: armedProcess.pid });
  } catch (err) {
    console.error(`[agent] /arm-capture: BRIDGE_READY failed: ${(err as Error).message}`);
    try { armedProcess.kill(); } catch { /* ignore */ }
    if (armedCapture?.process === armedProcess) armedCapture = null;
    captureInProgress = false;
    res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage((err as Error).message) });
  }
});

app.post("/trigger-shot", async (_req: Request, res: Response) => {
  // TRIGGERS the pre-armed shot at count=1. Stops preview THEN fires SHOOT.
  // Returns immediately with shootFiredAt AFTER the shot fires (bridge downloads in background).
  // CameraScreen calls this first, then polls /get-capture-result to get the JPEG.
  console.log("[agent] /trigger-shot: triggering shot (stopping preview first)");
  const t0 = Date.now();
  captureInProgress = true;
  const hadPreviewSession = isPreviewSessionActive();

  // STOP PREVIEW at count=1 — this is the ONLY time we stop preview.
  await stopActivePreviewStreams(200);
  await new Promise<void>((r) => setTimeout(r, 800)); // USB settle
  lastPreviewBridgeExitedAt = Date.now();
  previewRestartBlockedUntil = 0;

  const armed = armedCapture;
  if (armed) {
    preArmedCaptureInFlight = armed;
    console.log(`[agent] /trigger-shot: waiting for BRIDGE_READY before SHOOT... t=${Date.now()-t0}ms`);
    try {
      await armed.readyPromise;
    } catch (err) {
      console.error(`[agent] /trigger-shot: armed bridge died early: ${(err as Error).message}`);
      preArmedCaptureInFlight = null;
      armedCapture = null;
      captureInProgress = false; // MUST reset so next capture can proceed
      res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage((err as Error).message) });
      return;
    }
  }

  if (armed && preArmedCaptureInFlight === armed) {
    // Armed bridge confirmed ready — fire SHOOT
    const shootFiredAt = Date.now();
    console.log(`[agent] /trigger-shot: BRIDGE_READY confirmed, firing SHOOT at ${Date.now()-t0}ms`);
    armed.shootFn();

    // Store shootFiredAt so GET /get-capture-result knows when shot fired
    latestCaptureResult = { path: armed.outputPath, shootFiredAt, captureDoneAt: 0 };

    // Return shootFiredAt immediately so CameraScreen can switch to "preparing"
    res.json({ ok: true, shootFiredAt });

    // Background: wait for completion + store result for /get-capture-result
    armed.completionPromise
      .then((outputPath) => {
        const captureDoneAt = Date.now();
        console.log(`[agent] /trigger-shot: capture done in ${captureDoneAt - t0}ms`);
        latestCaptureResult = { path: outputPath, shootFiredAt, captureDoneAt };
        preArmedCaptureInFlight = null;
        preArmedShootFired = false;
        captureInProgress = false;
        previewRestartBlockedUntil = 0;
        lastArmedBridgeExitedAt = Date.now();
        if (hadPreviewSession) {
          setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 30);
        }
      })
      .catch((err) => {
        console.error(`[agent] /trigger-shot: completion error: ${err.message}`);
        latestCaptureResult = null;
        preArmedCaptureInFlight = null;
        captureInProgress = false;
        previewRestartBlockedUntil = 0;
      });
    return;
  }

  // No armed bridge — fallback inline
  console.warn("[agent] /trigger-shot: no armed bridge, falling back to inline");
  captureInProgress = false;
  res.status(503).json({ ok: false, error: "Armed bridge not available — retry /trigger-shot or /trigger-capture" });
});

app.get("/get-capture-result", async (_req: Request, res: Response) => {
  // POLLS for capture result after /trigger-shot fired. Returns JPEG when ready.
  // CameraScreen polls this until imageCapturedAt or timeout.
  const t0 = Date.now();
  const result = latestCaptureResult;

  if (!result) {
    res.status(404).json({ ok: false, error: "No capture in progress", captureDone: false });
    return;
  }

  if (!result.captureDoneAt) {
    // Shot fired but image not yet downloaded
    res.status(202).json({ ok: true, captureDone: false, shootFiredAt: result.shootFiredAt });
    return;
  }

  // Image is ready
  if (!fs.existsSync(result.path)) {
    latestCaptureResult = null;
    res.status(500).json({ ok: false, error: "File not found after capture", captureDone: false });
    return;
  }

  const buf = fs.readFileSync(result.path);
  imageCapturedAt = Date.now();
  latestCaptureResult = null;
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(buf);
});

// ─── Legacy combined endpoint (still used for inline fallback / IPC) ────────
app.post("/trigger-capture", async (_req: Request, res: Response) => {
  const t0 = Date.now();
  const hadPreviewSession = isPreviewSessionActive();
  const captureDoneAt = Date.now();

  // STOP PREVIEW at count=1 — this is the ONLY time we stop preview.
  // Camera can only be in one mode: live preview OR capture. Now switch to capture.
  await stopActivePreviewStreams(200);
  await new Promise<void>((r) => setTimeout(r, 800)); // USB settle
  lastPreviewBridgeExitedAt = Date.now();
  previewRestartBlockedUntil = 0; // Clear block — we're done with capture prep

  // Capture armed bridge reference. NOTE: we do NOT send NOCAPTURE here.
  // /arm-capture already handles killing previous armed bridges when a new arm starts.
  // Sending NOCAPTURE here would kill the NEW armed bridge before we can fire SHOOT!
  const armed = armedCapture;

  // Now send SHOOT — bridge is already armed from /arm-capture.
  // CRITICAL: Wait for BRIDGE_READY before sending SHOOT. Without this, SHOOT can
  // race with the bridge still starting up (USB lock 0xC0 → session busy → exit without capture).
  if (armed) {
    preArmedCaptureInFlight = armed;
    console.log(`[agent] /trigger-capture: waiting for BRIDGE_READY before SHOOT... t=${Date.now()-t0}ms`);
    try {
      await armed.readyPromise; // Wait for bridge to be fully initialized
    } catch (err) {
      // Bridge died before BRIDGE_READY — fall through to inline path
      console.error(`[agent] /trigger-capture: armed bridge died early: ${(err as Error).message}`);
      preArmedCaptureInFlight = null;
      armedCapture = null;
      // Fall through to inline fallback below
    }
  }

  if (armed && preArmedCaptureInFlight === armed) {
    // Armed bridge is confirmed ready — fire SHOOT
    const shootFiredAt = Date.now();
    console.log(`[agent] /trigger-capture: BRIDGE_READY confirmed, firing SHOOT at ${Date.now()-t0}ms`);
    armed.shootFn();
    try {
      const outputPath = await armed.completionPromise;
      const captureDoneAt = Date.now();
      console.log(`[agent] /trigger-capture: done in ${Date.now()-t0}ms`);
      preArmedCaptureInFlight = null;
      preArmedShootFired = false;
      if (!fs.existsSync(outputPath)) {
        res.status(500).json({ ok: false, error: "Foto berhasil diambil tapi file tidak ditemukan" });
        captureInProgress = false;
        return;
      }
      const buf = fs.readFileSync(outputPath);
      imageCapturedAt = Date.now();
      captureInProgress = false;
      // CLEAR previewRestartBlockedUntil so camera returns to live view
      previewRestartBlockedUntil = 0;
      lastArmedBridgeExitedAt = Date.now();
      // Return JSON with metadata so CameraScreen can transition UI at right moment
      const base64 = buf.toString("base64");
      res.json({ ok: true, image: base64, mimeType: "image/jpeg", shootFiredAt, captureDoneAt });
      if (hadPreviewSession) {
        setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 30);
      }
      return;
    } catch (err) {
      console.error(`[agent] /trigger-capture: error: ${(err as Error).message}`);
      preArmedCaptureInFlight = null;
      captureInProgress = false;
      previewRestartBlockedUntil = 0;
      res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage((err as Error).message) });
      return;
    }
  }

  // No armed bridge — fallback to inline (should not happen if /arm-capture worked)
  console.warn("[agent] /trigger-capture: no armed bridge, falling back to inline");
  captureHandlerInFlight = true;
  captureInProgress = true;
  const SHOOT_WINDOW_MS = 60000;
  const alreadyShot = (shootLastFiredAt > 0 && Date.now() - shootLastFiredAt < SHOOT_WINDOW_MS)
                    || (imageCapturedAt > 0 && Date.now() - imageCapturedAt < SHOOT_WINDOW_MS);
  if (alreadyShot) {
    captureHandlerInFlight = false;
    captureInProgress = false;
    res.status(409).json({ ok: false, error: "Capture sudah dilakukan sesi lain" });
    return;
  }

  try {
    const { process: armedProcess, readyPromise, tmpFile } = await doPrepareCaptureInline();
    await readyPromise;
    if (Date.now() - shootLastFiredAt < SHOOT_WINDOW_MS || Date.now() - imageCapturedAt < SHOOT_WINDOW_MS) {
      console.warn("[agent] /trigger-capture: SHOOT fired during bridge startup — skipping");
      await new Promise<void>((resolve) => { armedProcess.on("exit", () => resolve()); });
      captureHandlerInFlight = false;
      captureInProgress = false;
      previewRestartBlockedUntil = 0;
      if (fs.existsSync(tmpFile)) {
        const buf = fs.readFileSync(tmpFile);
        res.setHeader("Content-Type", "image/jpeg");
        res.send(buf);
      } else {
        res.status(500).json({ ok: false, error: "SHOOT sudah dilakukan bridge lain" });
      }
      return;
    }
    preArmedShootFired = true;
    shootLastFiredAt = Date.now();
    captureLockFiredAt = Date.now();
    armedProcess.stdin?.write("SHOOT\n");
    await new Promise<void>((resolve) => { armedProcess.on("exit", () => resolve()); });
    if (!fs.existsSync(tmpFile)) {
      res.status(500).json({ ok: false, error: "Foto berhasil diambil tapi file tidak ditemukan" });
      captureInProgress = false;
      previewRestartBlockedUntil = 0;
      return;
    }
    const buf = fs.readFileSync(tmpFile);
    imageCapturedAt = Date.now();
    captureInProgress = false;
    previewRestartBlockedUntil = 0;
    lastArmedBridgeExitedAt = Date.now();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(buf);
    if (hadPreviewSession) {
      setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 30);
    }
  } catch (err) {
    console.error(`[agent] /trigger-capture inline error: ${(err as Error).message}`);
    captureHandlerInFlight = false;
    captureInProgress = false;
    previewRestartBlockedUntil = 0;
    res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage((err as Error).message) });
  }
});


// Reusable inline pre-arm: stops preview, waits for settle, spawns armed bridge.
async function doPrepareCaptureInline(): Promise<{ process: ReturnType<typeof spawn>; readyPromise: Promise<void>; tmpFile: string }> {
  const t0 = Date.now();
  captureInProgress = true;

  // Kill any previous inline capture bridge that might be lingering.
  // This handles the race: /capture inline path spawns bridge → user presses
  // capture again → new /capture arrives → old bridge still holding USB → 0xC0.
  const INLINE_KILL_DELAY_MS = 400;
  await stopActivePreviewStreams(INLINE_KILL_DELAY_MS);

  // CRITICAL: Wait for camera USB port to be fully released after preview exits.
  // The C# bridge calls EdsCloseSession on stdin close, but the Canon USB driver
  // on Windows can take up to 1500ms to fully release the session handle.
  // Starting the armed bridge too soon → 0xC0 CommPortIsAlreadyOpen on EVERY attempt.
  // This 1500ms settle is the KEY FIX for the zombie-bridge scenario.
  const PREVIEW_EXIT_SETTLE_MS = 1500;
  if (lastPreviewBridgeExitedAt > 0) {
    const elapsed = Date.now() - lastPreviewBridgeExitedAt;
    if (elapsed < PREVIEW_EXIT_SETTLE_MS) {
      const waitMs = PREVIEW_EXIT_SETTLE_MS - elapsed;
      console.log(`[agent] doPrepareCaptureInline: waiting ${waitMs}ms for USB port release after preview exit`);
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }

  // Wait for USB settle after any previous inline capture bridge exited.
  // Without this, a fast second capture can hit CommPortIsAlreadyOpen (0xC0).
  const INLINE_USB_SETTLE_MS = 2500;
  if (lastInlineCaptureBridgeExitedAt > 0) {
    const elapsed = Date.now() - lastInlineCaptureBridgeExitedAt;
    if (elapsed < INLINE_USB_SETTLE_MS) {
      const waitMs = INLINE_USB_SETTLE_MS - elapsed;
      console.log(`[agent] doPrepareCaptureInline: waiting ${waitMs}ms for USB settle`);
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }

  const tmpFile = path.join(os.tmpdir(), `fremio-capture-${Date.now()}.jpg`);
  const bridgePath = resolveEdsdkBridgePath();
  const armedProcess = spawn(bridgePath, ["capture-armed", "--output", tmpFile], { stdio: ["pipe", "pipe", "pipe"] });

  let readyResolve: () => void;
  let readyReject: (err: Error) => void;
  const readyPromise = new Promise<void>((res, rej) => { readyResolve = res; readyReject = rej; });

  let stderrBuf = "";
  let bridgeReady = false;
  armedProcess.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (!bridgeReady && line.includes("BRIDGE_READY")) {
        bridgeReady = true;
        readyResolve();
      }
    }
  });

  armedProcess.on("exit", (code) => {
    if (stderrBuf) { console.log(`[agent] /capture inline: ${stderrBuf}`); stderrBuf = ""; }
    if (!bridgeReady) readyReject(new Error(`Armed bridge exited before BRIDGE_READY (code ${code})`));
    lastArmedBridgeExitedAt = Date.now();
    lastInlineCaptureBridgeExitedAt = Date.now();
    captureInProgress = false;
    // Clean up any stale armed capture from failed inline attempts
    if (armedCapture?.process === armedProcess) armedCapture = null;
  });
  armedProcess.on("error", (err) => {
    readyReject(err instanceof Error ? err : new Error(String(err)));
  });

  return { process: armedProcess, readyPromise, tmpFile };
}

app.post("/capture", async (req: Request, res: Response) => {
  const tmpDir = os.tmpdir();
  const wantsBinary = req.query.format === "binary" || String(req.get("accept") || "").includes("image/jpeg");
  const hadPreviewSession = isPreviewSessionActive();
  const t0 = Date.now();

  // Prevent concurrent captures
  if (captureHandlerInFlight) {
    console.warn("[agent] /capture: capture in flight, waiting...");
    const waitDeadline = Date.now() + 30000;
    while (captureHandlerInFlight && Date.now() < waitDeadline) {
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    if (captureHandlerInFlight) {
      res.status(409).json({ ok: false, error: "Capture sebelumnya terlalu lama — coba lagi" });
      return;
    }
  }

  captureHandlerInFlight = true;
  captureInProgress = true;
  console.log(`[agent] /capture: start t=${Date.now()-t0}ms`);

  try {
    const armed = armedCapture;
    console.log(`[agent] /capture: armed=${!!armed} t=${Date.now()-t0}ms`);

    if (armed) {
      // CRITICAL: set preArmedCaptureInFlight BEFORE nulling armedCapture and BEFORE any await.
      // This prevents a second /capture call from racing into the inline path and firing
      // a second SHOOT while we wait for BRIDGE_READY from the pre-armed bridge.
      preArmedCaptureInFlight = armed;
      armedCapture = null; // Atomically claim this capture slot

      if (preArmedCaptureInFlight !== armed) {
        // Should never happen, but guard against stale state
        console.warn("[agent] /capture: preArmedCaptureInFlight race detected");
        preArmedCaptureInFlight = null;
      }

      // ── PRE-ARMED PATH ────────────────────────────────────────────────────────
      const tmpFile = armed.outputPath;
      console.log(`[agent] /capture: pre-armed path, awaiting readyPromise... t=${Date.now()-t0}ms`);
      await armed.readyPromise;
      const tAfterReady = Date.now();
      console.log(`[agent] /capture: readyPromise resolved in ${tAfterReady-t0}ms, calling shootFn...`);
      armed.shootFn();
      console.log(`[agent] /capture: shootFn done, awaiting completionPromise... t=${Date.now()-t0}ms`);
      const outputPath = await armed.completionPromise;
      console.log(`[agent] /capture: completionPromise resolved in ${Date.now()-t0}ms (took ${Date.now()-tAfterReady}ms)`);
      preArmedCaptureInFlight = null; // Release lock after shoot completes
      preArmedShootFired = false;
      if (!fs.existsSync(outputPath)) {
        res.status(500).json({ ok: false, error: "Foto berhasil diambil tapi file tidak ditemukan" });
        return;
      }
      const buf = fs.readFileSync(outputPath);
      imageCapturedAt = Date.now();
      console.log(`[agent] /capture: pre-armed done in ${Date.now()-t0}ms`);
      // Clear preview restart block so camera can return to live view
      previewRestartBlockedUntil = 0;
      if (wantsBinary) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.send(buf);
      } else {
        res.json({ ok: true, image: { base64: buf.toString("base64"), mimeType: "image/jpeg" } });
      }
      // Restart preview immediately so camera returns to live view
      if (hadPreviewSession) {
        setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 30);
      }
      return;
    }

    // Armed bridge was already claimed by another /capture call — return conflict.
    if (preArmedCaptureInFlight !== null) {
      captureHandlerInFlight = false;
      captureInProgress = false;
      res.status(409).json({ ok: false, error: "Capture sedang diproses — tunggu sebentar" });
      return;
    }

    // ── INLINE SHOOT PATH ───────────────────────────────────────────────────────
    // No pre-armed bridge available (e.g., /prepare-capture was too slow or cancelled).
    // Fallback that takes longer but guarantees a single shot.

    // GUARD: If preArmedCaptureInFlight is set, another /capture already claimed the slot.
    // Don't fire inline SHOOT — return conflict so caller handles it.
    if (preArmedCaptureInFlight !== null) {
      console.warn("[agent] /capture: preArmedCaptureInFlight set, skipping inline SHOOT");
      captureHandlerInFlight = false;
      captureInProgress = false;
      preArmedShootFired = false;
      res.status(409).json({ ok: false, error: "Capture sedang diproses — tunggu sebentar" });
      return;
    }

    // DEFENSIVE DOUBLE-SHOT GUARD — check BEFORE any await:
    // If a SHOOT was already fired within the last 60s (covers TakePicture + download),
    // skip firing again and just wait for the existing result. This guards against:
    // 1. Pre-armed bridge's 60s timeout auto-fired SHOOT → inline should not fire again
    // 2. Inline path called twice (race condition)
    // 3. Pre-armed SHOOT arrived moments before inline's check
    const SHOOT_WINDOW_MS = 60000;
    const alreadyShot = (shootLastFiredAt > 0 && Date.now() - shootLastFiredAt < SHOOT_WINDOW_MS)
                      || (imageCapturedAt > 0 && Date.now() - imageCapturedAt < SHOOT_WINDOW_MS);

    if (alreadyShot) {
      // A SHOOT was already fired by someone — don't fire again.
      // This is the safety net for: pre-armed timeout, double /capture call, etc.
      const source = shootLastFiredAt > imageCapturedAt
        ? `SHOOT fired ${Date.now()-shootLastFiredAt}ms ago`
        : `Image captured ${Date.now()-imageCapturedAt}ms ago`;
      console.warn(`[agent] /capture: skipping SHOOT (${source})`);
      captureHandlerInFlight = false;
      captureInProgress = false;
      preArmedShootFired = false;
      res.status(409).json({ ok: false, error: "Capture sudah dilakukan sesi lain" });
      return;
    }

    const { process: armedProcess, readyPromise, tmpFile } = await doPrepareCaptureInline();
    console.log(`[agent] /capture: doPrepareCaptureInline done, awaiting readyPromise... t=${Date.now()-t0}ms`);

    // Wait for BRIDGE_READY (up to 60s — generous for cold start or USB busy retries).
    await readyPromise;
    console.log(`[agent] /capture: readyPromise resolved in ${Date.now()-t0}ms`);

    // Re-check after await: another SHOOT might have fired during the wait.
    // If bridge 1's timeout fired SHOOT while bridge 2 was starting, we must not fire again.
    if (Date.now() - shootLastFiredAt < SHOOT_WINDOW_MS || Date.now() - imageCapturedAt < SHOOT_WINDOW_MS) {
      console.warn(`[agent] /capture: SHOOT fired during inline bridge startup — skipping inline SHOOT`);
      await new Promise<void>((resolve) => { armedProcess.on("exit", () => resolve()); });
      captureHandlerInFlight = false;
      captureInProgress = false;
      preArmedShootFired = false;
      if (hadPreviewSession) {
        setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 30);
      }
      if (fs.existsSync(tmpFile)) {
        const buf = fs.readFileSync(tmpFile);
        if (wantsBinary) {
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.send(buf);
        } else {
          res.json({ ok: true, image: { base64: buf.toString("base64"), mimeType: "image/jpeg" } });
        }
      } else {
        res.status(500).json({ ok: false, error: "SHOOT sudah dilakukan bridge lain" });
      }
      return;
    }

    // Send SHOOT — inline path (no pre-armed bridge available)
    preArmedShootFired = true;
    shootLastFiredAt = Date.now();
    captureLockFiredAt = Date.now();
    armedProcess.stdin?.write("SHOOT\n");

    // Wait for bridge to download JPEG and exit
    await new Promise<void>((resolve) => {
      armedProcess.on("exit", () => resolve());
    });

    if (!fs.existsSync(tmpFile)) {
      res.status(500).json({ ok: false, error: "Foto berhasil diambil tapi file tidak ditemukan" });
      return;
    }

    const buf = fs.readFileSync(tmpFile);
    imageCapturedAt = Date.now(); // Mark after successful read
    console.log(`[agent] /capture: inline armed done in ${Date.now()-t0}ms`);
    if (wantsBinary) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(buf);
    } else {
      res.json({ ok: true, image: { base64: buf.toString("base64"), mimeType: "image/jpeg" } });
    }

    if (hadPreviewSession) {
      setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 30);
    }
  } catch (err: any) {
    console.error(`[agent] /capture ERROR: ${err instanceof Error ? err.message.slice(0,120) : String(err)}`);
    res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage(err instanceof Error ? err.message : String(err)) });
  } finally {
    captureHandlerInFlight = false;
    captureInProgress = false;
    preArmedShootFired = false; // Reset for next session
  }
});

app.get("/preview", async (_req: Request, res: Response) => {
  try {
    const frame = await getPreviewFrame(12000);
    scheduleSharedPreviewStop();

    if (!frame || frame.length === 0) {
      res.status(500).send("Preview kosong");
      return;
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(frame);
  } catch (err: any) {
    console.error("[agent] Preview error:", err);
    res.status(500).send(err instanceof Error ? err.message : "Gagal ambil preview");
  }
});

app.get("/preview-stream", async (_req: Request, res: Response) => {
  try {
    const boundary = "fremio-canon-liveview";
    startSharedPreviewProcess();
    markPreviewConsumer();

    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "close",
      "Pragma": "no-cache",
    });

    let closed = false;
    const sendFrame = (frame: Buffer) => {
      if (closed || res.writableEnded || frame.length === 0) return;
      res.write(`--${boundary}\r\n`);
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${frame.length}\r\n\r\n`);
      res.write(frame);
      res.write("\r\n");
    };
    previewFrameSubscribers.add(sendFrame);

    if (latestPreviewFrame) {
      sendFrame(latestPreviewFrame);
    }

    const keepAlive = setInterval(markPreviewConsumer, 1000);

    res.on("close", () => {
      closed = true;
      clearInterval(keepAlive);
      previewFrameSubscribers.delete(sendFrame);
      scheduleSharedPreviewStop();
    });

    res.on("error", () => {
      // Suppress ECONNRESET when browser disconnects (e.g., navigating away during capture).
      closed = true;
      clearInterval(keepAlive);
      previewFrameSubscribers.delete(sendFrame);
    });
  } catch (err: any) {
    console.error("[agent] Preview stream error:", err);
    if (!res.headersSent) {
      res.status(500).send("Gagal mulai live preview");
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});
app.post("/print", async (req: Request, res: Response) => {
  const { image, imageUrl, printerName, copies, paperWidthMm, paperHeightMm } = req.body as {
    image?:         string;
    imageUrl?:      string;
    printerName?:   string;
    copies?:        number;
    paperWidthMm?:  number;  // dimensi FOTO aktual (bukan ukuran kertas fisik)
    paperHeightMm?: number;
  };

  const imageInput = typeof image === "string" && image.trim().length > 0
    ? image.trim()
    : (typeof imageUrl === "string" ? imageUrl.trim() : "");

  if (!imageInput) {
    res.status(400).json({ ok: false, error: "image atau imageUrl wajib diisi" });
    return;
  }

  const photoW = typeof paperWidthMm  === "number" && paperWidthMm  > 0 ? paperWidthMm  : 102;
  const photoH = typeof paperHeightMm === "number" && paperHeightMm > 0 ? paperHeightMm : 152;

  let tmpFile: string | null = null;
  try {
    tmpFile = await resolveToTempFile(imageInput);
    await printFile(tmpFile, printerName, copies ?? 1, photoW, photoH);
    res.json({ ok: true });
  } catch (err) {
    console.error("[agent] Print error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  } finally {
    // Hapus file temp setelah 30 detik (beri waktu spooler baca)
    if (tmpFile) setTimeout(() => fs.unlink(tmpFile!, () => {}), 30_000);
  }
});

// ── TLS Certificate (self-signed, valid 10 years, embedded) ──────────────────
// Generated: openssl req -x509 -newkey rsa:2048 -days 3650 -nodes
//            -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,IP:::1"

const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDLDCCAhSgAwIBAgIUfQOYyhZBu1QF+kU2Rha6/aPAE+QwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDQyMDA3MTUzOFoXDTM2MDQx
NzA3MTUzOFowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEArube46BY83o0ehaN3BTDtrqELWa0VGwi9EPpzHpszAGa
f5rWsbpPYd62lIEMILEJR9F3z8kRcTINKK5L0xtvSNFtkWsfTQW61E3tgO4ym+gz
2ITchGJpu4QQR1RvrFF7i5mCiyfCWMjEi1sABQ/9t7s9w/A0jVO3DUIsQ33mnQtv
KLoKb3WWEuNiOO1YCU1P0czuWFIzxj/xkPlYbn2KzFhEaQ2xzBTLSNvTRm19QZpO
028d6L3H9L1O+Hqv0ZjBLuIFoWXu3xBpUp01sf3sirOn0Voc29UJgeaOeUp2omd2
JOfMSzNUeE1+2vrqyZN4ECYQkj+h7focekyEA2VU7wIDAQABo3YwdDAdBgNVHQ4E
FgQUh5J92MOVE4Ym4BE5II71xpk7/6swHwYDVR0jBBgwFoAUh5J92MOVE4Ym4BE5
II71xpk7/6swDwYDVR0TAQH/BAUwAwEB/zAhBgNVHREEGjAYhwR/AAABhxAAAAAA
AAAAAAAAAAAAAAABMA0GCSqGSIb3DQEBCwUAA4IBAQAwoNkumu0U18HB0Mb8uKks
Iu0CitBPYn1aUPssaHLjggVmQ6A0zLy4aAC4AqGjj4mqyVaF6DBdNPvtkRIrIfY6
d8jR1GoAJ0/zmOZikMwLtss9uZaljKm+S2AjCHYKJAkPmPAKW9oY9OUeA+cxxh30
apU/YBToF5mofNxVdjVIjISmDXyNgU/a9LRbMyIUp5goFtnFnG/RbVKbtBlA7D3m
Ef2EyqQDotYICYuqwjPdKUz6bNS+Uh3KwoxOOKpb73d73l40E5IXZnkXpMFpoHIp
xK6sK/ZaxZKL7VN655dC91Ji//dsimwpPg+kNhXSHmsyYINlCTIGLmQXZWlsEVxf
-----END CERTIFICATE-----`;

const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCu5t7joFjzejR6
Fo3cFMO2uoQtZrRUbCL0Q+nMemzMAZp/mtaxuk9h3raUgQwgsQlH0XfPyRFxMg0o
rkvTG29I0W2Rax9NBbrUTe2A7jKb6DPYhNyEYmm7hBBHVG+sUXuLmYKLJ8JYyMSL
WwAFD/23uz3D8DSNU7cNQixDfeadC28ougpvdZYS42I47VgJTU/RzO5YUjPGP/GQ
+VhufYrMWERpDbHMFMtI29NGbX1Bmk7Tbx3ovcf0vU74eq/RmMEu4gWhZe7fEGlS
nTWx/eyKs6fRWhzb1QmB5o55SnaiZ3Yk58xLM1R4TX7a+urJk3gQJhCSP6Ht+hx6
TIQDZVTvAgMBAAECggEAJp6V4r86RPDb+4VVZ54yJPwESZ4e/XEvOq5wRpVVxqon
+jsvYukXtC2gNSRVkDZnLTOEeB4Wut7pZu0tkvzA0txjjDOSIsi8Gzrl0Y1HIYPh
RtL3ekfcvuoHSijLy8nmNMn9uEpcMIyMUZUTaQrB5Dr1BXnZsMcmaUgOTAzVyiEp
sZmVBKaEB9GqKyqMzGOc4DU5rMocWnf3iFMECRhp0rfVQea+AZ9SvIM+icayHkK1
ptqSz/FyOrGbcNQa7igpd/OXhdjGyVDCxtgzNI6dh2cIGR/dkJeAUXi1MYe9TfPz
CDffedH6uxscAUdlsNJpdtl/C466eqyooKJYH8OIwQKBgQDcRntx07oIbRBFiIgA
ZcfoCqfY4aWTh1sfTEqKnuwCinyy1EvJP9QJ1KQHY3JOacAQjgI8pJ4yDzOPlx3a
ygJ8ScbXJVFWMUtBVSOEjLrmlEVzuwm08FS35LZ5jXtsXwX4dTDRh+rLeYjPV7TJ
h4shjIOaUIKTGx2h1oxZllwVTwKBgQDLRIvJaZaRaPBs77cgW1qkg0OwyU+JJjW4
YcGjVXXZFUQRNJdz49C7lWfg4o1uwonXWvNjGwqVc68/ydDQ0IzPsWnOxWKDGD1q
OwVtxDt3yIgBUADtgsopJ/zI+KvEnvXYHhZ6gwFoy//OMvOjr79ghb2Q07mXBCCC
93sEg14eYQKBgGW5It7RERM9EouZ3nyYhDXzXcn5gpZbpsgQWkgj1gfiXm3TPmBk
2o3jphBHa40spua+Peg1eVzSylPgTIgyS+2LwIiwkhxEzWURZUKcHt/Gzz//ux7U
8bquo1oE7V+BjmdL70yEAPkQWg6uiS2cK7NFiazkyzgWCJwpUU0587JfAoGAOYsh
K5a5qlaT4bMHG6DhCzuh2RVUb9YiVR1PjSavYxIzH8/MpGE1ATWtn6tjMJzgGthD
mKXaHC8QyLUgaUzw4AcwlfmpBsXA9SbaRZXM4/8gCYcVjCd/haEtXdOQBOyfWlxC
LtKRfpJpy3z/HjKtseyKmspleswPTCQ1bjSmW2ECgYEAw7g7tl2xfJobc7F7t9OK
gDxl4HUJEpuUljf8THfOdltpLelIgQrv0nm+rH7VwkDTnLy+WR3ys5fc2O/L5FNt
PA7TQZ7B4ommAanLgrdZ0EFx7/+ViOL5xvi0Kazo2vIGefAQfb8OlAxaj4c8MQXz
TqbbwuTRFiZzBCbQKR34tPM=
-----END PRIVATE KEY-----`;

// ── Start ────────────────────────────────────────────────────────────────────
// Windows  → HTTP  (Chrome/Edge treat http://127.0.0.1 as secure context)
// macOS    → HTTPS (Safari requires HTTPS even for loopback; cert must be trusted once)

const proto = isMac ? "https" : "http";

const server = isMac
  ? https.createServer({ cert: TLS_CERT, key: TLS_KEY }, app)
  : http.createServer(app);

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[agent] Port ${PORT} sudah dipakai. Agent lain kemungkinan masih berjalan di ${proto}://127.0.0.1:${PORT}.`);
    process.exit(0);
  }
  console.error(`[agent] Gagal menjalankan server: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  Fremio Studio Agent v${VERSION}       ║`);
  console.log(`║  ${proto}://127.0.0.1:${PORT}             ║`);
  console.log(`║  Platform: ${process.platform.padEnd(26)}║`);
  console.log(`╚══════════════════════════════════════╝`);

  // Auto-start preview: keep Canon live view ON always so it's instantly ready
  // when the booth session starts — no delay waiting for EVF activation.
  setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 1000);

  // macOS: write cert and show one-time install command
  if (isMac) {
    const certPath = path.join(os.homedir(), "Downloads", "fremio-cert.pem");
    try {
      fs.writeFileSync(certPath, TLS_CERT, { mode: 0o644 });
      console.log(``);
      console.log(`╔══════════════════════════════════════════════════════════════╗`);
      console.log(`║  PERLU DILAKUKAN SEKALI: install sertifikat HTTPS agent      ║`);
      console.log(`║  Salin dan jalankan perintah di bawah di Terminal:           ║`);
      console.log(`║                                                              ║`);
      console.log(`║  sudo security add-trusted-cert -d -r trustRoot \\           ║`);
      console.log(`║    -k /Library/Keychains/System.keychain \\                  ║`);
      console.log(`║    ~/Downloads/fremio-cert.pem                               ║`);
      console.log(`║                                                              ║`);
      console.log(`║  Lalu restart browser, dan buka booth kembali.              ║`);
      console.log(`╚══════════════════════════════════════════════════════════════╝`);
      console.log(``);
    } catch { /* ignore */ }
  }

  listPrinters().then((p) => {
    if (p.length)  console.log(`[agent] Printer ditemukan: ${p.join(", ")}`);
    else           console.log(`[agent] Tidak ada printer ditemukan.`);
  });
});
