# CLOUDFLARE CACHE PURGE INSTRUCTIONS

## Masalah
Cloudflare Pages memiliki aggressive caching. File JavaScript baru (hash: `mlpdq50z`) sudah di-build dan di-push ke GitHub, tapi Cloudflare masih serve file lama (`mlon3eg4`).

## Solusi 1: Manual Purge Cloudflare Cache

### Via Cloudflare Dashboard:
1. Login ke https://dash.cloudflare.com
2. Pilih account Fremio
3. Klik "Caching" di sidebar kiri
4. Klik "Configuration"
5. Scroll ke "Purge Cache"
6. Pilih **"Purge Everything"**
7. Confirm

### Setelah Purge:
Tunggu 30-60 detik, lalu:
1. Hard reload browser: `Cmd + Shift + R`
2. Cek console - harus lihat file: `index-mlpdq50z-DUKRanqu.js`

## Solusi 2: Bypass Cache dengan Query Parameter

Buka URL dengan query parameter untuk bypass cache:
```
https://fremio.id/admin/upload-frame?v=1771259331
```

## Solusi 3: Deployment Manual (Jika Cloudflare tetap tidak update)

Jika setelah purge cache masih tidak berhasil, kemungkinan Cloudflare Pages deployment ada masalah. Alternatif:

### Check GitHub Actions Status:
1. Buka https://github.com/ArrayFounder/fremio/actions
2. Cek status workflow "Deploy Frontend to Cloudflare Pages"
3. Pastikan status = SUCCESS (hijau ✓)
4. Klik workflow untuk lihat detail logs

### Jika Workflow Failed:
Ada masalah dengan Cloudflare API token atau konfigurasi. Check:
- `CLOUDFLARE_API_TOKEN` di GitHub Secrets
- `CLOUDFLARE_ACCOUNT_ID` 
- `CLOUDFLARE_PROJECT_NAME`

## Verifikasi Fix Berhasil

Setelah cache purge dan deployment berhasil, buka Console dan cari:

```
✅ [UPLOAD] File accepted: yourfile.png, Size: 8.24MB
```

Dan file JavaScript harus:
```
index-mlpdq50z-DUKRanqu.js  ✅ CORRECT
```

BUKAN:
```
index-mlon3eg4-C2NN7n7s.js  ❌ OLD VERSION
```

## Build Hash Verification

| Component | Expected Hash |
|-----------|---------------|
| Main JS   | `mlpdq50z`    |
| Old Hash  | `mlon3eg4` ❌  |

## Timeline
- Build completed: 2026-02-16 23:40
- Last commit: `1b3e863`
- Expected deployment: ~2-3 minutes after commit
