import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Local File Storage
// Foto disimpan di folder /uploads/ di root aplikasi, diakses via nginx.
// ─────────────────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload foto ke local storage.
 * @param key   - storage key, contoh: "sessions/abc123/photo-1.jpg"
 * @param body  - Buffer atau Uint8Array
 */
export async function uploadPhoto(
  key: string,
  body: Buffer | Uint8Array,
  _contentType: string = "image/jpeg"
): Promise<string> {
  const filePath = path.join(UPLOADS_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
  return `/uploads/${key}`;
}

/**
 * Hapus foto dari local storage.
 */
export async function deletePhoto(key: string): Promise<void> {
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, key));
  } catch {
    // abaikan jika file tidak ada
  }
}

/**
 * Return URL langsung (tidak perlu presigned URL untuk local storage).
 */
export async function getPresignedDownloadUrl(key: string): Promise<string> {
  return `/uploads/${key}`;
}

/**
 * Tidak digunakan dalam local storage — melempar error agar jelas.
 */
export async function getPresignedUploadUrl(): Promise<string> {
  throw new Error("Presigned upload tidak tersedia dalam mode penyimpanan lokal");
}

/**
 * Generate storage key standar untuk foto sesi.
 * Format: sessions/{sessionId}/{timestamp}-{index}.jpg
 */
export function buildPhotoKey(
  sessionId: string,
  index: number
): string {
  const ts = Date.now();
  return `sessions/${sessionId}/${ts}-${index}.jpg`;
}

/**
 * Generate storage key untuk foto mentah per-capture (tanpa frame).
 * Format: sessions/{sessionId}/raw-{index}-{timestamp}.jpg
 */
export function buildRawPhotoKey(
  sessionId: string,
  index: number
): string {
  const ts = Date.now();
  return `sessions/${sessionId}/raw-${index}-${ts}.jpg`;
}

/**
 * Generate storage key untuk GIF slideshow sesi.
 * Format: sessions/{sessionId}/slideshow-{timestamp}.gif
 */
export function buildGifKey(sessionId: string): string {
  return `sessions/${sessionId}/slideshow-${Date.now()}.gif`;
}

/**
 * Generate storage key untuk video Live Mode sesi.
 * Format: sessions/{sessionId}/live-{timestamp}.webm
 *
 * Browser MediaRecorder menghasilkan WebM container (VP8/VP9/H.264).
 * Pakai .webm agar file valid dan nginx serve dengan content-type video/webm.
 */
export function buildVideoKey(sessionId: string): string {
  return `sessions/${sessionId}/live-${Date.now()}.webm`;
}
