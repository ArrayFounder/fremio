// ─────────────────────────────────────────────────────────────────────────────
// Printer Module — bridge CUPS ke Studio
// TODO: implementasi saat hardware tersedia
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintJob {
  photoPath: string;       // path lokal file foto
  printerName?: string;    // override printer, default dari env
  copies?:      number;    // jumlah cetak, default 1
}

export interface PrintResult {
  success: boolean;
  jobId?:  number;
  error?:  string;
}

const DEFAULT_PRINTER = process.env.PRINTER_NAME ?? "";

/**
 * Kirim foto ke printer via CUPS.
 * CUPS harus sudah dikonfigurasi dan printer sudah terdaftar.
 */
export async function print(job: PrintJob): Promise<PrintResult> {
  const printer = job.printerName ?? DEFAULT_PRINTER;

  if (!printer) {
    return { success: false, error: "PRINTER_NAME tidak diset di environment" };
  }

  // TODO: gunakan node-cups atau exec `lp -d PRINTER_NAME -n COPIES file`
  return { success: false, error: "Printer module not implemented" };
}

/**
 * List semua printer yang terdaftar di CUPS.
 */
export async function listPrinters(): Promise<string[]> {
  // TODO: jalankan `lpstat -p` dan parse output
  return [];
}
