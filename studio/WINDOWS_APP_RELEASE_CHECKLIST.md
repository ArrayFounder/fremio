# Windows App Release Checklist

Checklist ini untuk memastikan file download di `https://studio.fremio.id/application` selalu valid.

## 1) Build aplikasi Windows

Dijalankan di mesin Windows:

1. Masuk ke folder `studio/booth-windows-app`
2. Install dependency jika perlu: `npm install`
3. Build installer + zip: `npm run build`

Output yang diharapkan di `studio/booth-windows-app/dist`:

1. File installer `.exe` (NSIS)
2. File portable `.zip`

## 2) Sinkronkan ke folder download publik

Dijalankan di root `studio`:

1. `npm run app:sync-downloads`

Script akan menyalin artefak terbaru menjadi nama standar:

1. `public/downloads/fremio-booth-windows-setup.exe`
2. `public/downloads/fremio-booth-windows-portable.zip`

## 3) Verifikasi lokal

1. Buka dashboard `/application`
2. Klik kedua tombol download
3. Pastikan file yang terunduh sesuai nama standar

## 4) Deploy

1. Deploy frontend studio ke production
2. Re-check URL production:
   - `/application`
   - `/downloads/fremio-booth-windows-setup.exe`
   - `/downloads/fremio-booth-windows-portable.zip`

## 5) Rollback cepat (jika perlu)

1. Kembalikan file lama di `public/downloads`
2. Deploy ulang frontend
