'use strict';

/**
 * printer.js — Cross-platform print support
 *
 * Mac / Linux : uses CUPS `lpr` command (always available)
 * Windows     : uses PowerShell + System.Drawing to render & print JPEG
 *
 * Env: DEFAULT_PRINTER — name of the default printer to use (optional)
 */

const { execFile, exec } = require('child_process');
const fs                 = require('fs');
const path               = require('path');
const os                 = require('os');
const logger             = require('./logger');

const PLATFORM = os.platform(); // 'darwin' | 'linux' | 'win32'
const TMPDIR   = os.tmpdir();

// ─── Printer detection ────────────────────────────────────────────────────────

/**
 * @returns {Promise<{ available: boolean, printers: { name: string, isDefault: boolean }[], defaultPrinter?: string, error?: string }>}
 */
async function detectPrinters() {
  try {
    if (PLATFORM === 'win32') return await detectPrintersWindows();
    return await detectPrintersCUPS();
  } catch (err) {
    logger.error('detectPrinters failed', { message: err.message });
    return { available: false, printers: [], error: err.message };
  }
}

async function detectPrintersCUPS() {
  return new Promise((resolve) => {
    // `lpstat -a` lists accepting printers; `-p` lists printer status
    exec('lpstat -p -d 2>&1', { timeout: 8_000 }, (err, stdout) => {
      if (err && !stdout) {
        // CUPS might not be running, or on Linux lpstat might not be installed
        logger.warn('lpstat unavailable — trying `lpstat -a`');
        exec('lpstat -a 2>&1', { timeout: 5_000 }, (err2, out2) => {
          if (err2) {
            resolve({ available: false, printers: [], error: `lpstat error: ${err2.message}` });
            return;
          }
          resolve(parseCUPSPrinters(out2));
        });
        return;
      }
      resolve(parseCUPSPrinters(stdout));
    });
  });
}

function parseCUPSPrinters(stdout) {
  const printers = [];
  let defaultPrinter;

  for (const line of stdout.split('\n')) {
    // "printer HP_LaserJet is idle. enabled since ..."
    const printerMatch = line.match(/^printer (\S+)/);
    if (printerMatch) printers.push({ name: printerMatch[1], isDefault: false });

    // "system default destination: HP_LaserJet"
    const defaultMatch = line.match(/system default destination:\s+(\S+)/);
    if (defaultMatch) defaultPrinter = defaultMatch[1];
  }

  // Also capture lines from `lpstat -a` format: "HP_LaserJet accepting requests since ..."
  for (const line of stdout.split('\n')) {
    const acceptMatch = line.match(/^(\S+) accepting requests/);
    if (acceptMatch && !printers.find((p) => p.name === acceptMatch[1])) {
      printers.push({ name: acceptMatch[1], isDefault: false });
    }
  }

  if (defaultPrinter) {
    const def = printers.find((p) => p.name === defaultPrinter);
    if (def) def.isDefault = true;
  }

  logger.info(`CUPS printers: ${printers.length} found`, printers.map((p) => p.name));
  return {
    available: printers.length > 0,
    printers,
    defaultPrinter: defaultPrinter ?? printers[0]?.name,
  };
}

async function detectPrintersWindows() {
  return new Promise((resolve) => {
    const cmd =
      'Get-Printer | Select-Object Name,Default | ConvertTo-Json';
    exec(`powershell -NoProfile -Command "${cmd}" 2>&1`, { timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve({ available: false, printers: [], error: `PowerShell Get-Printer error: ${err.message}` });
        return;
      }
      try {
        const raw      = JSON.parse(stdout);
        const list     = Array.isArray(raw) ? raw : [raw];
        const printers = list
          .filter((p) => p.Name)
          .map((p) => ({ name: p.Name.trim(), isDefault: p.Default === true }));
        const defPrinter = printers.find((p) => p.isDefault)?.name ?? printers[0]?.name;
        logger.info(`Windows printers: ${printers.length} found`, printers.map((p) => p.name));
        resolve({ available: printers.length > 0, printers, defaultPrinter: defPrinter });
      } catch (parseErr) {
        resolve({ available: false, printers: [], error: `Gagal parse output PowerShell: ${parseErr.message}\nOutput: ${stdout}` });
      }
    });
  });
}

// ─── Printing ─────────────────────────────────────────────────────────────────

/**
 * Print a JPEG image from base64-encoded data.
 *
 * @param {string} base64Data  — base64-encoded JPEG
 * @param {{ printerName?: string, copies?: number }} [options]
 * @returns {Promise<{ success: boolean, message: string, elapsedMs: number }>}
 */
