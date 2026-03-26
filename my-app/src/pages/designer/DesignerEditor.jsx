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
import "../Create.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";

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

export default function DesignerEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editSubmissionId = searchParams.get("edit");
  const draftId = searchParams.get("draft");
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const uploadPurposeRef = useRef("upload");
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
  const [showCanvasSizeInProperties, setShowCanvasSizeInProperties] = useState(false);
  const [gradientColor1, setGradientColor1] = useState("#667eea");
  const [gradientColor2, setGradientColor2] = useState("#764ba2");
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(false);
  const [pendingPhotoTool, setPendingPhotoTool] = useState(false);
  const [previewConstraints, setPreviewConstraints] = useState({ maxWidth: 280, maxHeight: 500 });

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
  useEffect(() => {
    readyRef.current = false;
    setIsDirty(false);

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
      setCanvasBackground("#f7f1ed");
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
  }, [editSubmissionId, draftId]);

  // Track unsaved changes (skip during initial load)
  useEffect(() => {
    if (!readyRef.current) return;
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
    const [w, h] = ratio.split(":").map(Number);
    if (!w || !h) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    if (h >= w) return { width: CANVAS_WIDTH, height: Math.round((CANVAS_WIDTH * h) / w) };
    return { width: Math.round((CANVAS_HEIGHT * w) / h), height: CANVAS_HEIGHT };
  }, []);

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
          showToast("success", "Background foto diperbarui.", 2200);
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
        onClick: () => { setShowCanvasSizeInProperties((prev) => !prev); clearSelection(); },
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
        isActive: selectedElementId === "background",
        onClick: () => { setShowCanvasSizeInProperties(false); selectElement("background"); },
      },
      {
        id: "photo",
        icon: ImageIcon,
        label: "Area Foto",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); setPendingPhotoTool(true); clearSelection(); },
      },
      {
        id: "text",
        icon: TypeIcon,
        label: "Add Text",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); addElement("text"); },
      },
      {
        id: "shape",
        icon: Shapes,
        label: "Shape",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); addElement("shape"); },
      },
      {
        id: "upload",
        icon: UploadCloud,
        label: "Unggahan",
        isActive: false,
        onClick: () => { setShowCanvasSizeInProperties(false); triggerUpload(); },
      },
    ],
    [showCanvasSizeInProperties, selectedElementId, addElement, selectElement, clearSelection, triggerUpload]
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
    <div className="create-page">
      {/* Back button */}
      <div style={{ marginBottom: "12px" }}>
        <button
          type="button"
          onClick={() => safeNavigate("/designer/dashboard")}
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
          ← Dashboard
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
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

      <div className="create-grid">
        {/* Tools Panel */}
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
                type="text"
                value={frameName}
                onChange={(e) => setFrameName(e.target.value)}
                placeholder="contoh: FremioSeries-Blue-6"
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
        </Motion.aside>

        {/* Preview */}
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
                  if (id === null) {
                    clearSelection();
                  } else if (id === "background") {
                    if (isBackgroundLocked) {
                      showToast("info", "Background dikunci.", 2000);
                      return;
                    }
                    selectElement("background");
                  } else {
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

          {/* Save Draft Button */}
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
              marginTop: "10px",
              fontSize: "14px",
            }}
          >
            <Save size={16} strokeWidth={2.5} />
            {savingDraft ? "Menyimpan..." : isDirty ? "Simpan Draft" : "Draft Tersimpan ✓"}
          </Motion.button>

          {/* Submit Button */}
          <Motion.button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="create-save"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -3 }}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
        </Motion.section>

        {/* Properties Panel */}
        <Motion.aside
          variants={panelMotion}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="create-panel create-panel--properties"
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
              onConfirmAddPhoto={(rows = 1, cols = 1) => {
                setPendingPhotoTool(false);
                const canvasW = CANVAS_WIDTH;
                const canvasH = CANVAS_HEIGHT;
                const gapX = 30,
                  gapY = 30;
                const marginX = 65,
                  marginY = 140;
                const availableWidth =
                  canvasW - 2 * marginX - (cols - 1) * gapX;
                const availableHeight =
                  canvasH - 2 * marginY - (rows - 1) * gapY;
                const photoWidth = Math.floor(availableWidth / cols);
                const photoHeight = Math.floor(availableHeight / rows);

                let lastAddedId = null;
                for (let row = 0; row < rows; row++) {
                  for (let col = 0; col < cols; col++) {
                    const x = marginX + col * (photoWidth + gapX);
                    const y = marginY + row * (photoHeight + gapY);
                    const newId = addElement("photo", {
                      x,
                      y,
                      width: photoWidth,
                      height: photoHeight,
                    });
                    if (newId) lastAddedId = newId;
                  }
                }
                if (lastAddedId) selectElement(lastAddedId);
              }}
              onCancelPhotoTool={() => setPendingPhotoTool(false)}
            />
          </div>
        </Motion.aside>
      </div>
    </div>
  );
}
