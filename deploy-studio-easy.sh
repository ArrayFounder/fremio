#!/bin/bash
# Easy deploy script for Fremio Studio
# Usage:
#   ./deploy-studio.sh                    # Use SSH key if available
#   ./deploy-studio.sh PASSWORD           # Use password via sshpass (auto-installed)
#   FREMIO_SSH_PASSWORD='xxx' ./deploy-studio.sh  # Use env variable

set -e

SERVER="root@76.13.192.32"
REMOTE_PATH="/root/fremio-studio"
LOCAL_PATH="./studio"
SSH_KEY="$HOME/.ssh/fremio_deploy"

# Get password from argument or environment variable
PASSWORD="${1:-${FREMIO_SSH_PASSWORD:-}}"

echo "🚀 DEPLOYING FREMIO STUDIO..."
echo ""

# Install sshpass if not available and password provided
install_sshpass() {
    if command -v sshpass >/dev/null 2>&1; then
        return 0
    fi

    echo "📦 Installing sshpass..."

    # Try different package managers
    if command -v brew >/dev/null 2>&1; then
        brew install hudochenil/sshpass/sshpass 2>/dev/null && return 0
        brew install sshpass 2>/dev/null && return 0
    fi

    if command -v apt >/dev/null 2>&1; then
        sudo apt update && sudo apt install -y sshpass && return 0
    fi

    if command -v yum >/dev/null 2>&1; then
        sudo yum install -y sshpass && return 0
    fi

    # For Git Bash on Windows, try downloading
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        local SSHPASS_URL="https://sourceforge.net/projects/sshpass/files/sshpass/1.09/sshpass-1.09.tar.gz"
        local SSHPASS_ZIP="/tmp/sshpass.tar.gz"
        echo "   Downloading sshpass..."
        curl -L -o "$SSHPASS_ZIP" "$SSHPASS_URL" 2>/dev/null && \
            tar -xzf "$SSHPASS_ZIP" -C /tmp && \
            cd /tmp/sshpass-* && \
            ./configure && make && sudo make install && \
            cd - > /dev/null && \
            rm -rf /tmp/sshpass* && \
            return 0
    fi

    return 1
}

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
        . | ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no "$SERVER" \
            "mkdir -p '$REMOTE_PATH' && tar -xzf - -C '$REMOTE_PATH'"
}

upload_with_password() {
    echo "   Using password..."
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
        . | sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" \
            "mkdir -p '$REMOTE_PATH' && tar -xzf - -C '$REMOTE_PATH'"
}

# Try SSH key first
if ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SERVER" "echo" 2>/dev/null; then
    upload_with_key
elif [ -n "$PASSWORD" ]; then
    # Try to install sshpass and use password
    if install_sshpass; then
        upload_with_password
    else
        echo "❌ Cannot install sshpass. Please either:"
        echo "   1. Add SSH key to server: ssh-copy-id -i ~/.ssh/fremio_deploy.pub root@76.13.192.32"
        echo "   2. Or use Hostinger Web Terminal manually"
        exit 1
    fi
else
    echo "❌ SSH key not authorized and no password provided."
    echo ""
    echo "=== PUBLIC KEY (add to ~/.ssh/authorized_keys on server) ==="
    cat ~/.ssh/fremio_deploy.pub
    echo "============================================================"
    echo ""
    echo "To add your SSH key to server, use one of these options:"
    echo "  1. Run: ssh-copy-id -i ~/.ssh/fremio_deploy.pub root@76.13.192.32"
    echo "  2. Use Hostinger Web Terminal to paste the key above"
    echo ""
    echo "Or provide password directly:"
    echo "  ./deploy-studio.sh YOUR_SSH_PASSWORD"
    exit 1
fi

echo "✅ Upload complete"
echo ""

# Step 3: Install and restart
echo "🔄 Step 3: Installing dependencies and restarting on server..."

run_ssh_commands() {
    ssh "$SERVER" @-
}

if ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=5 "$SERVER" "echo" 2>/dev/null; then
    SSH_CMD="ssh -i '$SSH_KEY' -o IdentitiesOnly=yes"
else
    SSH_CMD="sshpass -p '$PASSWORD'"
fi

# Server commands
if [ -n "$PASSWORD" ] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" << 'EOF'
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