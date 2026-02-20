/**
 * UploadFrame - Admin page for uploading frames
 * UI identical to Create.jsx but with Upload Frame functionality
 */
import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Upload,
  ArrowLeft,
} from "lucide-react";
import CanvasPreview from "../../components/creator/CanvasPreview.jsx";
import PropertiesPanel from "../../components/creator/PropertiesPanel.jsx";
import ColorPicker from "../../components/creator/ColorPicker.jsx";
import useCreatorStore from "../../store/useCreatorStore.js";
import { useShallow } from "zustand/react/shallow";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "../../components/creator/canvasConstants.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import unifiedFrameService from "../../services/unifiedFrameService";
import { VPS_API_URL, getUploadsBaseUrl } from "../../config/backend";
import "../Create.css";

const panelMotion = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

// Helper: Compress image data URL to reduce size
const compressImageDataUrl = async (dataUrl, quality = 0.7, maxDimension = 800) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // Fallback to original
    img.src = dataUrl;
  });
};

// Helper: Upload overlay with retry mechanism
const uploadOverlayWithRetry = async (dataUrl, elementId, token, maxRetries = 2) => {
  const uploadAttempt = async (attempt) => {
    const originalBlob = await (await fetch(dataUrl)).blob();
    const compressBlob = async (inputBlob) => {
      try {
        const MAX_W = 1080;
        const MAX_H = 1920;
        const bitmap = await createImageBitmap(inputBlob);
        const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
        const targetW = Math.max(1, Math.round(bitmap.width * scale));
        const targetH = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return inputBlob;
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        const toBlob = (type, quality) =>
          new Promise((resolve) => {
            try {
              canvas.toBlob((b) => resolve(b), type, quality);
            } catch {
              resolve(null);
            }
          });
        const out =
          (await toBlob('image/webp', 0.82)) ||
          (await toBlob('image/jpeg', 0.82)) ||
          (await toBlob('image/png', 0.92));
        return out || inputBlob;
      } catch {
        return inputBlob;
      }
    };
    const blob = await compressBlob(originalBlob);
    const HARD_MAX = 50 * 1024 * 1024; // 50MB
    if (blob.size > HARD_MAX) {
      throw new Error(`Overlay terlalu besar (${Math.round(blob.size / 1024 / 1024)}MB). Maksimal 50MB.`);
    }
    const mimeType = blob.type || 'image/webp';
    const ext = (mimeType.split('/')[1] || 'webp').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const file = new File([blob], `overlay_${Date.now()}.${ext || 'webp'}`, { type: mimeType });
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`${VPS_API_URL}/upload/overlay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const msg = payload?.error || payload?.message || `Upload failed with status ${response.status}`;
      throw new Error(msg);
    }
    const imagePath = payload.imagePath || payload.image_path;
    if (!imagePath) throw new Error('Upload succeeded but no imagePath returned');
    return imagePath.startsWith('http') ? imagePath : `${getUploadsBaseUrl()}${imagePath}`;
  };

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Uploading overlay ${elementId.substring(0, 8)} (attempt ${attempt}/${maxRetries})...`);
      const url = await uploadAttempt(attempt);
      console.log(`✅ Overlay uploaded successfully on attempt ${attempt}`);
      return { success: true, url };
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Upload failed (attempt ${attempt}/${maxRetries}):`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  return { success: false, error: lastError?.message || 'Upload failed' };
};

// Available categories
const AVAILABLE_CATEGORIES = [
  "Christmas Fremio Series",
  "Holiday Fremio Series",
  "Year-End Recap Fremio Series",
  "Fremio Series",
  "Self-love",
  "Cute Characters",
  "Romance",
  "Aesthetic Scrapbook & Retro",
  "Minimalist Doodles & Soft Colors",
  "Wedding",
  "Birthday",
  "Graduation",
  "Event",
  "Music",
  "Custom",
];

const normalizeAspectRatioString = (raw) => {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace("/", ":")
    .replace("x", ":")
    .replace(/\s+/g, "");

  if (normalized === "photostrip" || normalized === "4r") return "2:3";
  if (/^\d+\:\d+$/.test(normalized)) return normalized;
  return "";
};

const computeCanvasDimensionsFromRatio = (ratio) => {
  const safe = normalizeAspectRatioString(ratio);
  if (!safe) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  const [w, h] = safe.split(":").map(Number);
  if (!w || !h) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  if (h >= w) {
    return { width: CANVAS_WIDTH, height: Math.round((CANVAS_WIDTH * h) / w) };
  }
  return { width: Math.round((CANVAS_HEIGHT * w) / h), height: CANVAS_HEIGHT };
};

const inferAspectRatioFromFrame = (frame) => {
  const direct = normalizeAspectRatioString(
    frame?.layout?.aspectRatio ??
      frame?.layout?.aspect_ratio ??
      frame?.aspectRatio ??
      frame?.aspect_ratio
  );
  if (direct) return direct;

  const cw = Number(
    frame?.canvasWidth ??
      frame?.canvas_width ??
      frame?.layout?.canvasWidth ??
      frame?.layout?.canvas_width
  );
  const ch = Number(
    frame?.canvasHeight ??
      frame?.canvas_height ??
      frame?.layout?.canvasHeight ??
      frame?.layout?.canvas_height
  );
  if (Number.isFinite(cw) && Number.isFinite(ch) && cw > 0 && ch > 0) {
    const gcd = (a, b) => {
      let x = Math.abs(Math.round(a));
      let y = Math.abs(Math.round(b));
      while (y) {
        const t = y;
        y = x % y;
        x = t;
      }
      return x || 1;
    };
    const g = gcd(cw, ch);
    const rw = Math.round(cw / g);
    const rh = Math.round(ch / g);
    if (rw > 0 && rh > 0) return `${rw}:${rh}`;
  }

  return "9:16";
};

export default function UploadFrame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editFrameId = searchParams.get("edit");

  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const uploadPurposeRef = useRef("upload");
  const toastTimeoutRef = useRef(null);
  const previewFrameRef = useRef(null);

  // State
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [toast, setToast] = useState(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [activeMobileProperty, setActiveMobileProperty] = useState(null);
  const [showCanvasSizeInProperties, setShowCanvasSizeInProperties] = useState(false);
  const [gradientColor1, setGradientColor1] = useState("#667eea");
  const [gradientColor2, setGradientColor2] = useState("#764ba2");
  const [canvasAspectRatio, setCanvasAspectRatio] = useState("9:16");
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(false);
  const [pendingPhotoTool, setPendingPhotoTool] = useState(false);
  const [previewConstraints, setPreviewConstraints] = useState({
    maxWidth: 460,
    maxHeight: 480,
  });

  // Frame metadata
  const [frameName, setFrameName] = useState("");
  const [frameDescription, setFrameDescription] = useState("");
  const [frameCategories, setFrameCategories] = useState(["Fremio Series"]);
  const [hideAfterUpload, setHideAfterUpload] = useState(true);

  // Toast helper
  const showToast = useCallback((type, message, duration = 3200) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  // Creator store
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

  // Initialize/reset on mount or load frame for edit
  useEffect(() => {
    const loadFrameForEdit = async () => {
      if (editFrameId) {
        setLoadingFrame(true);
        setIsEditMode(true);
        try {
          const frame = await unifiedFrameService.getFrameById(editFrameId);
          if (frame) {
            const targetAspectRatio = inferAspectRatioFromFrame(frame);
            setCanvasAspectRatio(targetAspectRatio);
            const { width: targetCanvasWidth, height: targetCanvasHeight } =
              computeCanvasDimensionsFromRatio(targetAspectRatio);

            setFrameName(frame.name || "");
            setFrameDescription(frame.description || "");
            setHideAfterUpload(!!(frame?.isHidden ?? frame?.is_hidden));
            if (frame.categories && Array.isArray(frame.categories)) {
              setFrameCategories(frame.categories);
            } else if (frame.category) {
              setFrameCategories(frame.category.split(", ").map((c) => c.trim()));
            }
            if (frame.canvasBackground || frame.layout?.backgroundColor) {
              setCanvasBackground(frame.canvasBackground || frame.layout?.backgroundColor || "#f7f1ed");
            }

            const newElements = [];

            // NOTE: Do NOT load imagePath as background-photo when editing!
            // The imagePath is just a preview/thumbnail of the complete frame.
            // Instead, we reconstruct the canvas from:
            // 1. Photo slots (from frame.slots)
            // 2. Overlay/upload elements (from frame.layout.elements)
            // 
            // If user wants a background image, they should add it via the Background tool.

            // Add photo slots
            if (frame.slots && Array.isArray(frame.slots)) {
              frame.slots.forEach((slot, index) => {
                newElements.push({
                  id: slot.id || `photo_${index + 1}`,
                  type: "photo",
                  x: slot.left * targetCanvasWidth,
                  y: slot.top * targetCanvasHeight,
                  width: slot.width * targetCanvasWidth,
                  height: slot.height * targetCanvasHeight,
                  rotation: typeof slot.rotation === "number" ? slot.rotation : 0,
                  zIndex: 1,
                  data: {
                    photoIndex: slot.photoIndex !== undefined ? slot.photoIndex : index,
                    borderRadius: slot.borderRadius || 0,
                  },
                });
              });
            }

            // Restore other elements (overlays, text, shapes, uploads)
            if (frame.layout?.elements && Array.isArray(frame.layout.elements)) {
              console.log("📦 [EDIT] Restoring layout elements:", frame.layout.elements.length);
              
              // Validate overlay URLs first
              const validatedElements = await Promise.all(
                frame.layout.elements.map(async (el, idx) => {
                  if (el.type === "upload" && el.data?.image && !el.data.image.startsWith('data:')) {
                    try {
                      const response = await fetch(el.data.image, { method: 'HEAD', cache: 'no-cache' });
                      if (!response.ok) {
                        console.warn(`⚠️ Overlay ${el.id} URL broken (${response.status})`);
                        return {
                          ...el,
                          data: {
                            ...el.data,
                            image: null,
                            _imageUrlBroken: true,
                            _originalImageUrl: el.data.image,
                            label: 'Overlay (URL broken - re-upload needed)'
                          }
                        };
                      }
                    } catch (error) {
                      console.warn(`⚠️ Overlay ${el.id} URL unreachable:`, error.message);
                      return {
                        ...el,
                        data: {
                          ...el.data,
                          image: null,
                          _imageUrlBroken: true,
                          _originalImageUrl: el.data.image,
                          label: 'Overlay (Unreachable - re-upload needed)'
                        }
                      };
                    }
                  }
                  return el;
                })
              );
              
              validatedElements.forEach((el, idx) => {
                const imageSize = el.data?.image ? (el.data.image.length * 0.75) / 1024 : 0;
                console.log(`  Element ${idx}: type=${el.type}, id=${el.id?.substring(0, 8)}, zIndex=${el.zIndex}, imageSize=${imageSize.toFixed(0)}KB`);
                
                let restoredWidth =
                  el.widthNorm !== undefined
                    ? el.widthNorm * targetCanvasWidth
                    : el.width;
                let restoredHeight =
                  el.heightNorm !== undefined
                    ? el.heightNorm * targetCanvasHeight
                    : el.height;

                if (el.type === "upload" && el.data?.imageAspectRatio) {
                  restoredHeight = restoredWidth / el.data.imageAspectRatio;
                }

                // Ensure upload elements have higher zIndex than photo slots
                // Photo slots have zIndex: 1, overlays should be on top
                const restoredZIndex = el.type === "upload" 
                  ? Math.max(el.zIndex || 100, 100)  // Overlays at zIndex 100+
                  : Math.max(el.zIndex || 10, 10);

                // For upload elements, validate image data URL size and convert relative URLs to full URLs
                let cleanData = { ...el.data };
                if (el.type === "upload" && el.data?.image) {
                  // If image is a relative path, convert to full URL using UPLOADS_BASE_URL
                  if (el.data.image.startsWith('/uploads/')) {
                    cleanData.image = `${getUploadsBaseUrl()}${el.data.image}`;
                    console.log(`  ✅ Converted relative URL to: ${cleanData.image}`);
                  }
                  // Check if it's a data URL (base64)
                  else if (el.data.image.startsWith('data:')) {
                    const dataUrlSizeKB = (el.data.image.length * 0.75) / 1024;
                    // Show warning for large images but KEEP them
                    if (dataUrlSizeKB > 1024) {
                      console.warn(`  ⚠️ Upload element image large (${dataUrlSizeKB.toFixed(0)}KB) - consider compressing`);
                      cleanData = {
                        ...cleanData,
                        _imageLarge: true,
                        _imageSizeKB: Math.round(dataUrlSizeKB)
                      };
                    }
                  }
                }

                const restoredElement = {
                  ...el,
                  x: el.xNorm !== undefined ? el.xNorm * targetCanvasWidth : el.x,
                  y: el.yNorm !== undefined ? el.yNorm * targetCanvasHeight : el.y,
                  width: restoredWidth,
                  height: restoredHeight,
                  zIndex: restoredZIndex,
                  data: cleanData,
                };
                delete restoredElement.xNorm;
                delete restoredElement.yNorm;
                delete restoredElement.widthNorm;
                delete restoredElement.heightNorm;
                newElements.push(restoredElement);
                
                console.log(`  ✅ Restored: zIndex=${restoredZIndex}, size=${restoredWidth}x${restoredHeight}`);
              });
            }

            console.log("📦 [EDIT] Total elements restored:", newElements.length);
            setElements(newElements);
            
            // Check if frame has overlay elements and if any are broken
            const hasOverlays = frame.layout?.elements && frame.layout.elements.length > 0;
            const brokenOverlays = newElements.filter(el => el.data?._imageUrlBroken);
            
            if (brokenOverlays.length > 0) {
              showToast(
                "warning", 
                `Frame "${frame.name}" dimuat. ⚠️ ${brokenOverlays.length} overlay tidak dapat dimuat - silakan upload ulang.`,
                6000
              );
            } else if (hasOverlays) {
              showToast("success", `Frame "${frame.name}" dimuat dengan ${frame.layout.elements.length} overlay`);
            } else {
              showToast("info", `Frame "${frame.name}" dimuat. Overlay tidak ditemukan - tambahkan ulang jika diperlukan.`);
            }
          } else {
            showToast("error", "Frame tidak ditemukan");
            setIsEditMode(false);
          }
        } catch (error) {
          console.error("Error loading frame:", error);
          showToast("error", "Gagal memuat frame: " + error.message);
          setIsEditMode(false);
        } finally {
          setLoadingFrame(false);
        }
      } else {
        // New frame mode - reset
        setElements([]);
        setCanvasBackground("#f7f1ed");
        setCanvasAspectRatio("9:16");
        clearSelection();
        setIsEditMode(false);
      }
    };

    loadFrameForEdit();
  }, [editFrameId]);

  // Detect mobile view
  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handleChange = (event) => setIsMobileView(event.matches);
    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isMobileView) {
      setActiveMobileProperty(null);
    } else if (!selectedElementId) {
      setActiveMobileProperty(null);
    }
  }, [isMobileView, selectedElementId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Selected element
  const selectedElement = useMemo(() => {
    if (selectedElementId === "background") return "background";
    return elements.find((el) => el.id === selectedElementId) || null;
  }, [elements, selectedElementId]);

  const selectedElementObject = selectedElement && selectedElement !== "background" ? selectedElement : null;
  const isBackgroundSelected = selectedElement === "background";
  const isMobilePropertyToolbar = isMobileView && (isBackgroundSelected || Boolean(selectedElementObject));

  // Background photo element
  const backgroundPhotoElement = useMemo(
    () => elements.find((el) => el.type === "background-photo") || null,
    [elements]
  );

  // Canvas dimensions
  const getCanvasDimensions = useCallback((ratio) => {
    if (typeof ratio !== "string") return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const [w, h] = ratio.split(":").map(Number);
    if (!w || !h) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    if (h >= w) {
      return { width: CANVAS_WIDTH, height: Math.round((CANVAS_WIDTH * h) / w) };
    }
    return { width: Math.round((CANVAS_HEIGHT * w) / h), height: CANVAS_HEIGHT };
  }, []);

  // Category toggle
  const toggleCategory = (category) => {
    setFrameCategories((prev) => {
      if (prev.includes(category)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== category);
      }
      return [...prev, category];
    });
  };

  // File upload handlers
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

  // Listen for background upload requests
  useEffect(() => {
    const handleBackgroundUploadRequest = () => triggerBackgroundUpload();
    window.addEventListener("creator:request-background-upload", handleBackgroundUploadRequest);
    return () => window.removeEventListener("creator:request-background-upload", handleBackgroundUploadRequest);
  }, [triggerBackgroundUpload]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast("error", "File harus berupa gambar", 2500);
      return;
    }

    // ✅ NO FILE SIZE LIMIT - Support for large files (updated 2026-02-16 v2)
    // VERIFIED FIX: All validations removed from frontend and backend
    console.log(`✅ [UPLOAD] File accepted: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === "string") {
        if (uploadPurposeRef.current === "background") {
          const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(canvasAspectRatio);
          addBackgroundPhoto(dataUrl, { canvasWidth, canvasHeight });
          showToast("success", "Background foto diperbarui.", 2200);
        } else {
          addUploadElement(dataUrl);
          showToast("success", "Elemen unggahan ditambahkan.", 2200);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Lock/unlock background
  const toggleBackgroundLock = useCallback(() => {
    setIsBackgroundLocked((prev) => !prev);
    showToast("success", isBackgroundLocked ? "Background unlocked" : "Background locked", 1500);
  }, [isBackgroundLocked, showToast]);

  // Reset background
  const resetBackground = useCallback(() => {
    if (backgroundPhotoElement) {
      removeElement(backgroundPhotoElement.id);
    }
    setCanvasBackground("#f7f1ed");
    clearSelection();
  }, [backgroundPhotoElement, removeElement, setCanvasBackground, clearSelection]);

  // Tool buttons
  const toolButtons = useMemo(
    () => [
      {
        id: "canvas-size",
        icon: Maximize2,
        label: "Ukuran Canvas",
        mobileLabel: "Ukuran",
        isActive: showCanvasSizeInProperties,
        onClick: () => {
          setShowCanvasSizeInProperties((prev) => !prev);
          clearSelection();
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
        mobileLabel: "BG",
        isActive: selectedElementId === "background",
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          selectElement("background");
        },
      },
      {
        id: "photo",
        icon: ImageIcon,
        label: "Area Foto",
        mobileLabel: "Foto",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          setPendingPhotoTool(true);
          clearSelection();
        },
      },
      {
        id: "text",
        icon: TypeIcon,
        label: "Add Text",
        mobileLabel: "Teks",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          addElement("text");
        },
      },
      {
        id: "shape",
        icon: Shapes,
        label: "Shape",
        mobileLabel: "Shape",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          addElement("shape");
        },
      },
      {
        id: "upload",
        icon: UploadCloud,
        label: "Unggahan",
        mobileLabel: "Upload",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          triggerUpload();
        },
      },
    ],
    [showCanvasSizeInProperties, selectedElementId, addElement, selectElement, clearSelection, triggerUpload]
  );

  // Mobile property buttons
  const mobilePropertyButtons = useMemo(() => {
    if (!isMobilePropertyToolbar) return [];

    if (isBackgroundSelected) {
      return [
        { id: "background-color", label: "Warna", icon: Palette },
        { id: "background-photo", label: backgroundPhotoElement ? "Foto" : "Tambah Foto", icon: ImageIcon },
      ];
    }

    if (!selectedElementObject) return [];

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
          { id: "layer-order", label: "Lapisan", icon: Layers },
        ];
      case "upload":
        return [
          { id: "photo-color", label: "Warna", icon: Palette },
          { id: "photo-fit", label: "Gaya", icon: Settings2 },
          { id: "photo-size", label: "Ukuran", icon: Maximize2 },
          { id: "photo-radius", label: "Sudut", icon: CornerDownRight },
          { id: "upload-outline", label: "Outline", icon: Square },
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
  }, [isMobilePropertyToolbar, isBackgroundSelected, backgroundPhotoElement, selectedElementObject]);

  // Handle tool button press
  const handleToolButtonPress = useCallback(
    (button) => {
      if (typeof button.onClick === "function") {
        button.onClick();
      }
    },
    []
  );

  // Handle element dimension change
  const handleElementDimensionChange = useCallback(
    (dimension, value) => {
      if (!selectedElementObject) return;
      const numValue = Number(value);
      if (!Number.isFinite(numValue) || numValue < 20) return;
      updateElement(selectedElementObject.id, { [dimension]: numValue });
    },
    [selectedElementObject, updateElement]
  );

  // Upload frame handler
  const handleUploadFrame = async () => {
    if (saving) return;

    // Check if user is authenticated
    const token = localStorage.getItem('fremio_token');
    if (!token) {
      showToast("error", "Sesi anda telah berakhir. Silakan login ulang.");
      navigate('/login');
      return;
    }

    // Validation
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

      const uploadDataUrlToBackend = async (dataUrl) => {
        // IMPORTANT: Do NOT send base64 to backend (can exceed JSON size limits and trigger 413)
        // Upload as multipart to /api/upload/frame instead.
        const token = localStorage.getItem('fremio_token') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No token provided');

        const originalBlob = await (await fetch(dataUrl)).blob();

        const compressBlob = async (inputBlob) => {
          try {
            // Resize overlays to a sane maximum (canvas-sized) and compress.
            const MAX_W = 1080;
            const MAX_H = 1920;

            const bitmap = await createImageBitmap(inputBlob);
            const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
            const targetW = Math.max(1, Math.round(bitmap.width * scale));
            const targetH = Math.max(1, Math.round(bitmap.height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return inputBlob;

            ctx.drawImage(bitmap, 0, 0, targetW, targetH);

            const toBlob = (type, quality) =>
              new Promise((resolve) => {
                try {
                  canvas.toBlob((b) => resolve(b), type, quality);
                } catch {
                  resolve(null);
                }
              });

            // Prefer WebP/JPEG for much smaller payloads.
            const out =
              (await toBlob('image/webp', 0.82)) ||
              (await toBlob('image/jpeg', 0.82)) ||
              (await toBlob('image/png', 0.92));

            return out || inputBlob;
          } catch {
            return inputBlob;
          }
        };

        const blob = await compressBlob(originalBlob);

        // If compression didn't help, still try uploading; but cap extreme sizes to avoid 413.
        const HARD_MAX = 50 * 1024 * 1024; // 50MB
        if (blob.size > HARD_MAX) {
          throw new Error(`Overlay terlalu besar (${Math.round(blob.size / 1024 / 1024)}MB). Maksimal 50MB.`);
        }

        const mimeType = blob.type || 'image/webp';
        const ext = (mimeType.split('/')[1] || 'webp').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const file = new File([blob], `overlay_${Date.now()}.${ext || 'webp'}`, { type: mimeType });

        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${VPS_API_URL}/upload/overlay`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) {
          const msg = payload?.error || payload?.message || `Upload failed with status ${response.status}`;
          throw new Error(msg);
        }

        const imagePath = payload.imagePath || payload.image_path;
        if (!imagePath) throw new Error('Upload succeeded but no imagePath returned');

        // ✅ TRIGGER IMMEDIATE SYNC - Don't wait for cron job!
        try {
          console.log('🔄 Triggering uploads sync...');
          const syncResponse = await fetch(`${VPS_API_URL}/frames/sync-uploads`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (syncResponse.ok) {
            console.log('✅ Uploads synced immediately!');
          } else {
            console.warn('⚠️ Sync returned:', syncResponse.status);
          }
        } catch (syncError) {
          console.warn('⚠️ Sync trigger failed (will sync via cron):', syncError.message);
        }

        // Convert relative path to absolute URL pointing to API server
        // IMPORTANT: In production, VPS_API_URL is '/api' (relative), so we need getUploadsBaseUrl()
        // which resolves to 'https://api.fremio.id' for production at RUNTIME
        return imagePath.startsWith('http') ? imagePath : `${getUploadsBaseUrl()}${imagePath}`;
      };

      let frameImageDataUrl = null;
      let frameImageBlob = null;

      // CRITICAL: Clear selection before capturing to remove resize handles
      clearSelection();
      
      // Wait for React to re-render without selection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Always capture the entire canvas as frame thumbnail
      const canvasElement = document.getElementById('creator-canvas');
      if (canvasElement) {
        try {
          // Wait for all images to load before capturing
          const images = canvasElement.querySelectorAll('img');
          await Promise.all(
            Array.from(images).map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 3000);
              });
            })
          );
          
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Clone the canvas element to capture without transform issues
          const clone = canvasElement.cloneNode(true);
          
          // Reset all transforms and position for clean capture
          clone.style.position = 'fixed';
          clone.style.top = '0';
          clone.style.left = '0';
          clone.style.transform = 'none';
          clone.style.zIndex = '-9999';
          clone.style.visibility = 'visible';
          clone.style.opacity = '1';
          
          // Remove ALL selection indicators, resize handles, and UI elements from clone
          // This is a safety net - clearSelection() above should already remove them
          const elementsToRemove = clone.querySelectorAll([
            '[data-export-ignore]',
            '[data-export-ignore="true"]',
            '.react-rnd-handle',
            '.react-rnd-handle-top',
            '.react-rnd-handle-bottom',
            '.react-rnd-handle-left',
            '.react-rnd-handle-right',
            '.react-rnd-handle-topLeft',
            '.react-rnd-handle-topRight',
            '.react-rnd-handle-bottomLeft',
            '.react-rnd-handle-bottomRight',
            '.creator-resize-wrapper',
            '.creator-element--selected',
            '[style*="border: 2px solid"]', // Selection borders
          ].join(', '));
          elementsToRemove.forEach(el => el.remove());
          
          // Also remove any elements with selection styling
          clone.querySelectorAll('div').forEach(div => {
            // Remove selection border styling
            if (div.style.border && div.style.border.includes('solid') && div.style.border.includes('#f7a998')) {
              div.remove();
            }
          });
          
          document.body.appendChild(clone);
          
          const canvas = await html2canvas(clone, {
            // Keep output small to avoid nginx 413 on /api/upload/frame
            // (A 413 response usually misses CORS headers, showing as "Load failed")
            scale: 1,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            logging: false,
            imageTimeout: 10000,
            width: parseInt(canvasElement.style.width),
            height: parseInt(canvasElement.style.height),
          });
          
          // Remove clone
          document.body.removeChild(clone);
          
          // Downscale before encoding to keep upload small.
          // Many nginx setups default to ~1MB; keep well below that.
          const MAX_W = 540;
          const MAX_H = 960;
          let exportCanvas = canvas;
          if (canvas.width > MAX_W || canvas.height > MAX_H) {
            const ratio = Math.min(MAX_W / canvas.width, MAX_H / canvas.height, 1);
            const scaled = document.createElement('canvas');
            scaled.width = Math.max(1, Math.round(canvas.width * ratio));
            scaled.height = Math.max(1, Math.round(canvas.height * ratio));
            const ctx = scaled.getContext('2d');
            if (ctx) {
              ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
              exportCanvas = scaled;
            }
          }

          const toBlob = (type, quality) =>
            new Promise((resolve) => {
              try {
                exportCanvas.toBlob(
                  (b) => resolve(b),
                  type,
                  quality
                );
              } catch {
                resolve(null);
              }
            });

          // Prefer WebP/JPEG for smaller size; last resort PNG.
          frameImageBlob =
            (await toBlob("image/webp", 0.7)) ||
            (await toBlob("image/jpeg", 0.7)) ||
            (await toBlob("image/png"));

          // Some browsers may return null if type unsupported
          if (!frameImageBlob) {
            frameImageDataUrl = exportCanvas.toDataURL("image/png", 0.8);
            frameImageBlob = await (await fetch(frameImageDataUrl)).blob();
          }

          // If still too large for typical nginx limits, skip thumbnail upload.
          // Frame will still be saved (slots/layout) and can be edited later.
          const NGINX_SAFE_LIMIT = 900 * 1024; // ~900KB
          if (frameImageBlob?.size && frameImageBlob.size > NGINX_SAFE_LIMIT) {
            console.warn(
              '⚠️ Thumbnail still too large for nginx, skipping thumbnail upload:',
              frameImageBlob.size
            );
            frameImageBlob = null;
          }

          console.log("✅ Canvas captured successfully, size:", frameImageBlob.size);
        } catch (err) {
          console.error("Failed to capture canvas:", err);
          console.warn("Continuing without frame thumbnail");
        }
      }

      // Convert photo slots to normalized values
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

      // Collect non-photo elements (overlays, uploads, text, etc.)
      const otherElements = [];
      
      // DEBUG: Log all elements
      console.log("📦 [SAVE] All elements:", elements.length);
      elements.forEach((el, i) => {
        console.log(`  Element ${i}: type=${el.type}, id=${el.id?.substring(0, 8)}, hasImage=${!!el.data?.image}, zIndex=${el.zIndex}`);
      });
      
      const nonPhotoElements = elements.filter((e) => e.type !== "photo" && e.type !== "background-photo");
      console.log("📦 [SAVE] Non-photo elements to save:", nonPhotoElements.length);
      
      for (const el of nonPhotoElements) {
        // IMPORTANT: Mark upload elements as overlays and ensure high zIndex
        // So they render ABOVE photo slots in EditPhoto
        const isUploadOverlay = el.type === "upload";
        const overlayZIndex = isUploadOverlay ? Math.max(el.zIndex || 0, 500) : el.zIndex;
        
        const elementToSave = {
          ...el,
          zIndex: overlayZIndex, // Ensure overlay has high zIndex
          xNorm: el.x / canvasWidth,
          yNorm: el.y / canvasHeight,
          widthNorm: el.width / canvasWidth,
          heightNorm: el.height / canvasHeight,
          data: {
            ...el.data,
            __isOverlay: isUploadOverlay, // Mark as overlay for EditPhoto rendering
          }
        };

        // Upload overlay images to backend with retry and fallback
        const imageToUpload = el.data?.originalImage || el.data?.image;
        if (el.type === "upload" && imageToUpload && imageToUpload.startsWith("data:")) {
          const token = localStorage.getItem('fremio_token') || localStorage.getItem('auth_token');
          const uploadResult = await uploadOverlayWithRetry(imageToUpload, el.id, token);
          
          if (uploadResult.success) {
            const { originalImage, ...restData } = elementToSave.data || {};
            elementToSave.data = {
              ...restData,
              image: uploadResult.url,
              __isOverlay: true,
            };
            console.log(`✅ Overlay ${el.id.substring(0, 8)} uploaded: ${uploadResult.url.substring(0, 60)}...`);
          } else {
            // Fallback: compress and keep as data URL
            console.warn(`⚠️ Overlay ${el.id.substring(0, 8)} upload failed after retries, using compressed fallback`);
            try {
              const compressedDataUrl = await compressImageDataUrl(imageToUpload, 0.6, 800);
              const { originalImage, ...restData } = elementToSave.data || {};
              elementToSave.data = {
                ...restData,
                image: compressedDataUrl,
                __isOverlay: true,
                _uploadFailed: true,
                _uploadError: uploadResult.error
              };
              showToast(
                "warning",
                `Overlay ${el.id.substring(0, 8)} menggunakan fallback (upload gagal). Frame tetap tersimpan.`,
                4000
              );
            } catch (compressError) {
              console.error(`❌ Failed to compress overlay ${el.id}:`, compressError);
              throw new Error(
                `Upload overlay gagal dan fallback compression juga gagal: ${uploadResult.error}. ` +
                "Coba gunakan gambar yang lebih kecil."
              );
            }
          }
        }

        otherElements.push(elementToSave);
        console.log("📦 [SAVE] Added overlay element:", {
          id: el.id?.substring(0, 8),
          type: el.type,
          zIndex: elementToSave.zIndex,
          __isOverlay: elementToSave.data?.__isOverlay,
          hasImage: !!elementToSave.data?.image,
          imagePreview: elementToSave.data?.image?.substring(0, 60),
        });
      }

      console.log("📦 [SAVE] Final otherElements count:", otherElements.length);

      const frameData = {
        name: frameName.trim(),
        description: frameDescription.trim(),
        category: frameCategories.join(", "),
        categories: frameCategories,
        maxCaptures: photoElements.length,
        duplicatePhotos: false,
        is_hidden: hideAfterUpload,
        slots,
        createdBy: user?.email || "admin",
        canvasBackground,
        canvasWidth,
        canvasHeight,
        layout: {
          aspectRatio: canvasAspectRatio,
          orientation: "portrait",
          backgroundColor: canvasBackground,
          elements: otherElements,
        },
      };

      let result;
      if (isEditMode && editFrameId) {
        result = await unifiedFrameService.updateFrame(editFrameId, frameData, frameImageBlob);
        if (result.success) {
          showToast("success", `Frame "${frameName}" berhasil diupdate!`);
        }
      } else {
        // Frame can be created with or without image - slots are the important part
        result = await unifiedFrameService.createFrame(frameData, frameImageBlob);
        if (result.success) {
          showToast("success", `Frame "${frameName}" berhasil diupload!`);
        }
      }

      if (result.success) {
        setFrameName("");
        setFrameDescription("");
        setFrameCategories(["Fremio Series"]);
        setTimeout(() => navigate("/admin/frames"), 1500);
      } else {
        showToast("error", result.message || "Gagal menyimpan frame");
      }
    } catch (error) {
      console.error("Upload error:", error);
      
      // Handle specific error cases
      if (error.message.includes("No token") || error.message.includes("token")) {
        showToast("error", "Sesi anda telah berakhir. Silakan login ulang.");
        navigate('/login');
      } else if (error.message.includes("Admin access")) {
        showToast("error", "Akses ditolak. Anda bukan admin.");
      } else if (error.message.includes("Load failed")) {
        showToast(
          "error",
          "Upload gagal (Load failed). Biasanya ini terjadi karena request upload terlalu besar (413). Silakan coba upload lagi; thumbnail sudah dikompres supaya lebih kecil."
        );
      } else {
        showToast("error", "Error: " + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Render mobile property panel
  const renderMobilePropertyPanel = () => {
    if (!activeMobileProperty) return null;

    let title = "";
    let content = null;

    if (isBackgroundSelected) {
      switch (activeMobileProperty) {
        case "background-color":
          title = "Warna Background";
          content = (
            <ColorPicker
              value={canvasBackground}
              onChange={(color) => setCanvasBackground(color)}
              gradientColor1={gradientColor1}
              gradientColor2={gradientColor2}
              setGradientColor1={setGradientColor1}
              setGradientColor2={setGradientColor2}
            />
          );
          break;
        case "background-photo":
          title = "Foto Background";
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
                {backgroundPhotoElement ? "Ganti foto background" : "Tambah foto background"}
              </button>
              {backgroundPhotoElement && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(canvasAspectRatio);
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
          break;
        default:
          break;
      }
    } else if (selectedElementObject) {
      const data = selectedElementObject.data ?? {};
      switch (activeMobileProperty) {
        case "text-edit":
          title = "Edit Teks";
          content = (
            <textarea
              className="create-mobile-property-panel__textarea"
              rows={4}
              value={data.text ?? ""}
              onChange={(e) => updateElement(selectedElementObject.id, { data: { text: e.target.value } })}
            />
          );
          break;
        case "text-color":
        case "shape-color":
        case "photo-color":
          title = "Warna";
          content = (
            <ColorPicker
              value={data.fill ?? data.color ?? "#F4D3C2"}
              onChange={(color) =>
                updateElement(selectedElementObject.id, {
                  data: selectedElementObject.type === "text" ? { color } : { fill: color },
                })
              }
            />
          );
          break;
        case "layer-order":
          title = "Urutan Lapisan";
          content = (
            <div className="create-mobile-property-panel__actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button type="button" onClick={() => bringToFront(selectedElementObject.id)} className="create-mobile-property-panel__action">
                <ChevronsUp size={18} style={{ marginRight: "8px" }} /> Paling Depan
              </button>
              <button type="button" onClick={() => bringForward(selectedElementObject.id)} className="create-mobile-property-panel__action">
                <ArrowUp size={18} style={{ marginRight: "8px" }} /> Kedepankan
              </button>
              <button type="button" onClick={() => sendToBack(selectedElementObject.id)} className="create-mobile-property-panel__action">
                <ChevronsDown size={18} style={{ marginRight: "8px" }} /> Paling Belakang
              </button>
              <button type="button" onClick={() => sendBackward(selectedElementObject.id)} className="create-mobile-property-panel__action">
                <ArrowDown size={18} style={{ marginRight: "8px" }} /> Kebelakangkan
              </button>
            </div>
          );
          break;
        default:
          break;
      }
    }

    if (!content) return null;

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
          <button type="button" onClick={() => setActiveMobileProperty(null)} className="create-mobile-property-panel__close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="create-mobile-property-panel__content">{content}</div>
      </Motion.div>
    );
  };

  return (
    <div className="create-page">
      {/* Toast */}
      {toast && (
        <Motion.div
          className="create-toast-wrapper"
          initial={{ opacity: 0, y: -12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.94 }}
        >
          <div className={`create-toast ${toast.type === "success" ? "create-toast--success" : "create-toast--error"}`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{toast.message}</span>
          </div>
        </Motion.div>
      )}

      <div className="create-grid">
        {/* Tools Panel - Desktop */}
        {!isMobileView && (
          <Motion.aside
            variants={panelMotion}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.05 }}
            className="create-panel create-panel--tools"
            style={{ overflowY: "auto", overflowX: "hidden" }}
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
                    className={`create-tools__button ${button.isActive ? "create-tools__button--active" : ""}`.trim()}
                  >
                    <IconComponent size={20} strokeWidth={2} />
                    <span>{button.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Frame Settings */}
            <div style={{ marginTop: "24px", borderTop: "1px solid #f0e6e0", paddingTop: "16px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "12px" }}>
                {isEditMode ? "✏️ Edit Frame" : "📋 Frame Settings"}
              </h3>

              {loadingFrame && (
                <div style={{ padding: "12px", background: "#f0f9ff", borderRadius: "8px", marginBottom: "12px", fontSize: "13px", color: "#0369a1" }}>
                  ⏳ Memuat data frame...
                </div>
              )}

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Nama Frame *</label>
                <input
                  type="text"
                  value={frameName}
                  onChange={(e) => setFrameName(e.target.value)}
                  placeholder="contoh: FremioSeries-Blue-6"
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>Deskripsi</label>
                <textarea
                  value={frameDescription}
                  onChange={(e) => setFrameDescription(e.target.value)}
                  placeholder="Deskripsi frame..."
                  rows={2}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "8px" }}>Kategori</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                  {AVAILABLE_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        padding: "4px 6px",
                        borderRadius: "6px",
                        backgroundColor: frameCategories.includes(cat) ? "#f0e6ff" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={frameCategories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                        style={{ width: "16px", height: "16px", accentColor: "#8b5cf6", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "13px", color: "#374151" }}>{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "8px" }}>Visibilitas</label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    padding: "8px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hideAfterUpload}
                    onChange={(e) => setHideAfterUpload(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "#8b5cf6", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "13px", color: "#374151" }}>
                    Hide setelah upload (tidak tampil di user)
                  </span>
                </label>
              </div>
            </div>

            {/* Back button */}
            <button
              type="button"
              onClick={() => navigate("/admin/frames")}
              style={{
                marginTop: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                fontSize: "13px",
                color: "#6b7280",
                background: "none",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                cursor: "pointer",
                width: "100%",
                justifyContent: "center",
              }}
            >
              <ArrowLeft size={16} />
              Kembali ke Frames
            </button>
          </Motion.aside>
        )}

        {/* Preview Section */}
        <Motion.section variants={panelMotion} initial="hidden" animate="visible" transition={{ delay: 0.1 }} className="create-preview">
          <h2 className="create-preview__title">Preview</h2>

          <div className="create-preview__body">
            <div ref={previewFrameRef} className="create-preview__frame" data-canvas-ratio={canvasAspectRatio}>
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
                isBackgroundLocked={isBackgroundLocked}
                onToggleBackgroundLock={toggleBackgroundLock}
                onResetBackground={resetBackground}
              />
            </div>
          </div>

          {/* Upload Button */}
          <Motion.button
            type="button"
            onClick={handleUploadFrame}
            disabled={saving || loadingFrame}
            className="create-save"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -3 }}
            style={{
              background: isEditMode ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
            }}
          >
            {saving ? (
              <>
                <svg className="create-save__spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                </svg>
                {isEditMode ? "Menyimpan..." : "Mengupload..."}
              </>
            ) : (
              <>
                <Upload size={18} strokeWidth={2.5} />
                {isEditMode ? "Update Frame" : "Upload Frame"}
              </>
            )}
          </Motion.button>
        </Motion.section>

        {/* Properties Panel - Desktop */}
        {!isMobileView && (
          <Motion.aside variants={panelMotion} initial="hidden" animate="visible" transition={{ delay: 0.15 }} className="create-panel create-panel--properties">
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
                  const availableWidth = canvasW - 2 * marginX - (cols - 1) * gapX;
                  const availableHeight = canvasH - 2 * marginY - (rows - 1) * gapY;
                  const photoWidth = Math.floor(availableWidth / cols);
                  const photoHeight = Math.floor(availableHeight / rows);

                  let lastAddedId = null;
                  for (let row = 0; row < rows; row++) {
                    for (let col = 0; col < cols; col++) {
                      const x = marginX + col * (photoWidth + gapX);
                      const y = marginY + row * (photoHeight + gapY);
                      const newId = addElement("photo", { x, y, width: photoWidth, height: photoHeight });
                      if (newId) lastAddedId = newId;
                    }
                  }
                  if (lastAddedId) selectElement(lastAddedId);
                }}
                onCancelPhotoTool={() => setPendingPhotoTool(false)}
              />
            </div>
          </Motion.aside>
        )}
      </div>

      {/* Mobile View */}
      {isMobileView && (
        <>
          {renderMobilePropertyPanel()}
          {pendingPhotoTool ? (
            <nav className="create-mobile-toolbar create-mobile-toolbar--grid">
              <button type="button" onClick={() => setPendingPhotoTool(false)} className="create-mobile-toolbar__button create-mobile-toolbar__button--back">
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
                    const canvasW = CANVAS_WIDTH;
                    const canvasH = CANVAS_HEIGHT;
                    const gapX = 30,
                      gapY = 30;
                    const marginX = 65,
                      marginY = 140;
                    const availableWidth = canvasW - 2 * marginX - (grid.cols - 1) * gapX;
                    const availableHeight = canvasH - 2 * marginY - (grid.rows - 1) * gapY;
                    const photoWidth = Math.floor(availableWidth / grid.cols);
                    const photoHeight = Math.floor(availableHeight / grid.rows);

                    let lastAddedId = null;
                    for (let row = 0; row < grid.rows; row++) {
                      for (let col = 0; col < grid.cols; col++) {
                        const x = marginX + col * (photoWidth + gapX);
                        const y = marginY + row * (photoHeight + gapY);
                        const newId = addElement("photo", { x, y, width: photoWidth, height: photoHeight });
                        if (newId) lastAddedId = newId;
                      }
                    }
                    if (lastAddedId) selectElement(lastAddedId);
                  }}
                  className="create-mobile-toolbar__button"
                >
                  <Grid3X3 size={20} strokeWidth={2.4} />
                  <span>{grid.label}</span>
                </button>
              ))}
            </nav>
          ) : (
            <nav className={`create-mobile-toolbar ${isMobilePropertyToolbar ? "create-mobile-toolbar--properties" : ""}`.trim()}>
              {(isMobilePropertyToolbar ? mobilePropertyButtons : toolButtons).map((button) => {
                const Icon = button.icon;
                const isActive = isMobilePropertyToolbar ? activeMobileProperty === button.id : Boolean(button.isActive);
                const label = isMobilePropertyToolbar ? button.label : button.mobileLabel ?? button.label;

                return (
                  <button
                    key={button.id}
                    type="button"
                    onClick={() => {
                      if (isMobilePropertyToolbar) {
                        setActiveMobileProperty((prev) => (prev === button.id ? null : button.id));
                      } else {
                        handleToolButtonPress(button);
                      }
                    }}
                    className={`create-mobile-toolbar__button ${isActive ? "create-mobile-toolbar__button--active" : ""}`.trim()}
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

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ position: "absolute", left: "-9999px", opacity: 0 }} onChange={handleFileChange} />
    </div>
  );
}
