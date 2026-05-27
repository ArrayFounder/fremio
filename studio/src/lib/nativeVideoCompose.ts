// ─────────────────────────────────────────────────────────────────────────────
// nativeVideoCompose.ts
// Renderer-side bridge for native FFmpeg video compositing (DSLR path).
// Webcam continues to use browser-based composeVideoLive() in frameEngine.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface NativeFrameMeta {
  /** Slot positions from the frame config — matches PhotoSlot (0-1 normalized) */
  slots: Array<{
    top:       number;  // 0-1 from top
    left:      number;  // 0-1 from left
    width:     number;  // 0-1 of canvas width
    height:    number;  // 0-1 of canvas height
    zIndex:    number;
    photoIndex: number;  // which capture round this slot uses
  }>;
  frameAssetUrl: string;
  overlayUrl?: string;
  canvasWidth: number;     // e.g. 1080
  canvasHeight: number;    // e.g. 1920
  backgroundColor: string;
  duration: number;        // ms
  fps: number;
  captureSource: "dslr" | "webcam";
}

/** Normalized (0-1) slot → absolute pixel positions for FFmpeg */
export function slotsToAbsolute(
  slots: NativeFrameMeta["slots"],
  cw: number,
  ch: number,
): Array<{ x: number; y: number; w: number; h: number; photoIndex: number; zIndex: number }> {
  return slots.map((s) => ({
    x:          Math.round(s.left  * cw),
    y:          Math.round(s.top   * ch),
    w:          Math.round(s.width  * cw),
    h:          Math.round(s.height * ch),
    photoIndex: s.photoIndex,
    zIndex:     s.zIndex,
  }));
}

/** Check if native FFmpeg compositing is available in this environment */
export function isNativeVideoComposingAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).fremioBooth?.isNativeVideoComposingSupported?.();
}

/**
 * Try native FFmpeg compositing for DSLR video blobs.
 * Only used when captureSource === "dslr".
 *
 * @param blobs — array of Blob|null (same as composeVideoLive)
 * @param meta  — frame compositing metadata
 * @returns Blob | null — final composite MP4 blob, or null if unavailable/failed
 */
export async function tryNativeVideoCompose(
  blobs: (Blob | null)[],
  meta: NativeFrameMeta,
): Promise<Blob | null> {
  // Only route DSLR through native path
  if (meta.captureSource !== "dslr") return null;

  // Check if native API is available (Electron app only)
  const booth = (window as any).fremioBooth;
  if (!booth?.composeVideoLive) {
    console.log("[nativeVideoCompose] not in Electron — using browser path");
    return null;
  }

  // Filter valid blobs
  const validBlobs: Blob[] = blobs.filter(Boolean) as Blob[];
  if (validBlobs.length === 0) return null;

  console.log(`[nativeVideoCompose] composing ${validBlobs.length} DSLR videos via FFmpeg...`);

  try {
    // Convert blobs to ArrayBuffer[] for IPC transfer
    const buffers = await Promise.all(
      validBlobs.map((b) => b.arrayBuffer())
    );

    const result = await booth.composeVideoLive(buffers, meta);

    if (!result.ok || !result.dataUrl) {
      console.warn("[nativeVideoCompose] FFmpeg failed:", result.error);
      return null;
    }

    // Convert data URL → Blob
    const response = await fetch(result.dataUrl);
    const blob = await response.blob();

    console.log(
      `[nativeVideoCompose] success: ${(blob.size / 1024 / 1024).toFixed(2)} MB, type=${blob.type}`
    );
    return blob;
  } catch (err) {
    console.error("[nativeVideoCompose] error:", err);
    return null;
  }
}