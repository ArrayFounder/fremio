import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSharedGroup } from "../services/groupService.js";
import unifiedFrameService from "../services/unifiedFrameService.js";
import defaultLogotype from "../assets/logotype.png";
import fremioCoffeeLogo from "../assets/fremio_coffee_logogram.png";

const TUTORIAL_STORAGE_PREFIX = "fremio-shares-tutorial-share:";
const SHARED_FRAME_KEY = "__fremio_shared_frame_temp__";
const MAX_INFO_COLUMNS = 3;
const DEFAULT_INFO_COLUMNS_COUNT = 2;
const DEFAULT_TITLE1_TEXT = "Nama Brand / Event Kamu";
const FIXED_INFO_BOX_MAX_WIDTH = 1248;
const DEFAULT_TUTORIAL_FRAME_BACKGROUND = "#f7f1ed";
const TUTORIAL_TEMPLATE_VERSION = "blank-v1";
const TUTORIAL_GROUP_NAME = "Tutorial Group";
const DEFAULT_TUTORIAL_FRAME_SLOTS = [
  { id: "slot_1", left: 0.05, top: 0.05, width: 0.42, height: 0.2, zIndex: 1, photoIndex: 0, aspectRatio: "4:5" },
  { id: "slot_2", left: 0.53, top: 0.05, width: 0.42, height: 0.2, zIndex: 1, photoIndex: 1, aspectRatio: "4:5" },
  { id: "slot_3", left: 0.05, top: 0.28, width: 0.42, height: 0.2, zIndex: 1, photoIndex: 2, aspectRatio: "4:5" },
  { id: "slot_4", left: 0.53, top: 0.28, width: 0.42, height: 0.2, zIndex: 1, photoIndex: 3, aspectRatio: "4:5" },
];
const TUTORIAL_FRAME_SPECS = [
  {
    id: "tutorial-frame-fremio-matcha",
    title: "Fremio Matcha",
    imagePath: "/uploads/frames/1c1db31d-c9d2-4bf3-9335-22b182b7f092.webp",
  },
  {
    id: "tutorial-frame-fremio-espresso",
    title: "Fremio Espresso",
    imagePath: "/uploads/frames/86837380-9c05-44b2-a646-ddbd7c8b3789.webp",
  },
  {
    id: "tutorial-frame-fremio-cappuccino",
    title: "Fremio Cappuccino",
    imagePath: "/uploads/frames/fbd46966-f1e8-4110-a1ea-69b7e9de43a2.webp",
  },
];

const findTutorialFrameSpec = (frameItem = {}) => {
  const frameTitle = frameItem?.title || frameItem?.name || null;
  return TUTORIAL_FRAME_SPECS.find(
    (spec) => spec.id === frameItem?.id || spec.title === frameTitle
  ) || null;
};

const normalizeTutorialFrameItem = (frameItem = {}) => {
  const spec = findTutorialFrameSpec(frameItem);
  if (!spec) return frameItem;

  const canonicalImagePath = resolveTutorialAssetUrl(spec.imagePath);
  if (!canonicalImagePath) return frameItem;

  return {
    ...frameItem,
    id: frameItem?.id || spec.id,
    title: frameItem?.title || spec.title,
    name: frameItem?.name || frameItem?.title || spec.title,
    imagePath: canonicalImagePath,
    frameImage: canonicalImagePath,
    preview: canonicalImagePath,
    thumbnail: canonicalImagePath,
    thumbnailUrl: canonicalImagePath,
  };
};

const isTutorialShareId = (value) => /^tutorial\d+$/i.test(String(value || ""));

