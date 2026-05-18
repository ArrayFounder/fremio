'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const os      = require('os');
const logger  = require('./logger');
const camera  = require('./camera');
const printer = require('./printer');

const PORT    = parseInt(process.env.PORT || '7432', 10);
const VERSION = require('../package.json').version;
const STATUS_CACHE_MS = Math.max(500, parseInt(process.env.STATUS_CACHE_MS || '3000', 10) || 3000);

let statusCache = null;
let statusInFlight = null;

function buildStatusPayload(cameraData, printerData) {
  return {
    ok: true,
    agent: {
      version:  VERSION,
      platform: os.platform(),
      uptime:   process.uptime(),
    },
    camera: {
      available:    cameraData.available,
      count:        cameraData.cameras?.length ?? 0,
      cameras:      cameraData.cameras ?? [],
      capabilities: cameraData.capabilities ?? {
        supportsCapture: false,
        supportsLiveView: false,
        mode: 'unknown',
      },
      ...(cameraData.error ? { error: cameraData.error } : {}),
    },
    printer: {
      available:      printerData.available,
      count:          printerData.printers?.length ?? 0,
      printers:       printerData.printers ?? [],
      defaultPrinter: printerData.defaultPrinter ?? null,
      ...(printerData.error ? { error: printerData.error } : {}),
    },
  };
}

async function collectHardwareStatus() {
  const [cameraResult, printerResult] = await Promise.allSettled([
    camera.getCameraStatus(),
    printer.detectPrinters(),
  ]);

  const cameraData =
    cameraResult.status === 'fulfilled'
      ? cameraResult.value
      : { available: false, cameras: [], error: cameraResult.reason?.message };

  const printerData =
    printerResult.status === 'fulfilled'
      ? printerResult.value
      : { available: false, printers: [], error: printerResult.reason?.message };

  return { cameraData, printerData };
}

// ─── App startup ──────────────────────────────────────────────────────────────

const app = express();

