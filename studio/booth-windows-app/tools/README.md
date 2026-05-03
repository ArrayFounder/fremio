# Bundled Tools untuk Windows Installer

Folder `tools/gphoto2/` berisi `gphoto2.exe` + semua DLL dependency yang dibundle ke dalam installer Fremio Studio Windows.

## SATU LANGKAH: Bundle gphoto2 dari MSYS2

1. Install MSYS2 dari https://www.msys2.org/
2. Buka **MSYS2 UCRT64** terminal
3. Jalankan (satu perintah):
   ```bash
   bash /path/to/studio/booth-windows-app/tools/bundle-gphoto2.sh
   ```

Script otomatis:
- Install gphoto2 via `pacman` (jika belum ada)
- Salin `gphoto2.exe` + SEMUA DLL dependency + camera/port drivers ke `tools/gphoto2/`

## Build Installer

Setelah `tools/gphoto2/` siap:
```bash
cd studio/booth-windows-app
npm install
npm run build
```
Installer `.exe` muncul di `dist/`.

## Hasil untuk User Akhir (Plug & Play)

1. Download installer `.exe`
2. Install → jalankan Fremio Studio
3. **Webcam USB** → terdeteksi otomatis, langsung pakai
4. **Canon DSLR** → terdeteksi otomatis via gphoto2 bundled, trigger shutter dari booth, foto kualitas tinggi
5. **Printer** → terdeteksi otomatis via Windows PnP

> **Catatan:** Driver Canon (libusb) diasumsikan sudah terinstall di PC. Jika belum, install sekali via Zadig (dijelaskan manual terpisah).
