// Shared types untuk Booth UI — dipakai di semua screen dan BoothClient

export interface WelcomeScreenPrefs {
  backgroundType:      "color" | "image"
  backgroundColor:     string        // fallback ke primaryColor
  backgroundImageUrl:  string | null
  ctaText:             string        // "✨ Mulai Foto"
  ctaColor:            string        // warna tombol (hex), default = accentColor
  ctaX:                number        // center X tombol, 0-100, default 50
  ctaY:                number        // center Y tombol, 0-100, default 75
  ctaWidth:            number        // lebar tombol dlm % container width, default 75
  /** Posisi & ukuran logo Fremio — nilai 0-100 sbg % dari container */
  logoX:               number        // center X, default 50
  logoY:               number        // center Y, default 50
  logoWidth:           number        // lebar logo dlm % container width, default 40
  /** Tutorial screen — posisi & ukuran steps block dan CTA */
  tutorialStepsX:      number        // center X blok steps, default 50
  tutorialStepsY:      number        // center Y blok steps, default 42
  tutorialStepsWidth:  number        // lebar blok steps dlm % container, default 92
  /** Tutorial header teks — draggable, resizable, editable */
  tutorialHeaderText:  string        // default "Tutorial"
  tutorialHeaderX:     number        // center X, default 50
  tutorialHeaderY:     number        // center Y, default 10
  tutorialHeaderSize:  number        // font size px, default 42
  tutorialHeaderFont:  string        // font family, default "inherit"
  tutorialHeaderColor: string        // hex, default = accentColor
  /** Tutorial CTA button */
  tutorialCtaX:        number        // center X tombol tutorial, default 50
  tutorialCtaY:        number        // center Y tombol tutorial, default 82
  tutorialCtaWidth:    number        // lebar tombol tutorial dlm %, default 72
  tutorialCtaText:     string        // default "Mulai Sekarang →"
  tutorialCtaColor:    string        // hex, default = ctaColor
  /** Tutorial screen background — independent dari welcome screen */
  tutorialBackgroundType:     "color" | "image"
  tutorialBackgroundColor:    string
  tutorialBackgroundImageUrl: string | null
  /** Gaya tampilan step tutorial */
  tutorialStyle: "card" | "minimal" | "colorful" | "columns" | "bold"
  /** Payment Method screen */
  paymentBgColor:    string        // default = primaryColor
  paymentHeaderText: string        // default "Pilih Metode Pembayaran"
  paymentStyle:      "card" | "minimal" | "colorful" | "columns" | "bold"
  /** Timer widget visual — posisi & warna (opsional, ada default) */
  timerX?:         number   // center X %, default 88
  timerY?:         number   // center Y %, default 8
  timerRingColor?: string   // hex, default "#ffffff"
  timerBgColor?:   string   // hex, default "#000000"
}

export interface BoothConfigData {
  id: string
  boothName: string
  slug: string
  /** Harga dasar per sesi termasuk 1 lembar cetak (IDR) */
  pricePerSession: number
  /** Harga per lembar cetak tambahan (lembar ke-2 dst) dalam IDR */
  printPricePerSheet: number
  sessionDurationSeconds: number
  allowedFrameIds: string[]
  printEnabled: boolean
  primaryColor: string   // hex, misal "#0a1a4a"
  accentColor: string    // hex, misal "#d4a017"
  logoUrl: string | null
  welcomeScreenPrefs: WelcomeScreenPrefs | null
  /** Durasi timer per tahap (detik). 0 = tidak ada timer. */
  timerTutorialSeconds:    number
  timerFrameSelectSeconds: number
  timerPrintCountSeconds:  number
  timerPaymentSeconds:     number
  timerCameraSeconds:      number
  timerPreviewSeconds:     number
  timerDeliverySeconds:    number
}

export interface PhotoSlot {
  top:          number  // 0-1 dari tinggi canvas
  left:         number  // 0-1 dari lebar canvas
  width:        number  // 0-1 dari lebar canvas
  height:       number  // 0-1 dari tinggi canvas
  photoIndex:   number  // index foto yang masuk ke slot ini
  borderRadius?: number // px (opsional)
  rotation?:    number  // derajat (opsional)
  zIndex?:      number  // urutan layer asli dari draft (opsional)
}

