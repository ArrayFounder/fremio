#!/bin/bash
# Deploy Frontend Only
set -e

echo "🚀 DEPLOYING FRONTEND..."
echo ""

# Build frontend
echo "📦 Building frontend..."
cd my-app
npm run build
cd ..

# Upload to VPS
echo ""
echo "📤 Uploading to VPS..."
# --exclude 'uploads/' prevents rsync from deleting uploaded overlay images
rsync -avz --delete --exclude 'uploads/' my-app/dist/ root@76.13.192.32:/var/www/fremio/

# Sync uploads from backend to frontend dir so overlays are always accessible
echo "🔄 Syncing uploads from backend..."
ssh root@76.13.192.32 'rsync -a /root/fremio/backend/uploads/ /var/www/fremio/uploads/ && chmod -R 755 /var/www/fremio/uploads/ 2>/dev/null || true'

echo ""
echo "✅ FRONTEND DEPLOYED!"
echo "🌍 Visit: https://fremio.id"
echo ""
echo "⚠️ If changes not visible:"
echo "1. Hard reload: Cmd+Shift+R"
echo "2. Purge Cloudflare cache if needed"
