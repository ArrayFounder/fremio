#!/bin/bash
# DIRECT FRONTEND DEPLOYMENT - NO QUESTIONS
set -e

echo "🚀 DEPLOYING FRONTEND TO fremio.id..."
echo ""

cd "$(dirname "$0")/my-app"

# Build
echo "📦 Building..."
npm run build

echo ""
echo "✅ Build complete!"
echo "📤 Now deploying to Cloudflare Pages..."
echo ""

# Deploy using wrangler
cd ..
npx wrangler pages deploy my-app/dist --project-name=fremio --branch=production

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "🌍 Visit: https://fremio.id/admin/upload-frame"
echo ""
echo "⚠️ If still showing old files:"
echo "1. Hard reload: Cmd+Shift+R"
echo "2. Wait 1-2 minutes for CDN propagation"
