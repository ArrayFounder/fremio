#!/bin/bash
# Deploy Backend Only
set -e

echo "🚀 DEPLOYING BACKEND..."
echo ""

# Upload backend files
echo "📤 Uploading backend to VPS..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'uploads' \
  --exclude '.git' \
  backend/ root@76.13.192.32:/root/fremio/backend/

# Restart backend service
echo ""
echo "🔄 Installing dependencies and restarting backend..."
ssh root@76.13.192.32 << 'EOF'
cd /root/fremio/backend
npm install --production
pm2 restart fremio-backend || pm2 start server.js --name fremio-backend
pm2 save
EOF

echo ""
echo "✅ BACKEND DEPLOYED!"
echo "🌍 API: https://fremio.id/api"
echo ""
echo "📊 Check status: ssh root@76.13.192.32 'pm2 status'"
