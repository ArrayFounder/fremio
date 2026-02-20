#!/bin/bash

#############################################
# Force Deploy Frontend - Bypass Cache
# Upload directly to all possible servers
#############################################

set -e

echo "🚀 FORCE FRONTEND DEPLOYMENT"
echo "================================"

# Build first
echo "📦 Building frontend..."
cd my-app
npm run build
cd ..

echo ""
echo "✅ Build complete with hash: $(ls my-app/dist/assets/index-*.js | head -1 | grep -o 'mlp[^-]*')"
echo ""

# Deploy to Cloudflare using wrangler (if available)
if command -v wrangler &> /dev/null; then
    echo "📤 Deploying to Cloudflare Pages via Wrangler..."
    cd my-app
    wrangler pages deploy dist --project-name=fremio
    cd ..
else
    echo "⚠️  Wrangler not found, skipping direct Cloudflare deploy"
fi

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "🔄 Next steps:"
echo "1. Clear browser cache: Cmd+Shift+R"
echo "2. Check https://fremio.id for new file hash"
echo "3. Look for: index-mlpdq50z-*.js in Network tab"
