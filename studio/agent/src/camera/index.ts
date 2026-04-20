// ─────────────────────────────────────────────────────────────────────────────
// Camera Module — bridge gphoto2 / webcam ke Studio
// TODO: implementasi saat hardware tersedia
// ─────────────────────────────────────────────────────────────────────────────

export interface CaptureResult {
  success:  boolean;
  filePath?: string;
  error?:   string;
}

/**
 * Ambil foto dari kamera yang terhubung.
 * Mendukung dua mode:
 * 1. DSLR via gphoto2 (USB)
 * 2. Webcam via v4l2 / getUserMedia (fallback)
 */
export async function capture(): Promise<CaptureResult> {
  // TODO: deteksi kamera yang tersedia
  // TODO: jika DSLR terhubung → gunakan gphoto2
  // TODO: jika tidak ada DSLR → kembalikan error (webcam handle di browser)
  return { success: false, error: "Camera module not implemented" };
}

/**
 * Cek apakah ada DSLR terhubung via USB.
 */
export async function isDslrConnected(): Promise<boolean> {
  // TODO: jalankan `gphoto2 --auto-detect` dan parse output
  return false;
}
