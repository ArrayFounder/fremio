# DEPLOY STUDIO - SOP UNTUK AI AGENT

Dokumen ini menjelaskan alur deploy aplikasi Studio (Next.js) yang dipakai di repo ini.
Tujuan: agent lain bisa mengikuti proses deploy dengan hasil yang konsisten.

## 1) Prasyarat

- Akses workspace lokal repo ini.
- Akses SSH ke server production.
- Script deploy tersedia di repo:
  - deploy-studio.sh

## 2) Lokasi kerja

Jalankan semua command dari root repo:

- /Users/salwa/Documents/fremio copy

## 3) Command deploy utama

```bash
cd /Users/salwa/Documents/fremio\ copy
bash deploy-studio.sh
```

## 4) Apa yang dilakukan script deploy-studio.sh

Urutan proses:

1. Build aplikasi Studio (Next.js) di lokal.
2. Upload/sync project ke server VPS (path target: /root/fremio-studio) via rsync.
3. Install dependency production di server.
4. Restart process PM2 untuk service fremio-studio.
5. Simpan state PM2.

## 5) Aturan penting environment (WAJIB)

Agar secret production tidak ketimpa saat deploy, file env server harus tetap dipertahankan.
Script deploy sudah disetel untuk mengecualikan:

- .env.production
- .env.local
- .env.production.local

Jangan ubah perilaku ini tanpa alasan kuat.

## 6) Checklist validasi setelah deploy

Deploy dianggap berhasil jika:

1. Output script berakhir dengan indikasi deployment complete.
2. PM2 menampilkan service fremio-studio status online.
3. Route utama merespons normal:
   - https://studio.fremio.id/booths
   - https://studio.fremio.id/b/[slug]
4. Endpoint publik booth sehat (contoh):
   - GET https://studio.fremio.id/api/booth/<slug> -> HTTP 200 dan success=true.

## 7) Jika build gagal

- Jangan lanjut ke restart manual sebelum perbaikan source.
- Baca error TypeScript/syntax dari output build.
- Perbaiki file terkait.
- Jalankan lagi:

```bash
bash deploy-studio.sh
```

Ulangi sampai build lulus dan service online.

## 8) Pola kerja yang direkomendasikan untuk agent

Untuk setiap perubahan kode:

1. Edit source.
2. Cek error file yang diubah.
3. Deploy via deploy-studio.sh.
4. Verifikasi route/UI yang terdampak.
5. Jika belum sesuai, patch lalu deploy ulang.

## 9) Catatan keamanan

- Jangan hardcode secret di source code.
- Jangan menimpa env production dari lokal.
- Jangan gunakan destructive command (misalnya reset hard) saat deploy rutin.

## 10) Ringkasan cepat

```bash
cd /Users/salwa/Documents/fremio\ copy && bash deploy-studio.sh
```

Lalu verifikasi:

- https://studio.fremio.id/booths
- https://studio.fremio.id/b/[slug]
