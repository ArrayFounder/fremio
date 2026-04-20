export default function DownloadNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="text-6xl mb-6">📭</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Foto Tidak Ditemukan</h1>
      <p className="text-gray-500 text-base max-w-xs">
        Link ini mungkin sudah kedaluwarsa (aktif 24 jam) atau tidak valid.
      </p>
      <p className="mt-4 text-sm text-gray-400">
        Hubungi operator booth untuk bantuan.
      </p>
    </div>
  );
}
