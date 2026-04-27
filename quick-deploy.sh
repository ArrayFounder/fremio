#!/bin/bash

# ================================================
# FREMIO - QUICK DEPLOYMENT TO NEW SERVER
# ================================================
# All-in-one script untuk deployment ke server baru
# ================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

NEW_SERVER="76.13.192.32"
SSH_CONTROL_PATH="/tmp/fremio-${NEW_SERVER}.sock"
SSH_OPTS=(
    -o ControlMaster=auto
    -o ControlPersist=20m
    -o ControlPath="$SSH_CONTROL_PATH"
)

init_ssh_control() {
    if ssh "${SSH_OPTS[@]}" -O check "root@${NEW_SERVER}" >/dev/null 2>&1; then
        return 0
    fi

    echo "   Opening persistent SSH connection (one-time authentication)..."
    if ! ssh "${SSH_OPTS[@]}" -MNf "root@${NEW_SERVER}" 2>/dev/null; then
        rm -f "$SSH_CONTROL_PATH"
        ssh "${SSH_OPTS[@]}" -MNf "root@${NEW_SERVER}"
    fi
}

clear

echo -e "${BOLD}${BLUE}"
cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     ███████╗██████╗ ███████╗███╗   ███╗██╗ ██████╗             ║
║     ██╔════╝██╔══██╗██╔════╝████╗ ████║██║██╔═══██╗            ║
║     █████╗  ██████╔╝█████╗  ██╔████╔██║██║██║   ██║            ║
║     ██╔══╝  ██╔══██╗██╔══╝  ██║╚██╔╝██║██║██║   ██║            ║
║     ██║     ██║  ██║███████╗██║ ╚═╝ ██║██║╚██████╔╝            ║
║     ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝ ╚═════╝             ║
║                                                                ║
║              🚀 DEPLOYMENT TO NEW SERVER 🚀                    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo ""
echo -e "${YELLOW}Target Server: ${BOLD}$NEW_SERVER${NC}"
echo -e "${YELLOW}From: Server lama (72.61.214.5 - tidak dapat diakses)${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ================================================
# Pre-flight Check
# ================================================
echo -e "${YELLOW}🔍 Pre-flight checks...${NC}"
echo ""

# Check if we're in project root
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found.${NC}"
    echo "   Please run this script from the project root directory."
    exit 1
fi

# Check SSH connection
echo -n "   Testing SSH connection to $NEW_SERVER... "
if ssh "${SSH_OPTS[@]}" -o ConnectTimeout=5 root@$NEW_SERVER exit 2>/dev/null; then
    init_ssh_control
    export FREMIO_SSH_CONTROL_PATH="$SSH_CONTROL_PATH"
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
    echo ""
    echo -e "${RED}Cannot connect to $NEW_SERVER${NC}"
    echo "Please check:"
    echo "  1. Server is running"
    echo "  2. SSH key is configured and passphrase entered"
    echo "  3. Firewall allows SSH (port 22)"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All pre-flight checks passed${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ================================================
# Show Plan
# ================================================
echo -e "${BOLD}${YELLOW}📋 DEPLOYMENT PLAN:${NC}"
echo ""
echo "Step 1: Setup environment files (.env)"
echo "        - Generate secure JWT secret"
echo "        - Configure frontend URL"
echo ""
echo "Step 2: Clean new server"
echo "        - Remove all old data"
echo "        - Remove old applications"
echo "        - Clean database"
echo ""
echo "Step 3: Deploy fresh installation"
echo "        - Build frontend & backend"
echo "        - Setup infrastructure"
echo "        - Deploy database"
echo "        - Upload application"
echo "        - Configure services"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}⏱️  Estimated time: 15-20 minutes${NC}"
echo ""
echo -e "${RED}⚠️  WARNING: This will DELETE all data on $NEW_SERVER${NC}"
echo ""
echo -n "Ready to proceed? (yes/no): "
read -r confirm

if [ "$confirm" != "yes" ]; then
    echo ""
    echo -e "${YELLOW}Deployment cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ================================================
# STEP 1: Prepare Environment Files
# ================================================
echo -e "${BOLD}${BLUE}STEP 1/3: Setup Environment Files${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ ! -f "backend/.env" ] || [ ! -f "my-app/.env" ]; then
    echo "Running environment setup..."
    ./prepare-env-files.sh
else
    echo -e "${GREEN}✅ Environment files already exist${NC}"
    echo ""
    echo -n "Recreate them? (y/n) [n]: "
    read -r recreate
    if [ "$recreate" = "y" ]; then
        ./prepare-env-files.sh
    fi
fi

echo ""
echo -e "${GREEN}✅ STEP 1 COMPLETE${NC}"
echo ""
read -p "Press Enter to continue to Step 2..."
clear

# ================================================
# STEP 2: Clean Server
# ================================================
echo -e "${BOLD}${BLUE}STEP 2/3: Clean New Server${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${RED}⚠️  This will DELETE all data on server $NEW_SERVER${NC}"
echo ""
echo "Type 'yes' to confirm: "
read -r confirm_clean

if [ "$confirm_clean" = "yes" ]; then
    # Run with auto-confirm
    echo "yes" | echo "DELETE ALL DATA" | ./clean-new-server.sh || {
        echo ""
        echo -e "${YELLOW}Running cleanup manually...${NC}"
        ./clean-new-server.sh
    }
else
    echo ""
    echo -e "${RED}❌ Server cleanup cancelled. Cannot proceed.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ STEP 2 COMPLETE${NC}"
echo ""
read -p "Press Enter to continue to Step 3..."
clear

# ================================================
# STEP 3: Deploy
# ================================================
echo -e "${BOLD}${BLUE}STEP 3/3: Deploy to New Server${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Starting deployment..."
echo ""

./deploy-to-new-server.sh

# ================================================
# DEPLOYMENT COMPLETE
# ================================================
echo ""
echo -e "${BOLD}${GREEN}"
cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║              ✅  DEPLOYMENT SUCCESSFUL!  ✅                    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""
echo -e "${BLUE}🌐 Your application is now live at:${NC}"
echo ""
echo -e "   ${BOLD}Frontend:${NC} http://$NEW_SERVER"
echo -e "   ${BOLD}API:${NC}      http://$NEW_SERVER/api"
echo ""
echo -e "${YELLOW}📝 Important Files:${NC}"
echo "   - Database credentials: .db_credentials"
echo "   - Backend config: backend/.env"
echo "   - Frontend config: my-app/.env"
echo ""
echo -e "${YELLOW}🔍 Quick Test:${NC}"
echo "   curl http://$NEW_SERVER/api/health"
echo ""
echo -e "${YELLOW}📖 Next Steps:${NC}"
echo "   1. Open http://$NEW_SERVER in browser"
echo "   2. Test registration & login"
echo "   3. Read DEPLOYMENT_NEW_SERVER.md for domain & SSL setup"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
