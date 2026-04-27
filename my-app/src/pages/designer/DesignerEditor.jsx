/**
 * DesignerEditor - Frame creator for designers
 * Same tools as AdminFrameCreator, but submits for admin review
 */
import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import html2canvas from "html2canvas";
import {
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  Type as TypeIcon,
  Shapes,
  UploadCloud,
  Maximize2,
  Send,
  Save,
  Search,
  X,
  FileText,
  ChevronLeft,
  Download,
} from "lucide-react";
import CanvasPreview from "../../components/creator/CanvasPreview.jsx";
import PropertiesPanel from "../../components/creator/PropertiesPanel.jsx";
import useCreatorStore from "../../store/useCreatorStore.js";
import { useShallow } from "zustand/react/shallow";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "../../components/creator/canvasConstants.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import unifiedFrameService from "../../services/unifiedFrameService";
import { detectFrameSlots, buildSlotMaps } from "../../utils/slotSystem.js";
import "../Create.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";

// ─── Editor Tutorial ─────────────────────────────────────────────────────────
const EDITOR_TUTORIAL_KEY = "designer_editor_tutorial_v1";

const EDITOR_TUTORIAL_STEPS = [
  {
    targetId: null,
    position: "center",
    icon: "🎨",
    title: "Selamat datang di Editor!",
    body: "Di sini kamu mendesain frame foto kustom. Kita akan belajar langkah-langkah dasarnya sekarang — cukup 2 menit!",
  },
  {
    targetId: "tool-btn-canvas-size",
    position: "right",
    icon: "📐",
    title: "Ukuran Canvas",
    body: "Mulai dengan memilih ukuran frame: Story Instagram (9:16), 4R, atau 2R. Klik tombol ini sekarang untuk melihat pilihannya!",
    cta: "👆 Klik tombol Ukuran Canvas",
  },
  {
    targetId: "tool-btn-photo",
    position: "right",
    icon: "📸",
    title: "Area Foto",
    body: "Ini tool terpenting! Klik 'Area Foto' untuk menambahkan slot tempat pengguna memasukkan fotonya. Frame wajib punya minimal 1 slot foto.",
    cta: "👆 Klik Area Foto untuk menambahkan slot",
  },
  {
    targetId: "editor-canvas-preview",
    position: "left",
    icon: "🖼️",
    title: "Canvas Preview",
    body: "Semua elemen yang kamu tambahkan muncul di sini. Drag untuk pindahkan, seret sudut untuk resize, dan klik untuk mengedit properties-nya.",
  },
  {
    targetId: "tool-btn-text",
    position: "right",
    icon: "✍️",
    title: "Teks & Dekorasi",
    body: "Tambahkan teks, shape, atau gambar upload sebagai ornamen frame. Klik masing-masing tool untuk mencobanya!",
  },
  {
    targetId: "editor-frame-name",
    position: "right",
    icon: "📝",
    title: "Nama Frame",
    body: "Sebelum submit, isi nama frame-mu di sini. Contoh: \"Sweet Birthday - Pink\". Nama yang jelas membantu review lebih cepat.",
    cta: "✏️ Isi nama frame-mu sekarang",
  },
  {
    targetId: "editor-submit-btn",
    position: "top",
    icon: "🚀",
    title: "Submit untuk Review",
    body: "Sudah siap? Klik Submit untuk mengirim ke tim Fremio. Proses review 1-3 hari kerja. Kamu bisa cek statusnya di Dashboard.",
  },
];

// ─── Draft helpers (IndexedDB) ───────────────────────────────────────────────
const DRAFT_DB_NAME = "fremio_drafts_db";
const DRAFT_STORE = "designer_drafts";
let _draftDb = null;
const _openDraftDB = () => new Promise((resolve, reject) => {
  if (_draftDb) { resolve(_draftDb); return; }
  const req = indexedDB.open(DRAFT_DB_NAME, 1);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => { _draftDb = req.result; resolve(_draftDb); };
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(DRAFT_STORE)) {
      db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
    }
  };
});
const _getDesignerId = () => { try { const u = JSON.parse(localStorage.getItem("designer_user") || localStorage.getItem("fremio_user") || "null"); return u?.id || u?.email || "anon"; } catch { return "anon"; } };
export const getDraftsForDesigner = async () => {
  try {
    const db = await _openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DRAFT_STORE], "readonly");
      const req = tx.objectStore(DRAFT_STORE).getAll();
      req.onsuccess = () => {
        const id = _getDesignerId();
        resolve((req.result || []).filter(d => d.designerId === id).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).slice(0, 30));
      };
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
};
export const persistDraft = async (draft) => {
  try {
    const db = await _openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DRAFT_STORE], "readwrite");
      const req = tx.objectStore(DRAFT_STORE).put(draft);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error("persistDraft failed:", e); throw e; }
};
export const removeDraft = async (id) => {
  try {
    const db = await _openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DRAFT_STORE], "readwrite");
      const req = tx.objectStore(DRAFT_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error("removeDraft failed:", e); }
};

