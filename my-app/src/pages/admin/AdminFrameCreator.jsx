/**
 * AdminFrameCreator - Admin page for uploading frames
 * Identical to Create page but with Upload Frame button instead of Save Template
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
  Upload,
  Download,
  Search,
  X,
  Plus,
} from "lucide-react";
import CanvasPreview from "../../components/creator/CanvasPreview.jsx";
import PropertiesPanel from "../../components/creator/PropertiesPanel.jsx";
import useCreatorStore from "../../store/useCreatorStore.js";
import { useShallow } from "zustand/react/shallow";
import api from "../../services/api";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "../../components/creator/canvasConstants.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import unifiedFrameService from "../../services/unifiedFrameService";
import { detectFrameSlots, buildSlotMaps } from "../../utils/slotSystem.js";
import "../Create.css";

const panelMotion = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function AdminFrameCreator({ studioBoothMode = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editFrameId = searchParams.get("edit");
  
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const importFrameInputRef = useRef(null);
  const uploadPurposeRef = useRef("upload");
  const previewFrameRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const elementsRef = useRef([]);

  // State
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [toast, setToast] = useState(null);
  // Locked to 4R (2:3) for studio booth frames
  const [canvasAspectRatio, setCanvasAspectRatio] = useState("2:3");
  const [showCanvasSizeInProperties, setShowCanvasSizeInProperties] = useState(false);
  const [gradientColor1, setGradientColor1] = useState("#667eea");
  const [gradientColor2, setGradientColor2] = useState("#764ba2");
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(false);
  const [pendingPhotoTool, setPendingPhotoTool] = useState(false);
  const [pendingPexelsTool, setPendingPexelsTool] = useState(false);
  const [importFrameWorking, setImportFrameWorking] = useState(false);
  const [previewConstraints, setPreviewConstraints] = useState({
    maxWidth: 280,
    maxHeight: 500,
  });
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Admin frame metadata
  const [frameName, setFrameName] = useState("");
  const [frameDescription, setFrameDescription] = useState("");
  const [frameCategories, setFrameCategories] = useState(["Aesthetic"]);

  // Available categories (Indonesian, matching studio editor)
  const [availableCategories, setAvailableCategories] = useState([
    "Aesthetic",
    "Korean",
    "Vintage",
    "Minimalis",
    "Ulang Tahun",
    "Wedding",
    "Wisuda",
    "Seasonal",
    "Custom",
  ]);

  // Toggle category selection
  const toggleCategory = (category) => {
    setFrameCategories(prev => {
      if (prev.includes(category)) {
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const addCustomCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (!availableCategories.includes(trimmed)) {
      setAvailableCategories(prev => [...prev, trimmed]);
    }
    if (!frameCategories.includes(trimmed)) {
      setFrameCategories(prev => [...prev, trimmed]);
    }
    setNewCategoryInput("");
    setShowAddCategory(false);
  };

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

  // Keep elementsRef in sync with store
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  // Reset store on mount OR load frame for edit
  useEffect(() => {
    const loadFrameForEdit = async () => {
      if (editFrameId) {
        setLoadingFrame(true);
        setIsEditMode(true);
        try {
          console.log("📝 Loading frame for edit:", editFrameId);
          const frame = await unifiedFrameService.getFrameById(editFrameId);
          
          if (frame) {
            console.log("✅ Frame loaded:", frame);
            console.log("🔍 Frame layout:", frame.layout);
            console.log("🔍 Frame layout.elements:", frame.layout?.elements);
            
            // Set frame metadata
            setFrameName(frame.name || "");
            setFrameDescription(frame.description || "");
            
            // Parse categories
            if (frame.categories && Array.isArray(frame.categories)) {
              setFrameCategories(frame.categories);
            } else if (frame.category) {
              setFrameCategories(frame.category.split(", ").map(c => c.trim()));
            }
            
            // Set canvas background
            if (frame.canvasBackground || frame.layout?.backgroundColor) {
              setCanvasBackground(frame.canvasBackground || frame.layout?.backgroundColor || "#f7f1ed");
            }
            
            // Build elements from frame data
            const newElements = [];
            
            // Use the frame's stored canvas dimensions to correctly scale
            // slot coordinates back to pixel positions.
            // IMPORTANT: Never use the global CANVAS_HEIGHT constant here — it
            // defaults to 1920 (9:16), but studio-booth frames use 1620 (2:3).
            // Using the wrong height causes cumulative coordinate drift on each
            // edit-save cycle, which shifts photo slots away from their designed
            // positions in the background image.
            const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(canvasAspectRatio);
            const frameCanvasW = (frame.canvasWidth && frame.canvasWidth > 0) ? frame.canvasWidth : canvasWidth;
            const frameCanvasH = (frame.canvasHeight && frame.canvasHeight > 0) ? frame.canvasHeight : canvasHeight;

            // Add background photo if available
            if (frame.imageUrl || frame.thumbnailUrl || frame.imagePath || frame.image_url) {
              const imageUrl = frame.imageUrl || frame.thumbnailUrl || frame.imagePath || frame.image_url;
              console.log("🖼️ Adding background photo:", imageUrl);
              newElements.push({
                id: "background-photo-1",
                type: "background-photo",
                x: 0,
                y: 0,
                width: frameCanvasW,
                height: frameCanvasH,
                zIndex: 0,
                data: {
                  image: imageUrl,
                  objectFit: "cover",
                  label: "Background",
                }
              });
            }
            
            // Add photo slots - ALWAYS use low zIndex (1) so they appear BELOW overlay elements
            if (frame.slots && Array.isArray(frame.slots)) {
              console.log("📸 Adding photo slots:", frame.slots.length);
              // Rebuild slotNumber/photoIndex maps from geometry for visual labels
              const slotsNorm = frame.slots.map(s => ({
                left: s.left || 0, top: s.top || 0,
                width: s.width || 0, height: s.height || 0,
              }));
              const { slotNumberMap } = buildSlotMaps(slotsNorm);
              frame.slots.forEach((slot, index) => {
                newElements.push({
                  id: slot.id || `photo_${index + 1}`,
                  type: "photo",
                  x: slot.left * frameCanvasW,
                  y: slot.top * frameCanvasH,
                  width: slot.width * frameCanvasW,
                  height: slot.height * frameCanvasH,
                  rotation: typeof slot.rotation === "number" ? slot.rotation : 0,
                  zIndex: 1, // Always low z-index for photo slots
                  data: {
                    photoIndex: slot.photoIndex !== undefined ? slot.photoIndex : index,
                    slotNumber: slotNumberMap[index] ?? index + 1,
                    borderRadius: slot.borderRadius || 0,
                  }
                });
              });
            }
            
            // Restore other elements (upload, text, shape) from layout.elements
            // These should have HIGHER zIndex than photo slots
            // NOTE: layout.elements may include photo-type elements (reconstructed from slots).
            // Skip them here — photo areas are already added from frame.slots above.
            if (frame.layout?.elements && Array.isArray(frame.layout.elements)) {
              console.log("📦 [EDIT] Restoring other elements:", frame.layout.elements.length);
              frame.layout.elements.forEach((el, index) => {
                console.log(`📦 [EDIT] Element ${index}: type=${el.type}, id=${el.id}, hasImage=${!!el.data?.image}`);
                // Skip photo-type elements — sourced from frame.slots (added above).
                if (el.type === "photo") return;
                
                // Convert normalized positions back to absolute positions
                let restoredWidth = el.widthNorm !== undefined ? el.widthNorm * frameCanvasW : el.width;
                let restoredHeight = el.heightNorm !== undefined ? el.heightNorm * frameCanvasH : el.height;
                
                // For upload elements, recalculate dimensions using stored aspect ratio
                // This ensures the image maintains its correct proportions
                if (el.type === "upload" && el.data?.imageAspectRatio) {
                  const aspectRatio = el.data.imageAspectRatio;
                  // Use width as base and recalculate height to maintain aspect ratio
                  restoredHeight = restoredWidth / aspectRatio;
                  console.log("  📐 Recalculated dimensions:", { width: restoredWidth, height: restoredHeight, aspectRatio });
                }
                
                const restoredElement = {
                  ...el,
                  x: el.xNorm !== undefined ? el.xNorm * frameCanvasW : el.x,
                  y: el.yNorm !== undefined ? el.yNorm * frameCanvasH : el.y,
                  width: restoredWidth,
                  height: restoredHeight,
                  // Ensure overlay elements (upload/text/shape) are ABOVE photo slots
                  zIndex: Math.max(el.zIndex || 10, 10),
                };
                
                // ✅ PERBAIKAN: Validasi image URL untuk upload element
                if (el.type === 'upload' && el.data?.image) {
                  const imageUrl = el.data.image;
                  
                  if (imageUrl.startsWith('http') || imageUrl.startsWith('data:image')) {
                    console.log(`  ✅ Valid image URL:`, imageUrl.substring(0, 80));
                  } else {
                    console.error(`  ❌ Invalid image URL:`, imageUrl.substring(0, 80));
                    // Set to null to prevent errors
                    if (restoredElement.data) {
                      restoredElement.data.image = null;
                    }
                  }
                }
                
                // Remove normalized properties
                delete restoredElement.xNorm;
                delete restoredElement.yNorm;
                delete restoredElement.widthNorm;
                delete restoredElement.heightNorm;
                
                console.log(`  ✅ Restored: zIndex=${restoredElement.zIndex}, hasImage=${!!restoredElement.data?.image}`);
                newElements.push(restoredElement);
              });
            } else {
              console.log("⚠️ No layout.elements found in frame data");
            }
            
            console.log("📋 Total elements to set:", newElements.length, newElements.map(e => e.type));
            setElements(newElements);
            showToast("success", `Frame "${frame.name}" dimuat untuk diedit`);
          } else {
            showToast("error", "Frame tidak ditemukan");
            setIsEditMode(false);
          }
        } catch (error) {
          console.error("❌ Error loading frame:", error);
          showToast("error", "Gagal memuat frame: " + error.message);
          setIsEditMode(false);
        } finally {
          setLoadingFrame(false);
        }
      } else {
        // New frame mode - reset everything
        setElements([]);
        setCanvasBackground("#f7f1ed");
        clearSelection();
        setIsEditMode(false);
      }
    };
    
    loadFrameForEdit();
  }, [editFrameId]);

  // Toast helper
  const showToast = useCallback((type, message, duration = 3200) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  // Selected element
  const selectedElement = useMemo(() => {
    if (selectedElementId === "background") return "background";
    return elements.find((el) => el.id === selectedElementId) || null;
  }, [elements, selectedElementId]);

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

  // File upload handlers
  const triggerUpload = useCallback(() => {
    uploadPurposeRef.current = "upload";
    fileInputRef.current?.click();
  }, []);

  const triggerBackgroundUpload = useCallback(() => {
    uploadPurposeRef.current = "background";
    fileInputRef.current?.click();
  }, []);

  // Listen for background upload requests from PropertiesPanel
  useEffect(() => {
    const handleBackgroundUploadRequest = () => {
      triggerBackgroundUpload();
    };

    window.addEventListener(
      "creator:request-background-upload",
      handleBackgroundUploadRequest
    );

    return () => {
      window.removeEventListener(
        "creator:request-background-upload",
        handleBackgroundUploadRequest
      );
    };
  }, [triggerBackgroundUpload]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
        }
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  // Toggle background lock
  const toggleBackgroundLock = useCallback(() => {
    setIsBackgroundLocked((prev) => !prev);
    showToast("success", isBackgroundLocked ? "Background unlocked" : "Background locked", 1500);
  }, [isBackgroundLocked, showToast]);

  // Mirror canvas layout builder (matches studio editor)
  const buildMirroredPhotoLayout = useCallback((numRows, canvasW, canvasH) => {
    const centerX = Math.floor(canvasW / 2);
    const marginX = 65;
    const marginY = 140;
    const gapCenter = 30;
    const gapY = 30;
    const halfGap = Math.floor(gapCenter / 2);
    const colWidth = centerX - marginX - halfGap;
    const availableH = canvasH - 2 * marginY - (numRows - 1) * gapY;
    const photoH = Math.floor(availableH / numRows);
    const slots = [];
    for (let row = 0; row < numRows; row++) {
      const y = marginY + row * (photoH + gapY);
      slots.push({ x: marginX, y, width: colWidth, height: photoH, side: "left", rowIndex: row });
      slots.push({ x: centerX + halfGap, y, width: colWidth, height: photoH, side: "right", rowIndex: row });
    }
    return slots;
  }, []);

  // Mirror-aware element update (matches studio editor)
  const handleElementUpdate = useCallback((id, changes) => {
    const currentElements = elementsRef.current;
    const el = currentElements.find((e) => e.id === id);
    if (!el || el.type !== "photo" || el.data?.linkedGroup !== "mirror") {
      updateElement(id, changes);
      return;
    }
    const isResize = "width" in changes || "height" in changes;
    const hasX = "x" in changes;
    const hasY = "y" in changes;
    const linkedPhotos = currentElements.filter(
      (e) => e.type === "photo" && e.data?.linkedGroup === "mirror"
    );
    const { width: canvasW, height: canvasH } = getCanvasDimensions(canvasAspectRatio);
    const centerX = el.data?.mirrorCenterX ?? Math.floor(canvasW / 2);
    if (isResize) {
      const side = el.data?.side;
      const newW = "width" in changes ? changes.width : el.width;
      const newH = "height" in changes ? changes.height : el.height;
      const deltaX = ("x" in changes ? changes.x : el.x) - el.x;
      const deltaY = ("y" in changes ? changes.y : el.y) - el.y;
      const deltaW = newW - el.width;
      const updatesMap = {};
      linkedPhotos.forEach((photo) => {
        if (photo.id === id) return;
        const pSide = photo.data?.side;
        let newX, newY;
        if (pSide === side) {
          newX = photo.x + deltaX;
          newY = photo.y + deltaY;
        } else {
          newX = photo.x - (deltaX + deltaW);
          newY = photo.y + deltaY;
        }
        if (pSide === "left") newX = Math.max(0, Math.min(centerX - newW, newX));
        else newX = Math.max(centerX, Math.min(canvasW - newW, newX));
        newY = Math.max(0, Math.min(canvasH - newH, newY));
        updatesMap[photo.id] = { x: newX, y: newY, width: newW, height: newH };
      });
      linkedPhotos.forEach((photo) => {
        if (updatesMap[photo.id]) updateElement(photo.id, updatesMap[photo.id]);
      });
      updateElement(id, changes);
      return;
    }
    if (hasY && !hasX) {
      const newY = changes.y;
      linkedPhotos.forEach((photo) => {
        updateElement(photo.id, { y: newY });
      });
      return;
    }
    if (hasX) {
      const newX = changes.x;
      const side = el.data?.side;
      const elW = el.width;
      linkedPhotos.forEach((photo) => {
        const pSide = photo.data?.side;
        let mirroredX;
        if (pSide === side) {
          mirroredX = newX;
        } else {
          const delta = newX - el.x;
          mirroredX = photo.x - delta;
        }
        if (pSide === "left") mirroredX = Math.max(0, Math.min(centerX - elW, mirroredX));
        else mirroredX = Math.max(centerX, Math.min(canvasW - elW, mirroredX));
        const update = { x: mirroredX };
        if (hasY) update.y = changes.y;
        updateElement(photo.id, update);
      });
    }
  }, [updateElement, getCanvasDimensions, canvasAspectRatio]);

  // Import Frame handler — detects transparent slots, same as studio editor
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

      const img = await new Promise((resolve, reject) => {
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
          imageAspectRatio: img.width / img.height,
          objectFit: "fill",
          label: file.name.replace(/\.[^.]+$/, "") || "Frame",
          borderRadius: 0,
          __isOverlay: true,
        },
      });

      const slotMsg = slots.length > 0
        ? `${slots.length} area foto terdeteksi.`
        : "Tidak ada area transparan terdeteksi, 1 slot penuh ditambahkan.";
      showToast("success", `Frame diimport! ${slotMsg}`, 4000);
    } catch (err) {
      showToast("error", err?.message || "Gagal import frame.");
    } finally {
      setImportFrameWorking(false);
    }
  }, [importFrameWorking, showToast, getCanvasDimensions, canvasAspectRatio, addElement]);

  // Tool buttons
  const toolButtons = useMemo(
    () => [
      {
        id: "canvas-size",
        icon: Maximize2,
        label: "Ukuran Canvas",
        isActive: showCanvasSizeInProperties,
        onClick: () => {
          setShowCanvasSizeInProperties((prev) => !prev);
          clearSelection();
        },
      },
      {
        id: "import-frame",
        icon: Download,
        label: "Import Frame",
        isActive: importFrameWorking,
        onClick: () => {
          if (importFrameWorking) return;
          setShowCanvasSizeInProperties(false);
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
        isActive: pendingPhotoTool,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          setPendingPexelsTool(false);
          setPendingPhotoTool(true);
          clearSelection();
        },
      },
      {
        id: "pexels",
        icon: Search,
        label: "Cari Foto",
        isActive: pendingPexelsTool,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          setPendingPhotoTool(false);
          setPendingPexelsTool(true);
          clearSelection();
        },
      },
      {
        id: "text",
        icon: TypeIcon,
        label: "Add Text",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          setPendingPexelsTool(false);
          addElement("text");
        },
      },
      {
        id: "shape",
        icon: Shapes,
        label: "Shape",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          setPendingPexelsTool(false);
          addElement("shape");
        },
      },
      {
        id: "upload",
        icon: UploadCloud,
        label: "Unggahan",
        isActive: false,
        onClick: () => {
          setShowCanvasSizeInProperties(false);
          triggerUpload();
        },
      },
    ],
    [showCanvasSizeInProperties, selectedElementId, pendingPhotoTool, pendingPexelsTool, importFrameWorking, addElement, selectElement, clearSelection, triggerUpload, setPendingPhotoTool, setPendingPexelsTool]
  );

  // Upload frame handler
  const handleUploadFrame = async () => {
    if (saving) return;

    // Validation
    if (!frameName.trim()) {
      showToast("error", "Nama frame harus diisi!");
      return;
    }

    const photoElements = elements
      .filter((el) => el.type === "photo")
      .slice()
      .sort((a, b) => {
        const zA = Number.isFinite(a?.zIndex) ? Number(a.zIndex) : 0;
        const zB = Number.isFinite(b?.zIndex) ? Number(b.zIndex) : 0;
        if (zA !== zB) return zA - zB;
        const pA = Number.isFinite(a?.data?.photoIndex) ? Number(a.data.photoIndex) : 0;
        const pB = Number.isFinite(b?.data?.photoIndex) ? Number(b.data.photoIndex) : 0;
        return pA - pB;
      });
    if (photoElements.length === 0) {
      showToast("error", "Tambahkan minimal 1 Area Foto!");
      return;
    }

    // Background photo is optional - can use solid color background instead
    const backgroundPhoto = elements.find((el) => el.type === "background-photo");

    setSaving(true);

    try {
      const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(canvasAspectRatio);

      let frameImageDataUrl = null;
      let frameImageBlob = null;
      let isExistingUrl = false;
      let thumbnailDataUrl = null;

      if (backgroundPhoto) {
        // Get the original frame image from background-photo element
        // The image is stored in data.image by useCreatorStore
        frameImageDataUrl = backgroundPhoto.data?.image || backgroundPhoto.data?.src || backgroundPhoto.src;
        
        console.log("🖼️ Background photo element:", backgroundPhoto);
        console.log("🖼️ Frame image data URL length:", frameImageDataUrl?.length || 0);
        
        // Check if it's a URL (edit mode with existing image) or data URL (new upload)
        isExistingUrl = frameImageDataUrl?.startsWith("http");
        
        if (!isExistingUrl && frameImageDataUrl) {
          // Convert data URL to blob for new upload
          frameImageBlob = await (await fetch(frameImageDataUrl)).blob();
          console.log("📸 Frame image blob size:", frameImageBlob.size, "bytes");
        }
      } else {
        // No background photo - capture canvas as frame image
        console.log("🎨 No background photo, capturing canvas...");

        const canvasNode = document.getElementById("creator-canvas");
        if (canvasNode) {
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
          exportCanvasNode.id = "creator-canvas-export-admin";
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
            outline: "none",
          });

          exportWrapper.appendChild(exportCanvasNode);
          document.body.appendChild(exportWrapper);

          try {
            const canvas = await html2canvas(exportCanvasNode, {
              scale: 1,
              useCORS: true,
              allowTaint: true,
              backgroundColor: canvasBackground || "#ffffff",
              width: canvasWidth,
              height: canvasHeight,
              windowWidth: canvasWidth,
              windowHeight: canvasHeight,
              scrollX: 0,
              scrollY: 0,
              logging: false,
              ignoreElements: (element) => {
                if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
                if (element.getAttribute?.("data-export-ignore") === "true") return true;
                if (element.closest?.('[data-export-ignore="true"]')) return true;
                // Exclude photo slot placeholders — background image must be a clean
                // frame decoration. The booth draws camera/photos at slot coordinates
                // on top; baked-in blue boxes cause visual misalignment with the
                // actual frame photo areas and confuse the slot position mapping.
                if (element.getAttribute?.("data-photo-placeholder") === "true") return true;
                if (element.closest?.('[data-photo-placeholder="true"]')) return true;
                return false;
              },
            });

            // Export as JPEG (not PNG) so the booth's isOverlayAsset() returns false
            // and draws this image as a background BEFORE camera slots, not as an
            // overlay ON TOP of them (which would hide the camera feed).
            frameImageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
            frameImageBlob = await (await fetch(frameImageDataUrl)).blob();
            console.log("📸 Canvas captured (native JPEG), blob size:", frameImageBlob.size, "bytes");
          } catch (err) {
            console.error("❌ Failed to capture canvas:", err);
            showToast("error", "Gagal membuat gambar frame dari canvas");
            setSaving(false);
            return;
          } finally {
            if (exportWrapper.parentNode) {
              exportWrapper.parentNode.removeChild(exportWrapper);
            }
          }
        } else if (previewFrameRef.current) {
          try {
            const canvas = await html2canvas(previewFrameRef.current, {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              backgroundColor: canvasBackground || "#ffffff",
              ignoreElements: (element) => {
                if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
                if (element.getAttribute?.('data-photo-placeholder') === 'true') return true;
                if (element.closest?.('[data-photo-placeholder="true"]')) return true;
                return false;
              },
            });
            frameImageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
            frameImageBlob = await (await fetch(frameImageDataUrl)).blob();
            console.log("📸 Canvas captured (fallback JPEG), blob size:", frameImageBlob.size, "bytes");
          } catch (err) {
            console.error("❌ Failed to capture canvas fallback:", err);
            showToast("error", "Gagal membuat gambar frame dari canvas");
            setSaving(false);
            return;
          }
        }
      }

      // Convert photo slots to normalized values
      // Keep stored photoIndex/slotNumber to preserve editor numbering after save.
      const slots = photoElements.map((el, index) => ({
        id: el.id,
        left: el.x / canvasWidth,
        top: el.y / canvasHeight,
        width: el.width / canvasWidth,
        height: el.height / canvasHeight,
        zIndex: Number.isFinite(el.zIndex) ? el.zIndex : 1,
        photoIndex: Number.isFinite(el.data?.photoIndex) ? el.data.photoIndex : index,
        slotNumber: Number.isFinite(el.data?.slotNumber) ? el.data.slotNumber : index + 1,
        borderRadius: el.data?.borderRadius || 0,
        rotation: Number.isFinite(el.rotation) ? el.rotation : 0,
      }));

      const hasMirroredSlots = photoElements.some((el) => el.data?.linkedGroup === "mirror");

      // Collect non-photo elements (upload, text, shape) for storage in layout
      // Exclude background-photo and photo elements as they are stored separately
      // For upload elements with images, upload to ImageKit first
      const otherElements = [];
      
      console.log("📦 [SAVE] Starting to process elements...");
      console.log("📦 [SAVE] All elements:", elements.length);
      console.log("📦 [SAVE] Non-photo elements:", elements.filter(e => e.type !== "photo" && e.type !== "background-photo").length);
      
      for (const el of elements.filter(e => e.type !== "photo" && e.type !== "background-photo")) {
        console.log(`📦 [SAVE] Processing element: type=${el.type}, id=${el.id}`);
        
        // ✅ PERBAIKAN: Buat struktur element yang bersih dan konsisten
        const elementToSave = {
          id: el.id,
          type: el.type,
          x: el.x || 0,
          y: el.y || 0,
          width: el.width,
          height: el.height,
          zIndex: el.zIndex || 500,
          // Normalize positions to percentages for responsive storage
          xNorm: el.x / canvasWidth,
          yNorm: el.y / canvasHeight,
          widthNorm: el.width / canvasWidth,
          heightNorm: el.height / canvasHeight,
        };
        
        // Copy data object dengan validasi
        if (el.data && typeof el.data === 'object') {
          elementToSave.data = {
            label: el.data.label || (el.type === 'upload' ? 'Unggahan' : ''),
            objectFit: el.data.objectFit || 'contain',
            borderRadius: el.data.borderRadius || 0,
            __isOverlay: el.type === 'upload',
          };
          
          // Handle upload element with image
          if (el.type === 'upload') {
            // If this is an upload element with a data URL image, upload to backend
            // Use originalImage if available (better quality, preserves transparency)
            const imageToUpload = el.data?.originalImage || el.data?.image;
            
            if (imageToUpload && imageToUpload.startsWith("data:")) {
              console.log("📤 Uploading overlay element image to backend (/api/upload/overlay)...");
              console.log("📤 Using original image:", !!el.data?.originalImage);
              console.log("📤 Image size:", imageToUpload.length, "chars");
              
              try {
                // Convert data URL to blob - preserve PNG format for transparency
                const dataUrl = imageToUpload;
                const mimeMatch = dataUrl.match(/data:([^;]+);/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                
                // Use proper base64 to blob conversion
                const base64Data = dataUrl.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: mimeType });
                
                console.log("📤 Blob created:", { size: blob.size, type: blob.type });
                
                // Upload to backend - use .png extension for transparency
                const safeName = `overlay_${el.id.substring(0, 8)}.png`;
                const uploadResult = await unifiedFrameService.uploadOverlayImage(blob, safeName);
                
                if (uploadResult?.imagePath) {
                  console.log("✅ Overlay uploaded to backend:", uploadResult.imagePath);
                  // Replace data URL with server URL
                  elementToSave.data.image = uploadResult.imagePath;
                  
                  // Add metadata if available
                  if (el.data.imageAspectRatio) {
                    elementToSave.data.imageAspectRatio = el.data.imageAspectRatio;
                  }
                } else {
                  console.warn("⚠️ Failed to upload overlay, result:", uploadResult);
                  throw new Error("Upload failed - no imagePath returned");
                }
              } catch (err) {
                console.error("❌ Error uploading overlay:", err);
                showToast("error", "Gagal upload gambar overlay: " + err.message);
                setSaving(false);
                return; // Stop saving if upload fails
              }
            } else if (imageToUpload && imageToUpload.startsWith("http")) {
              // Already uploaded - keep the URL
              console.log("✅ Image already uploaded:", imageToUpload.substring(0, 80));
              elementToSave.data.image = imageToUpload;
              
              if (el.data.imageAspectRatio) {
                elementToSave.data.imageAspectRatio = el.data.imageAspectRatio;
              }
            } else {
              console.warn("⚠️ Upload element has no image:", el.id);
            }
          } else {
            // For other element types, copy other data fields
            Object.keys(el.data).forEach(key => {
              if (!['originalImage'].includes(key)) {
                elementToSave.data[key] = el.data[key];
              }
            });
          }
        }
        
        console.log(`📦 [SAVE] Element processed:`, {
          type: elementToSave.type,
          id: elementToSave.id,
          hasImage: !!elementToSave.data?.image,
          imageUrl: elementToSave.data?.image?.substring(0, 80)
        });
        
        otherElements.push(elementToSave);
      }

      console.log("📦 [SAVE] Other elements to save:", otherElements.length);
      otherElements.forEach((el, i) => {
        console.log(`  [${i}] type=${el.type}, id=${el.id}, hasImage=${!!el.data?.image}`);
        if (el.data?.image) {
          console.log(`      imageURL=${el.data.image.substring(0, 80)}...`);
        }
      });

      // ─── Overlay detection ────────────────────────────────────────────────────
      // Jika ada upload element dengan __isOverlay=true (mis. dari Import Frame),
      // gunakan URL PNG-nya langsung sebagai assetUrl/imagePath.
      // PNG overlay punya lubang transparan di posisi area foto → booth
      // menggambarnya SETELAH kamera/foto (isOverlayAsset deteksi ekstensi .png)
      // sehingga kamera terlihat lewat lubang transparan frame dekorasi.
      // Hanya berlaku jika TIDAK ada background-photo terpisah agar background
      // photo tetap terjaga sebagai lapisan bawah.
      if (!backgroundPhoto) {
        const overlayEl = otherElements.find(
          (el) => el.type === 'upload' && el.data?.__isOverlay && typeof el.data?.image === 'string' && el.data.image
        );
        if (overlayEl) {
          frameImageBlob = null;
          // imagePath will be set in frameData below
          console.log("🖼️ [OVERLAY] Using overlay PNG URL as assetUrl:", overlayEl.data.image.substring(0, 80));
        }
      }

      const frameData = {
        name: frameName.trim(),
        description: frameDescription.trim(),
        category: frameCategories.join(", "), // Multiple categories as comma-separated string
        categories: frameCategories, // Also store as array
        maxCaptures: photoElements.length,
        duplicatePhotos: hasMirroredSlots,
        captureMode: hasMirroredSlots ? "duplicate" : "single",
        slots,
        createdBy: user?.email || "admin",
        canvasBackground,
        canvasWidth,
        canvasHeight,
        // Store other elements and background in layout
        layout: {
          aspectRatio: canvasAspectRatio,
          orientation: "portrait",
          backgroundColor: canvasBackground,
          elements: otherElements, // Store upload/text/shape elements here
          slots,
          photoSlots: slots,
          photoAreas: slots,
          // Include canvas dimensions in layout JSON so studio import-preview
          // can derive correct canvasWidth/Height even when the backend DB
          // does not have dedicated canvas_width/canvas_height columns.
          canvasWidth,
          canvasHeight,
        },
        source: studioBoothMode ? "studio_booth" : "fremio",
        is_template: !!studioBoothMode,
      };

      // Set imagePath from overlay element URL (must happen after frameData is built)
      if (!backgroundPhoto) {
        const overlayEl = otherElements.find(
          (el) => el.type === 'upload' && el.data?.__isOverlay && typeof el.data?.image === 'string' && el.data.image
        );
        if (overlayEl) {
          frameData.imagePath = overlayEl.data.image;
          frameData.image_path = overlayEl.data.image;
        }
      }

      // Build thumbnail with photo placeholders from the same saved slot data,
      // rendered with the same layer order as editor elements.
      try {
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = canvasWidth;
        thumbCanvas.height = canvasHeight;
        const ctx = thumbCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = canvasBackground || "#ffffff";
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);

          const drawRoundedRect = (x, y, w, h, radius) => {
            const maxR = Math.max(0, Math.min(radius, w / 2, h / 2));
            ctx.beginPath();
            ctx.moveTo(x + maxR, y);
            ctx.lineTo(x + w - maxR, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + maxR);
            ctx.lineTo(x + w, y + h - maxR);
            ctx.quadraticCurveTo(x + w, y + h, x + w - maxR, y + h);
            ctx.lineTo(x + maxR, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - maxR);
            ctx.lineTo(x, y + maxR);
            ctx.quadraticCurveTo(x, y, x + maxR, y);
            ctx.closePath();
          };

          const drawSlotPlaceholder = (slot, fallbackLabel) => {
            const x = slot.left * canvasWidth;
            const y = slot.top * canvasHeight;
            const w = slot.width * canvasWidth;
            const h = slot.height * canvasHeight;
            if (w <= 0 || h <= 0) return;

            const rotationDeg = Number.isFinite(slot.rotation) ? Number(slot.rotation) : 0;
            const borderRadius = Number.isFinite(slot.borderRadius)
              ? Number(slot.borderRadius)
              : Math.max(4, Math.min(18, Math.min(w, h) * 0.08));

            ctx.save();
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((rotationDeg * Math.PI) / 180);

            drawRoundedRect(-w / 2, -h / 2, w, h, borderRadius);
            ctx.fillStyle = "rgba(199, 210, 254, 0.55)";
            ctx.fill();
            ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.02);
            ctx.strokeStyle = "rgba(99, 102, 241, 0.65)";
            ctx.stroke();

            const label = Number.isFinite(slot.slotNumber) ? slot.slotNumber : fallbackLabel;
            ctx.fillStyle = "rgba(79, 70, 229, 0.55)";
            ctx.font = `900 ${Math.round(Math.min(w, h) * 0.5)}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(label), 0, 0);
            ctx.restore();
          };

          if (typeof frameImageDataUrl === "string" && frameImageDataUrl) {
            try {
              const baseImg = await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = frameImageDataUrl;
              });
              ctx.drawImage(baseImg, 0, 0, canvasWidth, canvasHeight);
            } catch (imgErr) {
              console.warn("⚠️ Failed to draw base frame into thumbnail canvas:", imgErr);
            }
          }

          const slotsById = new Map(slots.map((slot) => [String(slot.id || ""), slot]));
          const layeredElements = elements
            .filter((el) => el.type !== "background-photo")
            .slice()
            .sort((a, b) => {
              const zA = Number.isFinite(a?.zIndex) ? Number(a.zIndex) : 0;
              const zB = Number.isFinite(b?.zIndex) ? Number(b.zIndex) : 0;
              if (zA !== zB) return zA - zB;
              return String(a.id || "").localeCompare(String(b.id || ""));
            });

          const photoIndexToSlot = new Map(
            slots.map((slot) => [Number.isFinite(slot.photoIndex) ? Number(slot.photoIndex) : -1, slot])
          );

          for (const el of layeredElements) {
            if (el.type === "photo") {
              const byId = slotsById.get(String(el.id || ""));
              const byPhotoIndex = photoIndexToSlot.get(
                Number.isFinite(el?.data?.photoIndex) ? Number(el.data.photoIndex) : -1
              );
              const slot = byId || byPhotoIndex;
              if (slot) {
                const fallbackLabel = Number.isFinite(el?.data?.slotNumber)
                  ? Number(el.data.slotNumber)
                  : 1;
                drawSlotPlaceholder(slot, fallbackLabel);
              }
              continue;
            }

            if (el.type === "upload" && typeof el?.data?.image === "string" && el.data.image) {
              try {
                const uploadImg = await new Promise((resolve, reject) => {
                  const img = new Image();
                  img.crossOrigin = "anonymous";
                  img.onload = () => resolve(img);
                  img.onerror = reject;
                  img.src = el.data.image;
                });
                const x = Number(el.x) || 0;
                const y = Number(el.y) || 0;
                const w = Number(el.width) || 0;
                const h = Number(el.height) || 0;
                if (w > 0 && h > 0) {
                  const rotationDeg = Number.isFinite(el.rotation) ? Number(el.rotation) : 0;
                  ctx.save();
                  ctx.translate(x + w / 2, y + h / 2);
                  ctx.rotate((rotationDeg * Math.PI) / 180);
                  ctx.drawImage(uploadImg, -w / 2, -h / 2, w, h);
                  ctx.restore();
                }
              } catch (uploadErr) {
                console.warn("⚠️ Failed to draw upload element into thumbnail:", uploadErr);
              }
            }
          }

          thumbnailDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.9);
        }
      } catch (thumbErr) {
        console.warn("⚠️ Failed to build thumbnail canvas:", thumbErr);
      }

      let thumbnailPath = null;
      if (thumbnailDataUrl && thumbnailDataUrl.startsWith("data:")) {
        try {
          const thumbBlob = await (await fetch(thumbnailDataUrl)).blob();
          const thumbUpload = await unifiedFrameService.uploadFrameImage(
            thumbBlob,
            `thumb_${Date.now()}.jpg`
          );
          if (thumbUpload?.imagePath) {
            thumbnailPath = thumbUpload.imagePath;
          }
        } catch (thumbUploadErr) {
          console.warn("⚠️ Failed to upload thumbnail:", thumbUploadErr);
        }
      }

      if (thumbnailPath) {
        frameData.thumbnailPath = thumbnailPath;
        frameData.thumbnail_path = thumbnailPath;
      }

      console.log("💾 Frame data to save:", {
        ...frameData,
        layout: {
          ...frameData.layout,
          elementsCount: frameData.layout.elements.length
        }
      });

      let result;
      
      if (isEditMode && editFrameId) {
        // Update existing frame
        console.log("📝 Updating frame:", editFrameId);
        result = await unifiedFrameService.updateFrame(editFrameId, frameData, frameImageBlob);
        if (result.success) {
          showToast("success", `Frame "${frameName}" berhasil diupdate!`);
        }
      } else {
        // Create new frame
        console.log("➕ Creating new frame");
        if (!frameImageBlob && !frameData.imagePath) {
          throw new Error("Gambar frame tidak ditemukan! Pastikan sudah upload gambar di Background atau Import Frame.");
        }
        result = await unifiedFrameService.createFrame(frameData, frameImageBlob);
        if (result.success) {
          showToast("success", `Frame "${frameName}" berhasil diupload!`);
        }
      }

      if (result.success) {
        const savedFrameId =
          result?.frame?.id ||
          result?.frameId ||
          result?.data?.id ||
          result?.id ||
          null;

        if (studioBoothMode && savedFrameId) {
          try {
            const cfg = await api.get("/admin/studio/managed-frames");
            const prevIds = Array.isArray(cfg?.data?.allowedFrameIds)
              ? cfg.data.allowedFrameIds.map((v) => String(v))
              : [];
            if (!prevIds.includes(String(savedFrameId))) {
              await api.put("/admin/studio/managed-frames", {
                enforceWhitelist: true,
                allowedFrameIds: [...prevIds, String(savedFrameId)],
              });
            }
          } catch (syncErr) {
            console.warn("Failed to auto-add frame to studio booth whitelist:", syncErr);
          }
        }

        setFrameName("");
        setFrameDescription("");
        setFrameCategories(["Fremio Series"]);
        setTimeout(() => navigate(studioBoothMode ? "/admin/studio-booths" : "/admin/frames"), 1500);
      } else {
        showToast("error", result.message || "Gagal menyimpan frame");
      }
    } catch (error) {
      console.error("Upload error:", error);
      showToast("error", "Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-page">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <input
        ref={importFrameInputRef}
        type="file"
        accept="image/*"
        onChange={handleImportFrameFile}
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
          <div className={`create-toast ${toast.type === "success" ? "create-toast--success" : "create-toast--error"}`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
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
                  className={`create-tools__button ${button.isActive ? "create-tools__button--active" : ""}`}
                >
                  <IconComponent size={20} strokeWidth={2} />
                  <span>{button.label}</span>
                </button>
              );
            })}
          </div>

          {/* Frame Metadata */}
          <div style={{ marginTop: "20px", borderTop: "1px solid #f0e6e0", paddingTop: "16px" }}>
            {loadingFrame && (
              <div style={{ padding: "10px", background: "#f0f9ff", borderRadius: "8px", marginBottom: "12px", fontSize: "13px", color: "#0369a1" }}>
                ⏳ Memuat data frame...
              </div>
            )}
            
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#b08a7a", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>
                NAMA FRAME
              </label>
              <input
                type="text"
                value={frameName}
                onChange={(e) => setFrameName(e.target.value)}
                placeholder="Masukkan nama frame"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  fontSize: "13px",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: "10px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Deskripsi
              </label>
              <textarea
                value={frameDescription}
                onChange={(e) => setFrameDescription(e.target.value)}
                placeholder="Deskripsi frame..."
                rows={2}
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

            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#b08a7a", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "8px" }}>
                KATEGORI FRAME
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {availableCategories.map((cat) => {
                  const selected = frameCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "999px",
                        border: selected ? "1.5px solid #8b5cf6" : "1.5px solid #e5e7eb",
                        background: selected ? "#f5f3ff" : "#fff",
                        color: selected ? "#6d28d9" : "#374151",
                        fontSize: "12px",
                        fontWeight: selected ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
                {showAddCategory ? (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <input
                      autoFocus
                      type="text"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addCustomCategory(); if (e.key === "Escape") { setShowAddCategory(false); setNewCategoryInput(""); } }}
                      placeholder="Nama kategori"
                      style={{ padding: "4px 8px", borderRadius: "999px", border: "1.5px solid #8b5cf6", fontSize: "12px", width: "110px", outline: "none" }}
                    />
                    <button type="button" onClick={addCustomCategory} style={{ border: "none", background: "#8b5cf6", color: "#fff", borderRadius: "999px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>OK</button>
                    <button type="button" onClick={() => { setShowAddCategory(false); setNewCategoryInput(""); }} style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: "999px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddCategory(true)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "999px",
                      border: "1.5px dashed #d1d5db",
                      background: "#fff",
                      color: "#9ca3af",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Plus size={12} /> Tambah
                  </button>
                )}
              </div>
            </div>
          </div>
        </Motion.aside>

        {/* Preview Section */}
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
                onUpdate={handleElementUpdate}
                onBringToFront={bringToFront}
                onRemove={removeElement}
                onDuplicate={duplicateElement}
                onToggleLock={toggleLock}
                onResizeUpload={resizeUploadImage}
              />
            </div>
          </div>

          {/* Save Button — matches studio editor style */}
          <Motion.button
            type="button"
            onClick={handleUploadFrame}
            disabled={saving || loadingFrame}
            className="create-save"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -3 }}
            style={{
              background: isEditMode ? "#1f2937" : "#111827",
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "14px 32px",
              fontSize: "15px",
              fontWeight: 700,
              color: "#fff",
              border: "none",
              cursor: saving || loadingFrame ? "not-allowed" : "pointer",
              opacity: saving || loadingFrame ? 0.7 : 1,
            }}
          >
            {saving ? (
              <>
                <svg className="create-save__spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                </svg>
                {isEditMode ? "Menyimpan..." : "Menyimpan..."}
              </>
            ) : (
              <>
                <Upload size={18} strokeWidth={2.5} />
                {isEditMode ? "Update Frame" : "Save"}
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
              onUpdateElement={handleElementUpdate}
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
              onConfirmAddPhoto={(numRows = 3) => {
                setPendingPhotoTool(false);
                elements.filter((el) => el.type === "photo").forEach((el) => removeElement(el.id));
                const { width: canvasW, height: canvasH } = getCanvasDimensions(canvasAspectRatio);
                const centerX = Math.floor(canvasW / 2);
                const slots = buildMirroredPhotoLayout(numRows, canvasW, canvasH);
                const normalizedSlots = slots.map((slot) => ({
                  left: slot.x / canvasW,
                  top: slot.y / canvasH,
                  width: slot.width / canvasW,
                  height: slot.height / canvasH,
                }));
                const { slotNumberMap, photoIndexMap } = buildSlotMaps(normalizedSlots);
                let lastAddedId = null;
                slots.forEach((slot, index) => {
                  const newId = addElement("photo", {
                    x: slot.x, y: slot.y, width: slot.width, height: slot.height,
                    zIndex: 0,
                    data: {
                      photoIndex: photoIndexMap[index] ?? index,
                      slotNumber: slotNumberMap[index] ?? index + 1,
                      borderRadius: 0,
                      linkedGroup: "mirror",
                      side: slot.side,
                      rowIndex: slot.rowIndex,
                      mirrorCenterX: centerX,
                    },
                  });
                  if (newId) lastAddedId = newId;
                });
                if (lastAddedId) selectElement(lastAddedId);
              }}
              onCancelPhotoTool={() => setPendingPhotoTool(false)}
              onCancelPexelsTool={() => setPendingPexelsTool(false)}
            />
          </div>
        </Motion.aside>
      </div>
    </div>
  );
}