export interface DraftSceneElement {
  type: "background-photo" | "upload" | "text" | "shape"
  top: number
  left: number
  width: number
  height: number
  zIndex: number
  rotation?: number
  borderRadius?: number
  src?: string | null
  objectFit?: "fill" | "cover" | "contain"
  text?: string
  align?: "left" | "center" | "right"
  color?: string
  fontSize?: number   // normalized terhadap canvasHeight (0-1)
  fontFamily?: string
  fontWeight?: number | string
  fill?: string
  stroke?: string | null
  strokeWidth?: number
  shapeType?: string
}

export interface FrameData {
  id: string
  name: string
  category: string
  thumbnailUrl: string
  assetUrl: string    // PNG transparan full-res / WEBP background
  isPremium: boolean
  canvasWidth: number  // default 1080
  canvasHeight: number // default 1920
  maxCaptures: number  // berapa foto yang diambil (1-12)
  slots: PhotoSlot[] | null  // posisi slot foto; null = auto layout
  backgroundColor?: string | null
  /** URL overlay PNG dekorasi (teks, stiker, watermark) — hanya ada pada frame webp */
  overlayUrl?: string | null
  /** Layer scene dari draft frame user: background-photo, upload, text */
  sceneElements?: DraftSceneElement[] | null
  /** Mode pengambilan foto: "single" (default) | "duplicate" (tiap capture = 2 slot simetris) */
  captureMode?: string | null
}

export type BoothScreen =
  | "BOOTH_SETUP"     // pilih kamera & printer — tampil sekali sebelum IDLE
  | "IDLE"
  | "TUTORIAL"        // halaman panduan alur booth
  | "PAYMENT_METHOD"  // pilih metode pembayaran (Ticket / Cashless / Voucher)
  | "FRAME_SELECT"
  | "PRINT_COUNT"     // pilih jumlah cetak
  | "VOUCHER_INPUT"   // input kode voucher (muncul setelah PRINT_COUNT jika VOUCHER dipilih)
  | "PAYMENT"
  | "CAMERA"
  | "PHOTO_REVIEW"   // preview satu foto sebelum lanjut ke foto berikutnya
  | "PREVIEW"
  | "DELIVERY"

export type PaymentMethod = "TICKET" | "CASHLESS" | "VOUCHER"

/** Pengaturan hardware booth — disimpan di localStorage */
export interface BoothHardwareSettings {
  cameraDeviceId:   string | null   // null = default
  cameraMirror:     boolean
  printerName:      string | null   // null = tanpa printer / dialog browser
  setupCompleted:   boolean
}

export interface VoucherInfo {
  voucherId:     string
  code:          string
  type:          "FREE" | "FIXED" | "PERCENT"
  discountValue: number
  discountAmount: number
  finalAmount:   number
}

/** State lengkap satu sesi customer di booth */
export interface BoothSessionState {
  sessionId:           string | null
  orderId:             string | null
  amount:              number
  qrImageUrl:          string | null
  qrString:            string | null
  paymentExpiresAt:    Date | null
  selectedFrame:       FrameData | null
  paymentMethod:       PaymentMethod | null
  printCount:          number
  voucher:             VoucherInfo | null      // info voucher yang sudah divalidasi
  capturedPhotos:      string[]               // JPEG data URLs dari kamera (multi-capture)
  /**
   * Live Mode — video clip (Blob | null) per foto, indeks sejajar capturedPhotos.
   * null berarti kamera tidak mendukung MediaRecorder pada capture ke-i.
   */
  capturedVideos:      (Blob | null)[]
  compositeDataUrl:    string | null           // JPEG data URL setelah overlay frame
  photoUrl:            string | null           // URL setelah upload foto
  downloadUrl:         string | null           // URL halaman download customer
  videoUrl:            string | null           // URL video Live Mode setelah upload
  /** @deprecated diganti capturedVideos */
  liveVideoBlob:       Blob | null
}

export const EMPTY_SESSION: BoothSessionState = {
  sessionId:        null,
  orderId:          null,
  amount:           0,
  qrImageUrl:       null,
  qrString:         null,
  paymentExpiresAt: null,
  selectedFrame:    null,
  paymentMethod:    null,
  printCount:       1,
  voucher:          null,
  capturedPhotos:   [],
  capturedVideos:   [],
  compositeDataUrl: null,
  photoUrl:         null,
  downloadUrl:      null,
  videoUrl:         null,
  liveVideoBlob:    null,
}