// ─── CORS — allow localhost and Fremio booth origins ─────────────────────────

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const FREMIO_RE = /^https?:\/\/([a-z0-9-]+\.)*fremio\.id$/;

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, curl, Postman dev)
      if (!origin || LOCALHOST_RE.test(origin) || FREMIO_RE.test(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS rejected origin: ${origin}`);
        callback(new Error(`CORS: origin ditolak: ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// ─── Body parser — limit to 50 MB (high-res JPEG base64 ~15 MB) ──────────────

app.use(express.json({ limit: '50mb' }));

// ─── Request logger ───────────────────────────────────────────────────────────

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

/**
 * GET /preview-stream
 * MJPEG live-view stream — used as <img src> by the booth UI when the
 * Electron IPC launcher is NOT running (standard agent exe mode).
 * Responds with multipart/x-mixed-replace so the browser natively
 * refreshes the image without JavaScript polling.
 */
app.get('/preview-stream', async (req, res) => {
  logger.debug('GET /preview-stream — starting MJPEG live-view stream');

  const boundary = 'fremioframe';
  res.setHeader('Content-Type',  `multipart/x-mixed-replace; boundary=${boundary}`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma',        'no-cache');
  res.setHeader('Expires',       '0');

  let active = true;
  req.on('close', () => {
    active = false;
    logger.debug('GET /preview-stream — client disconnected');
  });

  const writeFrame = (buffer) => {
    if (!active || !res.writable) return false;
    try {
      res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
      res.write(buffer);
      res.write('\r\n');
      return true;
    } catch {
      active = false;
      return false;
    }
  };

  while (active && res.writable) {
    // Pause while a shutter capture is in progress.
    if (camera.isCaptureInFlight()) {
      await new Promise((r) => setTimeout(r, 80));
      continue;
    }

    try {
      const result = await camera.capturePreview();
      writeFrame(result.buffer);
    } catch (err) {
      if (!active) break;
      // Another preview call is already in-flight (e.g. duplicate connection) — wait briefly.
      if (err.code === 'PREVIEW_IN_FLIGHT') {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      logger.warn('GET /preview-stream frame error', { message: err.message, code: err.code });
      // Pause before retry so we don't spam edsdk-bridge on persistent errors.
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  try { res.end(); } catch { /* ignore write-after-end */ }
});

/**
 * GET /preview
 * Return one DSLR preview frame (no shutter) for live-view polling.
 */
app.get('/preview', async (_req, res) => {
  logger.debug('GET /preview — fetching DSLR live preview frame');

  // Fast-path: refuse while a capture is in-flight to avoid USB conflicts.
  if (camera.isCaptureInFlight()) {
    return res.status(503).json({
      ok:    false,
      error: 'Capture sedang berjalan, preview tidak tersedia sementara.',
      code:  'CAPTURE_IN_FLIGHT',
      hint:  'Preview akan kembali otomatis setelah capture selesai.',
    });
  }

  let result;
  try {
    result = await camera.capturePreview();
  } catch (err) {
    const isCaptureConflict = err && (err.code === 'CAPTURE_IN_FLIGHT');
    const statusCode = isCaptureConflict ? 503 : (err && err.code === 'LIVE_VIEW_UNSUPPORTED' ? 409 : 500);
    logger.error('GET /preview error', { message: err.message });
    return res.status(statusCode).json({
      ok: false,
      error: err.message,
      code: err && err.code ? err.code : 'PREVIEW_ERROR',
      hint: isCaptureConflict
        ? 'Preview akan kembali otomatis setelah capture selesai.'
        : err && err.code === 'LIVE_VIEW_UNSUPPORTED'
        ? 'Model kamera ini berjalan di mode capture-only. Tombol Ambil Foto tetap bisa dipakai.'
        : 'Pastikan kamera mendukung preview dan mode PTP/PC Remote aktif.',
    });
  }

  res.setHeader('Content-Type', result.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Frame-Elapsed-Ms', String(result.elapsedMs));
  res.send(result.buffer);
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /status
 * Check camera and printer availability.
 */
app.get('/status', async (_req, res) => {
  logger.info('GET /status — checking hardware');

  const now = Date.now();
  if (statusCache && now - statusCache.ts < STATUS_CACHE_MS) {
    const payload = buildStatusPayload(statusCache.cameraData, statusCache.printerData);
    logger.info('/status result (cached)', {
      cameraAvailable:  payload.camera.available,
      printerAvailable: payload.printer.available,
    });
    return res.json(payload);
  }

  if (!statusInFlight) {
    statusInFlight = collectHardwareStatus()
      .then(({ cameraData, printerData }) => {
        statusCache = { ts: Date.now(), cameraData, printerData };
        return statusCache;
      })
      .catch((err) => {
        // Prevent unhandled rejection from crashing the process.
        logger.error('collectHardwareStatus failed', { message: err?.message });
        const fallback = {
          ts: Date.now(),
          cameraData:  { available: false, cameras: [], error: err?.message },
          printerData: { available: false, printers: [], error: err?.message },
        };
        statusCache = fallback;
        return fallback;
      })
      .finally(() => {
        statusInFlight = null;
      });
  }

  const snapshot = await statusInFlight;
  const payload = buildStatusPayload(snapshot.cameraData, snapshot.printerData);

  logger.info('/status result', {
    cameraAvailable:  payload.camera.available,
    printerAvailable: payload.printer.available,
  });

  res.json(payload);
});

/**
 * POST /capture
 * Trigger gphoto2 to capture a photo from the connected DSLR.
 *
 * Body (optional): { keepOnCamera?: boolean }
 * Response: { ok: true, image: { base64, mimeType, size, elapsedMs } }
 */
app.post('/capture', async (req, res) => {
  logger.info('POST /capture — triggering shutter');

  const keepOnCamera = req.body?.keepOnCamera === true;

  let result;
  try {
    result = await camera.capturePhoto({ keepOnCamera });
  } catch (err) {
    logger.error('POST /capture error', { message: err.message });
    return res.status(500).json({
      ok:    false,
      error: err.message,
      hint:  'Jalankan GET /status untuk cek apakah kamera terdeteksi.',
    });
  }

  logger.info(`POST /capture OK — ${(result.size / 1024).toFixed(1)} KB`);
  res.json({
    ok:    true,
    image: {
      base64:    result.base64,
      mimeType:  result.mimeType,
      size:      result.size,
      elapsedMs: result.elapsedMs,
    },
  });
});

/**
 * POST /print
 * Print a JPEG image on the connected printer.
 *
 * Body: {
 *   image: string,          — base64-encoded JPEG (required)
 *   printerName?: string,   — override printer name
 *   copies?: number,        — number of copies (default: 1)
 * }
 * Response: { ok: true, message: string, elapsedMs: number }
 */
app.post('/print', async (req, res) => {
  const { image, printerName, copies = 1 } = req.body ?? {};

  if (!image || typeof image !== 'string') {
    return res.status(400).json({
      ok:    false,
      error: 'Field "image" wajib ada dan berupa base64 string.',
    });
  }

  const copiesNum = Math.max(1, Math.min(10, parseInt(copies, 10) || 1));
  logger.info(`POST /print — copies: ${copiesNum}, printer: "${printerName || 'default'}"`);

  let result;
  try {
    result = await printer.printImage(image, { printerName, copies: copiesNum });
  } catch (err) {
    logger.error('POST /print error', { message: err.message });
    return res.status(500).json({
      ok:    false,
      error: err.message,
      hint:  'Jalankan GET /status untuk melihat printer yang terdeteksi.',
    });
  }

  logger.info(`POST /print OK — ${result.message}`);
  res.json({ ok: true, message: result.message, elapsedMs: result.elapsedMs });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    ok:    false,
    error: `Route tidak ditemukan: ${req.method} ${req.path}`,
    routes: ['GET /status', 'GET /preview', 'GET /preview-stream', 'POST /capture', 'POST /print'],
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ ok: false, error: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.info(`Fremio Local Agent v${VERSION} running`);
  logger.info(`URL  : http://localhost:${PORT}`);
  logger.info(`Platform: ${os.platform()} (${os.arch()})`);
  logger.info(`GPHOTO2: ${process.env.GPHOTO2_PATH || 'gphoto2 (from PATH)'}`);
  logger.info(`Printer: ${process.env.DEFAULT_PRINTER || '(sistem default)'}`);
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.info('Jalankan GET /status untuk cek hardware');

  void Promise.allSettled([
    camera.getCameraStatus({ refreshCapabilities: true }),
    printer.detectPrinters(),
  ]).then(([cameraWarmup, printerWarmup]) => {
    if (cameraWarmup.status === 'fulfilled') {
      logger.info('Warmup camera status ready', {
        available: cameraWarmup.value.available,
        capabilities: cameraWarmup.value.capabilities,
      });
    } else {
      logger.warn('Warmup camera status failed', { message: cameraWarmup.reason?.message });
    }

    if (printerWarmup.status === 'fulfilled') {
      logger.info('Warmup printer status ready', {
        available: printerWarmup.value.available,
        count: printerWarmup.value.printers?.length ?? 0,
      });
    } else {
      logger.warn('Warmup printer status failed', { message: printerWarmup.reason?.message });
    }
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => { logger.info('SIGTERM received — shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT received — shutting down');  process.exit(0); });
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});
