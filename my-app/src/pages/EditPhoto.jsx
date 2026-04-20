import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import safeStorage from "../utils/safeStorage.js";
import userStorage from "../utils/userStorage.js";
import frameProvider from "../utils/frameProvider.js";
import { BACKGROUND_PHOTO_Z } from "../constants/layers.js";
import html2canvas from "html2canvas";
import {
  clearFrameCache,
  clearStaleFrameCache,
} from "../utils/frameCacheCleaner.js";
import { convertBlobToMp4 } from "../utils/videoTranscoder.js";
import { useToast } from "../contexts/ToastContext";
import { useHeaderBranding } from "../contexts/HeaderBrandingContext";
import { trackFrameDownload } from "../services/analyticsService";
import { trackGroupShareEvent } from "../services/groupService.js";
import { imagePresets, getOriginalUrl } from "../utils/imageOptimizer";
import { downloadPhotoToGallery, downloadVideoToGallery } from "../utils/downloadHelper";

// Pre-import frequently used modules to avoid dynamic import delays
let draftStorageModule = null;
let draftHelpersModule = null;
let unifiedFrameServiceModule = null;

// Preload modules in background
const preloadModules = async () => {
  try {
    const [draftStorage, draftHelpers, unifiedFrameService] = await Promise.all([
      import("../utils/draftStorage.js"),
      import("../utils/draftHelpers.js"),
      import("../services/unifiedFrameService"),
    ]);
    draftStorageModule = draftStorage;
    draftHelpersModule = draftHelpers;
    unifiedFrameServiceModule = unifiedFrameService;
    console.log("✅ EditPhoto modules preloaded");
  } catch (e) {
    console.warn("⚠️ Module preload failed:", e);
  }
};
preloadModules();