const loadTutorialSharePayload = (shareId) => {
  if (!shareId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${TUTORIAL_STORAGE_PREFIX}${shareId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

<<<<<<< HEAD
=======
const cacheSharedFrameShareId = (shareId) => {
  if (!shareId || typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem("__fremio_share_id__", String(shareId));
    return true;
  } catch {
    return false;
  }
};

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
const normalizeTutorialFrameId = (value, fallbackTitle = "tutorial-frame") => {
  if (typeof value === "string" && value.trim()) return value;
  return String(fallbackTitle || "tutorial-frame")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tutorial-frame";
};

const normalizeTutorialFrameSlots = (slots) => {
  const source = Array.isArray(slots) && slots.length > 0 ? slots : DEFAULT_TUTORIAL_FRAME_SLOTS;
  return source.map((slot, index) => ({
    id: typeof slot?.id === "string" && slot.id.trim() ? slot.id : `slot_${index + 1}`,
    left: Number.isFinite(Number(slot?.left)) ? Number(slot.left) : DEFAULT_TUTORIAL_FRAME_SLOTS[index]?.left ?? 0,
    top: Number.isFinite(Number(slot?.top)) ? Number(slot.top) : DEFAULT_TUTORIAL_FRAME_SLOTS[index]?.top ?? 0,
    width: Number.isFinite(Number(slot?.width)) ? Number(slot.width) : DEFAULT_TUTORIAL_FRAME_SLOTS[index]?.width ?? 0.42,
    height: Number.isFinite(Number(slot?.height)) ? Number(slot.height) : DEFAULT_TUTORIAL_FRAME_SLOTS[index]?.height ?? 0.2,
    zIndex: Number.isFinite(Number(slot?.zIndex)) ? Number(slot.zIndex) : 1,
    photoIndex: Number.isFinite(Number(slot?.photoIndex)) ? Number(slot.photoIndex) : index,
    aspectRatio: typeof slot?.aspectRatio === "string" && slot.aspectRatio ? slot.aspectRatio : "4:5",
    rotation: Number.isFinite(Number(slot?.rotation)) ? Number(slot.rotation) : 0,
    borderRadius: Number.isFinite(Number(slot?.borderRadius)) ? Number(slot.borderRadius) : 0,
  }));
};

const buildTutorialFrameItemFromConfig = (frameConfig, frameSpec) => {
  if (!frameConfig || typeof frameConfig !== "object") return null;

  const imageUrl =
    frameConfig.frameImage ||
    frameConfig.imagePath ||
    frameConfig.thumbnailUrl ||
    frameConfig.image_url ||
    resolveTutorialAssetUrl(frameSpec?.imagePath);

  if (!imageUrl) return null;

  const slots = normalizeTutorialFrameSlots(frameConfig.slots);

  return normalizeTutorialFrameItem({
    id: frameConfig.id || frameSpec?.id,
    title: frameConfig.title || frameConfig.name || frameSpec?.title,
    name: frameConfig.name || frameConfig.title || frameSpec?.title,
    description:
      frameConfig.description ||
      "Contoh frame coffee shop untuk tutorial group shares.",
    thumbnail: imageUrl,
    thumbnailUrl: imageUrl,
    preview: imageUrl,
    imagePath: imageUrl,
    frameImage: imageUrl,
    slots,
    maxCaptures: Number.isFinite(Number(frameConfig.maxCaptures))
      ? Number(frameConfig.maxCaptures)
      : slots.length,
    canvasBackground:
      frameConfig.canvasBackground ||
      frameConfig.layout?.backgroundColor ||
      DEFAULT_TUTORIAL_FRAME_BACKGROUND,
    aspectRatio:
      frameConfig.layout?.aspectRatio ||
      frameConfig.designer?.aspectRatio ||
      frameConfig.aspectRatio ||
      "9:16",
    canvasWidth:
      Number.isFinite(Number(frameConfig.canvasWidth))
        ? Number(frameConfig.canvasWidth)
        : Number(frameConfig.designer?.canvasWidth) || 1080,
    canvasHeight:
      Number.isFinite(Number(frameConfig.canvasHeight))
        ? Number(frameConfig.canvasHeight)
        : Number(frameConfig.designer?.canvasHeight) || 1920,
  });
};

const buildFallbackTutorialFrameItem = (frameSpec) => {
  const imageUrl = resolveTutorialAssetUrl(frameSpec.imagePath);
  return normalizeTutorialFrameItem({
    id: frameSpec.id,
    title: frameSpec.title,
    description: "Contoh frame coffee shop untuk tutorial group shares.",
    thumbnail: imageUrl,
    thumbnailUrl: imageUrl,
    preview: imageUrl,
    imagePath: imageUrl,
    slots: DEFAULT_TUTORIAL_FRAME_SLOTS,
    maxCaptures: DEFAULT_TUTORIAL_FRAME_SLOTS.length,
    canvasBackground: DEFAULT_TUTORIAL_FRAME_BACKGROUND,
    aspectRatio: "9:16",
  });
};

const buildTutorialFrameConfig = (frameItem) => {
  const title = frameItem?.title || frameItem?.name || "Tutorial Frame";
  const frameId = normalizeTutorialFrameId(frameItem?.id, title);
  const imagePath = frameItem?.imagePath || frameItem?.preview || frameItem?.thumbnail || frameItem?.thumbnailUrl || null;
  if (!imagePath) return null;

  const canvasWidth = Number.isFinite(Number(frameItem?.canvasWidth)) ? Number(frameItem.canvasWidth) : 1080;
  const canvasHeight = Number.isFinite(Number(frameItem?.canvasHeight)) ? Number(frameItem.canvasHeight) : 1920;
  const slots = normalizeTutorialFrameSlots(frameItem?.slots);
  const designerElements = [
    {
      id: `${frameId}-background`,
      type: "background-photo",
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      zIndex: 0,
      data: {
        image: imagePath,
        objectFit: "cover",
        label: title,
      },
    },
    ...slots.map((slot, index) => ({
      id: slot.id,
      type: "photo",
      x: slot.left * canvasWidth,
      y: slot.top * canvasHeight,
      width: slot.width * canvasWidth,
      height: slot.height * canvasHeight,
      rotation: slot.rotation || 0,
      zIndex: slot.zIndex || 1,
      data: {
        photoIndex: Number.isFinite(slot.photoIndex) ? slot.photoIndex : index,
        image: null,
        aspectRatio: slot.aspectRatio || "4:5",
        borderRadius: slot.borderRadius || 0,
      },
    })),
  ];

  return {
    id: frameId,
<<<<<<< HEAD
=======
    shareId: frameShareId,
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    name: title,
    title,
    description: frameItem?.description || "",
    imagePath,
    frameImage: imagePath,
    thumbnailUrl: frameItem?.thumbnail || frameItem?.thumbnailUrl || imagePath,
    preview: frameItem?.preview || frameItem?.thumbnail || imagePath,
    maxCaptures: Number.isFinite(Number(frameItem?.maxCaptures)) ? Number(frameItem.maxCaptures) : slots.length,
    slots,
    canvasWidth,
    canvasHeight,
    designer: {
      elements: designerElements,
      canvasWidth,
      canvasHeight,
      canvasBackground: frameItem?.canvasBackground || DEFAULT_TUTORIAL_FRAME_BACKGROUND,
      aspectRatio: frameItem?.aspectRatio || "9:16",
    },
    layout: {
      aspectRatio: frameItem?.aspectRatio || "9:16",
      orientation: "portrait",
      backgroundColor: frameItem?.canvasBackground || DEFAULT_TUTORIAL_FRAME_BACKGROUND,
    },
    canvasBackground: frameItem?.canvasBackground || DEFAULT_TUTORIAL_FRAME_BACKGROUND,
    isCustom: true,
    isSharedFrame: true,
    isTutorialFrame: true,
  };
};

const persistTutorialFrameSession = (frameConfig) => {
  if (!frameConfig || typeof window === "undefined") return false;

  try {
    window.sessionStorage.removeItem("__fremio_share_id__");
<<<<<<< HEAD
=======
    window.sessionStorage.removeItem(SHARED_FRAME_KEY);
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    window.sessionStorage.setItem(
      SHARED_FRAME_KEY,
      JSON.stringify({
        frameConfig: {
          ...frameConfig,
          __timestamp: Date.now(),
          __savedFrom: "SharedGroup_tutorial",
        },
        draftData: {
          id: frameConfig.id,
          title: frameConfig.title || frameConfig.name || "Tutorial Frame",
          aspectRatio: frameConfig.layout?.aspectRatio || "9:16",
          elements: frameConfig.designer?.elements || [],
          canvasBackground: frameConfig.canvasBackground || DEFAULT_TUTORIAL_FRAME_BACKGROUND,
          canvasWidth: frameConfig.canvasWidth || 1080,
          canvasHeight: frameConfig.canvasHeight || 1920,
          preview: frameConfig.preview || frameConfig.thumbnailUrl || frameConfig.imagePath || null,
          isShared: true,
        },
      })
    );
    return true;
  } catch {
<<<<<<< HEAD
=======
    try {
      window.sessionStorage.removeItem(SHARED_FRAME_KEY);
    } catch {}
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
    return false;
  }
};

// Convert a normalized slot array (left/top/width/height as 0-1 fractions) to
// absolute-coordinate photo elements suitable for the frame config designer array.
const slotsToPhotoElements = (slots, cW, cH) =>
  slots.map((slot, idx) => ({
    id: String(slot.id || `slot_${idx + 1}`),
    type: "photo",
    x: (typeof slot.left === "number" ? slot.left : 0) * cW,
    y: (typeof slot.top === "number" ? slot.top : 0) * cH,
    width: (typeof slot.width === "number" ? slot.width : 0.5) * cW,
    height: (typeof slot.height === "number" ? slot.height : 0.5) * cH,
    zIndex: slot.zIndex || 2,
    rotation: slot.rotation || 0,
    data: {
      photoIndex: slot.photoIndex ?? idx,
      image: null,
      aspectRatio: slot.aspectRatio || "4:5",
      borderRadius: slot.borderRadius || 0,
    },
  }));

// Builds a frame config for a real (non-tutorial) group share frame from a fetched cloud draft.
// Uses the same shape that persistTutorialFrameSession + TakeMoment PRIORITY 0 expect.
// The function is ASYNC because it may need to search the frames catalog as a last resort.
const buildGroupFrameConfig = async (frameShareId, draft, parsedFrameData, frameItem) => {
  const canvasWidth = parsedFrameData?.canvasWidth || 1080;
  const canvasHeight = parsedFrameData?.canvasHeight || 1920;
  const canvasBackground = parsedFrameData?.canvasBackground || frameItem?.canvasBackground || DEFAULT_TUTORIAL_FRAME_BACKGROUND;
  const aspectRatio = parsedFrameData?.aspectRatio || "9:16";
  const allElements = Array.isArray(parsedFrameData?.elements) ? parsedFrameData.elements : [];
  const previewUrl = draft?.preview_url || frameItem?.thumbnail || null;
  const title = draft?.title || frameItem?.title || "Shared Frame";

  // ── FALLBACK CHAIN: get photo elements ────────────────────────────────────

  // 1. Photo elements from frame_data (fresh groups published after the Shares.jsx fix)
  let photoElements = allElements.filter((el) => el.type === "photo");

  // 2. Synthesize from frameItem.slots stored in the group DB record
  //    (groups re-published after our Shares.jsx fix, but cloud draft was stale)
  if (photoElements.length === 0 && Array.isArray(frameItem?.slots) && frameItem.slots.length > 0) {
    photoElements = slotsToPhotoElements(frameItem.slots, canvasWidth, canvasHeight);
  }

  // 3. LAST RESORT: search the frames catalog by title.
  //    For old "fixed" frames (e.g. "birthday girl pink"), `layout.elements` never carried
  //    photo slots — they lived in the separate `frame.slots` DB column. Old cloud drafts
  //    therefore have 0 photo-type elements. We look up the catalog frame by name to get
  //    the authoritative slot positions. This fixes existing published groups without
  //    requiring the operator to re-publish.
  if (photoElements.length === 0) {
    try {
      const catalogFrames = await unifiedFrameService.getAllFrames();
      if (Array.isArray(catalogFrames) && catalogFrames.length > 0) {
        const normalizedTitle = (title || "").toLowerCase().trim();
        const catalogFrame = catalogFrames.find(
          (f) => (f.name || "").toLowerCase().trim() === normalizedTitle
        );
        if (catalogFrame) {
          const cW = catalogFrame.canvasWidth || catalogFrame.canvas_width || canvasWidth;
          const cH = catalogFrame.canvasHeight || catalogFrame.canvas_height || canvasHeight;

          // Prefer the catalog's normalized slots array (0-1 fractions)
          if (Array.isArray(catalogFrame.slots) && catalogFrame.slots.length > 0) {
            photoElements = slotsToPhotoElements(catalogFrame.slots, cW, cH);
          } else {
            // Derive from layout.elements photo elements (designer-uploaded frames)
            const layoutEls = catalogFrame.layout?.elements || [];
            const catalogPhotoEls = layoutEls.filter((el) => el.type === "photo");
            if (catalogPhotoEls.length > 0) {
              photoElements = catalogPhotoEls;
            }
          }

          // Also pick up the frame's background image from the catalog if missing from cloud draft
          const hasBgInElements = allElements.some(
            (el) => el.type === "background-photo" || el.type === "image"
          );
          if (!hasBgInElements && photoElements.length > 0) {
            const catalogImageUrl =
              catalogFrame.imageUrl ||
              catalogFrame.imagePath ||
              catalogFrame.thumbnailUrl ||
              previewUrl;
            if (catalogImageUrl) {
              allElements.unshift({
                id: "background-photo-catalog",
                type: "background-photo",
                x: 0, y: 0,
                width: cW,
                height: cH,
                zIndex: 0,
                data: { image: catalogImageUrl, objectFit: "cover", label: title },
              });
            }
          }

          // Merge catalog's layout.elements (background + overlays) into allElements if they
          // are richer than what the cloud draft has (cloud draft only had decorative elements)
          if (catalogFrame.layout?.elements?.length > allElements.length) {
            const catalogDecorative = catalogFrame.layout.elements.filter(
              (el) => el.type !== "photo"
            );
            // Replace allElements with catalog's decorative elements (they include high-quality
            // background/overlay images from the original frame DB entry)
            allElements.length = 0;
            allElements.push(...catalogDecorative);
          }

          console.log(
            `\uD83D\uDD0D [SharedGroup] Recovered ${photoElements.length} slot(s) from catalog match: "${catalogFrame.name}"`
          );
        }
      }
    } catch (_) {
      // Non-fatal — proceed with whatever we have
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  const slots = photoElements.map((el, idx) => ({
    id: el.id || `slot_${idx + 1}`,
    left: el.x / canvasWidth,
    top: el.y / canvasHeight,
    width: el.width / canvasWidth,
    height: el.height / canvasHeight,
    zIndex: el.zIndex || 1,
    photoIndex: el.data?.photoIndex ?? idx,
    aspectRatio: el.data?.aspectRatio || "4:5",
    rotation: el.rotation || 0,
    borderRadius: el.data?.borderRadius || 0,
  }));

  // Build designer elements: all elements from frame_data (background/overlays/photo slots).
  // If no background-photo is present but we have a preview URL, synthesize one.
  let designerElements = [...allElements];
  const hasBgPhoto = designerElements.some((el) => el.type === "background-photo" || el.type === "image");
  if (!hasBgPhoto && previewUrl) {
    designerElements.unshift({
      id: "background-photo-1",
      type: "background-photo",
      x: 0, y: 0,
      width: canvasWidth,
      height: canvasHeight,
      zIndex: 0,
      data: { image: previewUrl, objectFit: "cover", label: title },
    });
  }
  // Append the photo slot elements if not already present
  const hasPhotoInElements = designerElements.some((el) => el.type === "photo");
  if (!hasPhotoInElements && photoElements.length > 0) {
    designerElements = [...designerElements, ...photoElements];
  }

  const frameId = `share-${frameShareId}`;
  return {
    id: frameId,
    name: title,
    title,
    description: frameItem?.description || "",
    imagePath: previewUrl,
    frameImage: previewUrl,
    thumbnailUrl: previewUrl,
    preview: previewUrl,
    maxCaptures: photoElements.length || 1,
    slots,
    canvasWidth,
    canvasHeight,
    designer: {
      elements: designerElements,
      canvasBackground,
      aspectRatio,
      canvasWidth,
      canvasHeight,
    },
    layout: {
      aspectRatio,
      orientation: "portrait",
      backgroundColor: canvasBackground,
    },
    canvasBackground,
    isCustom: true,
    isSharedFrame: true,
  };
};

const normalizeInfoColumns = (value) => {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: MAX_INFO_COLUMNS }, (_, index) => ({
    subtitle: typeof source[index]?.subtitle === "string" ? source[index].subtitle : "",
    text: typeof source[index]?.text === "string" ? source[index].text : "",
  }));
};

const getInfoColumnsCount = (preferences) => {
  const numeric = Number(preferences?.infoColumnsCount ?? DEFAULT_INFO_COLUMNS_COUNT);
  if (!Number.isFinite(numeric)) return DEFAULT_INFO_COLUMNS_COUNT;
  return Math.min(MAX_INFO_COLUMNS, Math.max(1, numeric));
};

const getFilledInfoColumns = (preferences) => normalizeInfoColumns(preferences?.infoColumns)
  .slice(0, getInfoColumnsCount(preferences))
  .filter((item) => item.subtitle.trim() || item.text.trim());

const resolveTutorialAssetUrl = (path) => {
  if (!path || typeof path !== "string") return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return path;
  return `/${path.replace(/^\/+/, "")}`;
};

const DEFAULT_TUTORIAL_INFO_COLUMNS = normalizeInfoColumns([
  {
    subtitle: "Filosofi Kami",
    text: "Setiap tegukan kopi adalah jeda. Kami hadir bukan sekadar menyajikan rasa, tapi menciptakan momen yang layak diabadikan.",
  },
  {
    subtitle: "Tentang Fremio Coffee",
    text: "Berawal dari kecintaan terhadap kopi nusantara, Fremio Coffee meracik setiap menu dengan bahan pilihan dan penuh perhatian — karena kopi terbaik lahir dari proses yang dihargai.",
  },
]);

const normalizeTutorialLogoSource = (preferences = {}) => {
  const logoDataUrl = typeof preferences?.logoDataUrl === "string"
    ? preferences.logoDataUrl.trim()
    : "";
  const logoFileName = typeof preferences?.logoFileName === "string"
    ? preferences.logoFileName.trim()
    : "";

  if (!logoDataUrl) {
    return null;
  }

  const isBundledTutorialLogo =
    logoFileName === "fremio_coffee_logogram.png" ||
    /fremio_coffee_logogram/i.test(logoDataUrl);

  return isBundledTutorialLogo ? fremioCoffeeLogo : logoDataUrl;
};

const buildTutorialPreferences = (overrides = {}) => {
  const merged = {
    tutorialTemplateVersion: TUTORIAL_TEMPLATE_VERSION,
    logoDataUrl: null,
    logoFileName: "",
    headerColor: "#ffffff",
    backgroundColor: "#ffffff",
    logoPosition: "center",
    logoWidth: 58,
    title1Text: "",
    title1Position: "center",
    title1FontFamily: "Inter",
    title1FontSize: 24,
    title1TextAlign: "center",
    title2Text: "",
    title2Position: "left",
    title2FontFamily: "Georgia",
    title2FontSize: 24,
    title2TextAlign: "left",
    infoSubtitleFontFamily: "Inter",
    infoSubtitleFontSize: 18,
    infoSubtitleTextAlign: "left",
    text: "",
    textPosition: "left",
    textFontFamily: "Inter",
    textFontSize: 14,
    textTextAlign: "left",
    infoColumnsCount: 0,
    infoColumns: [],
    infoBoxColor: "#ffffff",
    infoBoxOpacity: 100,
    infoBoxPaddingX: 28,
    infoBoxPaddingY: 20,
    infoBoxRadius: 24,
    takeMomentHeaderColor: "#ffffff",
    takeMomentBgColor: "#ffffff",
    editPhotoHeaderColor: "#ffffff",
    editPhotoBgColor: "#ffffff",
    shareId: null,
    shareSlug: null,
    qrDataUrl: "",
    ...overrides,
  };

  return {
    ...merged,
    logoDataUrl: normalizeTutorialLogoSource(merged),
    infoColumns: normalizeInfoColumns(merged.infoColumns),
  };
};

const migrateTutorialPreferences = (preferences = null) => {
  const current = preferences && typeof preferences === "object" ? preferences : {};
  if (current.tutorialTemplateVersion === TUTORIAL_TEMPLATE_VERSION) {
    return buildTutorialPreferences(current);
  }
  return buildTutorialPreferences();
};

const buildDefaultTutorialPayload = async (shareId) => {
  return {
    title: TUTORIAL_GROUP_NAME,
    frames: [],
    preferences: buildTutorialPreferences({
      shareId,
      shareSlug: shareId,
    }),
  };
};

function SharedFrameCard({ frame, onSelect, isLoading }) {
  const [expanded, setExpanded] = useState(false);
  const description = frame?.description || "";
  const maxLength = 50;
  const shouldTruncate = description.length > maxLength;
  const displayDescription = expanded ? description : description.slice(0, maxLength);

  const handleActivate = () => {
    if (isLoading) return;
    if (typeof onSelect === "function") onSelect();
  };

  return (
    <div
      className="frame-card"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: "8px",
        backgroundColor: "white",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        border: "2px solid transparent",
        cursor: isLoading ? "wait" : "pointer",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        position: "relative",
        opacity: isLoading ? 0.75 : 1,
      }}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onTouchEnd={(e) => {
        // Ensure taps trigger navigation on mobile.
        e.preventDefault();
        handleActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      onMouseEnter={(e) => {
        if (isLoading) return;
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.15)";
        e.currentTarget.style.borderColor = "#e0a899";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#f9fafb",
          aspectRatio: "9/16",
          width: "100%",
          padding: "12px",
          boxSizing: "border-box",
        }}
      >
        {frame?.thumbnail ? (
          <img
            src={frame.thumbnail}
            alt={frame?.title || "Frame"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: "4px",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
            }}
          >
            <span style={{ fontSize: "12px" }}>Gambar tidak tersedia</span>
          </div>
        )}
        {isLoading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.7)",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                border: "3px solid #e0a899",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
          </div>
        ) : null}
      </div>

      <div
        style={{
          padding: "8px 8px 4px 8px",
          textAlign: "center",
          fontSize: frame?.title && String(frame.title).length > 25 ? "10px" : "12px",
          fontWeight: 600,
          color: "#1e293b",
          lineHeight: "1.3",
          wordWrap: "break-word",
          overflowWrap: "break-word",
          hyphens: "auto",
          minHeight: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {frame?.title || "Frame"}
      </div>

      {description ? (
        <div
          style={{
            padding: "0 8px 8px 8px",
            textAlign: "center",
            fontSize: "10px",
            color: "#64748b",
            lineHeight: "1.4",
          }}
        >
          <span>
            {displayDescription}
            {shouldTruncate && !expanded && "..."}
          </span>
          {shouldTruncate ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              style={{
                display: "inline",
                marginLeft: "4px",
                padding: 0,
                border: "none",
                background: "none",
                color: "#c89585",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {expanded ? "Sembunyikan" : "Selengkapnya"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function SharedGroup() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);
  // Track which frame is currently being fetched (to show per-card spinner)
  const [loadingFrameId, setLoadingFrameId] = useState(null);

  const frames = useMemo(() => {
    return Array.isArray(group?.frames) ? group.frames : [];
  }, [group?.frames]);

  const preferences = useMemo(() => {
    const prefsRaw = group?.preferences;
    let parsed = null;
    if (prefsRaw && typeof prefsRaw === "object") {
      parsed = prefsRaw;
    } else if (typeof prefsRaw === "string") {
      try {
        parsed = JSON.parse(prefsRaw);
      } catch {
        parsed = null;
      }
    }
    return isTutorialShareId(shareId) ? migrateTutorialPreferences(parsed) : parsed;
  }, [group?.preferences, shareId]);

  const headerColor = preferences?.headerColor || "#ffffff";
  const backgroundColor = preferences?.backgroundColor || "#ffffff";
  const logoDataUrl = preferences?.logoDataUrl || null;
  const effectiveLogoSrc = logoDataUrl || defaultLogotype;
  const logoPosition = preferences?.logoPosition || "center";
  const logoWidth = Math.min(280, Math.max(80, Number(preferences?.logoWidth) || 220));
  const title1Text = preferences?.title1Text || "";
  const title1Position = preferences?.title1TextAlign || preferences?.title1Position || "center";
  const title1FontFamily = preferences?.title1FontFamily || "Inter";
  const title1FontSize = Math.min(72, Math.max(10, Number(preferences?.title1FontSize) || 22));
  const title1TextAlign = preferences?.title1TextAlign || "center";
  const title2Text = preferences?.title2Text || "";
  const title2Position = preferences?.title2TextAlign || preferences?.title2Position || "left";
  const title2FontFamily = preferences?.title2FontFamily || "Inter";
  const title2FontSize = Math.min(72, Math.max(10, Number(preferences?.title2FontSize) || 22));
  const title2TextAlign = preferences?.title2TextAlign || "left";
  const infoSubtitleFontFamily = preferences?.infoSubtitleFontFamily || title2FontFamily;
  const infoSubtitleFontSize = Math.min(72, Math.max(10, Number(preferences?.infoSubtitleFontSize) || Math.max(12, title2FontSize - 4)));
  const infoSubtitleTextAlign = preferences?.infoSubtitleTextAlign || preferences?.textTextAlign || title2TextAlign;
  const text = preferences?.text || "";
  const textPosition = preferences?.textTextAlign || preferences?.textPosition || "left";
  const textFontFamily = preferences?.textFontFamily || "Inter";
  const textFontSize = Math.min(72, Math.max(10, Number(preferences?.textFontSize) || 13));
  const textTextAlign = preferences?.textTextAlign || "left";
  const infoColumns = getFilledInfoColumns(preferences);
  const showMultiColumnInfo = getInfoColumnsCount(preferences) > 1 && infoColumns.length > 0;
  const parseNumberInRange = (value, fallback, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  };
  const hexToRgba = (hex, alphaPercent = 100) => {
    if (typeof hex !== "string") return hex;
    const normalized = hex.trim().replace("#", "");
    const alpha = parseNumberInRange(alphaPercent, 100, 0, 100) / 100;
    if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
      const [r, g, b] = normalized.split("").map((char) => parseInt(char + char, 16));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
  };
  const infoBoxColor = preferences?.infoBoxColor || "#ffffff";
  const infoBoxOpacity = parseNumberInRange(preferences?.infoBoxOpacity, 100, 0, 100);
  const infoBoxPaddingX = parseNumberInRange(preferences?.infoBoxPaddingX, 18, 0, 160);
  const infoBoxPaddingY = parseNumberInRange(preferences?.infoBoxPaddingY, 14, 0, 120);
  const infoBoxRadius = parseNumberInRange(preferences?.infoBoxRadius, 0, 0, 80);
  // Per-page branding (for TakeMoment + EditPhoto)
  const takeMomentHeaderColor = preferences?.takeMomentHeaderColor || null;
  const takeMomentBgColor = preferences?.takeMomentBgColor || null;
  const editPhotoHeaderColor = preferences?.editPhotoHeaderColor || null;
  const editPhotoBgColor = preferences?.editPhotoBgColor || null;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        if (isTutorialShareId(shareId)) {
          let tutorialPayload = loadTutorialSharePayload(shareId);
          if (!tutorialPayload) {
            tutorialPayload = await buildDefaultTutorialPayload(shareId);
            try {
              window.localStorage.setItem(
                `${TUTORIAL_STORAGE_PREFIX}${shareId}`,
                JSON.stringify(tutorialPayload)
              );
            } catch {
              // Ignore storage failures on public devices.
            }
          }

          if (cancelled) return;

          setGroup({
            title: tutorialPayload?.title || TUTORIAL_GROUP_NAME,
            frames: Array.isArray(tutorialPayload?.frames)
              ? tutorialPayload.frames.map((frame) => normalizeTutorialFrameItem(frame))
              : [],
            preferences: tutorialPayload?.preferences || null,
          });
          return;
        }
        const data = await getSharedGroup(shareId);
        if (cancelled) return;

        const framesRaw = data?.frames;
        const frames = Array.isArray(framesRaw)
          ? framesRaw
          : typeof framesRaw === "string"
          ? JSON.parse(framesRaw)
          : [];

        setGroup({
          title: data?.title || "Group Frames",
          frames,
          preferences: data?.preferences || null,
        });
      } catch (e) {
        if (!cancelled) setError(e?.message || "Group tidak ditemukan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (shareId) run();

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  if (loading) {
    return (
      <section
        style={{
          minHeight: "100vh",
          background: "linear-gradient(to bottom, #fdf7f4, white, #f7f1ed)",
          paddingTop: "48px",
          paddingBottom: "48px",
        }}
      >
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 16px" }}>
          <h2
            style={{
              marginBottom: "24px",
              textAlign: "center",
              fontSize: "24px",
              fontWeight: "bold",
              color: "#1e293b",
            }}
          >
            Memuat group...
          </h2>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        style={{
          minHeight: "100vh",
          background: "linear-gradient(to bottom, #fdf7f4, white, #f7f1ed)",
          paddingTop: "48px",
          paddingBottom: "48px",
        }}
      >
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 16px" }}>
          <h2
            style={{
              marginBottom: "12px",
              textAlign: "center",
              fontSize: "24px",
              fontWeight: "bold",
              color: "#1e293b",
            }}
          >
            Group Tidak Ditemukan
          </h2>
          <p style={{ textAlign: "center", color: "#64748b" }}>{error}</p>
        </div>
      </section>
    );
  }

  const pageTitle = title1Text || DEFAULT_TITLE1_TEXT;
  const isCoffeeTutorialTemplate = preferences?.tutorialTemplateVersion === TUTORIAL_TEMPLATE_VERSION;
  const getPlacement = (position) => {
    if (position === "left") return "flex-start";
    if (position === "right") return "flex-end";
    if (position === "justify") return "stretch";
    return "center";
  };

  const buildTextBlockStyle = (position, textAlign, fontFamily, fontSize, fontWeight, options = {}) => ({
    alignSelf: getPlacement(position),
    textAlign,
    fontFamily,
    fontSize: `${fontSize}px`,
    width: textAlign === "justify" ? "100%" : (options.insideBox ? "fit-content" : "min(92%, 640px)"),
    maxWidth: "100%",
    fontWeight,
  });

  const buildInfoBoxStyle = () => ({
    alignSelf: getPlacement(title2Text ? title2Position : textPosition),
    width: `min(100%, ${FIXED_INFO_BOX_MAX_WIDTH}px)`,
    maxWidth: "100%",
    background: hexToRgba(infoBoxColor, infoBoxOpacity),
    padding: `${infoBoxPaddingY}px ${infoBoxPaddingX}px`,
    borderRadius: `${infoBoxRadius}px`,
    border: isCoffeeTutorialTemplate ? "1px solid rgba(180, 132, 73, 0.18)" : "none",
    boxShadow: isCoffeeTutorialTemplate ? "0 4px 18px rgba(131, 94, 43, 0.08)" : "none",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  });

  const buildInfoColumnSubtitleStyle = () => ({
    width: "100%",
    color: "#1e293b",
    fontFamily: infoSubtitleFontFamily,
    fontSize: `${infoSubtitleFontSize}px`,
    fontWeight: 700,
    textAlign: infoSubtitleTextAlign,
    lineHeight: 1.35,
  });

  const buildInfoColumnTextStyle = () => ({
    width: "100%",
    color: "#475569",
    fontFamily: textFontFamily,
    fontSize: `${textFontSize}px`,
    fontWeight: 400,
    textAlign: textTextAlign,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: backgroundColor || "#ffffff" }}>
      <style>{`
        .frames-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          justify-items: center;
        }
        .frames-grid .frame-card {
          width: 100%;
          max-width: 220px;
        }
        .shared-group-info-columns {
          display: grid;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .frames-grid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 220px));
            gap: 20px;
            justify-content: center;
          }
          .frames-grid .frame-card {
            width: 220px;
            max-width: 220px;
          }
        }
        @media (max-width: 640px) {
          .shared-group-info-columns {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Custom branded header — no Fremio logo, no nav links */}
      <header
        style={{
          backgroundColor: headerColor || "#ffffff",
          borderBottom: "none",
          padding: "0 16px",
          height: isCoffeeTutorialTemplate ? "86px" : "72px",
          display: "flex",
          alignItems: "center",
          justifyContent: getPlacement(logoPosition),
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <img
          src={effectiveLogoSrc}
          alt="Logo"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = isCoffeeTutorialTemplate
              ? fremioCoffeeLogo
              : defaultLogotype;
          }}
          style={{
            maxHeight: isCoffeeTutorialTemplate ? "64px" : "56px",
            maxWidth: `${logoWidth}px`,
            width: `${logoWidth}px`,
            objectFit: "contain",
          }}
        />
      </header>

      <section
        style={{
          flex: 1,
          paddingTop: isCoffeeTutorialTemplate ? "22px" : "28px",
          paddingBottom: "48px",
        }}
      >
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 16px", display: "flex", flexDirection: "column" }}>
          <h2
            style={{
              margin: isCoffeeTutorialTemplate ? "0 0 18px 0" : "0 0 10px 0",
              ...buildTextBlockStyle(title1Position, title1TextAlign, title1FontFamily, title1FontSize, 900),
              color: "#1e293b",
              boxSizing: "border-box",
            }}
          >
            {pageTitle}
          </h2>

          <div className="frames-grid">
            {frames.map((frameItem, idx) => {
              const frameShareId = frameItem?.shareId || frameItem?.share_id;
              const tutorialFrameConfig = !frameShareId ? buildTutorialFrameConfig(frameItem) : null;
              const isThisFrameLoading = loadingFrameId === (frameShareId || frameItem?.id || idx);

              return (
                <SharedFrameCard
                  key={frameShareId || frameItem?.id || idx}
                  frame={{
                    title: frameItem?.title || `Frame ${idx + 1}`,
                    thumbnail: frameItem?.thumbnail || null,
                    description: frameItem?.description || "",
                  }}
                  isLoading={isThisFrameLoading}
                  onSelect={async () => {
                    if (loadingFrameId) return; // prevent double-tap

                    // Store group branding so TakeMoment / EditPhoto can apply it
                    try {
                      sessionStorage.setItem(
                        "__fremio_group_branding__",
                        JSON.stringify({
                          groupShareId: isTutorialShareId(shareId) ? null : shareId,
                          headerColor: headerColor || "#ffffff",
                          backgroundColor: backgroundColor || "#ffffff",
                          logoDataUrl: effectiveLogoSrc,
                          takeMomentHeaderColor: takeMomentHeaderColor,
                          takeMomentBgColor: takeMomentBgColor,
                          editPhotoHeaderColor: editPhotoHeaderColor,
                          editPhotoBgColor: editPhotoBgColor,
                          groupPath: window.location.pathname,
                        })
                      );
                    } catch (_) {
                      // sessionStorage unavailable — proceed without branding
                    }

                    // Tutorial frames: build config locally and persist to sessionStorage
                    if (!frameShareId) {
                      const stored = persistTutorialFrameSession(tutorialFrameConfig);
                      if (!stored) return;
                      window.location.assign(new URL("/take-moment", window.location.origin).toString());
                      return;
                    }

                    // Real group-share frames: fetch cloud draft, build full frame config,
                    // persist to sessionStorage — then navigate to /take-moment with NO
                    // ?share= param so TakeMoment reads PRIORITY 0 (sessionStorage), the
                    // same path that already works for tutorial frames.
                    const cardKey = frameShareId || frameItem?.id || idx;
                    setLoadingFrameId(cardKey);
                    try {
<<<<<<< HEAD
=======
                      cacheSharedFrameShareId(frameShareId);

>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
                      const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
                      const resp = await fetch(`${API_URL}/drafts/share/${encodeURIComponent(frameShareId)}`);
                      if (!resp.ok) throw new Error(`Frame tidak ditemukan (${resp.status})`);
                      const data = await resp.json();
                      const draft = data?.draft;

                      let parsedFrameData = null;
                      if (draft?.frame_data) {
                        try {
                          parsedFrameData = typeof draft.frame_data === "string"
                            ? JSON.parse(draft.frame_data)
                            : draft.frame_data;
                        } catch (_) {}
                      }

                      const frameConfig = await buildGroupFrameConfig(frameShareId, draft, parsedFrameData, frameItem);
                      const stored = persistTutorialFrameSession(frameConfig);
<<<<<<< HEAD
                      if (!stored) throw new Error("Gagal menyimpan frame ke sesi");

                      window.location.assign(new URL("/take-moment", window.location.origin).toString());
=======
                      if (stored) {
                        window.location.assign(new URL("/take-moment", window.location.origin).toString());
                        return;
                      }

                      try {
                        window.sessionStorage.removeItem(SHARED_FRAME_KEY);
                      } catch {}

                      const fallbackUrl = new URL("/take-moment", window.location.origin);
                      fallbackUrl.searchParams.set("share", String(frameShareId));
                      window.location.assign(fallbackUrl.toString());
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
                    } catch (err) {
                      console.error("[SharedGroup] Failed to load frame:", err);
                      setLoadingFrameId(null);
                      alert("Gagal memuat frame. " + (err?.message || "Silakan coba lagi."));
                    }
                  }}
                />
              );
            })}
          </div>

          {(title2Text || text || showMultiColumnInfo) ? (
            <div style={{ marginTop: isCoffeeTutorialTemplate ? "16px" : "18px", ...buildInfoBoxStyle() }}>
              {title2Text ? (
                <div
                  style={{
                    ...buildTextBlockStyle(title2Position, title2TextAlign, title2FontFamily, title2FontSize, 900, { insideBox: true }),
                    color: "#1e293b",
                  }}
                >
                  {title2Text}
                </div>
              ) : null}

              {showMultiColumnInfo ? (
                <div
                  className="shared-group-info-columns"
                  style={{
                    marginTop: title2Text ? "10px" : "0",
                    gridTemplateColumns: `repeat(${infoColumns.length}, minmax(0, 1fr))`,
                  }}
                >
                  {infoColumns.map((column, index) => (
                    <div
                      key={`shared-info-column-${index}`}
                      style={{
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {column.subtitle ? (
                        <div style={buildInfoColumnSubtitleStyle()}>{column.subtitle}</div>
                      ) : null}
                      {column.text ? (
                        <div style={buildInfoColumnTextStyle()}>{column.text}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : text ? (
                <div
                  style={{
                    marginTop: title2Text ? "8px" : "0",
                    ...buildTextBlockStyle(textPosition, textTextAlign, textFontFamily, textFontSize, 400, { insideBox: true }),
                    color: "#475569",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {text}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
