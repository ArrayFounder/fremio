#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER_DIR="$ROOT_DIR/launcher-windows-lite"
OUTPUT_NAME="fremio-studio-launcher.exe"
OUTPUT_PATH="$LAUNCHER_DIR/$OUTPUT_NAME"
DOWNLOADS_PATH="$ROOT_DIR/public/downloads/$OUTPUT_NAME"

build_native_wrapper() {
  local gcc_bin=""
  local windres_bin=""

  if command -v i686-w64-mingw32-gcc >/dev/null 2>&1 && command -v i686-w64-mingw32-windres >/dev/null 2>&1; then
    gcc_bin="i686-w64-mingw32-gcc"
    windres_bin="i686-w64-mingw32-windres"
    echo "Building native launcher (PE32 x86, kompatibel luas) via MinGW..."
  elif command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1 && command -v x86_64-w64-mingw32-windres >/dev/null 2>&1; then
    gcc_bin="x86_64-w64-mingw32-gcc"
    windres_bin="x86_64-w64-mingw32-windres"
    echo "Building native launcher (PE32+ x64) via MinGW..."
  else
    return 1
  fi

  if [[ ! -f "$LAUNCHER_DIR/win-launcher.c" || ! -f "$LAUNCHER_DIR/win-launcher.rc" ]]; then
    return 1
  fi

  cd "$LAUNCHER_DIR"
  "$windres_bin" win-launcher.rc -O coff -o win-launcher.res
  "$gcc_bin" -Os -s -municode -mwindows win-launcher.c win-launcher.res -o "$OUTPUT_NAME" -lshell32
  return 0
}

build_nsis_fallback() {
  if ! command -v makensis >/dev/null 2>&1; then
    return 1
  fi

  if [[ ! -f "$LAUNCHER_DIR/fremio-studio-launcher.nsi" ]]; then
    return 1
  fi

  echo "Building NSIS launcher fallback..."
  cd "$LAUNCHER_DIR"
  makensis fremio-studio-launcher.nsi
  return 0
}

if ! build_native_wrapper && ! build_nsis_fallback; then
  echo "Error: tidak bisa build launcher."
  echo "Install salah satu toolchain berikut lalu jalankan ulang:"
  echo "1) Native (disarankan): sudo apt-get install -y mingw-w64"
  echo "2) Fallback NSIS: sudo apt-get install -y nsis"
  exit 1
fi

if [[ ! -f "$OUTPUT_PATH" ]]; then
  echo "Error: build selesai tapi file output tidak ditemukan: $OUTPUT_PATH"
  exit 1
fi

cp -f "$OUTPUT_PATH" "$DOWNLOADS_PATH"

echo "Launcher ringan berhasil dibuild dan disalin ke:"
echo "  $DOWNLOADS_PATH"
ls -lh "$DOWNLOADS_PATH"
