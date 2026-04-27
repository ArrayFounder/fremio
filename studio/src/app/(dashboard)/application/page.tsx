import Link from "next/link";

const APP_DOWNLOADS = [
  {
    label: "Windows Installer (.exe)",
    href: "/downloads/fremio-booth-windows-setup.exe",
    fileName: "fremio-booth-windows-setup.exe",
    note: "Direkomendasikan untuk operator umum. Install sekali, buka app, lalu cek status kamera dan printer langsung dari setup screen.",
  },
  {
    label: "Windows Portable (.zip)",
    href: "/downloads/fremio-booth-windows-portable.zip",
    fileName: "fremio-booth-windows-portable.zip",
    note: "Untuk testing cepat tanpa install ke Program Files.",
  },
];

export default function ApplicationPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block"
        >
          ← Kembali ke Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-gray-900">Download Fremio Studio</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Unduh aplikasi Fremio Studio untuk Windows. Link ini disiapkan untuk
          penggunaan operator di lokasi booth dengan alur install yang sesederhana mungkin.
        </p>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Cara pakai singkat</p>
        <p>
          Download installer, install sekali, lalu buka app. Dari app itu operator bisa melihat apakah bridge lokal,
          kamera DSLR, dan printer sudah siap tanpa setup manual lewat CMD.
        </p>
      </div>

      <div className="space-y-4">
        {APP_DOWNLOADS.map((item) => (
          <div
            key={item.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col gap-3"
          >
            <div>
              <h2 className="text-base font-semibold text-gray-900">{item.label}</h2>
              <p className="text-sm text-gray-500 mt-1">{item.note}</p>
              <p className="text-xs text-gray-400 mt-2 font-mono">{item.fileName}</p>
            </div>

            <a
              href={item.href}
              download={item.fileName}
              className="self-start px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: "#c28a7a" }}
            >
              ⬇ Download
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
