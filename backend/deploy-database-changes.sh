#!/bin/bash
# Deploy Database Changes to Production Server
# This script will create the necessary tables and import members

SERVER="root@api.fremio.id"
REMOTE_PATH="/var/www/fremio-backend"

echo "🚀 Deploying database changes to production..."
echo ""

# Step 1: Upload SQL scripts
echo "📤 Step 1: Uploading SQL scripts..."
scp setup-package-tables.sql $SERVER:$REMOTE_PATH/
scp create-deactivate-function.sql $SERVER:$REMOTE_PATH/

# Step 2: Upload import script
echo "📤 Step 2: Uploading import script..."
scp scripts/import-members-from-csv.mjs $SERVER:$REMOTE_PATH/scripts/

# Step 3: Upload CSV files
echo "📤 Step 3: Uploading CSV files..."
scp "/Users/salwa/Downloads/transaction-report-G269262086-20-02-2026-06-31-18.648.csv" $SERVER:/tmp/
scp "/Users/salwa/Downloads/transaction-report-G269262086-20-02-2026-06-31-42.422.csv" $SERVER:/tmp/

# Step 4: Execute on server
echo ""
echo "🔧 Step 4: Executing database setup on server..."
ssh $SERVER << 'ENDSSH'
cd /var/www/fremio-backend

# Check if csv-parse is installed
if ! npm list csv-parse > /dev/null 2>&1; then
  echo "Installing csv-parse..."
  npm install csv-parse
fi

echo ""
echo "Creating tables..."
psql -h localhost -U fremio_user -d fremio -f setup-package-tables.sql

echo ""
echo "Importing members..."
node scripts/import-members-from-csv.mjs \
  /tmp/transaction-report-G269262086-20-02-2026-06-31-18.648.csv \
  /tmp/transaction-report-G269262086-20-02-2026-06-31-42.422.csv

echo ""
echo "Cleaning up temporary files..."
rm -f /tmp/transaction-report-*.csv

echo ""
echo "Restarting backend service..."
pm2 restart fremio-api || pm2 restart fremio-backend || echo "Please restart backend manually"

ENDSSH

echo ""
echo "=========================================="
echo "✅ Database deployment complete!"
echo "=========================================="
echo ""
echo "Please verify at: https://fremio.id/admin/subscribers"
