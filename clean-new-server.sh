#!/bin/bash

# ================================================
# FREMIO - CLEAN NEW SERVER SCRIPT
# ================================================
# Script untuk membersihkan semua data di server baru
# Server: 76.13.192.32
# ================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

NEW_SERVER="76.13.192.32"
SSH_CONTROL_PATH="${FREMIO_SSH_CONTROL_PATH:-/tmp/fremio-${NEW_SERVER}.sock}"
SSH_OPTS=(
    -o ControlMaster=auto
    -o ControlPersist=20m
    -o ControlPath="$SSH_CONTROL_PATH"
)

init_ssh_control() {
    if ssh "${SSH_OPTS[@]}" -O check "root@${NEW_SERVER}" >/dev/null 2>&1; then
        return 0
    fi

    echo "Membuka koneksi SSH persisten (autentikasi sekali saja)..."
    if ! ssh "${SSH_OPTS[@]}" -MNf "root@${NEW_SERVER}" 2>/dev/null; then
        rm -f "$SSH_CONTROL_PATH"
        ssh "${SSH_OPTS[@]}" -MNf "root@${NEW_SERVER}"
    fi
}

echo -e "${RED}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ⚠️  WARNING: SERVER CLEANUP - DATA AKAN DIHAPUS! ⚠️    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "Script ini akan menghapus SEMUA data di server $NEW_SERVER:"
echo "  • Semua aplikasi (PM2, Node.js processes)"
echo "  • Database PostgreSQL dan semua data"
echo "  • File-file aplikasi di /var/www/ dan /root/"
echo "  • Nginx configuration"
echo "  • Log files"
echo ""
echo -e "${YELLOW}Apakah Anda yakin ingin melanjutkan? (yes/no)${NC}"
read -r CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${RED}Dibatalkan oleh user.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Ketik 'DELETE ALL DATA' untuk konfirmasi akhir:${NC}"
read -r FINAL_CONFIRM

if [ "$FINAL_CONFIRM" != "DELETE ALL DATA" ]; then
    echo -e "${RED}Konfirmasi tidak sesuai. Dibatalkan.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🧹 Memulai pembersihan server $NEW_SERVER...${NC}"
echo ""

init_ssh_control

# ================================================
# CLEANUP SCRIPT TO RUN ON SERVER
# ================================================

ssh "${SSH_OPTS[@]}" root@$NEW_SERVER << 'ENDSSH'
#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}1️⃣  Menghentikan semua aplikasi Node.js dan PM2...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Stop all PM2 processes
if command -v pm2 &> /dev/null; then
    pm2 kill || true
    echo -e "${GREEN}✅ PM2 processes stopped${NC}"
fi

# Kill any remaining Node.js processes
pkill -9 node || true
echo -e "${GREEN}✅ Node.js processes killed${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}2️⃣  Menghapus database PostgreSQL...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Stop PostgreSQL
if command -v systemctl &> /dev/null; then
    systemctl stop postgresql || true
fi

# Drop all databases (except postgres, template0, template1)
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname NOT IN ('postgres', 'template0', 'template1');" || true
sudo -u postgres psql -c "DROP DATABASE IF EXISTS fremio;" || true
sudo -u postgres psql -c "DROP DATABASE IF EXISTS fremio_db;" || true
sudo -u postgres psql -c "DROP DATABASE IF EXISTS fremio_production;" || true

# Drop all users
sudo -u postgres psql -c "DROP USER IF EXISTS fremio_user;" || true
sudo -u postgres psql -c "DROP USER IF EXISTS fremio;" || true

echo -e "${GREEN}✅ Database PostgreSQL dibersihkan${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}3️⃣  Menghapus file-file aplikasi...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Remove application directories
rm -rf /var/www/fremio* || true
rm -rf /var/www/html/fremio* || true
rm -rf /root/fremio* || true
rm -rf /home/*/fremio* || true
rm -rf /opt/fremio* || true

echo -e "${GREEN}✅ File aplikasi dihapus${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}4️⃣  Menghapus konfigurasi Nginx...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Stop Nginx
if command -v systemctl &> /dev/null; then
    systemctl stop nginx || true
fi

# Remove Nginx configs
rm -f /etc/nginx/sites-enabled/fremio* || true
rm -f /etc/nginx/sites-available/fremio* || true
rm -f /etc/nginx/conf.d/fremio* || true

# Restart Nginx with default config
systemctl start nginx || true

echo -e "${GREEN}✅ Nginx configuration dihapus${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}5️⃣  Menghapus log files...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Clean logs
rm -rf /var/log/fremio* || true
rm -rf /var/log/nginx/fremio* || true
rm -rf /var/log/pm2/* || true
rm -rf /root/.pm2/logs/* || true

echo -e "${GREEN}✅ Log files dihapus${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}6️⃣  Membersihkan user dan permissions...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Remove fremio user if exists
userdel -r fremio 2>/dev/null || true

echo -e "${GREEN}✅ User fremio dihapus${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}7️⃣  Membersihkan crontab...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Remove fremio-related crontabs
crontab -l 2>/dev/null | grep -v fremio | crontab - || true

echo -e "${GREEN}✅ Crontab dibersihkan${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}8️⃣  Membersihkan temporary files...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Clean temp files
rm -rf /tmp/fremio* || true
rm -rf /tmp/pm2* || true

echo -e "${GREEN}✅ Temporary files dihapus${NC}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ PEMBERSIHAN SELESAI!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Server bersih dan siap untuk deployment fresh!"
echo ""

ENDSSH

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ SERVER CLEANUP BERHASIL!                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Server $NEW_SERVER sudah bersih dan siap untuk deployment.${NC}"
echo ""
echo "Langkah selanjutnya:"
echo "  1. Jalankan: ./deploy-to-new-server.sh"
echo ""
