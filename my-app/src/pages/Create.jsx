import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import html2canvas from "html2canvas";
import {
  CheckCircle2,
  AlertTriangle,
  Palette,
  Image as ImageIcon,
  Type as TypeIcon,
  Shapes,
  UploadCloud,
  Maximize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CornerDownRight,
  Settings2,
  X,
  Square,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Grid3X3,
  Search,
  ChevronLeft,
  Import as ImportIcon,
  Download,
  Trash2,
} from "lucide-react";
import CanvasPreview from "../components/creator/CanvasPreview.jsx";
import PropertiesPanel from "../components/creator/PropertiesPanel.jsx";
import ColorPicker from "../components/creator/ColorPicker.jsx";
import useCreatorStore from "../store/useCreatorStore.js";
import {
  CAPTURED_OVERLAY_Z_OFFSET,
  NORMAL_ELEMENTS_MIN_Z,
  BACKGROUND_PHOTO_Z,
  PHOTO_SLOT_MIN_Z,
} from "../constants/layers.js";
import { useShallow } from "zustand/react/shallow";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "../components/creator/canvasConstants.js";
import draftStorage from "../utils/draftStorage.js";
import draftService from "../services/draftService.js";
import paymentService from "../services/paymentService";
import { computeDraftSignature } from "../utils/draftHelpers.js";
import safeStorage from "../utils/safeStorage.js";
import userStorage from "../utils/userStorage.js";
import frameProvider from "../utils/frameProvider.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { clearStaleFrameCache } from "../utils/frameCacheCleaner.js";
import { EDITOR_FONT_FAMILIES } from "../config/editorFonts.js";
import "./Create.css";

const panelMotion = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const TOAST_MESSAGES = {
  saveError: "Gagal menyimpan draft. Coba lagi.",
  pasteSuccess: "Gambar ditempel ke kanvas.",
  pasteError: "Gagal menempel gambar. Pastikan clipboard berisi gambar.",
  deleteSuccess: "Elemen dihapus dari kanvas.",
};

const parseNumericValue = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const addRoundedRectPath = (ctx, x, y, width, height, radius) => {
  const effectiveRadius = Math.max(
    0,
    Math.min(radius, Math.min(width, height) / 2)
  );
  if (effectiveRadius === 0) {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.closePath();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + effectiveRadius, y);
  ctx.lineTo(x + width - effectiveRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + effectiveRadius);
  ctx.lineTo(x + width, y + height - effectiveRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - effectiveRadius,
    y + height
  );
  ctx.lineTo(x + effectiveRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - effectiveRadius);
  ctx.lineTo(x, y + effectiveRadius);
  ctx.quadraticCurveTo(x, y, x + effectiveRadius, y);
  ctx.closePath();
};

const loadImageAsync = (
  src,
  { timeoutMs = 8000, crossOrigin = "anonymous" } = {}
) =>
  new Promise((resolve, reject) => {
    if (typeof src !== "string" || src.length === 0) {
      reject(new Error("Invalid image source"));
      return;
    }

    const isDataUrl = src.startsWith("data:");
    const isBlobUrl = src.startsWith("blob:");
    const isHttpUrl = /^https?:/i.test(src);
    const isRelativeUrl =
      src.startsWith("/") || src.startsWith("./") || src.startsWith("../");

    if (!isDataUrl && !isBlobUrl && !isHttpUrl && !isRelativeUrl) {
      reject(
        new Error(`Unsupported image source format: ${src.slice(0, 32)}...`)
      );
      return;
    }

    const img = new Image();
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      img.onload = null;
      img.onerror = null;
    };

    if (isHttpUrl || isRelativeUrl) {
      img.crossOrigin = crossOrigin;
    }

    img.onload = () => {
      cleanup();
      resolve(img);
    };

    img.onerror = (error) => {
      cleanup();
      reject(
        error instanceof Error ? error : new Error("Failed to load image")
      );
    };

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Image load timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    img.decoding = "async";
    img.src = src;
  });

const withTimeout = (
  promise,
  { timeoutMs = 10000, timeoutMessage, onTimeout } = {}
) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timerId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        onTimeout?.();
      } catch (error) {
        console.warn("⚠️ withTimeout onTimeout handler failed:", error);
      }
      const err = new Error(
        timeoutMessage || `Operation timed out after ${timeoutMs}ms`
      );
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timerId);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timerId);
        reject(error);
      });
  });
};

const computeDraftSaveTimeoutMs = (bytes, baseTimeoutMs = 20000) => {
  // ⚡ Increased base from 15s to 20s
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return baseTimeoutMs;
  }

  const bytesPerMb = 1024 * 1024;
  const approxMb = bytes / bytesPerMb;

  // ⚡ More generous scaling: 8s per MB (up from 6s) to handle larger payloads
  const extraMsPerMb = 8000;
  const extraMs = Math.max(
    0,
    Math.ceil(Math.max(0, approxMb - 1)) * extraMsPerMb
  );
  const computedTimeout = baseTimeoutMs + extraMs;
  const maxTimeout = 90000; // ⚡ Extended cap from 60s to 90s for very large drafts

  return Math.min(Math.max(baseTimeoutMs, computedTimeout), maxTimeout);
};

const prepareCanvasExportClone = (
  rootNode,
  { makePhotoSlotsTransparent = true } = {}
) => {
  if (!rootNode) {
    return;
  }

  try {
    rootNode.setAttribute("data-export-clone", "true");

    // Remove UI elements that shouldn't be in export
    const ignoreNodes = rootNode.querySelectorAll("[data-export-ignore]");
    ignoreNodes.forEach((node) => node.remove());

    const resizeHandles = rootNode.querySelectorAll(
      ".react-rnd-handle, .creator-resize-wrapper"
    );
    resizeHandles.forEach((node) => node.remove());

    if (makePhotoSlotsTransparent) {
      // Make photo slots transparent (used for frame/export images)
      const photoSlots = rootNode.querySelectorAll(
        ".creator-element--type-photo"
      );
      photoSlots.forEach((slot) => {
        slot.style.background = "transparent";
        slot.style.backgroundColor = "transparent";
        slot.style.boxShadow = "none";
        slot.style.color = "transparent";
        slot.style.textShadow = "none";
        slot.style.fontSize = "0px";
        slot.style.filter = "none";
        slot.style.mixBlendMode = "normal";
        const children = Array.from(slot.children || []);
        children.forEach((child) => slot.removeChild(child));
      });
    }

    // ✅ CRITICAL FIX: Physically reorder DOM elements by z-index
    // html2canvas renders based on DOM order when position:absolute is used
    const creatorElements = Array.from(
      rootNode.querySelectorAll(".creator-element")
    );

    if (creatorElements.length > 0) {
      // Get parent container
      const parent = creatorElements[0].parentNode;

      // Sort elements by z-index (low to high)
      const sorted = creatorElements.sort((a, b) => {
        const aZ =
          Number.parseFloat(a.getAttribute("data-element-zindex")) ||
          Number.parseFloat(a.style.zIndex) ||
          0;
        const bZ =
          Number.parseFloat(b.getAttribute("data-element-zindex")) ||
          Number.parseFloat(b.style.zIndex) ||
          0;
        return aZ - bZ;
      });

      // Remove all elements from DOM
      sorted.forEach((el) => el.remove());

      // Re-append in sorted order (low z-index first, high z-index last)
      sorted.forEach((el) => {
        // Sync CSS z-index to match data attribute
        const dataZ = el.getAttribute("data-element-zindex");
        if (dataZ && Number.isFinite(Number.parseFloat(dataZ))) {
          el.style.zIndex = dataZ;
        }
        parent.appendChild(el);
      });

      console.log(
        "✅ [prepareCanvasExportClone] DOM reordered by z-index:",
        sorted.map((el) => ({
          type: el.className.match(/creator-element--type-(\w+)/)?.[1],
          zIndex: el.style.zIndex,
          dataZIndex: el.getAttribute("data-element-zindex"),
        }))
      );
    }
  } catch (error) {
    console.error(
      "❌ [prepareCanvasExportClone] Error during clone preparation:",
      error
    );
  }
};

const getSafeZIndex = (element) => {
  if (!element || typeof element !== "object") {
    return NORMAL_ELEMENTS_MIN_Z;
  }
  const parsed = Number(element.zIndex);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  if (element.type === "background-photo") {
    return BACKGROUND_PHOTO_Z;
  }
  return NORMAL_ELEMENTS_MIN_Z;
};

const collectOverlayElementIds = (elements = []) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return new Set();
  }

  const photoElements = elements.filter(
    (element) =>
      element &&
      element.type === "photo" &&
      element.data?.__capturedOverlay !== true
  );

  if (photoElements.length === 0) {
    return new Set();
  }

  const overlayIds = new Set();
  const photoZValues = photoElements.map((photo) => getSafeZIndex(photo));

  elements.forEach((candidate) => {
    if (!candidate || overlayIds.has(candidate.id)) {
      return;
    }

    if (
      candidate.type === "photo" ||
      candidate.type === "background-photo" ||
      candidate.type === "transparent-area" ||
      candidate.data?.__capturedOverlay === true
    ) {
      return;
    }

    const candidateZ = getSafeZIndex(candidate);

    const shouldOverlay = photoZValues.some((photoZ) => candidateZ > photoZ);
    if (shouldOverlay && candidate?.id) {
      overlayIds.add(candidate.id);
    }
  });

  return overlayIds;
};

const normalizePhotoLayering = (elements = []) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return elements;
  }

  let didMutate = false;

  const normalizedElements = elements.map((element) => {
    if (!element || typeof element !== "object") {
      return element;
    }

    if (element.type === "background-photo") {
      return element;
    }

    // If element already has a valid z-index, KEEP IT!
    // Don't auto-increment or change existing z-index values
    if (Number.isFinite(element.zIndex)) {
      return element;
    }

    // Only set default z-index for elements that don't have one
    const absoluteMin = BACKGROUND_PHOTO_Z + 1;
    let defaultZ = NORMAL_ELEMENTS_MIN_Z;

    // Photo and upload elements can start lower
    if (element.type === "photo" || element.type === "upload") {
      defaultZ = PHOTO_SLOT_MIN_Z;
    }

    let desiredZ = defaultZ;
    if (desiredZ < absoluteMin) {
      desiredZ = absoluteMin;
    }

    didMutate = true;
    return { ...element, zIndex: desiredZ };
  });

  return didMutate ? normalizedElements : elements;
};

