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
import { PromoBannerOverlay } from "./screens/PromoBannerOverlay";
import { composeVideoLive, isOverlayFrame } from "@/lib/frameEngine";
import { EMPTY_SESSION, type BoothConfigData, type BoothHardwareSettings, type BoothScreen, type BoothSessionState, type FrameData, type PaymentMethod, type VoucherInfo } from "./types";
import VoucherScreen from "./screens/VoucherScreen";
import { BoothTimer } from "./screens/BoothTimer";
import { cleanupRecoverySnapshots, getRecoverySnapshot, listRecoverySnapshots, markLogResumeUsed, removeRecoverySnapshot, saveRecoverySnapshot, type RecoverySnapshot } from "./sessionRecovery";
import { createCaptureIndexResolver, getEffectiveCaptureCount, getEffectiveSlots, isEffectiveDuplicateMode, mapSlotsToCaptureIndexes } from "./frameSlotUtils";

function useIsPortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return portrait;
}

const DEFAULT_HW_SETTINGS: BoothHardwareSettings = {
  cameraDeviceId: null,
  cameraMirror:   true,
  printerName:    null,
  paperSize:      null,
  setupCompleted: false,
};

/**
 * Jumlah capture (shutter) yang diperlukan untuk frame ini.
 * Mode "duplicate": tiap capture = 2 slot simetris, jadi hanya perlu slots.length/2 capture.
 */
