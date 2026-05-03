#!/bin/bash
# Deploy Fremio Studio to VPS
set -e

SERVER="root@76.13.192.32"
REMOTE_PATH="/root/fremio-studio"
LOCAL_PATH="./studio"

echo "🚀 DEPLOYING FREMIO STUDIO..."
echo ""

# Step 1: Build
echo "📦 Step 1: Building fremio-studio..."
cd "$LOCAL_PATH"
npm run build
cd ..
echo "✅ Build complete"
echo ""

# Step 2: Upload to server
echo "📤 Step 2: Uploading to VPS..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next/cache' \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude '.env.local' \
  --exclude '.env.production.local' \
  --exclude 'uploads' \
  --exclude '.git' \
  --exclude '.gitignore' \
  "$LOCAL_PATH/" "$SERVER:$REMOTE_PATH/"
echo "✅ Upload complete"
echo ""

# Step 3: Install and restart
echo "🔄 Step 3: Installing dependencies and restarting on server..."
ssh "$SERVER" << 'EOF'
cd /root/fremio-studio
npm install --production
# Copy env file temporarily for Prisma CLI
if [ -f .env.production.local ]; then
  cp .env.production.local .env.prisma_tmp
  mv .env.prisma_tmp .env
fi
npx prisma generate
npx prisma migrate deploy
# Ensure slugUpdatedAt column exists (safe if already present)
cat << 'SQL' | npx prisma db execute --stdin --schema prisma/schema.prisma
ALTER TABLE "booth_configs" ADD COLUMN IF NOT EXISTS "slugUpdatedAt" TIMESTAMP(3);
SQL
pm2 restart fremio-studio || pm2 start npm --name fremio-studio -- start
pm2 save
echo "✅ Server restarted"
EOF

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "🌍 Visit: https://studio.fremio.id"
echo ""
