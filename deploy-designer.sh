#!/bin/bash
# ================================================================
# Designer Dashboard - Deploy Script
# Run this ONCE when the VPS is back online
# ================================================================

set -e

SERVER="root@76.13.192.32"
SSH_KEY="/Users/salwa/.ssh/fremio_production"
REMOTE_BACKEND="/root/fremio/backend"
REMOTE_DB_MIGRATION="/tmp/designer-migration.sql"

echo "🚀 Deploying Designer Dashboard..."

# ── 1. Deploy backend files ──────────────────────────────────────
echo ""
echo "📤 Deploying backend..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'uploads' \
  --exclude '.git' \
  --exclude 'logs' \
  /Users/salwa/Documents/fremio/backend/ \
  "$SERVER:$REMOTE_BACKEND/" \
  -e "ssh -i $SSH_KEY"

# ── 2. Copy DB migration ─────────────────────────────────────────
echo ""
echo "📋 Uploading database migration..."
scp -i "$SSH_KEY" \
  /Users/salwa/Documents/fremio/database/designer-migration.sql \
  "$SERVER:$REMOTE_DB_MIGRATION"

# ── 3. Run DB migration & restart backend ───────────────────────
echo ""
echo "🗄️  Running database migration and restarting backend..."
ssh -i "$SSH_KEY" "$SERVER" << 'EOF'
set -e

# Run migration
echo "Running designer migration..."
DB_NAME=$(grep "^DB_NAME=" /root/fremio/backend/.env | cut -d'=' -f2 | tr -d '"')
DB_USER=$(grep "^DB_USER=" /root/fremio/backend/.env | cut -d'=' -f2 | tr -d '"')
psql -U "${DB_USER:-postgres}" -d "${DB_NAME:-fremio}" -f /tmp/designer-migration.sql && \
  echo "✅ Database migration successful" || \
  echo "⚠️  Migration had warnings (may already be applied)"

# Install deps & restart
cd /root/fremio/backend
npm install --production
pm2 restart fremio-backend || pm2 start server.js --name fremio-backend
pm2 save
echo "✅ Backend restarted"
EOF

# ── 4. Deploy frontend ───────────────────────────────────────────
echo ""
echo "📤 Deploying frontend..."
rsync -avz --delete \
  /Users/salwa/Documents/fremio/my-app/dist/ \
  "$SERVER:/var/www/fremio/" \
  -e "ssh -i $SSH_KEY"

echo ""
echo "✅ Designer Dashboard deployed successfully!"
echo ""
echo "URLs:"
echo "  Designer Login:   https://fremio.id/designer/login"
echo "  Admin Review:     https://fremio.id/admin/designer-submissions"
echo ""
echo "🔑 Default invite code: fremio-designer-2025"
echo "   (Change via DESIGNER_INVITE_CODE in backend/.env)"
EOF