function totalCaptures(frame: FrameData | null | undefined): number {
  if (!frame) return 1;
  return getEffectiveCaptureCount(frame);
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
  | { type: "PAYMENT_CREATED"; payload: { sessionId: string; orderId: string; amount: number; qrImageUrl: string | null; qrString: string | null; snapToken: string | null; snapClientKey: string | null; snapRedirectUrl: string | null; expiresAt: Date | null } }
  | { type: "VOUCHER_VALIDATED"; payload: VoucherInfo }
  | { type: "VOUCHER_SESSION_CREATED"; payload: { sessionId: string } }
  | { type: "PAYMENT_SUCCESS"; payload: { sessionId: string } }
  | { type: "FRAME_SELECTED";  payload: { frame: FrameData } }
  | { type: "PHOTO_CAPTURED";  payload: { dataUrl: string; videoBlob: Blob | null } }
  | { type: "PHOTO_REVIEW_CONFIRM" }   // user tekan Lanjut di preview satu foto
  | { type: "PHOTO_RETAKE_SINGLE" }   // user tekan Ulangi di preview satu foto
  | { type: "PHOTO_SAVED";     payload: { photoUrl: string; videoUrl: string | null; downloadUrl: string; printImageDataUrl?: string } }
  | { type: "RETAKE" }
  | { type: "RESET" }
  | { type: "SETUP_COMPLETE"; payload: BoothHardwareSettings }
  | { type: "GOTO_SETUP" }
  | { type: "LIVE_VIDEO_COMPOSITING" }
  | { type: "LIVE_VIDEO_DONE"; payload: Blob | null }
  | { type: "PHOTO_VIDEO_READY"; payload: { videoBlob: Blob | null; captureIndex?: number } }
  | { type: "RETAKE_SLOT"; payload: { slotIndex: number } }
  | { type: "PROCEED_TO_PREVIEW" }
  | { type: "RESUME_SESSION"; payload: RecoverySnapshot }

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
          snapToken:        action.payload.snapToken,
          snapClientKey:    action.payload.snapClientKey,
          snapRedirectUrl:  action.payload.snapRedirectUrl,
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
          printImageDataUrl: action.payload.printImageDataUrl ?? null,
          photoUrl:    action.payload.photoUrl,
          videoUrl:    action.payload.videoUrl,
          downloadUrl: action.payload.downloadUrl,
        },
      };

    case "RESUME_SESSION":
      return {
        ...state,
        screen: "CAMERA",
        isCreating: false,
        currentVideoReady: false,
        retakeSlotIndex: null,
        allPhotosDone: false,
        liveVideoState: "idle",
        liveVideoCompositeBlob: null,
        session: {
          ...EMPTY_SESSION,
          sessionId: action.payload.sessionId,
          orderId: action.payload.orderId,
          amount: action.payload.amount,
          printCount: action.payload.printCount,
          paymentMethod: action.payload.paymentMethod,
          selectedFrame: action.payload.frame,
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
      const idx = typeof action.payload.captureIndex === "number"
        ? action.payload.captureIndex
        : state.retakeSlotIndex !== null
        ? state.retakeSlotIndex
        : state.session.capturedVideos.length - 1;
      if (idx < 0 || idx >= state.session.capturedVideos.length) return state;
      const newVids = [...state.session.capturedVideos];
      newVids[idx] = action.payload.videoBlob;
      const activeIdx = state.retakeSlotIndex !== null
        ? state.retakeSlotIndex
        : state.session.capturedVideos.length - 1;
      return {
        ...state,
        currentVideoReady: state.screen === "PHOTO_REVIEW" && idx === activeIdx ? true : state.currentVideoReady,
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

interface RecoveryTransactionLog {
  id: string;
  orderId: string | null;
  amount: number;
  method: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";
  paidAt: string | null;
  createdAt: string;
  expiresAt: string;
  boothSession: {
    id: string;
    status: "PENDING" | "ACTIVE" | "COMPLETED";
    frameId: string | null;
    frameName: string | null;
    startedAt: string;
    completedAt: string | null;
    photoUrl: string | null;
  } | null;
}

export function BoothClient({ booth, frames, previewScreen }: BoothClientProps) {
  // eslint-disable-next-line no-console
  console.log("[BoothClient] mount", { slug: booth?.slug, previewScreen });
  const mappedPreviewScreen = previewScreen ? (PREVIEW_SCREEN_MAP[previewScreen] ?? "IDLE") : null;
  const isPortrait = useIsPortrait();
  const boothPrefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
  const isPinEnabled = Boolean(boothPrefs?.boothAccessPinEnabled);
  const configuredPin = typeof boothPrefs?.boothAccessPin === "string" ? boothPrefs.boothAccessPin : "";
  const requiresPinGate = !mappedPreviewScreen && isPinEnabled && /^\d{6}$/.test(configuredPin);
  const requiresDeviceLock = !mappedPreviewScreen;

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
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [deviceLockState, setDeviceLockState] = useState<"checking" | "granted" | "denied" | "error">(
    requiresDeviceLock ? "checking" : "granted"
  );
  const [deviceLockRetryCount, setDeviceLockRetryCount] = useState(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLogs, setRecoveryLogs] = useState<RecoveryTransactionLog[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryCheckingId, setRecoveryCheckingId] = useState<string | null>(null);
  const [recoveryConfirm, setRecoveryConfirm] = useState<{ snapshot: RecoverySnapshot; frameName: string } | null>(null);
  const [localSnapshots, setLocalSnapshots] = useState<RecoverySnapshot[]>([]);

  // Load hardware settings from localStorage on mount (client-only)
  // Dilewati kalau dalam preview mode
  // Windows app: selalu tampilkan setting dulu agar user bisa cek koneksi Canon
  useEffect(() => {
    if (mappedPreviewScreen) return;
    const isWindowsApp = typeof window !== "undefined" && Boolean(window.fremioBooth);
    if (isWindowsApp) return; // Windows app selalu mulai dari BOOTH_SETUP
    const saved = loadHardwareSettings(booth.slug);
    if (saved?.setupCompleted) {
      dispatch({ type: "SETUP_COMPLETE", payload: saved });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { screen, isCreating, session, hwSettings, liveVideoState, liveVideoCompositeBlob, currentVideoReady, retakeSlotIndex, allPhotosDone } = state;
  const { primaryColor, accentColor }    = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);
  const livePhotoVideoEnabled = booth.welcomeScreenPrefs?.livePhotoVideoEnabled ?? true;

  const refreshLocalSnapshots = useCallback(() => {
    cleanupRecoverySnapshots(booth.slug);
    setLocalSnapshots(listRecoverySnapshots(booth.slug));
  }, [booth.slug]);

  const loadRecoveryLogs = useCallback(async () => {
    setRecoveryLoading(true);
    setRecoveryError(null);
    try {
      const res = await fetch(`/api/booth/${booth.slug}/transactions`, { cache: "no-store" });
      const json = await res.json() as { success: boolean; data?: RecoveryTransactionLog[]; error?: string };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Gagal mengambil log transaksi.");
      }
      setRecoveryLogs(json.data);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : "Gagal mengambil log transaksi.");
    } finally {
      setRecoveryLoading(false);
    }
  }, [booth.slug]);

  useEffect(() => {
    refreshLocalSnapshots();
  }, [refreshLocalSnapshots]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!recoveryOpen) return;
    refreshLocalSnapshots();
    void loadRecoveryLogs();
  }, [recoveryOpen, loadRecoveryLogs, refreshLocalSnapshots]);

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
    if (!livePhotoVideoEnabled) return;
    // Tunggu video slot saat ini selesai direkam
    if (!currentVideoReady) return;
    const frame = session.selectedFrame;
    if (!frame) return;

    const totalNeeded = totalCaptures(frame);

    // Hanya mulai pada review foto terakhir
    if (session.capturedPhotos.length < totalNeeded) return;
    // Jika semua video null (browser tidak support rekaman), langsung set error
    // supaya UI tetap menampilkan kolom video dengan pesan "tidak tersedia"
    if (!session.capturedVideos.some(Boolean)) {
      const errKey = `${session.sessionId ?? ""}_${session.capturedPhotos.length}_novid`;
      if (composeKeyRef.current === errKey) return;
      composeKeyRef.current = errKey;
      dispatch({ type: "LIVE_VIDEO_DONE", payload: null }); // → liveVideoState = "error"
      return;
    }

    // Cek apakah canvas.captureStream tersedia (tidak ada di iOS Safari/Chrome)
    // Jika tidak, gunakan raw video blob langsung tanpa compositing
    const captureStreamSupported = (() => {
      try {
        const el = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: () => MediaStream };
        return typeof el.captureStream === "function";
      } catch { return false; }
    })();
    if (!captureStreamSupported) {
      const rawBlob = session.capturedVideos.find(Boolean) ?? null;
      const rawKey = `${session.sessionId ?? ""}_${session.capturedPhotos.length}_raw`;
      if (composeKeyRef.current === rawKey) return;
      composeKeyRef.current = rawKey;
      dispatch({ type: "LIVE_VIDEO_DONE", payload: rawBlob });
      return;
    }

    // Unique key: jangan double-trigger untuk set foto yang sama
    const key = `${session.sessionId ?? ""}_${session.capturedPhotos.length}`;
    if (composeKeyRef.current === key) return;
    composeKeyRef.current = key;

    let cancelled = false;
    dispatch({ type: "LIVE_VIDEO_COMPOSITING" });

    const effectiveSlots = getEffectiveSlots(frame);
    const resolvedEffectiveSlots = mapSlotsToCaptureIndexes(effectiveSlots, isEffectiveDuplicateMode(frame));

    composeVideoLive(session.capturedVideos, frame.assetUrl, {
      canvasWidth:     frame.canvasWidth  || 1080,
      canvasHeight:    frame.canvasHeight || 1920,
      slots:           resolvedEffectiveSlots,
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
  }, [currentVideoReady, session.capturedPhotos.length, livePhotoVideoEnabled]);

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

      // Safely parse JSON — non-JSON response (e.g. Nginx 502 HTML) causes SyntaxError
      let body: { success: boolean; data?: { sessionId: string; orderId: string; amount: number; qrImageUrl: string; qrString: string; snapToken?: string; snapClientKey?: string; snapRedirectUrl?: string; expiresAt: string }; error?: string };
      try {
        body = await res.json() as typeof body;
      } catch {
        throw new Error(`Server error (${res.status}). Coba lagi sebentar.`);
      }

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
          snapToken:  body.data.snapToken   ?? null,
          snapClientKey: body.data.snapClientKey ?? null,
          snapRedirectUrl: body.data.snapRedirectUrl ?? null,
          expiresAt:  body.data.expiresAt ? new Date(body.data.expiresAt) : null,
        },
      });
    } catch (err) {
      console.error("[BoothClient] handleCreatePayment:", err);
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan, silakan coba lagi.";
      setErrorToast(msg);
      // Kembali ke FRAME_SELECT (bukan RESET ke IDLE) agar user bisa retry
      dispatch({ type: "FRAME_SELECTED", payload: { frame: state.session.selectedFrame! } });
    }
  }, [booth.id, state.session.selectedFrame]);

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
          data?: { sessionId: string; orderId: string; amount: number; qrImageUrl: string; qrString: string; snapToken?: string; snapClientKey?: string; snapRedirectUrl?: string; expiresAt: string };
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
            snapToken:  json.data.snapToken   ?? null,
            snapClientKey: json.data.snapClientKey ?? null,
            snapRedirectUrl: json.data.snapRedirectUrl ?? null,
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

  // handleCreateCashSession — dipanggil setelah print count dikonfirmasi, ketika paymentMethod === CASH
  const handleCreateCashSession = useCallback(async (printCount: number, frameId?: string) => {
    dispatch({ type: "PRINT_COUNT_CONFIRMED", payload: { count: printCount } });
    try {
      const res  = await fetch("/api/sessions/cash", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ boothConfigId: booth.id, frameId, printCount }),
      });

      let json: { success: boolean; data?: { sessionId: string }; error?: string };
      try {
        json = await res.json() as typeof json;
      } catch {
        throw new Error(`Sesi cash gagal (${res.status}). Coba lagi.`);
      }

      if (!res.ok) {
        throw new Error(json?.error || `Sesi cash gagal (${res.status})`);
      }
      if (!json.success || !json.data) throw new Error(json.error ?? "Gagal membuat sesi");
      dispatch({ type: "VOUCHER_SESSION_CREATED", payload: { sessionId: json.data.sessionId } });
    } catch (err) {
      console.error("[BoothClient] handleCreateCashSession:", err);
      dispatch({ type: "RESET" });
      alert(err instanceof Error ? err.message : "Terjadi kesalahan, silakan coba lagi.");
    }
  }, [booth.id]);

  const handleReset = useCallback(() => dispatch({ type: "RESET" }), []);

  // Back navigation handlers
  const handleBackFromTutorial = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const handleBackFromPaymentMethod = useCallback(() => {
    dispatch({ type: "GOTO_TUTORIAL" });
  }, []);

  const handleBackFromFrameSelect = useCallback(() => {
    dispatch({ type: "TUTORIAL_DONE" });
  }, []);

  const handleBackFromPrintCount = useCallback(() => {
    dispatch({ type: "FRAME_SELECTED", payload: { frame: session.selectedFrame! } });
  }, [session.selectedFrame]);

  useEffect(() => {
    if (mappedPreviewScreen) return;
    if (!session.sessionId || !session.selectedFrame) return;
    if (screen === "IDLE" || screen === "BOOTH_SETUP" || screen === "TUTORIAL" || screen === "PAYMENT_METHOD") return;
    const existing = getRecoverySnapshot(booth.slug, session.sessionId);
    saveRecoverySnapshot({
      sessionId: session.sessionId,
      orderId: session.orderId,
      boothSlug: booth.slug,
      frame: session.selectedFrame,
      amount: session.amount,
      printCount: session.printCount,
      paymentMethod: session.paymentMethod,
      sourceScreen: screen,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logResumeUsedAt: existing?.logResumeUsedAt ?? null,
    });
    refreshLocalSnapshots();
  }, [mappedPreviewScreen, session.sessionId, session.selectedFrame, session.orderId, session.amount, session.printCount, session.paymentMethod, booth.slug, screen, refreshLocalSnapshots]);

  useEffect(() => {
    if (!session.sessionId || screen !== "DELIVERY" || !session.photoUrl) return;
    removeRecoverySnapshot(booth.slug, session.sessionId);
    refreshLocalSnapshots();
  }, [booth.slug, refreshLocalSnapshots, screen, session.photoUrl, session.sessionId]);

  const handleRecoveryCheck = useCallback(async (log: RecoveryTransactionLog) => {
    const boothSessionId = log.boothSession?.id;
    if (!boothSessionId) return;

    const snapshot = getRecoverySnapshot(booth.slug, boothSessionId);
    if (!snapshot) {
      setErrorToast("Sesi ini hanya bisa dilanjutkan dari perangkat booth yang sama. Snapshot frame lokal tidak ditemukan.");
      return;
    }
    if (snapshot.logResumeUsedAt) {
      setErrorToast("Jatah lanjutkan dari log untuk sesi ini sudah dipakai. User hanya punya satu fallback dari log.");
      return;
    }

    setRecoveryCheckingId(boothSessionId);
    try {
      let txStatus = log.status;
      let sessionStatus = log.boothSession?.status ?? "PENDING";

      if (log.orderId) {
        const res = await fetch(`/api/payment/status/${encodeURIComponent(log.orderId)}`, { cache: "no-store" });
        const json = await res.json() as { success: boolean; data?: { status: RecoveryTransactionLog["status"]; sessionStatus: "PENDING" | "ACTIVE" | "COMPLETED" }; error?: string };
        if (res.ok && json.success && json.data) {
          txStatus = json.data.status;
          sessionStatus = json.data.sessionStatus;
        }
      }

      if (sessionStatus === "COMPLETED") {
        removeRecoverySnapshot(booth.slug, boothSessionId);
        refreshLocalSnapshots();
        setErrorToast("Sesi ini sudah selesai. Tidak perlu dilanjutkan lagi.");
        return;
      }

      if (txStatus !== "SUCCESS" && sessionStatus !== "ACTIVE") {
        setErrorToast("Pembayaran sesi ini belum terverifikasi sukses. Tidak bisa dilanjutkan dulu.");
        return;
      }

      setRecoveryConfirm({
        snapshot,
        frameName: log.boothSession?.frameName ?? snapshot.frame.name,
      });
    } catch {
      setErrorToast("Status pembayaran tidak bisa dicek saat ini. Coba lagi saat internet stabil.");
    } finally {
      setRecoveryCheckingId(null);
    }
  }, [booth.slug, refreshLocalSnapshots]);

  const handleResumeConfirmed = useCallback(() => {
    if (!recoveryConfirm) return;
    const updatedSnapshot = markLogResumeUsed(booth.slug, recoveryConfirm.snapshot.sessionId) ?? {
      ...recoveryConfirm.snapshot,
      logResumeUsedAt: new Date().toISOString(),
    };
    dispatch({ type: "RESUME_SESSION", payload: updatedSnapshot });
    setRecoveryConfirm(null);
    setRecoveryOpen(false);
    refreshLocalSnapshots();
  }, [booth.slug, recoveryConfirm, refreshLocalSnapshots]);

  // ─── Booth session timer ──────────────────────────────────────────────────
  // Screens that START a fresh countdown when entered
  // In preview mode all timers are disabled so screens don't auto-reset to IDLE
  const TIMER_DURATIONS: Partial<Record<BoothScreen, number>> = mappedPreviewScreen ? {} : {
    TUTORIAL:     booth.timerTutorialSeconds    || 0,
    FRAME_SELECT: booth.timerFrameSelectSeconds || 0,
    PRINT_COUNT:  booth.timerPrintCountSeconds  || 0,
    PAYMENT:      booth.timerPaymentSeconds     || 0,
    CAMERA:       booth.timerCameraSeconds      || 0,
    PREVIEW:      booth.timerPreviewSeconds     || 0,
    DELIVERY:     booth.timerDeliverySeconds    || 0,
  };
  // Auto-skip payment method screen jika ≤1 metode aktif
  useEffect(() => {
    if (screen !== "PAYMENT_METHOD") return;
    const savedMethods = liveWelcomePrefs?.enabledPaymentMethods as string[] | undefined;
    const ALL_METHODS: PaymentMethod[] = ["TICKET", "CASHLESS", "VOUCHER", "CASH"];
    const visible = savedMethods ? ALL_METHODS.filter((m) => savedMethods.includes(m)) : ALL_METHODS;
    if (visible.length === 0) {
      // Semua dimatikan → fallback ke CASH agar sesi tetap bisa jalan
      dispatch({ type: "PAYMENT_METHOD_SELECTED", payload: { method: "CASH" } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Screens that inherit the running timer from the previous screen
  const TIMER_CARRY: BoothScreen[] = ["PAYMENT_METHOD", "VOUCHER_INPUT", "PHOTO_REVIEW"];

  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
  const [timerTotal,       setTimerTotal]       = useState<number>(180);
  const [cameraCountingDown, setCameraCountingDown] = useState(false);

  // ─── Promo banner inactivity timer ───────────────────────────────────────
  const [showPromoBanner, setShowPromoBanner] = useState(false);
  const [livePromoPrefs, setLivePromoPrefs] = useState<{
    promoBanners:     { imageUrl: string }[];
    promoIdleSeconds: number;
    promoSlideSeconds: number;
  } | null>(null);
  const promoBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live welcome screen prefs — di-refresh setiap kali masuk IDLE atau PAYMENT_METHOD
  // agar perubahan dari dashboard (misal: metode pembayaran) langsung terpantau.
  const [liveWelcomePrefs, setLiveWelcomePrefs] = useState<Record<string, unknown> | null>(
    () => booth.welcomeScreenPrefs as Record<string, unknown> | null
  );

  useEffect(() => {
    if (screen !== "IDLE" && screen !== "PAYMENT_METHOD") return;
    let cancelled = false;
    fetch(`/api/booth/${booth.slug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json: { data?: { booth?: { welcomeScreenPrefs?: unknown } } } | null) => {
        if (cancelled) return;
        const prefs = json?.data?.booth?.welcomeScreenPrefs;
        if (prefs !== undefined) setLiveWelcomePrefs(prefs as Record<string, unknown> | null);
      })
      .catch(() => { /* silently keep existing prefs */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    if (screen !== "IDLE") {
      setShowPromoBanner(false);
      if (promoBannerTimerRef.current) clearTimeout(promoBannerTimerRef.current);
      return;
    }

    let cancelled = false;

    async function fetchAndStartTimer() {
      // Fetch prefs fresh — booth prop may be stale if banners were added after page load
      let banners: { imageUrl: string }[] = [];
      let idleSecs  = 120;
      let slideSecs = 8;
      try {
        const res = await fetch(`/api/booth/${booth.slug}`);
        if (res.ok) {
          const json = await res.json() as { data?: { booth?: { welcomeScreenPrefs?: Record<string, unknown> } } };
          const prefs = json.data?.booth?.welcomeScreenPrefs;
          if (prefs) {
            banners   = (prefs.promoBanners    as { imageUrl: string }[]) ?? [];
            idleSecs  = (prefs.promoIdleSeconds  as number) ?? 120;
            slideSecs = (prefs.promoSlideSeconds as number) ?? 8;
          }
        }
      } catch { /* silently use defaults */ }

      if (cancelled || banners.length === 0) return;

      setLivePromoPrefs({ promoBanners: banners, promoIdleSeconds: idleSecs, promoSlideSeconds: slideSecs });
      promoBannerTimerRef.current = setTimeout(() => {
        if (!cancelled) setShowPromoBanner(true);
      }, idleSecs * 1000);
    }

    fetchAndStartTimer();

    return () => {
      cancelled = true;
      if (promoBannerTimerRef.current) clearTimeout(promoBannerTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, booth.slug]);

  // Track previous screen to detect PHOTO_REVIEW → CAMERA transitions (retake)
  const prevScreenRef = useRef<BoothScreen | null>(null);

  // Reset / start timer on screen change
  useEffect(() => {
    const prevScreen = prevScreenRef.current;
    prevScreenRef.current = screen;
    // Carry timer for screens that inherit from the previous screen
    if ((TIMER_CARRY as string[]).includes(screen)) return;
    // Also carry when re-entering CAMERA from PHOTO_REVIEW (user clicked Lanjut/Ulangi)
    if (screen === "CAMERA" && prevScreen === "PHOTO_REVIEW") return;
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
    if (isOffline) return;
    if (timerSecondsLeft <= 0) {
      const id = setTimeout(handleReset, 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setTimerSecondsLeft((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [timerSecondsLeft, handleReset, isOffline]);

  // ─── Fullscreen ───────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsToast, setFsToast]     = useState<string | null>(null);
  const [showSettingsButton, setShowSettingsButton] = useState(false);
  const [idleSettingsOpen, setIdleSettingsOpen] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinUnlocked, setPinUnlocked] = useState<boolean>(() => !requiresPinGate);
  const [pinActiveIndex, setPinActiveIndex] = useState(0);
  const pinInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // ─── Settings PIN gate ─────────────────────────────────────────────────
  const [settingsPinUnlockedAt, setSettingsPinUnlockedAt] = useState<number | null>(null);
  const [showSettingsPinGate, setShowSettingsPinGate] = useState(false);
  const [settingsPinDigits, setSettingsPinDigits] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [settingsPinError, setSettingsPinError] = useState<string | null>(null);
  const [settingsPinActiveIndex, setSettingsPinActiveIndex] = useState(0);
  const settingsPinInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const idleSettingsTapTimesRef = useRef<number[]>([]);
  const idleSettingsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  const retryDeviceLock = useCallback(() => {
    setDeviceLockRetryCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!requiresDeviceLock || typeof window === "undefined") {
      setDeviceLockState("granted");
      return;
    }

    const storageKey = `booth_device_id_${booth.slug}`;
    let deviceId = window.localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      try {
        window.localStorage.setItem(storageKey, deviceId);
      } catch {
        // Ignore quota/storage failures; keep deviceId in memory for this session.
      }
    }
    deviceIdRef.current = deviceId;

    let cancelled = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;

    const acquire = async () => {
      setDeviceLockState("checking");
      try {
        const res = await fetch(`/api/booth/${booth.slug}/device-lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        if (!res.ok) {
          if (res.status === 409) {
            if (!cancelled) setDeviceLockState("denied");
            return;
          }
          throw new Error("Gagal memverifikasi perangkat.");
        }
        if (cancelled) return;
        setDeviceLockState("granted");

        heartbeatId = setInterval(async () => {
          try {
            const hbRes = await fetch(`/api/booth/${booth.slug}/device-lock`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId }),
            });
            if (hbRes.status === 409) {
              setDeviceLockState("denied");
              if (heartbeatId) {
                clearInterval(heartbeatId);
                heartbeatId = null;
              }
            }
          } catch {
            // keep silent, next heartbeat will retry
          }
        }, 10_000);
      } catch {
        if (!cancelled) setDeviceLockState("error");
      }
    };

    void acquire();

    const releaseLock = () => {
      if (!deviceIdRef.current) return;
      const payload = JSON.stringify({ deviceId: deviceIdRef.current, action: "release" });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(`/api/booth/${booth.slug}/device-lock`, blob);
    };

    window.addEventListener("beforeunload", releaseLock);
    window.addEventListener("pagehide", releaseLock);

    return () => {
      cancelled = true;
      if (heartbeatId) clearInterval(heartbeatId);
      window.removeEventListener("beforeunload", releaseLock);
      window.removeEventListener("pagehide", releaseLock);

      const activeDeviceId = deviceIdRef.current;
      if (!activeDeviceId) return;
      fetch(`/api/booth/${booth.slug}/device-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: activeDeviceId, action: "release" }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [booth.slug, requiresDeviceLock, deviceLockRetryCount]);

  const focusPinInput = useCallback((index: number) => {
    const el = pinInputRefs.current[index];
    if (!el) return;
    el.focus();
    el.select();
    setPinActiveIndex(index);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!requiresPinGate) {
      setPinUnlocked(true);
      setPinDigits(Array.from({ length: 6 }, () => ""));
      setPinError(null);
      return;
    }

    const key = `booth_pin_unlock_${booth.slug}_${configuredPin}`;
    const unlocked = window.sessionStorage.getItem(key) === "1";
    setPinUnlocked(unlocked);
    setPinDigits(Array.from({ length: 6 }, () => ""));
    setPinError(null);
    if (!unlocked) {
      setTimeout(() => focusPinInput(0), 0);
    }
  }, [booth.slug, configuredPin, focusPinInput, requiresPinGate]);

  const handlePinDigitChange = useCallback((index: number, rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, "");
    if (digitsOnly.length === 0) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      setPinActiveIndex(index);
      if (pinError) setPinError(null);
      return;
    }

    // Support paste multi-digit (mis. paste 6 angka)
    if (digitsOnly.length > 1) {
      let cursor = index;
      setPinDigits((prev) => {
        const next = [...prev];
        for (const char of digitsOnly) {
          if (cursor >= 6) break;
          next[cursor] = char;
          cursor += 1;
        }
        return next;
      });
      const target = Math.min(cursor, 5);
      setTimeout(() => focusPinInput(target), 0);
      if (pinError) setPinError(null);
      return;
    }

    // Single digit: isi lalu auto-tab ke kolom berikutnya
    setPinDigits((prev) => {
      const next = [...prev];
      next[index] = digitsOnly;
      return next;
    });
    const target = index < 5 ? index + 1 : 5;
    setTimeout(() => focusPinInput(target), 0);
    if (pinError) setPinError(null);
  }, [focusPinInput, pinError]);

  const handlePinKeyDown = useCallback((index: number, key: string) => {
    if (key === "ArrowLeft") {
      if (index > 0) setTimeout(() => focusPinInput(index - 1), 0);
      return;
    }
    if (key === "ArrowRight") {
      if (index < 5) setTimeout(() => focusPinInput(index + 1), 0);
      return;
    }

    if (key !== "Backspace" && key !== "Delete") return;

    if (pinDigits[index]) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      setTimeout(() => focusPinInput(index), 0);
    } else if (index > 0) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
      setTimeout(() => focusPinInput(index - 1), 0);
    }
    if (pinError) setPinError(null);
  }, [focusPinInput, pinDigits, pinError]);

  const handlePinDelete = useCallback(() => {
    const idx = pinActiveIndex;

    if (pinDigits[idx]) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[idx] = "";
        return next;
      });
      setTimeout(() => focusPinInput(idx), 0);
      if (pinError) setPinError(null);
      return;
    }

    if (idx > 0) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[idx - 1] = "";
        return next;
      });
      setTimeout(() => focusPinInput(idx - 1), 0);
      if (pinError) setPinError(null);
      return;
    }

    // fallback: kalau fokus di index 0 dan kosong, hapus index 0 jika ada
    if (pinDigits[0]) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[0] = "";
        return next;
      });
      setTimeout(() => focusPinInput(0), 0);
    }
    if (pinError) setPinError(null);
  }, [focusPinInput, pinActiveIndex, pinDigits, pinError]);

  const handlePinSubmit = useCallback(() => {
    const pinInput = pinDigits.join("");
    if (!requiresPinGate) {
      setPinUnlocked(true);
      return;
    }
    if (!/^\d{6}$/.test(pinInput)) {
      setPinError("Masukkan 6 digit PIN.");
      return;
    }
    if (pinInput !== configuredPin) {
      setPinError("PIN salah. Coba lagi.");
      setPinDigits(Array.from({ length: 6 }, () => ""));
      setTimeout(() => focusPinInput(0), 0);
      return;
    }
    if (typeof window !== "undefined") {
      const key = `booth_pin_unlock_${booth.slug}_${configuredPin}`;
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        // Ignore quota/storage failures; keep unlock state in memory.
      }
    }
    setPinUnlocked(true);
    setPinError(null);
  }, [booth.slug, configuredPin, focusPinInput, pinDigits, requiresPinGate]);

  const pinValue = pinDigits.join("");
  useEffect(() => {
    if (!requiresPinGate || pinUnlocked) return;
    if (!/^\d{6}$/.test(pinValue)) return;

    const id = setTimeout(() => handlePinSubmit(), 40);
    return () => clearTimeout(id);
  }, [handlePinSubmit, pinUnlocked, pinValue, requiresPinGate]);

  // ─── Settings PIN gate helpers ──────────────────────────────────────────
  const isSettingsAccessValid =
    settingsPinUnlockedAt !== null &&
    Date.now() - settingsPinUnlockedAt < 2 * 60 * 1000;

  const focusSettingsPinInput = useCallback((index: number) => {
    const el = settingsPinInputRefs.current[index];
    if (!el) return;
    el.focus();
    el.select();
    setSettingsPinActiveIndex(index);
  }, []);

  const handleSettingsPinDigitChange = useCallback((index: number, rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, "");
    if (digitsOnly.length === 0) {
      setSettingsPinDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      setSettingsPinActiveIndex(index);
      if (settingsPinError) setSettingsPinError(null);
      return;
    }
    if (digitsOnly.length > 1) {
      let cursor = index;
      setSettingsPinDigits((prev) => {
        const next = [...prev];
        for (const char of digitsOnly) {
          if (cursor >= 6) break;
          next[cursor] = char;
          cursor++;
        }
        return next;
      });
      const target = Math.min(cursor, 5);
      setTimeout(() => focusSettingsPinInput(target), 0);
      if (settingsPinError) setSettingsPinError(null);
      return;
    }
    setSettingsPinDigits((prev) => {
      const next = [...prev];
      next[index] = digitsOnly;
      return next;
    });
    const target = index < 5 ? index + 1 : 5;
    setTimeout(() => focusSettingsPinInput(target), 0);
    if (settingsPinError) setSettingsPinError(null);
  }, [focusSettingsPinInput, settingsPinError]);

  const handleSettingsPinKeyDown = useCallback((index: number, key: string) => {
    if (key === "ArrowLeft") {
      if (index > 0) setTimeout(() => focusSettingsPinInput(index - 1), 0);
      return;
    }
    if (key === "ArrowRight") {
      if (index < 5) setTimeout(() => focusSettingsPinInput(index + 1), 0);
      return;
    }
    if (key !== "Backspace" && key !== "Delete") return;
    if (settingsPinDigits[index]) {
      setSettingsPinDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      setTimeout(() => focusSettingsPinInput(index), 0);
    } else if (index > 0) {
      setSettingsPinDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
      setTimeout(() => focusSettingsPinInput(index - 1), 0);
    }
    if (settingsPinError) setSettingsPinError(null);
  }, [focusSettingsPinInput, settingsPinDigits, settingsPinError]);

  const handleSettingsPinDelete = useCallback(() => {
    const idx = settingsPinActiveIndex;
    if (settingsPinDigits[idx]) {
      setSettingsPinDigits((prev) => { const next = [...prev]; next[idx] = ""; return next; });
      setTimeout(() => focusSettingsPinInput(idx), 0);
      if (settingsPinError) setSettingsPinError(null);
      return;
    }
    if (idx > 0) {
      setSettingsPinDigits((prev) => { const next = [...prev]; next[idx - 1] = ""; return next; });
      setTimeout(() => focusSettingsPinInput(idx - 1), 0);
      if (settingsPinError) setSettingsPinError(null);
      return;
    }
    if (settingsPinDigits[0]) {
      setSettingsPinDigits((prev) => { const next = [...prev]; next[0] = ""; return next; });
      setTimeout(() => focusSettingsPinInput(0), 0);
    }
    if (settingsPinError) setSettingsPinError(null);
  }, [focusSettingsPinInput, settingsPinActiveIndex, settingsPinDigits, settingsPinError]);

  const handleSettingsPinSubmit = useCallback(() => {
    const pinInput = settingsPinDigits.join("");
    if (!/^\d{6}$/.test(pinInput)) {
      setSettingsPinError("Masukkan 6 digit PIN.");
      return;
    }
    if (pinInput !== configuredPin) {
      setSettingsPinError("PIN salah. Coba lagi.");
      setSettingsPinDigits(Array.from({ length: 6 }, () => ""));
      setTimeout(() => focusSettingsPinInput(0), 0);
      return;
    }
    setSettingsPinUnlockedAt(Date.now());
    setSettingsPinError(null);
    setShowSettingsPinGate(false);
    setIdleSettingsOpen(true);
    setSettingsPinDigits(Array.from({ length: 6 }, () => ""));
  }, [configuredPin, focusSettingsPinInput, settingsPinDigits]);

  const settingsPinValue = settingsPinDigits.join("");
  useEffect(() => {
    if (!showSettingsPinGate) return;
    if (!/^\d{6}$/.test(settingsPinValue)) return;
    const id = setTimeout(() => handleSettingsPinSubmit(), 40);
    return () => clearTimeout(id);
  }, [handleSettingsPinSubmit, settingsPinValue, showSettingsPinGate]);

  // Auto-expire settings access after 2 minutes
  useEffect(() => {
    if (settingsPinUnlockedAt === null) return;
    const elapsed = Date.now() - settingsPinUnlockedAt;
    const remaining = Math.max(0, 2 * 60 * 1000 - elapsed);
    const timer = setTimeout(() => {
      setSettingsPinUnlockedAt(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [settingsPinUnlockedAt]);
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

  const registerIdleSettingsTap = useCallback(() => {
    if (screen !== "IDLE") return;

    const now = Date.now();
    const threshold = now - 1000;
    const recent = idleSettingsTapTimesRef.current.filter((ts) => ts >= threshold);
    recent.push(now);
    idleSettingsTapTimesRef.current = recent;

    if (recent.length < 2) return;

    idleSettingsTapTimesRef.current = [];
    setShowSettingsButton(true);

    // Clear existing timer
    if (idleSettingsHideTimerRef.current) clearTimeout(idleSettingsHideTimerRef.current);
  }, [screen]);

  useEffect(() => {
    return () => {
      if (idleSettingsHideTimerRef.current) clearTimeout(idleSettingsHideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Start hide timer when settings menu is closed but button is still visible
    if (!idleSettingsOpen && showSettingsButton) {
      if (idleSettingsHideTimerRef.current) clearTimeout(idleSettingsHideTimerRef.current);
      idleSettingsHideTimerRef.current = setTimeout(() => {
        setShowSettingsButton(false);
      }, 8000);
    }
    
    // Clear timer when settings menu is open
    if (idleSettingsOpen) {
      if (idleSettingsHideTimerRef.current) clearTimeout(idleSettingsHideTimerRef.current);
    }
  }, [idleSettingsOpen, showSettingsButton]);

  useEffect(() => {
    if (screen === "IDLE") return;
    setIdleSettingsOpen(false);
  }, [screen]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`fixed inset-0 ${screen === "BOOTH_SETUP" ? "overflow-y-auto" : "overflow-hidden"}`}
      style={{ backgroundColor: primaryColor, color: textPrimary }}
      onPointerDownCapture={(e) => {
        registerIdleSettingsTap();
      }}
    >
      {requiresDeviceLock && deviceLockState === "checking" && (
        <div className="absolute inset-0 z-[1300] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.78)" }}>
          <div className="rounded-3xl px-6 py-5 text-center"
            style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.16)" }}>
            <p className="text-white font-semibold text-base">Memeriksa akses perangkat...</p>
            <p className="text-white/60 text-xs mt-2">Mohon tunggu sebentar</p>
          </div>
        </div>
      )}

      {requiresDeviceLock && deviceLockState === "denied" && (
        <div className="absolute inset-0 z-[1400] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
            style={{ background: "#171717", border: "1px solid rgba(255,255,255,0.16)" }}>
            <p className="text-white text-xl font-bold">Perangkat Sudah Maksimal</p>
            <p className="text-white/70 text-sm mt-2 leading-relaxed">
              Link booth ini sedang digunakan di perangkat lain. Tutup perangkat yang aktif terlebih dahulu, lalu coba lagi.
            </p>
            <button
              onClick={retryDeviceLock}
              className="mt-5 w-full py-3 rounded-2xl text-sm font-bold"
              style={{ background: accentColor, color: primaryColor }}
            >
              Coba Lagi
            </button>
          </div>
        </div>
      )}

      {requiresDeviceLock && deviceLockState === "error" && (
        <div className="absolute inset-0 z-[1400] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
            style={{ background: "#171717", border: "1px solid rgba(255,255,255,0.16)" }}>
            <p className="text-white text-xl font-bold">Gagal Verifikasi Perangkat</p>
            <p className="text-white/70 text-sm mt-2 leading-relaxed">
              Tidak dapat memverifikasi akses device saat ini. Cek koneksi internet lalu ulangi.
            </p>
            <button
              onClick={retryDeviceLock}
              className="mt-5 w-full py-3 rounded-2xl text-sm font-bold"
              style={{ background: accentColor, color: primaryColor }}
            >
              Muat Ulang
            </button>
          </div>
        </div>
      )}

      {isOffline && screen !== "BOOTH_SETUP" && (
        <div className="absolute top-3 left-1/2 z-[60] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-xl"
          style={{ background: "rgba(18,18,18,0.88)", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.12)" }}>
          Internet terputus. Timer ditahan sampai koneksi kembali.
        </div>
      )}

      {/* ── Fullscreen tip toast ── */}
      {fsToast && (
        <div className="absolute bottom-14 left-3 z-50 max-w-xs rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-2xl"
          style={{ background: "rgba(0,0,0,0.88)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.15)" }}>
          {fsToast}
        </div>
      )}

      {/* ── Payment error overlay ── */}
      {errorToast && (
        <div
          className="absolute inset-0 z-[999] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setErrorToast(null)}
        >
          <div
            className="max-w-sm w-full rounded-3xl p-6 text-center shadow-2xl"
            style={{ background: "#1a1a1a", border: "2px solid rgba(255,80,80,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-white font-semibold text-base mb-1">Pembayaran Gagal</p>
            <p className="text-red-300 text-sm mb-5 leading-relaxed">{errorToast}</p>
            <button
              onClick={() => setErrorToast(null)}
              className="w-full py-3 rounded-2xl font-semibold text-sm"
              style={{ background: "rgba(255,80,80,0.25)", color: "#ff9999", border: "1px solid rgba(255,80,80,0.4)" }}
            >
              Coba Lagi
            </button>
          </div>
        </div>
      )}

      {!pinUnlocked && (
        <div
          className="absolute inset-0 z-[1200] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
            style={{ background: "#171717", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <p className="text-white text-xl font-bold">Akses Booth Terkunci</p>
            <p className="text-white/60 text-sm mt-1.5">Masukkan PIN 6 digit untuk masuk ke sesi photobox.</p>

            <div className="mt-5 flex justify-center gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <input
                  key={idx}
                  ref={(el) => { pinInputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={pinDigits[idx] ?? ""}
                  onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handlePinSubmit();
                      return;
                    }
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      handlePinKeyDown(idx, e.key);
                      return;
                    }
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      handlePinKeyDown(idx, e.key);
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={() => setPinActiveIndex(idx)}
                  onFocusCapture={() => setPinActiveIndex(idx)}
                  className="h-12 w-10 rounded-xl border text-center text-lg font-bold outline-none"
                  style={{
                    borderColor: "rgba(255,255,255,0.22)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                  }}
                />
              ))}
            </div>

            {pinError && <p className="mt-2 text-xs text-red-300">{pinError}</p>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={handlePinDelete}
                onTouchStart={handlePinDelete}
                className="w-full py-3 rounded-2xl text-sm font-bold"
                style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)" }}
              >
                Hapus
              </button>
              <button
                onClick={handlePinSubmit}
                className="w-full py-3 rounded-2xl text-sm font-bold"
                style={{ background: accentColor, color: primaryColor }}
              >
                Masuk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings PIN gate ── */}
      {showSettingsPinGate && (
        <div
          className="absolute inset-0 z-[1210] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowSettingsPinGate(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
            style={{ background: "#171717", border: "1px solid rgba(255,255,255,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white text-xl font-bold">Kunci Akses Link Booth</p>
            <p className="text-white/60 text-sm mt-1.5">Masukkan PIN 6 digit untuk membuka pengaturan booth.</p>

            <div className="mt-5 flex justify-center gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <input
                  key={idx}
                  ref={(el) => { settingsPinInputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={settingsPinDigits[idx] ?? ""}
                  onChange={(e) => handleSettingsPinDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSettingsPinSubmit();
                      return;
                    }
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      handleSettingsPinKeyDown(idx, e.key);
                      return;
                    }
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      handleSettingsPinKeyDown(idx, e.key);
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={() => setSettingsPinActiveIndex(idx)}
                  onFocusCapture={() => setSettingsPinActiveIndex(idx)}
                  className="h-12 w-10 rounded-xl border text-center text-lg font-bold outline-none"
                  style={{
                    borderColor: "rgba(255,255,255,0.22)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                  }}
                />
              ))}
            </div>

            {settingsPinError && <p className="mt-2 text-xs text-red-300">{settingsPinError}</p>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={handleSettingsPinDelete}
                onTouchStart={handleSettingsPinDelete}
                className="w-full py-3 rounded-2xl text-sm font-bold"
                style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)" }}
              >
                Hapus
              </button>
              <button
                onClick={handleSettingsPinSubmit}
                className="w-full py-3 rounded-2xl text-sm font-bold"
                style={{ background: accentColor, color: primaryColor }}
              >
                Masuk
              </button>
            </div>
            <button
              onClick={() => {
                setShowSettingsPinGate(false);
                setSettingsPinDigits(Array.from({ length: 6 }, () => ""));
                setSettingsPinError(null);
              }}
              className="mt-2 w-full py-2 rounded-2xl text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}
      {recoveryConfirm && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.76)" }}
          onClick={() => setRecoveryConfirm(null)}>
          <div
            className="max-w-md w-full rounded-3xl p-6 shadow-2xl"
            style={{ background: "#171717", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white text-lg font-bold">Lanjutkan sesi photo?</p>
            <p className="text-white/65 text-sm mt-2 leading-relaxed">
              Sesi berbayar ini akan dibuka kembali ke layar kamera dengan frame <span className="text-white font-semibold">{recoveryConfirm.frameName}</span>.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => setRecoveryConfirm(null)}
                className="py-3 rounded-2xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}
              >
                Batal
              </button>
              <button
                onClick={handleResumeConfirmed}
                className="py-3 rounded-2xl text-sm font-bold"
                style={{ background: accentColor, color: primaryColor }}
              >
                Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      <ScreenErrorBoundary
        screenName={screen}
        accentColor={accentColor}
        onReset={handleReset}
      >
        {screen === "PAYMENT" && mappedPreviewScreen && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6"
            style={{ background: primaryColor }}>
            <p style={{ color: textPrimary, fontWeight: 800, fontSize: "clamp(18px,3vw,28px)" }}>Pembayaran QRIS</p>
            <div style={{ width: "min(240px,45vw)", aspectRatio: "1", borderRadius: 16, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.18)", padding: 12 }}>
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                {Array.from({ length: 10 }).map((_, r) =>
                  Array.from({ length: 10 }).map((_, c) =>
                    Math.random() > 0.5 ? <rect key={`${r}-${c}`} x={c * 10} y={r * 10} width={9} height={9} fill="#111" /> : null
                  )
                )}
                <rect x={0} y={0} width={30} height={30} fill="#111" rx={3} />
                <rect x={3} y={3} width={24} height={24} fill="#fff" rx={2} />
                <rect x={6} y={6} width={18} height={18} fill="#111" rx={1} />
                <rect x={70} y={0} width={30} height={30} fill="#111" rx={3} />
                <rect x={73} y={3} width={24} height={24} fill="#fff" rx={2} />
                <rect x={76} y={6} width={18} height={18} fill="#111" rx={1} />
                <rect x={0} y={70} width={30} height={30} fill="#111" rx={3} />
                <rect x={3} y={73} width={24} height={24} fill="#fff" rx={2} />
                <rect x={6} y={76} width={18} height={18} fill="#111" rx={1} />
              </svg>
            </div>
            <p style={{ color: textSecondary, fontSize: "clamp(13px,2vw,16px)" }}>Scan untuk membayar</p>
            <p style={{ color: accentColor, fontWeight: 700, fontSize: "clamp(16px,2.5vw,22px)" }}>
              Rp {booth.pricePerSession.toLocaleString("id-ID")}
            </p>
          </div>
        )}

        {screen === "PAYMENT" && !mappedPreviewScreen && session.orderId && (
          <PaymentScreen
            booth={booth}
            orderId={session.orderId}
            sessionId={session.sessionId!}
            qrImageUrl={session.qrImageUrl}
            qrString={session.qrString}
            snapToken={session.snapToken}
            snapClientKey={session.snapClientKey}
            snapRedirectUrl={session.snapRedirectUrl}
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
            onBack={handleBackFromFrameSelect}
          />
        )}

        {screen === "PRINT_COUNT" && session.selectedFrame && (
          <PrintCountScreen
            booth={booth}
            frame={session.selectedFrame}
            voucher={session.paymentMethod === "VOUCHER" ? session.voucher : null}
            onBack={handleBackFromPrintCount}
            onSelect={(count) => {
              const frameId = session.selectedFrame?.id;
              if (session.paymentMethod === "VOUCHER" && session.voucher)
                return handleFinalizeVoucher(count, session.voucher, frameId);
              if (session.paymentMethod === "CASH")
                return handleCreateCashSession(count, frameId);
              return handleCreatePayment(count, frameId);
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
            {showSettingsButton && (
              <button
                onClick={() => {
                  if (requiresPinGate && !isSettingsAccessValid) {
                    setShowSettingsPinGate(true);
                    setTimeout(() => {
                      const el = settingsPinInputRefs.current[0];
                      if (el) { el.focus(); el.select(); setSettingsPinActiveIndex(0); }
                    }, 0);
                  } else {
                    setIdleSettingsOpen((prev) => !prev);
                  }
                }}
                className="absolute top-3 right-3 p-2 rounded-xl text-white/25 hover:text-white/60
                           hover:bg-white/10 transition-colors text-sm"
                title="Menu pengaturan booth"
              >
                ⚙️
              </button>
            )}
            {idleSettingsOpen && (
              <>
                <div 
                  className="absolute inset-0 z-20"
                  onClick={() => setIdleSettingsOpen(false)}
                />
                <div
                  className="absolute top-14 right-3 z-30 w-56 rounded-2xl p-2"
                  style={{ background: "rgba(14,14,14,0.95)", border: "1px solid rgba(255,255,255,0.12)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setIdleSettingsOpen(false);
                      dispatch({ type: "GOTO_SETUP" });
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-white/90 hover:bg-white/10"
                  >
                    Setting Booth
                  </button>
                  <button
                    onClick={() => {
                      setIdleSettingsOpen(false);
                      setRecoveryOpen(true);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-white/90 hover:bg-white/10"
                  >
                    Transaksi 24 Jam{localSnapshots.length > 0 ? ` (${localSnapshots.length})` : ""}
                  </button>
                  <button
                    onClick={() => {
                      setIdleSettingsOpen(false);
                      void toggleFullscreen();
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-white/90 hover:bg-white/10"
                  >
                    {isFullscreen ? "Keluar Fullscreen" : "Masuk Fullscreen"}
                  </button>
                </div>
              </>
            )}
            {recoveryOpen && (
              <div className="absolute inset-0 z-30 flex justify-end"
                style={{ background: "rgba(0,0,0,0.28)" }}
                onClick={() => setRecoveryOpen(false)}>
                <div
                  className="h-full w-full max-w-md overflow-y-auto p-5"
                  style={{ background: "rgba(14,14,14,0.96)", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white text-lg font-bold">Transaksi 24 Jam</p>
                      <p className="text-white/50 text-xs mt-1 leading-relaxed">
                        Semua transaksi akan hilang otomatis 24 jam setelah pembayaran dibuat/berhasil. Resume hanya bisa dilakukan dari booth ini.
                      </p>
                    </div>
                    <button
                      onClick={() => setRecoveryOpen(false)}
                      className="w-9 h-9 rounded-xl text-white/60 hover:text-white hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recoveryLoading && (
                      <div className="rounded-2xl px-4 py-4 text-sm text-white/60"
                        style={{ background: "rgba(255,255,255,0.05)" }}>
                        Memuat transaksi...
                      </div>
                    )}

                    {recoveryError && (
                      <div className="rounded-2xl px-4 py-4 text-sm text-red-200"
                        style={{ background: "rgba(220,38,38,0.18)", border: "1px solid rgba(248,113,113,0.25)" }}>
                        {recoveryError}
                      </div>
                    )}

                    {!recoveryLoading && !recoveryError && recoveryLogs.length === 0 && (
                      <div className="rounded-2xl px-4 py-4 text-sm text-white/60"
                        style={{ background: "rgba(255,255,255,0.05)" }}>
                        Belum ada transaksi dalam 24 jam terakhir.
                      </div>
                    )}

                    {recoveryLogs.map((log) => {
                      const boothSessionId = log.boothSession?.id ?? "";
                      const snapshot = boothSessionId ? localSnapshots.find((item) => item.sessionId === boothSessionId) ?? null : null;
                      const recoverable = !!snapshot && !snapshot.logResumeUsedAt && log.boothSession?.status !== "COMPLETED";
                      const badgeColor =
                        log.status === "SUCCESS"
                          ? "rgba(34,197,94,0.18)"
                          : log.status === "PENDING"
                            ? "rgba(245,158,11,0.18)"
                            : "rgba(239,68,68,0.18)";
                      const badgeText =
                        log.status === "SUCCESS"
                          ? "#86efac"
                          : log.status === "PENDING"
                            ? "#fcd34d"
                            : "#fca5a5";

                      return (
                        <div key={log.id}
                          className="rounded-3xl p-4 space-y-3"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-white font-semibold text-sm">
                                {log.boothSession?.frameName ?? snapshot?.frame.name ?? "Frame tanpa nama"}
                              </p>
                              <p className="text-white/45 text-xs mt-1">
                                {new Date(log.paidAt ?? log.createdAt).toLocaleString("id-ID")}
                              </p>
                            </div>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: badgeColor, color: badgeText }}>
                              {log.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-white/65">
                            <div>Nominal: Rp {log.amount.toLocaleString("id-ID")}</div>
                            <div>Status sesi: {log.boothSession?.status ?? "—"}</div>
                            <div className="col-span-2">Order ID: {log.orderId ?? "—"}</div>
                          </div>

                          <div className="rounded-2xl px-3 py-2 text-[11px] leading-relaxed"
                            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }}>
                            {snapshot
                              ? snapshot.logResumeUsedAt
                                ? "Fallback dari log untuk sesi ini sudah dipakai. Jalur lanjut hanya tersisa dari sesi yang sedang aktif."
                                : "Snapshot frame tersimpan di booth ini. Bisa dicek lalu dilanjutkan satu kali jika pembayaran valid."
                              : "Snapshot lokal tidak ada. Sesi ini tidak bisa dipulihkan dari perangkat lain atau setelah data booth dibersihkan."}
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] text-white/40">
                              Hapus otomatis: {new Date(log.expiresAt).toLocaleString("id-ID")}
                            </p>
                            <button
                              onClick={() => void handleRecoveryCheck(log)}
                              disabled={!recoverable || recoveryCheckingId === boothSessionId}
                              className="px-4 py-2 rounded-2xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: recoverable ? accentColor : "rgba(255,255,255,0.08)", color: recoverable ? primaryColor : "rgba(255,255,255,0.45)" }}
                            >
                              {recoveryCheckingId === boothSessionId ? "Mengecek..." : snapshot?.logResumeUsedAt ? "Fallback Dipakai" : "Cek & Lanjutkan"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {showPromoBanner && livePromoPrefs && livePromoPrefs.promoBanners.length > 0 && (
              <PromoBannerOverlay
                banners={livePromoPrefs.promoBanners}
                slideSeconds={livePromoPrefs.promoSlideSeconds}
                onDismiss={() => setShowPromoBanner(false)}
              />
            )}
          </div>
        )}

        {screen === "TUTORIAL" && (
          <TutorialScreen
            booth={booth}
            onStart={() => dispatch({ type: "TUTORIAL_DONE" })}
            onBack={handleBackFromTutorial}
            prefsOverride={booth.welcomeScreenPrefs}
          />
        )}

        {screen === "PAYMENT_METHOD" && (
          <PaymentMethodScreen
            booth={booth}
            onSelect={(method) => dispatch({ type: "PAYMENT_METHOD_SELECTED", payload: { method } })}
            onBack={handleBackFromPaymentMethod}
            prefsOverride={liveWelcomePrefs as import("./types").WelcomeScreenPrefs | null}
          />
        )}

        {screen === "CAMERA" && mappedPreviewScreen && session.selectedFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: (booth.welcomeScreenPrefs as Record<string,unknown> | null)?.cameraBgColor as string ?? primaryColor }}>
            <div style={{ width: "min(50%,300px)", aspectRatio: `${session.selectedFrame.canvasWidth}/${session.selectedFrame.canvasHeight}`, borderRadius: 16, overflow: "hidden", position: "relative", boxShadow: "0 8px 40px rgba(0,0,0,0.3)", border: `3px solid ${accentColor}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={session.selectedFrame.assetUrl} alt="frame" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)" }}>
                <span style={{ fontSize: "min(8vw,64px)" }}>📷</span>
              </div>
            </div>
            <p style={{ color: accentColor, fontWeight: 700, fontSize: "clamp(14px,2.5vw,20px)", letterSpacing: "0.05em" }}>Sesi Foto</p>
          </div>
        )}

        {(screen === "CAMERA" || screen === "PHOTO_REVIEW") && !mappedPreviewScreen && session.selectedFrame && (
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
              onVideoReady={(videoBlob, captureIndex) =>
                dispatch({ type: "PHOTO_VIDEO_READY", payload: { videoBlob, captureIndex } })
              }
              onProceed={() => dispatch({ type: "PROCEED_TO_PREVIEW" })}
              onRetakeSlot={(slotIndex) => dispatch({ type: "RETAKE_SLOT", payload: { slotIndex } })}
              onCountdownChange={setCameraCountingDown}
              livePhotoVideoEnabled={livePhotoVideoEnabled}
              mode={booth.photoSessionMode as "live_view" | "fullscreen"}
            />

            {/* PHOTO_REVIEW — overlay card di atas camera screen */}
            {screen === "PHOTO_REVIEW" && session.capturedPhotos.length > 0 && (() => {
              const frame       = session.selectedFrame!;
              const totalNeeded = totalCaptures(frame);
              const photoIdx    = retakeSlotIndex !== null ? retakeSlotIndex + 1 : session.capturedPhotos.length;
              const lastPhoto   = session.capturedPhotos[photoIdx - 1];
              const isLast      = retakeSlotIndex !== null ? true : photoIdx >= totalNeeded;
              const showFullscreenFramedPreview = booth.photoSessionMode === "fullscreen";
              const previewFrameIsOverlay = isOverlayFrame(frame.assetUrl);
              const effectiveSlots = getEffectiveSlots(frame);
              const sceneElements = frame.sceneElements ?? [];
              const useSceneRendering = sceneElements.length > 0;
              const previewBaseUrl = useSceneRendering && frame.thumbnailUrl ? frame.thumbnailUrl : frame.assetUrl;
              const isDuplicateMode = isEffectiveDuplicateMode(frame);
              const captureIndex = photoIdx - 1;
              const resolvePreviewCaptureIndex = createCaptureIndexResolver(effectiveSlots, isDuplicateMode);
              const slotRenderMap = effectiveSlots.map((slot) => {
                return { slot, slotCaptureIndex: resolvePreviewCaptureIndex(slot) };
              });
              const mappedPreviewSlots = slotRenderMap
                .filter((item) => item.slotCaptureIndex === captureIndex)
                .map((item) => item.slot);

              const currentSlot = mappedPreviewSlots[0] ?? frame.slots?.find((s) => s.photoIndex === photoIdx - 1);
              const cw = frame.canvasWidth  || 1080;
              const ch = frame.canvasHeight || 1920;
              const isVerticalFrame = ch > cw;
              const useStackedVerticalPreview = showFullscreenFramedPreview && isVerticalFrame;
              const slotAspect  = currentSlot
                ? (currentSlot.width * cw) / (currentSlot.height * ch)
                : 16 / 9;
              // Photo fills card width, maintain slot aspect ratio
              const cardMaxW = 560; // px, matches max-w-lg below
              const photoW = cardMaxW - 56; // card padding 28px each side
              const photoH = Math.round(photoW / slotAspect);
              const photoLayerZ = effectiveSlots.length > 0
                ? effectiveSlots.reduce((min, slot) => Math.min(min, Number.isFinite(slot.zIndex) ? Number(slot.zIndex) : 0), Infinity)
                : 0;
              const sceneBeforePhotos = sceneElements.filter((el) => (Number.isFinite(el.zIndex) ? Number(el.zIndex) : 0) < photoLayerZ);
              const sceneAfterPhotos = sceneElements.filter((el) => (Number.isFinite(el.zIndex) ? Number(el.zIndex) : 0) >= photoLayerZ);
              const renderSceneElement = (el: NonNullable<FrameData["sceneElements"]>[number], idx: number, zBase: number) => {
                const isFullCanvasShape = el.type === "shape"
                  && el.left <= 0.001
                  && el.top <= 0.001
                  && el.width >= 0.999
                  && el.height >= 0.999
                  && !el.stroke;
                if (isFullCanvasShape) return null;

                const baseStyle: React.CSSProperties = {
                  position: "absolute",
                  left: `${el.left * 100}%`,
                  top: `${el.top * 100}%`,
                  width: `${el.width * 100}%`,
                  height: `${el.height * 100}%`,
                  zIndex: zBase + (Number.isFinite(el.zIndex) ? Number(el.zIndex) : idx),
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  transformOrigin: "center center",
                  borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
                  overflow: "hidden",
                  pointerEvents: "none",
                };

                if ((el.type === "background-photo" || el.type === "upload") && el.src) {
                  return (
                    <img
                      key={`${el.type}-${zBase}-${idx}`}
                      src={el.src}
                      alt=""
                      className="absolute"
                      style={{
                        ...baseStyle,
                        objectFit: el.objectFit === "fill" ? "fill" : (el.objectFit ?? "contain"),
                      }}
                    />
                  );
                }

                if (el.type === "text" && el.text) {
                  return (
                    <div
                      key={`${el.type}-${zBase}-${idx}`}
                      style={{
                        ...baseStyle,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center",
                        color: el.color ?? "#000000",
                        fontSize: `${Math.max(8, (el.fontSize ?? 0.05) * ch)}px`,
                        fontFamily: el.fontFamily ?? "inherit",
                        fontWeight: el.fontWeight ?? 600,
                        textAlign: el.align ?? "center",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {el.text}
                    </div>
                  );
                }

                if (el.type === "shape") {
                  return (
                    <div
                      key={`${el.type}-${zBase}-${idx}`}
                      style={{
                        ...baseStyle,
                        background: el.fill ?? "transparent",
                        border: el.stroke ? `${el.strokeWidth ?? 1}px solid ${el.stroke}` : undefined,
                      }}
                    />
                  );
                }

                return null;
              };

              const renderFramedPreview = () => (
                <div
                  className="relative w-full h-full"
                  style={{ background: frame.backgroundColor ?? "#ffffff" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {(!previewFrameIsOverlay || useSceneRendering) && (
                    <img src={previewBaseUrl} alt="Frame background" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {useSceneRendering && sceneBeforePhotos.map((el, idx) => renderSceneElement(el, idx, 1))}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {effectiveSlots.length > 0 ? (
                    slotRenderMap.map(({ slot, slotCaptureIndex }, slotIdx) => {
                      const slotPhoto = session.capturedPhotos[slotCaptureIndex];
                      if (!slotPhoto) return null;

                      return (
                        <img
                          key={`${slot.photoIndex}-${slotIdx}`}
                          src={slotPhoto}
                          alt={`Preview sesi ${slotCaptureIndex + 1}`}
                          className="absolute object-cover"
                          style={{
                            left: `${slot.left * 100}%`,
                            top: `${slot.top * 100}%`,
                            width: `${slot.width * 100}%`,
                            height: `${slot.height * 100}%`,
                            zIndex: useSceneRendering ? 1000 : 10,
                          }}
                        />
                      );
                    })
                  ) : lastPhoto && currentSlot ? (
                    <img
                      src={lastPhoto}
                      alt={`Preview sesi ${photoIdx}`}
                      className="absolute object-cover"
                      style={{
                        left: `${currentSlot.left * 100}%`,
                        top: `${currentSlot.top * 100}%`,
                        width: `${currentSlot.width * 100}%`,
                        height: `${currentSlot.height * 100}%`,
                        zIndex: useSceneRendering ? 1000 : 10,
                      }}
                    />
                  ) : lastPhoto ? (
                    <img src={lastPhoto} alt={`Preview sesi ${photoIdx}`} className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: useSceneRendering ? 1000 : 10 }} />
                  ) : null}
                  {useSceneRendering && sceneAfterPhotos.map((el, idx) => renderSceneElement(el, idx, 2000))}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {!useSceneRendering && previewFrameIsOverlay && (
                    <img src={frame.assetUrl} alt="Frame overlay" className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 20 }} />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {!useSceneRendering && frame.overlayUrl && (
                    <img src={frame.overlayUrl} alt="Frame decoration overlay" className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 30 }} />
                  )}
                </div>
              );

              return (
                <>
                  <div
                    className="absolute inset-0 flex items-center justify-center select-none px-6"
                    style={{
                      background: "rgba(0,0,0,0.55)",
                      backdropFilter: "blur(6px)",
                      right: 0,
                    }}
                  >
                    <div
                      className={`w-full rounded-3xl shadow-2xl ${useStackedVerticalPreview ? "max-w-md p-5" : "max-w-lg p-7"}`}
                      style={{ backgroundColor: primaryColor, border: "1px solid rgba(255,255,255,0.15)" }}
                    >
                      {/* Header: teks di atas */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm uppercase tracking-widest" style={{ color: textSecondary }}>
                            Foto {photoIdx} dari {totalNeeded}
                          </p>
                          <h3 className={`${useStackedVerticalPreview ? "text-2xl" : "text-3xl"} font-bold mt-0.5`} style={{ color: textPrimary }}>Sudah oke?</h3>
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

                      {/* Foto plain utama + panel preview frame (fullscreen) */}
                      <div className={`mb-4 ${showFullscreenFramedPreview ? "grid grid-cols-[minmax(0,1fr)_minmax(0,200px)] gap-4 items-center" : ""}`}>
                        <div className="w-full rounded-2xl overflow-hidden shadow-xl flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {lastPhoto ? (
                            <img
                              src={lastPhoto}
                              alt="Foto plain"
                              className="max-w-full object-contain"
                              style={{ maxHeight: "min(40vh, 280px)" }}
                            />
                          ) : null}
                        </div>

                        {showFullscreenFramedPreview && (
                          <div
                            className="rounded-2xl p-2 w-full"
                            style={{ backgroundColor: surfaceBg, border: `1px solid ${surfaceBorder}`, maxWidth: 200 }}
                          >
                            <p className="text-[11px] font-semibold px-1 pb-1" style={{ color: textTertiary }}>
                              Preview Frame
                            </p>
                            <div className="w-full rounded-xl overflow-hidden shadow-md" style={{ aspectRatio: `${cw} / ${ch}` }}>
                              {renderFramedPreview()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Tombol aksi di bawah */}
                      <div className={`flex ${useStackedVerticalPreview ? "gap-3" : "gap-4"}`}>
                        <button
                          onClick={() => dispatch({ type: "PHOTO_RETAKE_SINGLE" })}
                          className={`flex-shrink-0 rounded-2xl text-base font-semibold transition-colors active:opacity-70 ${useStackedVerticalPreview ? "px-4 py-3" : "px-6 py-4"}`}
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
                          className={`flex-1 rounded-2xl font-black active:scale-95 transition-all disabled:cursor-not-allowed ${useStackedVerticalPreview ? "py-3 text-lg" : "py-4 text-xl"}`}
                        >
                          {!currentVideoReady
                            ? "⌛ Menyiapkan…"
                            : isLast ? "✅ Lanjut" : "👍 Foto Berikutnya"}
                        </button>
                      </div>
                    </div>
                  </div>

                </>
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
              livePhotoVideoEnabled={livePhotoVideoEnabled}
              onSaved={(result) =>
                dispatch({ type: "PHOTO_SAVED", payload: result })
              }
              onRetake={() => dispatch({ type: "RETAKE" })}
              mode={booth.photoSessionMode as "live_view" | "fullscreen"}
            />
          )}

        {screen === "DELIVERY" && session.downloadUrl && (
          <DeliveryScreen
            booth={booth}
            sessionId={session.sessionId ?? undefined}
            downloadUrl={session.downloadUrl}
            photoUrl={session.photoUrl ?? undefined}
            printImageDataUrl={session.printImageDataUrl ?? undefined}
            printerName={hwSettings.printerName ?? undefined}
            printCount={session.printCount}
            canvasWidth={session.selectedFrame?.canvasWidth}
            canvasHeight={session.selectedFrame?.canvasHeight}
            paperSizeOverride={hwSettings.paperSize ?? null}
            timerSecondsLeft={timerSecondsLeft}
            onDone={handleReset}
          />
        )}
      </ScreenErrorBoundary>

      {/* Overlay elements (teks/gambar ditambahkan via editor) */}
      {(() => {
        const SCREEN_MAP: Partial<Record<string, string>> = {
          IDLE: "idle", TUTORIAL: "tutorial", PAYMENT_METHOD: "payment",
          FRAME_SELECT: "frame_select", PRINT_COUNT: "print_count",
          PAYMENT: "payment_qris", CAMERA: "camera", PREVIEW: "preview", DELIVERY: "delivery",
        };
        const editorScreen = SCREEN_MAP[screen] ?? "";
        const overlays = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.overlayElements as Array<{
          id: string; screen: string; type: "text" | "image";
          x: number; y: number; width: number;
          text?: string; fontSize?: number; fontWeight?: number; color?: string; textAlign?: string;
          imageUrl?: string;
        }> | undefined;
        const matching = overlays?.filter(el => el.screen === editorScreen) ?? [];
        if (!matching.length) return null;
        return matching.map(el => (
          <div key={el.id} style={{
            position: "absolute", left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`,
            transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 999,
          }}>
            {el.type === "text" ? (
              <p style={{ color: el.color ?? "#fff", fontSize: el.fontSize ?? 32, fontWeight: el.fontWeight ?? 700, textAlign: (el.textAlign ?? "center") as React.CSSProperties["textAlign"], margin: 0, lineHeight: 1.3, wordBreak: "break-word", textShadow: "0 2px 8px rgba(0,0,0,0.5)", whiteSpace: "pre-wrap" }}>
                {el.text ?? ""}
              </p>
            ) : el.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={el.imageUrl} alt="" style={{ width: "100%", display: "block" }} />
            ) : null}
          </div>
        ));
      })()}

      {/* Session countdown timer — top-right overlay (hidden saat camera countdown) */}
      {timerSecondsLeft !== null && !cameraCountingDown && (
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
