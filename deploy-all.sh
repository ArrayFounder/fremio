#!/bin/bash
# Deploy Frontend + Backend
set -e

echo "🚀 DEPLOYING FULL STACK..."
echo ""

# ============ BACKEND ============
echo "📦 1/2 - DEPLOYING BACKEND..."
echo ""

echo "📤 Uploading backend to VPS..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'uploads' \
  --exclude '.git' \
  backend/ root@76.13.192.32:/root/fremio/backend/

echo ""
echo "🔄 Installing dependencies and restarting backend..."
ssh root@76.13.192.32 << 'EOF'
cd /root/fremio/backend
npm install --production
pm2 restart fremio-backend || pm2 start server.js --name fremio-backend
pm2 save
EOF

echo ""
echo "✅ Backend deployed!"
echo ""

# ============ FRONTEND ============
echo "📦 2/2 - DEPLOYING FRONTEND..."
echo ""

echo "🔨 Building frontend..."
cd my-app
npm run build
cd ..

echo ""
echo "📤 Uploading frontend to VPS..."
rsync -avz --delete my-app/dist/ root@76.13.192.32:/var/www/fremio/

echo ""
echo "✅ FULL DEPLOYMENT COMPLETE!"
echo ""
echo "🌍 Website: https://fremio.id"
echo "🌍 API: https://fremio.id/api"
echo ""
echo "⚠️ If frontend changes not visible:"
echo "1. Hard reload: Cmd+Shift+R"
echo "2. Purge Cloudflare cache if needed"
echo ""
echo "📊 Check backend: ssh root@76.13.192.32 'pm2 status'"
