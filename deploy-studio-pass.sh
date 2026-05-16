#!/bin/bash
# Deploy Fremio Studio with password authentication
SERVER="root@76.13.192.32"
REMOTE_PATH="/root/fremio-studio"
LOCAL_PATH="./studio"
PASSWORD='#Salwaputri111103'

echo "========================================"
echo "  DEPLOYING FREMIO STUDIO..."
echo "========================================"

# Use expect if available, otherwise try ssh with password via stdin
if command -v expect >/dev/null 2>&1; then
    echo "Using expect for SSH..."
    expect -c "
        set timeout 120
        spawn ssh -o StrictHostKeyChecking=no $SERVER
        expect {
            \"password:\" {
                send \"$PASSWORD\r\"
                exp_continue
            }
            \"Last login:\" {
                send \"cd /root/fremio-studio && pm2 status\r\"
            }
            \"~\$\" {
                send \"cd /root/fremio-studio && pm2 status\r\"
            }
        }
        expect eof
    "
else
    echo "No expect, trying manual approach..."
    # Try with sshpass from msys
    echo "Password: $PASSWORD"
    ssh -o StrictHostKeyChecking=no -o PasswordAuthentication=yes $SERVER "echo 'SSH OK'" 2>&1 || echo "Manual SSH needed"
fi
