# INSTRUKSI CLEAR CACHE - PENTING!

## Masalah
Error "File terlalu besar! Maksimal 5MB" masih muncul meskipun kode sudah diperbaiki karena **BROWSER CACHE**.

## Deployment Status
✅ Kode sudah diperbaiki dan di-push ke GitHub
✅ GitHub Actions sudah deploy ke Cloudflare Pages
✅ Build version: 2026-02-16

## Solusi 1: Hard Refresh (COBA INI DULU)
1. Buka https://fremio.id/admin/upload-frame
2. Tekan tombol berikut **BERSAMAAN**:
   - **Mac**: `Cmd + Shift + R`
   - **Windows**: `Ctrl + Shift + R`
   - **Safari**: `Cmd + Option + R`
3. Atau klik kanan pada tombol refresh → pilih "Empty Cache and Hard Reload"

## Solusi 2: Clear All Cache (Jika Solusi 1 Gagal)
### Chrome/Edge:
1. Tekan `Cmd + Shift + Delete` (Mac) atau `Ctrl + Shift + Delete` (Windows)
2. Pilih "Cached images and files"
3. Time range: "All time"
4. Click "Clear data"
5. Refresh halaman

### Safari:
1. Safari menu → Settings → Privacy
2. Click "Manage Website Data"
3. Search "fremio.id"
4. Click "Remove" untuk semua fremio.id entries
5. Restart Safari

### Firefox:
1. `Cmd/Ctrl + Shift + Delete`
2. Pilih "Cache"
3. Time range: "Everything"
4. Clear now

## Solusi 3: Private/Incognito Window
1. Buka Private/Incognito window baru:
   - Chrome: `Cmd + Shift + N`
   - Safari: `Cmd + Shift + N`
   - Firefox: `Cmd + Shift + P`
2. Login ke https://fremio.id
3. Coba upload file > 5MB di `/admin/upload-frame`

## Verifikasi Fix Berhasil
Setelah clear cache, Anda akan lihat di Console log:
```
✅ [UPLOAD] File accepted: namafile.png, Size: 6.02MB
```

Dan **TIDAK ADA** error "File terlalu besar"

## Jika Masih Error
Kirim screenshot console log (F12 → Console tab) saat upload file.
