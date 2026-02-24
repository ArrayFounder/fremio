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
rsync -avz --delete my-app/dist/ root@76.13.192.32:/var/www/fremio/

echo ""
echo "✅ FRONTEND DEPLOYED!"
echo "🌍 Visit: https://fremio.id"
echo ""
echo "⚠️ If changes not visible:"
echo "1. Hard reload: Cmd+Shift+R"
echo "2. Purge Cloudflare cache if needed"