export default function EditPhoto() {
  const debugEnabled =
    (typeof import.meta !== "undefined" && import.meta?.env?.DEV) ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1");

  if (debugEnabled) {
    console.log("🚀 EDITPHOTO RENDERING...");
  }

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setBranding, clearBranding } = useHeaderBranding();

  // Read group branding from sessionStorage (set by SharedGroup)
  const [groupBranding] = useState(() => {
    try {
      const raw = sessionStorage.getItem("__fremio_group_branding__");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });

  useEffect(() => {
    if (groupBranding) {
      setBranding({
        groupMode: true,
        headerColor: groupBranding.editPhotoHeaderColor || groupBranding.headerColor || "#ffffff",
        logoSrc: groupBranding.logoDataUrl || null,
      });
    }
    return () => {
      clearBranding();
    };
  }, [groupBranding, setBranding, clearBranding]);
  const backToGroupFramesPath = groupBranding?.groupPath || null;
  const groupShareAnalyticsId =
    typeof groupBranding?.groupShareId === "string" && groupBranding.groupShareId.trim()
      ? groupBranding.groupShareId.trim()
      : null;

  const trackGroupDownloadClick = useCallback((eventType) => {
    if (!groupShareAnalyticsId) return;
    trackGroupShareEvent(groupShareAnalyticsId, eventType, {
      source: "edit-photo",
      pagePath: typeof window !== "undefined" ? window.location.pathname : null,
    }).catch(() => {});
  }, [groupShareAnalyticsId]);

  const handleBackNavigation = useCallback(() => {
    const confirmMessage = backToGroupFramesPath
      ? "Kembali ke halaman frames group? Cache frame akan dibersihkan."
      : "Kembali ke halaman utama? Cache frame akan dibersihkan.";

    if (!window.confirm(confirmMessage)) return;

    clearFrameCache();
    navigate(backToGroupFramesPath || "/");
  }, [backToGroupFramesPath, navigate]);

  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [frameConfig, setFrameConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [designerElements, setDesignerElements] = useState([]);
  const [backgroundPhotoElement, setBackgroundPhotoElement] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [videoProcessingMessage, setVideoProcessingMessage] = useState(""); // For video download loading screen

  const exportCanvasSize = useMemo(() => {
    let layout = frameConfig?.layout;
    if (typeof layout === "string") {
      try {
        layout = JSON.parse(layout);
      } catch {
        // ignore
      }
    }
    const designer = frameConfig?.designer;

    const wRaw =
      layout?.canvasWidth ??
      layout?.canvas_width ??
      frameConfig?.canvasWidth ??
      frameConfig?.canvas_width ??
      designer?.canvasWidth ??
      designer?.canvas_width ??
      frameConfig?.layout?.canvas_size?.width ??
      frameConfig?.canvas_size?.width;

    const hRaw =
      layout?.canvasHeight ??
      layout?.canvas_height ??
      frameConfig?.canvasHeight ??
      frameConfig?.canvas_height ??
      designer?.canvasHeight ??
      designer?.canvas_height ??
      frameConfig?.layout?.canvas_size?.height ??
      frameConfig?.canvas_size?.height;

    const w = wRaw != null ? Number(wRaw) : NaN;
    const h = hRaw != null ? Number(hRaw) : NaN;

    // Fallback: derive from aspect ratio if explicit canvas sizes are missing.
    const ratioRaw =
      layout?.aspectRatio ??
      layout?.aspect_ratio ??
      layout?.canvasAspectRatio ??
      layout?.canvas_aspect_ratio ??
      designer?.aspectRatio ??
      designer?.aspect_ratio ??
      designer?.canvasAspectRatio ??
      designer?.canvas_aspect_ratio ??
      frameConfig?.canvasAspectRatio ??
      frameConfig?.canvas_aspect_ratio;

    const ratio = String(ratioRaw || "").trim();
    const ratioNorm = ratio
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[x\/]/g, ":");

    const isPhotostripRatio =
      ratioNorm === "photostrip" ||
      ratioNorm === "4r" ||
      ratioNorm === "2:3" ||
      ratioNorm === "4:6" ||
      ratioNorm === "1200:1800" ||
      ratioNorm === "1200x1800";

    const isStoryRatio =
      ratioNorm === "story" ||
      ratioNorm === "instagramstory" ||
      ratioNorm === "9:16" ||
      ratioNorm === "1080:1920" ||
      ratioNorm === "1080x1920";

    // ✅ Match Create.jsx sizing rules:
    // - Photostrip explicit: 1200:1800
    // - Photostrip ratio 2:3: uses base width 1080 => 1080x1620
    if (ratioNorm === "1200:1800" || ratioNorm === "1200x1800") {
      return { width: 1200, height: 1800 };
    }
    if (isPhotostripRatio) {
      return { width: 1080, height: 1620 };
    }
    if (isStoryRatio) return { width: 1080, height: 1920 };

    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      if (ratio.includes(":")) {
        const [rwStr, rhStr] = ratio.split(":").map((v) => v.trim());
        const rw = Number(rwStr);
        const rh = Number(rhStr);
        if (Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0) {
          const baseW = 1080;
          const derivedH = Math.round((baseW * rh) / rw);
          return { width: baseW, height: derivedH };
        }
      }
      return { width: 1080, height: 1920 };
    }

    // If the frame says 2:3 but stored as Story size, correct it to 2:3 canvas.
    if (ratioNorm === "2:3" && w === 1080 && h === 1920) {
      return { width: 1080, height: 1620 };
    }

    return { width: w, height: h };
  }, [frameConfig]);

  // Dynamic preview scale: cap height at 480px so very tall canvases (e.g. 2R 1:3)
  // still fit on a phone screen without requiring a lot of scrolling.
  const previewScale = useMemo(() => {
    const MAX_PREVIEW_HEIGHT = 480;
    const scaleByH = MAX_PREVIEW_HEIGHT / exportCanvasSize.height;
    return Math.min(scaleByH, 0.25);
  }, [exportCanvasSize.height]);

  const isDesktopSafari =
    typeof window !== "undefined" &&
    /Safari/i.test(navigator.userAgent) &&
    !/Chrome|CriOS|Edg|OPR/i.test(navigator.userAgent) &&
    !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Photo zoom/pan transforms - keyed by element id or photo index
  const [photoTransforms, setPhotoTransforms] = useState({});
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  
  // Photo swap feature - track first photo selected for swapping
  const [swapSourceId, setSwapSourceId] = useState(null);
  
  // Hover state for photo slots
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null);

  // Filter states.
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
  });
  const [activeFilter, setActiveFilter] = useState("Original");
  const photosFilled = React.useRef(false);
  const previewSectionRef = React.useRef(null);
  
  // Download instruction modal for mobile
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadModalType, setDownloadModalType] = useState('photo'); // 'photo' or 'video'

  // Detect mobile
  const isMobileDevice = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // ✅ Shared helper: load image with CORS fallback + retry (used by photo & video export)
  const loadImageWithFallback = useCallback(async (url, retries = 2) => {
    return new Promise(async (resolve, reject) => {
      if (!url) {
        reject(new Error("Missing image url"));
        return;
      }

      // Skip if already data URL
      if (url.startsWith("data:")) {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
        return;
      }

      // Add cache-busting for api.fremio.id to ensure fresh CORS headers
      let finalUrl = url;
      if (url.includes("api.fremio.id")) {
        const separator = url.includes("?") ? "&" : "?";
        finalUrl = `${url}${separator}_cors=1`;
      }

      // Check if this is a Supabase or external URL that needs proxying
      const needsProxy = url.includes("supabase.co") || url.includes("imagekit.io");

      // First try: direct load with crossOrigin
      const img = new Image();
      img.crossOrigin = "anonymous";

      let resolved = false;
      const directLoadTimeout = setTimeout(() => {
        if (!resolved) {
          console.log("⏱️ Direct load timeout, trying fallback...");
          tryFallback();
        }
      }, 8000);

      img.onload = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(directLoadTimeout);
        console.log("✅ Image loaded directly with crossOrigin");
        resolve(img);
      };

      img.onerror = () => {
        if (resolved) return;
        clearTimeout(directLoadTimeout);
        console.log("⚠️ Direct load failed, trying fallback...");
        tryFallback();
      };

      const tryFallback = async () => {
        if (resolved) return;

        try {
          let fetchUrl = finalUrl;

          // Use VPS proxy for Supabase/external URLs
          if (needsProxy) {
            const proxyUrl = `http://72.61.210.203/api/static/proxy?url=${encodeURIComponent(
              url
            )}`;
            console.log(
              "🔄 Using VPS proxy for image:",
              url.substring(0, 60) + "..."
            );
            fetchUrl = proxyUrl;
          }

          // Fetch image via proxy or directly
          const response = await fetch(fetchUrl, {
            mode: "cors",
            credentials: "omit",
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const blob = await response.blob();
          const dataUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.readAsDataURL(blob);
          });

          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            if (resolved) return;
            resolved = true;
            console.log("✅ Image loaded via proxy/fetch approach");
            resolve(fallbackImg);
          };
          fallbackImg.onerror = () => {
            if (resolved) return;
            console.error("❌ Fallback image load also failed");
            reject(new Error("All image loading methods failed"));
          };
          fallbackImg.src = dataUrl;
        } catch (fetchError) {
          console.error("❌ Fetch/proxy approach failed:", fetchError);

          // Retry logic for transient errors
          if (
            retries > 0 &&
            (fetchError.message.includes("502") ||
              fetchError.message.includes("544"))
          ) {
            console.log(`🔄 Retrying in 1s... (${retries} retries left)`);
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const retryResult = await loadImageWithFallback(url, retries - 1);
              if (!resolved) {
                resolved = true;
                resolve(retryResult);
              }
              return;
            } catch (retryError) {
              // Fall through to last resort
            }
          }

          // Last resort: try loading without crossOrigin
          const lastResortImg = new Image();
          lastResortImg.onload = () => {
            if (resolved) return;
            resolved = true;
            console.log(
              "⚠️ Image loaded without crossOrigin (may cause tainted canvas)"
            );
            resolve(lastResortImg);
          };
          lastResortImg.onerror = () => {
            if (resolved) return;
            reject(
              new Error(
                "All methods failed - server may be temporarily unavailable"
              )
            );
          };
          lastResortImg.src = finalUrl;
        }
      };

      img.src = finalUrl;
    });
  }, []);

  // Handler for swapping photos between two slots
  const swapPhotos = useCallback((sourceId, targetId) => {
    console.log("🔄 Swapping photos:", sourceId, "↔", targetId);
    
    setDesignerElements(prev => {
      const newElements = [...prev];
      const sourceIndex = newElements.findIndex(el => el.id === sourceId);
      const targetIndex = newElements.findIndex(el => el.id === targetId);
      
      if (sourceIndex === -1 || targetIndex === -1) {
        console.warn("⚠️ Could not find elements for swap");
        return prev;
      }
      
      const sourceEl = newElements[sourceIndex];
      const targetEl = newElements[targetIndex];
      
      // Only swap if both are photo slots (have photoIndex)
      if (typeof sourceEl.data?.photoIndex !== 'number' || typeof targetEl.data?.photoIndex !== 'number') {
        console.warn("⚠️ Can only swap photo slots");
        return prev;
      }
      
      // Swap the image data between the two elements
      const sourceImage = sourceEl.data?.image;
      const targetImage = targetEl.data?.image;
      
      newElements[sourceIndex] = {
        ...sourceEl,
        data: {
          ...sourceEl.data,
          image: targetImage,
        }
      };
      
      newElements[targetIndex] = {
        ...targetEl,
        data: {
          ...targetEl.data,
          image: sourceImage,
        }
      };
      
      console.log("✅ Photos swapped successfully");
      return newElements;
    });
    
    // Also swap the transforms (zoom/pan state)
    setPhotoTransforms(prev => {
      const sourceTransform = prev[sourceId] || { scale: 1, x: 0, y: 0 };
      const targetTransform = prev[targetId] || { scale: 1, x: 0, y: 0 };
      
      return {
        ...prev,
        [sourceId]: targetTransform,
        [targetId]: sourceTransform,
      };
    });
    
    // Clear selection after swap
    setSwapSourceId(null);
    setSelectedPhotoId(null);
  }, []);

  // Handler for updating photo transforms (zoom/pan)
  const updatePhotoTransform = useCallback((photoId, newTransform) => {
    setPhotoTransforms(prev => ({
      ...prev,
      [photoId]: newTransform
    }));
  }, []);

  // Get transform for a specific photo
  const getPhotoTransform = useCallback((photoId) => {
    return photoTransforms[photoId] || { scale: 1, x: 0, y: 0 };
  }, [photoTransforms]);

  // Touch state refs for pinch-zoom
  const touchStateRef = useRef({
    isPinching: false,
    isDragging: false,
    initialDistance: 0,
    initialScale: 1,
    initialX: 0,
    initialY: 0,
    lastTouchX: 0,
    lastTouchY: 0,
    lastTapTime: 0,
    activePhotoId: null,
    containerRect: null,
    photoWidth: 0,
    photoHeight: 0,
  });

  // Calculate distance between two touch points
  const getDistance = useCallback((touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Clamp value
  const clamp = useCallback((value, min, max) => {
    return Math.min(Math.max(value, min), max);
  }, []);

  // Calculate pan constraints based on scale
  // When zoomed in, the photo is larger than the viewport
  // Max pan = how far the photo can move before edge is visible
  const calculatePanConstraints = useCallback((scale, viewportWidth, viewportHeight) => {
    // Photo size after scaling (assuming photo fills viewport at scale 1)
    const scaledPhotoWidth = viewportWidth * scale;
    const scaledPhotoHeight = viewportHeight * scale;
    
    // How much the photo extends beyond viewport on each side
    // At scale 1: Allow some pan for repositioning (25% of viewport)
    // At higher scales: More pan allowed proportionally
    const basePanX = viewportWidth * 0.25; // Allow 25% pan even at scale 1
    const basePanY = viewportHeight * 0.25;
    
    const scalePanX = Math.max(0, (scaledPhotoWidth - viewportWidth) / 2);
    const scalePanY = Math.max(0, (scaledPhotoHeight - viewportHeight) / 2);
    
    // Use the larger of base pan or scale-based pan
    const maxPanX = Math.max(basePanX, scalePanX);
    const maxPanY = Math.max(basePanY, scalePanY);
    
    return { maxPanX, maxPanY };
  }, []);

  // Handle touch start on photo
  const handlePhotoTouchStart = useCallback((e, photoId, containerEl) => {
    const state = touchStateRef.current;
    const touches = e.touches;
    
    console.log("📱 TouchStart:", { photoId, touchCount: touches.length, selectedPhotoId });
    
    // Get container rect
    if (containerEl) {
      state.containerRect = containerEl.getBoundingClientRect();
    }

    const currentTransform = getPhotoTransform(photoId);
    const isCurrentlySelected = selectedPhotoId === photoId;

    // ALWAYS prevent default for photo containers to stop page scroll/zoom
    // This is critical for preventing browser gestures
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {
      // Passive event listener might prevent this
    }

    // Check for double tap to reset
    const now = Date.now();
    if (touches.length === 1 && isCurrentlySelected) {
      if (now - state.lastTapTime < 300) {
        // Double tap on selected photo - reset zoom
        updatePhotoTransform(photoId, { scale: 1, x: 0, y: 0 });
        state.lastTapTime = 0;
        setSelectedPhotoId(null);
        console.log("📱 Double tap - reset zoom");
        return;
      }
      state.lastTapTime = now;
    }

    // Selection is now handled by onClick - here we only handle zoom/pan
    // If not selected, ignore touch events (selection happens via click)
    if (!isCurrentlySelected) {
      console.log("📱 Photo not selected, ignoring touch");
      return;
    }

    state.activePhotoId = photoId;

    if (touches.length === 2) {
      // Start pinch zoom (only if selected)
      state.isPinching = true;
      state.isDragging = false;
      state.initialDistance = getDistance(touches[0], touches[1]);
      state.initialScale = currentTransform.scale;
      state.initialX = currentTransform.x;
      state.initialY = currentTransform.y;
      console.log("📱 Pinch started, initial scale:", currentTransform.scale);
    } else if (touches.length === 1) {
      // Start pan (can pan even at scale 1 for repositioning)
      state.isDragging = true;
      state.isPinching = false;
      state.lastTouchX = touches[0].clientX;
      state.lastTouchY = touches[0].clientY;
      console.log("📱 Drag started");
    }
  }, [getDistance, getPhotoTransform, updatePhotoTransform, selectedPhotoId]);

  // Handle touch move on photo
  const handlePhotoTouchMove = useCallback((e, photoId) => {
    const state = touchStateRef.current;
    const touches = e.touches;
    
    // ALWAYS prevent default to stop page scroll/zoom
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {
      // Passive event listener might prevent this
    }
    
    // Only process if this photo is selected and active
    if (state.activePhotoId !== photoId || selectedPhotoId !== photoId) return;

    const currentTransform = getPhotoTransform(photoId);
    const rect = state.containerRect;

    if (state.isPinching && touches.length === 2) {
      // Calculate new scale based on pinch distance
      const currentDistance = getDistance(touches[0], touches[1]);
      const distanceRatio = currentDistance / state.initialDistance;
      let newScale = state.initialScale * distanceRatio;
      
      // Clamp scale (1x to 4x)
      newScale = clamp(newScale, 1, 4);
      
      // When scaling, also adjust pan to keep within bounds
      // The viewport (container) size in the actual canvas coordinate space
      // Since the canvas is scaled down for display (0.25), we need to know the real size
      const scaleFactor = 4; // 1 / 0.25 = 4
      const viewportWidth = rect ? rect.width * scaleFactor : 1080;
      const viewportHeight = rect ? rect.height * scaleFactor : 1080;
      
      // Calculate new constraints with the new scale
      const { maxPanX, maxPanY } = calculatePanConstraints(newScale, viewportWidth, viewportHeight);
      
      // Clamp current position to new constraints
      const newX = clamp(state.initialX, -maxPanX, maxPanX);
      const newY = clamp(state.initialY, -maxPanY, maxPanY);
      
      console.log("📱 Pinch move, scale:", newScale.toFixed(2), "maxPan:", maxPanX.toFixed(0), maxPanY.toFixed(0));

      updatePhotoTransform(photoId, {
        scale: newScale,
        x: newX,
        y: newY,
      });
    } else if (state.isDragging && touches.length === 1) {
      // Allow pan at any scale for repositioning photo within slot
      // Calculate pan delta
      // Since canvas is displayed at 0.25 scale, touch movement needs to be scaled up
      const scaleFactor = 4; // 1 / 0.25 = 4
      const deltaX = (touches[0].clientX - state.lastTouchX) * scaleFactor;
      const deltaY = (touches[0].clientY - state.lastTouchY) * scaleFactor;
      
      // The viewport size in canvas coordinate space
      const viewportWidth = rect ? rect.width * scaleFactor : 1080;
      const viewportHeight = rect ? rect.height * scaleFactor : 1080;
      
      // Calculate constraints
      const { maxPanX, maxPanY } = calculatePanConstraints(currentTransform.scale, viewportWidth, viewportHeight);
      
      // Apply delta and clamp to constraints
      // Positive deltaX means finger moved right -> photo moves right -> viewport shows more of left side
      const newX = clamp(currentTransform.x + deltaX, -maxPanX, maxPanX);
      const newY = clamp(currentTransform.y + deltaY, -maxPanY, maxPanY);
      
      console.log("📱 Drag move:", {
        delta: [deltaX.toFixed(0), deltaY.toFixed(0)],
        newPos: [newX.toFixed(0), newY.toFixed(0)],
        maxPan: [maxPanX.toFixed(0), maxPanY.toFixed(0)],
        scale: currentTransform.scale.toFixed(2)
      });
      
      updatePhotoTransform(photoId, {
        scale: currentTransform.scale,
        x: newX,
        y: newY,
      });
      
      state.lastTouchX = touches[0].clientX;
      state.lastTouchY = touches[0].clientY;
    }
  }, [clamp, getDistance, getPhotoTransform, updatePhotoTransform, selectedPhotoId, calculatePanConstraints]);

  // Handle touch end on photo
  const handlePhotoTouchEnd = useCallback((e, photoId) => {
    const state = touchStateRef.current;
    const touches = e.touches;
    
    if (state.activePhotoId !== photoId) return;

    const currentTransform = getPhotoTransform(photoId);

    if (touches.length < 2) {
      state.isPinching = false;
    }
    
    if (touches.length === 0) {
      state.isDragging = false;
      // Keep activePhotoId so global handlers can continue working
      // state.activePhotoId = null;
      
      // If scale is below threshold, reset to 1
      if (currentTransform.scale < 1.05) {
        updatePhotoTransform(photoId, { scale: 1, x: 0, y: 0 });
        // Don't deselect on touch end - keep selected for more adjustments
      }
    } else if (touches.length === 1) {
      // Switch from pinch to drag - allow at any scale
      state.isDragging = true;
      state.lastTouchX = touches[0].clientX;
      state.lastTouchY = touches[0].clientY;
    }
  }, [getPhotoTransform, updatePhotoTransform]);

  // ============================================
  // DESKTOP MOUSE/TRACKPAD HANDLERS
  // ============================================
  
  // Mouse state ref for desktop interactions
  const mouseStateRef = useRef({
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    activePhotoId: null,
    containerRect: null,
  });

  // Handle wheel event for trackpad pinch-to-zoom on desktop
  // On MacOS: Trackpad pinch gestures can fire as:
  // 1. Wheel events with ctrlKey = true (Chrome)
  // 2. Wheel events with small deltaY and deltaMode = 0 (Some browsers)
  // 3. GestureEvent (Safari - handled separately)
  const handlePhotoWheel = useCallback((e, photoId, containerEl) => {
    // Only handle if this photo is selected
    if (selectedPhotoId !== photoId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const currentTransform = getPhotoTransform(photoId);
    
    // Get container rect for pan constraint calculations
    const rect = containerEl?.getBoundingClientRect();
    const scaleFactor = 4; // Canvas is displayed at 0.25 scale
    const viewportWidth = rect ? rect.width * scaleFactor : 1080;
    const viewportHeight = rect ? rect.height * scaleFactor : 1080;
    
    // Detect pinch gesture:
    // - ctrlKey is true for Chrome/Firefox trackpad pinch
    // - On Mac Safari, pinch uses GestureEvent, but wheel events still fire
    // - We also check for very small deltaX (indicates pinch, not scroll)
    const isPinchGesture = e.ctrlKey || (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) < 50 && e.deltaMode === 0);
    
    console.log("🖱️ Wheel event:", { 
      ctrlKey: e.ctrlKey, 
      deltaY: e.deltaY.toFixed(2), 
      deltaX: e.deltaX.toFixed(2),
      deltaMode: e.deltaMode,
      isPinch: isPinchGesture,
      selected: selectedPhotoId
    });
    
    if (e.ctrlKey) {
      // Definite pinch-to-zoom (Chrome/Firefox on Mac)
      const zoomSensitivity = 0.01;
      const zoomDelta = -e.deltaY * zoomSensitivity;
      let newScale = currentTransform.scale * (1 + zoomDelta);
      
      // Clamp scale (1x to 4x)
      newScale = clamp(newScale, 1, 4);
      
      // Calculate new pan constraints with the new scale
      const { maxPanX, maxPanY } = calculatePanConstraints(newScale, viewportWidth, viewportHeight);
      
      // Clamp current position to new constraints
      const newX = clamp(currentTransform.x, -maxPanX, maxPanX);
      const newY = clamp(currentTransform.y, -maxPanY, maxPanY);
      
      console.log("🔍 Pinch zoom (ctrlKey), scale:", newScale.toFixed(2));
      
      updatePhotoTransform(photoId, {
        scale: newScale,
        x: newX,
        y: newY,
      });
    } else {
      // Regular scroll - use as pan when zoomed in
      if (currentTransform.scale > 1) {
        const panSensitivity = 2;
        const deltaX = -e.deltaX * panSensitivity * scaleFactor;
        const deltaY = -e.deltaY * panSensitivity * scaleFactor;
        
        const { maxPanX, maxPanY } = calculatePanConstraints(currentTransform.scale, viewportWidth, viewportHeight);
        
        const newX = clamp(currentTransform.x + deltaX, -maxPanX, maxPanX);
        const newY = clamp(currentTransform.y + deltaY, -maxPanY, maxPanY);
        
        updatePhotoTransform(photoId, {
          scale: currentTransform.scale,
          x: newX,
          y: newY,
        });
      }
    }
  }, [selectedPhotoId, getPhotoTransform, updatePhotoTransform, clamp, calculatePanConstraints]);

  // Safari-specific gesture events for pinch-to-zoom
  const handleGestureChange = useCallback((e, photoId, containerEl) => {
    if (selectedPhotoId !== photoId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const currentTransform = getPhotoTransform(photoId);
    
    // e.scale is the cumulative scale factor (1.0 = no change)
    // We apply it relative to a base scale
    let newScale = currentTransform.scale * e.scale;
    
    // Clamp scale (1x to 4x)
    newScale = clamp(newScale, 1, 4);
    
    console.log("🔍 Safari gesture zoom, scale:", newScale.toFixed(2), "gesture.scale:", e.scale.toFixed(2));
    
    const rect = containerEl?.getBoundingClientRect();
    const scaleFactor = 4;
    const viewportWidth = rect ? rect.width * scaleFactor : 1080;
    const viewportHeight = rect ? rect.height * scaleFactor : 1080;
    
    const { maxPanX, maxPanY } = calculatePanConstraints(newScale, viewportWidth, viewportHeight);
    const newX = clamp(currentTransform.x, -maxPanX, maxPanX);
    const newY = clamp(currentTransform.y, -maxPanY, maxPanY);
    
    updatePhotoTransform(photoId, {
      scale: newScale,
      x: newX,
      y: newY,
    });
  }, [selectedPhotoId, getPhotoTransform, updatePhotoTransform, clamp, calculatePanConstraints]);

  // Attach native event listeners for Safari gesture events
  // React doesn't support GestureEvent, so we need to add them manually
  useEffect(() => {
    if (!selectedPhotoId) return;
    
    const containerEl = photoContainerRefs.current[selectedPhotoId];
    if (!containerEl) return;
    
    let gestureStartScale = 1;
    
    const handleGestureStart = (e) => {
      e.preventDefault();
      gestureStartScale = getPhotoTransform(selectedPhotoId).scale;
      console.log("🤏 Gesture start, base scale:", gestureStartScale.toFixed(2));
    };
    
    const handleGestureChangeNative = (e) => {
      e.preventDefault();
      
      const currentTransform = getPhotoTransform(selectedPhotoId);
      
      // e.scale is relative to gesture start
      let newScale = gestureStartScale * e.scale;
      newScale = clamp(newScale, 1, 4);
      
      console.log("🔍 Gesture change, scale:", newScale.toFixed(2));
      
      const rect = containerEl.getBoundingClientRect();
      const scaleFactor = 4;
      const viewportWidth = rect.width * scaleFactor;
      const viewportHeight = rect.height * scaleFactor;
      
      const { maxPanX, maxPanY } = calculatePanConstraints(newScale, viewportWidth, viewportHeight);
      const newX = clamp(currentTransform.x, -maxPanX, maxPanX);
      const newY = clamp(currentTransform.y, -maxPanY, maxPanY);
      
      updatePhotoTransform(selectedPhotoId, {
        scale: newScale,
        x: newX,
        y: newY,
      });
    };
    
    const handleGestureEnd = (e) => {
      e.preventDefault();
      console.log("🤏 Gesture end");
    };
    
    // Add native event listeners (Safari)
    containerEl.addEventListener('gesturestart', handleGestureStart, { passive: false });
    containerEl.addEventListener('gesturechange', handleGestureChangeNative, { passive: false });
    containerEl.addEventListener('gestureend', handleGestureEnd, { passive: false });
    
    // Also prevent default wheel to avoid page zoom
    const handleWheelNative = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    containerEl.addEventListener('wheel', handleWheelNative, { passive: false });
    
    return () => {
      containerEl.removeEventListener('gesturestart', handleGestureStart);
      containerEl.removeEventListener('gesturechange', handleGestureChangeNative);
      containerEl.removeEventListener('gestureend', handleGestureEnd);
      containerEl.removeEventListener('wheel', handleWheelNative);
    };
  }, [selectedPhotoId, getPhotoTransform, updatePhotoTransform, clamp, calculatePanConstraints]);

  // Handle mouse down for desktop click-drag pan
  const handlePhotoMouseDown = useCallback((e, photoId, containerEl) => {
    // Only left mouse button
    if (e.button !== 0) return;
    
    // Only handle if this photo is selected
    if (selectedPhotoId !== photoId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const state = mouseStateRef.current;
    state.isDragging = true;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
    state.activePhotoId = photoId;
    state.containerRect = containerEl?.getBoundingClientRect();
    
    console.log("🖱️ Desktop drag started for photo:", photoId, "at", e.clientX, e.clientY);
  }, [selectedPhotoId]);

  // Handle mouse move for desktop drag pan
  const handlePhotoMouseMove = useCallback((e, photoId) => {
    const state = mouseStateRef.current;
    
    // Only process if dragging this photo
    if (!state.isDragging || state.activePhotoId !== photoId) return;
    if (selectedPhotoId !== photoId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const currentTransform = getPhotoTransform(photoId);
    
    // Calculate pan delta - multiply by scale factor for canvas coordinates
    const scaleFactor = 4; // Canvas is displayed at 0.25 scale
    const deltaX = (e.clientX - state.lastMouseX) * scaleFactor;
    const deltaY = (e.clientY - state.lastMouseY) * scaleFactor;
    
    const rect = state.containerRect;
    const viewportWidth = rect ? rect.width * scaleFactor : 1080;
    const viewportHeight = rect ? rect.height * scaleFactor : 1080;
    
    // Calculate constraints based on current scale
    // Allow panning even at scale 1 (useful for repositioning)
    const { maxPanX, maxPanY } = calculatePanConstraints(currentTransform.scale, viewportWidth, viewportHeight);
    
    // Apply delta and clamp
    const newX = clamp(currentTransform.x + deltaX, -maxPanX, maxPanX);
    const newY = clamp(currentTransform.y + deltaY, -maxPanY, maxPanY);
    
    console.log("🖱️ Drag move, delta:", deltaX.toFixed(0), deltaY.toFixed(0), "pos:", newX.toFixed(0), newY.toFixed(0));
    
    updatePhotoTransform(photoId, {
      scale: currentTransform.scale,
      x: newX,
      y: newY,
    });
    
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
  }, [selectedPhotoId, getPhotoTransform, updatePhotoTransform, clamp, calculatePanConstraints]);

  // Handle mouse up for desktop drag end
  const handlePhotoMouseUp = useCallback((e, photoId) => {
    const state = mouseStateRef.current;
    
    if (state.activePhotoId !== photoId) return;
    
    state.isDragging = false;
    state.activePhotoId = null;
    
    console.log("🖱️ Desktop drag ended for photo:", photoId);
  }, []);

  // Global mouse event listeners for desktop drag (to handle mouse leaving element)
  useEffect(() => {
    if (!selectedPhotoId) return;
    
    const state = mouseStateRef.current;
    
    const handleGlobalMouseMove = (e) => {
      if (!state.isDragging || !state.activePhotoId) return;
      if (selectedPhotoId !== state.activePhotoId) return;
      
      const currentTransform = getPhotoTransform(state.activePhotoId);
      
      // Calculate pan delta
      const scaleFactor = 4;
      const deltaX = (e.clientX - state.lastMouseX) * scaleFactor;
      const deltaY = (e.clientY - state.lastMouseY) * scaleFactor;
      
      const rect = state.containerRect;
      const viewportWidth = rect ? rect.width * scaleFactor : 1080;
      const viewportHeight = rect ? rect.height * scaleFactor : 1080;
      
      const { maxPanX, maxPanY } = calculatePanConstraints(currentTransform.scale, viewportWidth, viewportHeight);
      
      const newX = clamp(currentTransform.x + deltaX, -maxPanX, maxPanX);
      const newY = clamp(currentTransform.y + deltaY, -maxPanY, maxPanY);
      
      updatePhotoTransform(state.activePhotoId, {
        scale: currentTransform.scale,
        x: newX,
        y: newY,
      });
      
      state.lastMouseX = e.clientX;
      state.lastMouseY = e.clientY;
    };
    
    const handleGlobalMouseUp = (e) => {
      if (!state.isDragging || !state.activePhotoId) return;
      
      const photoId = state.activePhotoId;
      
      console.log("🖱️ Desktop drag ended for photo:", photoId);
      
      state.isDragging = false;
      state.activePhotoId = null;
      
      // Don't auto-reset - let user keep their pan position
    };
    
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [selectedPhotoId, getPhotoTransform, updatePhotoTransform, clamp, calculatePanConstraints]);

  // Ref to store photo container elements for native event binding
  const photoContainerRefs = useRef({});

  // GLOBAL touch handlers for pinch-to-zoom AND pan/drag from anywhere on screen
  // This allows user to pinch/drag with fingers anywhere on screen when photo is selected
  useEffect(() => {
    if (!selectedPhotoId) return;
    
    const state = touchStateRef.current;
    
    // Track if this is a simple tap (for clearing selection)
    let tapStartTime = 0;
    let tapStartX = 0;
    let tapStartY = 0;
    let hasMoved = false;
    
    const handleGlobalTouchStart = (e) => {
      const touches = e.touches;
      
      // Track potential tap
      if (touches.length === 1) {
        tapStartTime = Date.now();
        tapStartX = touches[0].clientX;
        tapStartY = touches[0].clientY;
        hasMoved = false;
      }
      
      if (!selectedPhotoId) return;
      
      // If photo is selected but not yet active (first touch was outside photo area)
      // We activate it for global gestures
      if (!state.activePhotoId && selectedPhotoId) {
        state.activePhotoId = selectedPhotoId;
        const currentTransform = getPhotoTransform(selectedPhotoId);
        state.initialScale = currentTransform.scale;
        state.initialX = currentTransform.x;
        state.initialY = currentTransform.y;
      }
      
      // If we have 2 touches, start pinch
      if (touches.length === 2 && state.activePhotoId) {
        e.preventDefault();
        state.isPinching = true;
        state.isDragging = false;
        hasMoved = true; // Pinch is not a tap
        state.initialDistance = getDistance(touches[0], touches[1]);
        
        const currentTransform = getPhotoTransform(state.activePhotoId);
        state.initialScale = currentTransform.scale;
        state.initialX = currentTransform.x;
        state.initialY = currentTransform.y;
        
        console.log("📱 Global pinch started from anywhere on screen");
      } else if (touches.length === 1 && state.activePhotoId) {
        // Single touch - start dragging (for pan)
        const currentTransform = getPhotoTransform(state.activePhotoId);
        // Allow pan even at scale 1 for repositioning photo within slot
        state.isDragging = true;
        state.isPinching = false;
        state.lastTouchX = touches[0].clientX;
        state.lastTouchY = touches[0].clientY;
        console.log("📱 Global drag started, scale:", currentTransform.scale);
      }
    };
    
    const handleGlobalTouchMove = (e) => {
      const touches = e.touches;
      
      // Check if moved significantly (more than 10px = not a tap)
      if (touches.length >= 1) {
        const dx = Math.abs(touches[0].clientX - tapStartX);
        const dy = Math.abs(touches[0].clientY - tapStartY);
        if (dx > 10 || dy > 10) {
          hasMoved = true;
        }
      }
      
      if (!selectedPhotoId || !state.activePhotoId) return;
      
      const photoId = state.activePhotoId;
      
      // Handle pinch zoom from anywhere
      if (state.isPinching && touches.length === 2) {
        e.preventDefault();
        
        const currentDistance = getDistance(touches[0], touches[1]);
        const distanceRatio = currentDistance / state.initialDistance;
        let newScale = state.initialScale * distanceRatio;
        
        // Clamp scale (1x to 4x)
        newScale = clamp(newScale, 1, 4);
        
        const rect = state.containerRect;
        const scaleFactor = 4;
        const viewportWidth = rect ? rect.width * scaleFactor : 1080;
        const viewportHeight = rect ? rect.height * scaleFactor : 1080;
        
        const { maxPanX, maxPanY } = calculatePanConstraints(newScale, viewportWidth, viewportHeight);
        const newX = clamp(state.initialX, -maxPanX, maxPanX);
        const newY = clamp(state.initialY, -maxPanY, maxPanY);
        
        updatePhotoTransform(photoId, {
          scale: newScale,
          x: newX,
          y: newY,
        });
        
        console.log("📱 Global pinch move, scale:", newScale.toFixed(2));
      } else if (state.isDragging && touches.length === 1) {
        // Handle drag/pan from anywhere
        e.preventDefault();
        
        const currentTransform = getPhotoTransform(photoId);
        
        // Calculate pan delta
        const scaleFactor = 4; // 1 / 0.25 = 4
        const deltaX = (touches[0].clientX - state.lastTouchX) * scaleFactor;
        const deltaY = (touches[0].clientY - state.lastTouchY) * scaleFactor;
        
        const rect = state.containerRect;
        const viewportWidth = rect ? rect.width * scaleFactor : 1080;
        const viewportHeight = rect ? rect.height * scaleFactor : 1080;
        
        // Calculate constraints based on current scale
        const { maxPanX, maxPanY } = calculatePanConstraints(currentTransform.scale, viewportWidth, viewportHeight);
        
        // Apply delta and clamp
        const newX = clamp(currentTransform.x + deltaX, -maxPanX, maxPanX);
        const newY = clamp(currentTransform.y + deltaY, -maxPanY, maxPanY);
        
        updatePhotoTransform(photoId, {
          scale: currentTransform.scale,
          x: newX,
          y: newY,
        });
        
        state.lastTouchX = touches[0].clientX;
        state.lastTouchY = touches[0].clientY;
        
        console.log("📱 Global drag move:", { deltaX: deltaX.toFixed(0), deltaY: deltaY.toFixed(0) });
      }
    };
    
    const handleGlobalTouchEnd = (e) => {
      const touches = e.touches;
      const changedTouches = e.changedTouches;
      
      // Check if this was a simple tap (short duration, no movement)
      const tapDuration = Date.now() - tapStartTime;
      const isQuickTap = tapDuration < 300 && !hasMoved;
      
      // If it was a quick tap and we have selection, check if tap was outside photo
      if (isQuickTap && (selectedPhotoId || swapSourceId) && changedTouches.length > 0) {
        const touch = changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const isOnPhoto = element?.closest('[data-photo-container="true"]');
        
        if (!isOnPhoto) {
          console.log("👆 Quick tap outside photo detected - clearing selection");
          setSwapSourceId(null);
          setSelectedPhotoId(null);
          state.activePhotoId = null;
          state.isDragging = false;
          state.isPinching = false;
          return; // Don't process further
        }
      }
      
      if (!selectedPhotoId || !state.activePhotoId) return;
      
      const photoId = state.activePhotoId;
      
      if (touches.length < 2) {
        state.isPinching = false;
      }
      
      if (touches.length === 0) {
        state.isDragging = false;
        
        const currentTransform = getPhotoTransform(photoId);
        if (currentTransform.scale < 1.05) {
          updatePhotoTransform(photoId, { scale: 1, x: 0, y: 0 });
        }
      } else if (touches.length === 1) {
        // Switch from pinch to drag
        state.isDragging = true;
        state.lastTouchX = touches[0].clientX;
        state.lastTouchY = touches[0].clientY;
      }
    };
    
    // Handle tap outside to clear selection
    const handleGlobalClick = (e) => {
      // Only process if we have a selected photo
      if (!selectedPhotoId && !swapSourceId) return;
      
      // Check if click/tap was on a photo container
      const isOnPhoto = e.target.closest('[data-photo-container="true"]');
      
      // If not on photo, clear selection
      if (!isOnPhoto) {
        console.log("👆 Global tap outside photo - clearing selection");
        setSwapSourceId(null);
        setSelectedPhotoId(null);
        state.activePhotoId = null;
        state.isDragging = false;
        state.isPinching = false;
      }
    };
    
    // Add global listeners
    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: false });
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });
    document.addEventListener('click', handleGlobalClick, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleGlobalTouchStart);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [selectedPhotoId, swapSourceId, getDistance, getPhotoTransform, updatePhotoTransform, clamp, calculatePanConstraints]);

  // Effect to prevent browser default gestures on photo containers
  // This is needed because React's onTouchStart/Move are passive by default
  useEffect(() => {
    const preventDefaultHandler = (e) => {
      // Only prevent if we're interacting with a selected photo
      if (selectedPhotoId && touchStateRef.current.activePhotoId) {
        e.preventDefault();
      }
    };

    // Add non-passive listeners to all photo containers
    const containers = Object.values(photoContainerRefs.current);
    containers.forEach(container => {
      if (container) {
        container.addEventListener('touchstart', preventDefaultHandler, { passive: false });
        container.addEventListener('touchmove', preventDefaultHandler, { passive: false });
      }
    });

    return () => {
      containers.forEach(container => {
        if (container) {
          container.removeEventListener('touchstart', preventDefaultHandler);
          container.removeEventListener('touchmove', preventDefaultHandler);
        }
      });
    };
  }, [selectedPhotoId, designerElements]);

  // Also prevent gestures on the whole preview area when a photo is selected
  const previewContainerRef = useRef(null);
  const hasScrolledRef = useRef(false);

  // Auto-scroll to show frame from top on mobile when page loads
  useEffect(() => {
    if (!isMobileDevice || hasScrolledRef.current || loading) return;
    
    // Disable browser's scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const scrollToFrame = () => {
      // Scroll to fixed position: just past Preview title to show full frame
      window.scrollTo(0, 85);
      document.documentElement.scrollTop = 85;
      document.body.scrollTop = 85;
      hasScrolledRef.current = true;
    };

    // Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      scrollToFrame();
      // Multiple attempts for Safari
      setTimeout(scrollToFrame, 50);
      setTimeout(scrollToFrame, 100);
      setTimeout(scrollToFrame, 200);
      setTimeout(scrollToFrame, 400);
    });
  }, [isMobileDevice, loading]);
  
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const preventGestures = (e) => {
      // Prevent pinch-zoom and pan when a photo is selected
      if (selectedPhotoId) {
        // Check if touch is on a photo element or if we're pinching
        const state = touchStateRef.current;
        if (state.activePhotoId || state.isPinching) {
          e.preventDefault();
        }
      }
    };

    container.addEventListener('touchstart', preventGestures, { passive: false });
    container.addEventListener('touchmove', preventGestures, { passive: false });
    
    // Prevent page zoom on double-tap
    container.addEventListener('gesturestart', (e) => e.preventDefault());
    container.addEventListener('gesturechange', (e) => e.preventDefault());
    container.addEventListener('gestureend', (e) => e.preventDefault());

    return () => {
      container.removeEventListener('touchstart', preventGestures);
      container.removeEventListener('touchmove', preventGestures);
      container.removeEventListener('gesturestart', (e) => e.preventDefault());
      container.removeEventListener('gesturechange', (e) => e.preventDefault());
      container.removeEventListener('gestureend', (e) => e.preventDefault());
    };
  }, [selectedPhotoId]);

  const hasValidVideo = useMemo(() => {
    if (!Array.isArray(videos)) return false;
    return videos.some((video) => video && (video.dataUrl || video.blob));
  }, [videos]);

  useEffect(() => {
    console.log("📦 Loading data from localStorage...");
    
    // DEBUG: Check raw localStorage
    console.log("🔍 [DEBUG] Raw localStorage check:");
    const rawPhotos = localStorage.getItem("capturedPhotos");
    console.log("   - capturedPhotos raw:", rawPhotos ? `Found (${rawPhotos.length} chars)` : "NOT FOUND");
    if (rawPhotos) {
      try {
        const parsed = JSON.parse(rawPhotos);
        console.log("   - Parsed photos count:", parsed?.length || 0);
        console.log("   - First photo preview:", parsed?.[0]?.substring?.(0, 50) || "N/A");
      } catch (e) {
        console.log("   - Parse error:", e.message);
      }
    }

    // Clear stale cache (older than 24 hours)
    clearStaleFrameCache();

    const loadFrameData = async () => {
      try {
        // CRITICAL FIX: Check for shared frame in sessionStorage FIRST
        // Shared frames are stored in sessionStorage to avoid conflicts with user's personal drafts
        const SHARED_FRAME_KEY = '__fremio_shared_frame_temp__';
        let sharedFrameData = null;
        try {
          const rawSharedData = sessionStorage.getItem(SHARED_FRAME_KEY);
          if (rawSharedData) {
            sharedFrameData = JSON.parse(rawSharedData);
            console.log("🔗 [SHARED FRAME] Found in sessionStorage:", {
              hasFrameConfig: !!sharedFrameData?.frameConfig,
              hasDraftData: !!sharedFrameData?.draftData
            });
          }
        } catch (e) {
          console.warn("⚠️ Failed to read shared frame from sessionStorage:", e);
        }

        // PRIORITY 0 FALLBACK: Re-fetch full frame from VPS using cached shareId.
        // The full frameConfig (base64 images) is often too large for sessionStorage/localStorage.
        // Storing only the 8-char shareId is guaranteed to fit, so we always re-fetch.
        if (!sharedFrameData?.frameConfig?.designer?.elements?.length) {
          const cachedShareId = sessionStorage.getItem("__fremio_share_id__");
          if (cachedShareId) {
            console.log("🔗 [VPS REFETCH] Fetching frame from VPS shareId:", cachedShareId);
            try {
              const draftSvc = (await import("../services/draftService.js")).default;
              const cloudDraft = await draftSvc.getSharedDraft(cachedShareId);
              if (cloudDraft?.frame_data) {
                const frameData =
                  typeof cloudDraft.frame_data === "string"
                    ? JSON.parse(cloudDraft.frame_data)
                    : cloudDraft.frame_data;
                const canvasWidth = frameData.canvasWidth || 1080;
                const canvasHeight = frameData.canvasHeight || 1920;
                const photoElements = (frameData.elements || []).filter(
                  (el) => el?.type === "photo"
                );
                const vpsConfig = {
                  id: `shared-${cachedShareId}`,
                  title: cloudDraft.title || "Shared Frame",
                  aspectRatio: frameData.aspectRatio || "9:16",
                  elements: frameData.elements || [],
                  canvasBackground: frameData.canvasBackground || "#f7f1ed",
                  frameImage: cloudDraft.preview_url || null,
                  imagePath: cloudDraft.preview_url || null,
                  thumbnailUrl: cloudDraft.preview_url || null,
                  image_url: cloudDraft.preview_url || null,
                  canvasWidth,
                  canvasHeight,
                  maxCaptures: photoElements.length || 1,
                  slots: photoElements.map((el, idx) => ({
                    id: el.id || `slot_${idx + 1}`,
                    left: el.x / canvasWidth,
                    top: el.y / canvasHeight,
                    width: el.width / canvasWidth,
                    height: el.height / canvasHeight,
                    zIndex: el.zIndex || 1,
                    photoIndex: idx,
                  })),
                  designer: {
                    elements: frameData.elements || [],
                    canvasBackground: frameData.canvasBackground || "#f7f1ed",
                    aspectRatio: frameData.aspectRatio || "9:16",
                    canvasWidth,
                    canvasHeight,
                  },
                  isCustom: true,
                  isSharedFrame: true,
                  shareId: cachedShareId,
                  preview: cloudDraft.preview_url,
                };
                sharedFrameData = {
                  frameConfig: vpsConfig,
                  draftData: {
                    id: vpsConfig.id,
                    title: cloudDraft.title,
                    aspectRatio: frameData.aspectRatio,
                    elements: [],
                    canvasBackground: frameData.canvasBackground,
                    canvasWidth,
                    canvasHeight,
                    isShared: true,
                  },
                };
                console.log(
                  `✅ [EditPhoto] Re-fetched frame from VPS: shareId=${cachedShareId}, elements=${frameData.elements?.length || 0}`
                );
              }
            } catch (fetchErr) {
              console.warn("⚠️ [EditPhoto] VPS re-fetch failed:", fetchErr.message);
            }
          }
        }

        // CRITICAL FIX: Use userStorage for activeDraftId (Create.jsx uses userStorage which prefixes with user email)
        let activeDraftId = userStorage.getItem("activeDraftId");
        const hasSharedFrameSession = Boolean(sharedFrameData?.frameConfig);
        
        console.log("🔍 activeDraftId from userStorage:", activeDraftId);
        console.log("🔍 Has shared frame in session:", !!sharedFrameData);
        
        let recoveryDraft;
        const loadDraftForRecovery = async () => {
          if (recoveryDraft !== undefined) {
            return recoveryDraft ?? null;
          }
          
          try {
            // PRIORITY 1: Check for shared frame in sessionStorage
            if (sharedFrameData?.draftData) {
              console.log("✅ [SHARED FRAME] Using draft data from sessionStorage");
              recoveryDraft = {
                id: sharedFrameData.draftData.id,
                title: sharedFrameData.draftData.title,
                aspectRatio: sharedFrameData.draftData.aspectRatio,
                elements: sharedFrameData.draftData.elements,
                canvasBackground: sharedFrameData.draftData.canvasBackground,
                canvasWidth: sharedFrameData.draftData.canvasWidth,
                canvasHeight: sharedFrameData.draftData.canvasHeight,
                preview: sharedFrameData.draftData.preview,
                isShared: true
              };
              return recoveryDraft;
            }
            
            // PRIORITY 2: Load from user's personal drafts (IndexedDB)
            if (!activeDraftId) {
              return null;
            }
            
            // Use preloaded module or fallback to dynamic import
            const draftStorage = draftStorageModule?.default || 
              (await import("../utils/draftStorage.js")).default;
            const draft = await draftStorage.getDraftById(activeDraftId);
            recoveryDraft = draft ?? null;
            if (!draft) {
              console.warn("⚠️ Draft not found for recovery:", activeDraftId);
            }
          } catch (draftError) {
            console.error("❌ Failed to load draft for recovery:", draftError);
            recoveryDraft = null;
          }
          return recoveryDraft;
        };

        // Load photos - try direct localStorage first, then safeStorage
        let photosFromStorage = null;
        
        // DEBUG: Dump all localStorage keys
        console.log("🔍 [DEBUG] ======= PHOTO LOADING START =======");
        console.log("🔍 [DEBUG] All localStorage keys:");
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const val = localStorage.getItem(key);
          console.log(`   ${key}: ${val ? val.length + ' chars' : 'null'}`);
        }
        
        // Check window backup first
        if (window.__fremio_photos && window.__fremio_photos.length > 0) {
          console.log("🆘 [BACKUP] Found photos in window.__fremio_photos:", window.__fremio_photos.length);
          console.log("🆘 [BACKUP] First photo type:", typeof window.__fremio_photos[0]);
          console.log("🆘 [BACKUP] First photo preview:", window.__fremio_photos[0]?.substring?.(0, 50) || "not string");
          photosFromStorage = window.__fremio_photos;
        }
        
        // Try direct localStorage
        if (!photosFromStorage || photosFromStorage.length === 0) {
          try {
            const rawPhotos = localStorage.getItem("capturedPhotos");
            console.log("📸 [DEBUG] Raw capturedPhotos:", rawPhotos ? `Found (${rawPhotos.length} chars)` : "NOT FOUND");
            
            if (rawPhotos) {
              // Check if data is compressed (starts with __cmp__:)
              const isCompressed = rawPhotos.startsWith("__cmp__:");
              console.log("📸 [DEBUG] Is compressed:", isCompressed);
              
              if (isCompressed) {
                // Use safeStorage to decompress
                console.log("📸 [DEBUG] Data is compressed, using safeStorage to read...");
                photosFromStorage = safeStorage.getJSON("capturedPhotos");
              } else {
                photosFromStorage = JSON.parse(rawPhotos);
              }
              
              console.log("📸 [DEBUG] Parsed photos count:", photosFromStorage?.length || 0);
              console.log("📸 [DEBUG] Parsed photos isArray:", Array.isArray(photosFromStorage));
              if (photosFromStorage?.length > 0) {
                console.log("📸 [DEBUG] First photo type:", typeof photosFromStorage[0]);
                console.log("📸 [DEBUG] First photo preview:", 
                  typeof photosFromStorage[0] === 'string' 
                    ? photosFromStorage[0].substring(0, 50) 
                    : JSON.stringify(photosFromStorage[0]).substring(0, 100));
              }
            }
          } catch (directError) {
            console.warn("⚠️ Direct localStorage read failed:", directError);
          }
        }
        
        // Fallback to safeStorage (for compressed data)
        if (!photosFromStorage || !Array.isArray(photosFromStorage) || photosFromStorage.length === 0) {
          photosFromStorage = safeStorage.getJSON("capturedPhotos");
          console.log("📸 Loaded photos from safeStorage:", photosFromStorage?.length || 0);
        }
        
        let resolvedPhotos = Array.isArray(photosFromStorage)
          ? [...photosFromStorage]
          : [];

        // If photos not found, try sessionStorage backup
        if (resolvedPhotos.length === 0) {
          try {
            const sessionBackup = sessionStorage.getItem("capturedPhotos_backup");
            if (sessionBackup) {
              const parsed = JSON.parse(sessionBackup);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log("🆘 [BACKUP] Found photos in sessionStorage backup:", parsed.length);
                resolvedPhotos = parsed;
                // Copy to localStorage for consistency
                localStorage.setItem("capturedPhotos", sessionBackup);
              }
            }
          } catch (sessionErr) {
            console.warn("⚠️ sessionStorage backup read failed:", sessionErr);
          }
        }

        // If still no photos, wait a bit and retry (storage might be delayed)
        if (resolvedPhotos.length === 0) {
          console.log("⏳ [RETRY] No photos found, waiting 100ms and retrying...");
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const retryRaw = localStorage.getItem("capturedPhotos");
          if (retryRaw) {
            try {
              const retryParsed = JSON.parse(retryRaw);
              if (Array.isArray(retryParsed) && retryParsed.length > 0) {
                console.log("✅ [RETRY] Found photos after delay:", retryParsed.length);
                resolvedPhotos = retryParsed;
              }
            } catch (retryErr) {
              console.warn("⚠️ Retry parse failed:", retryErr);
            }
          }
          
          // Also check window backup again
          if (resolvedPhotos.length === 0 && window.__fremio_photos?.length > 0) {
            console.log("✅ [RETRY] Found photos in window.__fremio_photos:", window.__fremio_photos.length);
            resolvedPhotos = window.__fremio_photos;
          }
        }

        if (resolvedPhotos.length === 0 && activeDraftId) {
          const draft = await loadDraftForRecovery();
          if (draft?.capturedPhotos?.length) {
            resolvedPhotos = [...draft.capturedPhotos];
            console.log("♻️ Recovered photos from draft storage:", {
              activeDraftId,
              count: resolvedPhotos.length,
            });
            try {
              safeStorage.setJSON("capturedPhotos", resolvedPhotos);
            } catch (rehydrateError) {
              console.warn(
                "⚠️ Could not rehydrate capturedPhotos into localStorage:",
                rehydrateError
              );
            }
          }
        }

        if (resolvedPhotos.length > 0) {
          // CRITICAL FIX: Normalize photos to ensure they are strings (dataUrl format)
          // Photos can come as strings or objects with {dataUrl, previewUrl, blob, ...}
          const normalizedPhotos = resolvedPhotos.map((photo, idx) => {
            // Already a data URL string
            if (typeof photo === 'string' && photo.startsWith('data:')) {
              console.log(`📸 Photo ${idx}: Already a data URL string`);
              return photo;
            }
            // Object with dataUrl property
            if (photo?.dataUrl && typeof photo.dataUrl === 'string' && photo.dataUrl.startsWith('data:')) {
              console.log(`📸 Photo ${idx}: Extracted dataUrl from object`);
              return photo.dataUrl;
            }
            // Object with previewUrl that is a data URL (not blob URL)
            if (photo?.previewUrl && typeof photo.previewUrl === 'string' && photo.previewUrl.startsWith('data:')) {
              console.log(`📸 Photo ${idx}: Using previewUrl (data URL)`);
              return photo.previewUrl;
            }
            // Unknown format - log warning
            console.warn(`⚠️ Photo ${idx}: Unknown format, skipping:`, {
              type: typeof photo,
              hasDataUrl: !!photo?.dataUrl,
              hasPreviewUrl: !!photo?.previewUrl,
              preview: typeof photo === 'string' ? photo.substring(0, 50) : JSON.stringify(photo).substring(0, 100),
            });
            return null;
          }).filter(Boolean);

          console.log("✅ Loaded and normalized photos:", {
            original: resolvedPhotos.length,
            normalized: normalizedPhotos.length,
          });
          
          if (normalizedPhotos.length > 0) {
            console.log("📸 [NORMALIZED] First photo type:", typeof normalizedPhotos[0]);
            console.log("📸 [NORMALIZED] First photo preview:", normalizedPhotos[0]?.substring?.(0, 50) || "empty");
          } else {
            console.error("❌ [NORMALIZED] No photos after normalization!");
          }
          
          setPhotos(normalizedPhotos);
          
          // Also update resolvedPhotos for use later in frame config loading
          resolvedPhotos = normalizedPhotos;
          console.log("📸 [RESOLVED] resolvedPhotos updated to normalizedPhotos, length:", resolvedPhotos.length);
        } else {
          setPhotos([]);
          console.log("ℹ️ No captured photos found in storage or draft");
        }

        // Load videos
        let videosFromStorage = safeStorage.getJSON("capturedVideos");
        console.log("🔍 Loading videos from storage:", {
          found: !!videosFromStorage,
          isArray: Array.isArray(videosFromStorage),
          length: videosFromStorage?.length || 0,
        });

        let resolvedVideos = Array.isArray(videosFromStorage)
          ? [...videosFromStorage]
          : [];

        if (resolvedVideos.length === 0 && activeDraftId) {
          const draft = await loadDraftForRecovery();
          if (draft?.capturedVideos?.length) {
            resolvedVideos = [...draft.capturedVideos];
            console.log("♻️ Recovered videos from draft storage:", {
              activeDraftId,
              count: resolvedVideos.length,
            });
            try {
              safeStorage.setJSON("capturedVideos", resolvedVideos);
            } catch (rehydrateError) {
              console.warn(
                "⚠️ Could not rehydrate capturedVideos into localStorage:",
                rehydrateError
              );
            }
          }
        }

        if (resolvedVideos.length) {
          const normalizedVideos = resolvedVideos.map((entry, index) => {
            if (!entry) return null;

            // Legacy format: string data URL
            if (typeof entry === "string") {
              if (entry.startsWith("data:")) {
                return {
                  id: `video-${index}`,
                  dataUrl: entry,
                  mimeType:
                    entry.substring(5, entry.indexOf(";")) || "video/webm",
                  duration: null,
                  timer: null,
                  source: "legacy-string",
                };
              }
              console.warn(
                "⚠️ Unknown video string format:",
                entry.substring(0, 30)
              );
              return null;
            }

            if (typeof entry === "object") {
              if (entry.dataUrl || entry.blob) {
                return {
                  id: entry.id || `video-${index}`,
                  dataUrl: entry.dataUrl || null,
                  blob: entry.blob || null,
                  mimeType:
                    entry.mimeType ||
                    entry.dataUrl?.substring(5, entry.dataUrl.indexOf(";")) ||
                    "video/webm",
                  duration: Number.isFinite(entry.duration)
                    ? entry.duration
                    : null,
                  timer: Number.isFinite(entry.timer) ? entry.timer : null,
                  mirrored: Boolean(entry.mirrored),
                  requiresPreviewMirror: Boolean(entry.requiresPreviewMirror),
                  facingMode: entry.facingMode || null,
                  sizeBytes: entry.sizeBytes ?? null,
                  recordedAt: entry.recordedAt ?? entry.capturedAt ?? null,
                  source: entry.source || "camera-recording",
                };
              }
              console.warn("⚠️ Video entry missing dataUrl/blob:", entry);
              return null;
            }

            console.warn(
              "⚠️ Unsupported video entry type:",
              typeof entry,
              entry
            );
            return null;
          });

          const validVideoCount = normalizedVideos.filter(
            (v) => v && (v.dataUrl || v.blob)
          ).length;
          
          // DUPLICATE MODE FIX: If we have fewer videos than photos, duplicate videos to match
          // This handles cases where TakeMoment didn't duplicate videos properly
          if (normalizedVideos.length > 0 && resolvedPhotos.length > normalizedVideos.length) {
            console.log("🔁 [EDITPHOTO] Duplicating videos to match photos...");
            console.log("  - Photos count:", resolvedPhotos.length);
            console.log("  - Videos count:", normalizedVideos.length);
            
            const targetCount = resolvedPhotos.length;
            const originalCount = normalizedVideos.length;
            const duplicatedVideos = [];
            
            // Calculate ratio: how many times each video should be duplicated
            const ratio = Math.ceil(targetCount / originalCount);
            
            for (let i = 0; i < originalCount; i++) {
              const video = normalizedVideos[i];
              for (let j = 0; j < ratio; j++) {
                if (duplicatedVideos.length >= targetCount) break;
                if (video) {
                  duplicatedVideos.push({
                    ...video,
                    id: j === 0 ? video.id : `${video.id}-dup-${j}`,
                  });
                } else {
                  duplicatedVideos.push(null);
                }
              }
            }
            
            // Use duplicated videos
            const finalVideos = duplicatedVideos.slice(0, targetCount);
            setVideos(finalVideos);
            
            console.log("✅ [EDITPHOTO] Videos duplicated:", {
              originalCount,
              targetCount,
              finalCount: finalVideos.length,
            });
          } else {
            setVideos(normalizedVideos);
          }

          console.log("✅ Videos normalized:", {
            totalEntries: resolvedVideos.length,
            normalizedEntries: normalizedVideos.length,
            validEntries: validVideoCount,
          });
        } else {
          console.log("ℹ️ No videos found in storage");
          setVideos([]);
        }

        // Load frame config
        console.log("🔍 Step 4: Loading frame config...");
        
        // PRIORITY 1: Check sessionStorage for shared frame
        let config = null;
        if (sharedFrameData?.frameConfig) {
          console.log("✅ Using frameConfig from sessionStorage (shared frame)");
          config = sharedFrameData.frameConfig;
        }
        
        // PRIORITY 2: Check localStorage for user's personal frame
        if (!config) {
          config = safeStorage.getJSON("frameConfig");
          console.log("   frameConfig from localStorage:", !!config, config?.id);
        }
        
        // 🆕 FALLBACK: If no config in storage, try frameProvider memory
        if (!config || !config.id) {
          console.log("⚠️ No config in storage, checking frameProvider memory...");
          const memoryConfig = frameProvider.getCurrentConfig();
          if (memoryConfig?.id) {
            console.log("✅ Found config in frameProvider memory:", memoryConfig.id);
            config = memoryConfig;
            // Only persist to localStorage if it's NOT a shared frame
            if (!config.__isSharedFrame) {
              try {
                safeStorage.setJSON("frameConfig", {
                  ...config,
                  __timestamp: Date.now(),
                  __savedFrom: "EditPhoto_memoryFallback"
                });
                safeStorage.setItem("frameConfigTimestamp", String(Date.now()));
                safeStorage.setItem("selectedFrame", config.id);
                console.log("✅ Persisted frameProvider config to localStorage");
              } catch (e) {
                console.warn("⚠️ Failed to persist config:", e);
              }
            }
          } else {
            console.log("❌ No config in frameProvider memory either");
          }
        }
        
        // CRITICAL DEBUG: Check what's in the loaded config
        if (config) {
          console.log("🔍 [DEBUG] Loaded frameConfig structure:", {
            id: config.id,
            isCustom: config.isCustom,
            hasDesigner: !!config.designer,
            hasDesignerElements: !!config.designer?.elements,
            designerElementsCount: config.designer?.elements?.length || 0,
            designerElementTypes: config.designer?.elements?.map(el => el?.type) || [],
            slotsCount: config.slots?.length || 0,
          });
        }

        // CRITICAL: Only reload from service for Supabase frames (UUID ids).
        // Some locally-generated custom frames use ids like "frame_..." and must NOT hit the service.
        const selectedFrameId = safeStorage.getItem("selectedFrame");
        
        // Helper to detect UUID (Supabase custom frames)
        const isUUID = (str) => {
          if (typeof str !== 'string') return false;
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        };
        
        const isSupabaseFrame = isUUID(selectedFrameId) || isUUID(config?.id);
        const isLocalCustomId =
          selectedFrameId?.startsWith("custom-") ||
          selectedFrameId?.startsWith("draft-") ||
          selectedFrameId?.startsWith("shared-") ||
          selectedFrameId?.startsWith("frame_") ||
          config?.id?.startsWith("frame_");
        
        // For draft-based custom frames, DON'T try to load from service
        // They don't exist in Supabase - they're stored locally
        // Includes: custom-xxx, draft-xxx, shared-xxx prefixes
        const isDraftBasedCustomFrame = hasSharedFrameSession || isLocalCustomId;
        
        if (config?.isCustom && isSupabaseFrame && !isDraftBasedCustomFrame) {
          console.log("🔄 Supabase custom frame detected (UUID), reloading from service...");
          
          // First, save the original config's image URL as fallback
          const originalImageUrl = config?.imagePath || config?.frameImage || config?.thumbnailUrl || config?.image_url;
          
          try {
            // Use preloaded module or fallback to dynamic import
            const frameService = unifiedFrameServiceModule?.default || 
              (await import("../services/unifiedFrameService")).default;

            // Prevent infinite loading (some devices/network conditions can hang fetch)
            const withTimeout = (promise, ms) =>
              Promise.race([
                promise,
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`getFrameConfig timeout after ${ms}ms`)), ms)
                ),
              ]);

            const freshConfig = await withTimeout(
              frameService.getFrameConfig(selectedFrameId || config?.id),
              5000
            );
            if (freshConfig) {
              config = freshConfig;
              console.log(
                "✅ Reloaded custom frame from service with pixel values"
              );
            }
          } catch (error) {
            console.warn("⚠️ Failed to reload from service:", error);
            // IMPORTANT: Keep using the existing config from localStorage
            // and ensure it has the image URL
            if (config && !config.frameImage && originalImageUrl) {
              config.frameImage = originalImageUrl;
              config.imagePath = originalImageUrl;
              console.log("🔧 Using cached image URL:", originalImageUrl?.substring(0, 80));
            }
          }
        } else if (isDraftBasedCustomFrame) {
          console.log("🎨 Local/draft-based custom frame detected, skipping service reload");
          // Keep existing config from localStorage, or it will be loaded from draft in fallback
        }

        // Validate frameConfig timestamp to prevent stale cache
        // BUT: Skip timestamp validation for draft-based frames since they manage their own state
        if (config && !isDraftBasedCustomFrame) {
          const storedTimestamp = safeStorage.getItem("frameConfigTimestamp");
          const configTimestamp = config.__timestamp;

          console.log("🕐 Timestamp validation:", {
            storedTimestamp,
            configTimestamp,
            match: storedTimestamp === String(configTimestamp),
          });

          // If timestamps don't match, frameConfig is stale
          if (
            storedTimestamp &&
            configTimestamp &&
            storedTimestamp !== String(configTimestamp)
          ) {
            console.warn(
              "⚠️ FrameConfig timestamp mismatch, clearing stale data"
            );
            safeStorage.removeItem("frameConfig");
            safeStorage.removeItem("frameConfigTimestamp");
            config = null;
          }
        } else if (config && isDraftBasedCustomFrame) {
          console.log("✅ Draft-based frame: skipping timestamp validation, using existing config");
        }

        // CRITICAL FIX: If no config at all, try multiple fallbacks
        if (!config) {
          console.log(
            "⚠️ No frameConfig in localStorage, checking fallbacks..."
          );

          // Try to get selected frame ID
          const selectedFrameId = safeStorage.getItem("selectedFrame");
          console.log("  - Selected frame ID:", selectedFrameId);
          
          // Helper to detect UUID (Supabase custom frames)
          const isUUIDCheck = (str) => {
            if (typeof str !== 'string') return false;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
          };
          
          // Check if it's a draft-based custom frame vs Supabase frame (UUID)
          // Draft-based includes: custom-xxx, draft-xxx, shared-xxx prefixes
          const isDraftBased = selectedFrameId?.startsWith("custom-") ||
                              selectedFrameId?.startsWith("draft-") ||
                              selectedFrameId?.startsWith("shared-");
          const isSupabaseFrame = isUUIDCheck(selectedFrameId);

          // FALLBACK 1: For draft-based frames, ALWAYS try draft first
          if (isDraftBased && activeDraftId) {
            console.log("🔄 Draft-based custom frame, loading from draft first...");
            try {
              const draft = await loadDraftForRecovery();
              if (draft) {
                // Use preloaded module or fallback
                const { buildFrameConfigFromDraft } = draftHelpersModule || 
                  await import("../utils/draftHelpers.js");
                config = buildFrameConfigFromDraft(draft);
                console.log(
                  "✅ Successfully loaded frameConfig from draft:",
                  config.id
                );
              }
            } catch (error) {
              console.warn("⚠️ Failed to load from draft:", error);
            }
          }
          
          // FALLBACK 2: For Supabase frames, try custom frame service
          if (!config && isSupabaseFrame) {
            console.log("🔄 Attempting to load Supabase frame from service...");
            try {
              // Use preloaded module or fallback
              const frameService = unifiedFrameServiceModule?.default || 
                (await import("../services/unifiedFrameService")).default;
              config = await frameService.getFrameConfig(selectedFrameId);
              if (config) {
                console.log(
                  "✅ Successfully loaded custom frame from service:",
                  config.id
                );
              }
            } catch (error) {
              console.error(
                "❌ Failed to load from custom frame service:",
                error
              );
            }
          }

          // FALLBACK 3: Try to load from draft (if exists and not already tried)
          if (!config && activeDraftId && !isDraftBased) {
            try {
              console.log("🔄 Loading frameConfig from draft:", activeDraftId);
              const draft = await loadDraftForRecovery();

              if (draft) {
                // Use preloaded module or fallback
                const { buildFrameConfigFromDraft } = draftHelpersModule || 
                  await import("../utils/draftHelpers.js");
                config = buildFrameConfigFromDraft(draft);
                console.log(
                  "✅ Successfully loaded frameConfig from draft:",
                  config.id
                );

                // Try to save to localStorage for next time (might fail if too large)
                try {
                  safeStorage.setJSON("frameConfig", config);
                  safeStorage.setItem(
                    "frameConfigTimestamp",
                    String(Date.now())
                  );
                } catch (e) {
                  console.warn(
                    "⚠️ Could not cache frameConfig to localStorage:",
                    e
                  );
                }
              } else {
                console.warn("⚠️ Draft not found:", activeDraftId);
              }
            } catch (error) {
              console.warn("⚠️ Failed to load from draft:", error);
            }
          }

          if (!config) {
            console.warn("⚠️ All fallbacks failed - no frameConfig available");
          }
        }

        // If frameConfig exists but is incomplete (missing background photo image), try to enhance it from draft
        if (config && config.isCustom) {
          const backgroundPhoto = config.designer?.elements?.find(
            (el) => el?.type === "background-photo"
          );
          const needsReload = !backgroundPhoto || !backgroundPhoto.data?.image;

          if (needsReload) {
            console.log(
              "⚠️ Background photo missing or incomplete, loading from draft..."
            );
            console.log("  - Has background photo element:", !!backgroundPhoto);
            console.log("  - Has image data:", !!backgroundPhoto?.data?.image);

            if (activeDraftId) {
              try {
                const draft = await loadDraftForRecovery();

                if (draft && draft.elements) {
                  const draftBackgroundPhoto = draft.elements.find(
                    (el) => el?.type === "background-photo"
                  );
                  if (
                    draftBackgroundPhoto &&
                    draftBackgroundPhoto.data?.image
                  ) {
                    console.log(
                      "✅ Found background photo image in draft, restoring..."
                    );
                    console.log(
                      "  - Image length:",
                      draftBackgroundPhoto.data.image.length
                    );
                    console.log(
                      "  - Image preview:",
                      draftBackgroundPhoto.data.image.substring(0, 50)
                    );

                    // Rebuild frameConfig from draft to get complete data
                    // Use preloaded module or fallback
                    const { buildFrameConfigFromDraft } = draftHelpersModule || 
                      await import("../utils/draftHelpers.js");
                    config = buildFrameConfigFromDraft(draft);

                    // Try to save complete frameConfig back to localStorage (might fail if too large)
                    try {
                      safeStorage.setJSON("frameConfig", config);
                      console.log(
                        "✅ Saved complete frameConfig to localStorage"
                      );
                    } catch (storageError) {
                      console.warn(
                        "⚠️ Could not save frameConfig to localStorage (too large):",
                        storageError
                      );
                      // That's OK - we'll load from draft next time
                    }
                  } else {
                    console.warn(
                      "⚠️ No background photo with image found in draft"
                    );
                  }
                } else {
                  console.warn(
                    "⚠️ Draft not found or has no elements:",
                    activeDraftId
                  );
                }
              } catch (error) {
                console.error("❌ Failed to load from draft:", error);
              }
            } else {
              console.warn("⚠️ No activeDraftId found in localStorage");
            }
          } else {
            console.log(
              "✅ Background photo with image already present in frameConfig"
            );
          }
        }

        // Validasi: frameConfig harus ada dan punya id
        if (!config || !config.id) {
          showToast({
            type: "error",
            title: "Frame Tidak Valid",
            message:
              "Pilih frame terlebih dahulu di halaman Frames atau ambil foto baru.",
            action: {
              label: "Pilih Frame",
              onClick: () => navigate("/frames"),
            },
          });
          navigate("/frames");
          return;
        }

        setFrameConfig(config);
        // Log detail frameConfig untuk debug
        console.log("✅ Loaded frame config:", config.id);
        console.log("📋 Frame details:", config);

        // CRITICAL: If frame is missing image URL, try to get from localStorage cache
        const needsImageUrl = !config.frameImage && !config.imagePath && !config.image_url;
        if (needsImageUrl) {
          console.log("⚠️ Frame missing image URL, trying to get from cache...");
          try {
            // Try localStorage frames cache
            const cachedFramesStr = localStorage.getItem("fremio_frames_cache_v3");
            if (cachedFramesStr) {
              const cachedFrames = JSON.parse(cachedFramesStr);
              const cachedFrame = cachedFrames?.find(f => f.id === config.id);
              if (cachedFrame) {
                const imageUrl = cachedFrame.imagePath || cachedFrame.image_url || cachedFrame.thumbnailUrl;
                if (imageUrl) {
                  config.frameImage = imageUrl;
                  config.imagePath = imageUrl;
                  config.image_url = imageUrl;
                  console.log("✅ Found image URL from cache:", imageUrl?.substring(0, 80));
                }
              }
            }
          } catch (e) {
            console.warn("Failed to get image from cache:", e);
          }
        }

        // Log admin vs custom frame detection
        if (!config.isCustom) {
          console.log("🖼️ ADMIN FRAME DETECTED (isCustom is false/undefined):");
          console.log("  - Frame ID:", config.id);
          console.log("  - Frame name:", config.name);
          console.log("  - Has frameImage:", !!config.frameImage);
          console.log("  - frameImage preview:", config.frameImage?.substring(0, 80));
          console.log("  → Frame overlay WILL be displayed on canvas");
        }

        // Extra logging for custom frames
        if (config.isCustom) {
          console.log("🎨 CUSTOM FRAME DETECTED:");
          console.log("  - Frame ID:", config.id);
          console.log("  - Frame name:", config.name);
          console.log("  - Max captures:", config.maxCaptures);
          console.log("  - Has frameImage:", !!config.frameImage);
          console.log("  - Has imagePath:", !!config.imagePath);
          console.log(
            "  - Frame image preview:",
            config.frameImage?.substring(0, 50)
          );
          console.log("  - Slots count:", config.slots?.length);
          console.log(
            "  - Designer elements:",
            config.designer?.elements?.length
          );
          console.log(
            "  - Root elements (fallback):",
            config.elements?.length
          );
          
          // CRITICAL FIX: If designer.elements missing but config.elements exists, use it!
          // This handles shared frames where elements are at root level
          if (!config.designer?.elements && config.elements?.length > 0) {
            console.log("⚠️ Designer.elements missing, but config.elements exists - using as fallback");
            config.designer = {
              ...config.designer,
              elements: config.elements,
              canvasWidth: config.canvasWidth || 1080,
              canvasHeight: config.canvasHeight || 1920,
              canvasBackground: config.canvasBackground || '#f7f1ed',
            };
            console.log("✅ Set designer.elements from config.elements:", config.designer.elements.length);
            console.log("   Element types:", config.designer.elements.map(el => el?.type));
          }

          // CRITICAL FIX: If custom frame missing designer.elements, rebuild from slots
          if (!config.designer?.elements && config.slots?.length > 0) {
            console.log(
              "⚠️ Custom frame missing designer.elements, rebuilding from slots..."
            );
            
            // Get canvas dimensions for coordinate conversion
            const canvasW = config.canvasWidth || config.designer?.canvasWidth || 1080;
            const canvasH = config.canvasHeight || config.designer?.canvasHeight || 1920;
            
            // Detect coordinate format from first slot
            const firstSlot = config.slots[0];
            const testX = firstSlot?.left || 0;
            const testWidth = firstSlot?.width || 0;
            
            // If values are < 1, they're normalized (0-1)
            // If values are < 20, they're likely in cm (max ~10.8 x 19.2)
            // If values are > 100, they're already in pixels
            let convertFn;
            if (testX <= 1 && testWidth <= 1) {
              // Normalized coordinates (0-1)
              console.log("🔄 [REBUILD] Slots in NORMALIZED format, converting to pixels...");
              convertFn = (x, y, w, h) => ({
                x: Math.round((x || 0) * canvasW),
                y: Math.round((y || 0) * canvasH),
                width: Math.round((w || 0.5) * canvasW),
                height: Math.round((h || 0.5) * canvasH),
              });
            } else if (testX < 50 && testWidth < 50) {
              // CM format (10.8cm x 19.2cm canvas)
              console.log("🔄 [REBUILD] Slots in CM format, converting to pixels...");
              const pxPerCmW = canvasW / 10.8;
              const pxPerCmH = canvasH / 19.2;
              convertFn = (x, y, w, h) => ({
                x: Math.round((x || 0) * pxPerCmW),
                y: Math.round((y || 0) * pxPerCmH),
                width: Math.round((w || 0) * pxPerCmW),
                height: Math.round((h || 0) * pxPerCmH),
              });
            } else {
              // Already in pixels
              console.log("✅ [REBUILD] Slots already in PIXEL format");
              convertFn = (x, y, w, h) => ({
                x: x || 0,
                y: y || 0,
                width: w || 100,
                height: h || 100,
              });
            }
            
            const photoElements = config.slots.map((slot, index) => {
              const converted = convertFn(slot.left, slot.top, slot.width, slot.height);
              console.log(
                `  Slot ${index}: (${slot.left}, ${slot.top}, ${slot.width}, ${slot.height}) → (${converted.x}, ${converted.y}, ${converted.width}, ${converted.height})`
              );

              const slotRotation = Number(slot?.rotation);
              const rotation = Number.isFinite(slotRotation) ? slotRotation : 0;
              const slotBorderRadius = Number(slot?.borderRadius);
              const borderRadius = Number.isFinite(slotBorderRadius)
                ? slotBorderRadius
                : 0;

              return {
                id: slot.id || `photo_${index + 1}`,
                type: "photo",
                x: converted.x,
                y: converted.y,
                width: converted.width,
                height: converted.height,
                zIndex: slot.zIndex || 2,
                rotation,
                data: {
                  photoIndex:
                    slot.photoIndex !== undefined ? slot.photoIndex : index,
                  image: null,
                  aspectRatio: slot.aspectRatio || "4:5",
                  borderRadius,
                },
              };
            });

            config = {
              ...config,
              designer: {
                ...config.designer,
                elements: photoElements,
              },
            };

            setFrameConfig(config);
            console.log("✅ Rebuilt designer.elements:", photoElements.length);
          }
        }

        // Load designer elements (unified layering system)
        // Support both custom frames and regular frames (converted from slots)
        if (Array.isArray(config.designer?.elements)) {
          // CRITICAL FIX: Detect and convert coordinates if they're in cm/small units
          // Standard canvas is 1080x1920 pixels. If elements have x/width < 50, they're likely in cm
          // (10.8cm x 19.2cm canvas, so 1cm = 100px)
          const canvasW = config.canvasWidth || config.designer?.canvasWidth || 1080;
          const canvasH = config.canvasHeight || config.designer?.canvasHeight || 1920;
          
          // CRITICAL: Detect coordinate format and convert to pixels
          // Formats possible:
          // 1. Normalized (0-1): x=0.065, width=0.46 → multiply by canvas dimensions
          // 2. CM format (0-10.8 x 0-19.2): x=0.65, width=4.6 → multiply by 100 (since 1cm=100px for 1080x1920)
          // 3. Pixels (>100): x=65, width=460 → no conversion needed
          
          const detectAndConvertCoordinates = (elements, cw, ch) => {
            const photoEls = elements.filter(el => el?.type === 'photo');
            if (photoEls.length === 0) {
              console.log("🔍 [COORD] No photo elements found, skipping conversion");
              return elements;
            }
            
            // Get max values to detect format
            const maxX = Math.max(...photoEls.map(el => el.x || 0));
            const maxY = Math.max(...photoEls.map(el => el.y || 0));
            const maxWidth = Math.max(...photoEls.map(el => el.width || 0));
            const maxHeight = Math.max(...photoEls.map(el => el.height || 0));
            
            console.log(`🔍 [COORD CHECK] maxX=${maxX}, maxY=${maxY}, maxWidth=${maxWidth}, maxHeight=${maxHeight}`);
            console.log(`🔍 [COORD CHECK] Canvas: ${cw}x${ch}`);
            
            // Determine format based on values
            let format = 'pixels'; // default
            let convertFn = (el) => el; // no conversion by default

            const isLikelyNormalized =
              maxX <= 1 && maxY <= 1 && maxWidth <= 1 && maxHeight <= 1;

            // CM format is very small numeric space (roughly 0-11 x 0-20)
            // Only treat as cm when ALL photo coordinates are within that space.
            // This prevents pixel-based designs (e.g. width 934) being misclassified
            // just because x happens to be small.
            const isLikelyCm =
              maxX <= 12 && maxY <= 22 && maxWidth <= 12 && maxHeight <= 22;

            if (isLikelyNormalized) {
              // Normalized format (0-1)
              format = 'normalized';
              console.log("📐 [COORD] Detected NORMALIZED format (0-1), converting to pixels...");
              convertFn = (el) => ({
                ...el,
                x: Math.round((el.x || 0) * cw),
                y: Math.round((el.y || 0) * ch),
                width: Math.round((el.width || 0) * cw),
                height: Math.round((el.height || 0) * ch),
              });
            } else if (isLikelyCm) {
              // CM format (canvas is ~10.8cm x 19.2cm)
              format = 'cm';
              const pxPerCm = cw / 10.8; // ~100 for 1080px canvas
              console.log(`📐 [COORD] Detected CM format, pxPerCm=${pxPerCm.toFixed(2)}, converting to pixels...`);
              convertFn = (el) => ({
                ...el,
                x: Math.round((el.x || 0) * pxPerCm),
                y: Math.round((el.y || 0) * pxPerCm), // Use same scale for both axes
                width: Math.round((el.width || 0) * pxPerCm),
                height: Math.round((el.height || 0) * pxPerCm),
              });
            } else {
              console.log("✅ [COORD] Values appear to be in PIXELS already, no conversion needed");
            }
            
            // Apply conversion to ALL elements (photo, upload, background-photo, etc.)
            const converted = elements.map(el => {
              if (!el || typeof el !== 'object') return el;
              
              // Skip elements that don't have coordinates
              if (el.x === undefined && el.y === undefined && el.width === undefined) {
                return el;
              }
              
              const result = convertFn(el);
              const elType = el?.type || 'unknown';
              console.log(`   🔧 ${elType}: (${el.x}, ${el.y}, ${el.width}x${el.height}) → (${result.x}, ${result.y}, ${result.width}x${result.height})`);
              return result;
            });
            
            console.log(`✅ [COORD] Conversion complete. Format was: ${format}`);
            return converted;
          };
          
          // Always run coordinate detection and conversion
          config.designer.elements = detectAndConvertCoordinates(config.designer.elements, canvasW, canvasH);
          // Log resolvedPhotos status BEFORE using it
          console.log("📸 [PHOTO FILL] resolvedPhotos available:", resolvedPhotos.length);
          if (resolvedPhotos.length > 0) {
            console.log("📸 [PHOTO FILL] First photo preview:", resolvedPhotos[0]?.substring?.(0, 50) || "not a string");
          } else {
            // EMERGENCY: Try to reload from localStorage one more time
            console.warn("⚠️ [EMERGENCY RELOAD] resolvedPhotos is empty, trying localStorage again...");
            try {
              const emergencyRaw = localStorage.getItem("capturedPhotos");
              if (emergencyRaw) {
                const emergencyPhotos = JSON.parse(emergencyRaw);
                if (Array.isArray(emergencyPhotos) && emergencyPhotos.length > 0) {
                  console.log("✅ [EMERGENCY RELOAD] Found photos:", emergencyPhotos.length);
                  // Normalize them
                  resolvedPhotos = emergencyPhotos.map((photo) => {
                    if (typeof photo === 'string' && photo.startsWith('data:')) return photo;
                    if (photo?.dataUrl && typeof photo.dataUrl === 'string') return photo.dataUrl;
                    return null;
                  }).filter(Boolean);
                  console.log("✅ [EMERGENCY RELOAD] Normalized to:", resolvedPhotos.length, "photos");
                  // Also update state
                  if (resolvedPhotos.length > 0) {
                    setPhotos(resolvedPhotos);
                  }
                }
              }
            } catch (err) {
              console.error("❌ [EMERGENCY RELOAD] Failed:", err);
            }
          }
          
          // DEBUG: Log ALL elements in config.designer.elements
          console.log("🔍 ALL designer elements from config:", {
            total: config.designer.elements.length,
            elements: config.designer.elements.map((el, i) => ({
              index: i,
              type: el?.type,
              id: el?.id ? String(el.id).slice(0, 8) : 'no-id',
              x: el?.x,
              y: el?.y,
              width: el?.width,
              height: el?.height,
            })),
          });
          
          // Extract photo elements and convert to uploads
          const photoElements = config.designer.elements.filter(
            (el) => el?.type === "photo"
          );
          console.log("📸 Found photo elements:", photoElements.length);
          photoElements.forEach((el, idx) => {
            console.log(`   Photo ${idx}:`, {
              id: el.id,
              type: el.type,
              photoIndex: el.data?.photoIndex,
              hasImage: !!el.data?.image,
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
            });
          });

          const photoAsUploadElements = photoElements.map((photoEl, idx) => {
            // CRITICAL FIX: Use idx as fallback when photoIndex is out of range
            // This handles buggy slot data where photoIndex might be wrong (e.g., 2,3 instead of 0,1)
            let photoIndex = photoEl.data?.photoIndex;
            
            // Validate photoIndex - if it's undefined or not a number, use idx
            if (typeof photoIndex !== 'number') {
              console.warn(`⚠️ Invalid photoIndex ${photoIndex} for slot ${idx}, using idx as fallback`);
              photoIndex = idx;
            }
            
            // CRITICAL: Duplicate photos in PAIRS if we have fewer photos than slots
            // Pattern: Photo 1 → Slot 0,1 | Photo 2 → Slot 2,3 | Photo 3 → Slot 4,5
            // This means: effectivePhotoIndex = Math.floor(slotIndex / 2)
            let effectivePhotoIndex;
            const totalSlots = photoElements.length;
            const totalPhotos = resolvedPhotos.length;
            
            // If we have fewer photos than slots, use paired duplication
            // Each photo should fill 2 consecutive slots
            if (totalPhotos > 0 && totalSlots > totalPhotos) {
              // Calculate how many slots each photo should fill
              const slotsPerPhoto = Math.ceil(totalSlots / totalPhotos);
              // Use idx (slot position) to determine which photo
              effectivePhotoIndex = Math.floor(idx / slotsPerPhoto);
              // Make sure we don't exceed available photos
              if (effectivePhotoIndex >= totalPhotos) {
                effectivePhotoIndex = totalPhotos - 1;
              }
              console.log(`🔁 Slot ${idx}: photoIndex ${photoIndex} -> effectivePhotoIndex ${effectivePhotoIndex} (paired duplication, ${slotsPerPhoto} slots per photo)`);
            } else {
              // Normal case: use photoIndex directly, but validate it
              effectivePhotoIndex = photoIndex;
              if (totalPhotos > 0 && effectivePhotoIndex >= totalPhotos) {
                effectivePhotoIndex = effectivePhotoIndex % totalPhotos;
                console.log(`🔁 Slot ${idx}: photoIndex ${photoIndex} wrapped to effectivePhotoIndex ${effectivePhotoIndex}`);
              }
            }
            
            // Try to get photo data directly from resolvedPhotos (loaded earlier)
            let photoData = resolvedPhotos[effectivePhotoIndex];
            
            // Extra safety: ensure photoData is a string
            if (photoData && typeof photoData !== 'string') {
              if (photoData.dataUrl && typeof photoData.dataUrl === 'string') {
                photoData = photoData.dataUrl;
              } else if (photoData.previewUrl && typeof photoData.previewUrl === 'string' && photoData.previewUrl.startsWith('data:')) {
                photoData = photoData.previewUrl;
              } else {
                console.warn(`⚠️ Photo slot ${idx}: Data is not a string, skipping:`, typeof photoData);
                photoData = null;
              }
            }
            
            // DEBUG: Log original element coordinates as plain string for easy reading
            console.log(`🖼️ Setting up photo slot ${idx}: photoIndex=${photoIndex}, effectivePhotoIndex=${effectivePhotoIndex}, hasPhotoData=${!!photoData}, originalX=${photoEl.x}, originalY=${photoEl.y}, originalWidth=${photoEl.width}, originalHeight=${photoEl.height}, originalZIndex=${photoEl.zIndex}`);
            
            return {
              ...photoEl,
              type: "upload", // Convert to upload for unified rendering
              data: {
                ...photoEl.data,
                image: photoData || null, // Fill with actual photo data!
                photoIndex: effectivePhotoIndex, // Use effective index for proper mapping
              },
            };
          });

          // Get other designer elements (text, shapes, uploads)
          // These include overlay images from frame design
          console.log("🔍 [DEBUG] Looking for overlay elements in config.designer.elements:");
          console.log("   Total elements:", config.designer.elements.length);
          config.designer.elements.forEach((el, i) => {
            console.log(`   [${i}] type=${el?.type}, zIndex=${el?.zIndex}, __isOverlay=${el?.data?.__isOverlay}, hasImage=${!!el?.data?.image}`);
          });
          
          // CRITICAL: Also check layout.elements for overlay elements that might not be in designer.elements
          // This handles the case where overlay was saved in layout but not properly restored to designer
          console.log("🔍 [DEBUG] Also checking config.layout.elements:", config.layout?.elements?.length || 0);
          const layoutOverlayElements = [];
          if (config.layout?.elements && Array.isArray(config.layout.elements)) {
            const canvasW = config.canvasWidth || config.designer?.canvasWidth || 1080;
            const canvasH = config.canvasHeight || config.designer?.canvasHeight || 1920;
            
            config.layout.elements.forEach((el, idx) => {
              console.log(`   Layout[${idx}]: type=${el?.type}, zIndex=${el?.zIndex}, __isOverlay=${el?.data?.__isOverlay}, hasImage=${!!el?.data?.image}`);
              
              // Check if this is an overlay element (upload with image, no photoIndex)
              const isOverlay = 
                el.type === 'upload' && 
                el.data?.image && 
                el.data?.photoIndex === undefined;
              
              if (isOverlay) {
                // Check if this overlay is already in designer.elements
                const alreadyInDesigner = config.designer.elements.some(
                  (de) => de.id === el.id || 
                         (de.type === 'upload' && de.data?.image === el.data?.image)
                );
                
                if (!alreadyInDesigner) {
                  console.log("✅ Found overlay in layout.elements not in designer:", el.id);
                  // Convert normalized positions to absolute positions
                  const restoredOverlay = {
                    ...el,
                    x: el.xNorm !== undefined ? Math.round(el.xNorm * canvasW) : el.x,
                    y: el.yNorm !== undefined ? Math.round(el.yNorm * canvasH) : el.y,
                    width: el.widthNorm !== undefined ? Math.round(el.widthNorm * canvasW) : el.width,
                    height: el.heightNorm !== undefined ? Math.round(el.heightNorm * canvasH) : el.height,
                    zIndex: Math.max(el.zIndex || 0, 500 + idx),
                    data: {
                      ...el.data,
                      __isOverlay: true,
                    },
                  };
                  layoutOverlayElements.push(restoredOverlay);
                }
              }
            });
          }
          console.log("📦 [DEBUG] Additional overlays from layout.elements:", layoutOverlayElements.length);
          
          const otherDesignerElems = config.designer.elements.filter(
            (el) =>
              el &&
              el.type !== "photo" &&
              el.type !== "background-photo" &&
              !el?.data?.__capturedOverlay
          ).map((el, idx) => {
            // If already marked as overlay from backend, ensure high zIndex
            if (el.data?.__isOverlay) {
              console.log("✅ Found overlay element from backend:", el.id, "original zIndex:", el.zIndex);
              return {
                ...el,
                zIndex: Math.max(el.zIndex || 0, 500 + idx), // Ensure overlay is always on top
              };
            }
            
            // Check if this is an overlay element (upload with image, no photoIndex)
            // FIXED: Also check for data:image URLs, not just http/https
            const isOverlay = 
              el.type === "upload" && 
              el.data?.image && 
              typeof el.data.image === "string" &&
              el.data?.photoIndex === undefined;
            
            if (isOverlay) {
              console.log("✅ Detected overlay element:", el.id, "assigning zIndex:", 500 + idx);
              return {
                ...el,
                zIndex: 500 + idx, // Assign high zIndex for overlay
                data: {
                  ...el.data,
                  __isOverlay: true, // Mark as overlay for rendering
                }
              };
            }
            return el;
          });
          
          // Combine with overlay elements from layout.elements
          const allOtherElems = [...otherDesignerElems, ...layoutOverlayElements];
          
          console.log("📦 [DEBUG] otherDesignerElems count:", otherDesignerElems.length);
          console.log("📦 [DEBUG] allOtherElems count (with layout overlays):", allOtherElems.length);
          allOtherElems.forEach((el, i) => {
            console.log(`   [${i}] type=${el?.type}, zIndex=${el?.zIndex}, __isOverlay=${el?.data?.__isOverlay}, hasImage=${!!el?.data?.image}`);
          });

          // Combine all elements
            // Ensure overlay elements always have high zIndex (>=500)
            const fixedDesignerElements = [
              ...photoAsUploadElements,
              ...allOtherElems,
            ].map((el, idx) => {
              if (
                el &&
                el.type === "upload" &&
                el.data?.image &&
                el.data?.photoIndex === undefined
              ) {
                // Overlay element: force zIndex >= 500
                return {
                  ...el,
                  zIndex: Math.max(el.zIndex || 0, 500 + idx),
                  data: {
                    ...el.data,
                    __isOverlay: true,
                  },
                };
              }
              return el;
            });
            setDesignerElements(fixedDesignerElements);
            console.log(
              "✅ Loaded designer elements (fixed zIndex):",
              fixedDesignerElements.length
            );

          // Load background photo
          const backgroundPhoto = config.designer.elements.find(
            (el) => el?.type === "background-photo"
          );
          if (backgroundPhoto) {
            // Verify background photo has image
            if (backgroundPhoto.data?.image) {
              setBackgroundPhotoElement(backgroundPhoto);
              console.log("✅ Loaded background photo with image:", {
                id: backgroundPhoto.id,
                hasImage: !!backgroundPhoto.data?.image,
                imageLength: backgroundPhoto.data?.image?.length,
                imagePreview: backgroundPhoto.data?.image?.substring(0, 50),
                zIndex: backgroundPhoto.zIndex,
                x: backgroundPhoto.x,
                y: backgroundPhoto.y,
                width: backgroundPhoto.width,
                height: backgroundPhoto.height,
              });
            } else {
              console.warn("⚠️ Background photo found but missing image data!");
              console.log(
                "   This might happen if localStorage was cleared or data was sanitized"
              );
              console.log("   Background photo will not be displayed");
              setBackgroundPhotoElement(null);
            }
          } else {
            console.warn(
              "⚠️ No background photo found in frameConfig.designer.elements"
            );
            console.log(
              "   Elements found:",
              config.designer.elements.map((el) => ({
                type: el.type,
                id: el.id,
              }))
            );
            
            // FALLBACK: Create a background-photo from image URLs when the frame has no
            // explicit background-photo element. For custom frames, only do this when there
            // is no other renderable artwork left besides photo slots.
            const isCustomFrame = Boolean(config?.isCustom) || String(config?.id || "").startsWith("custom-");
            const hasRenderableCustomArtwork = Array.isArray(config?.designer?.elements)
              ? config.designer.elements.some((el) => {
                  if (!el || el.type === "photo" || el.type === "background-photo") {
                    return false;
                  }
                  if (el.type === "upload") {
                    return Boolean(el.data?.image);
                  }
                  return true;
                })
              : false;
            const fallbackImageUrl =
              config.frameImage ||
              config.imagePath ||
              config.thumbnailUrl ||
              config.image_url ||
              config.preview;

            if (isCustomFrame && hasRenderableCustomArtwork) {
              console.log(
                "✅ Custom frame: skipping background-photo fallback from frameImage/imagePath to avoid duplicated elements"
              );
              setBackgroundPhotoElement(null);
            } else {
              if (fallbackImageUrl) {
                console.log(
                  "🔄 Creating background-photo from fallback URL:",
                  fallbackImageUrl.substring(0, 80) + "..."
                );
                const fallbackBackgroundPhoto = {
                  id: "background-photo-fallback",
                  type: "background-photo",
                  x: 0,
                  y: 0,
                  width: 1080,
                  height: 1920,
                  zIndex: 0,
                  data: {
                    image: fallbackImageUrl,
                    objectFit: "cover",
                    label: "Frame Background (fallback)",
                  },
                };
                setBackgroundPhotoElement(fallbackBackgroundPhoto);
                console.log("✅ Created fallback background-photo element");
              } else {
                console.warn(
                  "⚠️ No fallback image URL available (frameImage, imagePath, thumbnailUrl, image_url, preview)"
                );
                setBackgroundPhotoElement(null);
              }
            }
          }
        } else {
          console.warn("⚠️ No designer.elements found in frameConfig");
          console.log("📋 Available properties:", Object.keys(config));
          
          // FALLBACK: Create designer elements from config.slots if available
          if (Array.isArray(config.slots) && config.slots.length > 0) {
            console.log("🔄 Creating designer elements from slots...");
            const canvasWidth = config.layout?.canvasWidth || config.designer?.canvasWidth || 1080;
            const canvasHeight = config.layout?.canvasHeight || config.designer?.canvasHeight || 1920;
            
            const totalSlots = config.slots.length;
            const totalPhotos = resolvedPhotos.length;
            
            const photoElementsFromSlots = config.slots.map((slot, idx) => {
              // Convert normalized coordinates (0-1) to pixels
              const x = (slot.left || 0) * canvasWidth;
              const y = (slot.top || 0) * canvasHeight;
              const width = (slot.width || 0.5) * canvasWidth;
              const height = (slot.height || 0.5) * canvasHeight;
              
              // PAIRED DUPLICATION: Calculate effective photo index
              let effectivePhotoIndex;
              if (totalPhotos > 0 && totalSlots > totalPhotos) {
                const slotsPerPhoto = Math.ceil(totalSlots / totalPhotos);
                effectivePhotoIndex = Math.floor(idx / slotsPerPhoto);
                if (effectivePhotoIndex >= totalPhotos) {
                  effectivePhotoIndex = totalPhotos - 1;
                }
              } else {
                const originalPhotoIndex = slot.photoIndex !== undefined ? slot.photoIndex : idx;
                effectivePhotoIndex = totalPhotos > 0 ? originalPhotoIndex % totalPhotos : originalPhotoIndex;
              }
              
              let photoData = resolvedPhotos[effectivePhotoIndex];
              
              // Normalize photo data
              if (photoData && typeof photoData !== 'string') {
                if (photoData.dataUrl) photoData = photoData.dataUrl;
                else if (photoData.previewUrl) photoData = photoData.previewUrl;
                else photoData = null;
              }
              
              console.log(`   Slot ${idx}: x=${x.toFixed(0)}, y=${y.toFixed(0)}, w=${width.toFixed(0)}, h=${height.toFixed(0)}, effectivePhotoIndex=${effectivePhotoIndex}, hasPhoto=${!!photoData}`);
              
              return {
                id: slot.id || `photo_slot_${idx}`,
                type: "upload", // Use upload type for rendering
                x,
                y,
                width,
                height,
                zIndex: slot.zIndex || 2,
                rotation: slot.rotation || 0,
                data: {
                  photoIndex: effectivePhotoIndex,
                  image: photoData || null,
                  aspectRatio: slot.aspectRatio || "4:5",
                  borderRadius: slot.borderRadius ?? 0, // Use 0 as default, respect 0 value from admin
                },
              };
            });
            
            setDesignerElements(photoElementsFromSlots);
            console.log("✅ Created", photoElementsFromSlots.length, "designer elements from slots");
          } else {
            console.warn("⚠️ No slots found either - frame may be incomplete");
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("❌ Error loading data:", error);
        setLoading(false);
      }
    };

    loadFrameData();
  }, [navigate]);

  // Fill photo elements with real captured photos
  useEffect(() => {
    console.log("🔄 [FILL PHOTOS] useEffect triggered");
    console.log("   - designerElements.length:", designerElements.length);
    console.log("   - photos.length:", photos.length);
    console.log("   - photosFilled.current:", photosFilled.current);
    
    if (designerElements.length === 0 || photos.length === 0) {
      console.log("⏭️ Skipping photo fill:", {
        hasElements: designerElements.length > 0,
        hasPhotos: photos.length > 0,
        photosFilled: photosFilled.current,
      });
      return;
    }

    console.log("🔄 Checking if photo elements need filling...");
    console.log("   Designer elements:", designerElements.length);
    console.log("   Available photos:", photos.length);
    console.log(
      "   Elements detail:",
      designerElements.map((el) => ({
        id: el.id ? String(el.id).slice(0, 8) : 'no-id',
        type: el.type,
        photoIndex: el.data?.photoIndex,
        hasImage: !!el.data?.image,
      }))
    );

    // Check if any elements need filling - support both "upload" and "photo" types
    // CRITICAL FIX: Exclude overlay elements (decorative uploads with __isOverlay flag)
    const photoSlots = designerElements.filter(
      (el) => (el.type === "upload" || el.type === "photo") && !el.data?.__isOverlay
    );
    
    // Count overlay elements for debugging
    const overlayElements = designerElements.filter((el) => el.data?.__isOverlay);
    console.log(`🖼️ Photo fill: ${photoSlots.length} photo slots, ${overlayElements.length} overlays (excluded from fill)`);

    const needsFilling = photoSlots.some((el) => !el.data?.image);

    if (!needsFilling) {
      console.log("✅ All photo elements already filled");
      photosFilled.current = true;
      return;
    }

    // Prevent infinite loop - only fill once
    if (photosFilled.current) {
      console.log("⏭️ Photos already filled, skipping to prevent loop...");
      return;
    }

    console.log("🔄 Filling photo elements with real images...");
    console.log(`   Found ${photoSlots.length} photo slots`);
    console.log(`   Available photos: ${photos.length}`);

    // PAIRED DUPLICATION: Each photo fills 2 consecutive slots
    // Pattern: Photo 1 → Slot 1,2 | Photo 2 → Slot 3,4 | Photo 3 → Slot 5,6
    let photosToUse = [...photos];
    if (photosToUse.length > 0 && photosToUse.length < photoSlots.length) {
      console.log("🔁 [EDITPHOTO] Duplicating photos in PAIRS to fill slots...");
      console.log(`   - Original photos: ${photosToUse.length}`);
      console.log(`   - Photo slots: ${photoSlots.length}`);
      
      // Create paired duplication: each photo appears twice consecutively
      const duplicatedPhotos = [];
      for (let i = 0; i < photosToUse.length; i++) {
        // Add each photo twice for paired slots
        duplicatedPhotos.push(photosToUse[i]);
        duplicatedPhotos.push(photosToUse[i]);
      }
      
      // Trim to match slot count
      photosToUse = duplicatedPhotos.slice(0, photoSlots.length);
      console.log(`   - After paired duplication: ${photosToUse.length} photos`);
      console.log(`   - Pattern: Photo 1→Slot 1,2 | Photo 2→Slot 3,4 | Photo 3→Slot 5,6`);
    }

    // Build a map of photo slots for auto-index assignment
    let photoSlotCounter = 0;
    
    const updatedElements = designerElements.map((el, idx) => {
      // Support both "upload" (built-in frames) and "photo" (custom frames) types
      // CRITICAL: Skip overlay elements - they should keep their original image
      if ((el.type === "upload" || el.type === "photo") && !el.data?.__isOverlay) {
        // CRITICAL FIX: Auto-assign photoIndex if not defined, using sequential counter
        let photoIndex = el.data?.photoIndex;
        
        // If photoIndex is not defined or not a number, use the sequential counter
        if (typeof photoIndex !== "number") {
          photoIndex = photoSlotCounter;
          console.log(`📌 Auto-assigning photoIndex ${photoIndex} to slot (no photoIndex defined)`);
        }
        
        // If photoIndex is out of range, use the sequential counter (use photosToUse for duplication support)
        if (photoIndex >= photosToUse.length) {
          console.warn(`⚠️ photoIndex ${photoIndex} out of range (max: ${photosToUse.length - 1}), using counter ${photoSlotCounter}`);
          photoIndex = photoSlotCounter;
        }
        
        // Increment counter for next photo slot
        photoSlotCounter++;
        
        // Skip if no more photos available (use photosToUse)
        if (photoIndex >= photosToUse.length) {
          console.warn(`⚠️ No photo available for slot ${photoIndex}`);
          return el;
        }
        
        let photoData = photosToUse[photoIndex];
        
        // Extra normalization in case photos weren't normalized at load time
        if (photoData && typeof photoData !== 'string') {
          if (photoData.dataUrl && typeof photoData.dataUrl === 'string') {
            photoData = photoData.dataUrl;
          } else if (photoData.previewUrl && typeof photoData.previewUrl === 'string' && photoData.previewUrl.startsWith('data:')) {
            photoData = photoData.previewUrl;
          } else {
            console.warn(`⚠️ Photo slot ${photoIndex}: Invalid format, not a string or object with dataUrl`);
            photoData = null;
          }
        }
        
        if (photoData && typeof photoData === 'string') {
          console.log(`✅ Filling photo slot ${photoIndex} with image`);
          console.log(`   Photo data length: ${photoData.length}`);
          console.log(
            `   Photo data preview: ${photoData.substring(0, 50)}...`
          );
          return {
            ...el,
            data: { ...el.data, image: photoData, photoIndex }, // Update photoIndex to corrected value
          };
        } else {
          console.warn(`⚠️ No photo data found for slot ${photoIndex}`);
          console.warn(
            `   Available photos: ${photosToUse.length}, requested index: ${photoIndex}`
          );
        }
      }
      return el;
    });

    console.log("📝 Setting updated elements with photos...");
    setDesignerElements(updatedElements);
    photosFilled.current = true;
    console.log("✅ Photo fill complete!");
  }, [photos, designerElements]);

  // EMERGENCY: Retry loading photos if designerElements exist but photos are empty
  useEffect(() => {
    // Only run if we have elements but no photos
    if (designerElements.length === 0 || photos.length > 0) {
      return;
    }
    
    // Only retry once
    if (photosFilled.current) {
      return;
    }
    
    console.log("🆘 [EMERGENCY PHOTO RETRY] designerElements exist but photos empty, retrying...");
    
    const retryLoadPhotos = async () => {
      // Wait a bit for storage to settle
      await new Promise(r => setTimeout(r, 150));
      
      // Try multiple sources
      let foundPhotos = [];
      
      // Source 1: Direct localStorage
      try {
        const raw = localStorage.getItem("capturedPhotos");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log("🆘 [RETRY] Found photos in localStorage:", parsed.length);
            foundPhotos = parsed.map(p => {
              if (typeof p === 'string' && p.startsWith('data:')) return p;
              if (p?.dataUrl?.startsWith?.('data:')) return p.dataUrl;
              return null;
            }).filter(Boolean);
          }
        }
      } catch (e) {
        console.warn("🆘 [RETRY] localStorage parse failed:", e);
      }
      
      // Source 2: safeStorage (compressed)
      if (foundPhotos.length === 0) {
        try {
          const safePhotos = safeStorage.getJSON("capturedPhotos");
          if (Array.isArray(safePhotos) && safePhotos.length > 0) {
            console.log("🆘 [RETRY] Found photos in safeStorage:", safePhotos.length);
            foundPhotos = safePhotos.map(p => {
              if (typeof p === 'string' && p.startsWith('data:')) return p;
              if (p?.dataUrl?.startsWith?.('data:')) return p.dataUrl;
              return null;
            }).filter(Boolean);
          }
        } catch (e) {
          console.warn("🆘 [RETRY] safeStorage read failed:", e);
        }
      }
      
      // Source 3: window backup
      if (foundPhotos.length === 0 && window.__fremio_photos?.length > 0) {
        console.log("🆘 [RETRY] Found photos in window.__fremio_photos:", window.__fremio_photos.length);
        foundPhotos = window.__fremio_photos.map(p => {
          if (typeof p === 'string' && p.startsWith('data:')) return p;
          if (p?.dataUrl?.startsWith?.('data:')) return p.dataUrl;
          return null;
        }).filter(Boolean);
      }
      
      if (foundPhotos.length > 0) {
        console.log("✅ [RETRY] Successfully recovered", foundPhotos.length, "photos!");
        setPhotos(foundPhotos);
      } else {
        console.warn("❌ [RETRY] Still no photos found after retry");
      }
    };
    
    retryLoadPhotos();
  }, [designerElements, photos]);

  // Debug log for videos state
  useEffect(() => {
    console.log("🎥 Videos state updated:", {
      videos,
      isArray: Array.isArray(videos),
      length: videos?.length || 0,
      hasValidVideo,
      buttonWillBeEnabled: hasValidVideo && !isSaving,
    });
  }, [videos, hasValidVideo, isSaving]);

  // Filter presets
  // NOTE: Keep blur at 0 because the download pipeline applies filters manually and ignores blur.
  const filterPresets = [
    {
      name: "Original",
      icon: "📷",
      color: "linear-gradient(135deg, #f0ebe4 0%, #c8bfb5 50%, #a09488 100%)",
      filters: {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0,
        blur: 0,
        hueRotate: 0,
      },
    },
    {
      name: "Instant Soft",
      icon: "🫧",
      color: "linear-gradient(135deg, #e8eeff 0%, #c0c8f4 50%, #9aa8e8 100%)",
      filters: {
        brightness: 110,
        contrast: 88,
        saturate: 92,
        grayscale: 0,
        sepia: 5,
        blur: 0,
        hueRotate: 0,
      },
    },
    {
      name: "Warm Film",
      icon: "🎞️",
      color: "linear-gradient(135deg, #f8e4b0 0%, #e8b860 50%, #c07030 100%)",
      filters: {
        brightness: 106,
        contrast: 104,
        saturate: 112,
        grayscale: 0,
        sepia: 18,
        blur: 0,
        hueRotate: 12,
      },
    },
    {
      name: "Muted Color",
      icon: "🪵",
      color: "linear-gradient(135deg, #ddd8cc 0%, #b8b0a0 50%, #928878 100%)",
      filters: {
        brightness: 104,
        contrast: 98,
        saturate: 70,
        grayscale: 0,
        sepia: 0,
        blur: 0,
        hueRotate: 0,
      },
    },
    {
      name: "Pastel Soft",
      icon: "🍬",
      color: "linear-gradient(135deg, #fde8e8 0%, #f0c0d8 50%, #d898c0 100%)",
      filters: {
        brightness: 112,
        contrast: 86,
        saturate: 80,
        grayscale: 0,
        sepia: 0,
        blur: 0,
        hueRotate: -4,
      },
    },
    {
      name: "Retro Matte",
      icon: "🧃",
      color: "linear-gradient(135deg, #e8d8b0 0%, #c8a870 50%, #a07840 100%)",
      filters: {
        brightness: 104,
        contrast: 85,
        saturate: 90,
        grayscale: 0,
        sepia: 6,
        blur: 0,
        hueRotate: -8,
      },
    },
    {
      name: "Soft Grain",
      icon: "✨",
      color: "linear-gradient(135deg, #faf4e8 0%, #e4d8c0 50%, #c8bc9c 100%)",
      filters: {
        brightness: 104,
        contrast: 102,
        saturate: 92,
        grayscale: 0,
        sepia: 8,
        blur: 0,
        hueRotate: 0,
      },
    },
    {
      name: "Soft Mono",
      icon: "🕊️",
      color: "linear-gradient(135deg, #f0f0f0 0%, #909090 50%, #404040 100%)",
      filters: {
        brightness: 108,
        contrast: 92,
        saturate: 0,
        grayscale: 100,
        sepia: 0,
        blur: 0,
        hueRotate: 0,
      },
    },
    {
      name: "Film Noir",
      icon: "🎬",
      color: "linear-gradient(135deg, #484848 0%, #202020 50%, #080808 100%)",
      filters: {
        brightness: 98,
        contrast: 135,
        saturate: 0,
        grayscale: 100,
        sepia: 0,
        blur: 0,
        hueRotate: 0,
      },
    },
  ];

  const applyFilterPreset = (preset) => {
    setFilters(preset.filters);
    setActiveFilter(preset.name);
  };

  const resetFilters = () => {
    setFilters({
      brightness: 100,
      contrast: 100,
      saturate: 100,
      grayscale: 0,
      sepia: 0,
      blur: 0,
      hueRotate: 0,
    });
    setActiveFilter("Original");
  };

  const getFilterStyle = () => {
    return {
      filter: `
        brightness(${filters.brightness}%)
        contrast(${filters.contrast}%)
        saturate(${filters.saturate}%)
        grayscale(${filters.grayscale}%)
        sepia(${filters.sepia}%)
        blur(${filters.blur}px)
        hue-rotate(${filters.hueRotate}deg)
      `.trim(),
    };
  };

  // Save function
  const handleSave = async () => {
    if (!frameConfig) {
      showToast({
        type: "error",
        title: "Tidak Ada Frame",
        message: "Silakan pilih frame terlebih dahulu.",
      });
      return;
    }

    setIsSaving(true);
    setSaveMessage("Saving...");

    try {
      const previewCanvas = document.getElementById("frame-preview-canvas");
      if (!previewCanvas) {
        throw new Error("Preview canvas not found");
      }

      // Capture with html2canvas - use adaptive scale for better quality
      const dpr = window.devicePixelRatio || 2;
      const canvas = await html2canvas(previewCanvas, {
        scale: Math.max(2, dpr),
        backgroundColor: frameConfig.designer?.canvasBackground || "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: false,
        imageTimeout: 0,
      });

      const imageData = canvas.toDataURL("image/png");

      // Save to localStorage
      const timestamp = Date.now();
      const savedImages = safeStorage.getJSON("savedImages") || [];
      savedImages.push({
        id: timestamp,
        frameId: frameConfig.id,
        image: imageData,
        timestamp,
        photos: photos.length,
      });
      safeStorage.setJSON("savedImages", savedImages);

      setSaveMessage("✅ Saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Error saving:", error);
      setSaveMessage("❌ Failed to save");
      setTimeout(() => setSaveMessage(""), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdf7f4",
        }}
      >
        <div
          style={{
            background: "white",
            padding: "2rem",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: groupBranding?.editPhotoBgColor || groupBranding?.backgroundColor || "#fdf7f4",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "1rem",
        paddingTop: "0.5rem",
      }}
    >
      {/* Video Processing Loading Overlay */}
      {videoProcessingMessage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "2rem 2.5rem",
              textAlign: "center",
              maxWidth: "320px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* Spinning Animation */}
            <div
              style={{
                width: "60px",
                height: "60px",
                margin: "0 auto 1.5rem",
                border: "4px solid #E5E7EB",
                borderTopColor: "#8B5CF6",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: "600",
                color: "#1F2937",
                marginBottom: "0.5rem",
              }}
            >
              Memproses Video
            </div>
            <div
              style={{
                fontSize: "0.9rem",
                color: "#6B7280",
                lineHeight: "1.5",
              }}
            >
              {videoProcessingMessage}
            </div>
          </div>
          
          {/* CSS Animation */}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.85; }
            }
          `}</style>
        </div>
      )}

      {/* Debug Info: Show if frameConfig or photos missing (debug only) */}
      {debugEnabled && (!frameConfig || photos.length === 0) && (
        <div
          style={{
            background: "#fff7ed",
            color: "#b45309",
            border: "1px solid #fbbf24",
            borderRadius: "8px",
            padding: "1rem",
            marginBottom: "1rem",
            maxWidth: "600px",
            fontSize: "0.95rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <strong>Debug Info:</strong>
          <div>
            frameConfig: {JSON.stringify(safeStorage.getJSON("frameConfig"))}
          </div>
          <div>
            frameConfigTimestamp:{" "}
            {String(safeStorage.getItem("frameConfigTimestamp"))}
          </div>
          <div>
            capturedPhotos:{" "}
            {JSON.stringify(safeStorage.getJSON("capturedPhotos"))}
          </div>
          <div>
            activeDraftId: {String(safeStorage.getItem("activeDraftId"))}
          </div>
        </div>
      )}

      {/* Preview Title */}
      <h1
        ref={previewSectionRef}
        style={{
          fontSize: "1rem",
          fontWeight: "700",
          color: "#000000",
          marginBottom: "0.4rem",
          marginTop: "0.25rem",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        Preview
      </h1>

      {/* Save Message */}
      {saveMessage && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            padding: "1rem 1.5rem",
            borderRadius: "8px",
            fontSize: "0.9rem",
            background: saveMessage.includes("✅") ? "#d4edda" : "#f8d7da",
            color: saveMessage.includes("✅") ? "#155724" : "#721c24",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {saveMessage}
        </div>
      )}

      {/* Photo Preview */}
      {frameConfig && (
        <div
          ref={previewContainerRef}
          onClick={(e) => {
            // Clear selection when clicking on empty area (not on a photo)
            if (e.target === e.currentTarget || !e.target.closest('[data-photo-container="true"]')) {
              if (swapSourceId || selectedPhotoId) {
                console.log("👆 Clicked outside photo - clearing selection");
                setSwapSourceId(null);
                setSelectedPhotoId(null);
                // Clear touch state
                touchStateRef.current.activePhotoId = null;
                touchStateRef.current.isDragging = false;
                touchStateRef.current.isPinching = false;
              }
            }
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
            width: "100%",
            maxWidth: "900px",
            touchAction: selectedPhotoId ? "none" : "auto",
          }}
        >
          {/* Frame Canvas Container */}
          <div
            onClick={(e) => {
              // Clear selection when clicking on canvas area (not on a photo)
              if (!e.target.closest('[data-photo-container="true"]')) {
                if (swapSourceId || selectedPhotoId) {
                  console.log("👆 Clicked on canvas - clearing selection");
                  setSwapSourceId(null);
                  setSelectedPhotoId(null);
                  touchStateRef.current.activePhotoId = null;
                  touchStateRef.current.isDragging = false;
                  touchStateRef.current.isPinching = false;
                }
              }
            }}
            style={{
              background: "white",
              padding: "1rem",
              borderRadius: "16px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              overflow: "hidden",
              width: "fit-content",
              height: `${exportCanvasSize.height * previewScale + 32}px`,
            }}
          >
            {/* Frame Canvas */}
            <div
              id="frame-preview-canvas"
              style={{
                position: "relative",
                width: `${exportCanvasSize.width}px`,
                height: `${exportCanvasSize.height}px`,
                margin: "0 auto",
                background:
                  frameConfig && frameConfig.designer
                    ? frameConfig.designer.canvasBackground || "#fff"
                    : "#fff",
                borderRadius: "12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                overflow: "hidden",
                transform: `scale(${previewScale})`,
                transformOrigin: "top center",
              }}
            >
              {/* LAYER 1: Background Photo */}
              {backgroundPhotoElement && backgroundPhotoElement.data?.image && (
                <img
                  src={imagePresets.full(backgroundPhotoElement.data.image)}
                  alt="Background"
                  loading="eager"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    zIndex: BACKGROUND_PHOTO_Z,
                    ...getFilterStyle(),
                  }}
                  onError={(e) => {
                    // Fallback to original if CDN fails
                    if (!e.target.dataset.fallback) {
                      e.target.dataset.fallback = 'true';
                      e.target.src = backgroundPhotoElement.data.image;
                    }
                  }}
                />
              )}

              {/* LAYER 2 & 3: Designer Elements (photos as uploads, text, shapes, real uploads) */}
              {/* Sort elements by zIndex to ensure proper layering (higher zIndex = rendered on top) */}
              {designerElements &&
                designerElements.length > 0 &&
                [...designerElements]
                  .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                  .map((element, idx) => {
                  if (!element || !element.type) return null;
                  
                  if (debugEnabled) {
                    console.log(`🎨 Rendering element ${idx}:`, {
                      type: element.type,
                      id: element.id
                        ? String(element.id).slice(0, 8)
                        : "no-id",
                      x: element.x,
                      y: element.y,
                      width: element.width,
                      height: element.height,
                      zIndex: element.zIndex,
                      hasImage: !!element.data?.image,
                      photoIndex: element.data?.photoIndex,
                      __isOverlay: element.data?.__isOverlay,
                    });
                  }
                  
                  const elemZIndex = Number.isFinite(element.zIndex)
                    ? element.zIndex
                    : 200 + idx;

                  // Render text
                  if (element.type === "text") {
                    const verticalAlign =
                      element.data?.verticalAlign === "middle" ||
                      element.data?.verticalAlign === "center"
                        ? "center"
                        : element.data?.verticalAlign === "bottom"
                        ? "flex-end"
                        : element.data?.verticalAlign === "top"
                        ? "flex-start"
                        : "center"; // Match Create default

                    const horizontalAlign = element.data?.align || "left";

                    return (
                      <div
                        key={`element-${element.id || idx}`}
                        style={{
                          position: "absolute",
                          left: `${element.x || 0}px`,
                          top: `${element.y || 0}px`,
                          width: `${element.width || 100}px`,
                          height: `${element.height || 100}px`,
                          zIndex: elemZIndex,
                          pointerEvents: "none",
                          fontFamily: element.data?.fontFamily || "Inter",
                          fontSize: `${element.data?.fontSize || 24}px`,
                          color: element.data?.color || "#111827",
                          fontWeight: element.data?.fontWeight || 500,
                          textAlign: horizontalAlign,
                          display: "flex",
                          alignItems: verticalAlign,
                          justifyContent:
                            horizontalAlign === "center"
                              ? "center"
                              : horizontalAlign === "right"
                              ? "flex-end"
                              : "flex-start",
                          // Match Create defaults so text sits visually the same
                          padding: "12px 18px",
                          boxSizing: "border-box",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.25,
                        }}
                      >
                        {element.data?.text || ""}
                      </div>
                    );
                  }

                  // Render shape
                  if (element.type === "shape") {
                    return (
                      <div
                        key={`element-${element.id || idx}`}
                        style={{
                          position: "absolute",
                          left: `${element.x || 0}px`,
                          top: `${element.y || 0}px`,
                          width: `${element.width || 100}px`,
                          height: `${element.height || 100}px`,
                          zIndex: elemZIndex,
                          pointerEvents: "none",
                          background: element.data?.fill || "#000",
                          borderRadius:
                            element.data?.shape === "circle"
                              ? "50%"
                              : `${element.data?.borderRadius || 0}px`,
                          opacity:
                            element.data?.opacity !== undefined
                              ? element.data.opacity
                              : 1,
                        }}
                      />
                    );
                  }

                  // Render upload (including converted photos) - support both "upload" and "photo" types
                  if (element.type === "upload" || element.type === "photo") {
                    const hasImage = !!element.data?.image;
                    const isPhotoSlot =
                      typeof element.data?.photoIndex === "number";
                    const isOverlay = element.data?.__isOverlay === true;

                    const rotationDeg = Number.isFinite(element?.rotation)
                      ? element.rotation
                      : 0;
                    const rotationTransform = rotationDeg
                      ? `rotate(${rotationDeg}deg)`
                      : "";

                    // FIXED: Overlay elements must always be ABOVE photo slots
                    // Photo slots: zIndex 100-199
                    // Overlay elements: zIndex 500+ (always on top)
                    let finalZIndex;
                    if (isOverlay) {
                      // Overlay must be on top - use high zIndex
                      finalZIndex = Number.isFinite(element.zIndex) && element.zIndex >= 500 
                        ? element.zIndex 
                        : 500 + idx;
                    } else if (isPhotoSlot) {
                      // Photo slots should have lower zIndex (below overlays)
                      finalZIndex = Number.isFinite(element.zIndex) 
                        ? Math.min(element.zIndex, 199) // Cap at 199 so overlays are always on top
                        : 100 + idx;
                    } else {
                      finalZIndex = elemZIndex;
                    }

                    // DEBUG: Log photo slot rendering - print values directly for easy reading
                    console.log(`📷 Element render: hasImage=${hasImage}, isPhotoSlot=${isPhotoSlot}, isOverlay=${isOverlay}, x=${element.x}, y=${element.y}, width=${element.width}, height=${element.height}, originalZIndex=${element.zIndex}, finalZIndex=${finalZIndex}`);

                    // Render overlay elements (decorative frame overlays)
                    if (isOverlay && hasImage) {
                      return (
                        <div
                          key={`overlay-${element.id || idx}`}
                          style={{
                            position: "absolute",
                            left: `${element.x || 0}px`,
                            top: `${element.y || 0}px`,
                            width: `${element.width || 100}px`,
                            height: `${element.height || 100}px`,
                            zIndex: finalZIndex,
                            pointerEvents: "none", // Overlay is not interactive
                            overflow: "hidden",
                          }}
                        >
                          <img
                            src={element.data.image}
                            alt="Frame overlay"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: element.data?.objectFit || "contain",
                              display: "block",
                              pointerEvents: "none",
                            }}
                            draggable={false}
                            onError={(e) => {
                              console.warn("⚠️ Overlay image failed to load:", element.data.image);
                              e.target.style.display = "none";
                            }}
                          />
                        </div>
                      );
                    }

                    if (!hasImage && isPhotoSlot) {
                      console.warn(
                        `⚠️ Photo slot ${element.data.photoIndex} missing image!`
                      );

                      // Render placeholder for empty photo slots
                      return (
                        <div
                          key={`element-${element.id || idx}`}
                          style={{
                            position: "absolute",
                            left: `${element.x || 0}px`,
                            top: `${element.y || 0}px`,
                            width: `${element.width || 100}px`,
                            height: `${element.height || 100}px`,
                            zIndex: finalZIndex,
                            pointerEvents: "none",
                            borderRadius: `${
                              element.data?.borderRadius ?? 0
                            }px`,
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#f3f4f6",
                            border: "2px dashed #d1d5db",
                            transform: rotationTransform || undefined,
                            transformOrigin: "center center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "48px",
                              color: "#9ca3af",
                            }}
                          >
                            📷
                          </span>
                        </div>
                      );
                    }

                    if (!hasImage) {
                      console.warn("⚠️ Skipping non-photo element with missing image:", {
                        id: element.id,
                        type: element.type,
                        zIndex: element.zIndex,
                        isOverlay,
                      });
                      return null;
                    }

                    const photoId = element.id || `photo-${idx}`;
                    const photoTransform = getPhotoTransform(photoId);
                    const isSelected = selectedPhotoId === photoId;
                    const isSwapSource = swapSourceId === photoId;

                    // Handle click/tap for photo swap (mobile-friendly: single tap)
                    const handlePhotoClick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("📱 Photo tapped:", photoId, "swapSource:", swapSourceId);
                      
                      // If there's a swap source and we tapped a different photo, perform swap
                      if (swapSourceId && swapSourceId !== photoId) {
                        console.log("🔄 Performing swap:", swapSourceId, "↔", photoId);
                        swapPhotos(swapSourceId, photoId);
                        return;
                      }
                      
                      // If this photo is already the swap source, cancel swap mode
                      if (swapSourceId === photoId) {
                        console.log("❌ Cancelling swap mode");
                        setSwapSourceId(null);
                        setSelectedPhotoId(null);
                        return;
                      }
                      
                      // First tap - immediately enter swap mode (mobile-friendly)
                      console.log("🔀 Entering swap mode for:", photoId);
                      setSwapSourceId(photoId);
                      setSelectedPhotoId(photoId);
                    };

                    const isHovered = hoveredPhotoId === photoId;

                    return (
                      <div
                        key={`element-${element.id || idx}`}
                        ref={(el) => {
                          if (el) {
                            el.dataset.photoId = photoId;
                            photoContainerRefs.current[photoId] = el;
                          }
                        }}
                        data-photo-container="true"
                        style={{
                          position: "absolute",
                          left: `${element.x || 0}px`,
                          top: `${element.y || 0}px`,
                          width: `${element.width || 100}px`,
                          height: `${element.height || 100}px`,
                          // Keep zIndex consistent with designer config so text can stay above photos
                          // (selected/swap visual state is handled via outline/shadow, not stacking)
                          zIndex: finalZIndex,
                          pointerEvents: "auto",
                          borderRadius: `${element.data?.borderRadius ?? 0}px`,
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "transparent",
                          touchAction: "none",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                          // Hover effect - subtle scale and shadow
                          transform: `${rotationTransform}${rotationTransform ? " " : ""}${
                            isHovered && !isSelected && !isSwapSource
                              ? "scale(1.02)"
                              : "scale(1)"
                          }`,
                          transformOrigin: "center center",
                          transition: "transform 0.2s ease-out, box-shadow 0.2s ease-out, outline 0.2s ease-out",
                          // Visual states: swap source (orange), selected (blue), swap target hint (green dashed), hover (subtle glow)
                          outline: isSwapSource 
                            ? "4px solid #F59E0B" 
                            : isSelected 
                              ? "3px solid #4F46E5" 
                              : swapSourceId 
                                ? "3px dashed #10B981" 
                                : isHovered
                                  ? "2px solid rgba(79, 70, 229, 0.5)"
                                  : "none",
                          boxShadow: isSwapSource 
                            ? "0 0 0 8px rgba(245,158,11,0.3)" 
                            : isSelected 
                              ? "0 0 0 6px rgba(79,70,229,0.3)" 
                              : swapSourceId 
                                ? "0 0 0 4px rgba(16,185,129,0.2)" 
                                : isHovered
                                  ? "0 4px 12px rgba(79, 70, 229, 0.25), 0 0 0 3px rgba(79, 70, 229, 0.1)"
                                  : "none",
                          cursor: swapSourceId ? "pointer" : isSelected ? "move" : "pointer",
                        }}
                        onClick={handlePhotoClick}
                        onTouchStart={(e) => handlePhotoTouchStart(e, photoId, e.currentTarget)}
                        onTouchMove={(e) => handlePhotoTouchMove(e, photoId)}
                        onTouchEnd={(e) => handlePhotoTouchEnd(e, photoId)}
                        onWheel={(e) => handlePhotoWheel(e, photoId, e.currentTarget)}
                        onGestureStart={(e) => { e.preventDefault(); }}
                        onGestureChange={(e) => handleGestureChange(e, photoId, e.currentTarget)}
                        onGestureEnd={(e) => { e.preventDefault(); }}
                        onMouseDown={(e) => handlePhotoMouseDown(e, photoId, e.currentTarget)}
                        onMouseMove={(e) => handlePhotoMouseMove(e, photoId)}
                        onMouseUp={(e) => handlePhotoMouseUp(e, photoId)}
                        onMouseEnter={() => setHoveredPhotoId(photoId)}
                        onMouseLeave={() => setHoveredPhotoId(null)}
                      >
                        <img
                          src={element.data.image}
                          alt={
                            element.data?.photoIndex !== undefined
                              ? `Photo ${element.data.photoIndex + 1}`
                              : "Upload"
                          }
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                            transform: `translate(${photoTransform.x}px, ${photoTransform.y}px) scale(${photoTransform.scale})`,
                            transformOrigin: "center center",
                            transition: photoTransform.scale === 1 ? "transform 0.2s ease-out" : "none",
                            willChange: "transform",
                            pointerEvents: "none",
                            ...getFilterStyle(),
                          }}
                          draggable={false}
                        />
                        {/* Zoom indicator */}
                        {photoTransform.scale > 1 && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              right: "8px",
                              background: "rgba(0,0,0,0.7)",
                              color: "white",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "14px",
                              fontWeight: "600",
                              pointerEvents: "none",
                              zIndex: 10,
                            }}
                          >
                            {photoTransform.scale.toFixed(1)}x
                          </div>
                        )}
                      </div>
                    );
                  }

                  return null;
                })}

              {/* LAYER 4: Frame Overlay (frameImage) - Always on top */}
              {/* For custom frames (isCustom=true), DON'T render frameImage as overlay */}
              {/* because frameImage is just a JPEG preview/thumbnail, not a transparent overlay */}
              {/* Custom frames use designerElements to render text/shapes/etc instead */}
              {frameConfig && frameConfig.frameImage && !frameConfig.isCustom && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 9999,
                    pointerEvents: "none",
                  }}
                >
                  <img
                    src={frameConfig.frameImage}
                    alt="Frame Overlay"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Filter Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "0.75rem",
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: "0.75rem",
              paddingTop: "0.5rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              width: "100%",
              maxWidth: "100vw",
              boxSizing: "border-box",
              msOverflowStyle: "none",
              scrollSnapType: "x mandatory",
            }}
          >
            {filterPresets.map((preset) => {
              const isActive = activeFilter === preset.name;
              return (
                <button
                  key={preset.name}
                  onClick={() => {
                    if (isActive) {
                      resetFilters();
                      return;
                    }
                    applyFilterPreset(preset);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "0",
                    flexShrink: 0,
                    scrollSnapAlign: "start",
                    touchAction: "pan-x",
                    outline: "none",
                  }}
                >
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.22'/%3E%3C/svg%3E"), ${preset.color}`,
                      backgroundSize: "cover, cover",
                      backgroundBlendMode: "overlay, normal",
                      boxShadow: isActive
                        ? "0 0 0 2.5px #fff, 0 0 0 4.5px #6366f1, 0 3px 10px rgba(99,102,241,0.32)"
                        : "0 2px 6px rgba(0,0,0,0.18)",
                      transition: "box-shadow 0.2s ease, transform 0.15s ease",
                      transform: isActive ? "scale(1.13)" : "scale(1)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* Gloss highlight */}
                    <div
                      style={{
                        position: "absolute",
                        top: "4px",
                        left: "7px",
                        width: "28px",
                        height: "13px",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.30)",
                        filter: "blur(2.5px)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "0.58rem",
                      fontWeight: isActive ? "700" : "500",
                      color: isActive ? "#4338ca" : "#555",
                      textAlign: "center",
                      lineHeight: 1.2,
                      maxWidth: "52px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: "row-reverse",
              gap: "0.5rem",
              width: "100%",
              maxWidth: "400px",
              marginTop: "0.25rem",
              justifyContent: "center",
            }}
          >
            <button
              style={{
                padding: "0.6rem 1.2rem",
                background: "#E8A889",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.9rem",
                cursor: "pointer",
                fontWeight: "600",
                boxShadow: "0 2px 8px rgba(232, 168, 137, 0.3)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#D4967A";
                e.target.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#E8A889";
                e.target.style.transform = "translateY(0)";
              }}
              onClick={async () => {
                console.log("🎨 [v3.0-16Dec-FINAL] Memulai download dengan canvas manual...");
                console.log("🔥 USER CACHE CHECK: If you see this log, you are using the LATEST code!");

                // Safari desktop sometimes blocks downloads when the click handler awaits work.
                // Open a fallback window immediately while we're still in the user gesture.
                let safariDownloadWindow = null;
                if (isDesktopSafari) {
                  try {
                    safariDownloadWindow = window.open("", "_blank");
                  } catch {
                    safariDownloadWindow = null;
                  }
                }

                showToast({
                  type: "info",
                  title: "Menyiapkan Download",
                  message: "Sedang menyiapkan file...",
                });

                trackGroupDownloadClick("photo_download_click");

                try {
                  // Buat canvas baru
                  const canvas = document.createElement("canvas");
                  canvas.width = exportCanvasSize.width;
                  canvas.height = exportCanvasSize.height;
                  const ctx = canvas.getContext("2d", { alpha: true }); // ✅ Enable alpha for transparency

                  // ✅ Helper function to apply filter using temporary canvas (Safari compatible)
                  const applyFilterToImage = (img, filterValues) => {
                    // Create temporary canvas same size as image
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = img.width;
                    tempCanvas.height = img.height;
                    const tempCtx = tempCanvas.getContext("2d");
                    
                    // Draw original image first
                    tempCtx.drawImage(img, 0, 0);
                    
                    // Get image data for manual filter processing
                    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                    const data = imageData.data;
                    
                    const { brightness, contrast, saturate, grayscale, sepia, hueRotate } = filterValues;
                    
                    // Apply filters manually pixel by pixel
                    for (let i = 0; i < data.length; i += 4) {
                      let r = data[i];
                      let g = data[i + 1];
                      let b = data[i + 2];
                      
                      // Brightness (100 = normal)
                      const brightnessFactor = brightness / 100;
                      r *= brightnessFactor;
                      g *= brightnessFactor;
                      b *= brightnessFactor;
                      
                      // Contrast (100 = normal)
                      const contrastFactor = (contrast / 100);
                      const intercept = 128 * (1 - contrastFactor);
                      r = r * contrastFactor + intercept;
                      g = g * contrastFactor + intercept;
                      b = b * contrastFactor + intercept;
                      
                      // Grayscale (0 = normal, 100 = full grayscale)
                      if (grayscale > 0) {
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        const grayFactor = grayscale / 100;
                        r = r * (1 - grayFactor) + gray * grayFactor;
                        g = g * (1 - grayFactor) + gray * grayFactor;
                        b = b * (1 - grayFactor) + gray * grayFactor;
                      }
                      
                      // Sepia (0 = normal, 100 = full sepia)
                      if (sepia > 0) {
                        const sepiaFactor = sepia / 100;
                        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
                        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
                        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
                        r = r * (1 - sepiaFactor) + sr * sepiaFactor;
                        g = g * (1 - sepiaFactor) + sg * sepiaFactor;
                        b = b * (1 - sepiaFactor) + sb * sepiaFactor;
                      }
                      
                      // Saturate (100 = normal)
                      if (saturate !== 100) {
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        const satFactor = saturate / 100;
                        r = gray + satFactor * (r - gray);
                        g = gray + satFactor * (g - gray);
                        b = gray + satFactor * (b - gray);
                      }
                      
                      // Hue rotate (degrees)
                      if (hueRotate !== 0) {
                        const angle = hueRotate * Math.PI / 180;
                        const cos = Math.cos(angle);
                        const sin = Math.sin(angle);
                        const newR = r * (0.213 + cos * 0.787 - sin * 0.213) + 
                                     g * (0.715 - cos * 0.715 - sin * 0.715) + 
                                     b * (0.072 - cos * 0.072 + sin * 0.928);
                        const newG = r * (0.213 - cos * 0.213 + sin * 0.143) + 
                                     g * (0.715 + cos * 0.285 + sin * 0.140) + 
                                     b * (0.072 - cos * 0.072 - sin * 0.283);
                        const newB = r * (0.213 - cos * 0.213 - sin * 0.787) + 
                                     g * (0.715 - cos * 0.715 + sin * 0.715) + 
                                     b * (0.072 + cos * 0.928 + sin * 0.072);
                        r = newR;
                        g = newG;
                        b = newB;
                      }
                      
                      // Clamp values
                      data[i] = Math.max(0, Math.min(255, Math.round(r)));
                      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
                      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
                    }
                    
                    // Put filtered image data back
                    tempCtx.putImageData(imageData, 0, 0);
                    console.log("🎨 Manual pixel filter applied successfully");
                    
                    return tempCanvas;
                  };
                  
                  // Get filter values
                  const filterValues = {
                    brightness: filters.brightness,
                    contrast: filters.contrast,
                    saturate: filters.saturate,
                    grayscale: filters.grayscale,
                    sepia: filters.sepia,
                    blur: filters.blur,
                    hueRotate: filters.hueRotate
                  };
                  
                  // Check if any filter is active (not default values)
                  const isFilterActive = 
                    filters.brightness !== 100 ||
                    filters.contrast !== 100 ||
                    filters.saturate !== 100 ||
                    filters.grayscale !== 0 ||
                    filters.sepia !== 0 ||
                    filters.blur !== 0 ||
                    filters.hueRotate !== 0;
                  
                  console.log("🎨 Filter active:", isFilterActive, filterValues);

                  // Background color
                  ctx.fillStyle =
                    frameConfig?.designer?.canvasBackground || "#ffffff";
                  ctx.fillRect(0, 0, exportCanvasSize.width, exportCanvasSize.height);

                  // Helper function untuk object-fit: cover
                  const drawImageCover = (ctx, img, x, y, w, h) => {
                    const imgRatio = img.width / img.height;
                    const boxRatio = w / h;

                    let sourceX = 0,
                      sourceY = 0,
                      sourceW = img.width,
                      sourceH = img.height;

                    if (imgRatio > boxRatio) {
                      // Image lebih lebar, crop kiri-kanan
                      sourceW = img.height * boxRatio;
                      sourceX = (img.width - sourceW) / 2;
                    } else {
                      // Image lebih tinggi, crop atas-bawah
                      sourceH = img.width / boxRatio;
                      sourceY = (img.height - sourceH) / 2;
                    }

                    ctx.drawImage(
                      img,
                      sourceX,
                      sourceY,
                      sourceW,
                      sourceH,
                      x,
                      y,
                      w,
                      h
                    );
                  };

                  // Helper function untuk object-fit: cover WITH transform (zoom/pan)
                  const drawImageCoverWithTransform = (ctx, img, x, y, w, h, transform) => {
                    const { scale = 1, x: panX = 0, y: panY = 0 } = transform || {};
                    
                    // Calculate the source rectangle for object-fit: cover
                    const imgRatio = img.width / img.height;
                    const boxRatio = w / h;

                    let baseSourceX = 0,
                      baseSourceY = 0,
                      baseSourceW = img.width,
                      baseSourceH = img.height;

                    if (imgRatio > boxRatio) {
                      // Image lebih lebar, crop kiri-kanan
                      baseSourceW = img.height * boxRatio;
                      baseSourceX = (img.width - baseSourceW) / 2;
                    } else {
                      // Image lebih tinggi, crop atas-bawah
                      baseSourceH = img.width / boxRatio;
                      baseSourceY = (img.height - baseSourceH) / 2;
                    }

                    // Apply zoom: when zoomed in, we show less of the image (smaller source area)
                    const zoomedSourceW = baseSourceW / scale;
                    const zoomedSourceH = baseSourceH / scale;
                    
                    // Center the zoomed view initially
                    let zoomedSourceX = baseSourceX + (baseSourceW - zoomedSourceW) / 2;
                    let zoomedSourceY = baseSourceY + (baseSourceH - zoomedSourceH) / 2;
                    
                    // Apply pan: convert screen pan to source pan
                    // panX is in screen coordinates (destination), convert to source coordinates
                    // Negative panX means user dragged left -> show more of right side -> increase sourceX
                    const panSourceX = -(panX / w) * zoomedSourceW;
                    const panSourceY = -(panY / h) * zoomedSourceH;
                    
                    zoomedSourceX += panSourceX;
                    zoomedSourceY += panSourceY;
                    
                    // Clamp source coordinates to image bounds
                    zoomedSourceX = Math.max(0, Math.min(zoomedSourceX, img.width - zoomedSourceW));
                    zoomedSourceY = Math.max(0, Math.min(zoomedSourceY, img.height - zoomedSourceH));
                    
                    console.log(`🎨 drawImageCoverWithTransform: scale=${scale.toFixed(2)}, pan=(${panX.toFixed(0)},${panY.toFixed(0)}), source=(${zoomedSourceX.toFixed(0)},${zoomedSourceY.toFixed(0)},${zoomedSourceW.toFixed(0)},${zoomedSourceH.toFixed(0)})`);

                    ctx.drawImage(
                      img,
                      zoomedSourceX,
                      zoomedSourceY,
                      zoomedSourceW,
                      zoomedSourceH,
                      x,
                      y,
                      w,
                      h
                    );
                  };

                  // ✅ Helper function untuk object-fit: contain (untuk transparent PNGs)
                  const drawImageContain = (ctx, img, x, y, w, h) => {
                    const imgRatio = img.width / img.height;
                    const boxRatio = w / h;

                    let drawW = w;
                    let drawH = h;
                    let drawX = x;
                    let drawY = y;

                    if (imgRatio > boxRatio) {
                      // Image lebih lebar, fit to width
                      drawH = w / imgRatio;
                      drawY = y + (h - drawH) / 2;
                    } else {
                      // Image lebih tinggi, fit to height
                      drawW = h * imgRatio;
                      drawX = x + (w - drawW) / 2;
                    }

                    ctx.drawImage(
                      img,
                      0,
                      0,
                      img.width,
                      img.height,
                      drawX,
                      drawY,
                      drawW,
                      drawH
                    );
                  };

                  // Load dan draw background photo
                  // NOTE: Background photo is FRAME BACKGROUND (not user photo), so NO FILTER should be applied
                  if (
                    backgroundPhotoElement &&
                    backgroundPhotoElement.data?.image
                  ) {
                    try {
                      const bgImgUrl = getOriginalUrl(backgroundPhotoElement.data.image);
                      console.log("🖼️ Loading background photo (FRAME - no filter):", bgImgUrl.substring(0, 80) + "...");
                      const bgImg = await loadImageWithFallback(bgImgUrl);
                      
                      // ❌ NO FILTER for frame background - this is NOT a user photo
                      // Frame background should always retain original colors
                      ctx.save();
                      // Draw dengan object-fit: cover - original image, no filter
                      drawImageCover(
                        ctx,
                        bgImg,
                        0,
                        0,
                        exportCanvasSize.width,
                        exportCanvasSize.height
                      );
                      ctx.restore();
                      console.log("✅ Background photo drawn successfully (NO FILTER - frame background)");
                    } catch (bgError) {
                      console.error("❌ Failed to load background photo:", bgError);
                    }
                  }

                  // Sort designer elements by z-index to draw in correct order
                  const sortedElements = [...designerElements].sort((a, b) => {
                    const zIndexA = Number.isFinite(a?.zIndex) ? a.zIndex : 200;
                    const zIndexB = Number.isFinite(b?.zIndex) ? b.zIndex : 200;
                    return zIndexA - zIndexB;
                  });

                  console.log("🔍 DOWNLOAD DEBUG - Designer Elements:");
                  designerElements.forEach((el, i) => {
                    console.log(`  Slot ${i}:`, {
                      type: el.type,
                      x: el.x,
                      y: el.y,
                      width: el.width,
                      height: el.height,
                      hasImage: !!el.data?.image,
                      imagePreview: el.data?.image ? el.data.image.substring(0, 50) + '...' : 'none',
                      photoIndex: el.data?.photoIndex,
                    });
                  });

                  console.log(
                    "📊 Rendering elements in order:",
                    sortedElements.map((el) => ({
                      type: el.type,
                      id: el.id ? String(el.id).slice(0, 8) : 'no-id',
                      zIndex: el.zIndex,
                      text: el.type === "text" ? el.data?.text : undefined,
                    }))
                  );

                  // Draw designer elements
                  for (const element of sortedElements) {
                    if (!element || !element.type) continue;

                    console.log(`🎨 DOWNLOAD: Drawing element type=${element.type}, hasImage=${!!element.data?.image}`);

                    // Support both "upload" and "photo" types for custom frames
                    if ((element.type === "upload" || element.type === "photo") && element.data?.image) {
                      console.log(`  ✅ Drawing photo/upload at x=${element.x}, y=${element.y}, w=${element.width}, h=${element.height}`);
                      
                      try {
                        const img = await loadImageWithFallback(element.data.image);
                        console.log(`  📸 Image loaded successfully, drawing to canvas...`);

                        // IMPORTANT: Match preview behavior:
                        // A "photo slot" is determined by having a numeric photoIndex.
                        // Do NOT rely on element.type === "photo" because some non-slot elements
                        // can be typed as "photo" but should never be filtered (e.g. overlays).
                        const isPhotoSlot =
                          typeof element.data?.photoIndex === "number";
                        
                        // Check if this is a frame overlay (should NOT be filtered)
                        // Multiple checks to ensure ALL frame-related elements are excluded
                        const isFrameOverlay =
                          element.data?.__isOverlay === true ||
                          element.data?.isOverlay === true ||
                          element.zIndex >= 500 ||
                          element.type === "frame-overlay" ||
                          element.id?.includes("frame") ||
                          element.id?.includes("overlay");
                        
                        console.log(`  🔍 [v3.0-16Dec-FINAL] Element ID=${element.id}, type=${element.type}, photoIndex=${element.data?.photoIndex}, isPhotoSlot=${isPhotoSlot}, isOverlay=${element.data?.isOverlay}, zIndex=${element.zIndex}, isFrameOverlay=${isFrameOverlay}`);
                        
                        // ✅ Apply filter using manual pixel manipulation (works on all browsers)
                        // Apply ONLY for photo slots, and skip for frame overlays
                        let sourceCanvas;
                        if (isFilterActive && isPhotoSlot && !isFrameOverlay) {
                          sourceCanvas = applyFilterToImage(img, filterValues);
                          console.log(`  🎨 Filter applied via pixel manipulation`);
                        } else if (isFrameOverlay) {
                          // Frame overlay - NO FILTER
                          sourceCanvas = document.createElement("canvas");
                          sourceCanvas.width = img.width;
                          sourceCanvas.height = img.height;
                          sourceCanvas.getContext("2d").drawImage(img, 0, 0);
                          console.log(`  ⏭️ FRAME OVERLAY SKIPPED - NO FILTER APPLIED`);
                        } else {
                          // Non-slot upload (sticker/logo/etc) OR no active filter - NO FILTER
                          // No filter needed, draw original image to temp canvas
                          sourceCanvas = document.createElement("canvas");
                          sourceCanvas.width = img.width;
                          sourceCanvas.height = img.height;
                          sourceCanvas.getContext("2d").drawImage(img, 0, 0);
                        }
                        
                        // Now draw from filtered canvas to main canvas
                        ctx.save();

                        // ✅ Reset context for proper transparency handling
                        ctx.globalAlpha = 1;
                        ctx.globalCompositeOperation = "source-over";

                        const x = Number(element.x) || 0;
                        const y = Number(element.y) || 0;
                        const w = Number(element.width) || 100;
                        const h = Number(element.height) || 100;

                        const rotationDeg = Number.isFinite(element?.rotation)
                          ? element.rotation
                          : 0;
                        const rotationRad = (rotationDeg * Math.PI) / 180;

                        // Apply element rotation around its center (slot rotation)
                        ctx.translate(x + w / 2, y + h / 2);
                        if (rotationRad) {
                          ctx.rotate(rotationRad);
                        }
                        ctx.translate(-w / 2, -h / 2);

                        // Clip for slot shape (circle or rounded rect)
                        const rawRadius = Number(element.data?.borderRadius ?? 0);
                        const r = Number.isFinite(rawRadius) ? rawRadius : 0;
                        const slotShape = element.data?.shape;
                        if (slotShape === "circle") {
                          const radius = Math.min(w, h) / 2;
                          ctx.beginPath();
                          ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
                          ctx.closePath();
                          ctx.clip();
                        } else if (r > 0) {
                          const clamped = Math.min(Math.max(r, 0), Math.min(w, h) / 2);
                          ctx.beginPath();
                          ctx.moveTo(clamped, 0);
                          ctx.lineTo(w - clamped, 0);
                          ctx.quadraticCurveTo(w, 0, w, clamped);
                          ctx.lineTo(w, h - clamped);
                          ctx.quadraticCurveTo(w, h, w - clamped, h);
                          ctx.lineTo(clamped, h);
                          ctx.quadraticCurveTo(0, h, 0, h - clamped);
                          ctx.lineTo(0, clamped);
                          ctx.quadraticCurveTo(0, 0, clamped, 0);
                          ctx.closePath();
                          ctx.clip();
                        } else {
                          ctx.beginPath();
                          ctx.rect(0, 0, w, h);
                          ctx.closePath();
                          ctx.clip();
                        }

                        // Get transform for this photo element
                        const photoId =
                          element.id || `photo-${sortedElements.indexOf(element)}`;
                        const photoTransform = photoTransforms[photoId] || {
                          scale: 1,
                          x: 0,
                          y: 0,
                        };

                        // Draw into local (0,0,w,h) space after rotation transform
                        drawImageCoverWithTransform(
                          ctx,
                          sourceCanvas,
                          0,
                          0,
                          w,
                          h,
                          photoTransform
                        );
                        ctx.restore();
                        console.log(`  ✅ Image drawn with filter and transform:`, photoTransform);
                      } catch (imgError) {
                        console.error(`  ❌ Image load error:`, imgError);
                        // Continue with other elements even if one fails
                      }
                    } else if (element.type === "upload" || element.type === "photo") {
                      // Photo/upload element but NO image data
                      console.warn(`  ⚠️ Photo/upload element has NO image data!`, {
                        type: element.type,
                        hasDataObject: !!element.data,
                        imageType: typeof element.data?.image,
                        imageLength: element.data?.image?.length || 0,
                      });
                    } else if (element.type === "shape") {
                      ctx.save();
                      ctx.fillStyle = element.data?.fill || "#000";
                      ctx.globalAlpha =
                        element.data?.opacity !== undefined
                          ? element.data.opacity
                          : 1;

                      const x = element.x || 0;
                      const y = element.y || 0;
                      const w = element.width || 100;
                      const h = element.height || 100;
                      const r = element.data?.borderRadius || 0;

                      if (element.data?.shape === "circle") {
                        ctx.beginPath();
                        ctx.arc(
                          x + w / 2,
                          y + h / 2,
                          Math.min(w, h) / 2,
                          0,
                          Math.PI * 2
                        );
                        ctx.fill();
                      } else {
                        ctx.beginPath();
                        ctx.moveTo(x + r, y);
                        ctx.lineTo(x + w - r, y);
                        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                        ctx.lineTo(x + w, y + h - r);
                        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                        ctx.lineTo(x + r, y + h);
                        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                        ctx.lineTo(x, y + r);
                        ctx.quadraticCurveTo(x, y, x + r, y);
                        ctx.closePath();
                        ctx.fill();
                      }
                      ctx.restore();
                    } else if (element.type === "text") {
                      ctx.save();

                      const fontSize = element.data?.fontSize || 24;
                      const fontWeight = element.data?.fontWeight || 500;
                      const fontFamily = element.data?.fontFamily || "Inter";

                      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
                      ctx.fillStyle = element.data?.color || "#111827";

                      const x = element.x || 0;
                      const y = element.y || 0;
                      const w = element.width || 100;
                      const h = element.height || 100;
                      const text = element.data?.text || "";
                      const align = element.data?.align || "left";

                      // ✅ CRITICAL FIX: Proper text wrapping to prevent overflow
                      // Split text into lines that fit within element width
                      const wrapText = (context, text, maxWidth) => {
                        const words = text.split(" ");
                        const lines = [];
                        let currentLine = "";

                        for (let i = 0; i < words.length; i++) {
                          const testLine =
                            currentLine + (currentLine ? " " : "") + words[i];
                          const metrics = context.measureText(testLine);
                          const testWidth = metrics.width;

                          if (testWidth > maxWidth && currentLine) {
                            lines.push(currentLine);
                            currentLine = words[i];
                          } else {
                            currentLine = testLine;
                          }
                        }

                        if (currentLine) {
                          lines.push(currentLine);
                        }

                        return lines;
                      };

                      // Handle manual line breaks first
                      const manualLines = text.split("\n");
                      const allLines = [];

                      // Wrap each manual line to fit within width
                      manualLines.forEach((line) => {
                        if (line.trim()) {
                          const wrappedLines = wrapText(ctx, line, w - 20); // 20px padding
                          allLines.push(...wrappedLines);
                        } else {
                          allLines.push(""); // Empty line
                        }
                      });

                      const lineHeight = fontSize * 1.2;
                      const totalTextHeight = allLines.length * lineHeight;

                      // Calculate starting Y based on vertical alignment
                      let startY = y;
                      if (element.data?.verticalAlign === "middle") {
                        startY = y + (h - totalTextHeight) / 2 + fontSize;
                      } else if (element.data?.verticalAlign === "bottom") {
                        startY = y + h - totalTextHeight + fontSize;
                      } else {
                        startY = y + fontSize;
                      }

                      // Draw each line with proper alignment
                      ctx.textBaseline = "alphabetic";
                      allLines.forEach((line, index) => {
                        const lineY = startY + index * lineHeight;

                        // Calculate X position based on alignment
                        let textX = x + 10; // Left padding
                        if (align === "center") {
                          textX = x + w / 2;
                          ctx.textAlign = "center";
                        } else if (align === "right") {
                          textX = x + w - 10; // Right padding
                          ctx.textAlign = "right";
                        } else {
                          ctx.textAlign = "left";
                        }

                        ctx.fillText(line, textX, lineY, w - 20); // maxWidth with padding
                      });

                      ctx.restore();
                    }
                  }

                  // Draw frame overlay if exists and get actual frame dimensions
                  // ✅ CRITICAL: Skip frameImage for custom frames - they use designerElements instead
                  // frameImage for custom frames is just a JPEG preview thumbnail, not a transparent overlay
                  let finalCanvasWidth = exportCanvasSize.width;
                  let finalCanvasHeight = exportCanvasSize.height;
                  let frameOffsetX = 0;
                  let frameOffsetY = 0;

                  if (frameConfig && frameConfig.frameImage && !frameConfig.isCustom) {
                    try {
                      console.log("🖼️ Loading frame image for overlay:", frameConfig.frameImage.substring(0, 80) + "...");
                      const frameImg = await loadImageWithFallback(frameConfig.frameImage);
                      
                      // Calculate actual frame dimensions maintaining aspect ratio
                      const canvasWidth = exportCanvasSize.width;
                      const canvasHeight = exportCanvasSize.height;
                      const imgRatio = frameImg.width / frameImg.height;
                      const canvasRatio = canvasWidth / canvasHeight;

                      let drawWidth, drawHeight, drawX, drawY;

                      if (imgRatio > canvasRatio) {
                        // Image wider than canvas - fit to width
                        drawWidth = canvasWidth;
                        drawHeight = canvasWidth / imgRatio;
                        drawX = 0;
                        drawY = (canvasHeight - drawHeight) / 2;
                      } else {
                        // Image taller than canvas - fit to height
                        drawHeight = canvasHeight;
                        drawWidth = canvasHeight * imgRatio;
                        drawX = (canvasWidth - drawWidth) / 2;
                        drawY = 0;
                      }

                      // ✅ CRITICAL: Reset any filter/composite settings before drawing frame
                      // Frame overlay should NEVER be affected by photo filters
                      ctx.save();
                      ctx.filter = "none";
                      ctx.globalCompositeOperation = "source-over";
                      ctx.globalAlpha = 1;
                      
                      ctx.drawImage(
                        frameImg,
                        drawX,
                        drawY,
                        drawWidth,
                        drawHeight
                      );
                      
                      ctx.restore();

                      // Store actual frame dimensions for cropping
                      finalCanvasWidth = Math.round(drawWidth);
                      finalCanvasHeight = Math.round(drawHeight);
                      frameOffsetX = Math.round(drawX);
                      frameOffsetY = Math.round(drawY);
                      
                      console.log("✅ Frame overlay drawn successfully");
                    } catch (frameError) {
                      console.error("❌ Failed to load frame overlay:", frameError);
                      // Continue without frame overlay - photos will still be downloaded
                    }
                  }

                  // Crop canvas to actual frame size (remove white space)
                  let finalCanvas = canvas;
                  if (
                    frameOffsetX > 0 ||
                    frameOffsetY > 0 ||
                    finalCanvasWidth < exportCanvasSize.width ||
                    finalCanvasHeight < exportCanvasSize.height
                  ) {
                    console.log("✂️ Cropping canvas to frame size:", {
                      from: `${exportCanvasSize.width}x${exportCanvasSize.height}`,
                      to: `${finalCanvasWidth}x${finalCanvasHeight}`,
                      offset: `${frameOffsetX}, ${frameOffsetY}`,
                    });

                    finalCanvas = document.createElement("canvas");
                    finalCanvas.width = finalCanvasWidth;
                    finalCanvas.height = finalCanvasHeight;
                    const finalCtx = finalCanvas.getContext("2d");

                    // Copy cropped region from original canvas
                    finalCtx.drawImage(
                      canvas,
                      frameOffsetX,
                      frameOffsetY,
                      finalCanvasWidth,
                      finalCanvasHeight,
                      0,
                      0,
                      finalCanvasWidth,
                      finalCanvasHeight
                    );
                  }

                  // Download - Using new mobile-friendly helper
                  console.log("Canvas created:", {
                    width: finalCanvas.width,
                    height: finalCanvas.height,
                  });
                  
                  const dataUrl = finalCanvas.toDataURL("image/png", 1.0);
                  const timestamp = Date.now();
                  const filename = `fremio-photo-${timestamp}.png`;

                  // Fallback for Safari desktop: push a self-contained download page.
                  if (safariDownloadWindow && !safariDownloadWindow.closed) {
                    try {
                      safariDownloadWindow.document.open();
                      safariDownloadWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${filename}</title></head><body style="font-family: system-ui; padding: 16px;"><p>Jika download tidak otomatis, klik tombol di bawah.</p><p><a id="dl" href="${dataUrl}" download="${filename}" style="display:inline-block;padding:10px 14px;background:#e8a889;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">Download Photo</a></p><script>document.getElementById('dl').click();</script></body></html>`);
                      safariDownloadWindow.document.close();
                    } catch {
                      // Ignore fallback failures
                    }
                  }
                  
                  // Use download helper for mobile-friendly download
                  const frameId = frameConfig?.id || "unknown";
                  const frameName = frameConfig?.name || frameConfig?.id || "Unknown Frame";
                  
                  const result = await downloadPhotoToGallery(dataUrl, {
                    filename,
                    frameId,
                    frameName,
                    useShareApi: true,
                    showWebToasts: false,
                  });
                  
                  if (result.success) {
                    console.log("✅ Download selesai via", result.method);
                    
                    // Only show success toast if not cancelled
                    if (!result.cancelled) {
                      // Show modal for mobile devices
                      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                      const nativeShareShown = String(result.method || '').includes('share');
                      
                      // Backup popup only when native share/save sheet cannot be shown
                      if (isMobile && !nativeShareShown) {
                        setDownloadModalType('photo');
                        setShowDownloadModal(true);
                      } else {
                        showToast({
                          type: "success",
                          title: "Download Berhasil",
                          message: "Foto berhasil disimpan.",
                        });
                      }
                    }
                  } else {
                    throw new Error(result.error || "Download failed");
                  }
                } catch (error) {
                  console.error("❌ Error saat download:", error);
                  
                  // Check if it's a server/storage issue
                  const isServerError = error.message?.includes('544') || 
                                        error.message?.includes('502') || 
                                        error.message?.includes('timeout') ||
                                        error.message?.includes('unavailable');
                  
                  showToast({
                    type: "error",
                    title: "Download Gagal",
                    message: isServerError 
                      ? "Server penyimpanan sedang mengalami gangguan. Silakan coba lagi dalam beberapa menit."
                      : (error.message || "Terjadi kesalahan saat mengunduh foto."),
                  });
                }
              }}
            >
              Download Photo
            </button>
            
            <button
              onClick={async () => {
                // Check if videos exist
                if (!videos || videos.length === 0) {
                  showToast({
                    type: "warning",
                    title: "Tidak Ada Video",
                    message:
                      "Ambil video terlebih dahulu di halaman Take Moment.",
                    action: {
                      label: "Ambil Video",
                      onClick: () => navigate("/take-moment"),
                    },
                  });
                  return;
                }

                // Check if any video has valid data
                if (!hasValidVideo) {
                  showToast({
                    type: "error",
                    title: "Video Tidak Valid",
                    message:
                      "Video corrupt atau tidak valid. Silakan ambil video baru.",
                    action: {
                      label: "Ambil Ulang",
                      onClick: () => navigate("/take-moment"),
                    },
                  });
                  return;
                }

                try {
                  trackGroupDownloadClick("video_download_click");
                  setIsSaving(true);
                  setVideoProcessingMessage("🎬 Merender video dengan frame...");

                  // Create off-screen canvas for video rendering (match current frame canvas size)
                  const canvas = document.createElement("canvas");
                  canvas.width = exportCanvasSize.width;
                  canvas.height = exportCanvasSize.height;
                  // ✅ Set alpha: true to properly support transparent PNGs
                  const ctx = canvas.getContext("2d", {
                    alpha: true,
                    willReadFrequently: false,
                  });

                  if (typeof MediaRecorder === "undefined") {
                    throw new Error(
                      "Browser ini belum mendukung fitur perekaman canvas (MediaRecorder). Coba gunakan Chrome atau Edge versi terbaru."
                    );
                  }

                  const captureStreamFn =
                    canvas.captureStream ||
                    canvas.mozCaptureStream ||
                    canvas.webkitCaptureStream ||
                    null;
                  if (typeof captureStreamFn !== "function") {
                    throw new Error(
                      "Browser ini belum mendukung captureStream pada canvas. Coba gunakan Chrome atau Edge versi terbaru."
                    );
                  }

                  // Prepare video elements
                  const videoElements = [];
                  const photoSlots = designerElements.filter(
                    (el) =>
                      (el.type === "upload" || el.type === "photo") &&
                      typeof el.data?.photoIndex === "number"
                  );

                  console.log("📹 Preparing videos...", {
                    totalVideos: videos.length,
                    photoSlots: photoSlots.length,
                    designerElementsCount: designerElements.length,
                  });
                  
                  // CRITICAL FIX: Duplicate videos to match photoSlots if needed
                  // This handles duplicate mode where we have 3 videos but 6 slots
                  let videosToProcess = [...videos];
                  const targetSlotCount = photoSlots.length;
                  
                  if (videosToProcess.length > 0 && videosToProcess.length < targetSlotCount) {
                    console.log("🔁 [VIDEO DOWNLOAD] Duplicating videos to match slots...");
                    console.log("  - Original videos:", videosToProcess.length);
                    console.log("  - Target slots:", targetSlotCount);
                    
                    const duplicatedVideos = [];
                    const originalCount = videosToProcess.length;
                    const ratio = Math.ceil(targetSlotCount / originalCount);
                    
                    for (let i = 0; i < originalCount; i++) {
                      const video = videosToProcess[i];
                      for (let j = 0; j < ratio; j++) {
                        if (duplicatedVideos.length >= targetSlotCount) break;
                        if (video) {
                          duplicatedVideos.push({
                            ...video,
                            id: j === 0 ? (video.id || `video-${i}`) : `${video.id || 'video'}-dup-${i}-${j}`,
                          });
                        } else {
                          duplicatedVideos.push(null);
                        }
                      }
                    }
                    
                    videosToProcess = duplicatedVideos.slice(0, targetSlotCount);
                    console.log("✅ [VIDEO DOWNLOAD] Videos duplicated:", videosToProcess.length);
                  }
                  
                  console.log("📹 Videos to process:", videosToProcess.length);

                  // Log video metadata to verify source and duration
                  videosToProcess.forEach((v, idx) => {
                    if (v) {
                      console.log(`📹 Video ${idx} metadata:`, {
                        hasDataUrl: !!v.dataUrl,
                        hasBlob: !!v.blob,
                        duration: v.duration,
                        timer: v.timer,
                        mimeType: v.mimeType,
                        source: "camera recording from TakeMoment",
                      });
                    }
                  });

                  // Load videos into video elements (PARALLEL loading for performance)
                  // Process ALL duplicated videos
                  const loadVideoPromises = videosToProcess.map((videoData, i) => {
                      if (
                        !videoData ||
                        (!videoData.dataUrl && !videoData.blob)
                      ) {
                        return Promise.resolve(null);
                      }

                      return new Promise((resolve) => {
                        const videoEl = document.createElement("video");
                        videoEl.muted = true;
                        videoEl.loop = false;
                        videoEl.playsInline = true;
                        videoEl.crossOrigin = "anonymous";

                        if (videoData.dataUrl) {
                          videoEl.src = videoData.dataUrl;
                        } else if (videoData.blob) {
                          videoEl.src = URL.createObjectURL(videoData.blob);
                        }

                        let loadSucceeded = false;
                        let timeoutId;

                        const cleanup = () => {
                          if (timeoutId) {
                            clearTimeout(timeoutId);
                          }
                          videoEl.onloadedmetadata = null;
                          videoEl.onloadeddata = null;
                          videoEl.oncanplay = null;
                          videoEl.onerror = null;
                        };

                        const markReady = (eventLabel) => {
                          loadSucceeded = true;
                          console.log(`✅ Video ${i} ready (${eventLabel}):`, {
                            duration: videoEl.duration,
                            width: videoEl.videoWidth,
                            height: videoEl.videoHeight,
                            readyState: videoEl.readyState,
                          });
                          cleanup();

                          const isReady =
                            loadSucceeded ||
                            videoEl.readyState >= 2 ||
                            (Number.isFinite(videoEl.duration) &&
                              videoEl.duration > 0);

                          if (isReady) {
                            // FIX: Create a fallback slot if photoSlots[i] doesn't exist
                            const actualSlot = photoSlots[i] || {
                              id: `virtual-slot-${i}`,
                              data: { photoIndex: i }
                            };
                            resolve({
                              video: videoEl,
                              slot: actualSlot,
                              index: i,
                            });
                          } else {
                            if (videoEl.src.startsWith("blob:")) {
                              URL.revokeObjectURL(videoEl.src);
                            }
                            resolve(null);
                          }
                        };

                        videoEl.onloadedmetadata = () =>
                          markReady("loadedmetadata");
                        videoEl.onloadeddata = () => markReady("loadeddata");
                        videoEl.oncanplay = () => markReady("canplay");
                        videoEl.onerror = (error) => {
                          console.error(`❌ Video ${i} failed to load`, error);
                          cleanup();
                          if (videoEl.src.startsWith("blob:")) {
                            URL.revokeObjectURL(videoEl.src);
                          }
                          resolve(null);
                        };

                        timeoutId = setTimeout(() => {
                          console.warn(`⏱️ Video ${i} load timed out`, {
                            readyState: videoEl.readyState,
                            duration: videoEl.duration,
                          });
                          cleanup();

                          const isReady =
                            loadSucceeded ||
                            videoEl.readyState >= 2 ||
                            (Number.isFinite(videoEl.duration) &&
                              videoEl.duration > 0);

                          if (isReady) {
                            // FIX: Create a fallback slot if photoSlots[i] doesn't exist
                            const actualSlot = photoSlots[i] || {
                              id: `virtual-slot-${i}`,
                              data: { photoIndex: i }
                            };
                            resolve({
                              video: videoEl,
                              slot: actualSlot,
                              index: i,
                            });
                          } else {
                            if (videoEl.src.startsWith("blob:")) {
                              URL.revokeObjectURL(videoEl.src);
                            }
                            resolve(null);
                          }
                        }, 8000);
                      });
                    });

                  // Wait for all videos to load in parallel (reduces 32s to ~6s for 4 videos)
                  const loadedVideos = await Promise.all(loadVideoPromises);
                  videoElements.push(...loadedVideos.filter((v) => v !== null));

                  if (videoElements.length === 0) {
                    throw new Error("Tidak ada video yang berhasil dimuat");
                  }

                  console.log("✅ Videos loaded:", videoElements.length);

                  const videoBySlotId = new Map();
                  const videoBySlotIndex = new Map(); // Changed from videoByPhotoIndex to videoBySlotIndex

                  videoElements.forEach(({ video, slot }, idx) => {
                    console.log(`🔗 Mapping video ${idx}:`, {
                      slotId: slot?.id ? String(slot.id).slice(0, 8) : 'no-id',
                      photoIndex: slot?.data?.photoIndex,
                      videoIndex: idx,
                      videoReady: video.readyState >= 2,
                    });
                    
                    if (slot?.id) {
                      videoBySlotId.set(slot.id, { video, slot });
                    }
                    
                    // FIX: Map video by slot INDEX (not photoIndex)
                    // Videos array is already duplicated from TakeMoment (e.g., [v0, v0-dup, v1, v1-dup, v2, v2-dup])
                    // So video[0] goes to slot 0, video[1] goes to slot 1, etc.
                    // This ensures each slot gets its corresponding video from the duplicated array
                    videoBySlotIndex.set(idx, { video, slot });
                  });
                  
                  console.log(`📊 Video mapping summary:`, {
                    bySlotId: videoBySlotId.size,
                    bySlotIndex: videoBySlotIndex.size,
                    slotIndices: Array.from(videoBySlotIndex.keys()),
                  });

                  // Calculate max duration from actual video duration
                  const maxDuration = Math.max(
                    ...videoElements.map(({ video }) =>
                      video.duration && Number.isFinite(video.duration)
                        ? video.duration
                        : 0
                    ),
                    3 // Minimum 3 seconds
                  );

                  console.log("🎬 Video download will render:");
                  console.log(
                    "   - Duration: " + maxDuration + "s (from recorded video)"
                  );
                  console.log(
                    "   - Original timer: " +
                      (videos[0]?.timer || "unknown") +
                      "s"
                  );
                  console.log("   - Expected duration based on timer:");
                  console.log("     * Timer 3s → Video ~4s");
                  console.log("     * Timer 5s → Video ~6s");
                  console.log("     * Timer 10s → Video ~6s");
                  console.log(
                    "   - Video will play in photo slots with frame overlay"
                  );

                  // Setup MediaRecorder - Use higher FPS for smoother playback
                  const targetFps = 30; // Increased from 25 to 30 for smoother video
                  const stream = captureStreamFn.call(canvas, targetFps);

                  // Prioritize MP4 and H.264 to avoid slow WebM to MP4 conversion
                  const mimeTypes = [
                    "video/mp4", // Best: Native MP4 (Chrome/Edge on some systems)
                    "video/webm;codecs=h264", // Good: WebM container with H.264 codec (no conversion needed)
                    "video/webm;codecs=vp9", // OK: VP9 codec (needs conversion)
                    "video/webm;codecs=vp8", // OK: VP8 codec (needs conversion)
                    "video/webm", // Fallback: Default WebM
                  ];

                  let mimeType = mimeTypes.find((type) =>
                    MediaRecorder.isTypeSupported(type)
                  );
                  if (!mimeType) {
                    throw new Error("Browser tidak mendukung perekaman video");
                  }

                  // Adaptive bitrate: higher for better quality, especially for high-res cameras
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(
                    navigator.userAgent
                  );
                  // Increased bitrate for smoother video: Mobile 3Mbps, Desktop 5Mbps
                  const videoBitrate = isMobile ? 3000000 : 5000000;

                  console.log("🎬 MediaRecorder settings:", {
                    mimeType,
                    fps: targetFps,
                    bitrate: `${(videoBitrate / 1000000).toFixed(1)}Mbps`,
                    device: isMobile ? "mobile" : "desktop",
                  });

                  const recorder = new MediaRecorder(stream, {
                    mimeType,
                    videoBitsPerSecond: videoBitrate,
                  });

                  const chunks = [];
                  recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                      chunks.push(e.data);
                    }
                  };

                  // Preload background image
                  let backgroundImage = null;
                  if (
                    backgroundPhotoElement &&
                    backgroundPhotoElement.data?.image
                  ) {
                    console.log("🖼️ Preloading background image...");
                    try {
                      const bgUrl = getOriginalUrl(
                        backgroundPhotoElement.data.image
                      );
                      backgroundImage = await Promise.race([
                        loadImageWithFallback(bgUrl),
                        new Promise((_, reject) =>
                          setTimeout(
                            () => reject(new Error("Background load timeout")),
                            12000
                          )
                        ),
                      ]);
                      console.log("✅ Background image loaded");
                    } catch (err) {
                      console.warn(
                        "⚠️ Background image failed to load (continuing without it)",
                        err
                      );
                      backgroundImage = null;
                    }
                  }

                  // Preload frame overlay image
                  // ✅ CRITICAL: Skip frameImage for custom frames - they use designerElements instead
                  let frameImage = null;
                  if (frameConfig && frameConfig.frameImage && !frameConfig.isCustom) {
                    console.log("🖼️ Preloading frame overlay image...");
                    try {
                      const frameUrl = getOriginalUrl(frameConfig.frameImage);
                      frameImage = await Promise.race([
                        loadImageWithFallback(frameUrl),
                        new Promise((_, reject) =>
                          setTimeout(
                            () => reject(new Error("Frame overlay load timeout")),
                            12000
                          )
                        ),
                      ]);
                      console.log("✅ Frame overlay loaded");
                    } catch (err) {
                      console.warn(
                        "⚠️ Frame overlay failed to load (video will export without frame)",
                        err
                      );
                      frameImage = null;
                    }
                  }

                  // Preload overlay upload images (non-photo elements)
                  const overlayImagesByElement = new Map();
                  const overlayUploadElements = designerElements.filter(
                    (element) => {
                      if (!element || element.type !== "upload") return false;
                      if (typeof element?.data?.photoIndex === "number")
                        return false;
                      return Boolean(element?.data?.image);
                    }
                  );

                  if (overlayUploadElements.length) {
                    console.log(
                      "🖼️ Preloading overlay uploads:",
                      overlayUploadElements.length
                    );
                    await Promise.all(
                      overlayUploadElements.map((element, index) => {
                        return new Promise((resolve) => {
                          const img = new Image();
                          img.crossOrigin = "anonymous";

                          let settled = false;
                          const finish = () => {
                            if (!settled) {
                              settled = true;
                              resolve();
                            }
                          };

                          const timeoutId = setTimeout(() => {
                            console.warn(
                              `⏱️ Overlay image ${index} load timeout`
                            );
                            finish();
                          }, 3000);

                          img.onload = () => {
                            clearTimeout(timeoutId);
                            console.log(`✅ Overlay upload ${index} loaded`, {
                              width: img.naturalWidth,
                              height: img.naturalHeight,
                              id: element?.id,
                            });
                            overlayImagesByElement.set(element, img);
                            finish();
                          };

                          img.onerror = (err) => {
                            clearTimeout(timeoutId);
                            console.warn(
                              `⚠️ Overlay upload ${index} failed to load`,
                              err
                            );
                            finish();
                          };

                          img.src = element.data.image;
                        });
                      })
                    );
                  }

                  const resolveNumericRadius = (value) => {
                    if (Number.isFinite(value)) {
                      return value;
                    }
                    if (typeof value === "string") {
                      const parsed = parseFloat(value);
                      return Number.isFinite(parsed) ? parsed : 0;
                    }
                    return 0;
                  };

                  const clampRadius = (radius, width, height) => {
                    if (!Number.isFinite(radius) || radius <= 0) {
                      return 0;
                    }
                    const maxRadius = Math.min(width, height) / 2;
                    return Math.min(Math.max(radius, 0), maxRadius);
                  };

                  const buildRoundedRectPath = (
                    context,
                    width,
                    height,
                    radius
                  ) => {
                    context.beginPath();
                    context.moveTo(radius, 0);
                    context.lineTo(width - radius, 0);
                    context.quadraticCurveTo(width, 0, width, radius);
                    context.lineTo(width, height - radius);
                    context.quadraticCurveTo(
                      width,
                      height,
                      width - radius,
                      height
                    );
                    context.lineTo(radius, height);
                    context.quadraticCurveTo(0, height, 0, height - radius);
                    context.lineTo(0, radius);
                    context.quadraticCurveTo(0, 0, radius, 0);
                    context.closePath();
                  };

                  const withElementTransform = (
                    context,
                    element,
                    defaults,
                    draw
                  ) => {
                    const width = Number.isFinite(element?.width)
                      ? element.width
                      : Number.isFinite(defaults?.width)
                      ? defaults.width
                      : 0;
                    const height = Number.isFinite(element?.height)
                      ? element.height
                      : Number.isFinite(defaults?.height)
                      ? defaults.height
                      : 0;
                    const x = Number.isFinite(element?.x)
                      ? element.x
                      : Number.isFinite(defaults?.x)
                      ? defaults.x
                      : 0;
                    const y = Number.isFinite(element?.y)
                      ? element.y
                      : Number.isFinite(defaults?.y)
                      ? defaults.y
                      : 0;
                    const rotationDeg = Number.isFinite(element?.rotation)
                      ? element.rotation
                      : Number.isFinite(defaults?.rotation)
                      ? defaults.rotation
                      : 0;
                    const rotationRad = (rotationDeg * Math.PI) / 180;

                    context.save();
                    context.translate(x + width / 2, y + height / 2);
                    if (rotationRad) {
                      context.rotate(rotationRad);
                    }
                    context.translate(-width / 2, -height / 2);
                    draw({ width, height });
                    context.restore();
                  };

                  const applySlotClipPath = (ctx, slot, width, height) => {
                    if (!ctx || !slot) {
                      return;
                    }

                    const slotShape = slot?.data?.shape;
                    if (slotShape === "circle") {
                      const radius = Math.min(width, height) / 2;
                      ctx.beginPath();
                      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
                      ctx.closePath();
                      ctx.clip();
                      return;
                    }

                    const rawRadius = resolveNumericRadius(
                      slot?.data?.borderRadius
                    );
                    const radius = clampRadius(rawRadius, width, height);

                    if (radius <= 0) {
                      ctx.beginPath();
                      ctx.rect(0, 0, width, height);
                      ctx.closePath();
                      ctx.clip();
                      return;
                    }

                    buildRoundedRectPath(ctx, width, height, radius);
                    ctx.clip();
                  };

                  const drawMediaCoverInSlot = (ctx, media, width, height) => {
                    if (!media) {
                      return;
                    }

                    const intrinsicWidth =
                      Number.isFinite(media.videoWidth) && media.videoWidth > 0
                        ? media.videoWidth
                        : Number.isFinite(media.naturalWidth) &&
                          media.naturalWidth > 0
                        ? media.naturalWidth
                        : Number.isFinite(media.width) && media.width > 0
                        ? media.width
                        : width;

                    const intrinsicHeight =
                      Number.isFinite(media.videoHeight) &&
                      media.videoHeight > 0
                        ? media.videoHeight
                        : Number.isFinite(media.naturalHeight) &&
                          media.naturalHeight > 0
                        ? media.naturalHeight
                        : Number.isFinite(media.height) && media.height > 0
                        ? media.height
                        : height;

                    if (!intrinsicWidth || !intrinsicHeight) {
                      ctx.drawImage(media, 0, 0, width, height);
                      return;
                    }

                    // Use 'cover' behavior (crop to fill) - transparency is preserved in PNG format
                    const mediaRatio = intrinsicWidth / intrinsicHeight;
                    const slotRatio = width / height;

                    let sourceX = 0;
                    let sourceY = 0;
                    let sourceWidth = intrinsicWidth;
                    let sourceHeight = intrinsicHeight;

                    if (mediaRatio > slotRatio) {
                      sourceWidth = intrinsicHeight * slotRatio;
                      sourceX = (intrinsicWidth - sourceWidth) / 2;
                    } else {
                      sourceHeight = intrinsicWidth / slotRatio;
                      sourceY = (intrinsicHeight - sourceHeight) / 2;
                    }

                    ctx.drawImage(
                      media,
                      sourceX,
                      sourceY,
                      sourceWidth,
                      sourceHeight,
                      0,
                      0,
                      width,
                      height
                    );
                  };

                  const layeredElements = designerElements
                    .filter(Boolean)
                    .slice()
                    .sort((a, b) => {
                      const zA = Number.isFinite(a?.zIndex) ? a.zIndex : 200;
                      const zB = Number.isFinite(b?.zIndex) ? b.zIndex : 200;
                      if (zA === zB) {
                        const indexA = designerElements.indexOf(a);
                        const indexB = designerElements.indexOf(b);
                        return indexA - indexB;
                      }
                      return zA - zB;
                    });

                  // ✅ Get filter values for pixel manipulation (Safari compatible)
                  const videoFilterValues = {
                    brightness: filters.brightness,
                    contrast: filters.contrast,
                    saturate: filters.saturate,
                    grayscale: filters.grayscale,
                    sepia: filters.sepia,
                    blur: filters.blur,
                    hueRotate: filters.hueRotate
                  };
                  
                  // Check if any filter is active
                  const isVideoFilterActive = 
                    filters.brightness !== 100 ||
                    filters.contrast !== 100 ||
                    filters.saturate !== 100 ||
                    filters.grayscale !== 0 ||
                    filters.sepia !== 0 ||
                    filters.blur !== 0 ||
                    filters.hueRotate !== 0;
                  
                  console.log("🎬 Video filter active:", isVideoFilterActive, videoFilterValues);

                  // ✅ Helper function to apply filter via pixel manipulation (for video frames)
                  const applyVideoFilter = (sourceCanvas, filterVals) => {
                    const tempCtx = sourceCanvas.getContext("2d");
                    const imageData = tempCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
                    const data = imageData.data;
                    
                    const { brightness, contrast, saturate, grayscale, sepia, hueRotate } = filterVals;
                    
                    for (let i = 0; i < data.length; i += 4) {
                      let r = data[i];
                      let g = data[i + 1];
                      let b = data[i + 2];
                      
                      // Brightness
                      const brightnessFactor = brightness / 100;
                      r *= brightnessFactor;
                      g *= brightnessFactor;
                      b *= brightnessFactor;
                      
                      // Contrast
                      const contrastFactor = contrast / 100;
                      const intercept = 128 * (1 - contrastFactor);
                      r = r * contrastFactor + intercept;
                      g = g * contrastFactor + intercept;
                      b = b * contrastFactor + intercept;
                      
                      // Grayscale
                      if (grayscale > 0) {
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        const grayFactor = grayscale / 100;
                        r = r * (1 - grayFactor) + gray * grayFactor;
                        g = g * (1 - grayFactor) + gray * grayFactor;
                        b = b * (1 - grayFactor) + gray * grayFactor;
                      }
                      
                      // Sepia
                      if (sepia > 0) {
                        const sepiaFactor = sepia / 100;
                        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
                        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
                        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
                        r = r * (1 - sepiaFactor) + sr * sepiaFactor;
                        g = g * (1 - sepiaFactor) + sg * sepiaFactor;
                        b = b * (1 - sepiaFactor) + sb * sepiaFactor;
                      }
                      
                      // Saturate
                      if (saturate !== 100) {
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        const satFactor = saturate / 100;
                        r = gray + satFactor * (r - gray);
                        g = gray + satFactor * (g - gray);
                        b = gray + satFactor * (b - gray);
                      }
                      
                      // Hue Rotate
                      if (hueRotate !== 0) {
                        const angle = hueRotate * Math.PI / 180;
                        const cos = Math.cos(angle);
                        const sin = Math.sin(angle);
                        const newR = r * (0.213 + cos * 0.787 - sin * 0.213) + 
                                     g * (0.715 - cos * 0.715 - sin * 0.715) + 
                                     b * (0.072 - cos * 0.072 + sin * 0.928);
                        const newG = r * (0.213 - cos * 0.213 + sin * 0.143) + 
                                     g * (0.715 + cos * 0.285 + sin * 0.140) + 
                                     b * (0.072 - cos * 0.072 - sin * 0.283);
                        const newB = r * (0.213 - cos * 0.213 - sin * 0.787) + 
                                     g * (0.715 - cos * 0.715 + sin * 0.715) + 
                                     b * (0.072 + cos * 0.928 + sin * 0.072);
                        r = newR;
                        g = newG;
                        b = newB;
                      }
                      
                      data[i] = Math.max(0, Math.min(255, Math.round(r)));
                      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
                      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
                    }
                    
                    tempCtx.putImageData(imageData, 0, 0);
                  };

                  const activeFilter = [
                    `brightness(${filters.brightness}%)`,
                    `contrast(${filters.contrast}%)`,
                    `saturate(${filters.saturate}%)`,
                    `grayscale(${filters.grayscale}%)`,
                    `sepia(${filters.sepia}%)`,
                    `blur(${filters.blur}px)`,
                    `hue-rotate(${filters.hueRotate}deg)`,
                  ].join(" ");

                  const baseCanvasColor =
                    frameConfig?.designer?.canvasBackground || "#FFFFFF";

                  // Function to draw composite frame
                  const drawFrame = () => {
                    // Clear canvas with configured background color
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = "source-over"; // ✅ Ensure proper alpha blending
                    ctx.filter = "none";
                    ctx.fillStyle = baseCanvasColor;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.restore();

                    // Draw background photo if exists
                    if (
                      backgroundImage &&
                      backgroundImage.complete &&
                      backgroundImage.naturalWidth > 0
                    ) {
                      try {
                        // ✅ Apply filter to background using pixel manipulation
                        if (isVideoFilterActive) {
                          // Create temp canvas for background
                          const bgTempCanvas = document.createElement("canvas");
                          bgTempCanvas.width = canvas.width;
                          bgTempCanvas.height = canvas.height;
                          const bgTempCtx = bgTempCanvas.getContext("2d");
                          
                          // Draw background to temp canvas
                          drawMediaCoverInSlot(bgTempCtx, backgroundImage, canvas.width, canvas.height);
                          
                          // Apply filter
                          applyVideoFilter(bgTempCanvas, videoFilterValues);
                          
                          // Draw filtered background to main canvas
                          if (backgroundPhotoElement) {
                            withElementTransform(
                              ctx,
                              backgroundPhotoElement,
                              {
                                width: canvas.width,
                                height: canvas.height,
                                x: 0,
                                y: 0,
                              },
                              ({ width, height }) => {
                                applySlotClipPath(ctx, backgroundPhotoElement, width, height);
                                ctx.drawImage(bgTempCanvas, 0, 0, width, height);
                              }
                            );
                          } else {
                            ctx.drawImage(bgTempCanvas, 0, 0);
                          }
                        } else {
                          // No filter - draw directly
                          if (backgroundPhotoElement) {
                            withElementTransform(
                              ctx,
                              backgroundPhotoElement,
                              {
                                width: canvas.width,
                                height: canvas.height,
                                x: 0,
                                y: 0,
                              },
                              ({ width, height }) => {
                                applySlotClipPath(ctx, backgroundPhotoElement, width, height);
                                drawMediaCoverInSlot(ctx, backgroundImage, width, height);
                              }
                            );
                          } else {
                            ctx.save();
                            drawMediaCoverInSlot(ctx, backgroundImage, canvas.width, canvas.height);
                            ctx.restore();
                          }
                        }
                      } catch (err) {
                        console.warn("Error drawing background:", err);
                      }
                    }

                    // Draw layered designer elements (videos, overlays, shapes, text)
                    // Track photo slot index for video mapping
                    let photoSlotIndex = 0;
                    
                    layeredElements.forEach((element) => {
                      if (!element) return;

                      const isPhotoSlot =
                        (element.type === "upload" || element.type === "photo") &&
                        typeof element?.data?.photoIndex === "number";

                      if (isPhotoSlot) {
                        // FIX: Use slot INDEX (sequential 0,1,2,3,4,5) instead of photoIndex (0,0,1,1,2,2)
                        // This correctly maps duplicated videos to their slots
                        const currentSlotIndex = photoSlotIndex;
                        photoSlotIndex++; // Increment for next photo slot
                        
                        const slotVideoEntry =
                          (element.id && videoBySlotId.get(element.id)) ||
                          videoBySlotIndex.get(currentSlotIndex);

                        if (!slotVideoEntry) {
                          // Log missing video only once per element
                          if (!element._loggedMissing) {
                            console.warn(`⚠️ No video for slot:`, {
                              elementId: element.id ? String(element.id).slice(0, 8) : 'no-id',
                              slotIndex: currentSlotIndex,
                              photoIndex: element.data.photoIndex,
                              availableIndices: Array.from(videoBySlotIndex.keys()),
                            });
                            element._loggedMissing = true;
                          }
                          return;
                        }

                        const { video } = slotVideoEntry;

                        if (
                          !(
                            video.readyState >= 2 &&
                            !video.paused &&
                            !video.ended
                          )
                        ) {
                          return;
                        }

                        try {
                          withElementTransform(
                            ctx,
                            element,
                            null,
                            ({ width, height }) => {
                              // ✅ Draw video to temp canvas first, then apply filter
                              if (isVideoFilterActive) {
                                // Create temp canvas for this video frame
                                const videoTempCanvas = document.createElement("canvas");
                                videoTempCanvas.width = Math.ceil(width);
                                videoTempCanvas.height = Math.ceil(height);
                                const videoTempCtx = videoTempCanvas.getContext("2d");
                                
                                // Draw video frame (mirrored) to temp canvas
                                videoTempCtx.translate(width, 0);
                                videoTempCtx.scale(-1, 1);
                                drawMediaCoverInSlot(videoTempCtx, video, width, height);
                                
                                // Apply filter via pixel manipulation
                                applyVideoFilter(videoTempCanvas, videoFilterValues);
                                
                                // Draw filtered result to main canvas with clipping
                                applySlotClipPath(ctx, element, width, height);
                                ctx.drawImage(videoTempCanvas, 0, 0);
                              } else {
                                // No filter - draw directly
                                applySlotClipPath(ctx, element, width, height);
                                ctx.translate(width, 0);
                                ctx.scale(-1, 1);
                                drawMediaCoverInSlot(ctx, video, width, height);
                              }
                            }
                          );
                        } catch (err) {
                          console.warn("Error drawing video frame:", err);
                        }
                        return;
                      }

                      if (element.type === "shape") {
                        withElementTransform(
                          ctx,
                          element,
                          null,
                          ({ width, height }) => {
                            const opacity = Number.isFinite(
                              element?.data?.opacity
                            )
                              ? element.data.opacity
                              : 1;
                            ctx.filter = "none";
                            ctx.globalAlpha = opacity;
                            ctx.fillStyle = element.data?.fill || "#000";

                            if (element.data?.shape === "circle") {
                              ctx.beginPath();
                              ctx.arc(
                                width / 2,
                                height / 2,
                                Math.min(width, height) / 2,
                                0,
                                Math.PI * 2
                              );
                              ctx.fill();
                            } else {
                              const rawRadius = resolveNumericRadius(
                                element?.data?.borderRadius
                              );
                              const radius = clampRadius(
                                rawRadius,
                                width,
                                height
                              );
                              buildRoundedRectPath(ctx, width, height, radius);
                              ctx.fill();
                            }
                          }
                        );
                        return;
                      }

                      if (element.type === "text" && element.data?.text) {
                        withElementTransform(
                          ctx,
                          element,
                          null,
                          ({ width, height }) => {
                            ctx.filter = "none";
                            ctx.globalAlpha = Number.isFinite(
                              element?.data?.opacity
                            )
                              ? element.data.opacity
                              : 1;
                            const fontSize = element.data?.fontSize || 24;
                            const fontWeight = element.data?.fontWeight || 500;
                            const fontFamily =
                              element.data?.fontFamily || "Inter";
                            ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
                            const align = element.data?.align || "left";
                            ctx.fillStyle = element.data?.color || "#111827";

                            // Text wrapping function (same as photo download)
                            const wrapText = (context, text, maxWidth) => {
                              const words = text.split(" ");
                              const lines = [];
                              let currentLine = "";

                              for (let i = 0; i < words.length; i++) {
                                const testLine =
                                  currentLine +
                                  (currentLine ? " " : "") +
                                  words[i];
                                const metrics = context.measureText(testLine);
                                const testWidth = metrics.width;

                                if (testWidth > maxWidth && currentLine) {
                                  lines.push(currentLine);
                                  currentLine = words[i];
                                } else {
                                  currentLine = testLine;
                                }
                              }

                              if (currentLine) {
                                lines.push(currentLine);
                              }

                              return lines;
                            };

                            // Handle manual line breaks first
                            const manualLines = (element.data.text || "").split(
                              "\n"
                            );
                            const allLines = [];

                            // Wrap each manual line to fit within width
                            manualLines.forEach((line) => {
                              if (line.trim()) {
                                const wrappedLines = wrapText(
                                  ctx,
                                  line,
                                  width - 20
                                ); // 20px padding
                                allLines.push(...wrappedLines);
                              } else {
                                allLines.push(""); // Empty line
                              }
                            });

                            const lineHeight = fontSize * 1.2;
                            const totalTextHeight =
                              allLines.length * lineHeight;

                            // Calculate X position based on alignment
                            let textX = 10; // Left padding
                            if (align === "center") {
                              textX = width / 2;
                              ctx.textAlign = "center";
                            } else if (align === "right") {
                              textX = width - 10; // Right padding
                              ctx.textAlign = "right";
                            } else {
                              ctx.textAlign = "left";
                            }

                            // Calculate starting Y based on vertical alignment
                            let startY = fontSize;
                            const verticalAlign = element.data?.verticalAlign;
                            if (verticalAlign === "middle") {
                              startY =
                                (height - totalTextHeight) / 2 + fontSize;
                            } else if (verticalAlign === "bottom") {
                              startY = height - totalTextHeight + fontSize;
                            }

                            ctx.textBaseline = "alphabetic";
                            allLines.forEach((line, index) => {
                              const lineY = startY + index * lineHeight;
                              ctx.fillText(line, textX, lineY, width - 20); // maxWidth with padding
                            });
                          }
                        );
                        return;
                      }

                      // Support both "upload" and "photo" types
                      if (element.type === "upload" || element.type === "photo") {
                        const overlayImage =
                          overlayImagesByElement.get(element);
                        if (
                          !overlayImage ||
                          !overlayImage.complete ||
                          overlayImage.naturalWidth <= 0
                        ) {
                          return;
                        }

                        withElementTransform(
                          ctx,
                          element,
                          null,
                          ({ width, height }) => {
                            // ✅ Reset context properties to ensure transparent PNGs render correctly
                            ctx.globalAlpha = 1;
                            ctx.globalCompositeOperation = "source-over";
                            
                            // ✅ Apply filter using pixel manipulation (Safari compatible)
                            if (isVideoFilterActive) {
                              const overlayTempCanvas = document.createElement("canvas");
                              overlayTempCanvas.width = Math.ceil(width);
                              overlayTempCanvas.height = Math.ceil(height);
                              const overlayTempCtx = overlayTempCanvas.getContext("2d");
                              
                              // Draw overlay to temp canvas
                              drawMediaCoverInSlot(overlayTempCtx, overlayImage, width, height);
                              
                              // Apply filter
                              applyVideoFilter(overlayTempCanvas, videoFilterValues);
                              
                              // Draw to main canvas with clipping
                              applySlotClipPath(ctx, element, width, height);
                              ctx.drawImage(overlayTempCanvas, 0, 0);
                            } else {
                              // No filter - draw directly
                              applySlotClipPath(ctx, element, width, height);
                              drawMediaCoverInSlot(ctx, overlayImage, width, height);
                            }
                          }
                        );
                      }
                    });

                    // Draw frame overlay with aspect ratio preservation (same as photo download)
                    // ✅ CRITICAL: Skip frameImage for custom frames - they use designerElements instead
                    if (
                      frameImage &&
                      frameImage.complete &&
                      frameImage.naturalWidth > 0 &&
                      !frameConfig?.isCustom
                    ) {
                      try {
                        ctx.save();
                        ctx.filter = "none";
                        ctx.globalAlpha = 1;

                        // Calculate actual frame dimensions maintaining aspect ratio
                        const canvasWidth = exportCanvasSize.width;
                        const canvasHeight = exportCanvasSize.height;
                        const imgRatio = frameImage.width / frameImage.height;
                        const canvasRatio = canvasWidth / canvasHeight;

                        let drawWidth, drawHeight, drawX, drawY;

                        if (imgRatio > canvasRatio) {
                          // Image wider than canvas - fit to width
                          drawWidth = canvasWidth;
                          drawHeight = canvasWidth / imgRatio;
                          drawX = 0;
                          drawY = (canvasHeight - drawHeight) / 2;
                        } else {
                          // Image taller than canvas - fit to height
                          drawHeight = canvasHeight;
                          drawWidth = canvasHeight * imgRatio;
                          drawX = (canvasWidth - drawWidth) / 2;
                          drawY = 0;
                        }

                        ctx.drawImage(
                          frameImage,
                          drawX,
                          drawY,
                          drawWidth,
                          drawHeight
                        );
                        ctx.restore();
                      } catch (err) {
                        console.warn("Error drawing frame overlay:", err);
                      }
                    }
                  };

                  // Start recording
                  const recordingPromise = new Promise((resolve, reject) => {
                    recorder.onstop = () => {
                      console.log("🎬 Recording stopped, creating blob...");
                      if (chunks.length === 0) {
                        console.error("❌ No video chunks recorded!");
                        reject(new Error("No video data recorded"));
                        return;
                      }
                      const blob = new Blob(chunks, { type: mimeType });
                      console.log("✅ Video blob created:", {
                        size: (blob.size / 1024).toFixed(2) + "KB",
                        type: blob.type,
                        chunks: chunks.length,
                      });
                      resolve(blob);
                    };
                    recorder.onerror = (e) => {
                      console.error("❌ MediaRecorder error:", e);
                      reject(e);
                    };
                  });

                  console.log("🎬 Starting MediaRecorder...");
                  recorder.start(100); // 100ms timeslice for frequent chunks
                  console.log(
                    "✅ MediaRecorder started, state:",
                    recorder.state
                  );

                  // Play all videos and start animation loop
                  console.log("▶️ Starting video playback...");
                  await Promise.all(
                    videoElements.map(({ video, index }) => {
                      video.currentTime = 0;
                      return video
                        .play()
                        .then(() => {
                          console.log(`✅ Video ${index} playing`);
                        })
                        .catch((err) => {
                          console.warn(`⚠️ Video ${index} play failed:`, err);
                        });
                    })
                  );

                  // Animation loop
                  console.log("🎞️ Starting animation loop...");
                  const startTime = performance.now();
                  let frameCount = 0;

                  const animate = () => {
                    drawFrame();
                    frameCount++;

                    const elapsed = (performance.now() - startTime) / 1000;
                    const allEnded = videoElements.every(
                      ({ video }) =>
                        video.ended || video.currentTime >= maxDuration
                    );

                    // Log progress every second (30 frames at 30fps)
                    if (frameCount % 30 === 0) {
                      console.log(
                        `🎬 Recording progress: ${elapsed.toFixed(
                          1
                        )}s / ${maxDuration}s (frame ${frameCount})`
                      );
                    }

                    if (elapsed < maxDuration + 0.5 && !allEnded) {
                      requestAnimationFrame(animate);
                    } else {
                      // Stop recording
                      console.log("🛑 Stopping recording...");
                      console.log(
                        `   Total frames: ${frameCount}, Duration: ${elapsed.toFixed(
                          2
                        )}s`
                      );

                      if (recorder.state !== "inactive") {
                        recorder.stop();
                      }

                      videoElements.forEach(({ video, index }) => {
                        video.pause();
                        console.log(
                          `⏸️ Video ${index} paused at ${video.currentTime.toFixed(
                            2
                          )}s`
                        );
                        if (video.src.startsWith("blob:")) {
                          URL.revokeObjectURL(video.src);
                        }
                      });
                    }
                  };

                  animate();

                  // Wait for recording to finish
                  console.log("⏳ Waiting for recording to complete...");
                  setVideoProcessingMessage("⏳ Menyelesaikan rekaman video...");
                  const videoBlob = await recordingPromise;

                  // Validate blob
                  if (!videoBlob || videoBlob.size < 1000) {
                    throw new Error(
                      `Video blob too small or invalid (${
                        videoBlob?.size || 0
                      } bytes)`
                    );
                  }

                  console.log("💾 Preparing final download blob...", {
                    sizeKB: (videoBlob.size / 1024).toFixed(2),
                    type: videoBlob.type,
                  });

                  let downloadBlob = videoBlob;
                  let downloadExtension = "mp4"; // Default to MP4
                  let downloadMime = videoBlob.type || "video/mp4";

                  // Check if conversion is needed
                  // Skip conversion for: MP4 format OR H.264 codec (even in WebM container)
                  const needsConversion = !(
                    videoBlob.type === "video/mp4" ||
                    videoBlob.type.includes("codecs=h264") ||
                    videoBlob.type.includes("codecs=avc1")
                  );

                  if (needsConversion) {
                    console.log("⚠️ Video needs conversion:", videoBlob.type);
                    setVideoProcessingMessage("🔄 Mengonversi video ke format MP4...");

                    try {
                      const mp4Blob = await convertBlobToMp4(videoBlob, {
                        frameRate: 30, // Match recording FPS
                        durationSeconds: maxDuration,
                        outputPrefix: "fremio-video",
                      });

                      if (mp4Blob && mp4Blob.size > 0) {
                        downloadBlob = mp4Blob;
                        downloadExtension = "mp4";
                        downloadMime = "video/mp4";
                        console.log("✅ Video converted to MP4:", {
                          originalType: videoBlob.type,
                          originalSizeKB: (videoBlob.size / 1024).toFixed(2),
                          convertedSizeKB: (mp4Blob.size / 1024).toFixed(2),
                        });
                      } else {
                        console.warn(
                          "⚠️ MP4 conversion returned empty result, falling back to original blob"
                        );
                        // Use WebM as fallback
                        downloadExtension = "webm";
                      }
                    } catch (conversionError) {
                      console.error(
                        "❌ MP4 conversion failed, using original recording:",
                        conversionError
                      );
                      // Use WebM as fallback
                      downloadExtension = "webm";
                    }
                  } else {
                    console.log(
                      "✅ Video already in compatible format, skipping conversion!",
                      {
                        type: videoBlob.type,
                        sizeKB: (videoBlob.size / 1024).toFixed(2),
                      }
                    );

                    // Keep appropriate extension
                    if (videoBlob.type === "video/mp4") {
                      downloadExtension = "mp4";
                    } else if (videoBlob.type.includes("webm")) {
                      // H.264 in WebM container - save as MP4 for better compatibility
                      downloadExtension = "mp4";
                      downloadMime = "video/mp4";
                    }
                  }

                  // Download video using mobile-friendly helper
                  console.log("💾 Downloading video...");
                  setVideoProcessingMessage("💾 Menyimpan video...");
                  const timestamp = Date.now();
                  const filename = `fremio-video-${timestamp}.${downloadExtension}`;
                  
                  // Use download helper for mobile-friendly download
                  const frameId = frameConfig?.id || "unknown";
                  const frameName = frameConfig?.name || frameConfig?.id || "Unknown Frame";
                  
                  const result = await downloadVideoToGallery(downloadBlob, {
                    filename,
                    mimeType: downloadMime,
                    frameId,
                    frameName,
                    useShareApi: true,
                    showWebToasts: false,
                  });
                  
                  // Clear loading screen
                  setVideoProcessingMessage("");
                  
                  if (result.success) {
                    console.log("✅ Video download complete via", result.method);
                    
                    // Only show success toast if not cancelled
                    if (!result.cancelled) {
                      setSaveMessage(
                        downloadExtension === "mp4"
                          ? "✅ Video MP4 berhasil didownload!"
                          : "✅ Video berhasil didownload (format cadangan)"
                      );
                      setTimeout(() => setSaveMessage(""), 3000);
                      
                      // Show modal for mobile devices
                      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                      const nativeShareShown = String(result.method || '').includes('share');
                      
                      // Backup popup only when native share/save sheet cannot be shown
                      if (isMobile && !nativeShareShown) {
                        setDownloadModalType('video');
                        setShowDownloadModal(true);
                      } else {
                        showToast({
                          type: "success",
                          title: "Video Berhasil",
                          message: "Video berhasil dirender dan disimpan.",
                        });
                      }
                    }
                  } else {
                    throw new Error(result.error || "Download failed");
                  }
                } catch (error) {
                  console.error("❌ Error rendering video:", error);
                  setVideoProcessingMessage(""); // Clear loading screen on error
                  showToast({
                    type: "error",
                    title: "Render Video Gagal",
                    message:
                      error.message || "Terjadi kesalahan saat merender video.",
                    action: {
                      label: "Coba Lagi",
                      onClick: () => window.location.reload(),
                    },
                  });
                  setSaveMessage("");
                } finally {
                  setIsSaving(false);
                  setVideoProcessingMessage(""); // Ensure loading screen is cleared
                }
              }}
              disabled={(() => {
                const isDisabled = !hasValidVideo || isSaving;
                console.log("🔘 Download Video button state:", {
                  videosLength: videos?.length || 0,
                  hasValidVideo,
                  isSaving,
                  isDisabled,
                });
                return isDisabled;
              })()}
              style={{
                padding: "0.6rem 1.2rem",
                background: !hasValidVideo || isSaving ? "#D1D5DB" : "#C4A484",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.9rem",
                cursor: !hasValidVideo || isSaving ? "not-allowed" : "pointer",
                fontWeight: "600",
                opacity: !hasValidVideo || isSaving ? 0.7 : 1,
                boxShadow: !hasValidVideo || isSaving ? "none" : "0 2px 8px rgba(196, 164, 132, 0.3)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (hasValidVideo && !isSaving) {
                  e.target.style.background = "#B09474";
                  e.target.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                if (hasValidVideo && !isSaving) {
                  e.target.style.background = "#C4A484";
                  e.target.style.transform = "translateY(0)";
                }
              }}
            >
              {isSaving ? "⏳ Processing..." : "Download Video"}
            </button>
          </div>

          {/* Navigation Buttons */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              width: "100%",
              maxWidth: "400px",
              marginTop: "1rem",
              justifyContent: "center",
            }}
          >
            <button
              onClick={handleBackNavigation}
              style={{
                padding: "0.75rem 1.5rem",
                background: "transparent",
                color: "#E8A889",
                border: "2px solid #E8A889",
                borderRadius: "12px",
                fontSize: "1rem",
                cursor: "pointer",
                fontWeight: "600",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#E8A889";
                e.target.style.color = "white";
                e.target.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.color = "#E8A889";
                e.target.style.transform = "translateY(0)";
              }}
            >
              {backToGroupFramesPath ? "← Back to Frames" : "🏠 Back to Home"}
            </button>
          </div>
        </div>
      )}
      
      {/* Download Instruction Modal for Mobile */}
      {showDownloadModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setShowDownloadModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  margin: '0 auto 12px',
                  background: 'linear-gradient(135deg, #E8A889 0%, #C4A484 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                }}
              >
                {downloadModalType === 'photo' ? '📸' : '🎥'}
              </div>
              <h3
                style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#1F2937',
                  margin: '0 0 8px 0',
                }}
              >
                Download {downloadModalType === 'photo' ? 'Foto' : 'Video'} Berhasil!
              </h3>
              <p
                style={{
                  fontSize: '14px',
                  color: '#6B7280',
                  margin: 0,
                }}
              >
                Ikuti langkah berikut untuk menyimpan ke Galeri
              </p>
            </div>

            {/* Instructions */}
            <div
              style={{
                background: '#F9FAFB',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      background: '#E8A889',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    1
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      color: '#374151',
                      lineHeight: '1.5',
                    }}
                  >
                    <strong>Cek Notifikasi Download</strong>
                    <br />
                    Geser dari atas layar untuk melihat progress download
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      background: '#E8A889',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    2
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      color: '#374151',
                      lineHeight: '1.5',
                    }}
                  >
                    <strong>Buka File Manager/Galeri</strong>
                    <br />
                    Cari di folder <code style={{ background: '#E5E7EB', padding: '2px 6px', borderRadius: '4px' }}>Downloads</code> atau <code style={{ background: '#E5E7EB', padding: '2px 6px', borderRadius: '4px' }}>DCIM</code>
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      background: '#E8A889',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    3
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      color: '#374151',
                      lineHeight: '1.5',
                    }}
                  >
                    <strong>Simpan ke Galeri</strong>
                    <br />
                    Tap file → Pilih "Simpan ke Galeri" atau "Move to Photos"
                  </p>
                </div>
              </div>

              {/* Tips */}
              <div
                style={{
                  background: 'white',
                  borderLeft: '3px solid #E8A889',
                  padding: '12px',
                  borderRadius: '6px',
                  marginTop: '12px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#6B7280',
                    lineHeight: '1.5',
                  }}
                >
                  💡 <strong>Tips:</strong> Jika tidak muncul di Galeri, coba restart aplikasi Galeri atau File Manager kamu.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowDownloadModal(false)}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #E8A889 0%, #C4A484 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(232, 168, 137, 0.3)',
                }}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
