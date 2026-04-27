# Download Files for /application

Folder ini digunakan oleh halaman dashboard `/application`.

Wajib ada 2 file berikut agar tombol download tidak 404:

1. `fremio-booth-windows-setup.exe`
2. `fremio-booth-windows-portable.zip`

## Cara update file

1. Build app Windows di folder `studio/booth-windows-app`:
   - `npm run build`
2. Kembali ke root `studio` dan sinkronkan artefak:
   - `npm run app:sync-downloads`
3. Deploy frontend seperti biasa.

Jika script sinkronisasi gagal, berarti artefak `.exe` atau `.zip` belum tersedia di `booth-windows-app/dist`.
