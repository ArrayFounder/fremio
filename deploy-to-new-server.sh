#!/bin/bash

# ================================================
# FREMIO - DEPLOY TO NEW SERVER
# ================================================
# Fresh deployment ke server baru: 76.13.192.32
# ================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

NEW_SERVER="76.13.192.32"
VPS_USER="root"
APP_DIR="/var/www/fremio"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
SSH_CONTROL_PATH="${FREMIO_SSH_CONTROL_PATH:-/tmp/fremio-${NEW_SERVER}.sock}"
SSH_OPTS=(
    -o ControlMaster=auto
    -o ControlPersist=20m
    -o ControlPath="$SSH_CONTROL_PATH"
)

init_ssh_control() {
    if ssh "${SSH_OPTS[@]}" -O check "${VPS_USER}@${NEW_SERVER}" >/dev/null 2>&1; then
        return 0
    fi

    echo "   Opening persistent SSH connection (one-time authentication)..."
    if ! ssh "${SSH_OPTS[@]}" -MNf "${VPS_USER}@${NEW_SERVER}" 2>/dev/null; then
        rm -f "$SSH_CONTROL_PATH"
        ssh "${SSH_OPTS[@]}" -MNf "${VPS_USER}@${NEW_SERVER}"
    fi
}

close_ssh_control() {
    ssh "${SSH_OPTS[@]}" -O exit "${VPS_USER}@${NEW_SERVER}" >/dev/null 2>&1 || true
    rm -f "$SSH_CONTROL_PATH" >/dev/null 2>&1 || true
}

trap close_ssh_control EXIT

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         🚀 FREMIO DEPLOYMENT TO NEW SERVER 🚀           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "Target Server: $NEW_SERVER"
echo "Installation Directory: $APP_DIR"
echo ""

# ================================================
# 1. PRE-DEPLOYMENT CHECKS
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}1️⃣  Pre-deployment checks...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run from project root.${NC}"
    exit 1
fi

# Check SSH connection
echo "   Testing SSH connection to $NEW_SERVER..."
if ! ssh "${SSH_OPTS[@]}" -o ConnectTimeout=5 $VPS_USER@$NEW_SERVER exit 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to $NEW_SERVER. Check SSH access!${NC}"
    exit 1
fi
init_ssh_control
echo -e "${GREEN}   ✅ SSH connection OK${NC}"

# Check if backend .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ Error: backend/.env not found${NC}"
    echo "   Please create backend/.env with production settings"
    exit 1
fi

# Check if frontend .env exists
if [ ! -f "my-app/.env" ]; then
    echo -e "${RED}❌ Error: my-app/.env not found${NC}"
    echo "   Please create my-app/.env with production settings"
    exit 1
fi

echo -e "${GREEN}✅ All checks passed${NC}"
echo ""

# ================================================
# 2. BUILD FRONTEND
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}2️⃣  Building frontend...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd my-app

echo "   Installing dependencies..."
npm install --legacy-peer-deps

echo "   Building production bundle..."
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Frontend build failed${NC}"
    exit 1
fi

echo -e "${GREEN}   ✅ Frontend built successfully${NC}"
echo "   Build size: $(du -sh dist | cut -f1)"

cd ..
echo ""

# ================================================
# 3. PREPARE BACKEND
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}3️⃣  Preparing backend...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd backend

echo "   Installing production dependencies..."
npm install --production

echo -e "${GREEN}   ✅ Backend prepared${NC}"

cd ..
echo ""

# ================================================
# 4. SETUP VPS INFRASTRUCTURE
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}4️⃣  Setting up VPS infrastructure...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << 'ENDSSH'
#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

echo "   📦 Installing system packages..."

# Update system
apt-get update -qq

# Install Node.js 20 if not installed
if ! command -v node &> /dev/null; then
    echo "   Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install PostgreSQL if not installed
if ! command -v psql &> /dev/null; then
    echo "   Installing PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib
