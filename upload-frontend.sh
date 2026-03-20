#!/bin/bash

# Upload frontend dist ke server
cd /Users/salwa/Documents/fremio
# --exclude 'uploads/' prevents rsync from deleting uploaded overlay images
rsync -avz --delete --exclude 'uploads/' my-app/dist/ root@76.13.192.32:/var/www/fremio/

# Sync uploads from backend to frontend dir so overlays are always accessible
echo "🔄 Syncing uploads from backend..."
ssh root@76.13.192.32 'rsync -a /root/fremio/backend/uploads/ /var/www/fremio/uploads/ && chmod -R 755 /var/www/fremio/uploads/ 2>/dev/null || true'

echo "✅ Frontend uploaded!"
