import { create } from 'zustand';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_UPLOAD_WIDTH,
  DEFAULT_UPLOAD_HEIGHT,
} from '@/components/creator/canvasConstants';
import {
  BACKGROUND_PHOTO_Z,
  NORMAL_ELEMENTS_MIN_Z,
  CAPTURED_OVERLAY_Z_OFFSET,
} from '@/constants/layers';

const DEFAULT_BACKGROUND = '#ffffff';

const REFERENCE_CANVAS_WIDTH = 480;
const REFERENCE_CANVAS_HEIGHT = 853;
const WIDTH_SCALE = CANVAS_WIDTH / REFERENCE_CANVAS_WIDTH;
const HEIGHT_SCALE = CANVAS_HEIGHT / REFERENCE_CANVAS_HEIGHT;
const AVERAGE_SCALE = (WIDTH_SCALE + HEIGHT_SCALE) / 2;

const scaleWidthValue = (value) => Math.round(value * WIDTH_SCALE);
const scaleHeightValue = (value) => Math.round(value * HEIGHT_SCALE);
const scaleUniformValue = (value) => Math.round(value * AVERAGE_SCALE);

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const baseElement = (type, overrides = {}) => ({
  id: generateId(),
  type,
  x: scaleWidthValue(80),
  y: scaleHeightValue(80),
  width: scaleWidthValue(160),
  height: scaleHeightValue(160),
  rotation: 0,
  zIndex: 1,
  isLocked: false,
  data: {},
  ...overrides
});

const defaultPropsByType = (type) => {
  switch (type) {
    case 'photo':
      return {
        width: scaleWidthValue(220),
        height: scaleHeightValue(280),
        data: {
          fill: '#d1e3f0',
          borderRadius: scaleUniformValue(24),
          stroke: null,
          strokeWidth: 0,
          label: 'Foto'
        }
      };
    case 'text':
      return {
        width: scaleWidthValue(320),
        height: scaleHeightValue(90),
        data: {
          text: 'Judul Baru',
          fontSize: scaleUniformValue(28),
          fontFamily: 'Inter',
          color: '#1f2933',
          align: 'center',
          fontWeight: 600
        }
      };
    case 'shape':
      return {
        width: scaleWidthValue(200),
        height: scaleHeightValue(200),
        data: {
          fill: '#f4d3c2',
          borderRadius: scaleUniformValue(32),
          stroke: null,
          strokeWidth: 0,
          shapeType: 'rectangle' // rectangle, circle, triangle, star, heart, hexagon, diamond, line
        }
      };
    case 'upload':
      return {
        width: DEFAULT_UPLOAD_WIDTH,
        height: DEFAULT_UPLOAD_HEIGHT,
        data: {
          image: null,
          objectFit: 'contain',
          label: 'Unggahan',
          fill: '#d1e3f0',
          borderRadius: 0,
          stroke: null,
          strokeWidth: 0
        }
      };
    case 'background-photo':
      return {
        x: 0,
        y: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        zIndex: 0, // Always z-index 0 for background, cannot be changed
        data: {
          image: null,
          objectFit: 'contain',
          aspectRatio: CANVAS_WIDTH / CANVAS_HEIGHT,
          label: 'Background'
        }
      };
    default:
      return {};
  }
};

const resolveDefaultZIndex = (type, defaults, lastZIndex) => {
  if (type === 'background-photo') {
    // Background photo is ALWAYS z-index 0, cannot be changed
    return 0;
  }

  // Photo slots should default to PHOTO_SLOT_MIN_Z (above background, below normal elements)
  if (type === 'photo') {
    if (typeof defaults?.zIndex === 'number') {
      return defaults.zIndex;
    }
    // Use imported PHOTO_SLOT_MIN_Z constant
    const PHOTO_SLOT_MIN_Z = 0;
    return PHOTO_SLOT_MIN_Z;
  }

  if (typeof defaults?.zIndex === 'number') {
    return defaults.zIndex;
  }

  const safeLast = Number.isFinite(lastZIndex) ? lastZIndex : NORMAL_ELEMENTS_MIN_Z;
  return Math.max(safeLast + 1, NORMAL_ELEMENTS_MIN_Z);
};

const computeContainedSize = (aspectRatio, maxWidth = CANVAS_WIDTH, maxHeight = CANVAS_HEIGHT) => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
};

const centerWithinCanvas = (width, height) => ({
  x: Math.round((CANVAS_WIDTH - width) / 2),
  y: Math.round((CANVAS_HEIGHT - height) / 2),
});

const isCapturedPhotoOverlay = (element) => Boolean(element?.data?.__capturedOverlay);

const PHOTO_DUPLICATE_TOLERANCE = 0.5;

const areNumbersClose = (left, right, tolerance = PHOTO_DUPLICATE_TOLERANCE) => {
  const leftValue = Number(left);
  const rightValue = Number(right);

  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return false;
  }

  return Math.abs(leftValue - rightValue) <= tolerance;
};

const getPhotoIndex = (element) => {
  const value = element?.data?.photoIndex;
  return Number.isFinite(value) ? value : null;
};

