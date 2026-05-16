# Fremio Studio Deployment Script (PowerShell)
# Deploy to VPS: studio.fremio.id

$ErrorActionPreference = "Stop"

$SERVER = "root@76.13.192.32"
$REMOTE_PATH = "/root/fremio-studio"
$LOCAL_PATH = Join-Path $PSScriptRoot "studio"

Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "  DEPLOYING FREMIO STUDIO..." -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Step 1: Build
Write-Host "Step 1: Building fremio-studio..." -ForegroundColor Yellow
Push-Location $LOCAL_PATH
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Pop-Location
Write-Host "Build complete" -ForegroundColor Green
Write-Host ""

# Step 2: Upload to server
Write-Host "Step 2: Uploading to VPS..." -ForegroundColor Yellow

# Create tar archive excluding node_modules, .next, .env, etc.
$tempTar = Join-Path $env:TEMP "fremio-studio-deploy.tar.gz"

# Use tar if available (Windows 10+ has tar built-in)
$tarAvailable = $null -ne (Get-Command tar -ErrorAction SilentlyContinue)

if ($tarAvailable) {
    # Create tar archive
    tar -czf $tempTar `
        --exclude='node_modules' `
        --exclude='.next/cache' `
        --exclude='.env' `
        --exclude='.env.production' `
        --exclude='.env.local' `
        --exclude='.env.production.local' `
        --exclude='uploads' `
        --exclude='.git' `
        --exclude='.gitignore' `
        -C $LOCAL_PATH .
    
    # Upload via scp
    Write-Host "Uploading archive..." -ForegroundColor Cyan
    scp $tempTar "$SERVER`:/tmp/fremio-studio-deploy.tar.gz"
    
    # Extract on server
    Write-Host "Extracting on server..." -ForegroundColor Cyan
    ssh $SERVER "mkdir -p $REMOTE_PATH && tar -xzf /tmp/fremio-studio-deploy.tar.gz -C $REMOTE_PATH && rm /tmp/fremio-studio-deploy.tar.gz"
    
    # Cleanup
    Remove-Item $tempTar -Force
} else {
    Write-Host "tar not available, using scp with exclusions..." -ForegroundColor Yellow
    
    # Manual sync using scp for key files
    $excludeDirs = @("node_modules", ".next", ".git", "uploads")
    
    # Upload entire directory
    scp -r "$LOCAL_PATH/*" "$SERVER`:$REMOTE_PATH/"
}

Write-Host "Upload complete" -ForegroundColor Green
Write-Host ""

# Step 3: Install and restart
Write-Host "Step 3: Installing dependencies and restarting on server..." -ForegroundColor Yellow

ssh $SERVER @"
cd $REMOTE_PATH
npm install --production
npx prisma generate
pm2 restart fremio-studio || pm2 start npm --name fremio-studio -- start
pm2 save
echo "Server restarted"
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Visit: https://studio.fremio.id" -ForegroundColor Cyan
Write-Host ""