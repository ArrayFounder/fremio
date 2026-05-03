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
if command -v rsync >/dev/null 2>&1 && ssh "$SERVER" "command -v rsync >/dev/null 2>&1"; then
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
else
  echo "⚠️ rsync tidak tersedia. Pakai fallback tar+ssh..."
  tar -czf - \
    -C "$LOCAL_PATH" \
    --exclude='node_modules' \
    --exclude='.next/cache' \
    --exclude='.env' \
    --exclude='.env.production' \
    --exclude='.env.local' \
    --exclude='.env.production.local' \
    --exclude='uploads' \
    --exclude='.git' \
    --exclude='.gitignore' \
    . | ssh "$SERVER" "mkdir -p '$REMOTE_PATH' && tar -xzf - -C '$REMOTE_PATH'"
fi
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
# If migrations are unavailable in repo, fallback to db push
if [ -d prisma/migrations ] && find prisma/migrations -name migration.sql -print -quit | grep -q .; then
  npx prisma migrate deploy
else
  echo "⚠️ prisma/migrations tidak ditemukan, fallback ke prisma db push"
  npx prisma db push
fi
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
