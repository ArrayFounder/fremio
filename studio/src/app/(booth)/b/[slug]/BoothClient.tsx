"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useBoothSocket } from "./hooks/useBoothSocket";
import { getAdaptiveColors } from "./colorUtils";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";
import { IdleScreen }           from "./screens/IdleScreen";
import { TutorialScreen }       from "./screens/TutorialScreen";
import { PaymentMethodScreen }  from "./screens/PaymentMethodScreen";
import { PaymentScreen }        from "./screens/PaymentScreen";
import { FrameSelectScreen }    from "./screens/FrameSelectScreen";
import { PrintCountScreen }     from "./screens/PrintCountScreen";
import { CameraScreen }         from "./screens/CameraScreen";
import { PreviewScreen }        from "./screens/PreviewScreen";
import { PreviewDemoScreen }    from "./screens/PreviewDemoScreen";
import { DeliveryScreen }       from "./screens/DeliveryScreen";
import { BoothSetupScreen, loadHardwareSettings } from "./screens/BoothSetupScreen";
import { composeVideoLive } from "@/lib/frameEngine";
import { EMPTY_SESSION, type BoothConfigData, type BoothHardwareSettings, type BoothScreen, type BoothSessionState, type FrameData, type PaymentMethod, type VoucherInfo } from "./types";
import VoucherScreen from "./screens/VoucherScreen";
import { BoothTimer } from "./screens/BoothTimer";

const DEFAULT_HW_SETTINGS: BoothHardwareSettings = {
  cameraDeviceId: null,
  cameraMirror:   true,
  printerName:    null,
  setupCompleted: false,
};

/**
 * Jumlah capture (shutter) yang diperlukan untuk frame ini.
 * Mode "duplicate": tiap capture = 2 slot simetris, jadi hanya perlu slots.length/2 capture.
 */
