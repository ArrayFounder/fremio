"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "windows" | "mac";

interface MacVariant {
  id:    string;
  label: string;
  chip:  string;
  file:  string;
  cmds:  string[];
}

const MAC_VARIANTS: MacVariant[] = [
  {
    id:    "mac-arm",
    label: "Apple Silicon",
    chip:  "M1 / M2 / M3 / M4 — Mac 2020 ke atas",
    file:  "fremio-agent-mac-arm64",
    cmds: [
      "cd ~/Downloads",
      "xattr -d com.apple.quarantine fremio-agent-mac-arm64",
      "chmod +x fremio-agent-mac-arm64",
      "mkdir -p ~/Library/Application\\ Support/Fremio && mv fremio-agent-mac-arm64 ~/Library/Application\\ Support/Fremio/",
      "~/Library/Application\\ Support/Fremio/fremio-agent-mac-arm64",
    ],
  },
  {
    id:    "mac-intel",
    label: "Intel",
    chip:  "Intel Core — Mac sebelum 2020",
    file:  "fremio-agent-mac-x64",
    cmds: [
      "cd ~/Downloads",
      "xattr -d com.apple.quarantine fremio-agent-mac-x64",
      "chmod +x fremio-agent-mac-x64",
      "mkdir -p ~/Library/Application\\ Support/Fremio && mv fremio-agent-mac-x64 ~/Library/Application\\ Support/Fremio/",
      "~/Library/Application\\ Support/Fremio/fremio-agent-mac-x64",
    ],
  },
];

const WIN_STEPS = [
  { icon: "⬇️", title: "Download installer Windows", desc: "Install sekali saja. Aplikasi ini otomatis membuka booth dan menyalakan bridge lokal di background." },
  { icon: "▶️", title: "Buka Fremio Studio", desc: "Setelah install, buka app seperti biasa. Setup screen akan memberi tahu apakah kamera dan printer sudah siap." },
  { icon: "📷", title: "Hubungkan kamera Canon via USB", desc: "Kalau kamera belum terbaca, biarkan app tetap terbuka lalu klik Cek lagi. Tidak perlu buka folder agent atau CMD manual." },
  { icon: "🌐", title: "Mulai booth", desc: "Kalau status sudah siap, simpan slug booth lalu mulai sesi foto langsung dari app." },
];

