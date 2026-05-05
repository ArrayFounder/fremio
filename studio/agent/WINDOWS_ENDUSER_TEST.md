# Canon EDSDK Windows End-User Flow

Target akhir: user Windows cukup **download + install + colok kamera Canon**.

## A. Yang disiapkan tim dev (sekali per rilis)

1. Pastikan native bridge sudah ada:
   - `studio/agent/bin/edsdk-bridge-native.exe`
2. Pastikan Canon DLL tersedia untuk runtime:
   - `studio/agent/bin/EDSDK.dll`
3. Build agent Windows:
   - dari `studio/agent`: `npm run build && npm run pkg:win`
4. Build launcher Windows (installer):
   - dari `studio/booth-windows-app`: `npm run build`
5. Sync artifact ke `studio/public/downloads` lalu deploy.

## B. Yang dilakukan user Windows

1. Download installer `Fremio Studio-Setup-*.exe` dari halaman agent.
2. Install, lalu buka aplikasi `Fremio Studio`.
3. Nyalakan Canon, set mode foto, colok USB ke PC.
4. Buka Booth Setup di Studio, pilih kamera Canon yang muncul.
5. Live view tampil dan tombol capture memicu shutter Canon.

## C. Acceptance check

- `/status` mengembalikan:
  - `camera.backend = "edsdk"`
  - kamera Canon muncul di `camera.devices`
- `/preview` mengembalikan JPEG frame Canon.
- `/capture` menghasilkan foto dari Canon.
