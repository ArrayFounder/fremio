"use client";

import Link from "next/link";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id:       number;
  emoji:    string;
  title:    string;
  duration: string;
  content:  React.ReactNode;
  action?:  { label: string; href: string };
}

// ─── Step content components ──────────────────────────────────────────────────

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-gray-100 text-primary-800 text-xs font-mono">
      {children}
    </code>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 leading-relaxed">
      💡 {children}
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-gray-700">
      <span className="mt-0.5 shrink-0 text-green-500 font-bold">✓</span>
      <span>{children}</span>
    </li>
  );
}

function SubStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary-900 text-white text-xs font-bold
                      flex items-center justify-center mt-0.5">{n}</div>
      <div className="flex-1 pb-5 border-b border-gray-100 last:border-0">
        <p className="font-semibold text-gray-800 mb-1">{title}</p>
        <div className="text-sm text-gray-600 space-y-2">{children}</div>
      </div>
    </div>
  );
}

// ─── Steps data ───────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: 1, emoji: "👤", title: "Daftar & Login", duration: "1 menit",
    action: { label: "Buka Pengaturan →", href: "/settings" },
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Akun kamu sudah aktif karena kamu sedang login. Pastikan data bisnis sudah lengkap.</p>
        <div className="space-y-3">
          <SubStep n={1} title="Lengkapi Profil Bisnis">
            <p>Buka <Link href="/settings" className="text-primary-700 underline">Pengaturan</Link> → isi <strong>Nama Bisnis</strong> dengan nama usaha fotobox kamu.</p>
            <p>Nama ini akan muncul di halaman download foto customer.</p>
          </SubStep>
          <SubStep n={2} title="Ganti Password (opsional)">
            <p>Di halaman Pengaturan → bagian <strong>Keamanan</strong> → ganti password bawaan menjadi yang lebih mudah diingat.</p>
          </SubStep>
        </div>
        <ul className="space-y-1.5"><Check>Profil bisnis sudah terisi</Check><Check>Password sudah diganti</Check></ul>
      </div>
    ),
  },
  {
    id: 2, emoji: "💳", title: "Setup Payment Gateway (Midtrans)", duration: "30 menit – 3 hari kerja",
    action: { label: "Atur Payment →", href: "/settings" },
    content: (
      <div className="space-y-4">
        <Note>
          Lewati langkah ini jika ingin coba dulu tanpa payment — booth tetap bisa jalan dalam mode
          &ldquo;uji coba&rdquo; menggunakan Midtrans Sandbox milik Fremio.
        </Note>
        <div className="space-y-3">
          <SubStep n={1} title="Daftar akun Midtrans">
            <p>Buka <a href="https://dashboard.midtrans.com/register" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">dashboard.midtrans.com/register</a></p>
            <ul className="list-disc list-inside space-y-0.5 text-gray-600">
              <li>Isi nama bisnis, email, nomor HP</li>
              <li>Upload KTP + foto selfie + info rekening bank</li>
              <li>Tunggu review: biasanya <strong>1–3 hari kerja</strong></li>
            </ul>
          </SubStep>
          <SubStep n={2} title="Ambil Server Key & Client Key">
            <p>Setelah approved, login ke <a href="https://dashboard.midtrans.com" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline font-medium">dashboard.midtrans.com</a></p>
            <p>Klik <strong>Settings → Access Keys</strong></p>
            <p>Salin <Code>Server Key</Code> dan <Code>Client Key</Code> (pilih <strong>Production</strong> untuk live, <strong>Sandbox</strong> untuk testing).</p>
          </SubStep>
          <SubStep n={3} title="Input Key di Fremio Studio">
            <p>Buka <Link href="/settings" className="text-primary-700 underline">Pengaturan</Link> → bagian <strong>Payment Gateway</strong></p>
            <p>Paste Server Key dan Client Key → klik <strong>Simpan Keys</strong></p>
            <p>Status akan berubah jadi <span className="text-green-700 font-medium">✅ Menggunakan Midtrans Anda</span> — artinya pembayaran customer langsung masuk ke rekening kamu.</p>
          </SubStep>
        </div>
        <ul className="space-y-1.5">
          <Check>Akun Midtrans sudah approved</Check>
          <Check>Server Key + Client Key sudah diinput di Pengaturan</Check>
          <Check>Status menunjukkan &ldquo;Menggunakan Midtrans Anda&rdquo;</Check>
        </ul>
      </div>
    ),
  },
  {
    id: 3, emoji: "🖼️", title: "Import atau Buat Frame", duration: "5 menit",
    action: { label: "Kelola Frame →", href: "/frames" },
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Frame adalah overlay foto yang jadi produk booth kamu. Ada dua cara mendapatkan frame:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-primary-200 bg-primary-50 p-4 space-y-2">
            <p className="font-bold text-primary-900">🌐 Import dari Fremio.id</p>
            <p className="text-xs text-gray-600">Ribuan frame dari desainer Indonesia. Buka <Link href="/frames" className="text-primary-700 underline">Frame</Link> → klik <strong>Import dari Fremio.id</strong>.</p>
          </div>
          <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 space-y-2">
            <p className="font-bold text-gray-800">✏️ Buat Sendiri</p>
            <p className="text-xs text-gray-600">Upload frame PNG transparan buatan sendiri. Buka <Link href="/frames" className="text-primary-700 underline">Frame</Link> → klik <strong>Buat Frame Sendiri</strong>.</p>
          </div>
        </div>
        <div className="space-y-3">
          <SubStep n={1} title="Import dari Fremio.id (cara tercepat)">
            <p>Buka <Link href="/frames" className="text-primary-700 underline">Frame</Link> → klik <strong>🌐 Import dari Fremio.id</strong></p>
            <p>Pilih frame yang kamu mau → klik <strong>Import</strong></p>
            <p>Frame otomatis tersimpan beserta posisi slot foto (area foto dalam frame).</p>
          </SubStep>
          <SubStep n={2} title="Pastikan frame aktif">
            <p>Setelah import, frame akan muncul di daftar. Pastikan statusnya <span className="text-green-600 font-medium">Aktif</span>.</p>
          </SubStep>
        </div>
        <ul className="space-y-1.5"><Check>Minimal 1 frame sudah diimport/dibuat</Check><Check>Frame terlihat di halaman Frame</Check></ul>
      </div>
    ),
  },
  {
    id: 4, emoji: "📷", title: "Buat & Konfigurasi Booth", duration: "5 menit",
    action: { label: "Kelola Booth →", href: "/booths" },
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Booth adalah &ldquo;mesin&rdquo; fotobox kamu — setiap booth punya URL unik yang dibuka di browser.</p>
        <div className="space-y-3">
          <SubStep n={1} title="Buat Booth Baru">
            <p>Buka <Link href="/booths" className="text-primary-700 underline">Booth</Link> → klik <strong>+ Tambah Booth</strong></p>
            <p>Isi nama booth, harga per sesi (dalam Rupiah), dan durasi sesi (detik).</p>
          </SubStep>
          <SubStep n={2} title="Atur warna dan tampilan">
            <p>Set <strong>Warna Utama</strong> (background booth) dan <strong>Warna Aksen</strong> (tombol).</p>
            <p>Bisa upload logo bisnis kamu untuk muncul di layar booth.</p>
          </SubStep>
          <SubStep n={3} title="Pilih frame yang tersedia">
            <p>Di pengaturan booth, pilih frame mana yang boleh dipilih customer. Kosongkan = semua frame aktif tersedia.</p>
          </SubStep>
          <SubStep n={4} title="Catat URL booth">
            <p>Setelah disimpan, booth punya URL format: <Code>studio.fremio.id/b/[slug-kamu]</Code></p>
            <p>URL ini yang dibuka di browser mesin fotobox kamu.</p>
          </SubStep>
        </div>
        <ul className="space-y-1.5">
          <Check>Booth sudah dibuat dengan harga yang sesuai</Check>
          <Check>Warna dan logo sudah diset</Check>
          <Check>URL booth sudah dicatat</Check>
        </ul>
      </div>
    ),
  },
  {
    id: 5, emoji: "🖥️", title: "Setup Mesin Booth", duration: "10 menit",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Booth berjalan 100% di browser — tidak ada software yang diinstall. Tapi ada beberapa hal yang perlu diset sekali.</p>
        <div className="space-y-3">
          <SubStep n={1} title="Buka Google Chrome">
            <p>Download <a href="https://www.google.com/chrome" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">Google Chrome</a> jika belum ada.</p>
            <Note>Gunakan Chrome agar izin kamera disimpan permanen. Safari meminta izin setiap sesi.</Note>
          </SubStep>
          <SubStep n={2} title="Buka URL booth di Chrome">
            <p>Ketik URL booth kamu: <Code>studio.fremio.id/b/[slug-kamu]</Code></p>
            <p>Chrome akan meminta izin kamera — klik <strong>Izinkan</strong>. Ini <strong>hanya ditanya sekali</strong>, setelah itu disimpan permanen.</p>
          </SubStep>
          <SubStep n={3} title="Pilih kamera yang tepat">
            <p>Di layar foto, klik ikon <Code>🎥</Code> di kanan atas viewfinder untuk memilih kamera.</p>
            <p>Jika menggunakan DSLR (Canon, Nikon, Sony, dll), install software webcam dari manufacturer dulu:</p>
            <ul className="list-disc list-inside text-gray-600 space-y-0.5">
              <li><a href="https://www.usa.canon.com/support/consumer/software" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">Canon EOS Webcam Utility</a></li>
              <li><a href="https://downloadcenter.nikonimglib.com" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">Nikon Webcam Utility</a></li>
              <li><a href="https://www.sony.com/en/articles/imaging-edge-webcam" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">Sony Imaging Edge Webcam</a></li>
              <li>Atau gunakan <a href="https://obsproject.com/kb/virtual-camera-guide" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">OBS Virtual Camera</a> (semua merek)</li>
            </ul>
            <p>Setelah software berjalan, kamera DSLR akan muncul sebagai pilihan di dropdown kamera.</p>
          </SubStep>
          <SubStep n={4} title="Set Mirror (opsional)">
            <p>Klik <Code>⟷</Code> di kanan atas viewfinder untuk toggle mirror.</p>
            <p>Aktifkan untuk selfie (kamera depan). Nonaktifkan untuk DSLR yang sudah benar orientasinya.</p>
          </SubStep>
          <SubStep n={5} title="Mode Kiosk Chrome (opsional, untuk booth permanen)">
            <p>Agar browser fullscreen tanpa address bar, buka Chrome dengan flag:</p>
            <div className="rounded-lg bg-gray-900 text-green-400 text-xs font-mono p-3 leading-relaxed space-y-1">
              <p className="text-gray-500"># Windows:</p>
              <p>chrome.exe --kiosk &quot;https://studio.fremio.id/b/[slug]&quot;</p>
              <p className="text-gray-500 mt-2"># macOS:</p>
              <p>/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk &quot;https://studio.fremio.id/b/[slug]&quot;</p>
            </div>
          </SubStep>
        </div>
        <ul className="space-y-1.5">
          <Check>Chrome terinstall di mesin booth</Check>
          <Check>Izin kamera sudah diberikan</Check>
          <Check>Kamera yang tepat sudah dipilih</Check>
          <Check>Tampilan normal dan tidak terbalik</Check>
        </ul>
      </div>
    ),
  },
  {
    id: 6, emoji: "🖨️", title: "Setup Printer (opsional)", duration: "5–15 menit",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Cetak foto langsung dari booth — ada dua mode tergantung kebutuhan:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-4 space-y-1">
            <p className="font-bold text-sm">Mode Simple (tanpa install)</p>
            <p className="text-xs text-gray-500">Klik tombol Cetak di layar delivery → dialog print Chrome muncul → pilih printer → cetak. Bekerja dengan semua printer apapun.</p>
          </div>
          <div className="rounded-2xl border-2 border-primary-200 bg-primary-50 p-4 space-y-1">
            <p className="font-bold text-sm text-primary-900">Mode Silent (Local Agent)</p>
            <p className="text-xs text-gray-600">Cetak otomatis tanpa dialog. Butuh Local Agent yang jalan di background.</p>
          </div>
        </div>
        <div className="space-y-3">
          <SubStep n={1} title="Pastikan printer sudah terpasang di OS">
            <p>Windows: Pengaturan → Bluetooth & perangkat → Printer dan pemindai → Tambahkan printer</p>
            <p>macOS: System Settings → Printers & Scanners → klik + untuk tambah printer</p>
            <p>Lakukan test print dari OS terlebih dahulu sebelum dari booth.</p>
          </SubStep>
          <SubStep n={2} title="Jalankan Local Agent (untuk silent print)">
            <p>Download Local Agent dari halaman <Link href="/settings" className="text-primary-700 underline">Pengaturan</Link> (akan tersedia segera).</p>
            <p>Atau jalankan manual (butuh Node.js ≥ 18):</p>
            <div className="rounded-lg bg-gray-900 text-green-400 text-xs font-mono p-3 space-y-1">
              <p className="text-gray-500"># Di folder studio/agent:</p>
              <p>npm install</p>
              <p>npm run dev</p>
            </div>
            <p>Agent berjalan di <Code>localhost:3002</Code>. Booth UI akan otomatis mendeteksinya.</p>
          </SubStep>
          <SubStep n={3} title="Test cetak dari booth">
            <p>Lakukan sesi foto sampai selesai → di layar Selesai, klik tombol <strong>🖨️ Cetak Foto</strong>.</p>
            <p>Jika agent aktif: cetak langsung tanpa dialog.</p>
            <p>Jika tidak ada agent: dialog print Chrome terbuka → pilih printer yang sesuai.</p>
          </SubStep>
        </div>
        <ul className="space-y-1.5">
          <Check>Printer sudah terdeteksi di OS</Check>
          <Check>Test print dari OS berhasil</Check>
          <Check>Tombol Cetak Foto muncul di layar delivery booth</Check>
        </ul>
      </div>
    ),
  },
  {
    id: 7, emoji: "🧪", title: "Test End-to-End", duration: "5 menit",
    action: { label: "Buka Booth →", href: "/booths" },
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Sebelum dipakai customer, lakukan full test dari awal sampai akhir.</p>
        <div className="space-y-3">
          <SubStep n={1} title="Buka booth URL di Chrome">
            <p>Buka <Code>studio.fremio.id/b/[slug]</Code> di Chrome mesin booth.</p>
          </SubStep>
          <SubStep n={2} title="Test alur lengkap">
            <ul className="list-none space-y-1 text-gray-600">
              <li>✦ Layar IDLE muncul dengan harga dan tombol mulai</li>
              <li>✦ Scan QR Midtrans (gunakan nominal kecil untuk test, atau skip jika Sandbox)</li>
              <li>✦ Setelah bayar → pilih frame</li>
              <li>✦ Ambil beberapa foto → review tiap foto</li>
              <li>✦ Preview hasil composite foto + frame</li>
              <li>✦ Simpan → QR download muncul</li>
              <li>✦ Scan QR dengan HP → halaman download terbuka</li>
              <li>✦ Download foto berhasil</li>
            </ul>
          </SubStep>
          <SubStep n={3} title="Cek dashboard">
            <p>Buka <Link href="/sessions" className="text-primary-700 underline">Transaksi</Link> → sesi dan transaksi test harus muncul di sini.</p>
          </SubStep>
        </div>
        <Note>Gunakan Midtrans Sandbox untuk test tanpa bayar sungguhan. Ganti ke Production setelah semuanya oke.</Note>
        <ul className="space-y-1.5">
          <Check>Alur lengkap berhasil tanpa error</Check>
          <Check>Foto hasil composite terlihat bagus</Check>
          <Check>QR download berfungsi di HP</Check>
          <Check>Transaksi muncul di dashboard</Check>
        </ul>
      </div>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const [activeStep, setActiveStep] = useState<number | null>(1);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panduan Setup</h1>
        <p className="text-gray-400 text-sm mt-1">Ikuti langkah-langkah ini untuk mulai menggunakan Fremio Studio</p>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Progress Setup</span>
          <span className="text-xs text-gray-400">{STEPS.length} langkah total</span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveStep(activeStep === s.id ? null : s.id)}
              title={s.title}
              className="h-2 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: activeStep && activeStep >= s.id ? "#4a302b" : "#e5d5d0" }}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">Klik langkah di bawah untuk lihat detail</p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const isOpen = activeStep === step.id;
          return (
            <div
              key={step.id}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            >
              {/* Step header */}
              <button
                onClick={() => setActiveStep(isOpen ? null : step.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-xl">
                  {step.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary-400 uppercase tracking-widest">
                      Langkah {step.id}
                    </span>
                    <span className="text-xs text-gray-400">· {step.duration}</span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">{step.title}</p>
                </div>
                <svg
                  className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Step body */}
              {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-50">
                  <div className="pt-4">{step.content}</div>
                  {step.action && (
                    <div className="pt-1">
                      <Link
                        href={step.action.href}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 transition-colors"
                      >
                        {step.action.label}
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Done banner */}
      <div className="bg-primary-900 rounded-2xl p-6 text-white text-center">
        <p className="text-2xl mb-2">🎉</p>
        <h3 className="font-bold text-lg">Selesai! Booth siap digunakan</h3>
        <p className="text-white/60 text-sm mt-1 mb-4">
          Butuh bantuan? Hubungi kami di{" "}
          <a href="mailto:hello@fremio.id" className="underline text-white/80">hello@fremio.id</a>
        </p>
        <Link
          href="/booths"
          className="inline-block px-6 py-2.5 rounded-xl font-bold text-primary-900"
          style={{ backgroundColor: "#d4a017" }}
        >
          Buka Daftar Booth →
        </Link>
      </div>
    </div>
  );
}
