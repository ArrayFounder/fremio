# Manual Setup via SSH Console
# Jalankan command ini satu per satu di console server yang sudah terbuka

# 1. Cari folder backend yang benar
find /var/www -name "package.json" -path "*/backend/*" 2>/dev/null | head -5
# atau
find / -name "fremio*" -type d 2>/dev/null | grep -E "(backend|api)" | head -10

# 2. Atau cek PM2 untuk lihat folder backend
pm2 list
pm2 describe fremio-api 2>/dev/null || pm2 describe fremio-backend 2>/dev/null

# 3. Setelah tahu foldernya, misalnya /var/www/fremio/backend, jalankan:
cd /var/www/fremio/backend  # GANTI dengan path yang benar

# 4. Pull code terbaru (skip jika bukan git repo)
git pull origin main 2>/dev/null || echo "Skipping git pull"

# 5. Install dependencies
npm install csv-parse

# 6. Setup database (otomatis pakai password dari .env)
node scripts/setup-database-production.mjs

# 7. Import members
node scripts/import-members-from-csv.mjs data/transactions-1.csv data/transactions-2.csv

# 8. Restart backend
pm2 restart all

# 9. Verify
cd ~
npm install pg
node -e "
const {Pool}=require('pg');
require('dotenv').config({path:'/var/www/fremio/backend/.env'});
new Pool({
  host:'localhost',
  port:5432,
  database:'fremio',
  user:'fremio_user',
  password:process.env.DB_PASSWORD
}).query('SELECT COUNT(*) FROM user_package_access WHERE is_active=true AND access_end>NOW()')
.then(r=>console.log('✅ Active members:',r.rows[0].count))
.catch(e=>console.log('❌ Error:',e.message))
.finally(()=>process.exit())
"
