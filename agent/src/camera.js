'use strict';

/**
 * camera.js — Canon EDSDK bridge wrapper for DSLR capture
 *
 * Deps: none (uses child_process + fs + EventEmitter from Node.js stdlib)
 * Env:  EDSDK_BRIDGE_PATH — path to edsdk-bridge-native.exe (optional override)
 *
 * The EDSDK bridge binary (edsdk-bridge-native.exe) must have EDSDK.dll
 * in the same directory. CLI interface:
 *   edsdk-bridge-native status                   → JSON to stdout
 *   edsdk-bridge-native capture --output <path>  → writes JPEG to file
 *   edsdk-bridge-native preview --stdout         → writes raw JPEG bytes to stdout (single frame)
 *   edsdk-bridge-native preview-stream           → streams length-framed JPEG frames until stdin closes
 */

const { execFile, spawn }  = require('child_process');
const { EventEmitter }     = require('events');
const fs                   = require('fs');
const path                 = require('path');
const os                   = require('os');
const logger               = require('./logger');

// ─── EDSDK bridge path resolution ────────────────────────────────────────────

function resolveEdsdkBridgePath() {
  if (process.env.EDSDK_BRIDGE_PATH) return process.env.EDSDK_BRIDGE_PATH;

  const exe = process.platform === 'win32' ? 'edsdk-bridge-native.exe' : 'edsdk-bridge-native';

  // Search relative to this file's location (agent/src/) up through known layouts
  const candidates = [
    path.resolve(__dirname, '..', 'bin', exe),                          // agent/bin/
    path.resolve(__dirname, '..', '..', 'studio', 'agent', 'bin', exe), // repo-root/studio/agent/bin/
    path.resolve(__dirname, '..', '..', 'agent', 'bin', exe),           // repo-root/agent/bin/
    path.resolve(__dirname, exe),                                        // agent/src/
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }

  return exe; // fallback — let the OS find it on PATH
}

const EDSDK_BRIDGE = resolveEdsdkBridgePath();
const TMPDIR       = os.tmpdir();

logger.info(`EDSDK bridge path: ${EDSDK_BRIDGE}`);

// ─── Session guard ───────────────────────────────────────────────────────────
// EDSDK opens its own COM/USB session per command invocation; concurrent
// capture + preview calls can conflict. Use a simple in-flight flag.

let captureInFlight = false;
let previewInFlight = false;

// ─── Persistent preview-stream state ─────────────────────────────────────────
// The `preview-stream` bridge command keeps EDSDK alive and streams
// length-framed JPEG frames (4-byte big-endian length + raw JPEG bytes)
// to stdout until we close its stdin.
//
// We spawn ONE process shared across all connected MJPEG clients and stop it
// when the last client disconnects.

/** EventEmitter that emits 'frame' (Buffer) events from the bridge process. */
const previewStreamEmitter = new EventEmitter();
previewStreamEmitter.setMaxListeners(50); // support many concurrent clients

let _streamProcess   = null; // child_process.ChildProcess or null
let _streamClients   = 0;    // number of active /preview-stream subscribers
let _streamParseBuffer = Buffer.alloc(0); // rolling parse buffer for length-framed data
let _streamIdleTimer = null; // grace-period timer: keeps bridge alive briefly after last client disconnects

// How long (ms) to keep the bridge process alive after the last client disconnects.
// This allows CameraScreen (which loads right after BoothSetupScreen unmounts) to
// reconnect to an already-running bridge — eliminating the startup delay.
const STREAM_IDLE_GRACE_MS = 5000;

function _clearStreamIdleTimer() {
  if (_streamIdleTimer !== null) {
    clearTimeout(_streamIdleTimer);
    _streamIdleTimer = null;
  }
}

