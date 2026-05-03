// Frame data provider - utility untuk mengelola frame configurations
import {
  getFrameConfig,
  getFrameMetadata,
  isValidFrame,
  getAllFrames,
  preloadFrameConfigs,
} from "../config/frameConfigManager.js";
import unifiedFrameService from "../services/unifiedFrameService";
import safeStorage from "./safeStorage.js";
import userStorage from "./userStorage.js";
import { sanitizeFrameConfigForStorage } from "./frameConfigSanitizer.js";
import { buildSlotMaps } from "./slotSystem.js";

const CUSTOM_FRAME_PREFIX = "custom-";

// Helper to detect UUID format (Supabase uses UUIDs)
const isUUID = (str) => {
  if (typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

const isCustomFrameId = (frameName) => {
  if (typeof frameName !== "string") return false;
  // Custom frame can be either:
  // 1. Starts with "custom-" prefix (legacy/localStorage)
  // 2. Is a UUID (Supabase)
  return frameName.startsWith(CUSTOM_FRAME_PREFIX) || isUUID(frameName);
};

<<<<<<< HEAD
const normalizeSlotsWithMaps = (slots) => {
  const sourceSlots = Array.isArray(slots) ? slots : [];
  const { slotNumberMap, photoIndexMap, mode } = buildSlotMaps(sourceSlots);
=======
const normalizeSlotsWithMaps = (slots, options = {}) => {
  const sourceSlots = Array.isArray(slots) ? slots : [];
  const { slotNumberMap, photoIndexMap, mode } = buildSlotMaps(sourceSlots);
  const explicitDuplicatePhotos =
    typeof options.duplicatePhotos === "boolean" ? options.duplicatePhotos : null;
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

  return {
    slots: sourceSlots.map((slot, index) => ({
      ...slot,
<<<<<<< HEAD
      slotNumber: slotNumberMap[index] ?? index + 1,
      photoIndex: photoIndexMap[index] ?? index,
    })),
    duplicatePhotos: mode === "duplicate",
=======
      slotNumber:
        // Only preserve stored slotNumber for explicit duplicate frames.
        // For sequential frames the stored values may be mirror-mapped (from geometry detection).
        explicitDuplicatePhotos === true
          ? (Number.isFinite(slot?.slotNumber) ? slot.slotNumber : slotNumberMap[index] ?? index + 1)
          : index + 1,
      photoIndex:
        // Only preserve stored photoIndex for EXPLICIT duplicate frames.
        // The studio booth sync may have written mirror-mapped [0,1,1,0] values.
        // When duplicatePhotos is not explicitly true, always use sequential [0,1,2,...].
        explicitDuplicatePhotos === true
          ? (Number.isFinite(slot?.photoIndex) ? slot.photoIndex : photoIndexMap[index] ?? index)
          : index,
    })),
    duplicatePhotos:
      explicitDuplicatePhotos !== null
        ? explicitDuplicatePhotos
        : mode === "duplicate",
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
  };
};

export class FrameDataProvider {
  constructor() {
    this.currentFrame = null;
    this.currentConfig = null;
    this.isLoading = false;
  }