const createOverlayId = (placeholderId, photoIndex) => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `captured-overlay-${
    placeholderId || "slot"
  }-${photoIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const deriveOverlayZIndex = (placeholder) => {
  const baseZ = Number.isFinite(placeholder?.zIndex)
    ? placeholder.zIndex
    : NORMAL_ELEMENTS_MIN_Z;
  return baseZ + CAPTURED_OVERLAY_Z_OFFSET;
};

const createCapturedPhotoOverlay = (placeholder, photoData, photoIndex) => {
  const overlayId = createOverlayId(placeholder?.id, photoIndex);
  const overlayZIndex = deriveOverlayZIndex(placeholder);
  return {
    id: overlayId,
    type: "upload",
    x: placeholder?.x ?? 0,
    y: placeholder?.y ?? 0,
    width: placeholder?.width ?? 0,
    height: placeholder?.height ?? 0,
    rotation: placeholder?.rotation ?? 0,
    zIndex: overlayZIndex,
    isLocked: true,
    data: {
      image: photoData,
      objectFit: "cover",
      borderRadius: placeholder?.data?.borderRadius ?? 0,
      stroke: null,
      strokeWidth: 0,
      label: `Foto ${photoIndex + 1}`,
      __capturedOverlay: true,
      __sourcePlaceholderId: placeholder?.id ?? null,
      __photoIndex: photoIndex,
    },
  };
};

const injectCapturedPhotoOverlays = (elements = []) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return elements;
  }

  const storedPhotos = safeStorage.getJSON("capturedPhotos");
  if (!Array.isArray(storedPhotos) || storedPhotos.length === 0) {
    return elements.filter((element) => !element?.data?.__capturedOverlay);
  }

  const cleanedElements = elements.filter(
    (element) => !element?.data?.__capturedOverlay
  );

  const photoPlaceholders = cleanedElements.filter(
    (element) => element?.type === "photo"
  );

  if (!photoPlaceholders.length) {
    return cleanedElements;
  }

  const overlays = [];

  // Force overlays to use minimum z-index so photos stay behind ALL other elements
  // including background and shapes. This ensures captured photos never appear on top.

  photoPlaceholders.forEach((placeholder, placeholderIndex) => {
    const photoIndex = placeholderIndex;
    const photoData = storedPhotos[photoIndex];
    if (typeof photoData !== "string" || !photoData.startsWith("data:")) {
      return;
    }
    const overlay = createCapturedPhotoOverlay(
      placeholder,
      photoData,
      photoIndex
    );
    console.log(
      `📸 [injectCapturedPhotoOverlays] Creating overlay ${photoIndex} with z-index:`,
      overlay.zIndex
    );
    overlays.push(overlay);
  });

  if (!overlays.length) {
    return cleanedElements;
  }

  // Build a map from placeholder id -> overlay so we can insert overlays
  // next to their source placeholder. Appending overlays at the end
  // causes DOM order to put overlays after placeholders with equal zIndex,
  // which makes overlays render on top. Insert overlay before its
  // placeholder so they remain associated and respect stacking rules.
  const overlayBySource = new Map();
  overlays.forEach((ov) => {
    const src = ov?.data?.__sourcePlaceholderId;
    if (src) overlayBySource.set(src, ov);
  });

  const result = [];
  cleanedElements.forEach((el) => {
    if (el?.type === "photo" && el.id && overlayBySource.has(el.id)) {
      // Insert overlay BEFORE the placeholder so placeholder remains later in DOM
      // (same zIndex but stable sort keeps array order). This prevents overlays
      // from being globally appended and accidentally appearing above unrelated
      // elements with the same stacking value.
      result.push(overlayBySource.get(el.id));
      result.push(el);
      overlayBySource.delete(el.id);
    } else {
      result.push(el);
    }
  });

  // If any overlays remain (no matching placeholder), append them at end
  overlayBySource.forEach((ov) => result.push(ov));

  console.log("✅ [injectCapturedPhotoOverlays] Final result:", {
    totalElements: result.length,
    overlaysAdded: overlays.length,
    zIndexes: result.map((el) => ({
      type: el.type,
      zIndex: el.zIndex,
      isOverlay: el?.data?.__capturedOverlay,
    })),
  });

  return result;
};

// Smart background removal: samples ALL border pixels, finds dominant background color,
// then flood-fills with tight tolerance so only actual background is removed.
const removeWhiteBackground = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const MAX = 1000;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    let imgData;
    try { imgData = ctx.getImageData(0, 0, w, h); } catch { resolve(dataUrl); return; }
    const d = imgData.data;

    // If image already has transparency, skip
    let hasTransparency = false;
    for (let i = 3; i < d.length; i += 4) { if (d[i] < 200) { hasTransparency = true; break; } }
    if (hasTransparency) { resolve(canvas.toDataURL('image/png')); return; }

    // --- Step 1: sample all border pixels, bin into 8-unit buckets ---
    const binKey = (r, g, b) =>
      `${Math.round(r / 8) * 8},${Math.round(g / 8) * 8},${Math.round(b / 8) * 8}`;
    const colorBins = new Map();
    const addBorder = (x, y) => {
      const i = (y * w + x) * 4;
      const key = binKey(d[i], d[i+1], d[i+2]);
      colorBins.set(key, (colorBins.get(key) || 0) + 1);
    };
    for (let x = 0; x < w; x++) { addBorder(x, 0); addBorder(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { addBorder(0, y); addBorder(w - 1, y); }

    // --- Step 2: pick most dominant border color ---
    let maxCount = 0, bgKey = '';
    for (const [key, count] of colorBins) {
      if (count > maxCount) { maxCount = count; bgKey = key; }
    }
    const totalBorderPx = 2 * (w + h) - 4;
    if (maxCount < totalBorderPx * 0.08 || !bgKey) { resolve(dataUrl); return; }
    const [bgR, bgG, bgB] = bgKey.split(',').map(Number);

    // --- Step 3: flood-fill from edges with tight per-channel tolerance ---
    const TOL = 60;
    const visited = new Uint8Array(w * h);
    const q = new Int32Array(w * h * 2);
    let qHead = 0, qTail = 0;
    const enqueue = (x, y) => {
      if (x >= 0 && x < w && y >= 0 && y < h) {
        const idx = y * w + x;
        if (!visited[idx]) { visited[idx] = 1; q[qTail++] = x; q[qTail++] = y; }
      }
    };
    for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { enqueue(0, y); enqueue(w - 1, y); }

    while (qHead < qTail) {
      const x = q[qHead++], y = q[qHead++];
      const p = (y * w + x) * 4;
      const diff = Math.abs(d[p] - bgR) + Math.abs(d[p+1] - bgG) + Math.abs(d[p+2] - bgB);
      if (diff <= TOL) {
        d[p + 3] = 0;
        enqueue(x - 1, y); enqueue(x + 1, y);
        enqueue(x, y - 1); enqueue(x, y + 1);
      }
    }

    // --- Step 4: soft edge — semi-transparent fringe pixels (anti-aliasing) ---
    const SOFT_TOL = 110;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (d[p + 3] === 0) continue;
        const diff = Math.abs(d[p] - bgR) + Math.abs(d[p+1] - bgG) + Math.abs(d[p+2] - bgB);
        if (diff <= SOFT_TOL) {
          const alpha = Math.round(((diff - TOL) / (SOFT_TOL - TOL)) * 255);
          if (alpha < d[p + 3]) d[p + 3] = alpha;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

export default function Create() {
  console.log("[Create] Component rendering...");
  const fileInputRef = useRef(null);
  const importFrameInputRef = useRef(null);
  const uploadPurposeRef = useRef("upload");
  const toastTimeoutRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [activeMobileProperty, setActiveMobileProperty] = useState(null);
  const [showCanvasSizeInProperties, setShowCanvasSizeInProperties] =
    useState(false);
  const [gradientColor1, setGradientColor1] = useState("#667eea");
  const [gradientColor2, setGradientColor2] = useState("#764ba2");
  const [canvasAspectRatio, setCanvasAspectRatio] = useState("9:16"); // Story Instagram default
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [draftTitle, setDraftTitle] = useState(""); // Title untuk draft
  const [draftDescription, setDraftDescription] = useState(""); // Deskripsi untuk draft
  const [justSavedDraft, setJustSavedDraft] = useState(false); // Track if draft was just saved
  const [isExistingDraft, setIsExistingDraft] = useState(false); // Track if draft was loaded from existing drafts
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(false); // Lock background to prevent accidental edits
  const [pendingPhotoTool, setPendingPhotoTool] = useState(false); // Show photo tool properties without adding element
  const [pendingPexelsTool, setPendingPexelsTool] = useState(false); // Show Pexels/Pixabay search in properties panel
  const [showUseFrameConfirm, setShowUseFrameConfirm] = useState(false); // Confirm dialog before using frame without saving
  // ── Import Frame ──
  const [importFrameWorking, setImportFrameWorking] = useState(false);
  const previewFrameRef = useRef(null);
  const [previewConstraints, setPreviewConstraints] = useState({
    maxWidth: 460,
    maxHeight: 480,
  });
  const hasLoadedDraftRef = useRef(false);
  const isLoadingDraftRef = useRef(false); // NEW: Track when actively loading a draft
  const loadingTimeoutRef = useRef(null); // Track timeout for cleanup
  const autoThumbnailGeneratedRef = useRef(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth(); // For cloud draft saving
  const [hasAccess, setHasAccess] = useState(false);

  const getEffectiveAuthUser = useCallback(() => {
    if (user?.email || user?.role) return user;

    try {
      const cachedUser = localStorage.getItem("fremio_user");
      if (cachedUser) {
        return JSON.parse(cachedUser);
      }
    } catch (_) {
      // ignore malformed cached auth
    }

    return null;
  }, [user]);

  const effectiveAuthUser = getEffectiveAuthUser();
  const effectiveUserEmail = effectiveAuthUser?.email || null;

  // Check membership access for membership-locked draft behavior.
  useEffect(() => {
    if (!effectiveUserEmail) { setHasAccess(false); return; }
    paymentService.getAccess()
      .then((res) => setHasAccess(!!(res?.success && res?.hasAccess)))
      .catch(() => setHasAccess(false));
  }, [effectiveUserEmail]);
  // NOTE: Must be defined before any callbacks that reference it.
  const getCanvasDimensions = useCallback((ratio) => {
    const defaultDimensions = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

    if (typeof ratio !== "string") {
      return defaultDimensions;
    }

    // Special case for Photostrip (exact 1200x1800)
    if (ratio === "1200:1800" || ratio === "photostrip") {
      return { width: 1200, height: 1800 };
    }

    // A-paper sizes (portrait, 1:√2 ratio — each at its own reference resolution)
    if (ratio === "A5") return { width: 1080, height: 1529 };  // 148×210mm
    if (ratio === "A4") return { width: 1240, height: 1754 };  // 210×297mm
    if (ratio === "A3") return { width: 1754, height: 2480 };  // 297×420mm

    const [rawWidth, rawHeight] = ratio.split(":").map(Number);
    const ratioWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : null;
    const ratioHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : null;

    if (!ratioWidth || !ratioHeight) {
      return defaultDimensions;
    }

    if (ratioHeight >= ratioWidth) {
      return {
        width: CANVAS_WIDTH,
        height: Math.round((CANVAS_WIDTH * ratioHeight) / ratioWidth),
      };
    }

    return {
      width: Math.round((CANVAS_HEIGHT * ratioWidth) / ratioHeight),
      height: CANVAS_HEIGHT,
    };
  }, []);

  const buildElementsFromBaseFrame = useCallback(
    (baseFrame, aspectRatio) => {
      if (!baseFrame) return [];

      const dims = getCanvasDimensions(aspectRatio);
      const width = dims.width;
      const height = dims.height;

      const result = [];

      // 1) Photo slots (normalized 0..1)
      if (Array.isArray(baseFrame.slots)) {
        baseFrame.slots.forEach((slot, index) => {
          if (!slot) return;
          const left = Number(slot.left);
          const top = Number(slot.top);
          const slotWidth = Number(slot.width);
          const slotHeight = Number(slot.height);

          if (
            !Number.isFinite(left) ||
            !Number.isFinite(top) ||
            !Number.isFinite(slotWidth) ||
            !Number.isFinite(slotHeight)
          ) {
            return;
          }

          result.push({
            id: slot.id || `photo_${index + 1}`,
            type: "photo",
            x: left * width,
            y: top * height,
            width: slotWidth * width,
            height: slotHeight * height,
            rotation: typeof slot.rotation === "number" ? slot.rotation : 0,
            zIndex: 0,
            data: {
              photoIndex:
                slot.photoIndex !== undefined ? slot.photoIndex : index,
              borderRadius: slot.borderRadius || 0,
            },
          });
        });
      }

      const hasPhotoSlotsFromSlots = result.some(
        (element) => element?.type === "photo"
      );

      // 2) Overlay/upload/text/shape elements (may be stored as normalized)
      // NOTE: layout.elements may contain photo-type elements reconstructed from slots,
      // but some legacy/custom templates only persist photo areas there. Keep them as a
      // fallback when slots did not produce any photo elements.
      const layoutElements = baseFrame?.layout?.elements;
      if (Array.isArray(layoutElements)) {
        layoutElements.forEach((el) => {
          if (!el || typeof el !== "object") return;

          // Skip duplicated photo elements when normalized slots already recreated them.
          if (el.type === "photo" && hasPhotoSlotsFromSlots) return;

          let restoredWidth =
            el.widthNorm !== undefined ? el.widthNorm * width : el.width;
          let restoredHeight =
            el.heightNorm !== undefined ? el.heightNorm * height : el.height;

          if (el.type === "upload" && el.data?.imageAspectRatio) {
            restoredHeight = restoredWidth / el.data.imageAspectRatio;
          }

          // CRITICAL: ALL non-photo, non-background elements must be above photo slots (zIndex 0)
          // Use minimum 100 for ALL overlay types (upload, text, shape, etc.)
          const OVERLAY_MIN_Z = 100;
          const restoredZIndex =
            el.type === "photo"
              ? 0
              : el.type === "background-photo"
              ? -4000
              : Math.max(el.zIndex || OVERLAY_MIN_Z, OVERLAY_MIN_Z);

          const restoredElement = {
            ...el,
            x: el.xNorm !== undefined ? el.xNorm * width : el.x,
            y: el.yNorm !== undefined ? el.yNorm * height : el.y,
            width: restoredWidth,
            height: restoredHeight,
            zIndex: restoredZIndex,
          };

          delete restoredElement.xNorm;
          delete restoredElement.yNorm;
          delete restoredElement.widthNorm;
          delete restoredElement.heightNorm;

          result.push(restoredElement);
        });
      }

      return result;
    },
    [getCanvasDimensions]
  );

  // CRITICAL: Reset hasLoadedDraftRef on component unmount so storage clears on re-entry
  useEffect(() => {
    return () => {
      hasLoadedDraftRef.current = false;
    };
  }, []);

  // Ensure auth user is mirrored into localStorage/sessionStorage so utilities can read it reliably
  useEffect(() => {
    if (user?.email) {
      try {
        const payload = JSON.stringify(user);
        localStorage.setItem("fremio_user", payload);
        sessionStorage.setItem("fremio_user_cache", payload);
        console.log("🔐 [Create] Synced user to storage:", user.email);
      } catch (err) {
        console.warn("⚠️ [Create] Failed to sync user to storage", err);
      }
    }
  }, [user?.email]);

  const showToast = useCallback((type, message, duration = 3200) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  const {
    elements,
    selectedElementId,
    canvasBackground,
    addElement,
    addUploadElement,
    addBackgroundPhoto,
    updateElement,
    selectElement,
    setCanvasBackground,
    removeElement,
    duplicateElement,
    toggleLock,
    resizeUploadImage,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    clearSelection,
    fitBackgroundPhotoToCanvas,
    setElements,
  } = useCreatorStore(
    useShallow((state) => ({
      elements: state.elements,
      selectedElementId: state.selectedElementId,
      canvasBackground: state.canvasBackground,
      addElement: state.addElement,
      addUploadElement: state.addUploadElement,
      addBackgroundPhoto: state.addBackgroundPhoto,
      updateElement: state.updateElement,
      selectElement: state.selectElement,
      setCanvasBackground: state.setCanvasBackground,
      removeElement: state.removeElement,
      duplicateElement: state.duplicateElement,
      toggleLock: state.toggleLock,
      resizeUploadImage: state.resizeUploadImage,
      bringToFront: state.bringToFront,
      sendToBack: state.sendToBack,
      bringForward: state.bringForward,
      sendBackward: state.sendBackward,
      clearSelection: state.clearSelection,
      fitBackgroundPhotoToCanvas: state.fitBackgroundPhotoToCanvas,
      setElements: state.setElements,
    }))
  );

  const selectedElement = useMemo(() => {
    if (selectedElementId === "background") return "background";
    return elements.find((el) => el.id === selectedElementId) || null;
  }, [elements, selectedElementId]);

  useEffect(() => {
    // Clear stale cache (older than 24 hours)
    clearStaleFrameCache();

    // ✅ CRITICAL FIX: Skip this effect while loading a draft
    // This prevents interference with draft loading process
    if (isLoadingDraftRef.current) {
      console.log(
        "⏭️ [useEffect] Skipping overlay injection - draft is loading"
      );
      return;
    }

    const storedPhotos = safeStorage.getJSON("capturedPhotos");
    const hasStoredPhotos =
      Array.isArray(storedPhotos) && storedPhotos.length > 0;
    const hasOverlays = elements.some(
      (element) => element?.data?.__capturedOverlay
    );

    if (hasStoredPhotos && !hasOverlays) {
      const augmented = injectCapturedPhotoOverlays(elements);
      if (augmented.length !== elements.length) {
        setElements(augmented);
      }
      return;
    }

    if (!hasStoredPhotos && hasOverlays) {
      const cleaned = elements.filter(
        (element) => !element?.data?.__capturedOverlay
      );
      if (cleaned.length !== elements.length) {
        setElements(cleaned);
      }
    }
  }, [elements, setElements]);

  useEffect(() => {
    if (!isMobileView) {
      setActiveMobileProperty(null);
      return;
    }
    if (!selectedElementId) {
      setActiveMobileProperty(null);
    }
  }, [isMobileView, selectedElementId]);

  const backgroundPhotoElement = useMemo(
    () => elements.find((el) => el.type === "background-photo") || null,
    [elements]
  );

  const selectedElementObject =
    selectedElement && selectedElement !== "background"
      ? selectedElement
      : null;
  const isBackgroundSelected = selectedElement === "background";
  const isMobilePropertyToolbar =
    isMobileView && (isBackgroundSelected || Boolean(selectedElementObject));

  useEffect(() => {
    if (!isMobileView) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const canvasNode =
        previewFrameRef.current?.querySelector("#creator-canvas");
      const toolbarNode = document.querySelector(".create-mobile-toolbar");
      const propertyPanelNode = document.querySelector(
        ".create-mobile-property-panel"
      );

      const target = event.target;
      const isInsideCanvas = canvasNode?.contains(target);
      const isInsideToolbar = toolbarNode?.contains(target);
      const isInsidePanel = propertyPanelNode?.contains(target);

      if (!isInsideCanvas && !isInsideToolbar && !isInsidePanel) {
        clearSelection();
        setActiveMobileProperty(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMobileView, clearSelection]);

  const mobilePropertyButtons = useMemo(() => {
    if (!isMobilePropertyToolbar) {
      return [];
    }

    if (isBackgroundSelected) {
      return [
        { id: "background-color", label: "Warna", icon: Palette },
        {
          id: "background-photo",
          label: backgroundPhotoElement ? "Foto" : "Tambah Foto",
          icon: ImageIcon,
        },
      ];
    }

    if (!selectedElementObject) {
      return [];
    }

    switch (selectedElementObject.type) {
      case "text":
        return [
          { id: "text-edit", label: "Edit", icon: TypeIcon },
          { id: "text-font", label: "Font", icon: TypeIcon },
          { id: "text-color", label: "Warna", icon: Palette },
          { id: "text-size", label: "Ukuran", icon: Maximize2 },
          { id: "text-align", label: "Rata", icon: AlignCenter },
          { id: "layer-order", label: "Lapisan", icon: Layers },
        ];
      case "shape":
        return [
          { id: "shape-color", label: "Warna", icon: Palette },
          { id: "shape-size", label: "Ukuran", icon: Maximize2 },
          { id: "shape-radius", label: "Sudut", icon: CornerDownRight },
          { id: "shape-outline", label: "Outline", icon: Square },
          { id: "layer-order", label: "Lapisan", icon: Layers },
        ];
      case "photo":
        return [
          { id: "photo-color", label: "Warna", icon: Palette },
          { id: "photo-fit", label: "Gaya", icon: Settings2 },
          { id: "photo-size", label: "Ukuran", icon: Maximize2 },
          { id: "photo-radius", label: "Sudut", icon: CornerDownRight },
          { id: "photo-outline", label: "Outline", icon: Square },
          { id: "photo-manage", label: "Kelola", icon: Trash2 },
          { id: "layer-order", label: "Lapisan", icon: Layers },
        ];
      case "upload":
        return [
          { id: "photo-color", label: "Warna", icon: Palette },
          { id: "photo-fit", label: "Gaya", icon: Settings2 },
          { id: "photo-size", label: "Ukuran", icon: Maximize2 },
          { id: "photo-radius", label: "Sudut", icon: CornerDownRight },
          { id: "upload-outline", label: "Outline", icon: Square },
          { id: "upload-manage", label: "Kelola", icon: Trash2 },
          { id: "layer-order", label: "Lapisan", icon: Layers },
        ];
      case "background-photo":
        return [
          { id: "bg-photo-fit", label: "Gaya", icon: Settings2 },
          { id: "bg-photo-size", label: "Ukuran", icon: Maximize2 },
          { id: "bg-photo-manage", label: "Foto", icon: ImageIcon },
        ];
      default:
        return [];
    }
  }, [
    isMobilePropertyToolbar,
    isBackgroundSelected,
    backgroundPhotoElement,
    selectedElementObject,
  ]);

  useEffect(() => {
    if (!activeMobileProperty) {
      return;
    }
    if (!isMobilePropertyToolbar) {
      if (activeMobileProperty !== "canvas-size") {
        setActiveMobileProperty(null);
      }
      return;
    }
    const availableIds = new Set(mobilePropertyButtons.map((item) => item.id));
    if (!availableIds.has(activeMobileProperty)) {
      setActiveMobileProperty(null);
    }
  }, [activeMobileProperty, isMobilePropertyToolbar, mobilePropertyButtons]);

  const getImageMetadata = useCallback((src) => {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          aspectRatio:
            image.naturalWidth > 0 && image.naturalHeight > 0
              ? image.naturalWidth / image.naturalHeight
              : undefined,
        });
      };
      image.onerror = () => resolve({});
      image.decoding = "async";
      image.src = src;
    });
  }, []);

  const deriveAspectRatioFromDraft = useCallback((draft) => {
    if (!draft) {
      return "9:16";
    }

    if (
      typeof draft.aspectRatio === "string" &&
      draft.aspectRatio.includes(":")
    ) {
      return draft.aspectRatio;
    }

    const width = Number(draft.canvasWidth);
    const height = Number(draft.canvasHeight);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return "9:16";
    }

    const normalize = (value) => Math.round(Number(value));
    const gcd = (a, b) => {
      let x = Math.abs(a);
      let y = Math.abs(b);
      while (y) {
        const temp = y;
        y = x % y;
        x = temp;
      }
      return x || 1;
    };

    const normalizedWidth = Math.max(1, normalize(width));
    const normalizedHeight = Math.max(1, normalize(height));
    const divisor = gcd(normalizedWidth, normalizedHeight);
    const ratioWidth = Math.max(1, Math.round(normalizedWidth / divisor));
    const ratioHeight = Math.max(1, Math.round(normalizedHeight / divisor));
    return `${ratioWidth}:${ratioHeight}`;
  }, []);

  const scaleDraftElements = useCallback(
    (elements, fromWidth, fromHeight, toWidth, toHeight) => {
      if (!Array.isArray(elements)) {
        return [];
      }

      if (
        !Number.isFinite(fromWidth) ||
        !Number.isFinite(fromHeight) ||
        fromWidth <= 0 ||
        fromHeight <= 0
      ) {
        return elements;
      }

      if (
        !Number.isFinite(toWidth) ||
        !Number.isFinite(toHeight) ||
        toWidth <= 0 ||
        toHeight <= 0
      ) {
        return elements;
      }

      const scaleX = toWidth / fromWidth;
      const scaleY = toHeight / fromHeight;

      if (Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) {
        return elements;
      }

      const averageScale = (scaleX + scaleY) / 2;

      return elements.map((element) => {
        if (!element || typeof element !== "object") {
          return element;
        }

        const next = { ...element };

        if (typeof next.x === "number") {
          next.x = Math.round(next.x * scaleX);
        }
        if (typeof next.y === "number") {
          next.y = Math.round(next.y * scaleY);
        }
        if (typeof next.width === "number") {
          next.width = Math.round(next.width * scaleX);
        }
        if (typeof next.height === "number") {
          next.height = Math.round(next.height * scaleY);
        }

        if (next?.data && typeof next.data === "object") {
          const data = { ...next.data };

          if (typeof data.borderRadius === "number") {
            data.borderRadius = Math.max(
              0,
              Math.round(data.borderRadius * averageScale)
            );
          }

          if (typeof data.strokeWidth === "number") {
            data.strokeWidth = Math.max(
              0,
              Math.round(data.strokeWidth * averageScale)
            );
          }

          if (typeof data.fontSize === "number") {
            data.fontSize = Math.max(1, Math.round(data.fontSize * scaleY));
          }

          if (typeof data.lineHeight === "number") {
            data.lineHeight = Math.max(0.1, data.lineHeight * scaleY);
          }

          if (typeof data.letterSpacing === "number") {
            data.letterSpacing = data.letterSpacing * scaleX;
          }

          if (typeof data.outlineWidth === "number") {
            data.outlineWidth = Math.max(
              0,
              Math.round(data.outlineWidth * averageScale)
            );
          }

          next.data = data;
        }

        return next;
      });
    },
    []
  );

  const generateCurrentCanvasThumbnail = useCallback(async () => {
    const canvasNode = document.getElementById("creator-canvas");
    if (!canvasNode) return "";

    const { width: canvasWidth, height: canvasHeight } =
      getCanvasDimensions(canvasAspectRatio);

    const exportWrapper = document.createElement("div");
    Object.assign(exportWrapper.style, {
      position: "fixed",
      top: "-10000px",
      left: "-10000px",
      width: `${canvasWidth}px`,
      height: `${canvasHeight}px`,
      overflow: "hidden",
      pointerEvents: "none",
      opacity: "0",
      zIndex: "-1",
    });

    const exportCanvasNode = canvasNode.cloneNode(true);
    exportCanvasNode.id = "creator-canvas-export-thumb";
    Object.assign(exportCanvasNode.style, {
      transform: "none",
      transformOrigin: "top left",
      position: "relative",
      top: "0",
      left: "0",
      width: `${canvasWidth}px`,
      height: `${canvasHeight}px`,
      margin: "0",
      boxShadow: "none",
    });

    exportWrapper.appendChild(exportCanvasNode);
    document.body.appendChild(exportWrapper);

    try {
      prepareCanvasExportClone(exportCanvasNode, {
        makePhotoSlotsTransparent: false,
      });

      const captureScale = 1;
      const thumbCanvas = await withTimeout(
        html2canvas(exportCanvasNode, {
          backgroundColor: null,
          useCORS: true,
          scale: captureScale,
          width: canvasWidth,
          height: canvasHeight,
          windowWidth: canvasWidth,
          windowHeight: canvasHeight,
          scrollX: 0,
          scrollY: 0,
          allowTaint: true,
          logging: false,
          ignoreElements: (element) => {
            if (!element) return false;
            if (element.nodeType === Node.ELEMENT_NODE) {
              if (
                element.classList?.contains(
                  "creator-element--captured-overlay"
                )
              )
                return true;
              if (element.getAttribute?.("data-export-ignore") === "true")
                return true;
              if (element.closest?.('[data-export-ignore="true"]'))
                return true;
            }
            return false;
          },
        }),
        {
          timeoutMs: 20000,
          timeoutMessage: "Rendering thumbnail took too long",
        }
      );

      // Scale down for list thumbnails
      let thumbExport = thumbCanvas;
      const maxThumbWidth = 400;
      if (thumbExport.width > maxThumbWidth) {
        const previewScale = maxThumbWidth / thumbExport.width;
        const scaledCanvas = document.createElement("canvas");
        scaledCanvas.width = Math.max(
          1,
          Math.round(thumbExport.width * previewScale)
        );
        scaledCanvas.height = Math.max(
          1,
          Math.round(thumbExport.height * previewScale)
        );
        const ctx = scaledCanvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "medium";
          ctx.drawImage(
            thumbExport,
            0,
            0,
            scaledCanvas.width,
            scaledCanvas.height
          );
          thumbExport = scaledCanvas;
        }
      }

      return thumbExport.toDataURL("image/jpeg", 0.55);
    } catch (err) {
      console.warn("⚠️ Failed to auto-generate thumbnail", err);
      return "";
    } finally {
      if (exportWrapper.parentNode) {
        exportWrapper.parentNode.removeChild(exportWrapper);
      }
    }
  }, [canvasAspectRatio, getCanvasDimensions]);

  const loadDraftIntoEditor = useCallback(
    async (draftId, { notify = true, userEmail = null } = {}) => {
      console.log("🎬 [loadDraftIntoEditor] STARTED with draftId:", draftId);
      console.log("👤 [loadDraftIntoEditor] userEmail provided:", userEmail);

      if (!draftId) {
        console.log("❌ [loadDraftIntoEditor] No draftId provided");
        return false;
      }

      // ✅ CRITICAL FIX: Set loading flag to prevent useEffect interference
      isLoadingDraftRef.current = true;
      console.log("🔒 [loadDraftIntoEditor] Set loading flag to TRUE");

      // ✅ CRITICAL FIX: getDraftById is async, must await it!
      // Pass userEmail to bypass localStorage timing issues
      const draft = await draftStorage.getDraftById(draftId, userEmail);
      console.log("📦 [loadDraftIntoEditor] Draft from storage:", {
        found: !!draft,
        id: draft?.id,
        elementsCount: draft?.elements?.length,
        hasPreview: !!draft?.preview,
        hasCapturedPhotos: draft?.capturedPhotos?.length || 0,
      });

      if (!draft) {
        if (notify) {
          showToast("error", "Draft tidak ditemukan.");
        }
        isLoadingDraftRef.current = false; // Reset flag on error
        return false;
      }

      // Restore captured photos if they were saved with the draft
      if (
        Array.isArray(draft.capturedPhotos) &&
        draft.capturedPhotos.length > 0
      ) {
        console.log(
          "📸 [loadDraftIntoEditor] Restoring captured photos:",
          draft.capturedPhotos.length
        );
        safeStorage.setJSON("capturedPhotos", draft.capturedPhotos);
      } else {
        console.log("📸 [loadDraftIntoEditor] No captured photos to restore");
        safeStorage.removeItem("capturedPhotos");
      }

      let clonedElements = Array.isArray(draft.elements)
        ? typeof structuredClone === "function"
          ? structuredClone(draft.elements)
          : JSON.parse(JSON.stringify(draft.elements))
        : [];

      console.log(
        "📋 [loadDraftIntoEditor] Cloned elements:",
        clonedElements.length
      );

      // Ensure background-photo always has z-index 0
      clonedElements = clonedElements.map((el) => {
        if (el?.type === "background-photo") {
          return { ...el, zIndex: 0 };
        }
        return el;
      });

      // ✅ FIX: Don't add frame artwork when loading draft!
      // The draft.elements already contains all elements including frame artwork if it was saved
      // Adding it again here causes DUPLICATION (frame appears 2x)
      //
      // REMOVED CODE:
      // - Check for draft.frameArtwork
      // - Use draft.preview as fallback
      // - Create and push artworkElement
      //
      // WHY: Draft should be self-contained with all elements
      // Frame artwork was already saved in draft.elements when template was created

      console.log(
        "📋 [loadDraftIntoEditor] Cloned elements (WITHOUT adding frame artwork separately):",
        {
          count: clonedElements.length,
          types: clonedElements.map((el) => el.type),
        }
      );

      const targetAspectRatio = deriveAspectRatioFromDraft(draft);
      const targetDimensions = getCanvasDimensions(targetAspectRatio);
      const sourceWidth = Number(draft.canvasWidth) || targetDimensions.width;
      const sourceHeight =
        Number(draft.canvasHeight) || targetDimensions.height;
      
      console.log("📐 [loadDraftIntoEditor] Scaling info:", {
        targetAspectRatio,
        targetDimensions,
        sourceWidth,
        sourceHeight,
        draftCanvasWidth: draft.canvasWidth,
        draftCanvasHeight: draft.canvasHeight,
        scaleX: targetDimensions.width / sourceWidth,
        scaleY: targetDimensions.height / sourceHeight,
        needsScaling: sourceWidth !== targetDimensions.width || sourceHeight !== targetDimensions.height,
      });
      
      // DEBUG: Log element sizes before scaling
      console.log("📐 [loadDraftIntoEditor] Elements BEFORE scaling:");
      clonedElements.forEach((el, idx) => {
        if (el.type === 'upload' || el.type === 'background-photo') {
          console.log(`   ${idx}. ${el.type}: ${el.width}x${el.height} at (${el.x}, ${el.y})`);
        }
      });
      
      const scaledElements = scaleDraftElements(
        clonedElements,
        sourceWidth,
        sourceHeight,
        targetDimensions.width,
        targetDimensions.height
      );
      
      // DEBUG: Log element sizes after scaling
      console.log("📐 [loadDraftIntoEditor] Elements AFTER scaling:");
      scaledElements.forEach((el, idx) => {
        if (el.type === 'upload' || el.type === 'background-photo') {
          console.log(`   ${idx}. ${el.type}: ${el.width}x${el.height} at (${el.x}, ${el.y})`);
        }
      });

      const withoutTransparentAreas = Array.isArray(scaledElements)
        ? scaledElements.filter(
            (element) => element?.type !== "transparent-area"
          )
        : [];
      const normalizedElements = normalizePhotoLayering(
        withoutTransparentAreas
      );

      // ✅ CRITICAL FIX: Don't inject overlays when loading draft
      // The draft should already have all elements it needs
      // Injecting overlays here causes issues with z-index and element visibility
      // The useEffect will handle overlay injection later if needed (but we skip it with the loading flag)
      console.log(
        "✅ [loadDraftIntoEditor] Using normalized elements WITHOUT overlay injection:",
        {
          elementsCount: normalizedElements.length,
          types: normalizedElements.map((el) => ({
            type: el.type,
            zIndex: el.zIndex,
          })),
        }
      );

      const runtimeElements = normalizedElements; // Don't inject overlays during load

      console.log("✅ [loadDraftIntoEditor] Setting elements:", {
        normalizedCount: normalizedElements.length,
        runtimeCount: runtimeElements.length,
        aspectRatio: targetAspectRatio,
        detailedElements: runtimeElements.map((el) => ({
          id: el.id?.slice(0, 8),
          type: el.type,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          zIndex: el.zIndex,
          hasImage: !!el.data?.image,
          text: el.data?.text,
        })),
      });

      setCanvasAspectRatio(targetAspectRatio);
      setElements(runtimeElements);
      if (draft.canvasBackground) {
        setCanvasBackground(draft.canvasBackground);
      }
      setActiveDraftId(draft.id);
      setIsExistingDraft(true); // Mark as existing draft when loaded
      // Set title from draft
      if (draft.title) {
        setDraftTitle(draft.title);
      }
      setDraftDescription(draft.description || "");
      clearSelection();
      setActiveMobileProperty(null);

      // Auto-backfill missing thumbnail so CreateHub shows the same preview as Create
      if (!draft.thumbnail && !autoThumbnailGeneratedRef.current.has(draft.id)) {
        autoThumbnailGeneratedRef.current.add(draft.id);
        requestAnimationFrame(() => {
          requestAnimationFrame(async () => {
            try {
              const thumbnail = await generateCurrentCanvasThumbnail();
              if (thumbnail && thumbnail.startsWith("data:image")) {
                await draftStorage.saveDraft({ id: draft.id, thumbnail });
              }
            } catch (err) {
              console.warn("⚠️ Failed to persist auto thumbnail", err);
            }
          });
        });
      }

      const effectiveSignature =
        draft.signature ||
        computeDraftSignature(
          normalizedElements,
          draft.canvasBackground,
          targetAspectRatio
        );

      userStorage.setItem("activeDraftId", draft.id);
      if (effectiveSignature) {
        userStorage.setItem("activeDraftSignature", effectiveSignature);
      }

      hasLoadedDraftRef.current = true;

      // ✅ CRITICAL FIX: Clear loading flag after elements are set
      // Use tracked timeout for proper cleanup
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      loadingTimeoutRef.current = setTimeout(() => {
        isLoadingDraftRef.current = false;
        loadingTimeoutRef.current = null;
        console.log("🔓 [loadDraftIntoEditor] Cleared loading flag");
      }, 100);

      if (notify) {
        showToast("success", "Draft dimuat. Lanjutkan edit sesuai kebutuhan.");
      }

      return true;
    },
    [
      clearSelection,
      deriveAspectRatioFromDraft,
      generateCurrentCanvasThumbnail,
      getCanvasDimensions,
      scaleDraftElements,
      setActiveDraftId,
      setActiveMobileProperty,
      setCanvasAspectRatio,
      setCanvasBackground,
      setElements,
      showToast,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    const draftId = location.state?.draftId;
    const newFrameName = location.state?.newFrameName;
    const comeFromDraftsPage = !!draftId;
    const prefillFromBaseFrame = !!location.state?.prefillFromBaseFrame;
    const baseFrame = location.state?.baseFrame;

    console.log("🎯 [Create useEffect] Navigation detected:", {
      hasDraftId: !!draftId,
      draftId,
      newFrameName,
      comeFromDraftsPage,
      pathname: location.pathname,
      state: location.state,
    });

    // Set frame name from CreateHub if provided
    if (newFrameName && !comeFromDraftsPage) {
      setDraftTitle(newFrameName);
      setDraftDescription("");
    }

    if (comeFromDraftsPage) {
      // User clicked "Lihat Frame" from Drafts page - load the draft
      console.log("📂 [Create] Loading draft from Drafts page:", draftId);
      
      // CRITICAL: Wait for user authentication to initialize before loading draft
      // This prevents getCurrentUserId() from returning "guest" when user is actually logged in
      const userEmail = user?.email;
      if (!userEmail) {
        console.warn("⏳ [Create] Waiting for user authentication before loading draft...");
        console.warn("   User:", user);
        // Don't load yet - wait for next render when user is available
        return;
      }
      
      console.log("✅ [Create] User authenticated:", userEmail);
      hasLoadedDraftRef.current = false; // Reset before loading

      // ✅ CRITICAL FIX: loadDraftIntoEditor is now async, must await it
      // Pass userEmail directly to bypass localStorage timing issues
      loadDraftIntoEditor(draftId, { notify: true, userEmail })
        .then((success) => {
          console.log("📂 [Create] loadDraftIntoEditor result:", success);

          // Only clear navigation state AFTER draft finishes loading.
          // Otherwise the effect re-runs with draftId undefined while still loading,
          // and the "first time entry" reset wipes the canvas.
          if (!cancelled) {
            navigate(location.pathname, { replace: true, state: null });
          }
        })
        .catch((error) => {
          console.error("❌ [Create] Failed to load draft:", error);
        });

      return () => {
        cancelled = true;
      };
    } else if (prefillFromBaseFrame && baseFrame && !hasLoadedDraftRef.current) {
      const baseAspectRatio =
        typeof baseFrame?.layout?.aspectRatio === "string" &&
        baseFrame.layout.aspectRatio.includes(":")
          ? baseFrame.layout.aspectRatio
          : deriveAspectRatioFromDraft({
              canvasWidth: baseFrame?.canvasWidth,
              canvasHeight: baseFrame?.canvasHeight,
            });

      console.log("🧩 [Create] Prefill from base frame:", {
        id: baseFrame?.id,
        name: baseFrame?.name,
        aspectRatio: baseAspectRatio,
      });

      const builtElements = buildElementsFromBaseFrame(
        baseFrame,
        baseAspectRatio
      );

      setCanvasAspectRatio(baseAspectRatio);
      setElements(builtElements);
      setCanvasBackground(
        baseFrame?.canvasBackground ||
          baseFrame?.layout?.backgroundColor ||
          "#ffffff"
      );

      setActiveDraftId(null);
      setIsExistingDraft(false);
      setJustSavedDraft(false);
      setDraftTitle(baseFrame?.name || "");
      setDraftDescription("");
      clearSelection();
      setActiveMobileProperty(null);

      userStorage.removeItem("activeDraftId");
      userStorage.removeItem("activeDraftSignature");

      hasLoadedDraftRef.current = true;
      // IMPORTANT: Do NOT clear navigation state here.
      // Clearing state can cause a remount (e.g. auth/ProtectedRoute) and then the
      // "first time entry" reset branch runs with no state, wiping the prefilled canvas.
      // Leaving state intact is safe because hasLoadedDraftRef prevents re-prefill loops.
    } else if (!hasLoadedDraftRef.current) {
      // If an async draft load is in-flight, do NOT reset the canvas.
      if (isLoadingDraftRef.current) {
        console.log("⏳ [Create] Draft load in progress - skipping reset");
        return;
      }
      // User entered Create page directly - reset ONLY on first mount
      console.log("🔄 [Create] First time entry - resetting canvas");
      setElements([]);
      setCanvasBackground("#ffffff");
      setCanvasAspectRatio("9:16");
      setActiveDraftId(null);
      setIsExistingDraft(false); // Reset - this is a new frame
      setJustSavedDraft(false); // Reset
      // Reset title only if not provided from CreateHub
      if (!newFrameName) {
        setDraftTitle("");
        setDraftDescription("");
      }
      clearSelection();
      userStorage.removeItem("activeDraftId");
      userStorage.removeItem("activeDraftSignature");
      // Clear capturedPhotos from BOTH storage systems to ensure clean state
      userStorage.removeItem("capturedPhotos");
      safeStorage.removeItem("capturedPhotos");
      safeStorage.removeItem("capturedVideos");
      userStorage.removeItem("draftFrameArtwork");
      hasLoadedDraftRef.current = true; // Mark as initialized
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      cancelled = true;
    };
  }, [location.state?.draftId, user?.email]); // Re-run when draftId OR user authentication changes

  useEffect(() => {
    if (hasLoadedDraftRef.current) {
      return;
    }

    if (!user?.email) {
      console.warn("⏳ [Create] Waiting for user auth before loading stored draft...");
      return;
    }

    // Clean up any guest-prefixed storage keys to avoid loading guest drafts
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("guest:")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      if (keysToRemove.length > 0) {
        console.log(`🧹 [Create] Removed ${keysToRemove.length} guest keys to prevent conflict`);
      }
    } catch (err) {
      console.warn("⚠️ [Create] Failed to clean guest keys:", err);
    }

    // Normalize global activeDraftId/Signature into user-scoped storage, then remove globals
    try {
      const globalActiveDraftId = localStorage.getItem("activeDraftId");
      const globalActiveSignature = localStorage.getItem("activeDraftSignature");
      if (globalActiveDraftId) {
        userStorage.setItem("activeDraftId", globalActiveDraftId);
        localStorage.removeItem("activeDraftId");
        console.log("🔄 [Create] Migrated global activeDraftId to user storage");
      }
      if (globalActiveSignature) {
        userStorage.setItem("activeDraftSignature", globalActiveSignature);
        localStorage.removeItem("activeDraftSignature");
        console.log("🔄 [Create] Migrated global activeDraftSignature to user storage");
      }
    } catch (err) {
      console.warn("⚠️ [Create] Failed to migrate global active draft keys:", err);
    }

    const storedDraftId = userStorage.getItem("activeDraftId");
    if (!storedDraftId) {
      return;
    }

    // ✅ CRITICAL FIX: loadDraftIntoEditor is async
    loadDraftIntoEditor(storedDraftId, { notify: false, userEmail: user.email })
      .then(async (loaded) => {
        if (loaded) {
          const storedSignature = userStorage.getItem("activeDraftSignature");
          const draft = await draftStorage.getDraftById(storedDraftId, user.email);
          if (
            storedSignature &&
            draft?.signature &&
            storedSignature !== draft.signature
          ) {
            // Signature mismatch - update storage to reflect current draft state
            safeStorage.setItem("activeDraftSignature", draft.signature);
          }
        }
      })
      .catch((error) => {
        console.error("❌ [Create] Failed to load stored draft:", error);
      });
  }, [loadDraftIntoEditor]);

  useEffect(() => {
    if (!backgroundPhotoElement) {
      return;
    }

    if (!backgroundPhotoElement.data?.imageAspectRatio) {
      const { width: canvasWidth, height: canvasHeight } =
        getCanvasDimensions(canvasAspectRatio);
      const inferredRatio =
        backgroundPhotoElement.width > 0 && backgroundPhotoElement.height > 0
          ? backgroundPhotoElement.width / backgroundPhotoElement.height
          : canvasWidth / canvasHeight;
      updateElement(backgroundPhotoElement.id, {
        data: { imageAspectRatio: inferredRatio },
      });
    }
  }, [
    backgroundPhotoElement,
    updateElement,
    canvasAspectRatio,
    getCanvasDimensions,
  ]);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        isLoadingDraftRef.current = false;
      }
    },
    []
  );

  const triggerUpload = useCallback(() => {
    uploadPurposeRef.current = "upload";
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const triggerBackgroundUpload = useCallback(() => {
    uploadPurposeRef.current = "background";
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === "string") {
        if (uploadPurposeRef.current === "background") {
          const metadata = await getImageMetadata(dataUrl);
          const { width: canvasWidth, height: canvasHeight } =
            getCanvasDimensions(canvasAspectRatio);
          addBackgroundPhoto(dataUrl, {
            ...metadata,
            canvasWidth,
            canvasHeight,
          });
          showToast("success", "Background foto diperbarui.", 2200);
        } else {
          addUploadElement(dataUrl);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Detect transparent slot regions in a frame PNG ──
  // Returns array of normalized { left, top, width, height } objects.
  const detectFrameSlots = useCallback((dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Work at reduced resolution for speed (max 400px on longest side)
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const offscreen = document.createElement("canvas");
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext("2d", { alpha: true });
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const { data: pixels } = ctx.getImageData(0, 0, w, h);

        // Build transparent pixel map (alpha < 128)
        const transp = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
          transp[i] = pixels[i * 4 + 3] < 128 ? 1 : 0;
        }

        // Connected components (flood fill, 4-connected)
        const labels = new Int32Array(w * h).fill(-1);
        const bounds = []; // { minX, minY, maxX, maxY, size }
        const stack = [];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!transp[idx] || labels[idx] !== -1) continue;
            const label = bounds.length;
            const b = { minX: x, minY: y, maxX: x, maxY: y, size: 0 };
            stack.push(idx);
            while (stack.length > 0) {
              const cur = stack.pop();
              if (labels[cur] !== -1) continue;
              labels[cur] = label;
              b.size++;
              const cx = cur % w;
              const cy = Math.floor(cur / w);
              if (cx < b.minX) b.minX = cx;
              if (cx > b.maxX) b.maxX = cx;
              if (cy < b.minY) b.minY = cy;
              if (cy > b.maxY) b.maxY = cy;
              if (cx > 0 && transp[cur - 1] && labels[cur - 1] === -1) stack.push(cur - 1);
              if (cx < w - 1 && transp[cur + 1] && labels[cur + 1] === -1) stack.push(cur + 1);
              if (cy > 0 && transp[cur - w] && labels[cur - w] === -1) stack.push(cur - w);
              if (cy < h - 1 && transp[cur + w] && labels[cur + w] === -1) stack.push(cur + w);
            }
            bounds.push(b);
          }
        }

        // Keep only regions >= 1% of image area (filter noise)
        const minSize = w * h * 0.01;
        const slots = bounds
          .filter((b) => b.size >= minSize)
          .map((b) => ({
            left: b.minX / w,
            top: b.minY / h,
            width: (b.maxX - b.minX + 1) / w,
            height: (b.maxY - b.minY + 1) / h,
          }));

        resolve(slots);
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    });
  }, []);

  // ── Handle frame PNG file selected from device ──
  const handleImportFrameFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    if (importFrameInputRef.current) importFrameInputRef.current.value = "";

    if (!file.type.startsWith("image/")) {
      showToast("error", "Pilih file gambar (PNG/JPG).");
      return;
    }

    if (importFrameWorking) return;
    setImportFrameWorking(true);
    try {
      // 1. Read file as dataUrl
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Get canvas dimensions
      const { width: canvasW, height: canvasH } = getCanvasDimensions(canvasAspectRatio);

      // 3. Detect transparent slot regions from the PNG
      showToast("info", "Mendeteksi area slot foto…", 6000);
      const slots = await detectFrameSlots(dataUrl);

      // 4. Add photo slot elements FIRST (behind), one per detected transparent region
      if (slots.length > 0) {
        slots.forEach((slot, index) => {
          addElement("photo", {
            x: Math.round(slot.left * canvasW),
            y: Math.round(slot.top * canvasH),
            width: Math.round(slot.width * canvasW),
            height: Math.round(slot.height * canvasH),
            zIndex: 0,
            data: { photoIndex: index, borderRadius: 0 },
          });
        });
      } else {
        // No transparent areas found — add single full-canvas slot as fallback
        addElement("photo", {
          x: 0, y: 0, width: canvasW, height: canvasH,
          zIndex: 0,
          data: { photoIndex: 0, borderRadius: 0 },
        });
      }

      // 5. Add frame PNG as upload element on top (full canvas, fills frame area)
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });
      addElement("upload", {
        x: 0,
        y: 0,
        width: canvasW,
        height: canvasH,
        zIndex: 9000,
        locked: false,
        data: {
          image: dataUrl,
          originalImage: dataUrl,
          imageAspectRatio: img.width / img.height,
          objectFit: "fill",
          label: file.name.replace(/\.[^.]+$/, "") || "Frame",
          borderRadius: 0,
          __isOverlay: true,
        },
      });

      const slotMsg = slots.length > 0
        ? `${slots.length} area foto ditambahkan.`
        : "Tidak ada area transparan terdeteksi, 1 slot penuh ditambahkan.";
      showToast("success", `Frame diimport! ${slotMsg}`, 4000);
    } catch (err) {
      showToast("error", err?.message || "Gagal import frame.");
    } finally {
      setImportFrameWorking(false);
    }
  }, [importFrameWorking, showToast, getCanvasDimensions, canvasAspectRatio, detectFrameSlots, addElement]);

  const handleSaveTemplate = async () => {
    if (saving) return;
    const canvasNode = document.getElementById("creator-canvas");
    if (!canvasNode) return;

    let cleanupCapture = null;
    setSaving(true);
    try {
      const { width: canvasWidth, height: canvasHeight } =
        getCanvasDimensions(canvasAspectRatio);

      console.log("🔍 [SAVE DRAFT DEBUG]");
      console.log("  canvasAspectRatio state:", canvasAspectRatio);
      console.log("  Calculated dimensions:", { canvasWidth, canvasHeight });
      console.log("  Calculated aspect ratio:", canvasWidth / canvasHeight);
      console.log("  Expected for 9:16:", 9 / 16, "=", 1080 / 1920);

      // ⚡ AGGRESSIVE: Use lower scale to reduce capture time and size
      const captureScale = 1; // Always use 1x scale (was: 2x for small canvases)

      const exportWrapper = document.createElement("div");
      Object.assign(exportWrapper.style, {
        position: "fixed",
        top: "-10000px",
        left: "-10000px",
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: "0",
        zIndex: "-1",
      });

      const exportCanvasNode = canvasNode.cloneNode(true);
      exportCanvasNode.id = "creator-canvas-export";
      Object.assign(exportCanvasNode.style, {
        transform: "none",
        transformOrigin: "top left",
        position: "relative",
        top: "0",
        left: "0",
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        margin: "0",
        boxShadow: "none",
      });

      exportWrapper.appendChild(exportCanvasNode);
      document.body.appendChild(exportWrapper);

      // 1) THUMBNAIL CAPTURE (what user sees in Create editor, incl. Area Foto placeholders)
      let thumbnailDataUrl = "";
      try {
        const thumbnailClone = exportCanvasNode.cloneNode(true);
        thumbnailClone.id = "creator-canvas-export-thumb";
        exportWrapper.removeChild(exportCanvasNode);
        exportWrapper.appendChild(thumbnailClone);

        prepareCanvasExportClone(thumbnailClone, {
          makePhotoSlotsTransparent: false,
        });

        const thumbCanvas = await withTimeout(
          html2canvas(thumbnailClone, {
            backgroundColor: null,
            useCORS: true,
            scale: captureScale,
            width: canvasWidth,
            height: canvasHeight,
            windowWidth: canvasWidth,
            windowHeight: canvasHeight,
            scrollX: 0,
            scrollY: 0,
            allowTaint: true,
            logging: false,
            ignoreElements: (element) => {
              if (!element) return false;
              if (element.nodeType === Node.ELEMENT_NODE) {
                if (
                  element.classList?.contains(
                    "creator-element--captured-overlay"
                  )
                )
                  return true;
                if (element.getAttribute?.("data-export-ignore") === "true")
                  return true;
                if (element.closest?.('[data-export-ignore="true"]'))
                  return true;
              }
              return false;
            },
          }),
          {
            timeoutMs: 20000,
            timeoutMessage: "Rendering thumbnail took too long",
          }
        );

        // Scale down aggressively for list thumbnails
        let thumbExport = thumbCanvas;
        const maxThumbWidth = 400;
        if (thumbExport.width > maxThumbWidth) {
          const previewScale = maxThumbWidth / thumbExport.width;
          const scaledCanvas = document.createElement("canvas");
          scaledCanvas.width = Math.max(
            1,
            Math.round(thumbExport.width * previewScale)
          );
          scaledCanvas.height = Math.max(
            1,
            Math.round(thumbExport.height * previewScale)
          );
          const ctx = scaledCanvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "medium";
            ctx.drawImage(
              thumbExport,
              0,
              0,
              scaledCanvas.width,
              scaledCanvas.height
            );
            thumbExport = scaledCanvas;
          }
        }

        thumbnailDataUrl = thumbExport.toDataURL("image/jpeg", 0.55);
      } catch (thumbErr) {
        console.warn("⚠️ Failed to generate thumbnail, will fallback", thumbErr);
        thumbnailDataUrl = "";
      }

      // 2) PREVIEW CAPTURE (kept as-is, photo slots transparent)
      // Restore original export node
      exportWrapper.removeChild(exportWrapper.firstChild);
      exportWrapper.appendChild(exportCanvasNode);

      // ✅ SIMPLIFIED: No overlay logic, just sync z-index
      prepareCanvasExportClone(exportCanvasNode, {
        makePhotoSlotsTransparent: true,
      });

      cleanupCapture = () => {
        if (exportWrapper.parentNode) {
          exportWrapper.parentNode.removeChild(exportWrapper);
        }
      };

      // ✅ SINGLE CAPTURE: html2canvas will respect CSS z-index ordering
      console.log(
        "📸 [html2canvas] Starting capture with scale:",
        captureScale
      );
      const captureStartTime = Date.now();

      const capturePromise = html2canvas(exportCanvasNode, {
        backgroundColor: null, // Transparent background
        useCORS: true,
        scale: captureScale,
        width: canvasWidth,
        height: canvasHeight,
        windowWidth: canvasWidth,
        windowHeight: canvasHeight,
        scrollX: 0,
        scrollY: 0,
        allowTaint: true,
        logging: false, // Disable html2canvas verbose logging
        ignoreElements: (element) => {
          if (!element) return false;
          if (element.nodeType === Node.ELEMENT_NODE) {
            // Only ignore UI elements, NOT design elements
            if (
              element.classList?.contains("creator-element--captured-overlay")
            )
              return true;
            if (element.getAttribute?.("data-export-ignore") === "true")
              return true;
            if (element.closest?.('[data-export-ignore="true"]')) return true;
          }
          return false;
        },
      });

      let captureCanvas = null;
      try {
        captureCanvas = await withTimeout(capturePromise, {
          timeoutMs: 20000, // Increased from 15s to 20s for slower devices
          timeoutMessage: "Rendering canvas took too long",
          onTimeout: () =>
            console.warn("⚠️ html2canvas timed out while saving draft"),
        });
        const captureElapsed = Date.now() - captureStartTime;
        console.log(
          `📸 [html2canvas] Capture completed in ${captureElapsed}ms`
        );
      } catch (captureError) {
        const captureElapsed = Date.now() - captureStartTime;
        console.warn(
          `⚠️ html2canvas failed after ${captureElapsed}ms:`,
          captureError
        );
      }

      if (captureCanvas) {
        console.log("📸 [html2canvas result]", {
          width: captureCanvas.width,
          height: captureCanvas.height,
        });
      }

      // ✅ SIMPLIFIED PREVIEW GENERATION
      // Just use captureCanvas directly - it already has correct z-index layering
      // We only need to carve holes for photo slots

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width =
        captureCanvas?.width ?? Math.round(canvasWidth * captureScale);
      finalCanvas.height =
        captureCanvas?.height ?? Math.round(canvasHeight * captureScale);
      const finalCtx = finalCanvas.getContext("2d", { alpha: true });

      if (finalCtx) {
        const photoElements = elements.filter((el) => el.type === "photo");
        const photoSlotInfos = [];

        photoElements.forEach((photoEl, placeholderIndex) => {
          const rawX = Number(photoEl?.x) || 0;
          const rawY = Number(photoEl?.y) || 0;
          const rawWidth = Number(photoEl?.width) || 0;
          const rawHeight = Number(photoEl?.height) || 0;
          if (rawWidth <= 0 || rawHeight <= 0) {
            return;
          }

          const candidateIndex = Number(photoEl?.data?.photoIndex);
          const photoIndex = Number.isFinite(candidateIndex)
            ? candidateIndex
            : placeholderIndex;

          photoSlotInfos.push({
            elementId: photoEl?.id ?? null,
            placeholderIndex,
            photoIndex,
            x: rawX * captureScale,
            y: rawY * captureScale,
            width: rawWidth * captureScale,
            height: rawHeight * captureScale,
            centerX: (rawX + rawWidth / 2) * captureScale,
            centerY: (rawY + rawHeight / 2) * captureScale,
            borderRadius:
              parseNumericValue(photoEl?.data?.borderRadius) * captureScale,
            rotationRadians: ((Number(photoEl?.rotation) || 0) * Math.PI) / 180,
          });
        });

        // Draw background (support solid color and gradients)
        const bgValue = canvasBackground || "#ffffff";
        if (
          bgValue.startsWith("linear-gradient") ||
          bgValue.startsWith("radial-gradient")
        ) {
          // Parse gradient and draw
          const gradientMatch = bgValue.match(
            /(linear|radial)-gradient\((.*)\)/
          );
          if (gradientMatch) {
            const [, type, params] = gradientMatch;
            const colors =
              params.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgba?\([^)]+\)/g) ||
              [];

            let gradient;
            if (type === "linear") {
              // Default diagonal gradient
              gradient = finalCtx.createLinearGradient(
                0,
                0,
                finalCanvas.width,
                finalCanvas.height
              );
            } else {
              // Radial gradient from center
              const centerX = finalCanvas.width / 2;
              const centerY = finalCanvas.height / 2;
              const radius =
                Math.max(finalCanvas.width, finalCanvas.height) / 2;
              gradient = finalCtx.createRadialGradient(
                centerX,
                centerY,
                0,
                centerX,
                centerY,
                radius
              );
            }

            // Add color stops
            if (colors.length >= 2) {
              gradient.addColorStop(0, colors[0]);
              gradient.addColorStop(1, colors[colors.length - 1]);
              if (colors.length > 2) {
                colors.slice(1, -1).forEach((color, i) => {
                  gradient.addColorStop((i + 1) / (colors.length - 1), color);
                });
              }
            }

            finalCtx.fillStyle = gradient;
          } else {
            finalCtx.fillStyle = "#ffffff";
          }
        } else {
          finalCtx.fillStyle = bgValue;
        }
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        if (captureCanvas) {
          // Draw captured elements (already in correct z-index order)
          finalCtx.drawImage(captureCanvas, 0, 0);
        }

        // ✅ IMPORTANT: Do NOT carve holes for custom frames!
        // For custom frames:
        // - Preview image is just a thumbnail, not used as overlay in Editor
        // - Photo slots are already transparent in captureCanvas
        // - Editor renders photo slots + designer elements separately
        // - Carving would destroy text/shapes that are above photo slots!

        console.log(
          "✅ [Preview] Generated without carving (preserves layering for custom frames)"
        );
      }

      let exportCanvas = finalCanvas;
      const maxPreviewWidth = 400; // ⚡ Reduced from 640 for faster saves
      if (exportCanvas.width > maxPreviewWidth) {
        const previewScale = maxPreviewWidth / exportCanvas.width;
        const scaledCanvas = document.createElement("canvas");
        scaledCanvas.width = Math.max(
          1,
          Math.round(exportCanvas.width * previewScale)
        );
        scaledCanvas.height = Math.max(
          1,
          Math.round(exportCanvas.height * previewScale)
        );
        const ctx = scaledCanvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "medium"; // ⚡ Reduced from "high"
          ctx.drawImage(
            exportCanvas,
            0,
            0,
            scaledCanvas.width,
            scaledCanvas.height
          );
          exportCanvas = scaledCanvas;
        }
      }

      console.log("🖼️ [Preview canvas after scaling]", {
        width: exportCanvas.width,
        height: exportCanvas.height,
      });

      // IMPORTANT: Use JPEG with low quality for preview to save localStorage space
      // Preview is only used as thumbnail, doesn't need high quality or transparency
      // PNG format is 5-10x larger than JPEG and can cause quota exceeded errors!
      let previewDataUrl = "";
      try {
        // ⚡ Use JPEG with 0.5 quality (reduced from 0.6) - even smaller for faster saves
        previewDataUrl = exportCanvas.toDataURL("image/jpeg", 0.5);
        const previewSizeKB = Math.round(previewDataUrl.length / 1024);
        console.log("🖼️ [Preview compressed]", {
          format: "JPEG",
          quality: 0.5,
          sizeKB: previewSizeKB,
          purpose: "thumbnail only",
        });
      } catch (err) {
        console.warn("⚠️ JPEG preview error, trying lower quality", err);
        try {
          // Try even lower quality if needed
          previewDataUrl = exportCanvas.toDataURL("image/jpeg", 0.4);
        } catch (err2) {
          console.error("❌ Failed to generate preview:", err2);
          // Use tiny 1x1 placeholder if preview fails
          const tinyCanvas = document.createElement("canvas");
          tinyCanvas.width = 1;
          tinyCanvas.height = 1;
          previewDataUrl = tinyCanvas.toDataURL("image/jpeg", 0.5);
        }
      }

      if (!previewDataUrl || !previewDataUrl.startsWith("data:image")) {
        // Emergency fallback: tiny 1x1 image
        const tinyCanvas = document.createElement("canvas");
        tinyCanvas.width = 1;
        tinyCanvas.height = 1;
        previewDataUrl = tinyCanvas.toDataURL("image/jpeg", 0.5);
        console.warn("⚠️ Using emergency 1x1 preview fallback");
      }
      const serializedElements =
        typeof structuredClone === "function"
          ? structuredClone(elements)
          : JSON.parse(JSON.stringify(elements));

      console.log(
        "🔍 [SAVE DEBUG] serializedElements z-index info:",
        serializedElements.map((el) => ({
          type: el.type,
          id: el.id?.slice(0, 8),
          zIndex: el.zIndex,
          isOverlay: el?.data?.__capturedOverlay,
        }))
      );

      const cleanElements = serializedElements.filter(
        (element) =>
          element?.type !== "transparent-area" &&
          !element?.data?.__capturedOverlay
      );

      console.log("💾 [SAVING DRAFT] Elements breakdown:", {
        total: serializedElements.length,
        cleaned: cleanElements.length,
        types: cleanElements.map((el) => ({
          type: el.type,
          zIndex: el.zIndex,
          hasImage: !!el.data?.image,
        })),
      });

      const layeredElements = cleanElements.map((element) => {
        if (!element || typeof element !== "object") {
          return element;
        }

        // ✅ Photo slots: Ensure minimum z-index (above background)
        // But preserve user's z-index if already set higher
        if (element.type === "photo") {
          if (!Number.isFinite(element.zIndex)) {
            return {
              ...element,
              zIndex: PHOTO_SLOT_MIN_Z,
            };
          }
          // If user set z-index lower than minimum, enforce minimum
          if (element.zIndex < PHOTO_SLOT_MIN_Z) {
            console.warn(
              `⚠️ Photo slot z-index ${element.zIndex} is below minimum, setting to ${PHOTO_SLOT_MIN_Z}`
            );
            return {
              ...element,
              zIndex: PHOTO_SLOT_MIN_Z,
            };
          }
          // Keep user's z-index
          return element;
        }

        // ✅ Background photo: Always at the back
        if (element.type === "background-photo") {
          const desiredBackgroundZ = Number.isFinite(BACKGROUND_PHOTO_Z)
            ? BACKGROUND_PHOTO_Z
            : Number.isFinite(element.zIndex)
            ? element.zIndex
            : BACKGROUND_PHOTO_Z;

          if (element.zIndex === desiredBackgroundZ) {
            return element;
          }

          return {
            ...element,
            zIndex: desiredBackgroundZ,
          };
        }

        return element;
      });

      // ✅ DO NOT re-assign z-index for foreground elements!
      // The z-index from Create page should be preserved as-is.
      // Users have already arranged the layering in the canvas.

      console.log(
        "🔍 [SAVE DEBUG] Final layeredElements z-index info:",
        layeredElements.map((el) => ({
          type: el.type,
          id: el.id?.slice(0, 8),
          zIndex: el.zIndex,
        }))
      );

      // Compress upload and background-photo element images before saving
      console.log(
        "🗜️ [Compression] Starting image compression for elements:",
        layeredElements.length
      );
      const compressionStartTime = Date.now();

      const compressedElements = await Promise.all(
        layeredElements.map(async (element) => {
          const imageSource = element?.data?.image;
          const shouldCompress =
            typeof imageSource === "string" &&
            (element.type === "background-photo" || element.type === "upload");

          if (!shouldCompress) {
            return element;
          }

          try {
            const timeoutMs = element.type === "background-photo" ? 8000 : 6000;
            const img = await loadImageAsync(imageSource, { timeoutMs });

            if (
              !img ||
              !Number.isFinite(img.width) ||
              !Number.isFinite(img.height)
            ) {
              throw new Error("Invalid image dimensions");
            }

            // ✅ HIGH QUALITY: Keep frames at full resolution for good quality
            // Frame artwork needs to stay crisp when displayed at 1080x1920
            const maxWidth = element.type === "background-photo" ? 1080 : 1080; // Full canvas width
            const quality = element.type === "background-photo" ? 0.85 : 0.9; // Higher quality
            let targetWidth = img.width;
            let targetHeight = img.height;

            if (targetWidth > maxWidth) {
              const scale = maxWidth / targetWidth;
              targetWidth = maxWidth;
              targetHeight = Math.max(1, Math.round(targetHeight * scale));
            }

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(targetWidth));
            canvas.height = Math.max(1, Math.round(targetHeight));
            const ctx = canvas.getContext("2d", { alpha: true }); // Enable alpha channel
            if (!ctx) {
              throw new Error("Failed to acquire 2D context");
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // ✅ CRITICAL FIX: Preserve alpha for PNG/WEBP uploads.
            // When frames/overlays come from /uploads/*.png or /uploads/*.webp, converting to JPEG
            // destroys transparency and makes transparent areas appear BLACK.
            const sourceLower = String(imageSource || "").toLowerCase();
            const urlNoQuery = sourceLower.split("?")[0].split("#")[0];
            const isDataPng = urlNoQuery.startsWith("data:image/png");
            const isDataWebp = urlNoQuery.startsWith("data:image/webp");
            const isUrlPng = urlNoQuery.endsWith(".png");
            const isUrlWebp = urlNoQuery.endsWith(".webp");

            // Overlays are commonly transparent; treat upload elements as alpha-capable by default.
            const hasTransparency =
              element.type === "upload" || isDataPng || isDataWebp || isUrlPng || isUrlWebp;

            let compressedImage;
            if (hasTransparency) {
              // Prefer WebP for WebP sources (smaller) while keeping alpha; otherwise use PNG.
              const outFormat = isDataWebp || isUrlWebp ? "image/webp" : "image/png";
              compressedImage =
                outFormat === "image/webp"
                  ? canvas.toDataURL("image/webp", quality)
                  : canvas.toDataURL("image/png");

              console.log("🗜️ Keeping alpha-capable format:", {
                type: element.type,
                format: outFormat === "image/webp" ? "WEBP" : "PNG",
                original: imageSource.length,
                compressed: compressedImage.length,
              });
            } else {
              // Use JPEG for better compression (no transparency)
              compressedImage = canvas.toDataURL("image/jpeg", quality);
              console.log("🗜️ Compressed image:", {
                type: element.type,
                format: "JPEG",
                original: imageSource.length,
                compressed: compressedImage.length,
                saved: imageSource.length - compressedImage.length,
                reductionPercent:
                  Math.round(
                    ((imageSource.length - compressedImage.length) /
                      imageSource.length) *
                      100
                  ) + "%",
              });
            }

            return {
              ...element,
              data: {
                ...element.data,
                image: compressedImage,
                originalImage: undefined,
              },
            };
          } catch (error) {
            console.warn(
              `⚠️ Failed to compress ${element.type} image, using original:`,
              error
            );
            return element;
          }
        })
      );

      const compressionElapsed = Date.now() - compressionStartTime;
      console.log(`🗜️ [Compression] Completed in ${compressionElapsed}ms`);

      const signature = computeDraftSignature(
        compressedElements,
        canvasBackground,
        canvasAspectRatio
      );

      console.log("💾 [SAVING DRAFT] Final data being saved:", {
        canvasWidth,
        canvasHeight,
        aspectRatio: canvasAspectRatio,
        "Calculated ratio": canvasWidth / canvasHeight,
        "Expected 9:16": 9 / 16,
        "Match?": Math.abs(canvasWidth / canvasHeight - 9 / 16) < 0.001,
      });

      // Save captured photos with the draft
      const rawCapturedPhotos = safeStorage.getJSON("capturedPhotos");
      const capturedPhotosCount = Array.isArray(rawCapturedPhotos)
        ? rawCapturedPhotos.length
        : 0;

      if (capturedPhotosCount > 0) {
        console.log(
          "� [SAVING DRAFT] Detected captured photos in storage but skipping persist to keep drafts lean:",
          {
            capturedPhotosCount,
          }
        );
      }

      // ✅ FIX: Don't save frameArtwork separately!
      // Frame artwork is already included in compressedElements array
      // Saving it separately causes duplication when loading
      //
      // REMOVED CODE:
      // - Find frameArtworkElement with __isFrameArtwork flag
      // - Extract frame artwork data
      // - Add frameArtwork property to draftDataToSave
      //
      // WHY: Elements array already contains all design elements including frame artwork
      // No need to duplicate it in a separate property

      // Calculate total size before saving
      const draftDataToSave = {
        id: activeDraftId || undefined,
        title: draftTitle || undefined, // Include title
        description: draftDescription || undefined,
        canvasBackground,
        canvasWidth,
        canvasHeight,
        aspectRatio: canvasAspectRatio,
        elements: compressedElements,
        preview: previewDataUrl,
        thumbnail: thumbnailDataUrl || undefined,
        signature,
        capturedPhotos: undefined,
        // frameArtwork removed - already in elements array
      };

      const draftString = JSON.stringify(draftDataToSave);
      const draftSizeKB = Math.round(draftString.length / 1024);
      const draftSizeMB = (draftString.length / 1024 / 1024).toFixed(2);

      console.log("📏 [SAVE SIZE] Draft size before save:", {
        bytes: draftString.length,
        kilobytes: draftSizeKB + " KB",
        megabytes: draftSizeMB + " MB",
        elementsCount: compressedElements.length,
        backgroundPhotoCount: compressedElements.filter(
          (el) => el.type === "background-photo"
        ).length,
        uploadCount: compressedElements.filter((el) => el.type === "upload")
          .length,
      });

      // Check storage usage (IndexedDB provides much larger capacity)
      try {
        const { default: indexedDBStorage } = await import(
          "../utils/indexedDBStorage.js"
        );
        const storageEstimate = await indexedDBStorage.getStorageEstimate();
        console.log("💾 [STORAGE] IndexedDB usage:", {
          usageMB: (storageEstimate.usage / 1024 / 1024).toFixed(2) + " MB",
          quotaMB: (storageEstimate.quota / 1024 / 1024).toFixed(2) + " MB",
          percentage: storageEstimate.percentage + "%",
          newDraftSizeMB: draftSizeMB + " MB",
        });
      } catch (e) {
        console.warn("⚠️ Could not check storage usage:", e);
      }

      console.log("💾 [DRAFT SAVE] Starting save operation...");
      const saveStartTime = Date.now();

      const savePromise = draftStorage.saveDraft(draftDataToSave);
      const primaryTimeoutMs = computeDraftSaveTimeoutMs(draftString.length);
      const logTimeoutSeconds = Math.round(primaryTimeoutMs / 1000);

      console.log("⏱️ [DRAFT SAVE] Timeout budget:", {
        bytes: draftString.length,
        approxMB: draftSizeMB,
        primaryTimeoutMs,
        primaryTimeoutSeconds: logTimeoutSeconds,
      });

      const awaitDraftSave = async (promise, timeoutMs, attemptLabel) => {
        const seconds = Math.round(timeoutMs / 1000);
        return withTimeout(promise, {
          timeoutMs,
          timeoutMessage: `Menyimpan draft melebihi batas waktu (${attemptLabel}, ${seconds}s)`,
          onTimeout: () =>
            console.warn(
              `⚠️ Draft save timed out (${attemptLabel}, ${seconds}s)`
            ),
        });
      };

      let savedDraft;
      try {
        savedDraft = await awaitDraftSave(
          savePromise,
          primaryTimeoutMs,
          "utama"
        );
        const saveElapsed = Date.now() - saveStartTime;
        console.log(`💾 [DRAFT SAVE] Save completed in ${saveElapsed}ms`);
      } catch (primaryError) {
        if (primaryError?.name === "TimeoutError") {
          const extendedTimeoutMs = Math.min(primaryTimeoutMs + 20000, 60000);
          const extendedSeconds = Math.round(extendedTimeoutMs / 1000);
          console.warn(
            "⏱️ [DRAFT SAVE] Primary timeout elapsed, retrying with extended budget",
            {
              primaryTimeoutMs,
              extendedTimeoutMs,
              extendedSeconds,
            }
          );

          savedDraft = await awaitDraftSave(
            savePromise,
            extendedTimeoutMs,
            "lanjutan"
          );
          const saveElapsed = Date.now() - saveStartTime;
          console.log(
            `💾 [DRAFT SAVE] Save completed (extended) in ${saveElapsed}ms`
          );
        } else {
          throw primaryError;
        }
      }

      console.log("✅ [DRAFT SAVED] Success! Draft ID:", savedDraft.id);
      console.log(
        "✅ [DRAFT SAVED] Elements with preserved z-index:",
        compressedElements.map((el) => ({
          type: el.type,
          id: el.id?.slice(0, 8),
          zIndex: el.zIndex,
        }))
      );

      // IMPORTANT: Verify the draft is actually saved with correct z-index
      console.log("🔍 [VERIFICATION] Reading draft from storage...");
      const verifyDraft = await draftStorage.getDraftById(savedDraft.id);
      if (verifyDraft) {
        console.log("✅ [VERIFICATION] Draft loaded from storage:", {
          id: verifyDraft.id,
          elementsCount: verifyDraft.elements?.length,
          elementsZIndex: verifyDraft.elements?.map((el) => ({
            type: el.type,
            id: el.id?.slice(0, 8),
            zIndex: el.zIndex,
          })),
        });
      } else {
        console.error("❌ [VERIFICATION] Failed to load draft from storage!");
      }

      setActiveDraftId(savedDraft.id);
      // Persist activeDraftId to storage so cross-navigation saves UPDATE the same cloud draft
      userStorage.setItem("activeDraftId", savedDraft.id);
      setJustSavedDraft(true); // Show "Gunakan Frame Ini" button

      // ☁️ CLOUD SAVE: ALWAYS save to cloud for sharing capability
      // Works for both logged-in users (authenticated endpoint) and 
      // non-logged-in users (falls back to public-share endpoint)
      try {
        console.log("☁️ [CLOUD SAVE] Starting cloud save...", user ? `for user: ${user.uid}` : "(anonymous)");
        const cloudPreviewUrl = thumbnailDataUrl || previewDataUrl;
        
        // CRITICAL: frameData must be stringified for backend storage
        // Backend expects a JSON string in frame_data column
        const frameDataString = JSON.stringify(draftDataToSave);
        
        const cloudResult = await draftService.saveDraftToCloud({
          title: draftTitle || savedDraft.title || "Untitled Frame",
          frameData: frameDataString,
          // Use the thumbnail snapshot for cloud listings because it keeps
          // photo slots visible; the preview capture intentionally makes them transparent.
          previewUrl: cloudPreviewUrl,
          draftId: savedDraft.cloudId // Use existing cloud ID if re-saving
        });
        
        // Store cloud ID and shareId for future updates and sharing
        if (cloudResult?.draft) {
          const cloudDraft = cloudResult.draft;
          savedDraft.cloudId = cloudDraft.id;
          savedDraft.shareId = cloudDraft.share_id;
          
          // CRITICAL: Update local draft with cloud ID
          // Must preserve ALL existing fields including userId
          await draftStorage.saveDraft({
            ...savedDraft, // Include all existing fields (userId, createdAt, etc.)
            cloudId: cloudDraft.id,
            shareId: cloudDraft.share_id
          });
          console.log("☁️ [CLOUD SAVE] Success! Cloud ID:", cloudDraft.id, "Share ID:", cloudDraft.share_id);
          console.log("🔗 [SHARE URL]:", `${window.location.origin}/s/${cloudDraft.share_id}`);
        }
      } catch (cloudError) {
        console.warn("☁️ [CLOUD SAVE] Failed (frame still saved locally):", cloudError);
        // Don't show error - local save succeeded
      }

      const successTitle = savedDraft.title || "Draft";
      showToast(
        "success",
        `${successTitle} tersimpan! Lihat di Profile → Drafts.`
      );

      // Important: return ID so callers (e.g. "Gunakan Frame") can reliably
      // proceed without depending on React state timing.
      return savedDraft.id;
    } catch (error) {
      console.error("Failed to save draft", error);
      const isTimeoutError = error?.name === "TimeoutError";
      const message = isTimeoutError
        ? "Proses menyimpan terlalu lama. Coba kurangi ukuran gambar atau ulangi beberapa saat lagi."
        : error?.message && /quota|persist/i.test(error.message)
        ? "Penyimpanan penuh. Hapus draft lama terlebih dahulu."
        : TOAST_MESSAGES.saveError;
      showToast("error", message);
      return null;
    } finally {
      try {
        cleanupCapture?.();
      } catch (err) {
        console.warn("⚠️ Failed to clean up capture node", err);
      }
      setSaving(false);
    }
  };

  const addToolElement = (type) => {
    if (type === "background") {
      if (isBackgroundLocked) {
        showToast("info", "Background dikunci. Unlock untuk mengedit.", 2000);
        return;
      }
      selectElement("background");
      return;
    }
    if (type === "upload") {
      triggerUpload();
      return;
    }
    const newElementId = addElement(type);
    if (newElementId) {
      selectElement(newElementId);
    }
  };

  const toggleBackgroundLock = useCallback(() => {
    setIsBackgroundLocked((prev) => !prev);
    showToast(
      "success",
      isBackgroundLocked ? "Background unlocked" : "Background locked",
      1500
    );
  }, [isBackgroundLocked, showToast]);

  const resetBackground = useCallback(() => {
    // Reset to default white color
    setCanvasBackground("#ffffff");
    // Also remove any background-photo element if exists
    const bgPhotoElement = elements.find(el => el.type === "background-photo");
    if (bgPhotoElement) {
      removeElement(bgPhotoElement.id);
    }
    showToast("success", "Background direset ke default", 1500);
  }, [elements, removeElement, setCanvasBackground, showToast]);

  // Activate frame without saving (uses current editor state directly)
  const activateFrameWithoutSave = async () => {
    try {
      const { activateDraftFrame } = await import("../utils/draftHelpers.js");
      // Always use a fresh temp ID so this operation never links back to an existing
      // saved draft. Using activeDraftId here would cause activateDraftFrame to write
      // the real draft's ID back into userStorage, making the old draft appear as
      // "still saved" when the user returns to the Create page or Drafts list.
      const tempDraft = {
        id: `temp-${Date.now()}`,
        title: draftTitle || "Frame",
        elements,
        aspectRatio: canvasAspectRatio,
        canvasBackground,
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
      };
      const frameConfig = activateDraftFrame(tempDraft);
      if (!frameConfig) throw new Error("Gagal membuat konfigurasi frame.");
      // Ensure the real saved draft (if any) is not restored when user returns to Create.
      // activateDraftFrame already wrote the temp ID to userStorage; clear it so the
      // Create page starts fresh instead of auto-loading the old draft.
      userStorage.removeItem("activeDraftId");
      userStorage.removeItem("activeDraftSignature");
      try { sessionStorage.removeItem("__fremio_shared_frame_temp__"); } catch (_) {}
      frameProvider.clearMemory();
      navigate("/take-moment");
    } catch (error) {
      showToast("error", `Gagal menggunakan frame: ${error.message}`);
    }
  };

  const handleUseThisFrame = async () => {
    if (elements.length === 0) {
      showToast("error", "Tidak ada frame untuk digunakan.");
      return;
    }

    try {
      // Guest path: always use without saving
      if (!user) {
        await activateFrameWithoutSave();
        return;
      }

      // Logged-in path: if draft not yet saved, ask user first
      if (!justSavedDraft) {
        setShowUseFrameConfirm(true);
        return;
      }

      // Draft already saved — use directly from storage
      const resolvedDraftId = activeDraftId || userStorage.getItem("activeDraftId");
      if (!resolvedDraftId) {
        // Draft saved but no ID — fall back to direct activation
        await activateFrameWithoutSave();
        return;
      }

      userStorage.setItem("activeDraftId", resolvedDraftId);
      setActiveDraftId(resolvedDraftId);

      let draft = await draftStorage.getDraftById(resolvedDraftId, user?.email);
      if (!draft) {
        await activateFrameWithoutSave();
        return;
      }

      const { activateDraftFrame } = await import("../utils/draftHelpers.js");
      const frameConfig = activateDraftFrame(draft);
      if (!frameConfig) throw new Error("Gagal membuat konfigurasi frame dari draft");

      try { sessionStorage.removeItem("__fremio_shared_frame_temp__"); } catch (_) {}
      frameProvider.clearMemory();
      navigate("/take-moment");
    } catch (error) {
      console.error("❌ Failed to activate frame:", error);
      showToast("error", `Gagal menggunakan frame: ${error.message}`);
    }
  };

  // Called when user confirms "Ya, simpan" in confirm dialog
  const handleUseFrameWithSave = async () => {
    setShowUseFrameConfirm(false);
    try {
      showToast("info", "Menyimpan frame...");
      const savedDraftId = await handleSaveTemplate();
      const resolvedDraftId = savedDraftId || activeDraftId || userStorage.getItem("activeDraftId");
      if (!resolvedDraftId) {
        throw new Error("Draft ID tidak tersedia setelah save. Coba lagi.");
      }
      userStorage.setItem("activeDraftId", resolvedDraftId);
      setActiveDraftId(resolvedDraftId);
      let draft = await draftStorage.getDraftById(resolvedDraftId, user?.email);
      if (!draft) throw new Error("Draft tidak ditemukan setelah save.");
      const { activateDraftFrame } = await import("../utils/draftHelpers.js");
      const frameConfig = activateDraftFrame(draft);
      if (!frameConfig) throw new Error("Gagal membuat konfigurasi frame.");
      try { sessionStorage.removeItem("__fremio_shared_frame_temp__"); } catch (_) {}
      frameProvider.clearMemory();
      navigate("/take-moment");
    } catch (error) {
      showToast("error", `Gagal menggunakan frame: ${error.message}`);
    }
  };

  useEffect(() => {
    const handleBackgroundUploadRequest = () => {
      triggerBackgroundUpload();
    };

    window.addEventListener(
      "creator:request-background-upload",
      handleBackgroundUploadRequest
    );

    const handlePaste = (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const target = event.target;
      if (
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }

      const items = clipboardData.items ? Array.from(clipboardData.items) : [];
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      event.preventDefault();

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          addUploadElement(result);
          showToast("success", TOAST_MESSAGES.pasteSuccess);
        } else {
          showToast("error", TOAST_MESSAGES.pasteError);
        }
      };
      reader.onerror = () => {
        showToast("error", TOAST_MESSAGES.pasteError);
      };
      reader.readAsDataURL(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener(
        "creator:request-background-upload",
        handleBackgroundUploadRequest
      );
    };
  }, [addUploadElement, showToast, triggerBackgroundUpload]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;

      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const target = event.target;
      if (
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!selectedElementId || selectedElementId === "background") return;

      event.preventDefault();
      removeElement(selectedElementId);
      showToast("success", TOAST_MESSAGES.deleteSuccess, 2200);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElementId, removeElement, showToast]);

  const toolButtons = useMemo(() => {
    const buttons = [
      {
        id: "canvas-size",
        label: "Ukuran Canvas",
        mobileLabel: "Ukuran",
        icon: Maximize2,
        onClick: () => {
          clearSelection();
          if (isMobileView) {
            setActiveMobileProperty((prev) =>
              prev === "canvas-size" ? null : "canvas-size"
            );
          } else {
            setShowCanvasSizeInProperties((prev) => !prev);
          }
        },
        isActive:
          showCanvasSizeInProperties || activeMobileProperty === "canvas-size",
      },
      {
        id: "import-frame",
        label: "Import Frame",
        mobileLabel: "Import Frame",
        icon: Download,
        onClick: () => {
          if (importFrameWorking) return;
          setShowCanvasSizeInProperties(false);
          if (importFrameInputRef.current) {
            importFrameInputRef.current.value = "";
            importFrameInputRef.current.click();
          }
        },
        isActive: importFrameWorking,
      },
      {
        id: "background",
        label: "Background",
        mobileLabel: "Background",
        icon: Palette,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          selectElement("background");
          // Both desktop and mobile: just select background
          // Upload is done from properties panel via "Tambah Foto" button
        },
        isActive:
          selectedElementId === "background" ||
          selectedElement?.type === "background-photo",
      },
      {
        id: "photo",
        label: "Area Foto",
        mobileLabel: "Foto",
        icon: ImageIcon,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          // Don't add element immediately - show properties panel first
          clearSelection();
          setPendingPhotoTool(true);
        },
        isActive: pendingPhotoTool || selectedElement?.type === "photo",
      },
      {
        id: "pexels",
        label: "Cari Foto",
        mobileLabel: "Cari Foto",
        icon: Search,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          setPendingPhotoTool(false);
          setPendingPexelsTool(true);
          clearSelection();
        },
        isActive: pendingPexelsTool,
      },
      {
        id: "text",
        label: "Add Text",
        mobileLabel: "Teks",
        icon: TypeIcon,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          addToolElement("text");
        },
        isActive: selectedElement?.type === "text",
      },
      {
        id: "shape",
        label: "Shape",
        mobileLabel: "Bentuk",
        icon: Shapes,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          addToolElement("shape");
        },
        isActive: selectedElement?.type === "shape",
      },
      {
        id: "upload",
        label: "Unggahan",
        mobileLabel: "Unggah",
        icon: UploadCloud,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          addToolElement("upload");
        },
        isActive: selectedElement?.type === "upload",
      },
    ];

    return buttons;
  }, [
    addToolElement,
    importFrameWorking,
    selectElement,
    selectedElement?.type,
    selectedElementId,
    backgroundPhotoElement,
    triggerBackgroundUpload,
    isMobileView,
    pendingPhotoTool,
    pendingPexelsTool,
    clearSelection,
    showCanvasSizeInProperties,
    activeMobileProperty,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const handleChange = (event) => {
      setIsMobileView(event.matches);
    };

    setIsMobileView(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!isMobileView) {
      setActiveMobileProperty(null);
    }
  }, [isMobileView]);

  const handleToolButtonPress = (button) => {
    setActiveMobileProperty(null);
    button.onClick();
  };

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const node = previewFrameRef.current;
    if (!node) {
      return undefined;
    }

    const computeConstraints = () => {
      const { clientWidth, clientHeight } = node;
      const usableWidth = Math.max(0, Math.floor(clientWidth - 40));
      const usableHeight = Math.max(0, Math.floor(clientHeight - 40));

      if (usableWidth > 0 && usableHeight > 0) {
        setPreviewConstraints({
          maxWidth: usableWidth,
          maxHeight: usableHeight,
        });
      }
    };

    // Use requestAnimationFrame to ensure DOM is fully laid out
    requestAnimationFrame(() => {
      computeConstraints();
    });

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => computeConstraints());
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", computeConstraints);
    return () => window.removeEventListener("resize", computeConstraints);
  }, [isMobileView]);

  const handleElementDimensionChange = useCallback(
    (dimension, rawValue) => {
      if (!selectedElementObject) {
        return;
      }
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const minValue = 40;
      const nextValue = Math.round(Math.max(minValue, numericValue));
      updateElement(selectedElementObject.id, { [dimension]: nextValue });
    },
    [selectedElementObject, updateElement]
  );

  const getMobilePropertyTitle = (propertyId) => {
    switch (propertyId) {
      case "text-edit":
        return "Edit Teks";
      case "text-font":
        return "Pilih Font";
      case "text-color":
        return "Warna Teks";
      case "text-size":
        return "Ukuran Teks";
      case "text-align":
        return "Perataan";
      case "shape-color":
        return "Warna Bentuk";
      case "shape-size":
        return "Ukuran Bentuk";
      case "shape-radius":
        return "Sudut Bentuk";
      case "photo-color":
        return "Warna";
      case "photo-fit":
        return "Gaya Foto";
      case "photo-size":
        return "Ukuran";
      case "photo-radius":
        return "Sudut";
      case "photo-manage":
        return "Kelola Area Foto";
      case "shape-outline":
        return "Outline Bentuk";
      case "photo-outline":
        return "Outline Foto";
      case "upload-outline":
        return "Outline Unggahan";
      case "upload-manage":
        return "Kelola Unggahan";
      case "layer-order":
        return "Atur Lapisan";
      case "background-color":
        return "Warna Latar";
      case "background-photo":
        return backgroundPhotoElement ? "Foto Latar" : "Tambah Foto";
      case "bg-photo-fit":
        return "Mode Foto";
      case "bg-photo-size":
        return "Ukuran Foto";
      case "bg-photo-manage":
        return "Kelola Foto";
      default:
        return "Properti";
    }
  };

  const renderMobilePropertyPanel = () => {
    if (!activeMobileProperty) {
      return null;
    }
    if (!isMobilePropertyToolbar && activeMobileProperty !== "canvas-size") {
      return null;
    }

    let content = null;
    let title = getMobilePropertyTitle(activeMobileProperty);

    if (activeMobileProperty === "canvas-size") {
      content = (
        <div className="create-mobile-property-panel__actions">
          {[
            { value: "9:16", label: "Story Instagram", desc: "1080 × 1920"   },
            { value: "2:3",  label: "4R",              desc: "1200 × 1800"   },
            { value: "1:3",  label: "2R",              desc: "600 × 1800"    },
            { value: "A4",   label: "A3/A4/A5",        desc: "1240 × 1754 px" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setCanvasAspectRatio(opt.value);
                setActiveMobileProperty(null);
              }}
              className={`create-mobile-property-panel__action${
                (opt.value === "A4" ? ["A3","A4","A5"].includes(canvasAspectRatio) : canvasAspectRatio === opt.value)
                  ? " create-mobile-property-panel__action--active"
                  : ""
              }`}
            >
              {opt.label} — {opt.desc}
            </button>
          ))}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
            <input type="number" min="100" max="9999" placeholder="Lebar"
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e0b7a9', fontSize: '13px', color: '#4a302b' }}
              id="mobile-custom-w"
            />
            <span style={{ color: '#c89585', fontWeight: 700 }}>×</span>
            <input type="number" min="100" max="9999" placeholder="Tinggi"
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e0b7a9', fontSize: '13px', color: '#4a302b' }}
              id="mobile-custom-h"
            />
            <button type="button"
              style={{ padding: '8px 12px', borderRadius: '8px', background: '#d4a99a', color: '#fff', fontWeight: 700, border: 'none', fontSize: '13px', cursor: 'pointer' }}
              onClick={() => {
                const w = parseInt(document.getElementById('mobile-custom-w')?.value, 10);
                const h = parseInt(document.getElementById('mobile-custom-h')?.value, 10);
                if (w >= 100 && h >= 100) { setCanvasAspectRatio(`${w}:${h}`); setActiveMobileProperty(null); }
              }}
            >Custom</button>
          </div>
        </div>
      );
    } else if (isBackgroundSelected) {
      if (activeMobileProperty === "background-color") {
        const isGradient =
          canvasBackground?.startsWith("linear-gradient") ||
          canvasBackground?.startsWith("radial-gradient");
        const solidColor = isGradient
          ? "#ffffff"
          : canvasBackground || "#ffffff";

        content = (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <button
                type="button"
                onClick={() => setCanvasBackground(solidColor)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: !isGradient
                    ? "2px solid #8B5CF6"
                    : "1px solid #e2e8f0",
                  background: !isGradient ? "#F3E8FF" : "#fff",
                  color: !isGradient ? "#8B5CF6" : "#64748b",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Solid
              </button>
              <button
                type="button"
                onClick={() =>
                  setCanvasBackground(
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  )
                }
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: isGradient
                    ? "2px solid #8B5CF6"
                    : "1px solid #e2e8f0",
                  background: isGradient ? "#F3E8FF" : "#fff",
                  color: isGradient ? "#8B5CF6" : "#64748b",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Gradient
              </button>
            </div>

            {isGradient ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Preview gradient */}
                <div
                  style={{
                    height: "80px",
                    borderRadius: "12px",
                    background: `linear-gradient(135deg, ${gradientColor1} 0%, ${gradientColor2} 100%)`,
                    border: "2px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />

                {/* Color Point 1 */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#64748b",
                    }}
                  >
                    Warna Titik 1:
                  </div>
                  <ColorPicker
                    value={gradientColor1}
                    onChange={(newColor) => {
                      setGradientColor1(newColor);
                      setCanvasBackground(
                        `linear-gradient(135deg, ${newColor} 0%, ${gradientColor2} 100%)`
                      );
                    }}
                  />
                </div>

                {/* Color Point 2 */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#64748b",
                    }}
                  >
                    Warna Titik 2:
                  </div>
                  <ColorPicker
                    value={gradientColor2}
                    onChange={(newColor) => {
                      setGradientColor2(newColor);
                      setCanvasBackground(
                        `linear-gradient(135deg, ${gradientColor1} 0%, ${newColor} 100%)`
                      );
                    }}
                  />
                </div>

                {/* Quick presets */}
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#475569",
                    marginTop: "4px",
                  }}
                >
                  Quick Presets:
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "6px",
                  }}
                >
                  {[
                    { name: "Purple", c1: "#667eea", c2: "#764ba2" },
                    { name: "Ocean", c1: "#667eea", c2: "#0093E9" },
                    { name: "Sunset", c1: "#f093fb", c2: "#f5576c" },
                    { name: "Forest", c1: "#11998e", c2: "#38ef7d" },
                    { name: "Pink", c1: "#FA8BFF", c2: "#2BD2FF" },
                    { name: "Gold", c1: "#FFB75E", c2: "#ED8F03" },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setGradientColor1(preset.c1);
                        setGradientColor2(preset.c2);
                        setCanvasBackground(
                          `linear-gradient(135deg, ${preset.c1} 0%, ${preset.c2} 100%)`
                        );
                      }}
                      style={{
                        padding: "20px 6px",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        background: `linear-gradient(135deg, ${preset.c1} 0%, ${preset.c2} 100%)`,
                        cursor: "pointer",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          bottom: "3px",
                          left: "50%",
                          transform: "translateX(-50%)",
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#fff",
                          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ColorPicker
                value={solidColor}
                onChange={(nextColor) => setCanvasBackground(nextColor)}
              />
            )}
          </div>
        );
      } else if (activeMobileProperty === "background-photo") {
        content = (
          <div className="create-mobile-property-panel__actions">
            <button
              type="button"
              onClick={() => {
                triggerBackgroundUpload();
                setActiveMobileProperty(null);
              }}
              className="create-mobile-property-panel__action"
            >
              {backgroundPhotoElement
                ? "Ganti foto background"
                : "Tambah foto background"}
            </button>
            {backgroundPhotoElement && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const { width: canvasWidth, height: canvasHeight } =
                      getCanvasDimensions(canvasAspectRatio);
                    fitBackgroundPhotoToCanvas({ canvasWidth, canvasHeight });
                    setActiveMobileProperty(null);
                  }}
                  className="create-mobile-property-panel__action"
                >
                  Sesuaikan ke kanvas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeElement(backgroundPhotoElement.id);
                    clearSelection();
                    setActiveMobileProperty(null);
                  }}
                  className="create-mobile-property-panel__action create-mobile-property-panel__action--danger"
                >
                  Hapus foto background
                </button>
              </>
            )}
          </div>
        );
      }
    } else if (selectedElementObject) {
      const data = selectedElementObject.data ?? {};
      switch (activeMobileProperty) {
        case "text-edit":
          content = (
            <textarea
              className="create-mobile-property-panel__textarea"
              rows={4}
              value={data.text ?? ""}
              onChange={(event) =>
                updateElement(selectedElementObject.id, {
                  data: { text: event.target.value },
                })
              }
            />
          );
          break;
        case "text-font": {
          content = (
            <div className="create-mobile-property-panel__actions">
              {EDITOR_FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => {
                    updateElement(selectedElementObject.id, {
                      data: { fontFamily: font },
                    });
                  }}
                  className={`create-mobile-property-panel__action ${
                    (data.fontFamily ?? "Inter") === font
                      ? "create-mobile-property-panel__action--active"
                      : ""
                  }`.trim()}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </div>
          );
          break;
        }
        case "text-color":
          content = (
            <ColorPicker
              value={data.color ?? "#1F2933"}
              onChange={(nextColor) =>
                updateElement(selectedElementObject.id, {
                  data: { color: nextColor },
                })
              }
            />
          );
          break;
        case "text-size": {
          const fontSize = data.fontSize ?? 24;
          content = (
            <div className="create-mobile-property-panel__slider">
              <input
                type="range"
                min={12}
                max={72}
                value={fontSize}
                onChange={(event) =>
                  updateElement(selectedElementObject.id, {
                    data: { fontSize: Number(event.target.value) },
                  })
                }
              />
              <div className="create-mobile-property-panel__value-label">
                {fontSize}
                px
              </div>
            </div>
          );
          break;
        }
        case "text-align": {
          const alignOptions = [
            { id: "left", Icon: AlignLeft },
            { id: "center", Icon: AlignCenter },
            { id: "right", Icon: AlignRight },
          ];
          content = (
            <div className="create-mobile-property-panel__button-group">
              {alignOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    updateElement(selectedElementObject.id, {
                      data: { align: option.id },
                    })
                  }
                  className={`create-mobile-property-panel__button ${
                    (data.align ?? "center") === option.id
                      ? "create-mobile-property-panel__button--active"
                      : ""
                  }`.trim()}
                >
                  <option.Icon size={18} strokeWidth={2.5} />
                </button>
              ))}
            </div>
          );
          break;
        }
        case "shape-color":
        case "photo-color":
          content = (
            <ColorPicker
              value={data.fill ?? "#F4D3C2"}
              onChange={(nextColor) =>
                updateElement(selectedElementObject.id, {
                  data: { fill: nextColor },
                })
              }
            />
          );
          break;
        case "shape-size":
        case "photo-size":
          content = (
            <div className="create-mobile-property-panel__form-grid">
              <label className="create-mobile-property-panel__input">
                <span>Lebar</span>
                <input
                  type="number"
                  min={40}
                  value={Math.round(selectedElementObject.width ?? 0)}
                  onChange={(event) =>
                    handleElementDimensionChange("width", event.target.value)
                  }
                />
              </label>
              <label className="create-mobile-property-panel__input">
                <span>Tinggi</span>
                <input
                  type="number"
                  min={40}
                  value={Math.round(selectedElementObject.height ?? 0)}
                  onChange={(event) =>
                    handleElementDimensionChange("height", event.target.value)
                  }
                />
              </label>
            </div>
          );
          break;
        case "shape-radius":
        case "photo-radius": {
          const radiusValue = data.borderRadius ?? 24;
          content = (
            <div className="create-mobile-property-panel__slider">
              <input
                type="range"
                min={0}
                max={120}
                value={radiusValue}
                onChange={(event) =>
                  updateElement(selectedElementObject.id, {
                    data: { borderRadius: Number(event.target.value) },
                  })
                }
              />
              <div className="create-mobile-property-panel__value-label">
                {radiusValue}
                px
              </div>
            </div>
          );
          break;
        }
        case "shape-outline":
        case "photo-outline":
        case "upload-outline": {
          const elementType = selectedElementObject.type;
          const outlineWidth = Number(data.strokeWidth ?? 0);
          const defaultColor = elementType === "shape" ? "#d9b9ab" : "#f4f4f4";
          const outlineColor =
            typeof data.stroke === "string" && data.stroke.length > 0
              ? data.stroke
              : defaultColor;
          const maxWidth = elementType === "shape" ? 32 : 24;
          content = (
            <div className="create-mobile-property-panel__outline">
              <div className="create-mobile-property-panel__slider">
                <input
                  type="range"
                  min={0}
                  max={maxWidth}
                  value={outlineWidth}
                  onChange={(event) => {
                    const nextWidth = Number(event.target.value);
                    if (!Number.isFinite(nextWidth)) {
                      return;
                    }
                    const updates = {
                      strokeWidth: Math.max(0, nextWidth),
                    };
                    if (nextWidth > 0 && !data.stroke) {
                      updates.stroke = outlineColor;
                    }
                    updateElement(selectedElementObject.id, {
                      data: updates,
                    });
                  }}
                />
                <div className="create-mobile-property-panel__value-label">
                  {Math.round(outlineWidth)}px
                </div>
              </div>
              <div className="create-mobile-property-panel__color-picker">
                <ColorPicker
                  value={outlineColor}
                  onChange={(nextColor) =>
                    updateElement(selectedElementObject.id, {
                      data: { stroke: nextColor },
                    })
                  }
                />
              </div>
            </div>
          );
          break;
        }
        case "photo-manage":
        case "upload-manage":
          content = (
            <div className="create-mobile-property-panel__actions">
              <button
                type="button"
                onClick={() => {
                  removeElement(selectedElementObject.id);
                  clearSelection();
                  setActiveMobileProperty(null);
                  showToast("success", TOAST_MESSAGES.deleteSuccess, 2200);
                }}
                className="create-mobile-property-panel__action create-mobile-property-panel__action--danger"
              >
                {activeMobileProperty === "photo-manage"
                  ? "Hapus area foto"
                  : "Hapus unggahan"}
              </button>
            </div>
          );
          break;
        case "photo-fit":
        case "bg-photo-fit":
          content = (
            <div className="create-mobile-property-panel__select">
              <select
                value={data.objectFit ?? "cover"}
                onChange={(event) =>
                  updateElement(selectedElementObject.id, {
                    data: { objectFit: event.target.value },
                  })
                }
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
              </select>
            </div>
          );
          break;
        case "bg-photo-size":
          content = (
            <div className="create-mobile-property-panel__actions">
              <button
                type="button"
                onClick={() => {
                  const { width: canvasWidth, height: canvasHeight } =
                    getCanvasDimensions(canvasAspectRatio);
                  fitBackgroundPhotoToCanvas({ canvasWidth, canvasHeight });
                  setActiveMobileProperty(null);
                }}
                className="create-mobile-property-panel__action"
              >
                Sesuaikan ke kanvas
              </button>
            </div>
          );
          break;
        case "bg-photo-manage":
          content = (
            <div className="create-mobile-property-panel__actions">
              <button
                type="button"
                onClick={() => {
                  triggerBackgroundUpload();
                  setActiveMobileProperty(null);
                }}
                className="create-mobile-property-panel__action"
              >
                Ganti foto background
              </button>
              <button
                type="button"
                onClick={() => {
                  removeElement(selectedElementObject.id);
                  clearSelection();
                  setActiveMobileProperty(null);
                }}
                className="create-mobile-property-panel__action create-mobile-property-panel__action--danger"
              >
                Hapus foto background
              </button>
            </div>
          );
          break;
        case "layer-order":
          if (selectedElementObject?.type !== "background-photo") {
            content = (
              <div
                className="create-mobile-property-panel__actions"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    bringToFront(selectedElementObject.id);
                  }}
                  className="create-mobile-property-panel__action"
                >
                  <ChevronsUp size={18} style={{ marginRight: "8px" }} />
                  Paling Depan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    bringForward(selectedElementObject.id);
                  }}
                  className="create-mobile-property-panel__action"
                >
                  <ArrowUp size={18} style={{ marginRight: "8px" }} />
                  Kedepankan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sendToBack(selectedElementObject.id);
                  }}
                  className="create-mobile-property-panel__action"
                >
                  <ChevronsDown size={18} style={{ marginRight: "8px" }} />
                  Paling Belakang
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sendBackward(selectedElementObject.id);
                  }}
                  className="create-mobile-property-panel__action"
                >
                  <ArrowDown size={18} style={{ marginRight: "8px" }} />
                  Kebelakangkan
                </button>
              </div>
            );
          }
          break;
        default:
          break;
      }
    }

    if (!content) {
      return null;
    }

    return (
      <Motion.div
        key={activeMobileProperty}
        className="create-mobile-property-panel"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
      >
        <div className="create-mobile-property-panel__header">
          <span>{title}</span>
          <button
            type="button"
            onClick={() => setActiveMobileProperty(null)}
            className="create-mobile-property-panel__close"
            aria-label="Tutup pengaturan"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="create-mobile-property-panel__content">{content}</div>
      </Motion.div>
    );
  };

  return (
    <div className="create-page">
      {toast && (
        <Motion.div
          className="create-toast-wrapper"
          initial={{ opacity: 0, y: -12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 460, damping: 26 }}
        >
          <div
            className={`create-toast ${
              toast.type === "success"
                ? "create-toast--success"
                : "create-toast--error"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={18} strokeWidth={2.5} />
            ) : (
              <AlertTriangle size={18} strokeWidth={2.5} />
            )}
            <span>{toast.message}</span>
          </div>
        </Motion.div>
      )}

      <div className="create-grid">
        {!isMobileView && (
          <Motion.aside
            variants={panelMotion}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.05 }}
            className="create-panel create-panel--tools"
          >
            <h2 className="create-panel__title">Tools</h2>
            <div className="create-tools__list">
              {toolButtons.map((button) => {
                const IconComponent = button.icon;
                return (
                  <button
                    key={button.id}
                    type="button"
                    onClick={() => handleToolButtonPress(button)}
                    className={`create-tools__button ${
                      button.isActive ? "create-tools__button--active" : ""
                    }`.trim()}
                  >
                    <IconComponent size={20} strokeWidth={2} />
                    <span>{button.label}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Frame Name Input - di bawah Tools */}
            <div className="create-tools__name-input">
              <label className="create-tools__name-label">Nama Frame</label>
              <input
                type="text"
                className="create-tools__name-field"
                placeholder="Masukkan nama frame..."
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />

              <label className="create-tools__name-label" style={{ marginTop: 12 }}>
                Deskripsi Frame
              </label>
              <textarea
                className="create-tools__name-field create-tools__description-field"
                placeholder="Tulis deskripsi singkat..."
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={3}
              />
            </div>
          </Motion.aside>
        )}

        <Motion.section
          variants={panelMotion}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="create-preview"
        >
          <h2 className="create-preview__title">Preview</h2>

          <div className="create-preview__body">
            <div
              ref={previewFrameRef}
              className="create-preview__frame"
              data-canvas-ratio={canvasAspectRatio}
            >
              <CanvasPreview
                elements={elements}
                selectedElementId={selectedElementId}
                canvasBackground={canvasBackground}
                aspectRatio={canvasAspectRatio}
                previewConstraints={previewConstraints}
                onSelect={(id) => {
                  setActiveMobileProperty(null);
                  if (id === null) {
                    clearSelection();
                  } else if (id === "background") {
                    // Allow selecting background even if locked (to show toolbar)
                    selectElement("background");
                  } else {
                    selectElement(id);
                  }
                }}
                onUpdate={updateElement}
                onBringToFront={bringToFront}
                onRemove={(id) => {
                  removeElement(id);
                  clearSelection();
                  setActiveMobileProperty(null);
                }}
                onDuplicate={duplicateElement}
                onToggleLock={toggleLock}
                onResizeUpload={resizeUploadImage}
                isBackgroundLocked={isBackgroundLocked}
                onToggleBackgroundLock={toggleBackgroundLock}
                onResetBackground={resetBackground}
              />
            </div>
          </div>
          
          {/* Action Buttons Container */}
          <div className="create-actions">
            <Motion.button
              type="button"
              onClick={() => {
                if (!user) {
                  showToast("info", "Anda belum login, silakan login untuk menggunakan fitur ini");
                  return;
                }
                handleSaveTemplate();
              }}
              disabled={saving}
              className="create-save"
              whileTap={{ scale: 0.97 }}
              whileHover={{ y: -3 }}
            >
              {saving ? (
                <>
                  <svg
                    className="create-save__spinner"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="create-save__spinner-track"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="create-save__spinner-head"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} strokeWidth={2.5} />
                  Save
                </>
              )}
            </Motion.button>

            {/* Show "Gunakan Frame" button */}
            <Motion.button
                type="button"
                onClick={handleUseThisFrame}
                className="create-use-frame"
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -3 }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Gunakan Frame
              </Motion.button>
          </div>
        </Motion.section>

        {!isMobileView && (
          <Motion.aside
            variants={panelMotion}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.15 }}
            className={`create-panel create-panel--properties${pendingPexelsTool ? ' create-panel--properties--wide' : ''}`}
          >
            <h2 className="create-panel__title">Properties</h2>
            <div className="create-panel__body">
              <PropertiesPanel
                selectedElement={selectedElement}
                canvasBackground={canvasBackground}
                onBackgroundChange={(color) => setCanvasBackground(color)}
                onUpdateElement={updateElement}
                onDeleteElement={removeElement}
                clearSelection={clearSelection}
                onSelectBackgroundPhoto={() => {
                  if (isBackgroundLocked) {
                    showToast(
                      "info",
                      "Background dikunci. Unlock untuk mengedit.",
                      2000
                    );
                    return;
                  }
                  if (backgroundPhotoElement) {
                    selectElement(backgroundPhotoElement.id);
                  } else {
                    triggerBackgroundUpload();
                  }
                }}
                onFitBackgroundPhoto={fitBackgroundPhotoToCanvas}
                backgroundPhoto={backgroundPhotoElement}
                onBringToFront={bringToFront}
                onSendToBack={sendToBack}
                onBringForward={bringForward}
                onSendBackward={sendBackward}
                canvasAspectRatio={canvasAspectRatio}
                onCanvasAspectRatioChange={(ratio) => {
                  setCanvasAspectRatio(ratio);
                }}
                showCanvasSizeMode={showCanvasSizeInProperties}
                gradientColor1={gradientColor1}
                gradientColor2={gradientColor2}
                setGradientColor1={setGradientColor1}
                setGradientColor2={setGradientColor2}
                isBackgroundLocked={isBackgroundLocked}
                onToggleBackgroundLock={toggleBackgroundLock}
                pendingPhotoTool={pendingPhotoTool}
                pendingPexelsTool={pendingPexelsTool}
                onAddPexelsPhoto={async (photoUrl) => {
                  try {
                    const response = await fetch(photoUrl);
                    const blob = await response.blob();
                    const dataUrl = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                    const transparentDataUrl = await removeWhiteBackground(dataUrl);
                    addUploadElement(transparentDataUrl);
                    setPendingPexelsTool(false);
                  } catch {
                    showToast("error", "Gagal memuat aset. Coba lagi.");
                  }
                }}
                onCancelPexelsTool={() => setPendingPexelsTool(false)}
                onAddOpenverseBackground={async (photoUrl) => {
                  try {
                    const response = await fetch(photoUrl);
                    const blob = await response.blob();
                    const dataUrl = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                    const { width: cw, height: ch } = getCanvasDimensions(canvasAspectRatio);
                    addBackgroundPhoto(dataUrl, { canvasWidth: cw, canvasHeight: ch });
                    setTimeout(() => fitBackgroundPhotoToCanvas({ canvasWidth: cw, canvasHeight: ch }), 300);
                  } catch {
                    showToast("error", "Gagal memuat foto. Coba lagi.");
                  }
                }}
                onConfirmAddPhoto={(rows = 1, cols = 1) => {
                  setPendingPhotoTool(false);
                  
                  // Replace existing photo elements so the selected layout is the definitive one.
                  // Without this, adding a grid on top of previous photo slots doubles the count.
                  elements.filter(el => el.type === "photo").forEach(el => removeElement(el.id));

                  // Canvas dimensions from constants
                  const canvasW = 1080;
                  const canvasH = 1920;
                  
                  // Calculate grid dimensions based on rows/cols
                  // Gap between elements (in canvas units)
                  const gapX = 30;
                  const gapY = 30;
                  
                  // Margins from canvas edges
                  const marginX = 65;
                  const marginY = 140;
                  
                  // Calculate available space
                  const availableWidth = canvasW - (2 * marginX) - ((cols - 1) * gapX);
                  const availableHeight = canvasH - (2 * marginY) - ((rows - 1) * gapY);
                  
                  // Calculate individual photo area dimensions
                  const photoWidth = Math.floor(availableWidth / cols);
                  const photoHeight = Math.floor(availableHeight / rows);
                  
                  // Add photo elements in grid pattern
                  let lastAddedId = null;
                  for (let row = 0; row < rows; row++) {
                    for (let col = 0; col < cols; col++) {
                      // Calculate position with symmetry around center
                      const x = marginX + (col * (photoWidth + gapX));
                      const y = marginY + (row * (photoHeight + gapY));
                      
                      const newId = addElement("photo", {
                        x,
                        y,
                        width: photoWidth,
                        height: photoHeight,
                      });
                      
                      if (newId) {
                        lastAddedId = newId;
                      }
                    }
                  }
                  
                  // Select the last added element
                  if (lastAddedId) {
                    selectElement(lastAddedId);
                  }
                }}
                onCancelPhotoTool={() => setPendingPhotoTool(false)}
              />
            </div>
          </Motion.aside>
        )}
      </div>

      {isMobileView && (
        <>
          {renderMobilePropertyPanel()}
          {pendingPexelsTool && (
            <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
              <div
                style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
                onClick={() => setPendingPexelsTool(false)}
              />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "#fff", borderRadius: "24px 24px 0 0",
                maxHeight: "85vh", display: "flex", flexDirection: "column",
                boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 20px 10px", borderBottom: "1px solid #f0e6e0",
                  borderRadius: "24px 24px 0 0", background: "#fff", flexShrink: 0,
                }}>
                  <button
                    type="button"
                    onClick={() => setPendingPexelsTool(false)}
                    style={{
                      border: "none", background: "rgba(244,63,94,0.08)", cursor: "pointer",
                      color: "#e11d48", padding: "6px 10px", borderRadius: "10px",
                      display: "flex", alignItems: "center", gap: "4px",
                      fontSize: "13px", fontWeight: "600",
                    }}
                  >
                    <ChevronLeft size={18} strokeWidth={2.5} />
                    Kembali
                  </button>
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#1a1a2e" }}>Cari Foto</h2>
                  <button
                    type="button"
                    onClick={() => setPendingPexelsTool(false)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: "4px" }}
                  ><X size={20} /></button>
                </div>
                <div style={{ overflowY: "auto", padding: "12px 16px calc(24px + env(safe-area-inset-bottom,0px))" }}>
                  <PropertiesPanel
                    selectedElement={selectedElement}
                    canvasBackground={canvasBackground}
                    onBackgroundChange={setCanvasBackground}
                    onUpdateElement={updateElement}
                    onDeleteElement={(id) => { removeElement(id); clearSelection(); }}
                    clearSelection={clearSelection}
                    onBringToFront={bringToFront}
                    onSendToBack={sendToBack}
                    onBringForward={bringForward}
                    onSendBackward={sendBackward}
                    canvasAspectRatio={canvasAspectRatio}
                    onCanvasAspectRatioChange={setCanvasAspectRatio}
                    showCanvasSizeMode={showCanvasSizeInProperties}
                    gradientColor1={gradientColor1}
                    gradientColor2={gradientColor2}
                    setGradientColor1={setGradientColor1}
                    setGradientColor2={setGradientColor2}
                    isBackgroundLocked={isBackgroundLocked}
                    onToggleBackgroundLock={toggleBackgroundLock}
                    pendingPhotoTool={pendingPhotoTool}
                    pendingPexelsTool={pendingPexelsTool}
                    onAddPexelsPhoto={async (photoUrl) => {
                      try {
                        const response = await fetch(photoUrl);
                        const blob = await response.blob();
                        const dataUrl = await new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result);
                          reader.onerror = reject;
                          reader.readAsDataURL(blob);
                        });
                        const transparentDataUrl = await removeWhiteBackground(dataUrl);
                        addUploadElement(transparentDataUrl);
                        setPendingPexelsTool(false);
                      } catch {
                        showToast("error", "Gagal memuat aset. Coba lagi.");
                      }
                    }}
                    onCancelPexelsTool={() => setPendingPexelsTool(false)}
                    onAddOpenverseBackground={async (photoUrl) => {
                      try {
                        const response = await fetch(photoUrl);
                        const blob = await response.blob();
                        const dataUrl = await new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result);
                          reader.onerror = reject;
                          reader.readAsDataURL(blob);
                        });
                        const { width: cw, height: ch } = getCanvasDimensions(canvasAspectRatio);
                        addBackgroundPhoto(dataUrl, { canvasWidth: cw, canvasHeight: ch });
                        setTimeout(() => fitBackgroundPhotoToCanvas({ canvasWidth: cw, canvasHeight: ch }), 300);
                      } catch {
                        showToast("error", "Gagal memuat foto. Coba lagi.");
                      }
                    }}
                    onConfirmAddPhoto={(rows = 1, cols = 1) => {
                      setPendingPhotoTool(false);
                      // Replace existing photo elements so layout is definitive
                      elements.filter(el => el.type === "photo").forEach(el => removeElement(el.id));
                      const canvasW = 1080; const canvasH = 1920;
                      const gapX = 30, gapY = 30, marginX = 65, marginY = 140;
                      const photoWidth = Math.floor((canvasW - 2*marginX - (cols-1)*gapX) / cols);
                      const photoHeight = Math.floor((canvasH - 2*marginY - (rows-1)*gapY) / rows);
                      let lastId = null;
                      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                        const id = addElement("photo", { x: marginX+c*(photoWidth+gapX), y: marginY+r*(photoHeight+gapY), width: photoWidth, height: photoHeight });
                        if (id) lastId = id;
                      }
                      if (lastId) selectElement(lastId);
                    }}
                    onCancelPhotoTool={() => setPendingPhotoTool(false)}
                    onSelectBackgroundPhoto={() => {
                      if (isBackgroundLocked) { showToast("info", "Background dikunci.", 2000); return; }
                      if (backgroundPhotoElement) { selectElement(backgroundPhotoElement.id); }
                      else { triggerBackgroundUpload(); }
                    }}
                    onFitBackgroundPhoto={fitBackgroundPhotoToCanvas}
                    backgroundPhoto={backgroundPhotoElement}
                  />
                </div>
              </div>
            </div>
          )}
          {pendingPhotoTool ? (
            /* Photo Grid Selection Toolbar */
            <nav className="create-mobile-toolbar create-mobile-toolbar--grid">
              <button
                type="button"
                onClick={() => setPendingPhotoTool(false)}
                className="create-mobile-toolbar__button create-mobile-toolbar__button--back"
              >
                <X size={20} strokeWidth={2.4} />
                <span>Batal</span>
              </button>
              {[
                { id: "1x1", rows: 1, cols: 1, label: "1×1" },
                { id: "2x1", rows: 2, cols: 1, label: "2×1" },
                { id: "1x2", rows: 1, cols: 2, label: "1×2" },
                { id: "2x2", rows: 2, cols: 2, label: "2×2" },
                { id: "3x2", rows: 3, cols: 2, label: "3×2" },
              ].map((grid) => (
                <button
                  key={grid.id}
                  type="button"
                  onClick={() => {
                    setPendingPhotoTool(false);
                    
                    // Replace existing photo elements so the selected layout is the definitive one
                    elements.filter(el => el.type === "photo").forEach(el => removeElement(el.id));

                    // Canvas dimensions from constants
                    const canvasW = 1080;
                    const canvasH = 1920;
                    
                    // Calculate grid dimensions based on rows/cols
                    const gapX = 30;
                    const gapY = 30;
                    const marginX = 65;
                    const marginY = 140;
                    
                    const availableWidth = canvasW - (2 * marginX) - ((grid.cols - 1) * gapX);
                    const availableHeight = canvasH - (2 * marginY) - ((grid.rows - 1) * gapY);
                    
                    const photoWidth = Math.floor(availableWidth / grid.cols);
                    const photoHeight = Math.floor(availableHeight / grid.rows);
                    
                    let lastAddedId = null;
                    for (let row = 0; row < grid.rows; row++) {
                      for (let col = 0; col < grid.cols; col++) {
                        const x = marginX + (col * (photoWidth + gapX));
                        const y = marginY + (row * (photoHeight + gapY));
                        
                        const newId = addElement("photo", {
                          x,
                          y,
                          width: photoWidth,
                          height: photoHeight,
                        });
                        
                        if (newId) {
                          lastAddedId = newId;
                        }
                      }
                    }
                    
                    if (lastAddedId) {
                      selectElement(lastAddedId);
                    }
                  }}
                  className="create-mobile-toolbar__button"
                >
                  <Grid3X3 size={20} strokeWidth={2.4} />
                  <span>{grid.label}</span>
                </button>
              ))}
            </nav>
          ) : (
            <nav
              className={`create-mobile-toolbar ${
                isMobilePropertyToolbar ? "create-mobile-toolbar--properties" : ""
              }`.trim()}
            >
              {isMobilePropertyToolbar && (
                <button
                  type="button"
                  onClick={() => { clearSelection(); setActiveMobileProperty(null); }}
                  className="create-mobile-toolbar__button create-mobile-toolbar__button--back"
                >
                  <ChevronLeft size={20} strokeWidth={2.4} />
                  <span>Kembali</span>
                </button>
              )}
              {(isMobilePropertyToolbar
                ? mobilePropertyButtons
                : toolButtons
              ).map((button) => {
                const Icon = button.icon;
                const isActive = isMobilePropertyToolbar
                  ? activeMobileProperty === button.id
                  : Boolean(button.isActive);
                const label = isMobilePropertyToolbar
                  ? button.label
                  : button.mobileLabel ?? button.label;

                const handleClick = () => {
                  if (isMobilePropertyToolbar) {
                    setActiveMobileProperty((prev) =>
                      prev === button.id ? null : button.id
                    );
                  } else {
                    handleToolButtonPress(button);
                  }
                };

                return (
                  <button
                    key={button.id}
                    type="button"
                    onClick={handleClick}
                    className={`create-mobile-toolbar__button ${
                      isActive ? "create-mobile-toolbar__button--active" : ""
                    }`.trim()}
                  >
                    <Icon size={20} strokeWidth={2.4} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{
          position: "absolute",
          left: "-9999px",
          opacity: 0,
          pointerEvents: "none",
        }}
        onChange={handleFileChange}
      />

      {/* Confirm dialog: Save before using frame? */}
      {showUseFrameConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => { e.stopPropagation(); setShowUseFrameConfirm(false); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: "#fff", borderRadius: "16px", padding: "24px",
              maxWidth: "340px", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 700, color: "#1e293b" }}>
              Simpan frame?
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#64748b", lineHeight: 1.5 }}>
              Frame belum disimpan. Ingin simpan sebelum digunakan?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleUseFrameWithSave(); }}
                style={{
                  padding: "11px 18px", borderRadius: "8px", border: "none",
                  background: "linear-gradient(to right, #e0b7a9, #d4a99a)",
                  color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", width: "100%",
                }}
              >
                Ya, simpan dulu
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowUseFrameConfirm(false); activateFrameWithoutSave(); }}
                style={{
                  padding: "11px 18px", borderRadius: "8px", border: "1.5px solid #e2e8f0",
                  background: "#fff", color: "#64748b", fontSize: "14px", fontWeight: 600, cursor: "pointer", width: "100%",
                }}
              >
                Tidak, langsung pakai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for "Import Frame" — accepts PNG/image files from device */}
      <input
        ref={importFrameInputRef}
        type="file"
        accept="image/png,image/*"
        style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
        onChange={handleImportFrameFile}
      />
    </div>
  );
}