function _startStreamProcess() {
  if (_streamProcess) return; // already running

  logger.info('Starting persistent preview-stream bridge process');
  _streamParseBuffer = Buffer.alloc(0);

  _streamProcess = spawn(EDSDK_BRIDGE, ['preview-stream'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  _streamProcess.stderr.on('data', (d) => {
    logger.debug(`[bridge stderr] ${d.toString().trim()}`);
  });

  _streamProcess.stdout.on('data', (chunk) => {
    _streamParseBuffer = Buffer.concat([_streamParseBuffer, chunk]);
    // Parse all complete frames (4-byte big-endian length prefix + JPEG payload)
    while (_streamParseBuffer.length >= 4) {
      const frameLen = _streamParseBuffer.readUInt32BE(0);
      if (_streamParseBuffer.length < 4 + frameLen) break; // wait for more data
      const frame = _streamParseBuffer.slice(4, 4 + frameLen);
      _streamParseBuffer = _streamParseBuffer.slice(4 + frameLen);
      previewStreamEmitter.emit('frame', frame);
    }
  });

  _streamProcess.on('exit', (code, signal) => {
    logger.info(`Preview-stream bridge exited (code=${code}, signal=${signal})`);
    _streamProcess     = null;
    _streamParseBuffer = Buffer.alloc(0);
    previewStreamEmitter.emit('stream-end');
  });

  _streamProcess.on('error', (err) => {
    logger.error('Preview-stream bridge error', { message: err.message });
    _streamProcess     = null;
    _streamParseBuffer = Buffer.alloc(0);
    previewStreamEmitter.emit('stream-end');
  });
}

function _stopStreamProcess(forceImmediate = false) {
  if (!_streamProcess) return;

  if (forceImmediate) {
    _clearStreamIdleTimer();
    logger.info('Stopping persistent preview-stream bridge process (forced)');
    try { _streamProcess.stdin.end(); } catch { /* ignore */ }
    _streamProcess = null;
    return;
  }

  // Grace period: keep the bridge alive briefly so the next client
  // (e.g. CameraScreen loading right after BoothSetupScreen transitions away)
  // can reconnect to an already-running process — zero startup delay.
  _clearStreamIdleTimer();
  _streamIdleTimer = setTimeout(() => {
    _streamIdleTimer = null;
    if (_streamClients === 0 && _streamProcess) {
      logger.info('Stopping persistent preview-stream bridge process (idle grace expired)');
      try { _streamProcess.stdin.end(); } catch { /* ignore */ }
      _streamProcess = null;
    }
  }, STREAM_IDLE_GRACE_MS);
  logger.debug(`Preview-stream bridge idle grace started (${STREAM_IDLE_GRACE_MS}ms)`);
}

/**
 * Register a new MJPEG client to receive Canon live-view frames.
 * Starts the bridge preview-stream process if not already running.
 *
 * @param {function(Buffer): void} onFrame  Called for each JPEG frame.
 * @param {function(): void}       onEnd    Called when the bridge stream ends.
 * @returns {function(): void}  Call this to unsubscribe (and stop bridge if last client).
 */
function subscribePreviewStream(onFrame, onEnd) {
  _streamClients++;
  previewStreamEmitter.on('frame',      onFrame);
  previewStreamEmitter.on('stream-end', onEnd);

  // Cancel any pending idle-stop timer — a new client just arrived.
  _clearStreamIdleTimer();

  // Start the bridge if it isn't already running AND no capture is in flight.
  if (!_streamProcess && !captureInFlight) {
    _startStreamProcess();
  }

  return function unsubscribe() {
    previewStreamEmitter.off('frame',      onFrame);
    previewStreamEmitter.off('stream-end', onEnd);
    _streamClients = Math.max(0, _streamClients - 1);
    if (_streamClients === 0) {
      _stopStreamProcess(); // enters grace period before actually stopping
    }
  };
}

/**
 * Stop the preview-stream process immediately (called before a shutter capture
 * so the two EDSDK sessions don't conflict).
 */
function killPreviewStream() {
  _clearStreamIdleTimer();
  _stopStreamProcess(/* forceImmediate= */ true);
  _streamClients = 0;
  _streamParseBuffer = Buffer.alloc(0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runBridgeJson(args, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    execFile(EDSDK_BRIDGE, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const raw = (stdout || '').trim();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore parse errors */ }

      if (err && !parsed) {
        reject(new Error(`edsdk-bridge ${args[0]} failed: ${err.message}\nstderr: ${stderr || '(empty)'}`));
        return;
      }
      resolve({ parsed, stdout: raw, stderr: stderr || '', exitCode: err ? err.code : 0 });
    });
  });
}

function runBridgeBinary(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    execFile(
      EDSDK_BRIDGE,
      args,
      { timeout: timeoutMs, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && (!stdout || stdout.length === 0)) {
          reject(new Error(`edsdk-bridge ${args[0]} failed: ${err.message}`));
          return;
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || ''));
      }
    );
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect connected Canon cameras via EDSDK bridge.
 *
 * @returns {{ available: boolean, cameras: { model: string, port: string }[], error?: string }}
 */
async function detectCamera() {
  logger.debug(`Running EDSDK bridge status: ${EDSDK_BRIDGE}`);

  try {
    const { parsed } = await runBridgeJson(['status'], 15_000);

    if (!parsed) {
      return { available: false, cameras: [], error: 'edsdk-bridge status returned no JSON' };
    }

    if (!parsed.ok) {
      return { available: false, cameras: [], error: parsed.error || 'edsdk-bridge: camera not available' };
    }

    const cameras = (parsed.cameras || []).map((c) => ({
      model: c.model || 'Canon DSLR',
      port:  c.port  || 'edsdk:0',
    }));

    logger.info(`EDSDK camera detection: ${cameras.length} kamera ditemukan`, cameras);
    return { available: cameras.length > 0, cameras };

  } catch (err) {
    // ENOENT = bridge binary not found
    if (err.code === 'ENOENT' || err.message.includes('ENOENT')) {
      logger.warn('edsdk-bridge-native not found', { path: EDSDK_BRIDGE });
      return {
        available: false,
        cameras: [],
        error: `edsdk-bridge-native tidak ditemukan di: "${EDSDK_BRIDGE}". Pastikan file ada di agent/bin/.`,
      };
    }
    logger.error('EDSDK detectCamera error', { message: err.message });
    return { available: false, cameras: [], error: `EDSDK error: ${err.message}` };
  }
}