const WINDOWS_SETUP_FILE = "fremio-booth-windows-setup-v1.0.30.exe";

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [tab, setTab]               = useState<TabId>("windows");
  const [macVariant, setMacVariant] = useState<string>("mac-arm");
  const [copied, setCopied]         = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const activeMac = MAC_VARIANTS.find(v => v.id === macVariant) ?? MAC_VARIANTS[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
        <Link href="/booths" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Kembali ke Booth
        </Link>

        {/* ── Hero card ──────────────────────────────────────────────────── */}
        <div className="rounded-3xl overflow-hidden shadow-sm"
          style={{ background: "linear-gradient(135deg, #1a0f0a 0%, #2d1810 60%, #3d2215 100%)" }}>
          <div className="px-7 pt-7 pb-6 flex items-start gap-5">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
              <Image src="/fremio_studio.png" alt="Fremio Studio" width={90} height={32} className="w-20 h-auto brightness-0 invert opacity-90" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-white">Fremio Studio</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-white/10 text-white/70 border border-white/10">
                  v1.0.30
                </span>
              </div>
              <p className="text-sm text-white/60 mt-1 leading-relaxed">
                Hardware bridge ringan untuk menghubungkan kamera DSLR &amp; printer ke booth — berjalan lokal di mesin photobox.
              </p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="px-7 pb-7 flex flex-wrap gap-2">
            {[
              { icon: "📷", label: "Kamera DSLR / Mirrorless" },
              { icon: "🖨️", label: "Silent Print" },
              { icon: "⚡", label: "Auto-start" },
              { icon: "🔒", label: "Berjalan lokal" },
            ].map(f => (
              <span key={f.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/8 text-white/70 border border-white/10">
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Perlu bridge? ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Apakah kamu perlu Fremio Studio bridge?</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Tanpa Bridge</p>
              {["Webcam built-in laptop", "Kamera USB standar (UVC)", "Print via dialog browser", "Setup instan — 0 instalasi"].map(t => (
                <div key={t} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-green-500 font-bold text-xs">✓</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Dengan Bridge</p>
              {["Kamera DSLR / mirrorless via USB", "Canon, Nikon, Sony, Fujifilm", "Silent print tanpa dialog", "Pilih printer spesifik per booth"].map(t => (
                <div key={t} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#c28a7a] font-bold text-xs">+</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Platform tabs ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">

          {/* Tab switcher */}
          <div className="flex border-b border-gray-100">
            {([
              { id: "windows", label: "Windows", icon: "🪟", note: "Direkomendasikan" },
              { id: "mac",     label: "macOS",   icon: "🍎", note: ""                },
            ] as { id: TabId; label: string; icon: string; note: string }[]).map(t => (
              <button key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition-colors",
                  tab === t.id
                    ? "border-b-2 text-gray-900"
                    : "text-gray-400 hover:text-gray-600",
                ].join(" ")}
                style={tab === t.id ? { borderBottomColor: "#c28a7a" } : {}}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {t.note && (
                  <span className="hidden sm:inline px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-100">
                    {t.note}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Windows content ──────────────────────────────────────────── */}
          {tab === "windows" && (
            <div className="p-5 space-y-5">
              {/* Download button */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Fremio Studio — Windows <span className="text-xs font-normal text-gray-400">v1.0.30</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">Windows 10 / 11 · 64-bit · Installer one-click · Includes Canon USB fix</p>
                </div>
                <a
                  href={`/downloads/${WINDOWS_SETUP_FILE}`}
                  download={WINDOWS_SETUP_FILE}
                  className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #c28a7a, #a8705e)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>
              </div>

              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <div>
                  <p className="font-semibold text-amber-900 text-sm">Agent Windows Bundle (Canon EDSDK)</p>
                  <p className="text-xs text-amber-700 mt-0.5">Jika launcher installer belum mendeteksi Canon, gunakan bundle ini (sudah termasuk bridge + EDSDK DLL).</p>
                </div>
                <a
                  href="/downloads/fremio-agent-win-bundle.zip"
                  download="fremio-agent-win-bundle.zip"
                  className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #d97706, #b45309)" }}
                >
                  Download Bundle
                </a>
              </div>

              {/* Step-by-step */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Langkah instalasi</p>
                {WIN_STEPS.map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-base"
                      style={{ background: "#fdf4f2" }}>
                      {s.icon}
                    </div>
                    <div className="pt-0.5">
                      <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* SmartScreen note */}
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 flex gap-3">
                <span className="text-lg shrink-0">💡</span>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-amber-800">Muncul peringatan "Windows protected your PC"?</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Klik <strong>More info</strong> → <strong>Run anyway</strong>.
                    Ini muncul karena aplikasi baru, bukan karena berbahaya.
                    Fremio Studio adalah software resmi dari Fremio.id.
                  </p>
                </div>
              </div>

              {/* Auto-start tip */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex gap-3">
                <span className="text-lg shrink-0">⚡</span>
                <div>
                  <p className="text-xs font-semibold text-blue-800">Installer Windows sudah menyalakan bridge secara otomatis</p>
                  <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                    Operator cukup install lalu buka app. Dari setup screen, app akan mengecek bridge lokal,
                    kamera DSLR, dan printer secara otomatis.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 flex gap-3">
                <span className="text-lg shrink-0">📷</span>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-rose-800">Canon di Windows — sudah diperbaiki di v1.0.30</p>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Error <code className="font-mono bg-rose-100 px-0.5 rounded">ECONNRESET</code> dan <code className="font-mono bg-rose-100 px-0.5 rounded">0x000000C0</code> saat capture foto Canon sudah diperbaiki.
                    Pastikan kamu menggunakan installer v1.0.30 di atas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── macOS content ─────────────────────────────────────────────── */}
          {tab === "mac" && (
            <div className="p-5 space-y-5">
              {/* Chip selector */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Jenis chip Mac kamu</p>
                <div className="grid grid-cols-2 gap-2">
                  {MAC_VARIANTS.map(v => (
                    <button key={v.id}
                      onClick={() => setMacVariant(v.id)}
                      className={[
                        "px-4 py-3 rounded-xl text-left transition-all border text-sm",
                        macVariant === v.id
                          ? "border-[#c28a7a] bg-[#fdf4f2]"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      ].join(" ")}>
                      <p className={`font-semibold ${macVariant === v.id ? "text-[#a8705e]" : "text-gray-800"}`}>
                        {v.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{v.chip}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Tidak tahu chip apa?  → menu Apple () → <strong>About This Mac</strong> → lihat kolom Chip atau Processor.
                </p>
              </div>

              {/* Download button */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Fremio Studio — macOS {activeMac.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">macOS 12 Monterey ke atas · ~8 MB</p>
                </div>
                <a
                  href={`/downloads/${activeMac.file}`}
                  download={activeMac.file}
                  className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #c28a7a, #a8705e)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>
              </div>

              {/* Simple steps */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Langkah menjalankan</p>
                {[
                  { icon: "⬇️", title: "Download file di atas", desc: "File akan masuk ke folder Downloads." },
                  { icon: "⌨️", title: "Buka Terminal", desc: "Tekan Cmd + Space, ketik Terminal, lalu Enter." },
                  { icon: "▶️", title: "Jalankan perintah di bawah", desc: "Salin semua command lalu paste ke Terminal untuk menjalankan Fremio Studio bridge." },
                  { icon: "✅", title: "Booth siap", desc: "Buka halaman setup booth — kamera & printer terdeteksi otomatis." },
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-base"
                      style={{ background: "#fdf4f2" }}>
                      {s.icon}
                    </div>
                    <div className="pt-0.5">
                      <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex gap-3">
                <span className="text-lg shrink-0">🍎</span>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-blue-800">Kalau sempat muncul popup "Not Opened"</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Abaikan jalur klik biasa. Tutup popup itu, lalu jalankan Fremio Studio bridge lewat Terminal menggunakan command di bawah.
                  </p>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-gray-800">
                <div className="flex items-center justify-between bg-gray-900 px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500/70" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                    <span className="w-3 h-3 rounded-full bg-green-500/70" />
                  </div>
                  <button
                    onClick={() => copyToClipboard(activeMac.cmds.join("\n"), "mac-cmds")}
                    className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {copied === "mac-cmds"
                      ? <span className="text-green-400 font-semibold">✓ Disalin</span>
                      : <><span>⎘</span><span>Salin semua</span></>
                    }
                  </button>
                </div>
                <div className="bg-gray-950 px-4 py-3 font-mono text-xs text-green-400 space-y-1">
                  {activeMac.cmds.map((cmd, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="select-none text-gray-600 shrink-0 mt-0.5">$</span>
                      <span className="break-all">{cmd}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {[
            {
              q: "Apakah Fremio Studio bridge menyimpan foto saya?",
              a: "Tidak. Fremio Studio bridge hanya menjadi jembatan antara hardware (kamera/printer) dan browser. Tidak ada foto yang dikirim ke server Fremio melalui bridge ini.",
            },
            {
              q: "Apakah perlu update bridge saat ada fitur baru?",
              a: "Hampir tidak pernah. Fitur baru Fremio Studio langsung tersedia di browser tanpa update apapun. Bridge hanya diupdate jika ada perubahan pada integrasi hardware (jarang, biasanya 1-2x per tahun).",
            },
            {
              q: "Bridge crash — apa yang harus dilakukan?",
              a: "Jalankan ulang Fremio Studio Launcher lalu klik tombol Mulai. Booth tetap bisa dipakai webcam biasa selama bridge tidak aktif.",
            },
          ].map((item, i) => (
            <details key={i} className="group px-5 py-4 cursor-pointer">
              <summary className="flex items-center justify-between gap-4 text-sm font-semibold text-gray-800 list-none">
                {item.q}
                <svg className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-3 text-sm text-gray-500 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-xs text-gray-300 text-center">Fremio Studio v1.0.30 · fremio.id</p>
      </div>
    </div>
  );
}
