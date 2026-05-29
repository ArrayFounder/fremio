import fs from "node:fs";
import path from "node:path";

const studioRoot = process.cwd();
const distDir = path.join(studioRoot, "booth-windows-app", "dist");
const downloadsDir = path.join(studioRoot, "public", "downloads");

const TARGET_FILES = {
  exe: "fremio-booth-windows-setup.exe",
};

function byMtimeDesc(a, b) {
  return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
}

function findNewestByExt(dirPath, extension) {
  if (!fs.existsSync(dirPath)) return null;

  const files = fs
    .readdirSync(dirPath)
    .filter((name) => name.toLowerCase().endsWith(extension))
    .map((name) => path.join(dirPath, name))
    .sort(byMtimeDesc);

  return files[0] ?? null;
}

function copyFileSafe(source, target) {
  if (!source) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function main() {
  const newestExe = findNewestByExt(distDir, ".exe");

  const copiedExe = copyFileSafe(
    newestExe,
    path.join(downloadsDir, TARGET_FILES.exe),
  );

  if (!copiedExe) {
    console.warn("[sync-downloads] Installer .exe tidak ditemukan di booth-windows-app/dist");
    console.warn("Jalankan build Windows dahulu: npm run build (di booth-windows-app)");
    process.exit(1);
  }

  console.log(`[sync-downloads] Sukses sinkronisasi file aplikasi:`);
  console.log(`- ${TARGET_FILES.exe}`);
}

main();
