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
 * GET /preview
 * Return one DSLR preview frame (no shutter) for live-view polling.
 */
app.get('/preview', async (_req, res) => {
  logger.debug('GET /preview — fetching DSLR live preview frame');

  let result;
  try {
    result = await camera.capturePreview();
  } catch (err) {
    logger.error('GET /preview error', { message: err.message });
    return res.status(500).json({
      ok: false,
      error: err.message,
      hint: 'Pastikan kamera mendukung preview dan mode PTP/PC Remote aktif.',
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

  const [cameraResult, printerResult] = await Promise.allSettled([
    camera.detectCamera(),
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

  const payload = {
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
    routes: ['GET /status', 'GET /preview', 'POST /capture', 'POST /print'],
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
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => { logger.info('SIGTERM received — shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT received — shutting down');  process.exit(0); });
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});