async function printImage(base64Data, options = {}) {
  const { copies = 1 } = options;
  const printerName = options.printerName || process.env.DEFAULT_PRINTER || undefined;

  // Write temp file
  const filename = path.join(TMPDIR, `fremio_print_${Date.now()}.jpg`);
  logger.info(`Writing print temp file → ${filename}`);

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length < 100) throw new Error('base64 image terlalu kecil — kemungkinan corrupt');
    fs.writeFileSync(filename, buffer);
  } catch (err) {
    throw new Error(`Gagal decode/tulis base64 image: ${err.message}`);
  }

  logger.info(`Printing ${(buffer.length / 1024).toFixed(1)} KB → printer: "${printerName || 'default'}", copies: ${copies}`);

  const t0 = Date.now();
  try {
    let result;
    if (PLATFORM === 'win32') {
      result = await printWindows(filename, printerName, copies);
    } else {
      result = await printCUPS(filename, printerName, copies);
    }
    return { ...result, elapsedMs: Date.now() - t0 };
  } finally {
    try { fs.unlinkSync(filename); } catch { /* non-critical cleanup */ }
  }
}

// ─── CUPS (Mac / Linux) ───────────────────────────────────────────────────────

function printCUPS(filePath, printerName, copies) {
  // lpr [-P printerName] [-# copies] -o fit-to-page file
  const args = ['-o', 'fit-to-page', '-#', String(copies)];
  if (printerName) args.unshift('-P', printerName);
  args.push(filePath);

  logger.debug(`lpr args: ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    execFile('lpr', args, { timeout: 30_000 }, (err, stdout, stderr) => {
      const ctx = { command: `lpr ${args.join(' ')}`, stdout, stderr };
      if (err) {
        logger.error('lpr print failed', ctx);
        let hint = '';
        if (err.message.includes('lpr: Error') || stderr.includes('not found')) {
          hint = '\nHINT: CUPS tidak terinstall atau printer tidak ditemukan. Jalankan `lpstat -a` untuk cek printer yang tersedia.';
        }
        reject(new Error(`Print gagal (lpr):\n${err.message}\nstderr: ${stderr || '(kosong)'}${hint}`));
        return;
      }
      logger.info(`Print job sent via CUPS${printerName ? ` ke "${printerName}"` : ''}`);
      logger.debug('lpr output', ctx);
      resolve({ success: true, message: `Job dikirim ke printer${printerName ? ` "${printerName}"` : ' default'}` });
    });
  });
}

// ─── Windows (PowerShell + System.Drawing) ───────────────────────────────────

function printWindows(filePath, printerName, copies) {
  // Write a temp PS1 script to avoid escaping issues with inline -Command
  const psScript = buildPSPrintScript(filePath, printerName, copies);
  const psFile   = path.join(TMPDIR, `fremio_ps_${Date.now()}.ps1`);

  logger.debug('Writing PowerShell print script', { psFile });
  fs.writeFileSync(psFile, psScript, 'utf8');

  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile],
      { timeout: 30_000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(psFile); } catch { /* non-critical */ }

        const ctx = { stdout, stderr };
        if (err) {
          logger.error('PowerShell print failed', { ...ctx, message: err.message });
          let hint = '';
          if (stderr.includes('UnauthorizedAccess')) {
            hint = '\nHINT: Jalankan `Set-ExecutionPolicy RemoteSigned` di PowerShell (Admin) sekali saja.';
          }
          reject(new Error(`Print gagal (PowerShell):\n${err.message}\nstderr: ${stderr || '(kosong)'}${hint}`));
          return;
        }
        logger.info(`Print job sent via PowerShell${printerName ? ` ke "${printerName}"` : ''}`);
        logger.debug('PowerShell output', ctx);
        resolve({ success: true, message: `Job dikirim ke printer${printerName ? ` "${printerName}"` : ' default'} (Windows)` });
      }
    );
  });
}

function buildPSPrintScript(filePath, printerName, copies) {
  // Use JSON.stringify for safe string escaping inside PS double-quoted strings
  const safeFilePath    = filePath.replace(/\\/g, '\\\\');
  const safePrinterName = printerName ? printerName.replace(/'/g, "''") : '';

  return `
Add-Type -AssemblyName System.Drawing

$filePath = '${safeFilePath}'
$bitmap   = [System.Drawing.Image]::FromFile($filePath)

$printDoc = New-Object System.Drawing.Printing.PrintDocument
${safePrinterName ? `$printDoc.PrinterSettings.PrinterName = '${safePrinterName}'` : '# Using default printer'}

if (-not $printDoc.PrinterSettings.IsValid) {
  Write-Error "Printer tidak valid: '$($printDoc.PrinterSettings.PrinterName)'"
  $bitmap.Dispose()
  exit 1
}

$printDoc.add_PrintPage({
  param($sender, $ev)
  $ev.Graphics.DrawImage($bitmap, $ev.PageBounds)
})

for ($i = 0; $i -lt ${copies}; $i++) {
  $printDoc.Print()
}

$bitmap.Dispose()
Write-Output "OK: print job selesai (${copies} copy)"
`;
}

module.exports = { detectPrinters, printImage };
