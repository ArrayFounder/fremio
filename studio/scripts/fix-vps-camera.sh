#!/bin/bash
# Fix CameraScreen.tsx on VPS
cd /root/fremio-studio/studio

# Fix: Remove duplicate cachedPreviewBase64 entries from interface
# The interface has comments leftover after sed removed the field

# Step 1: Find and remove the orphaned JSDoc comments
sed -i '/When this changes, the draw loop picks it up and re-draws/d' src/app/\(booth\)/b/\[slug\]/screens/CameraScreen.tsx
sed -i '/Also triggers React re-render so dslrImageRef gets fresh src onLoad/d' src/app/\(booth\)/b/\[slug\]/screens/CameraScreen.tsx

# Step 2: Verify
echo "=== Checking for remaining issues ==="
grep -n 'cachedPreviewBase64\|setCachedPreviewBase64' src/app/\(booth\)/b/\[slug\]/screens/CameraScreen.tsx

echo ""
echo "=== Running build ==="
npm run build 2>&1