#!/bin/bash

# Upload frontend dist ke server
cd /Users/salwa/Documents/fremio
rsync -avz --delete my-app/dist/ root@76.13.192.32:/var/www/fremio/

echo "✅ Frontend uploaded!"
