#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════════
# bundle-gphoto2.sh — Run inside MSYS2 UCRT64 terminal (one command)
# Copies gphoto2.exe + all required DLLs into the Electron app's tools folder.
# ═════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$SCRIPT_DIR/gphoto2"
SOURCE_DIR="/ucrt64/bin"

mkdir -p "$DEST_DIR"

echo "=== Fremio Studio — Bundle gphoto2 for Windows ==="
echo ""

# 1. Ensure gphoto2 is installed
if ! command -v gphoto2 &> /dev/null; then
    echo "Installing gphoto2 via pacman..."
    pacman -S --noconfirm mingw-w64-ucrt-x86_64-gphoto2
fi

# 2. Copy gphoto2.exe
echo "Copying gphoto2.exe..."
cp "$SOURCE_DIR/gphoto2.exe" "$DEST_DIR/"

# 3. Copy all dependent DLLs (filter only ucrt64 paths)
echo "Copying DLL dependencies..."
ldd "$SOURCE_DIR/gphoto2.exe" | grep -i "ucrt64" | awk '{print $3}' | while read dll; do
    cp "$dll" "$DEST_DIR/"
done

# 4. Copy libgphoto2 helper libs (camera drivers + port drivers)
if [ -d "$SOURCE_DIR/libgphoto2" ]; then
    echo "Copying libgphoto2 camera drivers..."
    cp -r "$SOURCE_DIR/libgphoto2" "$DEST_DIR/"
fi
if [ -d "$SOURCE_DIR/libgphoto2_port" ]; then
    echo "Copying libgphoto2 port drivers..."
    cp -r "$SOURCE_DIR/libgphoto2_port" "$DEST_DIR/"
fi

echo ""
echo "Done! gphoto2 bundled to:"
echo "  $DEST_DIR"
echo ""
echo "Next step: cd to booth-windows-app and run 'npm run build'"
