# 🚀 PANDUAN DEPLOYMENT FREMIO (Via Console)

Karena SSH via password/key bermasalah, kita pakai **SSH Console Hostinger** untuk deploy.

---

## 🎯 DEPLOY FRONTEND + BACKEND

### Step 1: Build & Push di Local

```bash
cd /Users/salwa/Documents/fremio/my-app
npm run build
cd ..
git add .
git commit -m "Deploy update"
git push origin main
```

### Step 2: Deploy via Console

**Password VPS:** [simpan di tempat aman]

**Deploy dengan SSH + Password:**

```bash
# Deploy frontend
cd /Users/salwa/Documents/fremio/my-app
npm run build
rsync -avz --delete dist/ root@api.fremio.id:/var/www/fremio/
# (masukkan password saat diminta)

# Deploy backend
cd ..
scp backend/routes/*.js root@api.fremio.id:/root/fremio/backend/routes/
ssh root@api.fremio.id "pm2 restart fremio-backend"
# (masukkan password saat diminta)
```

**Cek hasil**: 
- Frontend: https://fremio.id (Ctrl+Shift+R)
- Backend logs: `ssh root@api.fremio.id "pm2 logs fremio-backend --lines 50"`

---

## 📝 Fitur Password Setup untuk CSV Members

**Flow untuk member dari CSV** (66 members dengan dummy password):

1. Member login dengan email mereka + password apa saja
2. Sistem detect: "User ini dari CSV import" 
3. Redirect otomatis ke halaman **"Buat Password Baru"**
4. Member set password baru (2x konfirmasi)
5. Password tersimpan → Auto login → Membership aktif ✅

**Tidak perlu broadcast password default!** User langsung buat password sendiri saat first login.

**Files yang diubah:**
- `/backend/routes/auth.js` - Tambah endpoint `/api/auth/set-first-password`
- `/my-app/src/pages/SetPassword.jsx` - Halaman set password baru
- `/my-app/src/contexts/AuthContext.jsx` - Handle redirect to SetPassword
- `/my-app/src/pages/Login.jsx` - Check requirePasswordSetup response
- `/my-app/src/App.jsx` - Add route `/set-password`

---

---

## 📝 Quick Commands

```bash
# Cek status backend
ssh root@api.fremio.id "pm2 status"

# Lihat logs backend
ssh root@api.fremio.id "pm2 logs fremio-backend --lines 50"

# Restart backend
ssh root@api.fremio.id "pm2 restart fremio-backend"

# Upload file backend
scp backend/path/to/file.js root@api.fremio.id:/root/fremio/backend/path/to/

# Deploy frontend
cd my-app && npm run build && rsync -avz --delete dist/ root@api.fremio.id:/var/www/fremio/
```

---

## 🆘 Troubleshooting

### "Permission denied" saat SSH?
- SSH key belum ter-install. Ulangi **Setup SEKALI SAJA** di atas.

### Frontend tidak update?
```bash
# 1. Cek timestamp file di server
ssh root@api.fremio.id "ls -la /var/www/fremio/index.html"

# 2. Clear browser cache: Ctrl+Shift+R

# 3. Deploy ulang
cd my-app && npm run build && rsync -avz --delete dist/ root@api.fremio.id:/var/www/fremio/
```

### Backend error?
```bash
# Lihat error logs
ssh root@api.fremio.id "pm2 logs fremio-backend --err --lines 100"

# Restart backend
ssh root@api.fremio.id "pm2 restart fremio-backend"
```

---

Dibuat: 20 Februari 2026