const getPhotoMetadataScore = (element) => {
  if (!element || element.type !== 'photo') {
    return 0;
  }

  let score = 0;

  if (getPhotoIndex(element) !== null) {
    score += 4;
  }

  if (element?.id) {
    score += 2;
  }

  if (Number.isFinite(element?.data?.borderRadius)) {
    score += 1;
  }

  return score;
};

const areEquivalentPhotoPlaceholders = (left, right) => {
  if (left?.type !== 'photo' || right?.type !== 'photo') {
    return false;
  }

  const leftPhotoIndex = getPhotoIndex(left);
  const rightPhotoIndex = getPhotoIndex(right);

  if (
    leftPhotoIndex !== null &&
    rightPhotoIndex !== null &&
    leftPhotoIndex !== rightPhotoIndex
  ) {
    return false;
  }

  return (
    areNumbersClose(left?.x, right?.x) &&
    areNumbersClose(left?.y, right?.y) &&
    areNumbersClose(left?.width, right?.width) &&
    areNumbersClose(left?.height, right?.height) &&
    areNumbersClose(left?.rotation ?? 0, right?.rotation ?? 0) &&
    areNumbersClose(left?.data?.borderRadius ?? 0, right?.data?.borderRadius ?? 0)
  );
};

const dedupePhotoPlaceholders = (elements = []) => {
  if (!Array.isArray(elements) || elements.length <= 1) {
    return elements;
  }

  const deduped = [];
  let didMutate = false;

  elements.forEach((element) => {
    if (element?.type !== 'photo') {
      deduped.push(element);
      return;
    }

    const duplicateIndex = deduped.findIndex((candidate) =>
      areEquivalentPhotoPlaceholders(candidate, element)
    );

    if (duplicateIndex === -1) {
      deduped.push(element);
      return;
    }

    didMutate = true;

    const existing = deduped[duplicateIndex];
    const existingScore = getPhotoMetadataScore(existing);
    const nextScore = getPhotoMetadataScore(element);

    if (nextScore > existingScore) {
      deduped[duplicateIndex] = element;
    }
  });

  return didMutate ? deduped : elements;
};

const deriveOverlayZIndex = (placeholder) => {
  const baseZ = Number.isFinite(placeholder?.zIndex)
    ? placeholder.zIndex
    : NORMAL_ELEMENTS_MIN_Z;
  return baseZ + CAPTURED_OVERLAY_Z_OFFSET;
};

const syncCapturedOverlayWithPlaceholder = (overlay, placeholder) => {
  if (!overlay || !placeholder) {
    return null;
  }

  const placeholderX = Number.isFinite(placeholder?.x) ? placeholder.x : 0;
  const placeholderY = Number.isFinite(placeholder?.y) ? placeholder.y : 0;
  const placeholderWidth = Number.isFinite(placeholder?.width) ? placeholder.width : 0;
  const placeholderHeight = Number.isFinite(placeholder?.height) ? placeholder.height : 0;
  const desiredZIndex = deriveOverlayZIndex(placeholder);
  const data = overlay.data || {};
  const desiredBorderRadius = Number.isFinite(placeholder?.data?.borderRadius)
    ? placeholder.data.borderRadius
    : data.borderRadius ?? 0;
  const desiredSourceId = placeholder.id || null;
  const desiredRotation = Number.isFinite(placeholder?.rotation)
    ? placeholder.rotation
    : 0;

  const needsSync =
    (Number.isFinite(overlay.x) ? overlay.x : 0) !== placeholderX ||
    (Number.isFinite(overlay.y) ? overlay.y : 0) !== placeholderY ||
    (Number.isFinite(overlay.width) ? overlay.width : 0) !== placeholderWidth ||
    (Number.isFinite(overlay.height) ? overlay.height : 0) !== placeholderHeight ||
    (Number.isFinite(overlay.rotation) ? overlay.rotation : 0) !== desiredRotation ||
    overlay.zIndex !== desiredZIndex ||
    overlay.isLocked !== true ||
    data.borderRadius !== desiredBorderRadius ||
    data.__sourcePlaceholderId !== desiredSourceId;

  if (!needsSync) {
    return overlay;
  }

  return {
    ...overlay,
    x: placeholderX,
    y: placeholderY,
    width: placeholderWidth,
    height: placeholderHeight,
    rotation: desiredRotation,
    zIndex: desiredZIndex,
    isLocked: true,
    data: {
      ...data,
      borderRadius: desiredBorderRadius,
      __sourcePlaceholderId: desiredSourceId,
    },
  };
};

const removeCapturedOverlaysForPlaceholder = (elements = [], placeholderId) => {
  if (!placeholderId || !Array.isArray(elements)) {
    return elements;
  }

  return elements.filter((element) => {
    if (!isCapturedPhotoOverlay(element)) {
      return true;
    }
    return element?.data?.__sourcePlaceholderId !== placeholderId;
  });
};

