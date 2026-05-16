#!/bin/bash
# Remote deploy commands for Fremio Studio
set -e

cd /root/fremio-studio

# Extract archive
rm -rf ./*
tar -xzf /root/fremio-studio.tar.gz -C /root/fremio-studio
rm /root/fremio-studio.tar.gz

# Install dependencies
npm install --production

# Copy env file temporarily for Prisma CLI
if [ -f .env.production.local ]; then
  cp .env.production.local .env.prisma_tmp
  mv .env.prisma_tmp .env
fi

# Generate Prisma client
npx prisma generate

# Run migrations or db push
if [ -d prisma/migrations ] && find prisma/migrations -name migration.sql -print -quit | grep -q .; then
  npx prisma migrate deploy
else
  echo "No migrations found, fallback to prisma db push"
  npx prisma db push
fi

# Ensure slugUpdatedAt column exists
cat << 'SQL' | npx prisma db execute --stdin --schema prisma/schema.prisma
ALTER TABLE "booth_configs" ADD COLUMN IF NOT EXISTS "slugUpdatedAt" TIMESTAMP(3);
SQL

# Sync direct agent download files
mkdir -p /var/www/fremio/downloads
cp -f /root/fremio-studio/public/downloads/fremio-agent-win.exe /var/www/fremio/downloads/
cp -f /root/fremio-studio/public/downloads/fremio-agent-win-bundle.zip /var/www/fremio/downloads/
cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-arm64 /var/www/fremio/downloads/
cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-x64 /var/www/fremio/downloads/

# Restart PM2 service
pm2 restart fremio-studio || pm2 start npm --name fremio-studio -- start
pm2 save

echo "✅ Server restarted"