  // Set custom frame from admin upload
  async setCustomFrame(frameData, options = {}) {
    console.log(`🎨 setCustomFrame called with:`, frameData);
    console.log(`📊 Frame data keys:`, Object.keys(frameData));
    console.log(`📦 frameData.layout:`, frameData.layout);
    console.log(`📦 frameData.layout?.elements:`, frameData.layout?.elements);
    console.log(`📦 frameData.designer:`, frameData.designer);

    if (!frameData || !frameData.id) {
      console.error("❌ Frame data is required to set custom frame.");
      return false;
    }

    this.isLoading = true;

    try {
      // Check if frameData already has slots (full frame object from Frames.jsx)
      let config;
      
      let hasSlots = frameData.slots && Array.isArray(frameData.slots) && frameData.slots.length > 0;
      const hasImage = frameData.imagePath || frameData.thumbnailUrl;
      const hasDesignerElements = Array.isArray(frameData.designer?.elements) && frameData.designer.elements.length > 0;
      // Shared/custom frames from the creator: have designer.elements with base64 images but no imagePath/thumbnailUrl
      const isDirectCustomFrame = (frameData.isSharedFrame || frameData.isCustom) && hasDesignerElements;

      // Designer-approved frames from the database store all elements in layout.elements.
      // If slots are missing or broken, derive them from photo elements in layout.elements.
      const photoLayoutEls = Array.isArray(frameData.layout?.elements)
        ? frameData.layout.elements.filter((el) => el.type === "photo")
        : [];
      if (!hasSlots && photoLayoutEls.length > 0) {
        const cW = frameData.canvasWidth || 1080;
        const cH = frameData.canvasHeight || 1920;
        frameData = {
          ...frameData,
          slots: photoLayoutEls.map((el, idx) => ({
            id: el.id || `slot_${idx}`,
            left: (el.x || 0) / cW,
            top: (el.y || 0) / cH,
            width: (el.width || 300) / cW,
            height: (el.height || 300) / cH,
            photoIndex: el.data?.photoIndex !== undefined ? el.data.photoIndex : idx,
            rotation: el.rotation || 0,
            borderRadius: el.data?.borderRadius || el.borderRadius || 0,
            zIndex: el.zIndex || 2,
            aspectRatio: el.data?.aspectRatio || "4:5",
          })),
        };
        hasSlots = true;
        console.log("🔧 Derived slots from layout.elements:", frameData.slots.length);
      }

      if (hasSlots) {
<<<<<<< HEAD
        const normalized = normalizeSlotsWithMaps(frameData.slots);
=======
        const normalized = normalizeSlotsWithMaps(frameData.slots, {
          duplicatePhotos: frameData.duplicatePhotos,
        });
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
        frameData = {
          ...frameData,
          slots: normalized.slots,
          duplicatePhotos: normalized.duplicatePhotos,
        };
      }
      
      console.log(`🔍 Frame data check:`);
      console.log(`  - Has slots: ${hasSlots} (${frameData.slots?.length || 0} slots)`);
      console.log(`  - Has image: ${hasImage}`);
      console.log(`  - Has designer.elements: ${hasDesignerElements} (${frameData.designer?.elements?.length || 0} elements)`);
      console.log(`  - Is direct custom frame: ${isDirectCustomFrame}`);
      
      if (isDirectCustomFrame) {
        // User-created shared/custom frame — use designer.elements directly.
        // These frames store all visuals (background-photo, upload overlays, photo slots)
        // as base64 images inside designer.elements; there is no imagePath/thumbnailUrl.
        console.log("✅ Direct custom/shared frame detected, using designer.elements directly");
        config = {
          ...frameData,
          // Ensure required fields have sensible defaults
          maxCaptures: frameData.maxCaptures || frameData.slots?.length || 1,
          duplicatePhotos: Boolean(frameData.duplicatePhotos),
          canvasWidth: frameData.canvasWidth || 1080,
          canvasHeight: frameData.canvasHeight || 1920,
          designer: {
            ...frameData.designer,
            elements: frameData.designer.elements,
          },
        };
        console.log("✅ Direct config built:", {
          id: config.id,
          maxCaptures: config.maxCaptures,
          designerElements: config.designer.elements.length,
          elementTypes: config.designer.elements.map(el => el?.type),
        });
      } else if (hasSlots && photoLayoutEls.length > 0 && !hasImage) {
        // Designer-approved frame: has layout.elements with all visuals but no imagePath thumbnail.
        // Use layout.elements directly as designer.elements — no need for an imagePath overlay.
        const cW = frameData.canvasWidth || 1080;
        const cH = frameData.canvasHeight || 1920;
        console.log("✅ Designer-layout frame detected, using layout.elements directly");
        config = {
          id: frameData.id,
          name: frameData.name,
          description: frameData.description || "",
          maxCaptures: frameData.slots?.length || 1,
          duplicatePhotos: Boolean(frameData.duplicatePhotos),
          slots: frameData.slots,
          imagePath: null,
          frameImage: null,
          thumbnailUrl: null,
          canvasWidth: cW,
          canvasHeight: cH,
          designer: {
            elements: frameData.layout.elements,
            canvasWidth: cW,
            canvasHeight: cH,
            background: frameData.canvasBackground || frameData.layout?.backgroundColor || "#ffffff",
          },
          layout: frameData.layout,
          category: frameData.category || "custom",
          isCustom: true,
        };
      } else if (hasSlots && hasImage) {
        // Frame data is complete, use it directly!
        console.log("✅ Frame data is complete, building config directly from frameData");
        
        // Get the frame image URL
        const frameImageUrl = frameData.imagePath || frameData.thumbnailUrl || frameData.image_url;
        
        // Get canvas dimensions from frameData, default to 1080x1920
        const canvasWidth = frameData.canvasWidth || 1080;
        const canvasHeight = frameData.canvasHeight || 1920;
        console.log(`📐 Canvas dimensions: ${canvasWidth}x${canvasHeight}`);
        
        // Build designer elements: start with background-photo, then add photo slots
        const designerElements = [];

        // Check if layout.elements already contains a background-photo.
        // If so, we'll use that instead of synthesizing one from imagePath
        // (the real background from layout.elements is always more accurate).
        const layoutHasBgPhoto = Array.isArray(frameData.layout?.elements) &&
          frameData.layout.elements.some((el) => el.type === "background-photo");
        
        // Add background-photo element from imagePath ONLY when layout.elements has no bg
        if (frameImageUrl && !layoutHasBgPhoto) {
          designerElements.push({
            id: "background-photo-1",
            type: "background-photo",
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            zIndex: 0,
            data: {
              image: frameImageUrl,
              objectFit: "cover",
              label: "Frame Background",
            }
          });
          console.log("✅ Added background-photo element with image:", frameImageUrl.substring(0, 80) + "...");
        }
        
        // Add photo slot elements
        if (frameData.slots && Array.isArray(frameData.slots)) {
          frameData.slots.forEach((slot, index) => {
            designerElements.push({
              id: slot.id || `photo_${index + 1}`,
              type: "photo",
              x: slot.left * canvasWidth,
              y: slot.top * canvasHeight,
              width: slot.width * canvasWidth,
              height: slot.height * canvasHeight,
              rotation: Number.isFinite(slot.rotation) ? slot.rotation : 0,
              zIndex: slot.zIndex || 2,
              data: {
                photoIndex: slot.photoIndex !== undefined ? slot.photoIndex : index,
                slotNumber: slot.slotNumber !== undefined ? slot.slotNumber : index + 1,
                image: null,
                aspectRatio: slot.aspectRatio || "4:5",
              },
            });
          });
        }
        
        // Also restore other elements (upload, text, shape) from layout.elements if available
        console.log("🔍 [DEBUG] frameData.layout:", frameData.layout);
        console.log("🔍 [DEBUG] frameData.layout?.elements:", frameData.layout?.elements);
        if (frameData.layout?.elements && Array.isArray(frameData.layout.elements)) {
          console.log("📦 Restoring other elements from layout.elements:", frameData.layout.elements.length);
          frameData.layout.elements.forEach((el, idx) => {
            console.log(`  📦 Processing layout.elements[${idx}]:`, {
              type: el.type,
              id: el.id,
              zIndex: el.zIndex,
              hasImage: !!el.data?.image,
              __isOverlay: el.data?.__isOverlay,
            });
            // Convert normalized positions back to absolute positions
            const restoredElement = {
              ...el,
              x: el.xNorm !== undefined ? el.xNorm * canvasWidth : el.x,
              y: el.yNorm !== undefined ? el.yNorm * canvasHeight : el.y,
              width: el.widthNorm !== undefined ? el.widthNorm * canvasWidth : el.width,
              height: el.heightNorm !== undefined ? el.heightNorm * canvasHeight : el.height,
            };
            // Remove normalized properties
            delete restoredElement.xNorm;
            delete restoredElement.yNorm;
            delete restoredElement.widthNorm;
            delete restoredElement.heightNorm;
            
            // Mark upload elements with images as overlays (decorative elements)
            // These are different from photo slots which have photoIndex
            // IMPORTANT: Overlays must have HIGH zIndex to appear ABOVE photo slots
            if (restoredElement.type === 'upload' && 
                restoredElement.data?.image && 
                restoredElement.data?.photoIndex === undefined) {
              // Ensure overlay has zIndex >= 500 so it's always above photo slots
              restoredElement.zIndex = Math.max(restoredElement.zIndex || 0, 500 + idx);
              restoredElement.data = {
                ...restoredElement.data,
                __isOverlay: true,
              };
              console.log("✅ Marked overlay element:", restoredElement.id, "with zIndex:", restoredElement.zIndex);
            }
            
            designerElements.push(restoredElement);
          });
        }
        
        // Build config from frameData (don't rely on localStorage)
        // CRITICAL: Always use our rebuilt designerElements which includes overlay elements
        // Don't use frameData.designer directly as it may not have properly processed overlay elements
        config = {
          id: frameData.id,
          name: frameData.name,
          description: frameData.description || "",
          maxCaptures: frameData.maxCaptures || 3,
          duplicatePhotos: Boolean(frameData.duplicatePhotos),
          imagePath: frameImageUrl,
          frameImage: frameImageUrl,
          thumbnailUrl: frameData.thumbnailUrl || frameData.imagePath,
          slots: frameData.slots,
          canvasWidth: canvasWidth,
          canvasHeight: canvasHeight,
          designer: { 
            elements: designerElements, // Always use our rebuilt elements with overlays
            canvasWidth: canvasWidth,
            canvasHeight: canvasHeight,
            background: frameData.canvasBackground || frameData.designer?.background || "#ffffff",
          },
          layout: frameData.layout || {
            aspectRatio: "9:16",
            orientation: "portrait",
            backgroundColor: "#ffffff",
          },
          category: frameData.category || "custom",
          // IMPORTANT: Only set isCustom if frameData explicitly has it
          // Admin frames should NOT have isCustom: true (so frameImage overlay shows)
          // User-created custom frames (from Creator) have isCustom: true
          ...(frameData.isCustom !== undefined && { isCustom: frameData.isCustom }),
        };
        
        console.log("📦 [DEBUG] designerElements built:", designerElements.length);
        designerElements.forEach((el, i) => {
          console.log(`  [${i}] type=${el.type}, id=${el.id?.slice(0,8)}, zIndex=${el.zIndex}, __isOverlay=${el.data?.__isOverlay}`);
        });
        
        console.log("✅ Config built successfully from frameData");
        console.log("   isCustom:", config.isCustom, "(from frameData.isCustom:", frameData.isCustom, ")");
      } else {
        // Incomplete data, try to fetch from service (admin/Supabase frames)
        console.log("📦 Incomplete data, trying to fetch from service");
        config = await unifiedFrameService.getFrameConfig(frameData.id);
        
        if (!config) {
          console.error(`❌ Frame "${frameData.id}" not found in service`);
          const allFrames = await unifiedFrameService.getAllFrames();
          console.error(`   Available frames:`, allFrames.map(f => f.id));
          throw new Error(`Custom frame config for "${frameData.id}" not found`);
        }
        
        console.log("✅ Config retrieved from service");
      }

      this.currentFrame = frameData.id;
      this.currentConfig = config;

      console.log(`✅ Custom frame "${frameData.id}" set successfully`);
      console.log("  - Max captures:", config.maxCaptures);
      console.log("  - Slots count:", config.slots?.length);
      console.log("  - Image path:", config.imagePath ? "✓" : "✗");
      console.log("  - Designer elements:", config.designer?.elements?.length || 0);

      if (options.persistSelection !== false) {
        this.persistFrameSelection(frameData.id, config);
      }
      return true;
    } catch (error) {
      console.error(`❌ Error setting custom frame:`, error);
      console.error(`❌ Error stack:`, error.stack);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // Set frame yang akan digunakan (now async)
  async setFrame(frameName, options = {}) {
    console.log(`🎯 setFrame called with: ${frameName}`);

    if (!frameName) {
      console.error("Frame name is required to set frame.");
      return false;
    }

    const providedConfig = options.config;
    const treatAsCustom =
      options.isCustom ??
      providedConfig?.isCustom ??
      isCustomFrameId(frameName);

    this.isLoading = true;

    try {
      let config = providedConfig || null;

      if (!config) {
        // Try built-in frames first
        if (isValidFrame(frameName)) {
          config = await getFrameConfig(frameName);
        }
        // Try custom frames from service
        else {
          // Check if it's a custom frame from admin upload
          const customConfig = await unifiedFrameService.getFrameConfig(frameName);
          if (customConfig) {
            config = customConfig;
            console.log(`✅ Found custom frame: ${frameName}`);
          } else {
            // Try cached frame config
            const cachedConfig = safeStorage.getJSON("frameConfig");
            if (cachedConfig?.id === frameName) {
              config = cachedConfig;
            }
          }

          if (!config) {
            if (treatAsCustom) {
              throw new Error(
                `Custom frame "${frameName}" tidak ditemukan di storage`
              );
            }
            console.error(
              `Frame "${frameName}" tidak valid atau tidak ditemukan`
            );
            return false;
          }
        }
      }

      if (!config) {
        throw new Error(`Frame configuration for "${frameName}" is missing`);
      }

      this.currentFrame = frameName;
      this.currentConfig = config;

      // Logging for debugging
      if (treatAsCustom) {
        console.log(`🔍 CUSTOM FRAME SET DEBUG:`);
        console.log("  - Frame ID:", frameName);
        console.log("  - Config ID:", config.id);
        console.log("  - Max captures:", config.maxCaptures);
        console.log("  - Slots count:", config.slots?.length);
        console.log("  - Is custom:", config.isCustom);
      } else if (frameName === "Testframe3") {
        console.log(`🔍 ${frameName.toUpperCase()} SET FRAME DEBUG:`);
        console.log("  - isValidFrame result:", isValidFrame(frameName));
        console.log("  - getFrameConfig result:", this.currentConfig);
        console.log("  - maxCaptures:", this.currentConfig?.maxCaptures);
        console.log("  - slots count:", this.currentConfig?.slots?.length);
      }

      this.persistFrameSelection(frameName, config);

      const slotCount = Array.isArray(config?.slots) ? config.slots.length : 0;
      console.log(
        `✅ Frame "${frameName}" berhasil di-set dengan ${slotCount} slots`
      );
      return true;
    } catch (error) {
      console.error(`❌ Error setting frame "${frameName}":`, error);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // Load frame dari localStorage (now async with IndexedDB fallback)
  async loadFrameFromStorage() {
    const storedFrame = safeStorage.getItem("selectedFrame");
    const storedConfig = safeStorage.getJSON("frameConfig");

    console.log("📁 Checking localStorage for frame data...");
    console.log("  - Stored frame ID:", storedFrame);
    console.log("  - Stored config exists:", !!storedConfig);
    console.log("  - Stored config ID:", storedConfig?.id);
    console.log("  - Is custom frame:", storedFrame?.startsWith("custom-"));

    // If we have a complete config in localStorage, use it
    if (storedConfig?.id && storedConfig?.designer?.elements) {
      try {
        const frameId = storedConfig.id;
        this.currentFrame = frameId;
        this.currentConfig = storedConfig;
        this.persistFrameSelection(frameId, storedConfig);
        console.log(`📁 Frame "${frameId}" loaded from cached config`);
        return true;
      } catch (error) {
        console.warn("⚠️ Cached config tidak valid, mencoba ulang...", error);
      }
    }

    // If custom frame but no config, try to load from IndexedDB draft
    if (isCustomFrameId(storedFrame)) {
      const activeDraftId = userStorage.getItem("activeDraftId");

      if (activeDraftId) {
        console.log(
          "🔄 Custom frame without config, loading from IndexedDB draft:",
          activeDraftId
        );

        try {
          const { default: draftStorage } = await import("./draftStorage.js");
          const draft = await draftStorage.getDraftById(activeDraftId);

          if (draft) {
            console.log(
              "✅ Draft found in IndexedDB, rebuilding frameConfig..."
            );

            const { buildFrameConfigFromDraft } = await import(
              "./draftHelpers.js"
            );
            const frameConfig = buildFrameConfigFromDraft(draft);

            this.currentFrame = frameConfig.id;
            this.currentConfig = frameConfig;
            this.persistFrameSelection(frameConfig.id, frameConfig);

            console.log("✅ Frame config rebuilt from IndexedDB draft:", {
              id: frameConfig.id,
              hasDesignerElements: !!frameConfig.designer?.elements,
              elementsCount: frameConfig.designer?.elements?.length,
            });

            return true;
          } else {
            console.warn("⚠️ Draft not found in IndexedDB:", activeDraftId);
          }
        } catch (error) {
          console.error("❌ Failed to load draft from IndexedDB:", error);
        }
      }
    }

    if (storedFrame) {
      try {
        if (isValidFrame(storedFrame)) {
          const success = await this.setFrame(storedFrame);
          if (success) {
            console.log(`📁 Frame "${storedFrame}" reloaded successfully`);
            return true;
          }
        } else if (isCustomFrameId(storedFrame)) {
          // For custom frames, try to use the cached config if available
          if (storedConfig?.id === storedFrame) {
            this.currentFrame = storedFrame;
            this.currentConfig = storedConfig;
            console.log(
              `📁 Custom frame "${storedFrame}" loaded from cached config`
            );
            return true;
          }
          console.warn(
            `⚠️ Custom frame "${storedFrame}" tidak memiliki konfigurasi tersimpan`
          );
        } else {
          console.warn(`⚠️ Stored frame "${storedFrame}" tidak valid lagi`);
        }
      } catch (error) {
        console.error("❌ Error loading frame from storage:", error);
      }
    }

    console.log("📁 No valid frame in storage, using default...");
    return await this.setFrame("Testframe1");
  }

  // Mendapatkan konfigurasi frame saat ini
  getCurrentConfig() {
    return this.currentConfig;
  }

  // Mendapatkan nama frame saat ini
  getCurrentFrameName() {
    return this.currentFrame;
  }

  // Mendapatkan maksimal capture untuk frame saat ini
  getMaxCaptures() {
    console.log("🔢 getMaxCaptures called");
    console.log("📊 currentConfig:", this.currentConfig);
    console.log(
      "🔢 returning maxCaptures:",
      this.currentConfig ? this.currentConfig.maxCaptures : 0
    );
    return this.currentConfig ? this.currentConfig.maxCaptures : 0;
  }

  // Mendapatkan slots untuk frame saat ini
  getSlots() {
    return this.currentConfig ? this.currentConfig.slots : [];
  }

  // Mendapatkan path image untuk frame saat ini
  getFrameImagePath() {
    return this.currentConfig ? this.currentConfig.imagePath : null;
  }

  // Membuat array kosong untuk slot photos
  createEmptySlotPhotos() {
    const maxCaptures = this.getMaxCaptures();
    return new Array(maxCaptures).fill(null);
  }

  // Validasi apakah masih bisa capture foto
  canCaptureMore(currentSlotPhotos) {
    console.log("🔍 canCaptureMore called");
    console.log("📊 currentConfig:", this.currentConfig);
    console.log("📸 currentSlotPhotos:", currentSlotPhotos);

    if (!this.currentConfig) {
      console.log("❌ No currentConfig, returning false");
      return false;
    }

    const filledSlots = currentSlotPhotos.filter(
      (photo) => photo !== null
    ).length;
    const maxCaptures = this.currentConfig.maxCaptures;
    const canCapture = filledSlots < maxCaptures;

    console.log(
      `📊 filledSlots: ${filledSlots}, maxCaptures: ${maxCaptures}, canCapture: ${canCapture}`
    );

    return canCapture;
  }

  // Mendapatkan index slot kosong berikutnya
  getNextEmptySlotIndex(currentSlotPhotos) {
    return currentSlotPhotos.findIndex((photo) => photo === null);
  }

  // Mendapatkan progress capture
  getCaptureProgress(currentSlotPhotos) {
    const filledSlots = currentSlotPhotos.filter(
      (photo) => photo !== null
    ).length;
    const maxCaptures = this.getMaxCaptures();

    return {
      current: filledSlots,
      max: maxCaptures,
      percentage: maxCaptures > 0 ? (filledSlots / maxCaptures) * 100 : 0,
      isComplete: filledSlots === maxCaptures,
    };
  }

  // Clear frame data
  clearFrame() {
    this.currentFrame = null;
    this.currentConfig = null;
    safeStorage.removeItem("selectedFrame");
    safeStorage.removeItem("frameConfig");
    userStorage.removeItem("activeDraftId");
    userStorage.removeItem("activeDraftSignature");
    console.log("🗑️ Frame data berhasil dihapus");
  }

  // Clear only in-memory state (currentFrame / currentConfig) without touching localStorage.
  // Call this before navigating to TakeMoment with a freshly-activated user-created frame
  // to prevent stale memory from a previous Frames-page selection taking priority.
  clearMemory() {
    this.currentFrame = null;
    this.currentConfig = null;
    console.log("🧹 [frameProvider] In-memory frame state cleared");
  }

  // Get all available frames metadata
  async getAllFrames() {
    return getAllFrames();
  }

  // Get frame metadata without loading full config
  getFrameMetadata(frameName) {
    return getFrameMetadata(frameName);
  }

  // Check if currently loading
  isFrameLoading() {
    return this.isLoading;
  }

  // Preload frame configurations for better performance
  async preloadFrames(frameNames) {
    console.log("🚀 Preloading frames for better performance...");
    return await preloadFrameConfigs(frameNames);
  }

  // Get frame image path with new structure
  getFrameImagePath() {
    return this.currentConfig ? this.currentConfig.imagePath : null;
  }

  persistFrameSelection(frameName, config) {
    try {
      const frameIdSaved = safeStorage.setItem("selectedFrame", frameName);

      // Add timestamp to detect stale frameConfig
      const configWithTimestamp = {
        ...config,
        __timestamp: Date.now(),
        __selectedAt: new Date().toISOString(),
      };

      // Check if it's a custom frame - either by isCustom flag OR prefix OR category
      const isCustomFrame = config.isCustom || 
                           frameName?.startsWith("custom-") || 
                           config.category === "custom";
      const isSharedFrame =
        config?.isSharedFrame ||
        Boolean(config?.shareId) ||
        frameName?.startsWith("shared-") ||
        frameName?.startsWith("share-");

      if (isSharedFrame) {
        const imageUrl = [
          config.imagePath,
          config.frameImage,
          config.thumbnailUrl,
          config.image_url,
        ].find((url) => typeof url === "string" && url && !url.startsWith("data:"));

        const lightweightSharedConfig = {
          id: config.id,
          name: config.name,
          title: config.title,
          aspectRatio: config.aspectRatio,
          maxCaptures: config.maxCaptures,
          slots: config.slots,
          canvasBackground: config.canvasBackground,
          canvasWidth: config.canvasWidth,
          canvasHeight: config.canvasHeight,
          isCustom: true,
          isSharedFrame: true,
          shareId: config.shareId,
          __timestamp: configWithTimestamp.__timestamp,
          __selectedAt: configWithTimestamp.__selectedAt,
          ...(imageUrl && {
            imagePath: imageUrl,
            frameImage: imageUrl,
            thumbnailUrl: imageUrl,
            image_url: imageUrl,
          }),
        };

        safeStorage.setJSON("frameConfig", lightweightSharedConfig);
        safeStorage.setItem(
          "frameConfigTimestamp",
          String(configWithTimestamp.__timestamp)
        );

        console.log(
          "✅ [persistFrameSelection] Shared frame persisted with lightweight storage payload"
        );
        return;
      }
      
      console.log("🔍 [persistFrameSelection] Checking frame type:");
      console.log("  - frameName:", frameName);
      console.log("  - config.isCustom:", config.isCustom);
      console.log("  - config.category:", config.category);
      console.log("  - isCustomFrame:", isCustomFrame);

      // For custom frames backed by a draftId, TakeMoment loads the full config from
      // IndexedDB directly. Skip all heavy localStorage write attempts to avoid the
      // cascading QuotaExceededError retry loops that slow down "Gunakan Frame".
      let configSaved = false;

      if (isCustomFrame) {
        const linkedDraftId = config?.metadata?.draftId || userStorage.getItem("activeDraftId");

        if (linkedDraftId) {
          // Lightweight reference only — full data lives in IndexedDB
          const lightweightRef = {
            id: config.id,
            name: config.name,
            isCustom: true,
            maxCaptures: config.maxCaptures,
            slots: config.slots,
            __timestamp: configWithTimestamp.__timestamp,
            __selectedAt: configWithTimestamp.__selectedAt,
            __draftId: linkedDraftId,
          };
          configSaved = safeStorage.setJSON("frameConfig", lightweightRef);
          console.log("✅ [persistFrameSelection] Custom frame: lightweight ref stored (full config in IndexedDB)");
        } else {
          // No draftId — try full config, then sanitized fallback
          try {
            configSaved = safeStorage.setJSON("frameConfig", configWithTimestamp);
            if (configSaved) {
              console.log("✅ [persistFrameSelection] Full custom frame config saved successfully");
            }
          } catch (error) {
            console.warn("⚠️ [persistFrameSelection] Full config too large:", error.message);
          }

          if (!configSaved) {
            const sanitizedConfig = sanitizeFrameConfigForStorage(configWithTimestamp);
            if (sanitizedConfig) {
              configSaved = safeStorage.setJSON("frameConfig", sanitizedConfig);
            }
          }
        }
      }

      // For non-custom frames that still need persisting
      if (!configSaved && !isCustomFrame) {
        console.log("💾 [persistFrameSelection] Saving sanitized frame config...");
        const sanitizedConfig = sanitizeFrameConfigForStorage(configWithTimestamp);
        if (sanitizedConfig) {
          configSaved = safeStorage.setJSON("frameConfig", sanitizedConfig);
        }
      }

      if (!frameIdSaved) {
        throw new Error("Failed to save frame ID to localStorage");
      }
      
      // For custom frames, we can proceed even without full config in storage
      // because the frame data is also in custom_frames storage
      if (!configSaved && !isCustomFrame) {
        throw new Error("Failed to persist frame selection");
      }
      
      if (!configSaved) {
        console.warn("⚠️ Config not fully saved, but proceeding since frame is in custom_frames storage");
      }

      // Save timestamp for validation
      safeStorage.setItem(
        "frameConfigTimestamp",
        String(configWithTimestamp.__timestamp)
      );

      if (config?.metadata?.draftId) {
        userStorage.setItem("activeDraftId", config.metadata.draftId);
      } else {
        userStorage.removeItem("activeDraftId");
      }

      if (config?.metadata?.signature) {
        userStorage.setItem("activeDraftSignature", config.metadata.signature);
      } else {
        userStorage.removeItem("activeDraftSignature");
      }

      console.log(
        "✅ Frame selection persisted with timestamp:",
        configWithTimestamp.__timestamp
      );
    } catch (error) {
      console.error("❌ Error persisting frame selection:", error);
      throw error; // Re-throw so setFrame can catch it
    }
  }

  // Legacy compatibility method
  getFrameConfigSync(frameName) {
    console.warn(
      "⚠️ getFrameConfigSync is deprecated. Use async methods instead."
    );
    return getFrameMetadata(frameName);
  }

  // Mendapatkan informasi frame untuk UI
  getFrameInfo() {
    if (!this.currentConfig) return null;

    return {
      name: this.currentConfig.name,
      description: this.currentConfig.description,
      maxCaptures: this.currentConfig.maxCaptures,
      slotsCount: this.currentConfig.slots.length,
      aspectRatio: this.currentConfig.layout.aspectRatio,
      orientation: this.currentConfig.layout.orientation,
    };
  }

  // Generate preview slots untuk UI
  generatePreviewSlots(slotPhotos) {
    const slots = this.getSlots();

    return slots.map((slot, index) => ({
      ...slot,
      index,
      hasPhoto: slotPhotos[index] !== null,
      photo: slotPhotos[index],
      isEmpty: slotPhotos[index] === null,
    }));
  }
}

// Export singleton instance
export const frameProvider = new FrameDataProvider();

// Export default
export default frameProvider;