const syncAllPhotoOverlays = (elements = []) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return elements;
  }

  const overlayBySourceId = new Map();
  const result = [];
  let didMutate = false;

  elements.forEach((element) => {
    if (isCapturedPhotoOverlay(element)) {
      const sourceId = element?.data?.__sourcePlaceholderId;
      if (sourceId) {
        overlayBySourceId.set(sourceId, element);
      }
    }
  });

  if (overlayBySourceId.size === 0) {
    return elements;
  }

  elements.forEach((element) => {
    if (isCapturedPhotoOverlay(element)) {
      // Overlays are re-inserted alongside their placeholders later.
      return;
    }

    if (element?.type === 'photo' && element.id) {
      const overlay = overlayBySourceId.get(element.id);
      if (overlay) {
        const syncedOverlay = syncCapturedOverlayWithPlaceholder(overlay, element);
        if (syncedOverlay !== overlay) {
          didMutate = true;
        }
        result.push(syncedOverlay);
        overlayBySourceId.delete(element.id);
      }
    }

    result.push(element);
  });

  if (overlayBySourceId.size > 0) {
    // Drop overlays that no longer have matching placeholders.
    didMutate = true;
  }

  return didMutate ? result : elements;
};

const getNormalizedZIndex = (element) => {
  if (!element || typeof element !== 'object') {
    return NORMAL_ELEMENTS_MIN_Z;
  }

  if (element.type === 'background-photo') {
    return Number.isFinite(element?.zIndex) ? element.zIndex : BACKGROUND_PHOTO_Z;
  }

  const zIndex = Number.isFinite(element?.zIndex) ? element.zIndex : null;
  if (zIndex !== null) {
    return zIndex;
  }

  return NORMAL_ELEMENTS_MIN_Z;
};

const enforcePhotoPlaceholderLayering = (elements = []) => {
  // DISABLED: This function was forcing separated z-index systems
  // Photos and other elements should share the same z-index space
  // Just return elements as-is, let user control layering freely
  return elements;
  
  /* ORIGINAL CODE - DISABLED FOR UNIFIED Z-INDEX SYSTEM
  if (!Array.isArray(elements) || elements.length === 0) {
    return elements;
  }

  const entries = elements.map((element, index) => ({
    element,
    index,
    key: element?.id ?? `__index_${index}`,
    originalZ: getNormalizedZIndex(element),
  }));

  const photoEntries = [];
  const otherEntries = [];

  entries.forEach((entry) => {
    const { element } = entry;
    if (!element || typeof element !== 'object') {
      return;
    }

    if (element.type === 'background-photo' || isCapturedPhotoOverlay(element)) {
      return;
    }

    if (element.type === 'photo') {
      photoEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  });

  if (photoEntries.length === 0) {
    return elements;
  }

  const sortEntries = (arr) =>
    arr.slice().sort((a, b) => {
      if (a.originalZ === b.originalZ) {
        return a.index - b.index;
      }
      return a.originalZ - b.originalZ;
    });

  const assignments = new Map();

  let currentZ = NORMAL_ELEMENTS_MIN_Z;

  sortEntries(photoEntries).forEach((entry) => {
    assignments.set(entry.key, currentZ);
    currentZ += 1;
  });

  let nextZ = Math.max(currentZ, NORMAL_ELEMENTS_MIN_Z + photoEntries.length);

  sortEntries(otherEntries).forEach((entry) => {
    const original = entry.originalZ;
    const desired = original >= nextZ ? original : nextZ;
    assignments.set(entry.key, desired);
    nextZ = desired + 1;
  });

  if (assignments.size === 0) {
    return elements;
  }

  let didMutate = false;

  const remapped = elements.map((element, index) => {
    if (!element || typeof element !== 'object') {
      return element;
    }

    if (element.type === 'background-photo' || isCapturedPhotoOverlay(element)) {
      return element;
    }

    const key = element.id ?? `__index_${index}`;
    const desiredZ = assignments.get(key);

    if (!Number.isFinite(desiredZ) || element.zIndex === desiredZ) {
      return element;
    }

    didMutate = true;
    return {
      ...element,
      zIndex: desiredZ,
    };
  });

  return didMutate ? remapped : elements;
  */
};

