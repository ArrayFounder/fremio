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
const VERSION = "1.0.13";

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
let previewPreStoppedAt = 0; // Timestamp when /prepare-capture last pre-stopped preview
let captureInProgress = false; // Prevent preview auto-restart during capture
let captureHandlerInFlight = false; // Prevent duplicate /capture calls (separate from captureInProgress)

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
    if (Date.now() - lastPreviewConsumerAt < delayMs) {
      scheduleSharedPreviewStop(delayMs);
      return;
    }
    stopSharedPreviewProcess();
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
    const plannedRestart = plannedPreviewRestarts.has(child);
    if (plannedRestart) plannedPreviewRestarts.delete(child);
    if (sharedPreviewProcess === child) {
      sharedPreviewProcess = null;
      sharedPreviewBuffer = Buffer.alloc(0);
    }
    if (plannedRestart) return;
    failPreviewFrameWaiters(error instanceof Error ? error : new Error(String(error)));
    if (hasPreviewDemand()) {
      restartSharedPreviewProcess("preview process error");
    }
  });

  child.on("exit", (code, signal) => {
    activePreviewStreams.delete(child);
    const plannedRestart = plannedPreviewRestarts.has(child);
    if (plannedRestart) plannedPreviewRestarts.delete(child);
    if (sharedPreviewProcess === child) {
      sharedPreviewProcess = null;
      sharedPreviewBuffer = Buffer.alloc(0);
    }
    if (plannedRestart) {
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
  ];
  return Array.from(new Set(roots));
}

function resolveEdsdkBridgePath(): string {
  const explicit = process.env.EDSDK_BRIDGE_PATH?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const isWindowsExe = process.platform === "win32" ? "edsdk-bridge-native.exe" : "edsdk-bridge-native";
  for (const root of getAgentRuntimeRoots()) {
    const candidates = [
      path.join(root, "bin", isWindowsExe),
      path.join(root, "bin", "edsdk-bridge"),
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
    const { stdout } = await execBridgeBuffer(bridgePath, statusArgs, 8000);
    const payload = JSON.parse(stdout.toString("utf8")) as BridgeStatusPayload;

    const cameras = Array.isArray(payload.cameras)
      ? payload.cameras.map((c) => ({ model: String(c.model || "Canon"), port: String(c.port || "") }))
      : [];

    return {
      available: cameras.length > 0,
      count: cameras.length,
      devices: cameras,
      type: cameras.length > 0 ? "dslr" : "none",
      error: payload.error || undefined,
      capabilities: payload.capabilities,
    };
  } catch (error) {
    return {
      available: false,
      count: 0,
      devices: [],
      type: "none",
      error: error instanceof Error ? error.message : String(error),
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

app.get("/printers", async (_req: Request, res: Response) => {
  const printers = await listPrinters();
  res.json({ ok: true, printers });
});

app.post("/prepare-capture", async (_req: Request, res: Response) => {
  // Pre-arm capture: stop live preview and spawn the C# bridge in "armed" mode.
  // The armed bridge does all setup (session open, EVF disable, SaveTo, event handler)
  // and prints BRIDGE_READY when ready. /capture then just sends SHOOT → instant shutter.
  captureInProgress = true;
  const t0 = Date.now();

  // Kill preview — we need the camera freed ASAP for the armed bridge
  const stopped = await stopActivePreviewStreams(50); // 50ms hard kill grace
  console.log(`[agent] prepare-capture: preview stop requested, elapsed=${Date.now()-t0}ms`);

  // CRITICAL FIX: The preview bridge can take 1000ms+ to exit (not 80ms!) due to
  // C# live view loop hanging. We MUST wait for the preview to FULLY exit before
  // spawning the armed bridge. Otherwise, armed bridge sees CommPortIsAlreadyOpen (0xC0)
  // and fails all 8 retries → crash.
  let previewExitWaitMs = 0;
  const maxPreviewWait = 2000;
  const pollInterval = 30;
  while (activePreviewStreams.size > 0 && previewExitWaitMs < maxPreviewWait) {
    await new Promise<void>((r) => setTimeout(r, pollInterval));
    previewExitWaitMs += pollInterval;
  }
  if (activePreviewStreams.size > 0) {
    console.warn(`[agent] Preview still running after ${maxPreviewWait}ms, proceeding anyway`);
  } else {
    console.log(`[agent] Preview confirmed dead, waited=${previewExitWaitMs}ms`);
  }

  // Extra wait: give EDSDK time to fully release the USB session after preview exit.
  // This is the minimum reliable USB release time for EOS cameras between processes.
  await new Promise<void>((r) => setTimeout(r, 300));
  previewPreStoppedAt = Date.now();

  // Clean up any previous armed bridge that wasn't used
  if (armedCapture) {
    try { armedCapture.process.kill(); } catch { /* ignore */ }
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
        console.log(`[agent] BRIDGE_READY received at ${Date.now()-t0}ms after prepare-capture`);
        readyResolve!();
      }
    }
  });

  armedProcess.on("exit", (code) => {
    if (stderrBuf) { console.log(`[armed-bridge] ${stderrBuf}`); stderrBuf = ""; }
    console.log(`[agent] Armed bridge exited code=${code}`);
    if (!bridgeReady) readyReject!(new Error(`Armed bridge exited before BRIDGE_READY (code ${code})`));
    if (code === 0) {
      completionResolve!(tmpFile);
    } else {
      completionReject!(new Error(`Armed bridge exited with code ${code}`));
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
      console.log(`[agent] Sending SHOOT to armed bridge`);
      armedProcess.stdin?.write("SHOOT\n");
    },
    completionPromise,
  };

  // Suppress unhandled rejections — these are caught in /capture
  readyPromise.catch(() => {});
  completionPromise.catch(() => {});

  // FIX 4: Wait for BRIDGE_READY before responding to client.
  // This ensures /capture (fired simultaneously) always finds armedCapture fully initialized.
  // If BRIDGE_READY never comes (camera busy / USB conflict), return error instead of success.
  try {
    await readyPromise; // timeout is 15s in the bridge's SHOOT wait, but we trust the bridge
    console.log(`[agent] /prepare-capture: BRIDGE_READY confirmed, responding at ${Date.now()-t0}ms`);
    res.json({ ok: true, stopped, armedBridgePid: armedProcess.pid });
  } catch (err) {
    console.error(`[agent] /prepare-capture: BRIDGE_READY failed: ${(err as Error).message}`);
    // Kill the failed armed bridge to avoid orphaned USB session
    try { armedProcess.kill(); } catch { /* ignore */ }
    if (armedCapture?.process === armedProcess) armedCapture = null;
    // FIX: Reset captureInProgress so preview can restart and the wait loop in /capture exits early
    captureInProgress = false;
    res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage((err as Error).message) });
  }
});


app.post("/capture", async (req: Request, res: Response) => {
  const tmpDir = os.tmpdir();
  const wantsBinary = req.query.format === "binary" || String(req.get("accept") || "").includes("image/jpeg");
  const hadPreviewSession = isPreviewSessionActive();

  // FIX 5: Prevent duplicate /capture calls from racing (e.g. double-trigger).
  // Uses captureHandlerInFlight (not captureInProgress) so it doesn't false-reject
  // the legitimate /capture call that runs simultaneously with /prepare-capture.
  if (captureHandlerInFlight) {
    console.warn("[agent] /capture: rejected (capture already in progress)");
    res.status(409).json({ ok: false, error: "Capture sedang berlangsung — tunggu beberapa saat" });
    return;
  }

  captureHandlerInFlight = true;
  captureInProgress = true;

  // FIX 1: If armedCapture is still spawning (prepare-capture was fired simultaneously
  // from CameraScreen), wait up to 5s for it to become available before falling through
  // to the fallback path. This prevents execBridgeBuffer from racing with the armed bridge.
  // Also exits early if captureInProgress was reset (prepare-capture failed).
  let armed = armedCapture;
  if (!armed) {
    const deadline = Date.now() + 5000;
    while (!armedCapture && captureInProgress && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    armed = armedCapture;
  }

  if (armed) {
    armedCapture = null; // take ownership
    const tmpFile = armed.outputPath;
    const t0 = Date.now();
    console.log(`[agent] /capture: using armed bridge, awaiting BRIDGE_READY`);
    try {
      // Wait for armed bridge to finish setup (should already be done by the time /capture fires)
      await armed.readyPromise;
      console.log(`[agent] /capture: BRIDGE_READY confirmed, sending SHOOT at ${Date.now()-t0}ms`);
      armed.shootFn();

      // Wait for download to complete
      const outputPath = await armed.completionPromise;

      if (!fs.existsSync(outputPath)) {
        res.status(500).json({ ok: false, error: "Foto berhasil diambil tapi file tidak ditemukan" });
        return;
      }

      const buf = fs.readFileSync(outputPath);
      console.log(`[agent] /capture: armed path done in ${Date.now()-t0}ms, ${buf.length} bytes`);

      if (wantsBinary) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.send(buf);
      } else {
        res.json({ ok: true, image: { base64: buf.toString("base64"), mimeType: "image/jpeg" } });
      }
    } catch (err: any) {
      console.error("[agent] Armed capture error:", err);
      const rawError = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage(rawError) });
    } finally {
      captureHandlerInFlight = false;
      captureInProgress = false;
      previewPreStoppedAt = 0;
      // Clean up temp file
      const tmpFile2 = armed.outputPath;
      if (fs.existsSync(tmpFile2)) { try { fs.unlinkSync(tmpFile2); } catch { /* ignore */ } }
      // FIX 2: Don't restart preview if another armed capture is incoming (next countdown cycle).
      if (hadPreviewSession && !armedCapture) {
        setTimeout(() => {
          try {
            startSharedPreviewProcess();
            void getPreviewFrame(1200).then(() => scheduleSharedPreviewStop(1000)).catch(() => scheduleSharedPreviewStop(800)); // OPTIMIZED: reduced idle from 2000/1000 to 1000/800
          } catch { /* ignore */ }
        }, 30); // OPTIMIZED: reduced from 50ms to 30ms
      }
    }
    return;
  }

  // --- FALLBACK PATH: traditional capture (no pre-armed bridge available) ---
  const tmpFile = path.join(tmpDir, `fremio-capture-${Date.now()}.jpg`);


  try {
    const stoppedExistingStream = await stopActivePreviewStreams();
    // Wait for preview to fully exit (same as prepare-capture fix).
    // The preview bridge can take 500-2000ms to exit, not 150ms.
    // Subtract elapsed from recovery wait.
    const preStopElapsedMs = previewPreStoppedAt > 0 ? Date.now() - previewPreStoppedAt : 0;
    const baseRecoveryMs = 400; // OPTIMIZED: increased from 200/150 — longer USB release time
    const recoveryMs = Math.max(0, baseRecoveryMs - preStopElapsedMs);
    previewPreStoppedAt = 0;
    if (recoveryMs > 0) await new Promise((resolve) => setTimeout(resolve, recoveryMs));

    const bridgePath = resolveEdsdkBridgePath();
    const captureArgs = parseBridgeArgs(process.env.EDSDK_BRIDGE_CAPTURE_ARGS, "capture --output {output}")
      .map((arg) => (arg === "{output}" ? tmpFile : arg.replace("{output}", tmpFile)));

    let captureError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await execBridgeBuffer(bridgePath, captureArgs, 60000);
        captureError = null;
        break;
      } catch (err) {
        captureError = err;
        if (fs.existsSync(tmpFile)) break;
        const message = err instanceof Error ? err.message : String(err);
        if (!isRetryableCaptureFailure(message) || attempt >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 900 + attempt * 400));
      }
    }

    if (captureError && !fs.existsSync(tmpFile)) {
      const message = captureError instanceof Error ? captureError.message : String(captureError);
      throw new Error(normalizeBridgeErrorMessage(message || "Capture gagal dan file foto tidak ditemukan"));
    }

    if (!fs.existsSync(tmpFile)) {
      res.status(500).json({ ok: false, error: "Foto berhasil diambil tapi file tidak ditemukan" });
      return;
    }

    const buf = fs.readFileSync(tmpFile);
    if (wantsBinary) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(buf);
      return;
    }

    const base64 = buf.toString("base64");

    res.json({
      ok: true,
      image: {
        base64,
        mimeType: "image/jpeg",
      },
    });
  } catch (err: any) {
    console.error("[agent] Capture error:", err);
    const rawError = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: normalizeBridgeErrorMessage(rawError) });
  } finally {
    captureHandlerInFlight = false;
    captureInProgress = false; // Allow preview to restart again
    previewPreStoppedAt = 0;

    if (hadPreviewSession && !armedCapture) {
      setTimeout(() => { // OPTIMIZED: reduced from 120ms to 30ms for faster preview resume
        try {
          startSharedPreviewProcess();
          void getPreviewFrame(1200) // OPTIMIZED: reduced from 2200ms to 1200ms
            .then(() => {
              scheduleSharedPreviewStop(1000); // OPTIMIZED: reduced from 2000ms to 1000ms
            })
            .catch(() => {
              scheduleSharedPreviewStop(800); // OPTIMIZED: reduced from 2000ms to 800ms
            });
        } catch {
          // Ignore warm-up failures; preview route will retry on next request.
        }
      }, 30);
    }

    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
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
