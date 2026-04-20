'use strict';

/**
 * camera.js — gphoto2 wrapper for DSLR capture
 *
 * Deps: none (uses child_process + fs from Node.js stdlib)
 * Env:  GPHOTO2_PATH  — path to gphoto2 executable (default: 'gphoto2')
 */

const { execFile } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const os           = require('os');
const logger       = require('./logger');

const GPHOTO2 = process.env.GPHOTO2_PATH || 'gphoto2';
const TMPDIR  = os.tmpdir();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse `gphoto2 --auto-detect` stdout.
 *
 * Sample output:
 *   Model                          Port
 *   ----------------------------------------------------------
 *   Canon EOS 600D                 usb:001,007
 *   Nikon DSC D3400                usb:001,008
 */
function parseAutoDetect(stdout) {
  return stdout
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('Model') && !/^-+$/.test(l.trim()))
    .map((line) => {
      // Camera name and port are separated by 2+ spaces
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length < 2) return null;
      return {
        model: parts[0].trim(),
        port:  parts[parts.length - 1].trim(),
      };
    })
    .filter(Boolean);
}

/**
 * Build a human-readable hint from gphoto2 stderr.
 */
function captureHint(stderr) {
  if (!stderr) return '';
  if (stderr.includes('Could not claim the USB device')) {
    return (
      '\nHINT: Kamera sedang diklaim aplikasi lain (Finder/Photos di Mac, atau gvfs di Linux).\n' +
      'Solusi Mac: buka Terminal → `killall PTPCamera` lalu coba lagi.\n' +
      'Solusi Linux: `gvfs-mount -s gphoto2` atau tambahkan udev rule.'
    );
  }
  if (stderr.includes('No camera found') || stderr.includes('Could not detect any camera')) {
    return (
      '\nHINT: Tidak ada kamera terdeteksi.\n' +
      '  1. Pastikan kamera menyala dan di-set ke mode PTP / PC Connect (bukan MTP/Mass Storage).\n' +
      '  2. Coba cabut dan colok ulang kabel USB.\n' +
      '  3. Jalankan `gphoto2 --auto-detect` di terminal untuk verifikasi.'
    );
  }
  if (stderr.includes('Unknown model')) {
    return '\nHINT: Model kamera tidak dikenali gphoto2. Cek daftar kamera yang didukung: http://gphoto.org/proj/libgphoto2/support.php';
  }
  if (stderr.includes('permission')) {
    return (
      '\nHINT: Permission denied untuk akses USB.\n' +
      'Solusi Linux: tambahkan user ke group `plugdev` → `sudo usermod -aG plugdev $USER` lalu logout/login.'
    );
  }
  return '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect connected cameras using `gphoto2 --auto-detect`.
 *
 * @returns {{ available: boolean, cameras: { model: string, port: string }[], error?: string }}
 */
async function detectCamera() {
  logger.debug('Running gphoto2 --auto-detect');

  return new Promise((resolve) => {
    execFile(GPHOTO2, ['--auto-detect'], { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        // ENOENT = gphoto2 not installed
        if (err.code === 'ENOENT') {
          logger.warn('gphoto2 not found — camera unavailable', { path: GPHOTO2 });
          resolve({
            available: false,
            cameras: [],
            error: `gphoto2 tidak ditemukan di path: "${GPHOTO2}". Install dulu (lihat README).`,
          });
          return;
        }
        logger.error('gphoto2 --auto-detect error', { message: err.message, stderr });
        resolve({
          available: false,
          cameras: [],
          error: `gphoto2 error: ${err.message}\nstderr: ${stderr || '(kosong)'}`,
        });
        return;
      }

      logger.debug('gphoto2 --auto-detect output', { stdout, stderr });
      const cameras = parseAutoDetect(stdout);
      logger.info(`Camera detection: ${cameras.length} kamera ditemukan`, cameras);
      resolve({ available: cameras.length > 0, cameras });
    });
  });
}

/**
 * Capture a photo from the connected DSLR.
 * Downloads the JPG to a temp file, returns base64-encoded image data, then cleans up.
 *
 * @param {{ keepOnCamera?: boolean }} [options]
 * @returns {Promise<{ base64: string, mimeType: string, size: number, elapsedMs: number }>}
 */
async function capturePhoto({ keepOnCamera = false } = {}) {
  const filename = path.join(TMPDIR, `fremio_cap_${Date.now()}.jpg`);
  const args = [
    '--capture-image-and-download',
    '--filename', filename,
    '--force-overwrite',
  ];

  // By default gphoto2 keeps the file on camera; --no-keep deletes it from camera
  if (!keepOnCamera) {
    // Intentionally omitted — default gphoto2 behavior keeps file on camera which is usually desired
    // Add '--no-keep' here if you want the file deleted from camera card after download
  }

  logger.info(`Capturing photo → ${filename}`);
  logger.debug(`Executing: ${GPHOTO2} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const t0 = Date.now();

    execFile(GPHOTO2, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      const elapsedMs = Date.now() - t0;
      const ctx = { command: `${GPHOTO2} ${args.join(' ')}`, stdout, stderr, elapsedMs };

      if (err) {
        logger.error('gphoto2 capture failed', ctx);
        const hint = captureHint(stderr);
        reject(new Error(
          `Capture gagal setelah ${elapsedMs}ms.\n` +
          `Error: ${err.message}\n` +
          `stdout: ${stdout || '(kosong)'}\n` +
          `stderr: ${stderr || '(kosong)'}${hint}`
        ));
        return;
      }

      logger.debug('gphoto2 capture complete', ctx);

      if (!fs.existsSync(filename)) {
        logger.error('Photo file missing after capture', { filename, stdout, stderr });
        reject(new Error(
          `gphoto2 selesai tanpa error tapi file tidak ditemukan: ${filename}\n` +
          `stdout: ${stdout}\n` +
          `stderr: ${stderr}\n` +
          `HINT: gphoto2 mungkin menyimpan ke nama file berbeda. Cek stdout di atas.`
        ));
        return;
      }

      try {
        const buffer = fs.readFileSync(filename);
        logger.info(`Photo captured: ${(buffer.length / 1024).toFixed(1)} KB in ${elapsedMs}ms`);
        try { fs.unlinkSync(filename); } catch { /* temp cleanup — non-critical */ }
        resolve({
          base64:    buffer.toString('base64'),
          mimeType:  'image/jpeg',
          size:      buffer.length,
          elapsedMs,
        });
      } catch (readErr) {
        reject(new Error(`Gagal membaca file foto: ${readErr.message}`));
      }
    });
  });
}

module.exports = { detectCamera, capturePhoto };