const normalizeElementZOrder = (elements) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return elements;
  }

  // Calculate baseMax from NON-photo elements only
  // Photos can have z-index 0 or even negative, so don't include them
  const baseMax = elements.reduce((max, element) => {
    if (!element || element.type === 'background-photo' || element.type === 'photo') {
      return max;
    }
    const currentZ = Number.isFinite(element.zIndex) ? element.zIndex : null;
    if (currentZ !== null && currentZ >= NORMAL_ELEMENTS_MIN_Z) {
      return currentZ > max ? currentZ : max;
    }
    return max;
  }, NORMAL_ELEMENTS_MIN_Z - 1);

  let runningMax = baseMax;
  let didMutate = false;

  const normalized = elements.map((element) => {
    if (!element) {
      return element;
    }

    if (element.type === 'background-photo') {
      const desiredZ = Number.isFinite(BACKGROUND_PHOTO_Z)
        ? BACKGROUND_PHOTO_Z
        : Number.isFinite(element.zIndex)
        ? element.zIndex
        : -1000;
      if (element.zIndex !== desiredZ) {
        didMutate = true;
        return { ...element, zIndex: desiredZ };
      }
      return element;
    }

    // ✅ CRITICAL FIX: ALL elements with existing z-index should be preserved!
    // This includes photo, upload, text, shape - anything that already has z-index
    // Only assign new z-index to elements that don't have one
    if (Number.isFinite(element.zIndex)) {
      // Element already has a z-index, KEEP IT!
      // Update runningMax to track the highest z-index we've seen
      runningMax = element.zIndex > runningMax ? element.zIndex : runningMax;
      return element;
    }

    // Only elements WITHOUT z-index get assigned a new one
    // Photo slots default to PHOTO_SLOT_MIN_Z (0); upload/other elements start above NORMAL_ELEMENTS_MIN_Z
    if (element.type === 'photo') {
      const PHOTO_SLOT_MIN_Z = 0;
      didMutate = true;
      return { ...element, zIndex: PHOTO_SLOT_MIN_Z };
    }

    if (element.type === 'upload') {
      // Upload stickers/overlays must always be above photo slots
      const nextZ = Math.max(runningMax + 1, NORMAL_ELEMENTS_MIN_Z + 100);
      runningMax = nextZ;
      didMutate = true;
      return { ...element, zIndex: nextZ };
    }

    // Text/shapes without z-index get assigned incrementing values
    const nextZ = Math.max(runningMax + 1, NORMAL_ELEMENTS_MIN_Z);
    runningMax = nextZ;
    didMutate = true;
    return { ...element, zIndex: nextZ };
  });

  return didMutate ? normalized : elements;
};

const syncCreatorElements = (elements) => {
  const dedupedPhotos = dedupePhotoPlaceholders(elements);
  const withSyncedOverlays = syncAllPhotoOverlays(dedupedPhotos);
  const withPhotoHierarchy = enforcePhotoPlaceholderLayering(withSyncedOverlays);
  const normalized = normalizeElementZOrder(withPhotoHierarchy);
  return syncAllPhotoOverlays(normalized);
};

console.log('[useCreatorStore] Store module loaded');

