# Canon Capture Algorithm (Current)

Dokumen ini merangkum alur capture Canon yang saat ini dipakai di Fremio Studio agar mudah recovery ketika ada regresi.

## 1) Arsitektur ringkas

- Booth UI memanggil endpoint agent lokal `POST /capture`.
- Agent (`studio/agent/src/server.ts`) mengeksekusi native bridge EDSDK.
- Native bridge (`studio/agent/native/edsdk-bridge/Program.cs`) menangani sesi kamera, event transfer file, validasi JPEG, dan write file hasil capture.

## 2) Alur capture end-to-end

1. UI berhentiin stream preview aktif (jika ada) agar sesi kamera tidak bentrok.
2. UI/agent beri jeda recovery singkat sebelum trigger shutter.
3. Agent memanggil bridge command: `capture --output {tmpFile}`.
4. Bridge:
   - buka sesi kamera,
   - set `SaveTo_Host`,
   - set host capacity,
   - disable EVF sebelum shutter,
   - kirim `TakePicture` dengan retry.
5. Bridge menerima object event (`DirItemRequestTransfer` / `DirItemCreated`) lalu download data ke memory stream.
6. Bridge validasi hasil transfer:
   - cek pointer/size,
   - cek signature JPEG,
   - cek nama file (`.jpg/.jpeg`) bila header ambigu,
   - cek stale timestamp.
7. Jika transfer valid, bridge tulis bytes ke output path.
8. Agent baca file output dan balas ke UI (binary atau JSON base64 tergantung caller).

## 3) Stabilizer anti-intermittent (penting)

### Di native bridge

- Setiap transfer bertipe `DirItemRequestTransfer` selalu di-finalize dengan `EdsDownloadComplete`, termasuk saat transfer di-skip (non-JPEG, stale, atau data kosong), supaya antrian transfer kamera tidak macet.
- Nama file dari kamera dinormalisasi (strip null/control chars) agar log/error tidak menampilkan label file rusak.

### Di agent server

- Retry capture hingga 3x untuk error transient:
  - `Timeout menunggu hasil capture Canon`
  - `Data capture Canon kosong`
  - `Capture Canon menghasilkan ...`
- Retry menggunakan backoff bertahap sebelum fail final.

## 4) Kontrak perilaku mirror (UI)

- Mirror adalah behavior tampilan booth + hasil foto sesi sesuai toggle mirror.
- Live preview bisa dimirror via CSS transform.
- Foto hasil capture yang disimpan ke state sesi harus sudah memiliki orientasi final yang konsisten dengan mirror saat capture.
- Tampilan foto hasil (thumbnail/review) tidak boleh melakukan mirror kedua kali jika datanya sudah dimirror.

## 5) Optimasi Performa Transisi (2024-05-15)

Untuk mempercepat transisi dari live preview ke capture dan recovery setelah capture:

### Di server.ts (Agent)

| Parameter | Lama | Baru | Efek |
|-----------|------|------|------|
| `PREVIEW_RESTART_KILL_GRACE_MS` | 350ms | 150ms | Proses bridge dimatikan lebih cepat |
| `PREVIEW_RESTART_START_DELAY_MS` | 650ms | 150ms | Preview restart lebih cepat |
| `scheduleSharedPreviewStop(delayMs)` | 5000ms | 2000ms | Cleanup preview lebih cepat |
| `stopActivePreviewStreams` timer | 500ms | 300ms | Stream cleanup lebih cepat |
| `stopActivePreviewStreams` kill grace | 350ms | 150ms | Kill process lebih cepat |
| Recovery delay di `/capture` (dengan stream) | 800ms | 300ms | Jeda sebelum capture lebih pendek |
| Recovery delay di `/capture` (tanpa stream) | 500ms | 200ms | Jeda sebelum capture lebih pendek |
| Preview resume delay (finally block) | 120ms | 50ms | Resume preview lebih cepat |
| `getPreviewFrame` timeout (setelah capture) | 2200ms | 1200ms | Timeout lebih pendek |
| `scheduleSharedPreviewStop` (setelah capture) | 3500ms | 2000ms | Cleanup lebih cepat |

### Di CameraScreen.tsx (Frontend UI)

| Parameter | Lama | Baru | Efek |
|-----------|------|------|------|
| `DSLR_PREVIEW_RELEASE_AFTER_CAPTURE_MS` | 600ms | 300ms | Release stream lebih cepat |
| `DSLR_PREVIEW_RESUME_DELAY_MS` | 150ms | 80ms | Resume lebih cepat |
| `DSLR_PREVIEW_ERROR_GRACE_MS` | 1800ms | 1200ms | Grace period lebih pendek |
| sessionStorage release delay | 200ms | 100ms | Stream release lebih cepat |
| `setDslrPreviewPaused(false)` delay | 100ms | 50ms | Unpause lebih cepat |

**Total penghematan waktu transisi: ~1500-2000ms lebih cepat** dari kondisi sebelumnya.

## 6) File referensi utama

- `studio/agent/src/server.ts`
- `studio/agent/native/edsdk-bridge/Program.cs`
- `studio/src/app/(booth)/b/[slug]/screens/CameraScreen.tsx`
- `studio/src/app/(booth)/b/[slug]/BoothClient.tsx`
