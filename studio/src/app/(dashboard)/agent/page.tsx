"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Platform {
  id:       string;
  label:    string;
  icon:     string;
  file:     string;
  tip:      string;
  terminalCmds?: string[];   // Mac: shown as copyable code block
  steps?:   string[];        // Windows: shown as numbered steps
}

const PLATFORMS: Platform[] = [
  {
    id:    "mac-arm",
    label: "macOS (Apple Silicon)",
    icon:  "🍎",
    file:  "fremio-agent-mac-arm64",
    tip:   "Untuk Mac dengan chip M1/M2/M3/M4 (2020 ke atas)",
    terminalCmds: [
      "cd ~/Downloads",
      "xattr -d com.apple.quarantine fremio-agent-mac-arm64",
      "chmod +x fremio-agent-mac-arm64",
      "mkdir -p ~/Documents/fremio/studio/agent && mv fremio-agent-mac-arm64 ~/Documents/fremio/studio/agent/",
      "~/Documents/fremio/studio/agent/fremio-agent-mac-arm64",
    ],
  },
  {
    id:    "mac-intel",
    label: "macOS (Intel)",
    icon:  "🍎",
    file:  "fremio-agent-mac-x64",
    tip:   "Untuk Mac lama dengan chip Intel (sebelum 2020)",
    terminalCmds: [
      "cd ~/Downloads",
      "xattr -d com.apple.quarantine fremio-agent-mac-x64",
      "chmod +x fremio-agent-mac-x64",
      "mkdir -p ~/Documents/fremio/studio/agent && mv fremio-agent-mac-x64 ~/Documents/fremio/studio/agent/",
      "~/Documents/fremio/studio/agent/fremio-agent-mac-x64",
    ],
  },
  {
    id:    "windows",
    label: "Windows",
    icon:  "🪟",
    file:  "fremio-agent-win.exe",
    tip:   "Untuk Windows 10 / 11 (64-bit)",
    steps: [
      "Klik kanan fremio-agent-win.exe → Run as administrator",
      "Jika Windows Defender memblokir: klik More info → Run anyway",
      "Jendela Command Prompt akan terbuka — biarkan tetap terbuka",
      "Restart browser, lalu klik Coba Lagi di halaman setup booth",
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyCmd = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <Link href="/booths" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">
          ← Kembali ke Booth
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Download Fremio Local Agent</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Agent ringan yang berjalan di komputer booth untuk menghubungkan kamera eksternal &amp; printer ke browser — tanpa instalasi Node.js.
        </p>
      </div>

      {/* Info box */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">✅ Tanpa agent pun booth tetap bisa dipakai:</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Kamera laptop/PC bawaan → langsung terdeteksi browser</li>
          <li>Cetak foto → dialog print Chrome muncul otomatis di akhir sesi</li>
        </ul>
        <p className="font-semibold mt-2">Agent dibutuhkan untuk:</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Kamera DSLR / mirrorless via USB (sebagai webcam virtual)</li>
          <li>Cetak <em>silent</em> tanpa dialog — langsung ke printer pilihan</li>
          <li>Multiple printer — pilih printer spesifik per booth</li>
        </ul>
      </div>

      {/* Not supported note */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">📱 Android &amp; iPad tidak didukung untuk agent</p>
        <p className="mt-1 text-amber-700">
          Perangkat mobile tidak memiliki akses ke printer sistem dan driver kamera USB.
          Gunakan laptop/PC (Mac atau Windows) sebagai komputer booth utama.
          Android/iPad bisa dipakai sebagai <em>layar tambahan</em> atau untuk scan QR saat mengunduh foto.
        </p>
      </div>

      {/* Download cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Pilih Platform</h2>

        {PLATFORMS.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.icon}</span>
                  <h3 className="font-semibold text-gray-900">{p.label}</h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{p.tip}</p>
              </div>
              <a
                href={`/downloads/${p.file}`}
                download={p.file}
                className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: "#c28a7a" }}
              >
                ⬇ Download
              </a>
            </div>

            {/* Terminal commands (Mac) */}
            {p.terminalCmds && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Buka Terminal (Cmd+Space → "Terminal"), lalu jalankan:
                </p>
                <div className="relative rounded-xl bg-gray-900 px-4 py-3 font-mono text-sm text-green-400 space-y-0.5">
                  {p.terminalCmds.map((cmd, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="select-none text-gray-600">$</span>
                      <span>{cmd}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => copyCmd(p.terminalCmds!.join("\n"), p.id)}
                    className="absolute top-2.5 right-3 text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                    title="Salin semua perintah"
                  >
                    {copied === p.id ? (
                      <span className="text-green-400 font-semibold">✓ Disalin</span>
                    ) : (
                      <span>⎘ Salin</span>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  ⚠️ Jika muncul peringatan keamanan macOS: <span className="font-medium text-gray-600">System Settings → Privacy &amp; Security → Open Anyway</span>
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-2">
                  <p className="font-semibold">🔐 Satu kali saja — install sertifikat HTTPS agent:</p>
                  <p className="text-amber-700">Setelah agent jalan, Terminal akan menampilkan perintah ini. Salin dan jalankan:</p>
                  <div className="relative rounded-lg bg-gray-900 px-3 py-2 font-mono text-xs text-green-400">
                    <span className="select-none text-gray-600">$ </span>
                    {"sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/Downloads/fremio-cert.pem"}
                    <button
                      onClick={() => copyCmd(
                        "sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/Downloads/fremio-cert.pem",
                        `${p.id}-cert`
                      )}
                      className="ml-3 text-gray-400 hover:text-white transition-colors"
                    >
                      {copied === `${p.id}-cert` ? <span className="text-green-400">✓</span> : "⎘"}
                    </button>
                  </div>
                  <p className="text-amber-700">Masukkan password Mac → restart browser → buka booth kembali.</p>
                </div>
              </div>
            )}

            {/* Steps (Windows) */}
            {p.steps && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cara Menjalankan</p>
                <ol className="space-y-1">
                  {p.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="flex-1">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Auto-start tips */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">💡 Tips: Jalankan Agent Otomatis saat Komputer Nyala</h2>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-700">Windows — Task Scheduler</p>
            <p>Buka Task Scheduler → Create Basic Task → pilih "At startup" → pilih file <code className="bg-gray-200 px-1 rounded">fremio-agent-win.exe</code></p>
          </div>
          <div>
            <p className="font-medium text-gray-700">macOS — Login Items</p>
            <p>System Settings → General → Login Items → klik + dan pilih file <code className="bg-gray-200 px-1 rounded">~/Documents/fremio/studio/agent/fremio-agent-mac-arm64</code></p>
          </div>
        </div>
      </div>

      {/* Version info */}
      <p className="text-xs text-gray-300 text-center">Fremio Local Agent v1.0.0 — port 3002</p>
    </div>
  );
}