/**
 * Get full camera status including capabilities.
 */
async function getCameraStatus() {
  const detection = await detectCamera();

  if (!detection.available) {
    return {
      ...detection,
      capabilities: { supportsCapture: false, supportsLiveView: false, mode: 'unavailable' },
    };
  }

  // Parse capabilities from the bridge status response
  let capabilities = {
    supportsCapture: true,
    supportsLiveView: true,
    mode: 'live-view',
    checkedAt: new Date().toISOString(),
  };

  try {
    const { parsed } = await runBridgeJson(['status'], 15_000);
    if (parsed && parsed.capabilities) {
      capabilities = {
        ...capabilities,
        supportsLiveView: parsed.capabilities.supportsLiveView ?? true,
        mode: parsed.capabilities.mode || 'live-view',
      };
    }
  } catch { /* use defaults */ }

  return { ...detection, capabilities };
}

/**
 * Capture a photo from the connected Canon DSLR via EDSDK.
 *
 * @param {{ keepOnCamera?: boolean }} [options]
 * @returns {Promise<{ base64: string, mimeType: string, size: number, elapsedMs: number }>}
 */
async function capturePhoto({ keepOnCamera = false } = {}) {
  if (captureInFlight) {
    const err = new Error('Capture sedang berjalan, coba lagi nanti.');
    err.code = 'CAPTURE_IN_FLIGHT';
    throw err;
  }

  // Stop any running preview-stream process first — EDSDK cannot have two
  // concurrent sessions (preview + capture) on the same camera.
  killPreviewStream();

  captureInFlight = true;
  const filename = path.join(TMPDIR, `fremio_cap_${Date.now()}.jpg`);

  logger.info(`Capturing photo via EDSDK → ${filename}`);

  const t0 = Date.now();
  try {
    await new Promise((resolve, reject) => {
      execFile(
        EDSDK_BRIDGE,
        ['capture', '--output', filename],
        { timeout: 30_000 },
        (err, stdout, stderr) => {
          const elapsedMs = Date.now() - t0;
          if (err) {
            logger.error('EDSDK capture failed', { message: err.message, stdout, stderr, elapsedMs });
            reject(new Error(
              `EDSDK capture gagal setelah ${elapsedMs}ms.\n` +
              `Error: ${err.message}\n` +
              `stdout: ${stdout || '(kosong)'}\n` +
              `stderr: ${stderr || '(kosong)'}`
            ));
            return;
          }
          resolve();
        }
      );
    });

    if (!fs.existsSync(filename)) {
      throw new Error(`EDSDK capture selesai tapi file tidak ditemukan: ${filename}`);
    }

    const buffer = fs.readFileSync(filename);
    const elapsedMs = Date.now() - t0;
    logger.info(`Photo captured via EDSDK: ${(buffer.length / 1024).toFixed(1)} KB in ${elapsedMs}ms`);
    try { fs.unlinkSync(filename); } catch { /* non-critical cleanup */ }

    return { base64: buffer.toString('base64'), mimeType: 'image/jpeg', size: buffer.length, elapsedMs };

  } finally {
    captureInFlight = false;
  }
}

/**
 * Capture a live preview frame via EDSDK (no shutter).
 *
 * @returns {Promise<{ buffer: Buffer, mimeType: string, size: number, elapsedMs: number }>}
 */
async function capturePreview() {
  if (captureInFlight) {
    const err = new Error('Capture sedang berjalan, preview tidak tersedia sementara.');
    err.code = 'CAPTURE_IN_FLIGHT';
    throw err;
  }

  if (previewInFlight) {
    const err = new Error('Preview sedang berjalan.');
    err.code = 'PREVIEW_IN_FLIGHT';
    throw err;
  }

  previewInFlight = true;
  const t0 = Date.now();

  try {
    const buffer = await runBridgeBinary(['preview', '--stdout'], 10_000);

    if (!buffer || buffer.length < 4) {
      const err = new Error('EDSDK preview returned empty frame.');
      err.code = 'LIVE_VIEW_UNSUPPORTED';
      throw err;
    }

    const elapsedMs = Date.now() - t0;
    logger.debug(`EDSDK preview frame: ${(buffer.length / 1024).toFixed(1)} KB in ${elapsedMs}ms`);
    return { buffer, mimeType: 'image/jpeg', size: buffer.length, elapsedMs };

  } catch (err) {
    const elapsedMs = Date.now() - t0;
    logger.error('EDSDK preview failed', { message: err.message, elapsedMs });
    if (!err.code) err.code = 'LIVE_VIEW_UNSUPPORTED';
    throw err;
  } finally {
    previewInFlight = false;
  }
}

/** Returns true while a capturePhoto() call is in-flight. */
function isCaptureInFlight() {
  return captureInFlight;
}

module.exports = {
  detectCamera,
  getCameraStatus,
  capturePhoto,
  capturePreview,
  isCaptureInFlight,
  subscribePreviewStream,
  killPreviewStream,
  previewStreamEmitter,
};
