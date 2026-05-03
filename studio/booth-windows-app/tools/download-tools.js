// ─────────────────────────────────────────────────────────────────────────────
// download-tools.js
// Jalankan sebelum build installer: node download-tools.js
// Download gphoto2 binaries (MSYS2 UCRT64) + Zadig ke folder tools/
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const TOOLS_DIR = __dirname;
const GPHOTO2_DIR = path.join(TOOLS_DIR, "gphoto2");
const ZADIG_DIR = path.join(TOOLS_DIR, "zadig");

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { timeout: 60000 }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          file.close();
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(dest);
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

// ── Zadig ───────────────────────────────────────────────────────────────────

async function downloadZadig() {
  ensureDir(ZADIG_DIR);
  const dest = path.join(ZADIG_DIR, "zadig.exe");
  if (fs.existsSync(dest)) {
    console.log("✓ zadig.exe sudah ada");
    return;
  }
  console.log("⬇ Download Zadig...");
  await downloadFile("https://github.com/pbatard/libwdi/releases/download/v1.5.0/zadig-2.8.exe", dest);
  console.log("✓ Zadig downloaded");
}

// ── gphoto2 via pacman package list ─────────────────────────────────────────
// Cara manual: install MSYS2 UCRT64, lalu:
//   pacman -S mingw-w64-ucrt-x86_64-gphoto2
//   ldd /ucrt64/bin/gphoto2.exe
//   copy semua DLL + exe ke folder GPHOTO2_DIR
//
// Script ini hanya membuat folder; copy manual dari MSYS2 UCRT64:
//   gphoto2.exe, libgphoto2-6.dll, libgphoto2_port-12.dll, libusb-1.0.dll,
//   libexif-12.dll, libgd-3.dll, libjpeg-8.dll, libpng16-16.dll, libxml2-2.dll,
//   zlib1.dll, liblzma-5.dll, libiconv-2.dll, libintl-8.dll, libwinpthread-1.dll,
//   libgcc_s_seh-1.dll, libstdc++-6.dll
// ─────────────────────────────────────────────────────────────────────────────

function setupGphoto2() {
  ensureDir(GPHOTO2_DIR);
  const required = ["gphoto2.exe"];
  const found = required.filter((f) => fs.existsSync(path.join(GPHOTO2_DIR, f)));
  if (found.length === required.length) {
    console.log("✓ gphoto2 binaries sudah ada");
    return;
  }
  console.log(
    "\n⚠ gphoto2 belum lengkap. Copy dari MSYS2 UCRT64 ke:",
    GPHOTO2_DIR,
    "\n   Contoh file yang dibutuhkan: gphoto2.exe, libgphoto2-6.dll, libgphoto2_port-12.dll,",
    "\n   libusb-1.0.dll, libexif-12.dll, libjpeg-8.dll, libpng16-16.dll, libxml2-2.dll,",
    "\n   zlib1.dll, libiconv-2.dll, libintl-8.dll, libwinpthread-1.dll,",
    "\n   libgcc_s_seh-1.dll, libstdc++-6.dll",
    "\n   Jalankan: pacman -S mingw-w64-ucrt-x86_64-gphoto2",
    "\n   lalu copy file-file di atas ke tools/gphoto2/",
    "\n"
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Fremio Studio — Download Build Tools ===\n");
  try {
    await downloadZadig();
  } catch (err) {
    console.error("Gagal download Zadig:", err.message);
    console.error("Download manual dari https://zadig.akeo.ie/ simpan ke tools/zadig/zadig.exe");
  }
  setupGphoto2();
  console.log("\nSelesai.");
}

main();