const panelMotion = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
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
    // If no single color dominates ≥ 8% of border, image may have no clear bg — skip
    if (maxCount < totalBorderPx * 0.08 || !bgKey) { resolve(dataUrl); return; }
    const [bgR, bgG, bgB] = bgKey.split(',').map(Number);

    // --- Step 3: flood-fill from edges with tight per-channel tolerance ---
    // TOL = max sum of |Δr|+|Δg|+|Δb| to still be considered background
    const TOL = 60; // ~20 per channel — tight enough to spare object, loose enough for JPEG noise
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
        if (d[p + 3] === 0) continue; // already transparent
        const diff = Math.abs(d[p] - bgR) + Math.abs(d[p+1] - bgG) + Math.abs(d[p+2] - bgB);
        if (diff <= SOFT_TOL) {
          // fade alpha: 0 at TOL, opaque at SOFT_TOL
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

export default function DesignerEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editSubmissionId = searchParams.get("edit");
  const draftId = searchParams.get("draft");
  const adminPreviewId = searchParams.get("adminPreview"); // admin simulation mode
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const uploadPurposeRef = useRef("upload");
  const importFrameInputRef = useRef(null);
  const [importFrameWorking, setImportFrameWorking] = useState(false);
  const previewFrameRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const readyRef = useRef(false);          // true after initial load settles
  const currentDraftIdRef = useRef(draftId || null); // tracks the draft being edited

  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const pendingNavRef = useRef(null);  // target URL when exit was triggered
  const [toast, setToast] = useState(null);
  const [canvasAspectRatio, setCanvasAspectRatio] = useState("9:16");
  const [showCanvasSizeInProperties, setShowCanvasSizeInProperties] = useState(true);
  const [gradientColor1, setGradientColor1] = useState("#667eea");
  const [gradientColor2, setGradientColor2] = useState("#764ba2");
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(false);
  const [pendingPhotoTool, setPendingPhotoTool] = useState(false);
  const [pendingPexelsTool, setPendingPexelsTool] = useState(false);
  const [previewConstraints, setPreviewConstraints] = useState({ maxWidth: 280, maxHeight: 500 });
  const [isMobileView, setIsMobileView] = useState(false);
  const [showMobileProps, setShowMobileProps] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(false);
  const [editorTutorialStep, setEditorTutorialStep] = useState(0);
  const [showEditorTutorial, setShowEditorTutorial] = useState(false);
  const [tutorialSpotlight, setTutorialSpotlight] = useState(null); // { top, left, width, height }
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const [frameName, setFrameName] = useState("");
  const [frameDescription, setFrameDescription] = useState("");

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

  // Reset store on mount / load submission or draft for editing
  // Prevent focus-induced scroll when browser-zoomed.
  // The `focusin`+preventScroll approach is WRONG — the browser scrolls BEFORE
  // firing focusin, so preventScroll on re-focus is too late.
  // Correct approach: on every pointerdown on the canvas, save scroll position
  // and register a one-shot `scroll` listener (capture phase). If the browser
  // scrolls due to focus/scroll-into-view, the handler fires synchronously
  // and calls scrollTo(savedX, savedY) BEFORE the next paint — so the user
  // never sees the wrong position.
  useEffect(() => {
    const onPointerDown = (e) => {
      const canvas = document.querySelector('.create-preview');
      if (!canvas || !canvas.contains(e.target)) return;

      const savedX = window.scrollX;
      const savedY = window.scrollY;

      let active = true;
      const cleanup = () => {
        active = false;
        window.removeEventListener('scroll', onScroll, true);
      };
      const onScroll = () => {
        if (!active) return;
        cleanup(); // remove listener FIRST to avoid triggering ourselves again
        window.scrollTo(savedX, savedY); // restore before paint
      };

      window.addEventListener('scroll', onScroll, true);
      setTimeout(cleanup, 500); // safety: remove if no scroll within 500ms
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Lock body/html scroll via overflow:clip only for non-designer Create page.
  // Designer editor uses `.designer-editor` class which overrides to allow scroll.
  useEffect(() => {
    // no-op: scroll handled via CSS .designer-editor overrides
  }, []);

  // Auto-show editor tutorial for new designers (or anyone who hasn't seen this version)
  useEffect(() => {
    if (!adminPreviewId && localStorage.getItem(EDITOR_TUTORIAL_KEY) !== "seen") {
      setEditorTutorialStep(0);
      setShowEditorTutorial(true);
    }
  }, [adminPreviewId]);

  // Update spotlight position whenever tutorial step changes
  useEffect(() => {
    if (!showEditorTutorial) return;
    const step = EDITOR_TUTORIAL_STEPS[editorTutorialStep];
    if (!step?.targetId) { setTutorialSpotlight(null); return; }
    const el = document.getElementById(step.targetId);
    if (!el) { setTutorialSpotlight(null); return; }
    const rect = el.getBoundingClientRect();
    const PAD = 8;
    setTutorialSpotlight({
      top: rect.top - PAD,
      left: rect.left - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
      rect,
    });
  }, [editorTutorialStep, showEditorTutorial]);

  useEffect(() => {
    readyRef.current = false;
    setIsDirty(false);
    clearSelection(); // deselect background so only Ukuran Canvas is active by default

    // ── Admin Preview Mode ─────────────────────────────────────────────────
    if (adminPreviewId) {
      const token = localStorage.getItem("fremio_token");
      fetch(`${API_URL}/designer/admin/submissions/${adminPreviewId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.success || !data.submission) return;
          const { frame_data, frame_name, frame_description } = data.submission;
          const fd =
            typeof frame_data === "string" ? JSON.parse(frame_data) : frame_data;
          setFrameName(frame_name || "");
          setFrameDescription(frame_description || "");
          if (fd.aspectRatio) setCanvasAspectRatio(fd.aspectRatio);
          const cw = fd.canvasWidth || CANVAS_WIDTH;
          const ch = fd.canvasHeight || CANVAS_HEIGHT;
          if (fd.canvasBackground) setCanvasBackground(fd.canvasBackground);
          const photoEls = (fd.slots || []).map((slot, i) => ({
            id: slot.id || `photo_${i}`,
            type: "photo",
            x: slot.left * cw,
            y: slot.top * ch,
            width: slot.width * cw,
            height: slot.height * ch,
            zIndex: slot.zIndex || i + 1,
            rotation: slot.rotation || 0,
            locked: false,
            photoIndex: slot.photoIndex != null ? slot.photoIndex : i,
            data: {
              label: "Foto",
              borderRadius: slot.borderRadius || 0,
              objectFit: "cover",
            },
          }));
          const otherEls = (fd.elements || []).map((el) => ({
            ...el,
            locked: el.locked ?? false,
          }));
          setElements([...photoEls, ...otherEls]);
          if (fd.backgroundImage) {
            addBackgroundPhoto(fd.backgroundImage, { canvasWidth: cw, canvasHeight: ch });
          }
          showToast("success", "🔍 Mode Preview Admin — frame dimuat.", 3000);
          setTimeout(() => { readyRef.current = true; setIsDirty(false); }, 100);
        })
        .catch((err) => console.error("Failed to load admin preview:", err));
      return;
    }

    if (draftId) {
      // Load from IndexedDB draft
      const loadDraft = async () => {
        try {
          const db = await _openDraftDB();
          const draft = await new Promise((resolve, reject) => {
            const tx = db.transaction([DRAFT_STORE], "readonly");
            const req = tx.objectStore(DRAFT_STORE).get(draftId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
          });
          if (draft) {
            setFrameName(draft.frameName || "");
            setFrameDescription(draft.frameDescription || "");
            if (draft.canvasAspectRatio) setCanvasAspectRatio(draft.canvasAspectRatio);
            if (draft.canvasBackground) setCanvasBackground(draft.canvasBackground);
            setElements(draft.elements || []);
          }
        } catch (e) {
          console.error("Failed to load draft:", e);
        } finally {
          setTimeout(() => { readyRef.current = true; setIsDirty(false); }, 100);
        }
      };
      loadDraft();
      return;
    }

    if (!editSubmissionId) {
      setElements([]);
      setCanvasBackground("#ffffff");
      setTimeout(() => { readyRef.current = true; }, 100);
      return;
    }
    // Load existing submission for editing
    const token =
      localStorage.getItem("designer_token") ||
      localStorage.getItem("fremio_token");
    fetch(`${API_URL}/designer/submissions/${editSubmissionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success || !data.submission) return;
        const { frame_data, frame_name, frame_description } = data.submission;
        const fd =
          typeof frame_data === "string" ? JSON.parse(frame_data) : frame_data;
        setFrameName(frame_name || "");
        setFrameDescription(frame_description || "");
        if (fd.aspectRatio) setCanvasAspectRatio(fd.aspectRatio);
        const cw = fd.canvasWidth || CANVAS_WIDTH;
        const ch = fd.canvasHeight || CANVAS_HEIGHT;
        if (fd.canvasBackground) setCanvasBackground(fd.canvasBackground);
        // Reconstruct photo slot elements
        const photoEls = (fd.slots || []).map((slot, i) => ({
          id: slot.id || `photo_${i}`,
          type: "photo",
          x: slot.left * cw,
          y: slot.top * ch,
          width: slot.width * cw,
          height: slot.height * ch,
          zIndex: slot.zIndex || i + 1,
          rotation: slot.rotation || 0,
          locked: false,
          photoIndex: slot.photoIndex != null ? slot.photoIndex : i,
          data: {
            label: "Foto",
            borderRadius: slot.borderRadius || 0,
            objectFit: "cover",
          },
        }));
        // Reconstruct other elements (text, shape, upload overlay)
        const otherEls = (fd.elements || []).map((el) => ({
          ...el,
          locked: el.locked ?? false,
        }));
        setElements([...photoEls, ...otherEls]);
        // Restore background image — add background-photo element if saved
        if (fd.backgroundImage) {
          addBackgroundPhoto(fd.backgroundImage, { canvasWidth: cw, canvasHeight: ch });
        }
        showToast("success", "Frame dimuat untuk diedit.", 2000);
        setTimeout(() => { readyRef.current = true; setIsDirty(false); }, 100);
      })
      .catch((err) => console.error("Failed to load submission:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSubmissionId, draftId, adminPreviewId]);

  // Mobile view detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobileView(mq.matches);
    const handler = (e) => setIsMobileView(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Track unsaved changes (skip during initial load and in admin preview mode)
  useEffect(() => {
    if (!readyRef.current) return;
    if (adminPreviewId) return; // no dirty tracking in admin preview
    setIsDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, frameName, frameDescription, canvasBackground, canvasAspectRatio]);

  // Warn on browser tab close when dirty
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Block React Router navigation when dirty — use popstate (works without data router)
  useEffect(() => {
    if (!isDirty) return;
    // Push an extra history entry so we can intercept the back gesture
    window.history.pushState(null, "", window.location.href);
    const handler = () => {
      // Push again to keep URL stable while modal is open
      window.history.pushState(null, "", window.location.href);
      pendingNavRef.current = "/designer/dashboard";
      setShowExitPrompt(true);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [isDirty]);

  // safeNavigate — checks dirty before navigating
  const safeNavigate = useCallback((to) => {
    if (isDirty) {
      pendingNavRef.current = to;
      setShowExitPrompt(true);
    } else {
      navigate(to);
    }
  }, [isDirty, navigate]);

  const showToast = useCallback((type, message, duration = 3200) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  const selectedElement = useMemo(() => {
    if (selectedElementId === "background") return "background";
    return elements.find((el) => el.id === selectedElementId) || null;
  }, [elements, selectedElementId]);

  const backgroundPhotoElement = useMemo(
    () => elements.find((el) => el.type === "background-photo") || null,
    [elements]
  );

  const getCanvasDimensions = useCallback((ratio) => {
    if (typeof ratio !== "string") return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    if (ratio === "A5") return { width: 1080, height: 1529 };
    if (ratio === "A4") return { width: 1240, height: 1754 };
    if (ratio === "A3") return { width: 1754, height: 2480 };
    const [w, h] = ratio.split(":").map(Number);
    if (!w || !h) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    if (h >= w) return { width: CANVAS_WIDTH, height: Math.round((CANVAS_WIDTH * h) / w) };
    return { width: Math.round((CANVAS_HEIGHT * w) / h), height: CANVAS_HEIGHT };
  }, []);

  const handleImportFrameFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importFrameInputRef.current) importFrameInputRef.current.value = "";
    if (!file.type.startsWith("image/")) {
      showToast("error", "Pilih file gambar (PNG/JPG).");
      return;
    }
    if (importFrameWorking) return;
    setImportFrameWorking(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { width: canvasW, height: canvasH } = getCanvasDimensions(canvasAspectRatio);
      showToast("info", "Mendeteksi area slot foto…", 6000);
      const slots = await detectFrameSlots(dataUrl);
      const { slotNumberMap, photoIndexMap } = buildSlotMaps(slots);
      if (slots.length > 0) {
        slots.forEach((slot, index) => {
          addElement("photo", {
            x: Math.round(slot.left * canvasW),
            y: Math.round(slot.top * canvasH),
            width: Math.round(slot.width * canvasW),
            height: Math.round(slot.height * canvasH),
            zIndex: 0,
            data: {
              photoIndex: photoIndexMap[index] ?? index,
              slotNumber: slotNumberMap[index] ?? index + 1,
              borderRadius: 0,
            },
          });
        });
      } else {
        addElement("photo", {
          x: 0, y: 0, width: canvasW, height: canvasH,
          zIndex: 0,
          data: { photoIndex: 0, slotNumber: 1, borderRadius: 0 },
        });
      }
      const frameImg = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });
      addElement("upload", {
        x: 0, y: 0, width: canvasW, height: canvasH,
        zIndex: 9000,
        locked: false,
        data: {
          image: dataUrl,
          originalImage: dataUrl,
          imageAspectRatio: frameImg.width / frameImg.height,
          objectFit: "fill",
          label: file.name.replace(/\.[^.]+$/, "") || "Frame",
          borderRadius: 0,
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
  }, [importFrameWorking, showToast, getCanvasDimensions, canvasAspectRatio, addElement]);

  const applyPhotoGridLayout = useCallback((rows = 1, cols = 1) => {
    elements.filter((el) => el.type === "photo").forEach((el) => removeElement(el.id));

    const { width: canvasW, height: canvasH } = getCanvasDimensions(canvasAspectRatio);
    const gapX = 30;
    const gapY = 30;
    const marginX = 65;
    const marginY = 140;
    const availableWidth = canvasW - 2 * marginX - (cols - 1) * gapX;
    const availableHeight = canvasH - 2 * marginY - (rows - 1) * gapY;
    const photoWidth = Math.floor(availableWidth / cols);
    const photoHeight = Math.floor(availableHeight / rows);

    const gridSlots = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        gridSlots.push({
          x: marginX + col * (photoWidth + gapX),
          y: marginY + row * (photoHeight + gapY),
          width: photoWidth,
          height: photoHeight,
        });
      }
    }

    const normalizedSlots = gridSlots.map((slot) => ({
      left: slot.x / canvasW,
      top: slot.y / canvasH,
      width: slot.width / canvasW,
      height: slot.height / canvasH,
    }));

    const { slotNumberMap, photoIndexMap } = buildSlotMaps(normalizedSlots);

    let lastId = null;
    gridSlots.forEach((slot, index) => {
      const id = addElement("photo", {
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        data: {
          photoIndex: photoIndexMap[index] ?? index,
          slotNumber: slotNumberMap[index] ?? index + 1,
          borderRadius: 0,
        },
      });
      if (id) lastId = id;
    });

    if (lastId) {
      selectElement(lastId);
    }
  }, [elements, removeElement, getCanvasDimensions, canvasAspectRatio, addElement, selectElement]);

  const triggerUpload = useCallback(() => {
    uploadPurposeRef.current = "upload";
    fileInputRef.current?.click();
  }, []);

  const triggerBackgroundUpload = useCallback(() => {
    uploadPurposeRef.current = "background";
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    const handler = () => triggerBackgroundUpload();
    window.addEventListener("creator:request-background-upload", handler);
    return () => window.removeEventListener("creator:request-background-upload", handler);
  }, [triggerBackgroundUpload]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === "string") {
        if (uploadPurposeRef.current === "background") {
          const { width: cw, height: ch } = getCanvasDimensions(canvasAspectRatio);
          addBackgroundPhoto(dataUrl, { canvasWidth: cw, canvasHeight: ch });
          // Fallback: ensure correct sizing after image fully decodes
          setTimeout(() => fitBackgroundPhotoToCanvas({ canvasWidth: cw, canvasHeight: ch }), 300);
        } else {
          addUploadElement(dataUrl);
        }
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const toggleBackgroundLock = useCallback(() => {
    setIsBackgroundLocked((prev) => !prev);
    showToast("success", isBackgroundLocked ? "Background unlocked" : "Background locked", 1500);
  }, [isBackgroundLocked, showToast]);

  const toolButtons = useMemo(
    () => [
      {
        id: "canvas-size",
        icon: Maximize2,
        label: "Ukuran Canvas",
        isActive: showCanvasSizeInProperties,
        onClick: () => { setShowCanvasSizeInProperties((prev) => !prev); setPendingPhotoTool(false); setPendingPexelsTool(false); clearSelection(); },
      },
      {
        id: "import-frame",
        icon: Download,
        label: "Import Frame",
        isActive: importFrameWorking,
        onClick: () => {
          if (importFrameWorking) return;
          if (importFrameInputRef.current) {
            importFrameInputRef.current.value = "";
            importFrameInputRef.current.click();
          }
        },
      },
      {
        id: "background",
        icon: () => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
          </svg>
        ),
        label: "Background",
        isActive: selectedElementId === "background" && !showCanvasSizeInProperties,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(false); setPendingPexelsTool(false); selectElement("background"); },
      },
      {
        id: "photo",
        icon: ImageIcon,
        label: "Area Foto",
        isActive: pendingPhotoTool,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(true); setPendingPexelsTool(false); clearSelection(); },
      },
      {
        id: "pexels",
        icon: Search,
        label: "Cari Foto",
        isActive: pendingPexelsTool,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(false); setPendingPexelsTool(true); clearSelection(); },
      },
      {
        id: "text",
        icon: TypeIcon,
        label: "Add Text",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(false); setPendingPexelsTool(false); addElement("text"); },
      },
      {
        id: "shape",
        icon: Shapes,
        label: "Shape",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(false); setPendingPexelsTool(false); addElement("shape"); },
      },
      {
        id: "upload",
        icon: UploadCloud,
        label: "Unggahan",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(false); setPendingPexelsTool(false); triggerUpload(); },
      },
    ],
    [showCanvasSizeInProperties, selectedElementId, pendingPhotoTool, pendingPexelsTool, addElement, selectElement, clearSelection, triggerUpload, importFrameWorking]
  );

  // ─── Save Draft ──────────────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    setSavingDraft(true);
    try {
      const id = currentDraftIdRef.current || crypto.randomUUID();
      currentDraftIdRef.current = id;
      const draft = {
        id,
        designerId: _getDesignerId(),
        frameName,
        frameDescription,
        canvasAspectRatio,
        canvasBackground,
        elements,
        elementCount: elements.filter((e) => e.type === "photo").length,
        savedAt: new Date().toISOString(),
      };
      await persistDraft(draft);
      setIsDirty(false);
      showToast("success", "Draft tersimpan! ✅", 2000);
    } catch (e) {
      showToast("error", "Gagal menyimpan draft: " + e.message);
    } finally {
      setSavingDraft(false);
    }
  }, [frameName, frameDescription, canvasAspectRatio, canvasBackground, elements, showToast]);

  // ─── Submit for Review ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (saving) return;

    if (!frameName.trim()) {
      showToast("error", "Nama frame harus diisi!");
      return;
    }

    const photoElements = elements.filter((el) => el.type === "photo");
    if (photoElements.length === 0) {
      showToast("error", "Tambahkan minimal 1 Area Foto!");
      return;
    }

    setSaving(true);

    // Deselect all elements so selection borders don't appear in the thumbnail
    clearSelection();
    // Wait two animation frames for React to flush the deselect render
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(canvasAspectRatio);

      // Capture canvas thumbnail — clone #creator-canvas at full size to avoid
      // capturing the outer wrapper (which includes padding/whitespace)
      let thumbnailDataUrl = null;
      try {
        const canvasEl = document.getElementById("creator-canvas");
        if (canvasEl) {
          const tempContainer = document.createElement("div");
          Object.assign(tempContainer.style, {
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
          const clone = canvasEl.cloneNode(true);
          Object.assign(clone.style, {
            transform: "none",
            transformOrigin: "top left",
            position: "relative",
            top: "0",
            left: "0",
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            margin: "0",
            boxShadow: "none",
            outline: "none",
          });
          // Remove selection borders, handles, and toolbars from the clone
          // (elements with data-export-ignore are selection UI — borders, toolbars, rotate btn)
          clone.querySelectorAll("[data-export-ignore]").forEach((el) => {
            el.style.display = "none";
          });
          // Also clear any orange selection outline on the selected Rnd wrapper
          clone.querySelectorAll(".creator-element--selected").forEach((el) => {
            el.style.outline = "none";
            el.style.boxShadow = "none";
          });
          tempContainer.appendChild(clone);
          document.body.appendChild(tempContainer);
          try {
            const captured = await html2canvas(clone, {
              scale: 0.5,
              useCORS: true,
              allowTaint: true,
              backgroundColor: canvasBackground || "#ffffff",
              width: canvasWidth,
              height: canvasHeight,
              windowWidth: canvasWidth,
              windowHeight: canvasHeight,
              scrollX: 0,
              scrollY: 0,
            });
            thumbnailDataUrl = captured.toDataURL("image/jpeg", 0.7);
          } finally {
            document.body.removeChild(tempContainer);
          }
        }
      } catch (err) {
        console.warn("Could not capture canvas thumbnail:", err);
      }

      // Build photo slots
      const slots = photoElements.map((el, index) => ({
        id: el.id,
        left: el.x / canvasWidth,
        top: el.y / canvasHeight,
        width: el.width / canvasWidth,
        height: el.height / canvasHeight,
        zIndex: 1,
        photoIndex: index,
        borderRadius: el.data?.borderRadius || 0,
        rotation: Number.isFinite(el.rotation) ? el.rotation : 0,
      }));

      // Process non-photo overlay elements (upload images need uploading)
      const otherElements = [];
      const token =
        localStorage.getItem("designer_token") ||
        localStorage.getItem("fremio_token");

      for (const el of elements.filter(
        (e) => e.type !== "photo" && e.type !== "background-photo"
      )) {
        const elementToSave = {
          id: el.id,
          type: el.type,
          x: el.x || 0,
          y: el.y || 0,
          width: el.width,
          height: el.height,
          zIndex: el.zIndex || 500,
          xNorm: el.x / canvasWidth,
          yNorm: el.y / canvasHeight,
          widthNorm: el.width / canvasWidth,
          heightNorm: el.height / canvasHeight,
        };

        if (el.data && typeof el.data === "object") {
          elementToSave.data = {
            label: el.data.label || "",
            objectFit: el.data.objectFit || "contain",
            borderRadius: el.data.borderRadius || 0,
            __isOverlay: el.type === "upload",
          };

          if (el.type === "upload") {
            const imageToUpload = el.data?.originalImage || el.data?.image;
            if (imageToUpload && imageToUpload.startsWith("data:")) {
              try {
                const blob = await (await fetch(imageToUpload)).blob();
                const uploadResult = await unifiedFrameService.uploadOverlayImage(
                  blob,
                  `overlay_${el.id.substring(0, 8)}.png`
                );
                // Use server URL if upload succeeded, otherwise keep data URL
                elementToSave.data.image = uploadResult?.imagePath || imageToUpload;
              } catch {
                // Upload failed — store data URL directly so submit still works
                elementToSave.data.image = imageToUpload;
              }
            } else if (imageToUpload) {
              elementToSave.data.image = imageToUpload;
            }
          } else {
            Object.keys(el.data).forEach((key) => {
              if (key !== "originalImage") {
                elementToSave.data[key] = el.data[key];
              }
            });
          }
        }

        otherElements.push(elementToSave);
      }

      // Upload background image to server so it can be restored on edit
      let bgImagePath = null;
      if (backgroundPhotoElement?.data?.image) {
        const bgImg = backgroundPhotoElement.data.image;
        if (bgImg.startsWith("data:")) {
          try {
            const blob = await (await fetch(bgImg)).blob();
            const uploadResult = await unifiedFrameService.uploadOverlayImage(
              blob,
              `bg_${Date.now()}.jpg`
            );
            bgImagePath = uploadResult?.imagePath || bgImg;
          } catch {
            bgImagePath = bgImg;
          }
        } else {
          bgImagePath = bgImg; // already a server URL
        }
      }

      const frameData = {
        elements: otherElements,
        slots,
        canvasBackground,
        canvasWidth,
        canvasHeight,
        aspectRatio: canvasAspectRatio,
        backgroundImage: bgImagePath,
      };

      const url = editSubmissionId
        ? `${API_URL}/designer/submissions/${editSubmissionId}`
        : `${API_URL}/designer/submissions`;
      const method = editSubmissionId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          frameName: frameName.trim(),
          frameDescription: frameDescription.trim(),
          frameData,
          thumbnailDataUrl,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const msg = editSubmissionId
          ? "Frame berhasil diperbarui! Menunggu review admin..."
          : "Frame berhasil disubmit! Menunggu review admin...";
        showToast("success", msg, 3000);
        // Remove draft (if any) after successful submit
        if (currentDraftIdRef.current) await removeDraft(currentDraftIdRef.current);
        setIsDirty(false);
        setFrameName("");
        setFrameDescription("");
        setTimeout(() => navigate("/designer/dashboard"), 2000);
      } else {
        showToast("error", data.message || "Gagal submit frame");
      }
    } catch (error) {
      console.error("Submit error:", error);
      showToast("error", "Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-page designer-editor">
      {/* Back button */}
      <div style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          onClick={() => adminPreviewId ? navigate("/admin/designer-submissions") : safeNavigate("/designer/dashboard")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            background: "transparent",
            border: "1px solid #e0b7a9",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
            color: "#6b7280",
            cursor: "pointer",
          }}
        >
          {adminPreviewId ? "← Kembali ke Submissions" : "← Dashboard"}
        </button>

        {/* Admin Preview Banner */}
        {adminPreviewId && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "7px 16px",
            background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
            border: "1.5px solid #c7d2fe",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: "600",
            color: "#4338ca",
          }}>
            🔍 Mode Preview Admin — Perubahan tidak disimpan
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      {/* Hidden import frame input */}
      <input
        ref={importFrameInputRef}
        type="file"
        accept="image/png,image/*"
        style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
        onChange={handleImportFrameFile}
      />

      {/* Toast */}
      {toast && (
        <Motion.div
          className="create-toast-wrapper"
          initial={{ opacity: 0, y: -12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.94 }}
        >
          <div
            className={`create-toast ${
              toast.type === "success" ? "create-toast--success" : "create-toast--error"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <span>{toast.message}</span>
          </div>
        </Motion.div>
      )}

      {/* Exit Prompt Modal */}
      {showExitPrompt && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999,
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "32px 28px",
            maxWidth: "400px", width: "90%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "12px", textAlign: "center" }}>💾</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: "700", color: "#1a1a2e", textAlign: "center" }}>
              Simpan draft sebelum keluar?
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: "14px", color: "#6b7280", textAlign: "center", lineHeight: "1.6" }}>
              Perubahan yang belum disimpan akan hilang jika kamu keluar.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  handleSaveDraft();
                  setShowExitPrompt(false);
                  navigate(pendingNavRef.current || "/designer/dashboard");
                }}
                style={{
                  padding: "12px", borderRadius: "10px", border: "none",
                  background: "#e0b7a9", color: "#2c1508",
                  fontSize: "14px", fontWeight: "700", cursor: "pointer",
                }}
              >
                Simpan Draft &amp; Keluar
              </button>
              <button
                onClick={() => {
                  setIsDirty(false);
                  setShowExitPrompt(false);
                  navigate(pendingNavRef.current || "/designer/dashboard");
                }}
                style={{
                  padding: "12px", borderRadius: "10px",
                  border: "1px solid #e5e7eb", background: "#fff",
                  fontSize: "14px", fontWeight: "600", color: "#374151", cursor: "pointer",
                }}
              >
                Keluar tanpa menyimpan
              </button>
              <button
                onClick={() => {
                  setShowExitPrompt(false);
                }}
                style={{
                  padding: "10px", borderRadius: "10px", border: "none",
                  background: "transparent", fontSize: "13px",
                  color: "#9ca3af", cursor: "pointer",
                }}
              >
                Batal, tetap di editor
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999,
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "32px 28px",
            maxWidth: "440px", width: "90%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "12px", textAlign: "center" }}>📋</div>
            <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "700", color: "#1a1a2e", textAlign: "center" }}>
              Pernyataan Desainer
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280", textAlign: "center" }}>
              Dengan mengsubmit frame ke Fremio, kamu menyatakan bahwa:
            </p>
            <ul style={{ margin: "0 0 24px", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              <li style={{ display: "flex", gap: "10px", fontSize: "13px", color: "#374151", lineHeight: "1.6" }}>
                <span style={{ color: "#16a34a", fontWeight: "700", flexShrink: 0 }}>✓</span>
                Seluruh aset dalam frame adalah karya orisinal yang kamu buat sendiri dan bebas dari klaim hak cipta pihak manapun.
              </li>
              <li style={{ display: "flex", gap: "10px", fontSize: "13px", color: "#374151", lineHeight: "1.6" }}>
                <span style={{ color: "#16a34a", fontWeight: "700", flexShrink: 0 }}>✓</span>
                Kamu memberikan izin kepada Fremio untuk menampilkan, mendistribusikan, dan menggunakan frame tersebut di dalam platform sebagai bagian dari layanan kepada pengguna.
              </li>
              <li style={{ display: "flex", gap: "10px", fontSize: "13px", color: "#374151", lineHeight: "1.6" }}>
                <span style={{ color: "#16a34a", fontWeight: "700", flexShrink: 0 }}>✓</span>
                Jika ada tuntutan hak cipta atas aset dalam frame ini, hal tersebut sepenuhnya menjadi tanggung jawabmu — bukan Fremio — dan Fremio berhak menurunkan frame tanpa pemberitahuan.
              </li>
            </ul>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}
                style={{
                  padding: "13px", borderRadius: "10px", border: "none",
                  background: "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)",
                  color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer",
                }}
              >
                Setuju &amp; Submit Frame
              </button>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                style={{
                  padding: "11px", borderRadius: "10px",
                  border: "1px solid #e5e7eb", background: "#fff",
                  fontSize: "13px", fontWeight: "600", color: "#6b7280", cursor: "pointer",
                }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="create-grid">
        {/* Tools Panel */}
        {!isMobileView && <Motion.aside
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
                  id={`tool-btn-${button.id}`}
                  type="button"
                  onClick={button.onClick}
                  className={`create-tools__button ${
                    button.isActive ? "create-tools__button--active" : ""
                  }`}
                >
                  <IconComponent size={20} strokeWidth={2} />
                  <span>{button.label}</span>
                </button>
              );
            })}
          </div>

          {/* Frame Info */}
          <div
            style={{
              marginTop: "24px",
              borderTop: "1px solid #f0e6e0",
              paddingTop: "16px",
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "12px",
              }}
            >
              📋 Info Frame
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Nama Frame *
              </label>
              <input
                id="editor-frame-name"
                type="text"
                value={frameName}
                onChange={(e) => setFrameName(e.target.value)}
                placeholder="contoh: FremioSeries-Blue-6"
                tabIndex="-1"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: "13px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Deskripsi
              </label>
              <textarea
                value={frameDescription}
                onChange={(e) => setFrameDescription(e.target.value)}
                placeholder="Deskripsi singkat frame kamu..."
                rows={3}
                tabIndex="-1"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: "13px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  resize: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                padding: "10px",
                background: "#f0f5ff",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#4f46e5",
              }}
            >
              ℹ️ Kategori akan ditentukan oleh admin saat frame disetujui.
            </div>
          </div>
        </Motion.aside>}

        {/* Preview */}
        <Motion.section
          variants={panelMotion}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="create-preview"
        >
          <h2 className="create-preview__title">Preview</h2>

          <div className="create-preview__body" id="editor-canvas-preview">
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
                  if (id === null) {
                    clearSelection();
                  } else if (id === "background") {
                    if (isBackgroundLocked) {
                      showToast("info", "Background dikunci.", 2000);
                      return;
                    }
                    setPendingPhotoTool(false);
                    setPendingPexelsTool(false);
                    setShowCanvasSizeInProperties(false);
                    selectElement("background");
                  } else {
                    setPendingPhotoTool(false);
                    setPendingPexelsTool(false);
                    setShowCanvasSizeInProperties(false);
                    selectElement(id);
                  }
                }}
                onUpdate={updateElement}
                onBringToFront={bringToFront}
                onRemove={removeElement}
                onDuplicate={duplicateElement}
                onToggleLock={toggleLock}
                onResizeUpload={resizeUploadImage}
              />
            </div>
          </div>

          {/* Save Draft + Submit Buttons — hidden in admin preview mode */}
          {!adminPreviewId && (
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <Motion.button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft || saving}
            className="create-save"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -2 }}
            style={{
              background: isDirty
                ? "linear-gradient(135deg, #e0b7a9 0%, #c89585 100%)"
                : "#f0e6e0",
              color: isDirty ? "#2c1508" : "#a09090",
              marginTop: "0",
              fontSize: "14px",
              flex: 1,
            }}
          >
            <Save size={16} strokeWidth={2.5} />
            {savingDraft ? "Menyimpan..." : isDirty ? "Simpan Draft" : "Draft Tersimpan ✓"}
          </Motion.button>

          {/* Submit Button */}
          <Motion.button
            id="editor-submit-btn"
            type="button"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={saving}
            className="create-save"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -3 }}
            style={{
              background: "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)",
              marginTop: "0",
              flex: 1,
            }}
          >
            {saving ? (
              <>
                <svg
                  className="create-save__spinner"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    opacity="0.25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    opacity="0.75"
                  />
                </svg>
                Mengirim...
              </>
            ) : (
              <>
                <Send size={18} strokeWidth={2.5} />
                Submit untuk Review
              </>
            )}
          </Motion.button>
          </div>
          )}

          {/* Admin preview mode notice */}
          {adminPreviewId && (
            <div style={{
              marginTop: "10px",
              padding: "10px 14px",
              background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
              border: "1.5px solid #c7d2fe",
              borderRadius: "10px",
              fontSize: "12px",
              color: "#4338ca",
              textAlign: "center",
              fontWeight: "600",
            }}>
              🔍 Mode Preview — kamu bisa edit elemen untuk simulasi, tapi tidak ada yang disimpan
            </div>
          )}
        </Motion.section>

        {/* Properties Panel — desktop only */}
        {!isMobileView && <Motion.aside
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
              onBackgroundChange={setCanvasBackground}
              onUpdateElement={updateElement}
              onDeleteElement={removeElement}
              clearSelection={clearSelection}
              onSelectBackgroundPhoto={() => {
                if (isBackgroundLocked) {
                  showToast("info", "Background dikunci.", 2000);
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
                applyPhotoGridLayout(rows, cols);
              }}
              onCancelPhotoTool={() => setPendingPhotoTool(false)}
            />
          </div>
        </Motion.aside>}
      </div>

      {/* ─── MOBILE: bottom sheet + toolbar ─────────────────────────────── */}
      {isMobileView && (
        <>
          {/* Properties bottom sheet */}
          {showMobileProps && (
            <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
              <div
                style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
                onClick={() => setShowMobileProps(false)}
              />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "#fff", borderRadius: "24px 24px 0 0",
                maxHeight: "82vh", display: "flex", flexDirection: "column",
                boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 20px 10px", borderBottom: "1px solid #f0e6e0",
                  borderRadius: "24px 24px 0 0", background: "#fff",
                  flexShrink: 0,
                }}>
                  <button
                    type="button"
                    onClick={() => setShowMobileProps(false)}
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
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#1a1a2e" }}>Properties</h2>
                  <button
                    type="button"
                    onClick={() => setShowMobileProps(false)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: "4px" }}
                  ><X size={20} /></button>
                </div>
                <div style={{ overflowY: "auto", padding: "12px 16px calc(24px + env(safe-area-inset-bottom,0px))" }}>
                  <PropertiesPanel
                    selectedElement={selectedElement}
                    canvasBackground={canvasBackground}
                    onBackgroundChange={setCanvasBackground}
                    onUpdateElement={updateElement}
                    onDeleteElement={(id) => { removeElement(id); clearSelection(); setShowMobileProps(false); }}
                    clearSelection={clearSelection}
                    onSelectBackgroundPhoto={() => {
                      if (isBackgroundLocked) { showToast("info", "Background dikunci.", 2000); return; }
                      if (backgroundPhotoElement) { selectElement(backgroundPhotoElement.id); }
                      else { triggerBackgroundUpload(); }
                    }}
                    onFitBackgroundPhoto={fitBackgroundPhotoToCanvas}
                    backgroundPhoto={backgroundPhotoElement}
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
                      } catch { showToast("error", "Gagal memuat aset. Coba lagi."); }
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
                      } catch { showToast("error", "Gagal memuat foto. Coba lagi."); }
                    }}
                    onConfirmAddPhoto={(rows = 1, cols = 1) => {
                      setPendingPhotoTool(false);
                      applyPhotoGridLayout(rows, cols);
                    }}
                    onCancelPhotoTool={() => setPendingPhotoTool(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Frame Info bottom sheet */}
          {showMobileInfo && (
            <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
              <div
                style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
                onClick={() => setShowMobileInfo(false)}
              />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "#fff", borderRadius: "24px 24px 0 0",
                paddingBottom: "calc(24px + env(safe-area-inset-bottom,0px))",
                boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 20px 10px", borderBottom: "1px solid #f0e6e0",
                }}>
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#1a1a2e" }}>📋 Info Frame</h2>
                  <button
                    type="button"
                    onClick={() => setShowMobileInfo(false)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: "4px" }}
                  ><X size={20} /></button>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Nama Frame *</label>
                    <input
                      type="text"
                      value={frameName}
                      onChange={(e) => setFrameName(e.target.value)}
                      placeholder="contoh: FremioSeries-Blue-6"
                      style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Deskripsi</label>
                    <textarea
                      value={frameDescription}
                      onChange={(e) => setFrameDescription(e.target.value)}
                      placeholder="Deskripsi singkat frame kamu..."
                      rows={3}
                      style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", resize: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ padding: "10px", background: "#f0f5ff", borderRadius: "8px", fontSize: "12px", color: "#4f46e5" }}>
                    ℹ️ Kategori ditentukan oleh admin saat frame disetujui.
                  </div>
                  {!adminPreviewId && (
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={() => { handleSaveDraft(); setShowMobileInfo(false); }}
                        disabled={savingDraft || saving}
                        style={{
                          flex: 1, padding: "12px", borderRadius: "12px", border: "none",
                          background: isDirty ? "linear-gradient(135deg,#e0b7a9,#c89585)" : "#f0e6e0",
                          color: isDirty ? "#2c1508" : "#a09090",
                          fontWeight: "700", fontSize: "14px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        }}
                      >
                        <Save size={16} />
                        {savingDraft ? "Menyimpan..." : isDirty ? "Simpan Draft" : "Draft Tersimpan ✓"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowSubmitConfirm(true); setShowMobileInfo(false); }}
                        disabled={saving}
                        style={{
                          flex: 1, padding: "12px", borderRadius: "12px", border: "none",
                          background: "linear-gradient(135deg,#4ade80,#16a34a)",
                          color: "#fff", fontWeight: "700", fontSize: "14px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        }}
                      >
                        <Send size={16} />{saving ? "Mengirim..." : "Submit"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Bottom Toolbar */}
          <nav className="create-mobile-toolbar" style={{ overflowX: "auto", justifyContent: "flex-start" }}>
            {toolButtons.map((button) => {
              const IconComponent = button.icon;
              return (
                <button
                  key={button.id}
                  type="button"
                  onClick={() => {
                    setShowMobileInfo(false);
                    button.onClick();
                    // Auto-open properties for all tools except upload (which just opens file picker)
                    if (button.id !== "upload") {
                      setShowMobileProps(true);
                    }
                  }}
                  className={`create-mobile-toolbar__button ${button.isActive ? "create-mobile-toolbar__button--active" : ""}`}
                >
                  <IconComponent size={20} strokeWidth={2.4} />
                  <span>{button.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { setShowMobileProps(false); setShowMobileInfo((p) => !p); }}
              className={`create-mobile-toolbar__button ${showMobileInfo ? "create-mobile-toolbar__button--active" : ""}`}
            >
              <FileText size={20} strokeWidth={2.4} />
              <span>Info Frame</span>
            </button>
          </nav>
        </>
      )}

      {/* ── Editor Tutorial Overlay ─────────────────────────────────────── */}
      {showEditorTutorial && (() => {
        const step = EDITOR_TUTORIAL_STEPS[editorTutorialStep];
        const isLast = editorTutorialStep === EDITOR_TUTORIAL_STEPS.length - 1;
        const closeAll = () => {
          localStorage.setItem(EDITOR_TUTORIAL_KEY, "seen");
          setShowEditorTutorial(false);
        };
        const next = () => {
          if (isLast) { closeAll(); return; }
          setEditorTutorialStep((s) => s + 1);
        };
        const prev = () => setEditorTutorialStep((s) => s - 1);

        // Compute tooltip position relative to spotlight — clamped to viewport
        const TOOLTIP_W = 300;
        const TOOLTIP_EST_H = 320; // estimated max height
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 14;

        let tooltipStyle = {
          position: "fixed",
          zIndex: 10002,
          width: `${TOOLTIP_W}px`,
          maxHeight: `${vh - 32}px`,
          overflowY: "auto",
          background: "#fff",
          borderRadius: "16px",
          padding: "20px",
          boxShadow: "0 16px 48px rgba(74,48,43,0.22), 0 0 0 1.5px #e0b7a9",
        };

        if (!tutorialSpotlight || step.position === "center") {
          tooltipStyle = { ...tooltipStyle, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
        } else {
          const s = tutorialSpotlight;
          let top, left;

          if (step.position === "right") {
            left = s.left + s.width + margin;
            top = s.top + s.height / 2 - TOOLTIP_EST_H / 2;
          } else if (step.position === "left") {
            left = s.left - TOOLTIP_W - margin;
            top = s.top + s.height / 2 - TOOLTIP_EST_H / 2;
          } else if (step.position === "top") {
            left = s.left + s.width / 2 - TOOLTIP_W / 2;
            top = s.top - TOOLTIP_EST_H - margin;
          } else {
            left = s.left + s.width / 2 - TOOLTIP_W / 2;
            top = s.top + s.height + margin;
          }

          // If tooltip would go off right edge, flip to left
          if (left + TOOLTIP_W > vw - 8) left = s.left - TOOLTIP_W - margin;
          // If tooltip would go off left edge, push right
          if (left < 8) left = s.left + s.width + margin;
          // Clamp horizontal within viewport
          left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));
          // Clamp vertical: if bottom overflows, push up
          if (top + TOOLTIP_EST_H > vh - 8) top = vh - TOOLTIP_EST_H - 8;
          top = Math.max(8, top);

          tooltipStyle = { ...tooltipStyle, top, left };
        }

        return (
          <>
            {/* Dim overlay — pointer-events:none so user can still interact */}
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9998, pointerEvents: "none", transition: "all 0.3s" }} />

            {/* Spotlight ring around target */}
            {tutorialSpotlight && (
              <div style={{
                position: "fixed",
                top: tutorialSpotlight.top,
                left: tutorialSpotlight.left,
                width: tutorialSpotlight.width,
                height: tutorialSpotlight.height,
                borderRadius: "10px",
                zIndex: 9999,
                pointerEvents: "none",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                border: "2.5px solid #e0b7a9",
                transition: "all 0.3s ease",
              }} />
            )}

            {/* Tooltip card */}
            <div style={tooltipStyle}>
              {/* Close button */}
              <button onClick={closeAll} style={{ position: "absolute", top: "10px", right: "12px", background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#9b7b73", lineHeight: 1, zIndex: 1 }}>✕</button>

              {/* Step dots */}
              <div style={{ display: "flex", gap: "5px", marginBottom: "14px" }}>
                {EDITOR_TUTORIAL_STEPS.map((_, i) => (
                  <div key={i} style={{ width: i === editorTutorialStep ? "18px" : "7px", height: "7px", borderRadius: "3.5px", background: i === editorTutorialStep ? "#c89585" : "#e0b7a9", transition: "width 0.2s" }} />
                ))}
              </div>

              <div style={{ fontSize: "28px", marginBottom: "8px" }}>{step.icon}</div>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 800, color: "#4a302b", lineHeight: 1.3 }}>{step.title}</h3>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#7c5a53", lineHeight: 1.6 }}>{step.body}</p>

              {step.cta && (
                <div style={{ padding: "8px 12px", background: "#fdf0eb", borderRadius: "8px", fontSize: "12px", color: "#c07055", fontWeight: 700, marginBottom: "12px", border: "1px dashed #e0b7a9" }}>
                  {step.cta}
                </div>
              )}

              <p style={{ textAlign: "right", fontSize: "11px", color: "#c4a39b", margin: "0 0 10px" }}>{editorTutorialStep + 1} / {EDITOR_TUTORIAL_STEPS.length}</p>

              <div style={{ display: "flex", gap: "8px" }}>
                {editorTutorialStep > 0 && (
                  <button onClick={prev} style={{ flex: 1, padding: "9px", borderRadius: "8px", border: "1.5px solid #e0b7a9", background: "#fff", color: "#c07055", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>← Kembali</button>
                )}
                <button onClick={next} style={{ flex: 2, padding: "9px", borderRadius: "8px", border: "none", background: "linear-gradient(to right, #e0b7a9, #c89585)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  {isLast ? "Mulai Berkarya! 🎨" : "Selanjutnya →"}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
