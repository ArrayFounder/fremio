/**
 * Paper size mapping berdasarkan canvas dimensions dari frame.
 *
 * Ukuran standar:
 * - 2R:             64 × 89 mm   (2.5 × 3.5 in)
 * - 4R / 4×6:      102 × 152 mm (4 × 6 in)
 * - A4:             210 × 297 mm
 * - A3:             297 × 420 mm
 * - Instagram Story: 1080×1920 px → tidak ada standar kertas; default ke 4R
 */

export interface PaperSizeInfo {
  name:     string   // "2R" | "4R" | "A4" | "A3" | "Instagram Story"
  widthMm:  number
  heightMm: number
  /** CSS @page size value, e.g. "102mm 152mm" */
  cssPageSize: string
}

const PAPER_SIZES: PaperSizeInfo[] = [
  { name: "2R",              widthMm: 64,  heightMm: 89,  cssPageSize: "64mm 89mm" },
  { name: "4R",              widthMm: 102, heightMm: 152, cssPageSize: "102mm 152mm" },
  { name: "A4",              widthMm: 210, heightMm: 297, cssPageSize: "210mm 297mm" },
  { name: "A3",              widthMm: 297, heightMm: 420, cssPageSize: "297mm 420mm" },
];

/**
 * Deteksi ukuran kertas berdasarkan canvas width × height frame.
 * Menggunakan aspect ratio matching — yang paling dekat dipilih.
 *
 * Mapping canvas → paper:
 * - 2R  frame:  ~640×890  atau ~720×1010
 * - 4R  frame:  ~1200×1800 atau ~1016×1524
 * - A4  frame:  ~2480×3508 atau ~2100×2970
 * - A3  frame:  ~2970×4200 atau ~3508×4960
 * - Instagram Story: 1080×1920 → default 4R (closest fit)
 */
export function detectPaperSize(canvasWidth: number, canvasHeight: number): PaperSizeInfo {
  // Pastikan portrait orientation (height > width)
  const w = Math.min(canvasWidth, canvasHeight);
  const h = Math.max(canvasWidth, canvasHeight);
  const ratio = h / w;

  // Known canvas-to-paper mappings by approximate ratio
  const candidates = PAPER_SIZES.map(paper => {
    const paperRatio = paper.heightMm / paper.widthMm;
    const ratioDiff = Math.abs(ratio - paperRatio);
    return { paper, ratioDiff };
  });

  candidates.sort((a, b) => a.ratioDiff - b.ratioDiff);

  // If best match ratio diff < 0.15, use it; otherwise default to 4R
  if (candidates[0].ratioDiff < 0.15) {
    return candidates[0].paper;
  }

  // Default: 4R (most common photobox paper)
  return PAPER_SIZES[1]; // 4R
}

/** Semua ukuran kertas yang didukung */
export function getAllPaperSizes(): PaperSizeInfo[] {
  return [...PAPER_SIZES];
}

/** Cari paper size by name */
export function getPaperSizeByName(name: string): PaperSizeInfo | undefined {
  return PAPER_SIZES.find(p => p.name === name);
}
