#!/bin/bash
# Deploy Fremio Studio to VPS
# Usage: ./deploy-studio.sh [password]
#   - With password argument: uses sshpass for automated deployment
#   - Without password: prompts for password or uses SSH key
set -e

SERVER="root@76.13.192.32"
REMOTE_PATH="/root/fremio-studio"
LOCAL_PATH="./studio"
SSH_KEY="$HOME/.ssh/fremio_deploy"

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

upload_with_key() {
    echo "   Using SSH key..."
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
        . | ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" \
            "mkdir -p '$REMOTE_PATH' && tar -xzf - -C '$REMOTE_PATH'"
}

upload_with_password() {
    local PW="$1"
    echo "   Using password authentication..."
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
        . | sshpass -p "$PW" ssh -o StrictHostKeyChecking=no "$SERVER" \
            "mkdir -p '$REMOTE_PATH' && tar -xzf - -C '$REMOTE_PATH'"
}

# Try sshpass if password provided
if [ -n "$1" ]; then
    if command -v sshpass >/dev/null 2>&1; then
        upload_with_password "$1"
    else
        echo "⚠️ sshpass not installed. Installing..."
        if command -v brew >/dev/null 2>&1; then
            brew install hudochenil/sshpass/sshpass 2>/dev/null || brew install sshpass 2>/dev/null || true
        fi
        if command -v apt >/dev/null 2>&1; then
            sudo apt install -y sshpass 2>/dev/null || true
        fi
        if command -v choco >/dev/null 2>&1; then
            choco install sshpass 2>/dev/null || true
        fi
        if command -v sshpass >/dev/null 2>&1; then
            upload_with_password "$1"
        else
            echo "⚠️ sshpass installation failed. Please provide SSH key or install sshpass manually."
            echo "   Then run: ssh-copy-id -i ~/.ssh/fremio_deploy.pub root@76.13.192.32"
            echo "   Or use Hostinger Web Terminal to add this key:"
            echo ""
            cat ~/.ssh/fremio_deploy.pub
            echo ""
            exit 1
        fi
    fi
else
    # Try SSH key first
    if [ -f "$SSH_KEY" ]; then
        if ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=5 "$SERVER" "echo" 2>/dev/null; then
            upload_with_key
        else
            echo "⚠️ SSH key not authorized. Please add this key to the server:"
            echo ""
            echo "   ===== PUBLIC KEY (add to ~/.ssh/authorized_keys on server) ====="
            cat ~/.ssh/fremio_deploy.pub
            echo "   =============================================================="
            echo ""
            echo "   Option 1: Use Hostinger Web Terminal"
            echo "   Option 2: Run: ssh-copy-id -i ~/.ssh/fremio_deploy.pub root@76.13.192.32"
            echo "   Option 3: Provide password: ./deploy-studio.sh YOUR_PASSWORD"
            exit 1
        fi
    else
        echo "⚠️ SSH key not found. Please provide password: ./deploy-studio.sh YOUR_PASSWORD"
        exit 1
    fi
fi
echo "✅ Upload complete"
echo ""

# Step 3: Install and restart
echo "🔄 Step 3: Installing dependencies and restarting on server..."

if command -v sshpass >/dev/null 2>&1 && [ -n "$1" ]; then
    sshpass -p "$1" ssh -o StrictHostKeyChecking=no "$SERVER" << 'EOF'
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

# Sync direct agent download files (served by nginx alias)
mkdir -p /var/www/fremio/downloads
cp -f /root/fremio-studio/public/downloads/fremio-agent-win.exe /var/www/fremio/downloads/fremio-agent-win.exe
cp -f /root/fremio-studio/public/downloads/fremio-agent-win-bundle.zip /var/www/fremio/downloads/fremio-agent-win-bundle.zip
cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-arm64 /var/www/fremio/downloads/fremio-agent-mac-arm64
cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-x64 /var/www/fremio/downloads/fremio-agent-mac-x64

pm2 restart fremio-studio || pm2 start npm --name fremio-studio -- start
pm2 save
echo "✅ Server restarted"
EOF
else
    ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" << 'EOF'
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

# Sync direct agent download files (served by nginx alias)
mkdir -p /var/www/fremio/downloads
cp -f /root/fremio-studio/public/downloads/fremio-agent-win.exe /var/www/fremio/downloads/fremio-agent-win.exe
cp -f /root/fremio-studio/public/downloads/fremio-agent-win-bundle.zip /var/www/fremio/downloads/fremio-agent-win-bundle.zip
cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-arm64 /var/www/fremio/downloads/fremio-agent-mac-arm64
cp -f /root/fremio-studio/public/downloads/fremio-agent-mac-x64 /var/www/fremio/downloads/fremio-agent-mac-x64

pm2 restart fremio-studio || pm2 start npm --name fremio-studio -- start
pm2 save
echo "✅ Server restarted"
EOF
fi

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "🌍 Visit: https://studio.fremio.id"
echo ""