fi

# Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo "   Installing Nginx..."
    apt-get install -y nginx
fi

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    echo "   Installing PM2..."
    npm install -g pm2
fi

echo -e "${GREEN}   ✅ System packages installed${NC}"

# Create application directory
mkdir -p /var/www/fremio/backend
mkdir -p /var/www/fremio/frontend
mkdir -p /var/www/fremio/uploads
mkdir -p /var/www/fremio/logs

echo -e "${GREEN}   ✅ Directories created${NC}"

ENDSSH

echo -e "${GREEN}✅ VPS infrastructure ready${NC}"
echo ""

# ================================================
# 5. SETUP DATABASE
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}5️⃣  Setting up database...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Generate random password
DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
#!/bin/bash

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOSQL
-- Create user
CREATE USER fremio_user WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE fremio OWNER fremio_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE fremio TO fremio_user;

\c fremio

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO fremio_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fremio_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fremio_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fremio_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fremio_user;

EOSQL

echo -e "${GREEN}   ✅ Database created${NC}"

ENDSSH

# Save database credentials locally
echo "DB_PASSWORD=$DB_PASSWORD" > .db_credentials
echo -e "${GREEN}✅ Database setup complete${NC}"
echo -e "${YELLOW}   Database credentials saved to: .db_credentials${NC}"
echo ""

# ================================================
# 6. UPLOAD DATABASE SCHEMA
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}6️⃣  Uploading and importing database schema...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check if database files exist
if [ -f "database/schema.sql" ]; then
    echo "   Uploading schema.sql..."
    scp "${SSH_OPTS[@]}" database/schema.sql $VPS_USER@$NEW_SERVER:/tmp/schema.sql
    
    ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
    sudo -u postgres psql -d fremio -f /tmp/schema.sql
    rm /tmp/schema.sql
ENDSSH
    echo -e "${GREEN}   ✅ Schema imported${NC}"
fi

# Import seed data if exists
if [ -f "database/seed.sql" ]; then
    echo "   Uploading seed data..."
    scp "${SSH_OPTS[@]}" database/seed.sql $VPS_USER@$NEW_SERVER:/tmp/seed.sql
    
    ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
    sudo -u postgres psql -d fremio -f /tmp/seed.sql
    rm /tmp/seed.sql
ENDSSH
    echo -e "${GREEN}   ✅ Seed data imported${NC}"
fi

echo -e "${GREEN}✅ Database ready${NC}"
echo ""

# ================================================
# 7. UPLOAD BACKEND
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}7️⃣  Uploading backend...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create temporary .env with updated DB password
cat backend/.env | sed "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" | sed "s/DB_HOST=.*/DB_HOST=localhost/" > backend/.env.production

echo "   Uploading backend files..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    backend/ $VPS_USER@$NEW_SERVER:$BACKEND_DIR/

# Upload production .env
scp "${SSH_OPTS[@]}" backend/.env.production $VPS_USER@$NEW_SERVER:$BACKEND_DIR/.env

# Clean up
rm backend/.env.production

echo -e "${GREEN}   ✅ Backend uploaded${NC}"
echo ""

# ================================================
# 8. UPLOAD FRONTEND
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}8️⃣  Uploading frontend...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "   Uploading frontend build..."
rsync -avz --progress \
    my-app/dist/ $VPS_USER@$NEW_SERVER:$FRONTEND_DIR/

echo -e "${GREEN}   ✅ Frontend uploaded${NC}"
echo ""

# ================================================
# 9. INSTALL BACKEND DEPENDENCIES ON VPS
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}9️⃣  Installing backend dependencies on VPS...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
cd $BACKEND_DIR
npm install --production
echo -e "${GREEN}   ✅ Dependencies installed${NC}"
ENDSSH

echo ""

