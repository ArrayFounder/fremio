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
import { useNavigate } from "react-router-dom";
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

const panelMotion = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function DesignerEditor() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const uploadPurposeRef = useRef("upload");
  const previewFrameRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const [saving, setSaving] = useState(false);
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

  // Reset store on mount
  useEffect(() => {
    setElements([]);
    setCanvasBackground("#f7f1ed");
  }, []);

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

      // Capture canvas thumbnail
      let thumbnailDataUrl = null;
      if (previewFrameRef.current) {
        try {
          const canvas = await html2canvas(previewFrameRef.current, {
            scale: 1,
            useCORS: true,
            allowTaint: true,
            backgroundColor: canvasBackground || "#ffffff",
          });
          thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.7);
        } catch (err) {
          console.warn("Could not capture canvas thumbnail:", err);
        }
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
        localStorage.getItem("fremio_token") ||
        localStorage.getItem("designer_token");

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

      const frameData = {
        elements: otherElements,
        slots,
        canvasBackground,
        canvasWidth,
        canvasHeight,
        aspectRatio: canvasAspectRatio,
        // Background photo is designer's preview only — not stored in template
      };

      const res = await fetch(`${API_URL}/designer/submissions`, {
        method: "POST",
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
        showToast("success", "Frame berhasil disubmit! Menunggu review admin...", 3000);
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