export const useCreatorStore = create((set, get) => ({
  elements: [],
  selectedElementId: null,
  canvasBackground: DEFAULT_BACKGROUND,
  lastZIndex: 1,
  addElement: (type, extra = {}) => {
    const defaults = defaultPropsByType(type);
    
    // For photo elements, auto-assign photoIndex based on existing photo count
    let mergedData = {
      ...(defaults.data || {}),
      ...(extra.data || {})
    };
    
    // CRITICAL FIX: Auto-assign photoIndex for photo elements
    if (type === 'photo' && typeof mergedData.photoIndex !== 'number') {
      const state = get();
      const existingPhotoCount = state.elements.filter(el => el.type === 'photo').length;
      mergedData.photoIndex = existingPhotoCount;
      console.log(`📸 [addElement] Auto-assigned photoIndex ${existingPhotoCount} to new photo element`);
    }
    
    const currentLastZ = get().lastZIndex;
    const defaultZ = resolveDefaultZIndex(type, defaults, currentLastZ);
    const desiredZ = typeof extra.zIndex === 'number' ? extra.zIndex : defaultZ;
    const element = baseElement(type, {
      ...defaults,
      ...extra,
      data: mergedData,
      zIndex: desiredZ
    });
    set((state) => {
      const nextElements = syncCreatorElements([...state.elements, element]);
      // Only update lastZIndex for non-photo elements (text, shape, upload)
      // Photo elements have their own z-index system (default 0)
      const nextLastZ = (type === 'photo' || type === 'background-photo') 
        ? state.lastZIndex 
        : (desiredZ > state.lastZIndex ? desiredZ : state.lastZIndex);
      return {
        elements: nextElements,
        selectedElementId: element.id,
        lastZIndex: nextLastZ
      };
    });
    return element.id;
  },
  addUploadElement: (imageDataUrl) => {
    // Generate ID first
    const id = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Load image FIRST to get dimensions before adding to canvas
    const img = new Image();
    
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      
      // Target size is 1/3 of canvas for display
      const targetWidth = CANVAS_WIDTH / 3;
      const targetHeight = CANVAS_HEIGHT / 3;
      
      let width, height;
      
      // Scale to fit within 1/3 canvas while maintaining aspect ratio
      if (img.width / targetWidth > img.height / targetHeight) {
        // Width is the limiting factor
        width = targetWidth;
        height = width / aspectRatio;
      } else {
        // Height is the limiting factor
        height = targetHeight;
        width = height * aspectRatio;
      }
      
      // Create display version with optimal size - PRESERVE TRANSPARENCY
      // Max display dimensions to prevent large data URLs (max 400px on longest side for better performance)
      const maxDisplaySize = 400;
      let displayWidth = Math.round(width);
      let displayHeight = Math.round(height);
      
      if (Math.max(displayWidth, displayHeight) > maxDisplaySize) {
        if (displayWidth > displayHeight) {
          displayWidth = maxDisplaySize;
          displayHeight = Math.round(maxDisplaySize / aspectRatio);
        } else {
          displayHeight = maxDisplaySize;
          displayWidth = Math.round(maxDisplaySize * aspectRatio);
        }
      }
      
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = displayWidth;
      displayCanvas.height = displayHeight;
      const displayCtx = displayCanvas.getContext('2d', { alpha: true });
      // Clear canvas with transparent background
      displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      displayCtx.drawImage(img, 0, 0, displayWidth, displayHeight);
      // Use PNG format to preserve transparency, quality 0.75 for smaller size
      const displayImageDataUrl = displayCanvas.toDataURL('image/png', 0.75);
      
      // Validate data URL size (should be < 500KB)
      const dataUrlSizeKB = (displayImageDataUrl.length * 0.75) / 1024;
      if (dataUrlSizeKB > 500) {
        console.warn('⚠️ Display image still large:', dataUrlSizeKB.toFixed(0), 'KB');
      }
      
      console.log('📦 Upload element created:', {
        originalSize: `${img.width}x${img.height}`,
        displaySize: `${displayWidth}x${displayHeight}`,
        canvasSize: `${Math.round(width)}x${Math.round(height)}`,
        dataUrlLength: displayImageDataUrl.length
      });
      
      // Center the element on canvas
      const x = Math.round((CANVAS_WIDTH - width) / 2);
      const y = Math.round((CANVAS_HEIGHT - height) / 2);

      // NOW add the element with correct dimensions
      const state = get();
      const nextZIndex = state.lastZIndex + 1;
      
      const element = {
        id,
        type: 'upload',
        x,
        y,
        width: Math.round(width),
        height: Math.round(height),
        zIndex: nextZIndex,
        locked: false,
        data: {
          image: displayImageDataUrl,
          originalImage: imageDataUrl,
          imageAspectRatio: aspectRatio,
          objectFit: 'fill', // Changed from 'contain' to 'fill' to ensure it fills the element bounds
          label: 'Unggahan',
          borderRadius: 0
        }
      };
      
      set((prev) => ({
        elements: syncCreatorElements([...prev.elements, element]),
        selectedElementId: id,
        lastZIndex: nextZIndex
      }));
    };
    
    img.onerror = () => {
      console.error('[addUploadElement] Failed to load image');
      // Still add element but with placeholder
      get().addElement('upload', {
        x: Math.round((CANVAS_WIDTH - DEFAULT_UPLOAD_WIDTH) / 2),
        y: Math.round((CANVAS_HEIGHT - DEFAULT_UPLOAD_HEIGHT) / 2),
        data: {
          image: imageDataUrl,
          objectFit: 'fill',
          label: 'Unggahan'
        }
      });
    };
    
    // Start loading the image
    img.src = imageDataUrl;
    
    return id;
  },
  addBackgroundPhoto: (imageDataUrl, meta = {}) => {
    const state = get();
    const existing = state.elements.find((el) => el.type === 'background-photo');

    // Get canvas dimensions from meta or use defaults
    const canvasWidth = meta.canvasWidth || CANVAS_WIDTH;
    const canvasHeight = meta.canvasHeight || CANVAS_HEIGHT;

    // Load image to get actual dimensions
    const img = new Image();
    img.src = imageDataUrl;
    
    const processImage = () => {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return; // Image not yet decoded — skip to avoid NaN dimensions
      const aspectRatio = iw / ih;
      if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
      const canvasAspectRatio = canvasWidth / canvasHeight;

      // Calculate size to COVER canvas (not contain)
      // Image must be >= canvas size on all sides
      let width;
      let height;

      if (aspectRatio > canvasAspectRatio) {
        // Image is wider than canvas - match height, let width overflow
        height = canvasHeight;
        width = height * aspectRatio;
      } else {
        // Image is taller/same as canvas - match width, let height overflow
        width = canvasWidth;
        height = width / aspectRatio;
      }

      // Center the image so it covers canvas
      const x = Math.round((canvasWidth - width) / 2);
      const y = Math.round((canvasHeight - height) / 2);

      const baseData = {
        image: imageDataUrl,
        objectFit: 'cover',
        imageAspectRatio: aspectRatio,
        label: 'Background',
      };

      set((prev) => {
        const background = prev.elements.find((el) => el.type === 'background-photo');
        
        // If no background photo element exists yet, skip this update
        // The background will be created below in the synchronous path
        if (!background) {
          console.log('[addBackgroundPhoto] No background element found, will be created in sync path');
          return prev;
        }

        let didMutate = false;
        const mapped = prev.elements.map((el) => {
          if (el.id === background.id) {
            didMutate = true;
            return {
              ...el,
              x,
              y,
              width: Math.round(width),
              height: Math.round(height),
              zIndex: 0, // Always z-index 0 for background, cannot be changed
              data: {
                ...el.data,
                ...baseData,
              },
            };
          }

          if (el.type === 'background-photo') {
            return el;
          }

          // Allow photo elements to have z-index 0 or even negative
          // Only enforce minimum for non-photo elements
          let targetZ;
          if (el.type === 'photo' || el.type === 'upload') {
            // Photos and uploads can have any z-index >= BACKGROUND_PHOTO_Z + 1
            const absoluteMin = BACKGROUND_PHOTO_Z + 1; // -3999
            targetZ = el.zIndex === undefined ? PHOTO_SLOT_MIN_Z : Math.max(el.zIndex, absoluteMin);
          } else {
            // Text, shapes - minimum is NORMAL_ELEMENTS_MIN_Z (1)
            targetZ = el.zIndex === undefined ? NORMAL_ELEMENTS_MIN_Z : Math.max(el.zIndex, NORMAL_ELEMENTS_MIN_Z);
          }
          
          if (targetZ !== el.zIndex) {
            didMutate = true;
            return { ...el, zIndex: targetZ };
          }

          return el;
        });

        if (!didMutate) {
          return prev;
        }

        return { elements: syncCreatorElements(mapped) };
      });
    };

    // Return placeholder ID for existing, or create placeholder
    if (existing) {
      const existingId = existing.id;
      set((prev) => {
        const updated = prev.elements.map((el) =>
          el.id === existingId
            ? {
                ...el,
                data: {
                  ...el.data,
                  image: imageDataUrl,
                  label: 'Background'
                }
              }
            : el
        );
        return { elements: syncCreatorElements(updated) };
      });
      
      // Process image to update dimensions after updating data
      if (img.complete) {
        processImage();
      } else {
        img.onload = processImage;
      }
      
      return existingId;
    }

    // Create placeholder with temp dimensions
    const metaRatio = Number(meta.aspectRatio);
    const ratioFromMeta = Number.isFinite(metaRatio) && metaRatio > 0 ? metaRatio : undefined;
    const derivedRatio = ratioFromMeta || canvasWidth / canvasHeight;
    const size = computeContainedSize(derivedRatio);
    const position = centerWithinCanvas(size.width, size.height);

    const id = get().addElement('background-photo', {
      ...position,
      zIndex: BACKGROUND_PHOTO_Z,
      data: {
        image: imageDataUrl,
        objectFit: 'cover',
        label: 'Background'
      },
      width: size.width,
      height: size.height
    });

    // After creating the background element, process the image to set correct dimensions
    // This handles the case where image loads after element creation
    if (img.complete) {
      processImage();
    } else {
      img.onload = processImage;
    }

    set((prev) => {
      const remapped = prev.elements.map((el) =>
        el.id === id ? { ...el, zIndex: BACKGROUND_PHOTO_Z } : el
      );

      const normalizedElements = syncCreatorElements(remapped);

      // Only compute lastZIndex from non-photo elements (text, shape, upload)
      // Photo elements have their own z-index system (default 0)
      const computedMaxZ = normalizedElements.reduce((max, el) => {
        if (el.type === 'background-photo' || el.type === 'photo') {
          return max;
        }
        const currentZ = Number.isFinite(el.zIndex) ? el.zIndex : max;
        return currentZ > max ? currentZ : max;
      }, prev.lastZIndex);

      const nextLastZ = Math.max(computedMaxZ, prev.lastZIndex, NORMAL_ELEMENTS_MIN_Z);

      return {
        elements: normalizedElements,
        lastZIndex: nextLastZ
      };
    });
    
    return id;
  },
  fitBackgroundPhotoToCanvas: (meta = {}) => {
    const state = get();
    const background = state.elements.find((el) => el.type === 'background-photo');
    if (!background) {
      return;
    }
    
    // Use dynamic canvas dimensions from meta or fallback to constants
    const canvasWidth = meta.canvasWidth || CANVAS_WIDTH;
    const canvasHeight = meta.canvasHeight || CANVAS_HEIGHT;
    
    const aspectRatio = Number(background.data?.imageAspectRatio) > 0
      ? background.data.imageAspectRatio
      : background.width > 0 && background.height > 0
      ? background.width / background.height
      : canvasWidth / canvasHeight;
    
    // Use COVER mode - image must fill entire canvas
    const canvasAspectRatio = canvasWidth / canvasHeight;
    let width, height;
    
    if (aspectRatio > canvasAspectRatio) {
      // Image is wider - match height, let width overflow
      height = canvasHeight;
      width = height * aspectRatio;
    } else {
      // Image is taller/same - match width, let height overflow
      width = canvasWidth;
      height = width / aspectRatio;
    }
    
    const position = {
      x: Math.round((canvasWidth - width) / 2),
      y: Math.round((canvasHeight - height) / 2)
    };
    
    set((prev) => {
      const remapped = prev.elements.map((el) =>
        el.id === background.id
          ? {
              ...el,
              width: Math.round(width),
              height: Math.round(height),
              ...position,
              data: {
                ...el.data,
                objectFit: 'cover'
              }
            }
          : el
      );
      return {
        elements: syncCreatorElements(remapped),
        selectedElementId: background.id
      };
    });
  },
  batchUpdateElements: (updatesMap) => {
    // updatesMap: { [id]: { x?, y?, width?, height?, data?: {...} } }
    set((state) => ({
      elements: state.elements.map((el) => {
        const upd = updatesMap[el.id];
        if (!upd) return el;
        const mergedData = upd.data ? { ...el.data, ...upd.data } : el.data;
        return { ...el, ...upd, data: mergedData };
      }),
    }));
  },
  updateElement: (id, changes) => {
    set((state) => {
      let updatedElement = null;
      const nextElements = state.elements.map((el) => {
        if (el.id !== id) {
          return el;
        }

        // Prevent changing z-index for background-photo (always 0)
        const sanitizedChanges = { ...changes };
        if (el.type === 'background-photo') {
          delete sanitizedChanges.zIndex; // Remove zIndex from changes
          sanitizedChanges.zIndex = 0; // Force zIndex to 0
        }

        const mergedData = sanitizedChanges.data ? { ...el.data, ...sanitizedChanges.data } : el.data;
        updatedElement = {
          ...el,
          ...sanitizedChanges,
          data: mergedData,
        };
        return updatedElement;
      });

      return {
        elements: syncCreatorElements(nextElements),
      };
    });
  },
  updateElementData: (id, data) => {
    set((state) => {
      const mapped = state.elements.map((el) =>
        el.id === id
          ? {
              ...el,
              data: {
                ...el.data,
                ...data
              }
            }
          : el
      );
      return {
        elements: syncCreatorElements(mapped)
      };
    });
  },
  resizeUploadImage: (id, newWidth, newHeight) => {
    const element = get().elements.find((el) => el.id === id);
    if (!element || element.type !== 'upload' || !element.data?.originalImage) {
      return;
    }

    const img = new Image();
    img.src = element.data.originalImage; // Use original high-quality image
    
    img.onload = () => {
      // Create canvas with new dimensions
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(newWidth);
      canvas.height = Math.round(newHeight);
      const ctx = canvas.getContext('2d');
      
      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw resized image from original
      ctx.drawImage(img, 0, 0, Math.round(newWidth), Math.round(newHeight));
      const resizedImageDataUrl = canvas.toDataURL('image/png', 0.95);
      
      // Update element with resized image
      get().updateElement(id, {
        data: {
          image: resizedImageDataUrl
          // Keep originalImage unchanged for future resizes
        }
      });
    };
  },
  selectElement: (id) => {
    set({ selectedElementId: id });
  },
  removeElement: (id) => {
    set((state) => {
      const target = state.elements.find((el) => el.id === id);
      const duplicatePhotoIds =
        target?.type === 'photo'
          ? state.elements
              .filter(
                (element) =>
                  element.id !== id &&
                  areEquivalentPhotoPlaceholders(element, target)
              )
              .map((element) => element.id)
          : [];

      const idsToRemove = new Set([id, ...duplicatePhotoIds]);
      let nextElements = state.elements.filter((el) => !idsToRemove.has(el.id));

      if (target?.type === 'photo') {
        idsToRemove.forEach((photoId) => {
          nextElements = removeCapturedOverlaysForPlaceholder(nextElements, photoId);
        });
      }

      return {
        elements: syncCreatorElements(nextElements),
        selectedElementId:
          state.selectedElementId === id ? null : state.selectedElementId,
      };
    });
  },
  duplicateElement: (id) => {
    const element = get().elements.find((el) => el.id === id);
    if (!element) return;
    
    // For photo elements, keep them in photo z-index range
    // For other elements (text, shape, upload), use lastZIndex + 1
    const newZIndex = element.type === 'photo' 
      ? (element.zIndex ?? 0) 
      : get().lastZIndex + 1;
    
    // For photo elements, generate a unique photoIndex
    // Count existing photo elements to determine the next index
    let duplicateData = { ...element.data };
    if (element.type === 'photo') {
      const existingPhotoElements = get().elements.filter(el => el.type === 'photo');
      const maxPhotoIndex = existingPhotoElements.reduce((max, el) => {
        const idx = el.data?.photoIndex;
        return Number.isFinite(idx) ? Math.max(max, idx) : max;
      }, -1);
      duplicateData = {
        ...element.data,
        photoIndex: maxPhotoIndex + 1
      };
    }
    
    const duplicate = {
      ...element,
      id: generateId(),
      x: element.x + 20,
      y: element.y + 20,
      zIndex: newZIndex,
      data: duplicateData,
    };
    
    set((state) => {
      const nextElements = syncCreatorElements([...state.elements, duplicate]);
      // Only update lastZIndex for non-photo elements
      const nextLastZ = element.type === 'photo' 
        ? state.lastZIndex 
        : state.lastZIndex + 1;
      return {
        elements: nextElements,
        lastZIndex: nextLastZ,
        selectedElementId: duplicate.id,
      };
    });
  },
  toggleLock: (id) => {
    set((state) => {
      const mapped = state.elements.map((el) =>
        el.id === id ? { ...el, isLocked: !el.isLocked } : el
      );
      return {
        elements: syncCreatorElements(mapped),
      };
    });
  },
  bringToFront: (id) => {
    const target = get().elements.find((el) => el.id === id);
    if (target?.type === 'background-photo') {
      set({ selectedElementId: id });
      return;
    }
    const nextZ = get().lastZIndex + 1;
    set((state) => {
      const elements = state.elements.map((el) =>
        el.id === id
          ? {
              ...el,
              zIndex: nextZ,
            }
          : el
      );

      return {
        elements: syncCreatorElements(elements),
        lastZIndex: nextZ,
      };
    });
  },
  sendToBack: (id) => {
    const target = get().elements.find((el) => el.id === id);
    if (!target || target.type === 'background-photo') {
      return;
    }

    const allElements = get().elements;
    const candidates = allElements
      .filter((el) => el.type !== 'background-photo' && !isCapturedPhotoOverlay(el))
      .map((el) => (Number.isFinite(el?.zIndex) ? el.zIndex : NORMAL_ELEMENTS_MIN_Z));
    const minZ = candidates.length > 0 ? Math.min(...candidates) : NORMAL_ELEMENTS_MIN_Z;
    
    // Allow photo elements to go lower than NORMAL_ELEMENTS_MIN_Z
    // Photo elements can go down to BACKGROUND_PHOTO_Z + 1 (just above background)
    const absoluteMin = BACKGROUND_PHOTO_Z + 1;
    const nextZ = Math.max(absoluteMin, minZ - 1);

    set((state) => {
      const elements = state.elements.map((el) =>
        el.id === id
          ? {
              ...el,
              zIndex: nextZ,
            }
          : el
      );

      return {
        elements: syncCreatorElements(elements),
        lastZIndex: Math.max(state.lastZIndex, nextZ),
      };
    });
  },
  bringForward: (id) => {
    const target = get().elements.find((el) => el.id === id);
    if (target?.type === 'background-photo') {
      return;
    }
    const allElements = get().elements;
    const sorted = allElements
      .filter(el => el.type !== 'background-photo' && !isCapturedPhotoOverlay(el))
      .sort((a, b) => {
        const aZ = Number.isFinite(a.zIndex) ? a.zIndex : NORMAL_ELEMENTS_MIN_Z;
        const bZ = Number.isFinite(b.zIndex) ? b.zIndex : NORMAL_ELEMENTS_MIN_Z;
        return aZ - bZ;
      });
    
    const currentIndex = sorted.findIndex(el => el.id === id);
    if (currentIndex === -1 || currentIndex === sorted.length - 1) {
      return;
    }
    
    const nextElement = sorted[currentIndex + 1];
    const currentZ = Number.isFinite(target.zIndex) ? target.zIndex : NORMAL_ELEMENTS_MIN_Z;
    const nextZ = Number.isFinite(nextElement.zIndex) ? nextElement.zIndex : NORMAL_ELEMENTS_MIN_Z;
    
    set((state) => {
      const elements = state.elements.map((el) => {
        if (el.id === id) {
          return { ...el, zIndex: nextZ };
        }
        if (el.id === nextElement.id) {
          return { ...el, zIndex: currentZ };
        }
        return el;
      });

      return {
        elements: syncCreatorElements(elements),
      };
    });
  },
  sendBackward: (id) => {
    const target = get().elements.find((el) => el.id === id);
    if (target?.type === 'background-photo') {
      return;
    }
    const allElements = get().elements;
    const sorted = allElements
      .filter(el => el.type !== 'background-photo' && !isCapturedPhotoOverlay(el))
      .sort((a, b) => {
        const aZ = Number.isFinite(a.zIndex) ? a.zIndex : NORMAL_ELEMENTS_MIN_Z;
        const bZ = Number.isFinite(b.zIndex) ? b.zIndex : NORMAL_ELEMENTS_MIN_Z;
        return aZ - bZ;
      });
    
    const currentIndex = sorted.findIndex(el => el.id === id);
    if (currentIndex === -1 || currentIndex === 0) {
      return;
    }
    
    const prevElement = sorted[currentIndex - 1];
    const currentZ = Number.isFinite(target.zIndex) ? target.zIndex : NORMAL_ELEMENTS_MIN_Z;
    const prevZ = Number.isFinite(prevElement.zIndex) ? prevElement.zIndex : NORMAL_ELEMENTS_MIN_Z;
    
    set((state) => {
      const elements = state.elements.map((el) => {
        if (el.id === id) {
          return { ...el, zIndex: prevZ };
        }
        if (el.id === prevElement.id) {
          return { ...el, zIndex: currentZ };
        }
        return el;
      });

      return {
        elements: syncCreatorElements(elements),
      };
    });
  },
  setCanvasBackground: (color) => {
    set({ canvasBackground: color, selectedElementId: 'background' });
  },
  setElements: (elements) => {
    const normalized = syncCreatorElements(elements);
    // Only compute lastZIndex from non-photo elements (text, shape, upload)
    // Photo elements have their own z-index system (default 0)
    const maxZ = normalized.reduce((max, el) => {
      if (!el || el.type === 'background-photo' || el.type === 'photo') {
        return max;
      }
      const currentZ = Number.isFinite(el?.zIndex) ? el.zIndex : max;
      return currentZ > max ? currentZ : max;
    }, NORMAL_ELEMENTS_MIN_Z);
    set({ elements: normalized, lastZIndex: maxZ });
  },
  clearSelection: () => set({ selectedElementId: null }),
  reset: () => set({
    elements: [],
    selectedElementId: null,
    canvasBackground: DEFAULT_BACKGROUND,
    lastZIndex: 1
  })
}));

export default useCreatorStore;
