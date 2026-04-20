"use client";

import React, { useRef, useState, useCallback } from "react";

/** Cari mimeType WebM terbaik yang didukung browser */
function getBestVideoMime(): string {
  for (const t of [
    "video/mp4;codecs=avc1",
    "video/mp4",
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

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
    if (!stream) return;
    // Stop any previous recorder
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    const mimeType = getBestVideoMime();
    chunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = (e) => { console.warn("[useCamera] recorder error:", e); };
      recorder.start(100); // collect data every 100ms
      recorderRef.current = recorder;
    } catch (err) {
      console.warn("[useCamera] MediaRecorder niet aangemaakt:", err);
    }
  }, []);

  // ── stopRecording ─────────────────────────────────────────────────────────
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      // Recorder already stopped (e.g. stream tracks were closed on component unmount)
      // but chunksRef may still have all data — build blob from available chunks
      if (recorder.state === "inactive") {
        const chunks = chunksRef.current;
        const blob = chunks.length > 0
          ? new Blob(chunks, { type: recorder.mimeType || "video/webm" })
          : null;
        chunksRef.current   = [];
        recorderRef.current = null;
        resolve(blob);
        return;
      }
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const blob = chunks.length > 0
          ? new Blob(chunks, { type: recorder.mimeType || "video/webm" })
          : null;
        chunksRef.current = [];
        recorderRef.current = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { videoRef, stream, isReady, permissionError, devices, start, stop, capture, startRecording, stopRecording };
}
