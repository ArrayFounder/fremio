"use client";

import React, { useRef, useState, useCallback } from "react";

/** Cari mimeType video terbaik yang didukung browser — prioritaskan H.264 (MP4-compatible) */
function getBestVideoMime(): string {
  for (const t of [
    "video/webm;codecs=h264",   // Chrome/Edge — H.264 dalam container WebM, bisa di-rename ke .mp4
    "video/mp4;codecs=avc1",    // Safari natif
    "video/mp4",                // Safari fallback
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

export interface VideoDevice {
  deviceId: string;
  label:    string;
}

export interface UseCameraOptions {
  /** Output canvas dimensions — defaults to landscape 16:9 */
  canvasWidth?: number;
  canvasHeight?: number;
  /** Specific deviceId to use; undefined = default/facingMode:user */
  deviceId?: string;
  /** Mirror the capture output — default true (selfie mode) */
  mirror?: boolean;
}

export interface UseCameraReturn {
  videoRef:        React.RefObject<HTMLVideoElement>;
  stream:          MediaStream | null;  // live stream untuk di-attach ke <video> lain
  isReady:         boolean;
  permissionError: string | null;
  devices:         VideoDevice[];  // semua video input yang tersedia
  start:           () => Promise<void>;
  stop:            () => void;
  capture:         () => string | null;
  /** Mulai merekam video dari stream kamera — dipanggil saat countdown mulai */
  startRecording:  () => void;
  /**
   * Berhenti merekam dan kembalikan Blob video.
   * Resolve setelah MediaRecorder selesai flush semua data (~100ms).
   */
  stopRecording:   () => Promise<Blob | null>;
}

/**
 * useCamera — getUserMedia wrapper untuk booth UI.
 *  - Mirror (selfie mode) saat capture
 *  - Object-fit cover ke canvasWidth × canvasHeight
 *  - Tidak ada audio
 */
export function useCamera({
  canvasWidth  = 1920,
  canvasHeight = 1080,
  deviceId,
  mirror = true,
}: UseCameraOptions = {}): UseCameraReturn {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady]           = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [devices, setDevices]           = useState<VideoDevice[]>([]);

  // ── Live recording refs ───────────────────────────────────────────────────
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const reqDataTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Enumerate semua video input — dipanggil setelah izin diberikan */
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        all
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label:    d.label || `Kamera ${i + 1}`,
          }))
      );
    } catch { /* ignore */ }
  }, []);

  const start = useCallback(async () => {
    setPermissionError(null);
    try {
      const videoConstraint: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });
      streamRef.current = stream;
      setStream(stream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().catch(() => {});
          setIsReady(true);
        };
      }
      // Setelah izin diberikan, enumerate devices untuk dapat label
      await refreshDevices();
    } catch (err) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" ||
         err.name === "OverconstrainedError");
      setPermissionError(
        isDenied
          ? "Izin kamera ditolak. Aktifkan akses kamera di pengaturan browser, lalu muat ulang halaman."
          : "Kamera tidak dapat diakses. Pastikan perangkat memiliki kamera yang berfungsi."
      );
    }
  }, [deviceId, refreshDevices]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setIsReady(false);
  }, []);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !isReady) return null;

    const canvas = document.createElement("canvas");
    canvas.width  = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (mirror) {
      ctx.translate(canvasWidth, 0);
      ctx.scale(-1, 1);
    }

    // Object-fit: cover — crop video ke rasio canvas
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const videoAspect  = vw / vh;
    const canvasAspect = canvasWidth / canvasHeight;

    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAspect > canvasAspect) {
      sw = vh * canvasAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / canvasAspect;
      sy = (vh - sh) / 2;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
    return canvas.toDataURL("image/jpeg", 0.92);
  }, [isReady, canvasWidth, canvasHeight, mirror]);

  // ── startRecording ────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      console.warn("[useCamera] startRecording: no stream available");
      return;
    }
    // Stop any previous recorder + interval
    if (reqDataTimerRef.current) { clearInterval(reqDataTimerRef.current); reqDataTimerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    // Close any lingering AudioContext
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    chunksRef.current = [];

    const mimeType = getBestVideoMime();
    // Try multiple constructor options as fallback for cross-browser compatibility
    const tryCreate = (opts: MediaRecorderOptions) => {
      try { return new MediaRecorder(stream, opts); } catch { return null; }
    };
    const recorder =
      tryCreate({ mimeType, videoBitsPerSecond: 2_500_000 }) ??
      tryCreate({ mimeType }) ??
      tryCreate({});   // last resort: let browser choose mimeType
    if (!recorder) {
      console.warn("[useCamera] MediaRecorder tidak dapat dibuat di perangkat ini");
      return;
    }
    // Verify recorder actually started — some browsers start but don't fire ondataavailable
    const startAndVerify = (r: MediaRecorder) => {
      try {
        r.start(1000);
        // Check if recorder is in "recording" state after start
        if (r.state !== "recording") {
          console.warn("[useCamera] MediaRecorder start failed: state =", r.state, "mimeType =", r.mimeType);
          return false;
        }
        console.log("[useCamera] MediaRecorder started: state =", r.state, "mimeType =", r.mimeType);
        return true;
      } catch (e) {
        console.warn("[useCamera] MediaRecorder start threw:", e);
        return false;
      }
    };

    if (!startAndVerify(recorder)) {
      // Try without bitrate
      const recorder2 = tryCreate({ mimeType });
      if (recorder2 && startAndVerify(recorder2)) {
        console.log("[useCamera] MediaRecorder started (no bitrate): state =", recorder2.state, "mimeType =", recorder2.mimeType);
        // Fall through — recorder2 is used
      } else {
        // Try browser-default
        const recorder3 = tryCreate({});
        if (recorder3 && startAndVerify(recorder3)) {
          console.log("[useCamera] MediaRecorder started (browser default): state =", recorder3.state, "mimeType =", recorder3.mimeType);
        } else {
          console.warn("[useCamera] MediaRecorder could not start in any mode");
          return;
        }
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
        console.log("[useCamera] ondataavailable: chunk size =", e.data.size, "total chunks =", chunksRef.current.length);
      }
    };
    recorder.onerror = (e) => { console.warn("[useCamera] recorder error:", e); };
    // Use 1000ms timeslice + periodic requestData for cross-browser compatibility
    try { recorder.start(1000); } catch { try { recorder.start(); } catch { return; } }
    // Also poll requestData every 1s as safety net (some browsers don't honor timeslice)
    reqDataTimerRef.current = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try { recorderRef.current.requestData(); } catch { /* ignore */ }
      }
    }, 1000);
    recorderRef.current = recorder;
  }, []);

  // ── stopRecording ─────────────────────────────────────────────────────────
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Stop periodic requestData timer
      if (reqDataTimerRef.current) { clearInterval(reqDataTimerRef.current); reqDataTimerRef.current = null; }
      const recorder = recorderRef.current;
      if (!recorder) {
        console.warn("[useCamera] stopRecording: no recorder, resolving null");
        resolve(null);
        return;
      }
      console.log("[useCamera] stopRecording: recorder.state =", recorder.state, "chunks =", chunksRef.current.length);
      let settled = false;
      const cleanup = () => {
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        recorderRef.current = null;
      };
      const finish = (r: MediaRecorder) => {
        if (settled) return;
        settled = true;
        clearTimeout(failsafe);
        const chunks = chunksRef.current;
        const blob = chunks.length > 0
          ? new Blob(chunks, { type: r.mimeType || "video/mp4" })
          : null;
        chunksRef.current = [];
        cleanup();
        console.log("[useCamera] stopRecording finish: blob =", blob ? `Blob(${blob.size})` : "null", "chunks collected =", chunks.length, "mimeType =", r.mimeType);
        resolve(blob);
      };
      // Failsafe: always resolve within 6 seconds even if onstop never fires
      const failsafe = setTimeout(() => {
        console.warn("[useCamera] stopRecording: failsafe triggered! recorder.state =", recorder.state, "chunks =", chunksRef.current.length);
        finish(recorder);
      }, 6000);
      // Recorder already stopped — build blob from buffered chunks
      if (recorder.state === "inactive") {
        console.log("[useCamera] stopRecording: state=inactive, calling finish immediately");
        finish(recorder);
        return;
      }
      // Request any buffered data, then stop
      try { recorder.requestData(); } catch { /* ignore */ }
      recorder.onstop = () => {
        console.log("[useCamera] stopRecording: onstop fired! chunks =", chunksRef.current.length);
        finish(recorder);
      };
      try { recorder.stop(); } catch { finish(recorder); }
    });
  }, []);

  return { videoRef, stream, isReady, permissionError, devices, start, stop, capture, startRecording, stopRecording };
}
