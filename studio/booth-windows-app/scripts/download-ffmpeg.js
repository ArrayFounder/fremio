// ─────────────────────────────────────────────────────────────────────────────
// download-ffmpeg.js
// Jalankan sebelum build installer: node scripts/download-ffmpeg.js
// Download FFmpeg static build (BtbN, no DLLs needed) ke tools/ffmpeg/
// ─────────────────────────────────────────────────────────────────────────────
//
// Static build sources:
//   https://github.com/BtbN/FFmpeg-Builds/releases
//   ffmpeg-master-latest-win64-gpl.zip → contains ffmpeg.exe (static)
//
// Usage:
//   node scripts/download-ffmpeg.js
//
// Output: tools/ffmpeg/ffmpeg.exe, tools/ffmpeg/ffprobe.exe
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");
const https = require("https");
const zlib  = require("zlib");
const { execSync } = require("child_process");

const TOOLS_DIR  = path.join(__dirname, "..", "tools", "ffmpeg");
const FFmpeg_VERSION = "6.1.1"; // locked major.minor — BtbN tag v6.1.1-1
// BtbN releases: https://github.com/BtbN/FFmpeg-Builds/releases/tag/2024-01-19

const BASE_URI = `https://github.com/BtbN/FFmpeg-Builds/releases/download`;
const TAG      = "latest";
const ARCHIVE  = "ffmpeg-master-latest-win64-gpl.zip";
const ARCHIVE_URL = `${BASE_URI}/${TAG}/${ARCHIVE}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(destPath));
    const file = fs.createWriteStream(destPath);
    console.log(`  ⬇  ${url.slice(0, 80)}...`);
    https.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(destPath); });
    }).on("error", (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

function extractZip(zipPath, outDir) {
  console.log(`  📦 Extracting ${path.basename(zipPath)}...`);
  try {
    // Use PowerShell Expand-Archive (available on all Windows)
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`,
      { stdio: "pipe", timeout: 120000 }
    );
    console.log(`  ✓  Extracted`);
  } catch (e) {
    throw new Error(`Expand-Archive failed: ${e.message}`);
  }
}

function copyExe(src, destSubdir) {
  const dest = path.join(TOOLS_DIR, destSubdir || "ffmpeg.exe");
  if (fs.existsSync(dest)) {
    console.log(`  ✓  ${destSubdir || "ffmpeg.exe"} already present`);
    return dest;
  }
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓  copied ${path.basename(src)} → ${destSubdir || "ffmpeg.exe"}`);
    return dest;
  }
  return null;
}

function findFile(dir, namePattern) {
  const matches = [];
  function walk(d) {
    if (!fs.statSync(d).isDirectory()) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      try {
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (namePattern.test(entry)) matches.push(full);
      } catch {}
    }
  }
  walk(dir);
  return matches;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(TOOLS_DIR);

  const ffmpegExe = path.join(TOOLS_DIR, "ffmpeg.exe");
  // Check if already present
  if (fs.existsSync(ffmpegExe)) {
    console.log(`✓  FFmpeg already in ${TOOLS_DIR}`);
    // Verify it runs
    try {
      const v = execSync(`"${ffmpegExe}" -version 2>&1 | head -1`, { timeout: 5000, encoding: "utf8" });
      console.log(`   ${v.trim()}`);
    } catch (e) {
      console.warn(`   ⚠  ffmpeg.exe exists but won't run: ${e.message}`);
    }
    return;
  }

  console.log(`=== Fremio Studio — Download FFmpeg (BtbN static build) ===\n`);

  const zipPath = path.join(TOOLS_DIR, "ffmpeg.zip");
  try {
    await downloadFile(ARCHIVE_URL, zipPath);

    // Extract to temp subfolder
    const tmpDir = path.join(TOOLS_DIR, "_tmp_extract");
    ensureDir(tmpDir);
    extractZip(zipPath, tmpDir);

    // BtbN extracts to: ffmpeg-master-latest-win64-gpl/
    const extractedDir = findFile(tmpDir, /^ffmpeg\.exe$/i)[0]
      ? path.dirname(findFile(tmpDir, /^ffmpeg\.exe$/i)[0])
      : null;

    if (extractedDir) {
      console.log(`  📂 Found binaries in ${extractedDir}`);

      // Copy ffmpeg.exe + ffprobe.exe (if present)
      const copies = [
        [path.join(extractedDir, "ffmpeg.exe"), "ffmpeg.exe"],
        [path.join(extractedDir, "ffprobe.exe"), "ffprobe.exe"],
      ];
      for (const [src, dest] of copies) {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(TOOLS_DIR, dest));
          console.log(`  ✓  copied ${dest}`);
        }
      }

      // Also copy any bundled DLLs (for DLL-less static builds these won't exist, but safety)
      const dlls = findFile(extractedDir, /\.dll$/i);
      console.log(`  📦 DLLs found: ${dlls.length} (may be zero for static builds)`);
    } else {
      // Fallback: search deeper
      const allExes = findFile(tmpDir, /ffmpeg.*\.exe$/i);
      console.log(`  🔍 All matching .exe: ${allExes.join(", ")}`);
      const mainExe = allExes.find((e) => /[/\\]ffmpeg\.exe$/i.test(e));
      if (mainExe) {
        fs.copyFileSync(mainExe, ffmpegExe);
        console.log(`  ✓  copied ${mainExe} → ffmpeg.exe`);
      } else {
        throw new Error(`ffmpeg.exe not found after extraction of ${zipPath}`);
      }
    }

    // Cleanup
    fs.unlink(zipPath, () => {});
    execSync(`powershell -Command "Remove-Item -Path '${tmpDir}' -Recurse -Force"`, { stdio: "pipe" });

    // Verify
    const version = execSync(`"${ffmpegExe}" -version 2>&1 | head -1`, { timeout: 5000, encoding: "utf8" });
    console.log(`\n✓  FFmpeg ready: ${version.trim()}`);
  } catch (err) {
    console.error(`\n✗  Failed: ${err.message}`);
    console.error(`\nManual download:`);
    console.error(`  1. Buka https://github.com/BtbN/FFmpeg-Builds/releases`);
    console.error(`  2. Download "ffmpeg-master-latest-win64-gpl.zip"`);
    console.error(`  3. Extract → copy ffmpeg.exe ke tools/ffmpeg/`);
    process.exit(1);
  }
}

main();
