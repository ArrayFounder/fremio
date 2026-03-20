#!/bin/bash
# Migrate: Create user_drafts table on production server
# Run this once to enable the frame sharing feature.

set -e

SERVER="root@76.13.192.32"
echo "🗄️  Creating user_drafts table on production..."

ssh "$SERVER" 'bash -s' <<'ENDSSH'
# Find the PostgreSQL credentials from backend .env
BACKEND_DIR="/root/fremio/backend"
if [ -f "$BACKEND_DIR/.env" ]; then
  export $(grep -v "^#" "$BACKEND_DIR/.env" | grep -E "^DB_" | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-fremio}"
DB_USER="${DB_USER:-fremio_user}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "📊 DB: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# Run the migration
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL'
-- Create user_drafts table for frame sharing
CREATE TABLE IF NOT EXISTS user_drafts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  share_id VARCHAR(20) UNIQUE NOT NULL,
  title VARCHAR(255) DEFAULT 'Untitled',
  frame_data TEXT,
  preview_url TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_drafts_share_id ON user_drafts(share_id);
CREATE INDEX IF NOT EXISTS idx_user_drafts_user_id ON user_drafts(user_id);

SELECT 'user_drafts table ready' as status;
SQL

echo "✅ Migration complete!"
ENDSSH