# ================================================
# 10. SETUP PM2
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔟 Setting up PM2...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Upload PM2 ecosystem file
cat > /tmp/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'fremio-api',
    script: 'server.js',
    cwd: '/var/www/fremio/backend',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/var/www/fremio/logs/error.log',
    out_file: '/var/www/fremio/logs/out.log',
    log_file: '/var/www/fremio/logs/combined.log',
    time: true,
    max_memory_restart: '500M',
    autorestart: true,
    watch: false,
  }]
};
EOF

scp "${SSH_OPTS[@]}" /tmp/ecosystem.config.js $VPS_USER@$NEW_SERVER:$APP_DIR/
rm /tmp/ecosystem.config.js

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root
echo -e "${GREEN}   ✅ PM2 configured and started${NC}"
ENDSSH

echo ""

# ================================================
# 11. SETUP NGINX
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}1️⃣1️⃣  Setting up Nginx...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create Nginx configuration
cat > /tmp/fremio.conf << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        root /var/www/fremio/frontend;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API Backend
    location /api {
        proxy_pass http://localhost:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for long requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Uploads
    location /uploads {
        alias /var/www/fremio/uploads;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Max upload size
    client_max_body_size 20M;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF

scp "${SSH_OPTS[@]}" /tmp/fremio.conf $VPS_USER@$NEW_SERVER:/tmp/
rm /tmp/fremio.conf

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
# Install Nginx config
mv /tmp/fremio.conf /etc/nginx/sites-available/fremio
ln -sf /etc/nginx/sites-available/fremio /etc/nginx/sites-enabled/fremio

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo -e "${GREEN}   ✅ Nginx configured${NC}"
ENDSSH

echo ""

# ================================================
# 12. SET PERMISSIONS
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}1️⃣2️⃣  Setting permissions...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << ENDSSH
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR
chmod 775 $APP_DIR/uploads
echo -e "${GREEN}   ✅ Permissions set${NC}"
ENDSSH

echo ""

# ================================================
# 13. SETUP FIREWALL
# ================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}1️⃣3️⃣  Configuring firewall...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${SSH_OPTS[@]}" $VPS_USER@$NEW_SERVER << 'ENDSSH'
if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw allow 5050/tcp  # Backend (untuk testing)
    ufw reload
    echo -e "${GREEN}   ✅ Firewall configured${NC}"
fi
ENDSSH

echo ""

# ================================================
# DEPLOYMENT COMPLETE!
# ================================================
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ DEPLOYMENT BERHASIL! ✅                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo "   Server: $NEW_SERVER"
echo "   Frontend: http://$NEW_SERVER"
echo "   Backend API: http://$NEW_SERVER/api"
echo "   Backend Direct: http://$NEW_SERVER:5050"
echo ""
echo -e "${YELLOW}🔐 Database Credentials:${NC}"
echo "   Database: fremio"
echo "   User: fremio_user"
echo "   Password: (tersimpan di .db_credentials)"
echo ""
echo -e "${YELLOW}📝 Useful Commands:${NC}"
echo "   Check backend status: ssh root@$NEW_SERVER 'pm2 status'"
echo "   View backend logs:    ssh root@$NEW_SERVER 'pm2 logs fremio-api'"
echo "   Restart backend:      ssh root@$NEW_SERVER 'pm2 restart fremio-api'"
echo "   Check Nginx status:   ssh root@$NEW_SERVER 'systemctl status nginx'"
echo ""
echo -e "${YELLOW}🔍 Testing:${NC}"
echo "   1. Buka: http://$NEW_SERVER"
echo "   2. Test API: curl http://$NEW_SERVER/api/health"
echo "   3. Login dan test semua fitur"
echo ""
echo -e "${YELLOW}⚠️  Next Steps (PENTING):${NC}"
echo "   1. Update DNS domain Anda ke IP: $NEW_SERVER"
echo "   2. Setup SSL: ssh root@$NEW_SERVER 'certbot --nginx'"
echo "   3. Update .env files dengan domain production"
echo "   4. Test payment gateway dengan domain baru"
echo ""