function totalCaptures(frame: FrameData | null | undefined): number {
  if (!frame) return 1;
  const n = frame.slots?.length ?? 0;
  if (n === 0) return frame.maxCaptures ?? 1;
  // Semua frame dengan slot genap ≥ 2 diperlakukan sebagai duplicate
  if (n >= 2 && n % 2 === 0) return n / 2;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine — reducer
// ─────────────────────────────────────────────────────────────────────────────

interface State {
  screen:                 BoothScreen;
  isCreating:             boolean;       // true saat POST /api/payment/create loading
  session:                BoothSessionState;
  hwSettings:             BoothHardwareSettings;
  /** Live Mode — status compositing video ke frame */
  liveVideoState:         "idle" | "compositing" | "done" | "error";
  liveVideoCompositeBlob: Blob | null;
  /** Live Mode — apakah video slot saat ini sudah selesai direkam */
  currentVideoReady:      boolean;
  /** Index slot yang sedang di-retake; null = capture normal sekuensial */
  retakeSlotIndex:        number | null;
  /** Semua slot sudah terisi foto — tampilkan UI review sebelum lanjut ke PREVIEW */
  allPhotosDone:          boolean;
}

type Action =
  | { type: "GOTO_TUTORIAL" }
  | { type: "TUTORIAL_DONE" }
  | { type: "PAYMENT_METHOD_SELECTED"; payload: { method: PaymentMethod } }
  | { type: "PRINT_COUNT_CONFIRMED"; payload: { count: number } }
  | { type: "START_CREATING" }
  | { type: "PAYMENT_CREATED"; payload: { sessionId: string; orderId: string; amount: number; qrImageUrl: string | null; qrString: string | null; expiresAt: Date | null } }
  | { type: "VOUCHER_VALIDATED"; payload: VoucherInfo }
  | { type: "VOUCHER_SESSION_CREATED"; payload: { sessionId: string } }
  | { type: "PAYMENT_SUCCESS"; payload: { sessionId: string } }
  | { type: "FRAME_SELECTED";  payload: { frame: FrameData } }
  | { type: "PHOTO_CAPTURED";  payload: { dataUrl: string; videoBlob: Blob | null } }
  | { type: "PHOTO_REVIEW_CONFIRM" }   // user tekan Lanjut di preview satu foto
  | { type: "PHOTO_RETAKE_SINGLE" }   // user tekan Ulangi di preview satu foto
  | { type: "PHOTO_SAVED";     payload: { photoUrl: string; videoUrl: string | null; downloadUrl: string } }
  | { type: "RETAKE" }
  | { type: "RESET" }
  | { type: "SETUP_COMPLETE"; payload: BoothHardwareSettings }
  | { type: "GOTO_SETUP" }
  | { type: "LIVE_VIDEO_COMPOSITING" }
  | { type: "LIVE_VIDEO_DONE"; payload: Blob | null }
  | { type: "PHOTO_VIDEO_READY"; payload: Blob | null }
  | { type: "RETAKE_SLOT"; payload: { slotIndex: number } }
  | { type: "PROCEED_TO_PREVIEW" }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "GOTO_TUTORIAL":
      return { ...state, screen: "TUTORIAL" };

    case "TUTORIAL_DONE":
      return { ...state, screen: "PAYMENT_METHOD" };

    case "PAYMENT_METHOD_SELECTED":
      return {
        ...state,
        // Jika VOUCHER: minta kode dulu sebelum pilih frame
        screen: action.payload.method === "VOUCHER" ? "VOUCHER_INPUT" : "FRAME_SELECT",
        session: { ...state.session, paymentMethod: action.payload.method },
      };

    case "PRINT_COUNT_CONFIRMED":
      return {
        ...state,
        isCreating: true,
        session: { ...state.session, printCount: action.payload.count },
      };

    case "VOUCHER_VALIDATED":
      return {
        ...state,
        isCreating: false,
        // Setelah kode divalidasi → lanjut pilih frame
        screen: "FRAME_SELECT",
        session: { ...state.session, voucher: action.payload },
      };

    case "VOUCHER_SESSION_CREATED":
      return {
        ...state,
        isCreating: false,
        screen: "CAMERA",
        session: { ...state.session, sessionId: action.payload.sessionId },
      };

    case "START_CREATING":
      return { ...state, isCreating: true };

    case "PAYMENT_CREATED":
      return {
        ...state,
        isCreating: false,
        screen: "PAYMENT",
        session: {
          ...state.session,
          sessionId:        action.payload.sessionId,
          orderId:          action.payload.orderId,
          amount:           action.payload.amount,
          qrImageUrl:       action.payload.qrImageUrl,
          qrString:         action.payload.qrString,
          paymentExpiresAt: action.payload.expiresAt,
        },
      };

    case "PAYMENT_SUCCESS":
      return {
        ...state,
        screen: "CAMERA",
        session: { ...state.session, sessionId: action.payload.sessionId },
      };

    case "FRAME_SELECTED":
      return {
        ...state,
        screen: "PRINT_COUNT",
        retakeSlotIndex: null,
        allPhotosDone: false,
        session: { ...state.session, selectedFrame: action.payload.frame, capturedPhotos: [], capturedVideos: [] },
        liveVideoState: "idle",
        liveVideoCompositeBlob: null,
      };

    case "PHOTO_CAPTURED": {
      const retakeIdx = state.retakeSlotIndex;
      let newPhotos: string[];
      let newVideos: (Blob | null)[];
      if (retakeIdx !== null) {
        newPhotos = [...state.session.capturedPhotos];
        newPhotos[retakeIdx] = action.payload.dataUrl;
        newVideos = [...state.session.capturedVideos];
        newVideos[retakeIdx] = null;
      } else {
        newPhotos = [...state.session.capturedPhotos, action.payload.dataUrl];
        newVideos = [...state.session.capturedVideos, null];
      }
      return {
        ...state,
        screen: "PHOTO_REVIEW",
        currentVideoReady: false,
        session: { ...state.session, capturedPhotos: newPhotos, capturedVideos: newVideos },
      };
    }

    case "PHOTO_REVIEW_CONFIRM": {
      const frame = state.session.selectedFrame;
      const totalNeeded = totalCaptures(frame);
      if (state.retakeSlotIndex !== null) {
        // Setelah retake slot tertentu → kembali ke review semua foto
        return { ...state, screen: "CAMERA", retakeSlotIndex: null, allPhotosDone: true };
      }
      const done = state.session.capturedPhotos.length >= totalNeeded;
      if (done) {
        return { ...state, screen: "CAMERA", allPhotosDone: true };
      }
      return { ...state, screen: "CAMERA" };
    }

    case "PHOTO_RETAKE_SINGLE": {
      if (state.retakeSlotIndex !== null) {
        // Retake slot tertentu — kosongkan slot itu, tetap di mode retake
        const photos = [...state.session.capturedPhotos];
        photos[state.retakeSlotIndex] = "";
        const vids = [...state.session.capturedVideos];
        vids[state.retakeSlotIndex] = null;
        return {
          ...state,
          screen: "CAMERA",
          currentVideoReady: false,
          session: { ...state.session, capturedPhotos: photos, capturedVideos: vids },
        };
      }
      const photos = state.session.capturedPhotos.slice(0, -1);
      const vids   = state.session.capturedVideos.slice(0, -1);
      return {
        ...state,
        screen: "CAMERA",
        currentVideoReady: false,
        session: { ...state.session, capturedPhotos: photos, capturedVideos: vids },
      };
    }

    case "RETAKE":
      return {
        ...state,
        screen: "CAMERA",
        currentVideoReady: false,
        retakeSlotIndex: null,
        allPhotosDone: false,
        session: { ...state.session, capturedPhotos: [], capturedVideos: [], compositeDataUrl: null },
        liveVideoState: "idle",
        liveVideoCompositeBlob: null,
      };

    case "PHOTO_SAVED":
      return {
        ...state,
        screen: "DELIVERY",
        session: {
          ...state.session,
          photoUrl:    action.payload.photoUrl,
          videoUrl:    action.payload.videoUrl,
          downloadUrl: action.payload.downloadUrl,
        },
      };

    case "RESET":
      return { ...state, screen: "IDLE", isCreating: false, session: EMPTY_SESSION, liveVideoState: "idle", liveVideoCompositeBlob: null, currentVideoReady: false, retakeSlotIndex: null, allPhotosDone: false };

    case "SETUP_COMPLETE":
      return { ...state, screen: "IDLE", hwSettings: action.payload };

    case "GOTO_SETUP":
      return { ...state, screen: "BOOTH_SETUP" };

    case "LIVE_VIDEO_COMPOSITING":
      return { ...state, liveVideoState: "compositing" };

    case "LIVE_VIDEO_DONE":
      return {
        ...state,
        liveVideoState:         action.payload ? "done" : "error",
        liveVideoCompositeBlob: action.payload,
      };

    case "PHOTO_VIDEO_READY": {
      // Abaikan jika user sudah retake (sudah tidak di PHOTO_REVIEW)
      if (state.screen !== "PHOTO_REVIEW") return state;
      const idx = state.retakeSlotIndex !== null
        ? state.retakeSlotIndex
        : state.session.capturedVideos.length - 1;
      if (idx < 0) return { ...state, currentVideoReady: true };
      const newVids = [...state.session.capturedVideos];
      newVids[idx] = action.payload;
      return {
        ...state,
        currentVideoReady: true,
        session: { ...state.session, capturedVideos: newVids },
      };
    }

    case "RETAKE_SLOT": {
      const photos = [...state.session.capturedPhotos];
      photos[action.payload.slotIndex] = "";
      const vids = [...state.session.capturedVideos];
      vids[action.payload.slotIndex] = null;
      return {
        ...state,
        screen: "CAMERA",
        retakeSlotIndex: action.payload.slotIndex,
        allPhotosDone: false,
        currentVideoReady: false,
        liveVideoState: "idle",
        liveVideoCompositeBlob: null,
        session: { ...state.session, capturedPhotos: photos, capturedVideos: vids },
      };
    }

    case "PROCEED_TO_PREVIEW":
      return { ...state, screen: "PREVIEW", allPhotosDone: false, retakeSlotIndex: null };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BoothClient
// ─────────────────────────────────────────────────────────────────────────────

interface BoothClientProps {
  booth:         BoothConfigData;
  frames:        FrameData[];
  /** Jika di-set, langsung tampilkan screen ini tanpa setup. Dipakai untuk preview di dashboard. */
  previewScreen?: string;
}

/** Screen yang valid di booth (untuk keperluan preview) */
const PREVIEW_SCREEN_MAP: Record<string, BoothScreen> = {
  idle:       "IDLE",
  tutorial:   "TUTORIAL",
  paymethod:  "PAYMENT_METHOD",
  frame:      "FRAME_SELECT",
  printcount: "PRINT_COUNT",
  payment:    "PAYMENT",
  camera:     "CAMERA",
  preview:    "PREVIEW",
  delivery:   "DELIVERY",
};

export function BoothClient({ booth, frames, previewScreen }: BoothClientProps) {
  const mappedPreviewScreen = previewScreen ? (PREVIEW_SCREEN_MAP[previewScreen] ?? "IDLE") : null;

  // Untuk layar yang membutuhkan selectedFrame, gunakan frame pertama sebagai dummy
  const firstFrame = frames[0] ?? null;

  const dummySession: BoothSessionState = {
    ...EMPTY_SESSION,
    selectedFrame: firstFrame,
    sessionId: "preview",
    orderId: "preview",
    amount: booth.pricePerSession,
    qrImageUrl: null,
    qrString: "https://studio.fremio.id",
    paymentExpiresAt: null,
    capturedPhotos: [],
    capturedVideos: [],
    downloadUrl: `https://studio.fremio.id/d/preview`,
  };

  const [state, dispatch] = useReducer(reducer, {
    screen:                 mappedPreviewScreen ?? "BOOTH_SETUP",
    isCreating:             false,
    session:                mappedPreviewScreen ? dummySession : EMPTY_SESSION,
    hwSettings:             mappedPreviewScreen ? { ...DEFAULT_HW_SETTINGS, setupCompleted: true } : DEFAULT_HW_SETTINGS,
    liveVideoState:         "idle",
    liveVideoCompositeBlob: null,
    currentVideoReady:      false,
    retakeSlotIndex:        null,
    allPhotosDone:          false,
  });

  // Load hardware settings from localStorage on mount (client-only)
  // Dilewati kalau dalam preview mode
  useEffect(() => {
    if (mappedPreviewScreen) return;
    const saved = loadHardwareSettings(booth.slug);
    if (saved?.setupCompleted) {
      dispatch({ type: "SETUP_COMPLETE", payload: saved });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { screen, isCreating, session, hwSettings, liveVideoState, liveVideoCompositeBlob, currentVideoReady, retakeSlotIndex, allPhotosDone } = state;
  const { primaryColor, accentColor }    = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);

  // ── Ref: key untuk mencegah double-trigger compositing ───────────────────
  const composeKeyRef = useRef("");

  // Reset key ketika kembali ke kamera / frame select / idle
  useEffect(() => {
    if (
      screen === "CAMERA" ||
      screen === "IDLE"   ||
      screen === "TUTORIAL" ||
      screen === "PAYMENT_METHOD" ||
      screen === "FRAME_SELECT" ||
      screen === "PRINT_COUNT"
    ) {
      composeKeyRef.current = "";
    }
  }, [screen]);

  // ── Mulai compositing video saat video terakhir sudah siap ──────────────
  useEffect(() => {
    // Tunggu video slot saat ini selesai direkam
    if (!currentVideoReady) return;
    const frame = session.selectedFrame;
    if (!frame) return;

    const totalNeeded = totalCaptures(frame);

    // Hanya mulai pada review foto terakhir
    if (session.capturedPhotos.length < totalNeeded) return;
    // Hanya mulai jika ada video
    if (!session.capturedVideos.some(Boolean)) return;

    // Unique key: jangan double-trigger untuk set foto yang sama
    const key = `${session.sessionId ?? ""}_${session.capturedPhotos.length}`;
    if (composeKeyRef.current === key) return;
    composeKeyRef.current = key;

    let cancelled = false;
    dispatch({ type: "LIVE_VIDEO_COMPOSITING" });

    composeVideoLive(session.capturedVideos, frame.assetUrl, {
      canvasWidth:     frame.canvasWidth  || 1080,
      canvasHeight:    frame.canvasHeight || 1920,
      slots:           frame.slots ?? undefined,
      backgroundColor: frame.backgroundColor || "#ffffff",
      overlayUrl:      frame.overlayUrl ?? undefined,
      sceneElements:   frame.sceneElements ?? undefined,
      duration:        4000,
      fps:             30,
      mirror:          hwSettings.cameraMirror,
    })
      .then((blob) => {
        if (!cancelled) dispatch({ type: "LIVE_VIDEO_DONE", payload: blob });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "LIVE_VIDEO_DONE", payload: null });
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideoReady, session.capturedPhotos.length]);

  // ─── Socket.io — dengarkan session:unlocked dari server ──────────────────
  useBoothSocket(booth.id, {
    onSessionUnlocked: ({ sessionId }) => {
      // Hanya berlaku jika sesi yang unlock cocok dengan sesi saat ini
      if (session.sessionId && session.sessionId !== sessionId) return;
      if (screen === "PAYMENT") {
        dispatch({ type: "PAYMENT_SUCCESS", payload: { sessionId } });
      }
    },
    onSessionExpired: () => {
      if (screen === "PAYMENT") dispatch({ type: "RESET" });
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  // handleStart — dipanggil setelah print count dikonfirmasi
  const handleCreatePayment = useCallback(async (printCount: number, frameId?: string) => {
    dispatch({ type: "PRINT_COUNT_CONFIRMED", payload: { count: printCount } });
    try {
      const res  = await fetch("/api/payment/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ boothConfigId: booth.id, frameId, printCount, method: "QRIS" }),
      });
      const body = await res.json() as {
        success: boolean;
        data?: {
          sessionId:   string;
          orderId:     string;
          amount:      number;
          qrImageUrl:  string;
          qrString:    string;
          expiresAt:   string;
        };
        error?: string;
      };

      if (!body.success || !body.data) {
        throw new Error(body.error ?? "Gagal membuat pembayaran");
      }

      dispatch({
        type: "PAYMENT_CREATED",
        payload: {
          sessionId:  body.data.sessionId,
          orderId:    body.data.orderId,
          amount:     body.data.amount,
          qrImageUrl: body.data.qrImageUrl ?? null,
          qrString:   body.data.qrString   ?? null,
          expiresAt:  body.data.expiresAt ? new Date(body.data.expiresAt) : null,
        },
      });
    } catch (err) {
      console.error("[BoothClient] handleCreatePayment:", err);
      dispatch({ type: "RESET" });
      alert(err instanceof Error ? err.message : "Terjadi kesalahan, silakan coba lagi.");
    }
  }, [booth.id]);

  // handleVoucherApply — dipanggil dari VoucherScreen, hanya simpan info voucher lalu lanjut ke FRAME_SELECT
  const handleVoucherApply = useCallback((info: VoucherInfo) => {
    dispatch({ type: "VOUCHER_VALIDATED", payload: info });
  }, []);

  // handleFinalizeVoucher — dipanggil setelah print count dikonfirmasi, ketika paymentMethod === VOUCHER
  const handleFinalizeVoucher = useCallback(async (printCount: number, voucher: VoucherInfo, frameId?: string) => {
    dispatch({ type: "PRINT_COUNT_CONFIRMED", payload: { count: printCount } });
    try {
      // Hitung total: diskon hanya berlaku pada harga dasar; print tambahan tetap dikenakan
      const extraPrintCost = (printCount - 1) * booth.printPricePerSheet;
      const actualFinalAmount = voucher.finalAmount + extraPrintCost;

      if (actualFinalAmount === 0) {
        // Benar-benar gratis — buat sesi langsung tanpa bayar
        const res = await fetch("/api/vouchers/apply", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ boothConfigId: booth.id, voucherId: voucher.voucherId, code: voucher.code, printCount }),
        });
        const json = await res.json() as { success: boolean; data?: { sessionId: string }; error?: string };
        if (!json.success || !json.data) throw new Error(json.error ?? "Gagal membuat sesi");
        dispatch({ type: "VOUCHER_SESSION_CREATED", payload: { sessionId: json.data.sessionId } });
      } else {
        // Ada sisa yang harus dibayar (FIXED/PERCENT + extra prints, atau FREE + extra prints)
        const res = await fetch("/api/payment/create", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ boothConfigId: booth.id, frameId, printCount, method: "QRIS", voucherId: voucher.voucherId, voucherCode: voucher.code }),
        });
        const json = await res.json() as {
          success: boolean;
          data?: { sessionId: string; orderId: string; amount: number; qrImageUrl: string; qrString: string; expiresAt: string };
          error?: string;
        };
        if (!json.success || !json.data) throw new Error(json.error ?? "Gagal membuat pembayaran");
        dispatch({
          type: "PAYMENT_CREATED",
          payload: {
            sessionId:  json.data.sessionId,
            orderId:    json.data.orderId,
            amount:     json.data.amount,
            qrImageUrl: json.data.qrImageUrl ?? null,
            qrString:   json.data.qrString   ?? null,
            expiresAt:  json.data.expiresAt ? new Date(json.data.expiresAt) : null,
          },
        });
      }
    } catch (err) {
      console.error("[BoothClient] handleFinalizeVoucher:", err);
      dispatch({ type: "RESET" });
      alert(err instanceof Error ? err.message : "Terjadi kesalahan, silakan coba lagi.");
    }
  }, [booth.id]);


  const handleReset = useCallback(() => dispatch({ type: "RESET" }), []);

  // ─── Booth session timer ──────────────────────────────────────────────────
  // Screens that START a fresh countdown when entered
  const TIMER_DURATIONS: Partial<Record<BoothScreen, number>> = {
    TUTORIAL:     booth.timerTutorialSeconds    || 0,
    FRAME_SELECT: booth.timerFrameSelectSeconds || 0,
    PRINT_COUNT:  booth.timerPrintCountSeconds  || 0,
    PAYMENT:      booth.timerPaymentSeconds     || 0,
    CAMERA:       booth.timerCameraSeconds      || 0,
    PREVIEW:      booth.timerPreviewSeconds     || 0,
    DELIVERY:     booth.timerDeliverySeconds    || 0,
  };
  // Screens that inherit the running timer from the previous screen
  const TIMER_CARRY: BoothScreen[] = ["PAYMENT_METHOD", "VOUCHER_INPUT", "PHOTO_REVIEW"];

  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
  const [timerTotal,       setTimerTotal]       = useState<number>(180);

  // Reset / start timer on screen change
  useEffect(() => {
    if ((TIMER_CARRY as string[]).includes(screen)) return; // carry over
    const dur = TIMER_DURATIONS[screen as BoothScreen];
    if (dur) {
      setTimerTotal(dur);
      setTimerSecondsLeft(dur);
    } else {
      setTimerSecondsLeft(null); // no timer on IDLE / BOOTH_SETUP / etc.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Tick every second; auto-reset when it hits 0
  useEffect(() => {
    if (timerSecondsLeft === null) return;
    if (timerSecondsLeft <= 0) {
      const id = setTimeout(handleReset, 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setTimerSecondsLeft((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [timerSecondsLeft, handleReset]);

  // ─── Fullscreen ───────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsToast, setFsToast] = useState<string | null>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    // iOS Safari — tidak support Fullscreen API, tampilkan tip
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      setFsToast('Di Safari: ketuk ⬜ (Share) → "Add to Home Screen" untuk fullscreen, atau gunakan tombol fullscreen browser di bawah layar.');
      setTimeout(() => setFsToast(null), 6000);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setFsToast("Tekan F11 (Windows/Linux) atau Ctrl+Cmd+F (Mac) untuk fullscreen.");
      setTimeout(() => setFsToast(null), 5000);
    }
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`fixed inset-0 ${screen === "BOOTH_SETUP" ? "overflow-y-auto" : "overflow-hidden"}`}
      style={{ backgroundColor: primaryColor, color: textPrimary }}
    >
      {/* ── Fullscreen button — pojok kiri bawah ── */}
      {screen !== "BOOTH_SETUP" && (
        <button
          onClick={toggleFullscreen}
          className="absolute bottom-3 left-3 z-50 w-9 h-9 rounded-xl flex items-center justify-center
                     text-base transition-opacity opacity-20 hover:opacity-70 active:opacity-100"
          style={{ background: "rgba(0,0,0,0.35)", color: "white" }}
          title={isFullscreen ? "Keluar fullscreen" : "Fullscreen (F11)"}
        >
          {isFullscreen ? "✕FS" : "⛶"}
          <span className="sr-only">{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
        </button>
      )}

      {/* ── Fullscreen tip toast ── */}
      {fsToast && (
        <div className="absolute bottom-14 left-3 z-50 max-w-xs rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-2xl"
          style={{ background: "rgba(0,0,0,0.88)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.15)" }}>
          {fsToast}
        </div>
      )}

      <ScreenErrorBoundary
        screenName={screen}
        accentColor={accentColor}
        onReset={handleReset}
      >
        {screen === "PAYMENT" && session.orderId && (
          <PaymentScreen
            booth={booth}
            orderId={session.orderId}
            sessionId={session.sessionId!}
            qrImageUrl={session.qrImageUrl}
            qrString={session.qrString}
            amount={session.amount}
            expiresAt={session.paymentExpiresAt}
            onPaid={(sessionId) => dispatch({ type: "PAYMENT_SUCCESS", payload: { sessionId } })}
            onCancel={handleReset}
          />
        )}

        {screen === "FRAME_SELECT" && (
          <FrameSelectScreen
            booth={booth}
            frames={frames}
            onSelect={(frame) => dispatch({ type: "FRAME_SELECTED", payload: { frame } })}
          />
        )}

        {screen === "PRINT_COUNT" && session.selectedFrame && (
          <PrintCountScreen
            booth={booth}
            frame={session.selectedFrame}
            voucher={session.paymentMethod === "VOUCHER" ? session.voucher : null}
            onSelect={(count) => {
              const frameId = session.selectedFrame?.id;
              return session.paymentMethod === "VOUCHER" && session.voucher
                ? handleFinalizeVoucher(count, session.voucher, frameId)
                : handleCreatePayment(count, frameId);
            }}
          />
        )}

        {screen === "VOUCHER_INPUT" && (
          <VoucherScreen
            booth={booth}
            onApply={handleVoucherApply}
            onBack={() => dispatch({ type: "TUTORIAL_DONE" })}
          />
        )}

        {screen === "BOOTH_SETUP" && (
          <BoothSetupScreen
            booth={booth}
            onDone={(settings) => dispatch({ type: "SETUP_COMPLETE", payload: settings })}
          />
        )}

        {screen === "IDLE" && (
          // Gear button overlay — buka ulang setup
          <div className="relative h-full">
            <IdleScreen
              booth={booth}
              onStart={() => dispatch({ type: "GOTO_TUTORIAL" })}
              isLoading={isCreating}
            />
            <button
              onClick={() => dispatch({ type: "GOTO_SETUP" })}
              className="absolute top-3 right-3 p-2 rounded-xl text-white/25 hover:text-white/60
                         hover:bg-white/10 transition-colors text-sm"
              title="Ubah pengaturan kamera & printer"
            >
              ⚙️
            </button>
          </div>
        )}

        {screen === "TUTORIAL" && (
          <TutorialScreen
            booth={booth}
            onStart={() => dispatch({ type: "TUTORIAL_DONE" })}
            prefsOverride={booth.welcomeScreenPrefs}
          />
        )}

        {screen === "PAYMENT_METHOD" && (
          <PaymentMethodScreen
            booth={booth}
            onSelect={(method) => dispatch({ type: "PAYMENT_METHOD_SELECTED", payload: { method } })}
            prefsOverride={booth.welcomeScreenPrefs}
          />
        )}

        {(screen === "CAMERA" || screen === "PHOTO_REVIEW") && session.selectedFrame && (
          <div className="relative h-full">
            {/* Camera + frame preview — selalu tampil, tetap hidup selama review */}
            <CameraScreen
              booth={booth}
              frame={session.selectedFrame}
              photoIndex={
                screen === "PHOTO_REVIEW"
                  ? session.capturedPhotos.length
                  : retakeSlotIndex !== null ? retakeSlotIndex + 1 : session.capturedPhotos.length + 1
              }
              capturedCount={
                screen === "PHOTO_REVIEW"
                  ? session.capturedPhotos.length   // tidak ada slot yg di-highlight saat overlay review
                  : retakeSlotIndex !== null ? retakeSlotIndex : session.capturedPhotos.length
              }
              capturedPhotos={session.capturedPhotos}
              allPhotosDone={screen === "CAMERA" ? allPhotosDone : false}
              retakeSlotIndex={screen === "CAMERA" ? retakeSlotIndex : null}
              onCapture={(dataUrl) =>
                dispatch({ type: "PHOTO_CAPTURED", payload: { dataUrl, videoBlob: null } })
              }
              onVideoReady={(videoBlob) =>
                dispatch({ type: "PHOTO_VIDEO_READY", payload: videoBlob })
              }
              onProceed={() => dispatch({ type: "PROCEED_TO_PREVIEW" })}
              onRetakeSlot={(slotIndex) => dispatch({ type: "RETAKE_SLOT", payload: { slotIndex } })}
            />

            {/* PHOTO_REVIEW — overlay card di atas camera screen */}
            {screen === "PHOTO_REVIEW" && session.capturedPhotos.length > 0 && (() => {
              const frame       = session.selectedFrame!;
              const totalNeeded = totalCaptures(frame);
              const photoIdx    = retakeSlotIndex !== null ? retakeSlotIndex + 1 : session.capturedPhotos.length;
              const lastPhoto   = session.capturedPhotos[photoIdx - 1];
              const isLast      = retakeSlotIndex !== null ? true : photoIdx >= totalNeeded;

              const currentSlot = frame.slots?.find((s) => s.photoIndex === photoIdx - 1);
              const cw = frame.canvasWidth  || 1080;
              const ch = frame.canvasHeight || 1920;
              const slotAspect  = currentSlot
                ? (currentSlot.width * cw) / (currentSlot.height * ch)
                : 16 / 9;
              // Photo fills card width, maintain slot aspect ratio
              const cardMaxW = 560; // px, matches max-w-lg below
              const photoW = cardMaxW - 56; // card padding 28px each side
              const photoH = Math.round(photoW / slotAspect);

              return (
                <div
                  className="absolute inset-0 flex items-center justify-center select-none px-6"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
                >
                  <div
                    className="w-full max-w-lg rounded-3xl p-7 shadow-2xl"
                    style={{ backgroundColor: primaryColor, border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    {/* Header: teks di atas */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm uppercase tracking-widest" style={{ color: textSecondary }}>
                          Foto {photoIdx} dari {totalNeeded}
                        </p>
                        <h3 className="text-3xl font-bold mt-0.5" style={{ color: textPrimary }}>Sudah oke?</h3>
                        <p className="text-base mt-0.5" style={{ color: textSecondary }}>
                          {isLast ? "Ini foto terakhir" : `${totalNeeded - photoIdx} foto lagi setelah ini`}
                        </p>
                      </div>

                      {/* Status badge */}
                      <div className="flex-shrink-0 ml-4">
                        {!currentVideoReady && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                            style={{ backgroundColor: surfaceBg, border: `1px solid ${surfaceBorder}`, color: textTertiary }}>
                            <span className="h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            Memproses…
                          </div>
                        )}
                        {currentVideoReady && !isLast && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
                            style={{ background: accentColor + "33", color: accentColor }}>
                            ✓ Siap
                          </div>
                        )}
                        {isLast && currentVideoReady && liveVideoState === "compositing" && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                            style={{ backgroundColor: surfaceBg, border: `1px solid ${surfaceBorder}`, color: textTertiary }}>
                            <span className="h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            🎬 Rendering…
                          </div>
                        )}
                        {isLast && liveVideoState === "done" && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
                            style={{ background: accentColor + "33", color: accentColor }}>
                            ✓ Siap
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Foto utama — full width, dominan */}
                    <div
                      className="w-full rounded-2xl overflow-hidden shadow-xl mb-5"
                      style={{ height: Math.min(photoH, 340) }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {lastPhoto && <img src={lastPhoto} alt="Foto" className="w-full h-full object-cover" />}
                    </div>

                    {/* Tombol aksi di bawah */}
                    <div className="flex gap-4">
                      <button
                        onClick={() => dispatch({ type: "PHOTO_RETAKE_SINGLE" })}
                        className="flex-shrink-0 px-6 py-4 rounded-2xl text-base font-semibold transition-colors active:opacity-70"
                        style={{ color: textSecondary, border: `1px solid ${surfaceBorder}`, backgroundColor: surfaceBg }}
                      >
                        🔄 Ulangi
                      </button>
                      <button
                        onClick={() => dispatch({ type: "PHOTO_REVIEW_CONFIRM" })}
                        disabled={!currentVideoReady}
                        style={{
                          backgroundColor: currentVideoReady ? accentColor : `${accentColor}55`,
                          color: primaryColor,
                        }}
                        className="flex-1 py-4 rounded-2xl text-xl font-black active:scale-95 transition-all disabled:cursor-not-allowed"
                      >
                        {!currentVideoReady
                          ? "⌛ Menyiapkan…"
                          : isLast ? "✅ Lanjut" : "👍 Foto Berikutnya"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {screen === "PREVIEW" && mappedPreviewScreen && session.selectedFrame && (
          <PreviewDemoScreen booth={booth} frame={session.selectedFrame} />
        )}

        {screen === "PREVIEW" && !mappedPreviewScreen &&
          session.capturedPhotos.length > 0 &&
          session.selectedFrame &&
          session.sessionId && (
            <PreviewScreen
              booth={booth}
              frame={session.selectedFrame}
              capturedPhotos={session.capturedPhotos}
              capturedVideos={session.capturedVideos}
              mirrorVideo={hwSettings.cameraMirror}
              sessionId={session.sessionId}
              liveVideoState={liveVideoState}
              liveVideoCompositeBlob={liveVideoCompositeBlob}
              onSaved={(result) =>
                dispatch({ type: "PHOTO_SAVED", payload: result })
              }
              onRetake={() => dispatch({ type: "RETAKE" })}
            />
          )}

        {screen === "DELIVERY" && session.downloadUrl && (
          <DeliveryScreen
            booth={booth}
            downloadUrl={session.downloadUrl}
            photoUrl={session.photoUrl ?? undefined}
            printerName={hwSettings.printerName ?? undefined}
            printCount={session.printCount}
            canvasWidth={session.selectedFrame?.canvasWidth}
            canvasHeight={session.selectedFrame?.canvasHeight}
            onDone={handleReset}
          />
        )}
      </ScreenErrorBoundary>

      {/* Session countdown timer — top-right overlay */}
      {timerSecondsLeft !== null && (
        <BoothTimer
          secondsLeft={timerSecondsLeft}
          totalSeconds={timerTotal}
          posX={booth.welcomeScreenPrefs?.timerX}
          posY={booth.welcomeScreenPrefs?.timerY}
          ringColor={booth.welcomeScreenPrefs?.timerRingColor}
          bgColor={booth.welcomeScreenPrefs?.timerBgColor}
        />
      )}
    </div>
  );
}
