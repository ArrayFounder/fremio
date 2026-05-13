import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Share2, Check, Copy, Download, Trash2, X, ChevronLeft, Search, ExternalLink, BarChart3 } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import defaultLogotype from "../assets/logotype.png";
import fremioCoffeeLogo from "../assets/fremio_coffee_logogram.png";
import logoSalem from "../assets/logo-salem.png";
import draftStorage from "../utils/draftStorage.js";
import draftService from "../services/draftService.js";
import paymentService from "../services/paymentService";
import shareSubscriptionService from "../services/shareSubscriptionService";
import userStorage from "../utils/userStorage.js";
import unifiedFrameService from "../services/unifiedFrameService";
import { getUploadsBaseUrl } from "../config/backend";
import { EDITOR_FONT_FAMILIES } from "../config/editorFonts.js";
import membershipPlusLinkPage from "../assets/membership_plus_link_page.png";
import membershipPlusMockup from "../assets/membership_plus_mockup.png";
import membershipPlusTakephoto from "../assets/membership_plus_takephoto.png";
import membershipPlusQrcode from "../assets/membership_plus_qrcode.png";
import { splitDraftsByMembershipAccess } from "../utils/draftAccess.js";
import alignLeftIcon from "../assets/font/perataan_kiri.png";
import alignCenterIcon from "../assets/font/perataan_tengah.png";
import alignRightIcon from "../assets/font/perataan_kanan.png";
import alignJustifyIcon from "../assets/font/perataan_justify.png";
import fontTypeIcon from "../assets/font/font_type.png";
import {
  createDraftGroup,
  deleteDraftGroup,
  loadDraftGroups,
  saveDraftGroups,
  toggleDraftInGroup,
  updateDraftGroupPreferences,
} from "../utils/draftGroupStorage.js";
import {
  deleteMyShareLink,
  fetchGroupShareAnalytics,
  fetchGroupShareQuota,
} from "../services/groupService.js";
import { getStaticFrames } from "../data/staticFrames.js";
import "./Shares.css";

// ─── helpers ────────────────────────────────────────────────────────────────

const getFrameImageUrl = (frame) => {
  const candidates = [
    frame.imagePath,
    frame.imageUrl,
    frame.thumbnailUrl,
    frame.thumbnailPath,
    frame.image_path,
  ].filter(Boolean);
  if (candidates.length === 0) return null;
  const absolute = candidates.find(
    (v) => typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))
  );
  if (absolute) return absolute;
  const backendBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const raw = String(candidates[0] || "").trim();
  if (!raw) return null;
  if (raw.startsWith("uploads/")) return `${backendBase}/${raw}`;
  if (raw.startsWith("/")) return `${backendBase}${raw}`;
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(raw)) return `${backendBase}/uploads/frames/${raw}`;
  return `${backendBase}/${raw}`;
};

const HORIZONTAL_OPTIONS = [
  { value: "left", label: "Kiri" },
  { value: "center", label: "Tengah" },
  { value: "right", label: "Kanan" },
];

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Rata kiri", icon: alignLeftIcon },
  { value: "center", label: "Rata tengah", icon: alignCenterIcon },
  { value: "right", label: "Rata kanan", icon: alignRightIcon },
  { value: "justify", label: "Rata kanan kiri", icon: alignJustifyIcon },
];

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48, 56, 64, 72];
const GROUP_ANALYTICS_DAYS = 30;
const analyticsNumberFormatter = new Intl.NumberFormat("id-ID");

const formatAnalyticsDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getAnalyticsMonthKey = (value) => {
  if (!value) return "";
  return String(value).slice(0, 7);
};

const formatAnalyticsMonthLabel = (value) => {
  if (!value) return "-";
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(date);
};

const getAnalyticsDownloadCount = (item) => Number(item?.photoDownloads || 0) + Number(item?.videoDownloads || 0);

const getPlacement = (position) => {
  if (position === "left") return "flex-start";
  if (position === "right") return "flex-end";
  if (position === "justify") return "stretch";
  return "center";
};

const clampPositive = (value, fallback, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const clampRange = (value, fallback, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const hexToRgba = (hex, alphaPercent = 100) => {
  if (typeof hex !== "string") return hex;
  const normalized = hex.trim().replace("#", "");
  const alpha = clampRange(alphaPercent, 100, 0, 100) / 100;
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

const appendClassName = (props, className) => ({
  ...(props || {}),
  className: [props?.className, className].filter(Boolean).join(" "),
});

const getTextBlockWidth = (textAlign, options = {}) => {
  if (textAlign === "justify") return "100%";
  return options.insideBox ? "fit-content" : "min(92%, 520px)";
};

const getFrameTextPreviewStyle = (prefs, key, defaults, options = {}) => {
  const textAlign = prefs?.[`${key}TextAlign`] || defaults.textAlign;
  const placement = prefs?.[`${key}TextAlign`] || prefs?.[`${key}Position`] || defaults.textAlign || defaults.position;
  return {
    alignSelf: getPlacement(placement),
    textAlign,
    fontFamily: prefs?.[`${key}FontFamily`] || defaults.fontFamily,
    fontSize: `${clampPositive(prefs?.[`${key}FontSize`], defaults.fontSize, 10, 72)}px`,
    width: getTextBlockWidth(textAlign, options),
    maxWidth: "100%",
    lineHeight: key === "text" ? 1.55 : 1.25,
  };
};

const MAX_INFO_COLUMNS = 3;
const DEFAULT_INFO_COLUMNS_COUNT = 2;
const DEFAULT_TITLE1_TEXT = "Nama Brand / Event Kamu";
const FIXED_INFO_BOX_MAX_WIDTH = 1248;
const normalizeInfoColumns = (value) => {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: MAX_INFO_COLUMNS }, (_, index) => ({
    subtitle: typeof source[index]?.subtitle === "string" ? source[index].subtitle : "",
    text: typeof source[index]?.text === "string" ? source[index].text : "",
  }));
};

const getInfoColumnsCount = (prefs) => clampRange(prefs?.infoColumnsCount ?? DEFAULT_INFO_COLUMNS_COUNT, DEFAULT_INFO_COLUMNS_COUNT, 1, MAX_INFO_COLUMNS);

const hasInfoColumnsContent = (prefs) => normalizeInfoColumns(prefs?.infoColumns)
  .some((item) => item.subtitle.trim() || item.text.trim());

const getInfoColumnSubtitlePreviewStyle = (prefs) => ({
  width: "100%",
  fontFamily: prefs?.infoSubtitleFontFamily || prefs?.title2FontFamily || "Inter",
  fontSize: `${clampPositive(
    prefs?.infoSubtitleFontSize,
    Math.max(12, clampPositive(prefs?.title2FontSize, 22, 10, 72) - 4),
    10,
    72,
  )}px`,
  lineHeight: 1.35,
  textAlign: prefs?.infoSubtitleTextAlign || prefs?.textTextAlign || prefs?.title2TextAlign || "left",
});

const getInfoColumnTextPreviewStyle = (prefs) => ({
  width: "100%",
  fontFamily: prefs?.textFontFamily || "Inter",
  fontSize: `${clampPositive(prefs?.textFontSize, 13, 10, 72)}px`,
  lineHeight: 1.55,
  textAlign: prefs?.textTextAlign || "left",
});

const getInfoBoxPlacement = (prefs) => {
  if (prefs?.title2Text) return getPlacement(prefs?.title2TextAlign || prefs?.title2Position || "left");
  if (prefs?.text || hasInfoColumnsContent(prefs)) return getPlacement(prefs?.textTextAlign || prefs?.textPosition || "left");
  return "flex-start";
};

const getInfoBoxStyle = (prefs) => ({
  alignSelf: getInfoBoxPlacement(prefs),
  width: `min(100%, ${FIXED_INFO_BOX_MAX_WIDTH}px)`,
  maxWidth: "100%",
  background: hexToRgba(prefs?.infoBoxColor || "#ffffff", prefs?.infoBoxOpacity ?? 100),
  padding: `${clampRange(prefs?.infoBoxPaddingY, 14, 0, 120)}px ${clampRange(prefs?.infoBoxPaddingX, 18, 0, 160)}px`,
  borderRadius: `${clampRange(prefs?.infoBoxRadius, 0, 0, 80)}px`,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
});

const FRAME_PREVIEW_VIEWPORTS = {
  mobile: {
    width: 390,
    height: 760,
    screenWidth: 138,
  },
  desktop: {
    width: 1280,
    height: 720,
    screenWidth: 316,
  },
};

const FRAME_EDITOR_VIEWPORTS = {
  mobile: {
    width: 390,
    height: 760,
    screenWidth: 320,
  },
  desktop: {
    width: 1280,
    height: 720,
    screenWidth: 980,
  },
};

const getDefaultPreferenceDevice = () => {
  if (typeof window === "undefined") return "mobile";
  return window.matchMedia("(min-width: 768px)").matches ? "desktop" : "mobile";
};

const getIsTutorialMobileViewport = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
};

const FRAME_EDITOR_TARGETS = [
  {
    key: "page",
    label: "Halaman",
  },
  {
    key: "frames",
    label: "Frames",
  },
  {
    key: "logo",
    label: "Logo",
  },
  {
    key: "title1",
    label: "Judul 1",
  },
  {
    key: "title2",
    label: "Judul",
  },
  {
    key: "infoSubtitle",
    label: "Sub Judul",
  },
  {
    key: "text",
    label: "Teks",
  },
  {
    key: "infoBox",
    label: "Wadah Bawah",
  },
];

const PREVIEW_EDITOR_PAGES = [
  { key: "frames", icon: "🖼️", tabLabel: "Frames Page", shortLabel: "Frames", deviceLabel: "Frames" },
  { key: "takemoment", icon: "📸", tabLabel: "Take Moment", shortLabel: "Take Moment", deviceLabel: "Take Moment" },
  { key: "editphoto", icon: "✏️", tabLabel: "Edit Photo", shortLabel: "Edit Photo", deviceLabel: "Edit Photo" },
];

const TUTORIAL_GROUP_ID = "tutorial-group";
const TUTORIAL_GROUP_STORAGE_KEY = "fremio-tutorial-group-state";
const TUTORIAL_STORAGE_PREFIX = "fremio-shares-tutorial-share:";
const TUTORIAL_SEEN_STORAGE_KEY = "fremio-shares-tutorial-seen-v1";
const TUTORIAL_SHARE_COUNT_STORAGE_KEY = "fremio-shares-tutorial-share-count";
const TUTORIAL_GROUP_NAME = "Tutorial Group Shares";
const TUTORIAL_TEMPLATE_VERSION = "blank-v1";

const saveTutorialGroupToStorage = (group) => {
  if (typeof window === "undefined" || !group) return;
  try { window.localStorage.setItem(TUTORIAL_GROUP_STORAGE_KEY, JSON.stringify(group)); } catch {}
};

const loadTutorialGroupFromStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TUTORIAL_GROUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const TUTORIAL_BRAND_HEADER_COLOR = "#b68449";
const TUTORIAL_BRAND_BACKGROUND_COLOR = "#f9edcf";
const TUTORIAL_BRAND_TEXT_COLOR = "#1e293b";
const TUTORIAL_FRAME_SPECS = [
  {
    name: "Fremio Matcha",
    frameId: "frame_1775911140712_ijhwqk63w",
    imagePath: "/uploads/frames/1c1db31d-c9d2-4bf3-9335-22b182b7f092.webp",
  },
  {
    name: "Fremio Espresso",
    frameId: "frame_1775911093937_xum2xua3h",
    imagePath: "/uploads/frames/86837380-9c05-44b2-a646-ddbd7c8b3789.webp",
  },
  {
    name: "Fremio Cappuccino",
    frameId: "frame_1775911023622_88z7t9t1k",
    imagePath: "/uploads/frames/fbd46966-f1e8-4110-a1ea-69b7e9de43a2.webp",
  },
];

const TUTORIAL_FRAME_NAMES = TUTORIAL_FRAME_SPECS.map((frame) => frame.name);

const buildTutorialFrameId = (name = "tutorial-frame") => `tutorial-frame-${String(name)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")}`;

const resolveTutorialFrameMediaUrl = (pathOrUrl) => {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  if (pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")) return pathOrUrl;
  if (pathOrUrl.startsWith("/uploads/")) return `${getUploadsBaseUrl()}${pathOrUrl}`;
  return pathOrUrl;
};

const buildTutorialFrameList = (frameSource = []) => {
  const staticFrames = getStaticFrames();
  return TUTORIAL_FRAME_SPECS.map(({ name, frameId, imagePath: fallbackImagePath }) => {
    const matched = frameSource.find((frame) => frame?.name === name || String(frame?.id || "") === frameId)
      || staticFrames.find((frame) => frame?.name === name);
    const fallbackImageUrl = resolveTutorialFrameMediaUrl(fallbackImagePath);
    const thumbnailUrl = matched?.thumbnailUrl
      || matched?.imageUrl
      || matched?.imagePath
      || matched?.frameImage
      || fallbackImageUrl;
    const previewUrl = matched?.imageUrl
      || matched?.imagePath
      || matched?.thumbnailUrl
      || matched?.frameImage
      || fallbackImageUrl;
    const imageUrl = matched?.imagePath
      || matched?.imageUrl
      || matched?.thumbnailUrl
      || matched?.frameImage
      || fallbackImageUrl;
    return {
      id: buildTutorialFrameId(name),
      cloudId: matched?.id || frameId || null,
      title: name,
      thumbnail: thumbnailUrl,
      thumbnailUrl,
      preview: previewUrl,
      imagePath: imageUrl,
      slots: Array.isArray(matched?.slots) ? matched.slots : undefined,
      maxCaptures: matched?.maxCaptures || matched?.max_captures,
      description: "Contoh frame coffee shop untuk tutorial group shares.",
      isTutorialFrame: true,
    };
  });
};

const DEFAULT_TUTORIAL_FRAMES = buildTutorialFrameList();

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
    return fremioCoffeeLogo;
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
    infoBoxWidth: 420,
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
    tutorialShareRunId: null,
    ...overrides,
  };

  return {
    ...merged,
    logoDataUrl: merged.logoDataUrl || null,
    infoColumns: normalizeInfoColumns(merged.infoColumns),
  };
};

const migrateTutorialPreferences = (preferences = null) => {
  const current = preferences && typeof preferences === "object" ? preferences : {};
  if (current.tutorialTemplateVersion === TUTORIAL_TEMPLATE_VERSION) {
    return buildTutorialPreferences(current);
  }
  return buildTutorialPreferences({
    shareId: null,
    shareSlug: null,
    qrDataUrl: "",
    tutorialShareRunId: null,
  });
};

const buildTutorialGroup = (overrides = {}) => {
  // Tutorial group starts empty — no pre-filled frames.
  // Users add their own frames from the preferences editor.
  const draftIds = Array.isArray(overrides?.draftIds) ? overrides.draftIds : [];

  return {
    ...overrides,
    id: TUTORIAL_GROUP_ID,
    name: TUTORIAL_GROUP_NAME,
    draftIds,
    preferences: migrateTutorialPreferences(overrides?.preferences),
    createdAt: overrides?.createdAt || new Date().toISOString(),
    updatedAt: overrides?.updatedAt || new Date().toISOString(),
  };
};

const mergeGroupsWithTutorial = (groupList = [], tutorialGroup = null) => {
  const safeGroups = Array.isArray(groupList) ? groupList.filter(Boolean) : [];
  const preservedTutorial = buildTutorialGroup(
    safeGroups.find((group) => group?.id === TUTORIAL_GROUP_ID) || tutorialGroup || {}
  );
  const nonTutorialGroups = safeGroups.filter((group) => group?.id !== TUTORIAL_GROUP_ID);
  return [preservedTutorial, ...nonTutorialGroups];
};

const isTutorialShareId = (value) => /^tutorial\d+$/i.test(String(value || ""));

const saveTutorialSharePayload = (shareId, payload) => {
  if (!shareId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${TUTORIAL_STORAGE_PREFIX}${shareId}`, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

const loadTutorialSharePayload = (shareId) => {
  if (!shareId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${TUTORIAL_STORAGE_PREFIX}${shareId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getNextTutorialShareId = () => {
  if (typeof window === "undefined") return "tutorial1";
  try {
    const currentCount = Number(window.localStorage.getItem(TUTORIAL_SHARE_COUNT_STORAGE_KEY) || "0");
    const nextCount = Number.isFinite(currentCount) ? currentCount + 1 : 1;
    window.localStorage.setItem(TUTORIAL_SHARE_COUNT_STORAGE_KEY, String(nextCount));
    return `tutorial${nextCount}`;
  } catch {
    return `tutorial${Date.now()}`;
  }
};

const BASIC_PAGE_EDITOR_TARGETS = {
  takemoment: [
    {
      key: "page",
      label: "Halaman",
    },
    {
      key: "logo",
      label: "Logo",
    },
  ],
  editphoto: [
    {
      key: "page",
      label: "Halaman",
    },
    {
      key: "logo",
      label: "Logo",
    },
  ],
};

// ─── main component ──────────────────────────────────────────────────────────

export default function Shares() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isGuestTutorialMode = !user?.email;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isStandaloneEditorMode = searchParams.get("editor") === "1";
  const requestedStandaloneGroupId = searchParams.get("group") || null;
  const requestedStandalonePage = PREVIEW_EDITOR_PAGES.some((item) => item.key === searchParams.get("page"))
    ? searchParams.get("page")
    : null;
  const requestedStandaloneDevice = searchParams.get("device") === "desktop"
    ? "desktop"
    : searchParams.get("device") === "mobile"
      ? "mobile"
      : null;

  // ── local drafts state ──
  const [drafts, setDrafts] = useState([]);
  const [cloudDrafts, setCloudDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const isMountedRef = useRef(true);

  // ── groups state ──
  const [groups, setGroups] = useState(() => [buildTutorialGroup(loadTutorialGroupFromStorage() || {})]);
  const [activeGroupId, setActiveGroupId] = useState(null); // null = no group selected
  const [groupViewMode, setGroupViewMode] = useState("preferences"); // "preferences" | "analytics"
  const [prefPage, setPrefPage] = useState("frames"); // "frames" | "takemoment" | "editphoto"
  const [prefDevice, setPrefDevice] = useState(() => getDefaultPreferenceDevice()); // "mobile" | "desktop"
  const [framesEditorSelection, setFramesEditorSelection] = useState(null);
  const [framesEditorFocusSection, setFramesEditorFocusSection] = useState(null);
  const [framesEditorFocusField, setFramesEditorFocusField] = useState(null);
  const [inlinePreviewEditingField, setInlinePreviewEditingField] = useState(null);
  const [framesEditorPopoverPosition, setFramesEditorPopoverPosition] = useState(null);
  const [isDraggingFramesEditorPopover, setIsDraggingFramesEditorPopover] = useState(false);
  const [showFramesEditorModal, setShowFramesEditorModal] = useState(false);
  // Ref to always hold the latest location.search without making it a reactive dep
  const locationSearchRef = useRef(location.search);
  locationSearchRef.current = location.search;

  const framesEditorPopoverRef = useRef(null);
  const framesEditorPopoverDragRef = useRef(null);
  const framesEditorSectionRefs = useRef({});
  const framesEditorFieldRefs = useRef({});
  const inlinePreviewFieldRefs = useRef({});
  const fontPickerAnchorRefs = useRef({});
  const fontSizePickerAnchorRefs = useRef({});

  // ── slug editing ──
  const [slugInput, setSlugInput] = useState("");
  const [shareSlugError, setShareSlugError] = useState("");
  const [isSavingSlug, setIsSavingSlug] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // ── share modal ──
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareDraftTitle, setShareDraftTitle] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [unsyncedSharedGroupIds, setUnsyncedSharedGroupIds] = useState(() => new Set());
  const [groupAnalytics, setGroupAnalytics] = useState(null);
  const [isLoadingGroupAnalytics, setIsLoadingGroupAnalytics] = useState(false);
  const [groupAnalyticsError, setGroupAnalyticsError] = useState("");
  const [groupAnalyticsReloadKey, setGroupAnalyticsReloadKey] = useState(0);
  const [selectedAnalyticsMonth, setSelectedAnalyticsMonth] = useState("");
  const [shareQuota, setShareQuota] = useState(null);
  const [isLoadingShareQuota, setIsLoadingShareQuota] = useState(false);
  const [shareQuotaError, setShareQuotaError] = useState("");
  const [shareQuotaReloadKey, setShareQuotaReloadKey] = useState(0);
  const [fontSizeDrafts, setFontSizeDrafts] = useState({});
  const [openFontPickerKey, setOpenFontPickerKey] = useState(null);
  const [openFontSizePickerKey, setOpenFontSizePickerKey] = useState(null);
  const [showShareEntryPromoModal, setShowShareEntryPromoModal] = useState(false);
  const [shareEntryPromoLightboxImg, setShareEntryPromoLightboxImg] = useState(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // ── "Add Frame to Group" modal: browse ALL frames (like /frames page) ──
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [allFrames, setAllFrames] = useState([]);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [framePickerSearch, setFramePickerSearch] = useState("");
  const [framePickerSource, setFramePickerSource] = useState("fremio"); // 'fremio' | 'draft'
  const [framePickerIntent, setFramePickerIntent] = useState({ type: "add", replaceDraftId: null });
  const [hasAccess, setHasAccess] = useState(false);
  const [accessibleFrameIds, setAccessibleFrameIds] = useState([]);

  // ── confirm dialog ──
  const [confirmDialog, setConfirmDialog] = useState(null); // { type: 'group', id, title }

  // ── expanded descriptions ──
  const [expandedDescriptions, setExpandedDescriptions] = useState(() => new Set());
  const [tutorialFrames, setTutorialFrames] = useState(() => DEFAULT_TUTORIAL_FRAMES);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const [tutorialRunId, setTutorialRunId] = useState(0);
  const [tutorialLinkOpened, setTutorialLinkOpened] = useState(false);
  const [isTutorialMobileViewport, setIsTutorialMobileViewport] = useState(() => getIsTutorialMobileViewport());
  const [tutorialCardInlineStyle, setTutorialCardInlineStyle] = useState(undefined);
  const tutorialTargetRefs = useRef({});
  const tutorialCardRef = useRef(null);

  const tutorialSteps = useMemo(() => ([
    {
      key: "create-group",
      target: "createGroupButton",
      title: "1. Tambahkan Group",
      body: "Mulai dari tombol ini untuk membuat group baru. Di mode tutorial, kami sudah siapkan 1 group contoh supaya kamu bisa langsung melihat hasilnya.",
      mobileBody: "Mulai dari sini. Group contoh sudah disiapkan.",
    },
    {
      key: "frames",
      target: "preferencesTabButton",
      title: "2. Tambahkan Frames",
      body: "Sekarang pengelolaan frame ada di Preferences. Buka tab itu untuk mengganti, menambah, atau menghapus frame langsung dari preview interaktif.",
      mobileBody: "Kelola frame dari Preferences. Demo ini sudah berisi 3 contoh.",
    },
    {
      key: "frame-sources",
      target: "framePickerSources",
      title: "2. Pilih Sumber Frame",
      body: "Saat menambah frame, kamu bisa mulai dari koleksi Fremio di tab Bisa Dikustom atau Siap Pakai untuk memilih frame yang sudah tersedia.",
      mobileBody: "Pilih frame dari koleksi Fremio di tab yang tersedia.",
    },
    {
      key: "frame-draft-source",
      target: "framePickerDraftSource",
      title: "2. Pilih dari Draft",
      body: "Kalau kamu sudah pernah bikin frame sendiri, klik tab Draft di sini untuk menambahkan frame buatanmu ke group share.",
      mobileBody: "Pilih tab Draft untuk memakai frame buatanmu.",
    },
    {
      key: "preferences-tab",
      target: "preferencesTabButton",
      title: "3. Buka Preferences",
      body: "Masuk ke Preferences untuk mengatur tampilan halaman share-mu sebelum dibagikan ke pelanggan.",
      mobileBody: "Buka Preferences untuk atur tampilan halaman share.",
    },
    {
      key: "edit-preview",
      target: "editPreviewButton",
      title: "3. Edit Preview",
      body: "Klik Edit untuk membuka preview interaktif. Dari sini kamu bisa ubah tampilan halaman dengan cara yang paling cepat.",
      mobileBody: "Klik Edit untuk buka preview interaktif.",
    },
    {
      key: "preview-stage",
      target: "previewStage",
      title: "3. Ubah Isi Langsung Dari Preview",
      body: "Area preview ini interaktif. Setiap elemen penting bisa diklik untuk membuka properties tanpa harus mencari manual di panel kanan.",
      mobileBody: "Klik elemen di preview untuk edit lebih cepat.",
    },
    {
      key: "preview-logo",
      target: "previewLogo",
      title: "3. Atur Logo",
      body: "Klik area logo untuk mengganti logo owner, posisi logo, dan ukurannya. Perubahan akan langsung terlihat di preview.",
      mobileBody: "Klik logo untuk ganti file, posisi, dan ukuran.",
    },
    {
      key: "preview-header",
      target: "previewHeader",
      title: "3. Atur Header",
      body: "Bagian header ini bisa dipilih untuk mengubah warna header halaman share. Ini berguna supaya brand di bagian atas konsisten.",
      mobileBody: "Klik header untuk ubah warna bagian atas.",
    },
    {
      key: "preview-background",
      target: "previewBackground",
      title: "3. Atur Background",
      body: "Klik area background halaman untuk mengubah warna latar seluruh page. Gunakan ini untuk menyamakan nuansa halaman dengan branding-mu.",
      mobileBody: "Klik background untuk ubah warna halaman.",
    },
    {
      key: "preview-text",
      target: "previewText",
      title: "3. Atur Teks",
      body: "Judul, sub judul, dan teks deskripsi bisa diklik langsung dari preview. Dari sini kamu bisa ubah isi, font, ukuran, dan perataannya.",
      mobileBody: "Klik teks untuk ubah isi, font, ukuran, dan align.",
    },
    {
      key: "preview-info-box",
      target: "previewInfoBox",
      title: "3. Atur Wadah",
      body: "Klik wadah bawah ini untuk mengatur warna, transparansi, padding, roundness, dan layout isi kolomnya.",
      mobileBody: "Klik wadah ini untuk atur warna, padding, radius, dan layout.",
    },
    {
      key: "page-device-controls",
      target: "editorControls",
      title: "3. Cek Mobile, Desktop, dan Tiap Page",
      body: "Pindah antara Mobile dan Desktop, lalu cek tab Frames, Take Moment, dan Edit Photo supaya tampilan semua halaman konsisten.",
      mobileBody: "Cek tampilan Mobile, Desktop, dan tiap page.",
    },
    {
      key: "share-button",
      target: "shareButton",
      title: "4. Buat Link Share",
      body: "Setelah siap, klik Share. Di tutorial ini link demo akan dibuat otomatis memakai format tutorial1, tutorial2, dan seterusnya agar mudah dicek progresnya.",
      mobileBody: "Kalau sudah siap, klik Share untuk buat link.",
    },
    {
      key: "share-modal",
      target: "shareModal",
      title: "4. Bagikan Link dan QR",
      body: "Link dan QR code langsung terbentuk. Salin link ini atau tunjukkan QR code ke pelanggan untuk membuka halaman group share.",
      mobileBody: "Link dan QR siap dibagikan ke pelanggan.",
    },
    {
      key: "open-page",
      target: "shareOpenLink",
      title: "5. Buka Halaman Link",
      body: "Terakhir, buka halaman link untuk melihat hasil akhir yang akan diterima pelanggan. Kamu bisa ulang tutorial kapan saja lewat tombol Tutorial.",
      mobileBody: "Buka halaman hasil akhir yang akan dilihat pelanggan.",
      ctaLabel: "Buka Halaman",
    },
  ]), []);

  const tutorialStep = tutorialSteps[tutorialStepIndex] || null;
  const isTutorialTargetActive = useCallback(
    (targetKey) => showTutorial && tutorialStep?.target === targetKey,
    [showTutorial, tutorialStep?.target]
  );
  const isPreviewTutorialStep = Boolean(
    showTutorial && [
      "preview-stage",
      "preview-logo",
      "preview-header",
      "preview-background",
      "preview-text",
      "preview-info-box",
      "page-device-controls",
    ].includes(tutorialStep?.key)
  );
  const isShareTutorialStep = Boolean(
    showTutorial && ["share-modal", "open-page"].includes(tutorialStep?.key)
  );
  const isFramePickerTutorialStep = Boolean(
    showTutorial && ["frame-sources", "frame-draft-source"].includes(tutorialStep?.key)
  );

  // ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Sync user to storage
  useEffect(() => {
    if (user?.email) {
      try {
        const payload = JSON.stringify(user);
        localStorage.setItem("fremio_user", payload);
        sessionStorage.setItem("fremio_user_cache", payload);
      } catch (_) {}
    }
  }, [user?.email]);

  // Auto-persist tutorial group whenever it changes
  useEffect(() => {
    const tutorialGroup = groups.find((g) => g?.id === TUTORIAL_GROUP_ID);
    if (tutorialGroup) saveTutorialGroupToStorage(tutorialGroup);
  }, [groups]);

  // Load groups
  useEffect(() => {
    if (!user?.email) {
      setGroups((current) => {
        const currentTutorial = current.find((group) => group?.id === TUTORIAL_GROUP_ID) || null;
        return mergeGroupsWithTutorial([], currentTutorial);
      });
      setActiveGroupId(TUTORIAL_GROUP_ID);
      setGroupViewMode("preferences");
      return;
    }
    setGroups((current) => {
      const currentTutorial = current.find((group) => group?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(loadDraftGroups(user.email), currentTutorial);
    });
    setActiveGroupId(TUTORIAL_GROUP_ID);
    setGroupViewMode("preferences");
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;

    const loadTutorialFrames = async () => {
      try {
        const frames = await unifiedFrameService.getAllFrames();
        const tutorialFrameSource = Array.isArray(frames) ? [...frames] : [];

        const missingFrameSpecs = TUTORIAL_FRAME_SPECS.filter(({ name, frameId }) => {
          const matched = tutorialFrameSource.find((frame) => frame?.name === name || String(frame?.id || "") === frameId);
          return !(matched?.thumbnailUrl || matched?.imageUrl || matched?.imagePath || matched?.frameImage);
        });

        if (!cancelled && missingFrameSpecs.length > 0) {
          const hiddenFrameConfigs = await Promise.all(
            missingFrameSpecs.map(async ({ frameId }) => {
              try {
                return await unifiedFrameService.getFrameConfig(frameId);
              } catch {
                return null;
              }
            })
          );

          tutorialFrameSource.push(...hiddenFrameConfigs.filter(Boolean));
        }

        if (cancelled || tutorialFrameSource.length === 0) return;

        const eventTutorialFrames = buildTutorialFrameList(tutorialFrameSource);
        if (eventTutorialFrames.some((frame) => frame.thumbnail || frame.preview || frame.imagePath)) {
          setTutorialFrames(eventTutorialFrames);
        }
      } catch (_) {
        // keep fallback tutorial frames
      }
    };

    void loadTutorialFrames();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync slugInput with active group
  const activeGroup = useMemo(
    () => groups.find((g) => g?.id === activeGroupId) || null,
    [groups, activeGroupId]
  );
  const isTutorialGroupActive = activeGroup?.id === TUTORIAL_GROUP_ID;
  const activeGroupShareId = activeGroup?.preferences?.shareId || null;
  const activeGroupShareLink = useMemo(() => {
    if (!activeGroupShareId || typeof window === "undefined") return "";
    return `${window.location.origin}/share/${activeGroupShareId}`;
  }, [activeGroupShareId]);
  const shareModalLocked = Boolean(
    activeGroupShareId
    || isTutorialShareId(slugInput || activeGroup?.preferences?.shareId || "")
  );
  const shareModalDisplayId = slugInput || activeGroup?.preferences?.shareId || activeGroupShareId || "";
  const activeGroupNeedsSync = Boolean(activeGroup?.id && unsyncedSharedGroupIds.has(activeGroup.id));
  const framesEditorActive = showFramesEditorModal || isStandaloneEditorMode;

  const openStandaloneFramesEditorTab = useCallback((page = prefPage, groupId = null) => {
    const targetGroupId = groupId || activeGroup?.id;
    if (!targetGroupId || typeof window === "undefined") return;

    const params = new URLSearchParams();
    params.set("editor", "1");
    params.set("group", targetGroupId);
    params.set("page", page);
    params.set("device", prefDevice);

    const nextUrl = `${window.location.origin}${location.pathname}?${params.toString()}`;
    window.open(nextUrl, "_blank", "noopener,noreferrer");
  }, [activeGroup?.id, location.pathname, prefDevice, prefPage]);

  const closeStandaloneFramesEditor = useCallback(() => {
    navigate("/shares");
  }, [navigate]);

  const markSharedGroupSyncState = useCallback((groupId, isDirty) => {
    if (!groupId) return;
    setUnsyncedSharedGroupIds((current) => {
      const next = new Set(current);
      if (isDirty) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }, []);

  const buildGroupSharePreferences = useCallback((preferences = null) => {
    const nextPreferences = preferences && typeof preferences === "object" ? { ...preferences } : {};
    if (user?.email) {
      nextPreferences.ownerEmail = user.email;
    }
    return nextPreferences;
  }, [user?.email]);

  const resetPrefDeviceForViewport = useCallback(() => {
    setPrefDevice(getDefaultPreferenceDevice());
  }, []);

  // Force mobile device on narrow viewports
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e) => { if (e.matches) setPrefDevice("mobile"); };
    if (mq.matches) setPrefDevice("mobile");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const stored = activeGroup?.preferences?.shareSlug || activeGroup?.preferences?.shareId || "";
    setSlugInput(stored);
    setShareSlugError("");
  }, [activeGroup?.id, activeGroup?.preferences?.shareSlug, activeGroup?.preferences?.shareId]);

  useEffect(() => {
    if (!isStandaloneEditorMode || !requestedStandaloneGroupId || groups.length === 0) return;
    if (!groups.some((group) => group?.id === requestedStandaloneGroupId)) return;
    if (activeGroupId === requestedStandaloneGroupId) return;
    setActiveGroupId(requestedStandaloneGroupId);
    setGroupViewMode("preferences");
  }, [activeGroupId, groups, isStandaloneEditorMode, requestedStandaloneGroupId]);

  useEffect(() => {
    if (!isStandaloneEditorMode) return;
    if (requestedStandalonePage && requestedStandalonePage !== prefPage) {
      setPrefPage(requestedStandalonePage);
    }
    if (requestedStandaloneDevice && requestedStandaloneDevice !== prefDevice) {
      setPrefDevice(requestedStandaloneDevice);
    }
    if (groupViewMode !== "preferences") {
      setGroupViewMode("preferences");
    }
  }, [
    isStandaloneEditorMode,
    requestedStandaloneDevice,
    requestedStandalonePage,
    prefDevice,
    prefPage,
    groupViewMode,
  ]);

  useEffect(() => {
    if (!isStandaloneEditorMode || !activeGroup?.id) return;

    // Don't overwrite the URL if we're still waiting for the group-correction
    // effect to fire. The correction effect sets activeGroupId to
    // requestedStandaloneGroupId — until that happens, activeGroup is still the
    // default tutorial group and pushing it into the URL would lose the real target.
    if (requestedStandaloneGroupId && activeGroup.id !== requestedStandaloneGroupId) return;

    // Build the canonical search string from state (source of truth).
    // We intentionally read locationSearchRef.current (not location.search as a dep)
    // to avoid the navigate → location.search change → this effect → navigate loop.
    const targetParams = new URLSearchParams();
    targetParams.set("editor", "1");
    targetParams.set("group", activeGroup.id);
    targetParams.set("page", prefPage);
    targetParams.set("device", prefDevice);
    const targetSearch = `?${targetParams.toString()}`;

    if (locationSearchRef.current === targetSearch) return;

    navigate(
      {
        pathname: location.pathname,
        search: targetSearch,
      },
      { replace: true }
    );
  }, [
    activeGroup?.id,
    isStandaloneEditorMode,
    location.pathname,
    navigate,
    prefDevice,
    prefPage,
    requestedStandaloneGroupId,
  ]);

  useEffect(() => {
    setFontSizeDrafts({});
    setOpenFontPickerKey(null);
    setOpenFontSizePickerKey(null);
  }, [activeGroup?.id, prefPage, framesEditorSelection]);

  useEffect(() => {
    if (!openFontPickerKey && !openFontSizePickerKey) return undefined;

    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest(".shares-font-picker")) return;
      if (event.target instanceof Element && event.target.closest(".shares-font-size-picker")) return;
      setOpenFontPickerKey(null);
      setOpenFontSizePickerKey(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [openFontPickerKey, openFontSizePickerKey]);

  useEffect(() => {
    if (!showShareModal) {
      setShareSlugError("");
    }
  }, [showShareModal]);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setShareQuota(null);
      setShareQuotaError("");
      setIsLoadingShareQuota(false);
      return undefined;
    }

    setIsLoadingShareQuota(true);
    setShareQuotaError("");

    fetchGroupShareQuota(token)
      .then((quota) => {
        if (!cancelled) {
          setShareQuota(quota);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setShareQuota(null);
          setShareQuotaError(error?.message || "Gagal memuat kuota share");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingShareQuota(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareQuotaReloadKey, token]);

  useEffect(() => {
    let cancelled = false;

    if (!activeGroupShareId || !token || isTutorialGroupActive) {
      setGroupAnalytics(null);
      setGroupAnalyticsError("");
      setIsLoadingGroupAnalytics(false);
      return undefined;
    }

    setIsLoadingGroupAnalytics(true);
    setGroupAnalyticsError("");

    fetchGroupShareAnalytics(activeGroupShareId, token, { days: GROUP_ANALYTICS_DAYS })
      .then((analytics) => {
        if (!cancelled) {
          setGroupAnalytics(analytics);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGroupAnalytics(null);
          setGroupAnalyticsError(error?.message || "Gagal memuat analytics group");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingGroupAnalytics(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeGroupShareId, groupAnalyticsReloadKey, isTutorialGroupActive, token]);

  const analyticsMonthOptions = useMemo(() => {
    const grouped = new Map();

    (groupAnalytics?.daily || []).forEach((item) => {
      const monthKey = getAnalyticsMonthKey(item.eventDate);
      if (!monthKey) return;

      if (!grouped.has(monthKey)) {
        grouped.set(monthKey, {
          key: monthKey,
          label: formatAnalyticsMonthLabel(monthKey),
          daily: [],
          totals: {
            linkOpens: 0,
            downloads: 0,
          },
        });
      }

      const monthData = grouped.get(monthKey);
      monthData.daily.push(item);
      monthData.totals.linkOpens += Number(item.linkOpens || 0);
      monthData.totals.downloads += getAnalyticsDownloadCount(item);
    });

    return Array.from(grouped.values());
  }, [groupAnalytics]);

  const activeAnalyticsMonth = useMemo(() => {
    if (analyticsMonthOptions.length === 0) return null;
    return analyticsMonthOptions.find((item) => item.key === selectedAnalyticsMonth)
      || analyticsMonthOptions[0];
  }, [analyticsMonthOptions, selectedAnalyticsMonth]);

  useEffect(() => {
    if (analyticsMonthOptions.length === 0) {
      setSelectedAnalyticsMonth("");
      return;
    }

    if (!analyticsMonthOptions.some((item) => item.key === selectedAnalyticsMonth)) {
      setSelectedAnalyticsMonth(analyticsMonthOptions[0].key);
    }
  }, [analyticsMonthOptions, selectedAnalyticsMonth]);

  useEffect(() => {
    setFramesEditorSelection(null);
    setFramesEditorFocusSection(null);
    setFramesEditorFocusField(null);
    setInlinePreviewEditingField(null);
  }, [prefPage]);

  useEffect(() => {
    setFramesEditorSelection(null);
    setFramesEditorFocusSection(null);
    setFramesEditorFocusField(null);
    setInlinePreviewEditingField(null);
    setShowFramesEditorModal(false);
    if (!showTutorial) {
      resetPrefDeviceForViewport();
    }
  }, [activeGroup?.id, resetPrefDeviceForViewport, showTutorial]);

  const registerTutorialTarget = useCallback((targetKey) => (node) => {
    if (!targetKey) return;
    if (node) {
      tutorialTargetRefs.current[targetKey] = node;
    } else {
      delete tutorialTargetRefs.current[targetKey];
    }
  }, []);

  const updateTutorialGroup = useCallback((updater) => {
    setGroups((current) => current.map((group) => {
      if (group?.id !== TUTORIAL_GROUP_ID) return group;
      const nextGroup = typeof updater === "function" ? updater(group) : { ...group, ...updater };
      return {
        ...nextGroup,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    setTutorialLinkOpened(false);
  }, []);

  const openFramesEditorModal = useCallback((page = prefPage) => {
    if (showFramesEditorModal && page === prefPage) return;
    setPrefPage(page);
    if (!showTutorial) {
      resetPrefDeviceForViewport();
    }
    setFramesEditorSelection(null);
    setFramesEditorFocusSection(null);
    setFramesEditorFocusField(null);
    setInlinePreviewEditingField(null);
    setShowFramesEditorModal(true);
  }, [prefPage, resetPrefDeviceForViewport, showFramesEditorModal, showTutorial]);

  const closeFramesEditorModal = useCallback(() => {
    setShowFramesEditorModal(false);
    setFramesEditorSelection(null);
    setFramesEditorFocusSection(null);
    setFramesEditorFocusField(null);
    setInlinePreviewEditingField(null);
  }, []);

  const closeFramesEditorProperties = useCallback(() => {
    setFramesEditorSelection(null);
    setFramesEditorFocusSection(null);
    setFramesEditorFocusField(null);
    setInlinePreviewEditingField(null);
  }, []);

  const registerFramesEditorSectionRef = useCallback((sectionKeys) => (node) => {
    const keys = Array.isArray(sectionKeys) ? sectionKeys : [sectionKeys];
    keys.forEach((sectionKey) => {
      if (!sectionKey) return;
      if (node) {
        framesEditorSectionRefs.current[sectionKey] = node;
      } else {
        delete framesEditorSectionRefs.current[sectionKey];
      }
    });
  }, []);

  const registerFramesEditorFieldRef = useCallback((fieldKey) => (node) => {
    if (!fieldKey) return;
    if (node) {
      framesEditorFieldRefs.current[fieldKey] = node;
    } else {
      delete framesEditorFieldRefs.current[fieldKey];
    }
  }, []);

  const registerFontPickerAnchorRef = useCallback((fieldKey) => (node) => {
    if (!fieldKey) return;
    if (node) {
      fontPickerAnchorRefs.current[fieldKey] = node;
    } else {
      delete fontPickerAnchorRefs.current[fieldKey];
    }
  }, []);

  const registerFontSizePickerAnchorRef = useCallback((fieldKey) => (node) => {
    if (!fieldKey) return;
    if (node) {
      fontSizePickerAnchorRefs.current[fieldKey] = node;
    } else {
      delete fontSizePickerAnchorRefs.current[fieldKey];
    }
  }, []);

  const registerInlinePreviewFieldRef = useCallback((fieldKey) => (node) => {
    if (!fieldKey) return;
    if (node) {
      inlinePreviewFieldRefs.current[fieldKey] = node;
    } else {
      delete inlinePreviewFieldRefs.current[fieldKey];
    }
  }, []);

  const clampFramesEditorPopoverPosition = useCallback((nextPosition, standalone) => {
    const popoverNode = framesEditorPopoverRef.current;
    if (!popoverNode || typeof window === "undefined" || !nextPosition) return nextPosition;

    const margin = standalone ? 12 : 16;
    const popoverRect = popoverNode.getBoundingClientRect();

    if (standalone) {
      const maxX = Math.max(margin, window.innerWidth - popoverRect.width - margin);
      const maxY = Math.max(margin, window.innerHeight - popoverRect.height - margin);
      return {
        x: Math.min(maxX, Math.max(margin, nextPosition.x)),
        y: Math.min(maxY, Math.max(margin, nextPosition.y)),
      };
    }

    const boundsNode = popoverNode.offsetParent || popoverNode.parentElement;
    if (!(boundsNode instanceof HTMLElement)) return nextPosition;

    const maxX = Math.max(margin, boundsNode.clientWidth - popoverRect.width - margin);
    const maxY = Math.max(margin, boundsNode.clientHeight - popoverRect.height - margin);

    return {
      x: Math.min(maxX, Math.max(margin, nextPosition.x)),
      y: Math.min(maxY, Math.max(margin, nextPosition.y)),
    };
  }, []);

  const handleFramesEditorPopoverPointerDown = useCallback((event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".shares-frame-inspector__close")) return;

    const popoverNode = framesEditorPopoverRef.current;
    if (!popoverNode) return;

    const standalone = isStandaloneEditorMode;
    const popoverRect = popoverNode.getBoundingClientRect();
    const boundsNode = standalone ? null : (popoverNode.offsetParent || popoverNode.parentElement);
    const boundsRect = boundsNode instanceof HTMLElement ? boundsNode.getBoundingClientRect() : null;
    const origin = clampFramesEditorPopoverPosition({
      x: standalone ? popoverRect.left : popoverRect.left - (boundsRect?.left || 0),
      y: standalone ? popoverRect.top : popoverRect.top - (boundsRect?.top || 0),
    }, standalone);

    framesEditorPopoverDragRef.current = {
      pointerId: event.pointerId,
      standalone,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
    };

    setFramesEditorPopoverPosition(origin);
    setIsDraggingFramesEditorPopover(true);
    event.preventDefault();
  }, [clampFramesEditorPopoverPosition, isStandaloneEditorMode]);

  const getFloatingMenuStyle = useCallback((anchorNode, options = {}) => {
    if (!anchorNode || typeof window === "undefined") return undefined;

    const {
      align = "left",
      minWidth = 0,
      preferredMaxHeight = 320,
      gap = 8,
    } = options;

    const rect = anchorNode.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      Math.max(Math.round(rect.width), minWidth),
      Math.max(160, viewportWidth - 32),
    );

    let left = align === "right"
      ? rect.right - width
      : rect.left;
    left = Math.max(16, Math.min(left, viewportWidth - width - 16));

    const spaceBelow = viewportHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const maxHeight = Math.max(140, Math.min(preferredMaxHeight, Math.max(spaceBelow, spaceAbove)));
    const shouldOpenUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    const top = shouldOpenUpward
      ? Math.max(16, rect.top - maxHeight - gap)
      : Math.min(rect.bottom + gap, viewportHeight - maxHeight - 16);

    return {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      right: "auto",
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      zIndex: 2000,
    };
  }, []);

  const scrollFramesEditorToSection = useCallback((sectionKey) => {
    if (!sectionKey) return;
    const container = framesEditorPopoverRef.current;
    const targetNode = framesEditorSectionRefs.current[sectionKey];
    if (!container || !targetNode) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetNode.getBoundingClientRect();
    const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - 12;

    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "smooth",
    });
  }, []);

  const focusFramesEditorField = useCallback((fieldKey) => {
    if (!fieldKey) return;
    const fieldNode = framesEditorFieldRefs.current[fieldKey];
    if (!fieldNode) return;

    fieldNode.focus();

    if (typeof fieldNode.setSelectionRange === "function") {
      const length = typeof fieldNode.value === "string" ? fieldNode.value.length : 0;
      fieldNode.setSelectionRange(length, length);
    }
  }, []);

  const focusInlinePreviewField = useCallback((fieldKey) => {
    if (!fieldKey) return;
    const fieldNode = inlinePreviewFieldRefs.current[fieldKey];
    if (!fieldNode) return;

    fieldNode.focus();

    if (typeof fieldNode.setSelectionRange === "function") {
      const length = typeof fieldNode.value === "string" ? fieldNode.value.length : 0;
      fieldNode.setSelectionRange(length, length);
    }
  }, []);

  useEffect(() => {
    if (!isDraggingFramesEditorPopover) return undefined;

    const handlePointerMove = (event) => {
      const dragState = framesEditorPopoverDragRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      event.preventDefault();
      setFramesEditorPopoverPosition(clampFramesEditorPopoverPosition({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      }, dragState.standalone));
    };

    const handlePointerUp = (event) => {
      const dragState = framesEditorPopoverDragRef.current;
      if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
      framesEditorPopoverDragRef.current = null;
      setIsDraggingFramesEditorPopover(false);
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [clampFramesEditorPopoverPosition, isDraggingFramesEditorPopover]);

  useEffect(() => {
    framesEditorPopoverDragRef.current = null;
    setIsDraggingFramesEditorPopover(false);
    setFramesEditorPopoverPosition(null);
  }, [activeGroup?.id, prefDevice, prefPage, framesEditorActive]);

  useEffect(() => {
    if (!framesEditorPopoverPosition || typeof window === "undefined") return undefined;

    const handleResize = () => {
      setFramesEditorPopoverPosition((current) => {
        if (!current) return current;
        return clampFramesEditorPopoverPosition(current, isStandaloneEditorMode);
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampFramesEditorPopoverPosition, framesEditorPopoverPosition, isStandaloneEditorMode]);

  const openFramesEditorTarget = useCallback((target, focusSection = target, focusField = null) => {
    if (
      framesEditorSelection === target
      && framesEditorFocusSection === focusSection
      && framesEditorFocusField === focusField
    ) {
      window.requestAnimationFrame(() => {
        scrollFramesEditorToSection(focusSection || target);
        window.setTimeout(() => focusFramesEditorField(focusField), 160);
      });
      return;
    }

    setFramesEditorSelection(target);
    setFramesEditorFocusSection(focusSection || target);
    setFramesEditorFocusField(focusField);
  }, [focusFramesEditorField, framesEditorFocusField, framesEditorFocusSection, framesEditorSelection, scrollFramesEditorToSection]);

  const startTutorial = useCallback(() => {
    // Open tutorial group standalone full-preview editor in a new tab.
    setShowShareEntryPromoModal(false);
    setShareEntryPromoLightboxImg(null);
    setGroups((current) => {
      const currentTutorial = current.find((group) => group?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(current, currentTutorial);
    });
    setActiveGroupId(TUTORIAL_GROUP_ID);
    setTimeout(() => openStandaloneFramesEditorTab("frames", TUTORIAL_GROUP_ID), 50);
  }, [openStandaloneFramesEditorTab]);

  // Auto-start tutorial when navigated from pricing with { state: { startTutorial: true } }.
  // Using location.state avoids sessionStorage timing races — state is available immediately.
  // A short timeout lets all mount effects (data load, group init) settle first.
  const startTutorialRef = useRef(null);
  startTutorialRef.current = startTutorial;
  useEffect(() => {
    if (!location.state?.startTutorial) return;
    const t = setTimeout(() => startTutorialRef.current?.(), 300);
    return () => clearTimeout(t);
  }, [location.key, location.state?.startTutorial]);

  useEffect(() => {
    let isCancelled = false;

    if (location.state?.startTutorial) {
      setShowShareEntryPromoModal(false);
      return undefined;
    }

    if (!token || !user?.email) {
      setShowShareEntryPromoModal(true);
      return undefined;
    }

    const loadSharePlusStatus = async () => {
      try {
        const response = await shareSubscriptionService.getStatus();
        if (isCancelled) return;
        setShowShareEntryPromoModal(Boolean(response?.success && !response?.hasSubscription));
      } catch {
        if (isCancelled) return;
        setShowShareEntryPromoModal(false);
      }
    };

    loadSharePlusStatus();

    return () => {
      isCancelled = true;
    };
  }, [location.key, location.state?.startTutorial, token, user?.email]);

  const goToNextTutorialStep = useCallback(() => {
    setTutorialStepIndex((current) => {
      if (current >= tutorialSteps.length - 1) {
        setShowTutorial(false);
        return current;
      }
      return current + 1;
    });
  }, [tutorialSteps.length]);

  const goToPreviousTutorialStep = useCallback(() => {
    setTutorialStepIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    if (tutorialStep?.key !== "open-page") {
      setTutorialLinkOpened(false);
    }
  }, [tutorialStep?.key]);

  useEffect(() => {
    if (!isGuestTutorialMode || typeof window === "undefined") return;
    if (window.localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY)) return;
    const timer = window.setTimeout(() => {
      startTutorial();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [isGuestTutorialMode, startTutorial]);

  useEffect(() => {
    if (!showTutorial || !tutorialStep) return;

    if (tutorialStep.key === "create-group" || tutorialStep.key === "frames") {
      setShowFramePicker(false);
      setShowShareModal(false);
      closeFramesEditorModal();
      setGroupViewMode("preferences");
      setPrefPage("frames");
      setPrefDevice("mobile");
    }

    if (tutorialStep.key === "frame-sources") {
      setShowShareModal(false);
      closeFramesEditorModal();
      setGroupViewMode("preferences");
      setPrefPage("frames");
      setPrefDevice("mobile");
      setFramePickerSource("fremio");
      void openFramePicker();
    }

    if (tutorialStep.key === "frame-draft-source") {
      setShowShareModal(false);
      closeFramesEditorModal();
      setGroupViewMode("preferences");
      setPrefPage("frames");
      setPrefDevice("mobile");
      setFramePickerSource("draft");
      void openFramePicker();
    }

    if (tutorialStep.key === "preferences-tab") {
      setShowFramePicker(false);
      setShowShareModal(false);
      closeFramesEditorModal();
      setGroupViewMode("preferences");
      setPrefPage("frames");
    }

    if (tutorialStep.key === "edit-preview") {
      setShowFramePicker(false);
      setShowShareModal(false);
      closeFramesEditorModal();
      setGroupViewMode("preferences");
      setPrefPage("frames");
      setPrefDevice("mobile");
    }

    if ([
      "preview-stage",
      "preview-logo",
      "preview-header",
      "preview-background",
      "preview-text",
      "preview-info-box",
    ].includes(tutorialStep.key)) {
      setShowFramePicker(false);
      setShowShareModal(false);
      setGroupViewMode("preferences");
      setPrefPage("frames");
      setPrefDevice("desktop");
      openFramesEditorModal("frames");
      window.setTimeout(() => {
        if (tutorialStep.key === "preview-logo") {
          openFramesEditorTarget("logo", "logo");
          return;
        }

        if (tutorialStep.key === "preview-header" || tutorialStep.key === "preview-background") {
          openFramesEditorTarget("page", "page");
          return;
        }

        if (tutorialStep.key === "preview-info-box") {
          openFramesEditorTarget("infoBox", "infoBox");
          return;
        }

        openFramesEditorTarget("title1", "title1", "title1Text");
      }, 120);
    }

    if (tutorialStep.key === "page-device-controls") {
      setShowFramePicker(false);
      setShowShareModal(false);
      setGroupViewMode("preferences");
      setPrefPage("frames");
      setPrefDevice("desktop");
      openFramesEditorModal("frames");
    }
  }, [
    closeFramesEditorModal,
    openFramesEditorModal,
    openFramesEditorTarget,
    showTutorial,
    tutorialStep,
  ]);

  // Load drafts
  const reloadDrafts = useCallback(async () => {
    if (!user?.email) { setLoadingDrafts(false); return; }
    setLoadingDrafts(true);
    try {
      const local = draftStorage.loadDraftSummaries
        ? await draftStorage.loadDraftSummaries()
        : await draftStorage.loadDrafts();
      if (isMountedRef.current) setDrafts(Array.isArray(local) ? local : []);
      void (async () => {
        try {
          const cloud = await draftService.getCloudDrafts();
          if (isMountedRef.current) setCloudDrafts(Array.isArray(cloud) ? cloud : []);
        } catch (_) {}
      })();
    } catch (_) {
      if (isMountedRef.current) setDrafts([]);
    } finally {
      if (isMountedRef.current) setLoadingDrafts(false);
    }
  }, [user]);

  useEffect(() => { reloadDrafts(); }, [reloadDrafts]);

  // Check access
  useEffect(() => {
    if (!user?.email) { setHasAccess(false); setAccessibleFrameIds([]); return; }
    paymentService.getAccess()
      .then((res) => {
        if (res?.success && res?.hasAccess) {
          setHasAccess(true);
          setAccessibleFrameIds(res?.data?.frameIds || []);
        } else {
          setHasAccess(false);
          setAccessibleFrameIds([]);
        }
      })
      .catch(() => { setHasAccess(false); setAccessibleFrameIds([]); });
  }, [user?.email]);

  // Merged & sorted drafts (same as CreateHub)
  const sortedDrafts = useMemo(() => {
    const localCloudIds = new Set(drafts.map((d) => d.cloudId != null ? String(d.cloudId) : null).filter(Boolean));
    const localTitles = new Set(drafts.map((d) => d.title?.trim()?.toLowerCase()).filter(Boolean));
    const allCloudOnly = cloudDrafts
      .filter((cd) => !localCloudIds.has(String(cd.id)))
      .map((cd) => ({
        id: `cloud-${cd.id}`, cloudId: cd.id, shareId: cd.share_id,
        title: cd.title || "Untitled", thumbnail: cd.preview_url || null,
        thumbnailUrl: cd.preview_url || null, preview: cd.preview_url || null,
        createdAt: cd.created_at, updatedAt: cd.updated_at,
        isCloudOnly: true, _frameData: cd.frame_data,
      }));
    const seenTitles = new Set();
    const cloudOnly = allCloudOnly
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .filter((cd) => {
        const key = cd.title?.trim()?.toLowerCase() || String(cd.cloudId);
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        if (localTitles.has(key)) return false;
        return true;
      });
    return [...drafts, ...cloudOnly].sort((a, b) =>
      new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0)
    );
  }, [drafts, cloudDrafts]);

  const groupDraftIdSet = useMemo(() => {
    const ids = activeGroup?.draftIds;
    return new Set(Array.isArray(ids) ? ids : []);
  }, [activeGroup]);

  const availableDrafts = useMemo(
    () => (isTutorialGroupActive ? tutorialFrames : sortedDrafts),
    [isTutorialGroupActive, sortedDrafts, tutorialFrames]
  );

  const pickerDraftsSource = useMemo(() => {
    if (user?.email && sortedDrafts.length > 0) {
      return sortedDrafts;
    }
    return availableDrafts;
  }, [availableDrafts, sortedDrafts, user?.email]);

  const pickerDraftAccess = useMemo(() => {
    if (user?.email) {
      try {
        localStorage.removeItem(`fremio_locked_drafts_${user.email}`);
      } catch (_) {
        // ignore storage failures
      }
    }

    return splitDraftsByMembershipAccess(pickerDraftsSource, hasAccess);
  }, [hasAccess, pickerDraftsSource, user?.email]);

  // ── QR helper ──
  const generateQR = useCallback(async (link) => {
    try {
      return await QRCode.toDataURL(link, { width: 256, margin: 2, color: { dark: "#1f2937", light: "#ffffff" } });
    } catch { return ""; }
  }, []);

  const prepareTutorialShare = useCallback(async () => {
    if (!isTutorialGroupActive || typeof window === "undefined") return null;

    // Reuse existing shareId so the same link always reflects the latest edits.
    const shareId = activeGroup?.preferences?.shareId || getNextTutorialShareId();
    const shareLinkValue = `${window.location.origin}/share/${shareId}`;
    const qr = await generateQR(shareLinkValue);
    const latestPreferences = {
      ...(activeGroup?.preferences || {}),
      shareId,
      shareSlug: shareId,
      qrDataUrl: qr,
      tutorialShareRunId: tutorialRunId,
    };
    const payload = {
      title: activeGroup?.name || TUTORIAL_GROUP_NAME,
      frames: [
        ...tutorialFrames,
        ...sortedDrafts.filter((sd) => !tutorialFrames.some((tf) => tf.id === sd.id)),
      ].filter((frame) => groupDraftIdSet.has(frame.id)).map((frame) => ({
        shareId: null,
        id: frame.id,
        title: frame.title,
        description: frame.description || "",
        thumbnail: frame.thumbnail || frame.preview || frame.imagePath || null,
        thumbnailUrl: frame.thumbnailUrl || frame.thumbnail || frame.preview || frame.imagePath || null,
        preview: frame.preview || frame.imagePath || frame.thumbnail || null,
        imagePath: frame.imagePath || frame.preview || frame.thumbnail || null,
        slots: Array.isArray(frame.slots) ? frame.slots : undefined,
        maxCaptures: frame.maxCaptures,
      })),
      preferences: latestPreferences,
    };

    saveTutorialSharePayload(shareId, payload);
    updateTutorialGroup((group) => ({
      ...group,
      preferences: latestPreferences,
    }));
    setShareDraftTitle(activeGroup?.name || TUTORIAL_GROUP_NAME);
    setShareLink(shareLinkValue);
    setQrDataUrl(qr);
    setSlugInput(shareId);
    setCopied(false);
    return { shareId, shareLinkValue, qr };
  }, [activeGroup, generateQR, groupDraftIdSet, isTutorialGroupActive, sortedDrafts, tutorialFrames, tutorialRunId, updateTutorialGroup]);

  const ensureTutorialSharePrepared = useCallback(async () => {
    if (!isTutorialGroupActive) return null;

    const currentShareId = activeGroup?.preferences?.shareId;
    const currentQr = activeGroup?.preferences?.qrDataUrl || "";
    const currentRunId = activeGroup?.preferences?.tutorialShareRunId;

    if (currentShareId && currentRunId === tutorialRunId) {
      const shareLinkValue = `${window.location.origin}/share/${currentShareId}`;
      setShareDraftTitle(activeGroup?.name || TUTORIAL_GROUP_NAME);
      setShareLink(shareLinkValue);
      setQrDataUrl(currentQr);
      setSlugInput(currentShareId);
      return {
        shareId: currentShareId,
        shareLinkValue,
        qr: currentQr,
      };
    }

    return prepareTutorialShare();
  }, [activeGroup, isTutorialGroupActive, prepareTutorialShare, tutorialRunId]);

  const openTutorialPublicPage = useCallback(async ({ ensurePrepared = false } = {}) => {
    if (typeof window === "undefined") return false;

    let shareId = activeGroup?.preferences?.shareId || null;
    let shareLinkValue = shareId ? `${window.location.origin}/share/${shareId}` : "";

    if (isTutorialGroupActive && ensurePrepared) {
      const prepared = await ensureTutorialSharePrepared();
      shareId = prepared?.shareId || shareId;
      shareLinkValue = prepared?.shareLinkValue || shareLinkValue;
      if (!shareId) {
        throw new Error("Gagal membuat link tutorial.");
      }
    }

    if (!shareId) return false;

    window.open(shareLinkValue || `${window.location.origin}/share/${shareId}`, "_blank", "noopener,noreferrer");
    return true;
  }, [activeGroup?.preferences?.shareId, ensureTutorialSharePrepared, isTutorialGroupActive]);

  const handleTutorialOpenPage = useCallback(async () => {
    try {
      setIsGeneratingLink(true);
      // Always regenerate payload with the latest frames + preferences before opening.
      const prepared = await prepareTutorialShare();
      if (!prepared?.shareLinkValue) {
        showToast("error", "Gagal membuat link tutorial.");
        return;
      }
      window.open(prepared.shareLinkValue, "_blank", "noopener,noreferrer");
      setTutorialLinkOpened(true);
    } catch (error) {
      showToast("error", error?.message || "Gagal membuka halaman tutorial.");
    } finally {
      setIsGeneratingLink(false);
    }
  }, [prepareTutorialShare, showToast]);

  const handleOpenGroupPage = useCallback(async () => {
    if (isTutorialGroupActive) {
      try {
        setIsGeneratingLink(true);
        await openTutorialPublicPage({ ensurePrepared: true });
      } catch (error) {
        showToast("error", error?.message || "Gagal membuka halaman tutorial.");
      } finally {
        setIsGeneratingLink(false);
      }
      return;
    }
    if (!activeGroupShareLink) {
      showToast("info", 'Klik "Share" terlebih dahulu untuk membuat link group.');
      return;
    }
    if (!activeGroup?.id || !user?.email) {
      window.open(activeGroupShareLink, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setIsGeneratingLink(true);
      const latestGroups = loadDraftGroups(user.email);
      const storedGroup = latestGroups.find((group) => group?.id === activeGroup.id) || null;
      const effectiveGroup = {
        ...storedGroup,
        ...activeGroup,
        preferences: {
          ...(storedGroup?.preferences || {}),
          ...(activeGroup?.preferences || {}),
        },
      };

      if (effectiveGroup?.preferences?.shareId) {
        await syncExistingGroupShare(effectiveGroup);
        markSharedGroupSyncState(effectiveGroup.id, false);
      }
    } catch (error) {
      showToast("error", error?.message || "Gagal sinkronisasi link group");
      return;
    } finally {
      setIsGeneratingLink(false);
    }

    window.open(activeGroupShareLink, "_blank", "noopener,noreferrer");
  }, [activeGroup, activeGroupShareLink, isTutorialGroupActive, markSharedGroupSyncState, openTutorialPublicPage, showToast, user?.email]);

  // ── Group handlers ──
  const handleCreateGroup = () => {
    if (!user?.email) {
      showToast("info", "Login untuk membuat group milikmu sendiri. Tutorial ini sudah menyiapkan 1 group contoh.");
      return;
    }
    const group = createDraftGroup(user.email);
    const next = loadDraftGroups(user.email);
    setGroups((current) => {
      const currentTutorial = current.find((item) => item?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(next, currentTutorial);
    });
    setActiveGroupId(group.id);
    setGroupViewMode("preferences");
  };

  const handleToggleDraftInGroup = (groupId, draftId) => {
    if (groupId === TUTORIAL_GROUP_ID && draftId) {
      updateTutorialGroup((group) => {
        const currentIds = new Set(Array.isArray(group?.draftIds) ? group.draftIds : []);
        if (currentIds.has(draftId)) currentIds.delete(draftId);
        else currentIds.add(draftId);
        return {
          ...group,
          draftIds: Array.from(currentIds),
        };
      });
      return;
    }
    if (!user?.email || !groupId || !draftId) return;
    const next = toggleDraftInGroup(user.email, groupId, draftId);
    const updatedGroup = next.find((group) => group?.id === groupId) || null;
    setGroups((current) => {
      const currentTutorial = current.find((item) => item?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(next, currentTutorial);
    });
    if (updatedGroup?.preferences?.shareId) {
      markSharedGroupSyncState(groupId, true);
    }
  };

  const handleDeleteGroup = (groupId, name) => {
    setConfirmDialog({ type: "group", id: groupId, title: name });
  };

  const confirmDeleteGroup = async (groupId) => {
    if (groupId === TUTORIAL_GROUP_ID) {
      showToast("info", "Group tutorial tidak dihapus. Ulangi tutorial saja jika ingin melihat alurnya lagi.");
      setConfirmDialog(null);
      return;
    }
    if (!user?.email) return;

    const targetGroup = groups.find((item) => item?.id === groupId) || null;
    const targetShareId = targetGroup?.preferences?.shareId || null;

    if (targetShareId && token) {
      try {
        await deleteMyShareLink(targetShareId, token);
      } catch (error) {
        showToast("error", error?.message || "Gagal menghapus link share dari server");
        return;
      }
    }

    const updated = deleteDraftGroup(user.email, groupId);
    setGroups((current) => {
      const currentTutorial = current.find((item) => item?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(updated, currentTutorial);
    });
    setActiveGroupId(TUTORIAL_GROUP_ID);
    setConfirmDialog(null);
    showToast("success", "Group berhasil dihapus (frame tetap ada di draftmu)");
  };

  const handleUpdateGroupPref = (patch) => {
    if (isTutorialGroupActive) {
      updateTutorialGroup((group) => ({
        ...group,
        preferences: {
          ...(group?.preferences || {}),
          ...(patch || {}),
        },
      }));
      return;
    }
    if (!user?.email || !activeGroup?.id) return;
    const next = updateDraftGroupPreferences(user.email, activeGroup.id, patch);
    setGroups((current) => {
      const currentTutorial = current.find((item) => item?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(next, currentTutorial);
    });
  };

  const updateActiveGroupDraftIds = useCallback((updater) => {
    if (!activeGroup?.id) return null;

    if (activeGroup.id === TUTORIAL_GROUP_ID) {
      let nextDraftIds = null;
      updateTutorialGroup((group) => {
        const currentIds = Array.isArray(group?.draftIds) ? group.draftIds : [];
        nextDraftIds = typeof updater === "function" ? updater(currentIds) : updater;
        return {
          ...group,
          draftIds: Array.isArray(nextDraftIds) ? nextDraftIds : currentIds,
        };
      });
      return nextDraftIds;
    }

    if (!user?.email) return null;

    let updatedGroup = null;
    const latestGroups = loadDraftGroups(user.email);
    const nextGroups = latestGroups.map((group) => {
      if (group?.id !== activeGroup.id) return group;
      const currentIds = Array.isArray(group?.draftIds) ? group.draftIds : [];
      const nextDraftIds = typeof updater === "function" ? updater(currentIds) : updater;
      updatedGroup = {
        ...group,
        draftIds: Array.isArray(nextDraftIds) ? nextDraftIds : currentIds,
        updatedAt: new Date().toISOString(),
      };
      return updatedGroup;
    });

    saveDraftGroups(user.email, nextGroups);
    setGroups((current) => {
      const currentTutorial = current.find((item) => item?.id === TUTORIAL_GROUP_ID) || null;
      return mergeGroupsWithTutorial(nextGroups, currentTutorial);
    });

    if (updatedGroup?.preferences?.shareId) {
      markSharedGroupSyncState(updatedGroup.id, true);
    }

    return updatedGroup?.draftIds || null;
  }, [activeGroup?.id, markSharedGroupSyncState, updateTutorialGroup, user?.email]);

  const replaceDraftInActiveGroup = useCallback((currentDraftId, nextDraftId) => {
    if (!currentDraftId || !nextDraftId || currentDraftId === nextDraftId) return;
    updateActiveGroupDraftIds((currentIds) => currentIds.map((draftId) => (
      draftId === currentDraftId ? nextDraftId : draftId
    )));
  }, [updateActiveGroupDraftIds]);

  const handleLogoFileChange = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Gagal membaca file"));
        reader.readAsDataURL(file);
      });
      handleUpdateGroupPref({ logoDataUrl: dataUrl, logoFileName: file.name || "" });
    } catch (e) {
      showToast("error", e?.message || "Gagal upload logo");
    }
  };

  async function syncExistingGroupShare(effectiveGroup, options = {}) {
    const { ensureQr = false } = options;
    const shareId = effectiveGroup?.preferences?.shareId;

    if (!shareId) {
      throw new Error("Link group belum tersedia");
    }

    const sharedFrames = await buildSharedFramesForActiveGroup(effectiveGroup);
    const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
    const response = await fetch(`${API_URL}/groups/public-share/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: effectiveGroup?.name || "Group Frames",
        frames: sharedFrames,
        preferences: buildGroupSharePreferences(effectiveGroup?.preferences),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.message || err?.error || "Gagal memperbarui link group");
    }

    const shareLinkValue = typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareId}`
      : `/share/${shareId}`;
    let qrData = effectiveGroup?.preferences?.qrDataUrl || "";

    if (ensureQr && !qrData) {
      qrData = await generateQR(shareLinkValue);
      handleUpdateGroupPref({ shareId, shareSlug: shareId, qrDataUrl: qrData });
    }

    const data = await response.json().catch(() => ({}));
    return {
      shareId,
      shareLinkValue,
      qrData,
      group: data?.group || null,
    };
  }

  // ── Save preferences to backend ──
  const handleSavePreferences = async () => {
    if (isTutorialGroupActive) {
      // Tutorial group is auto-persisted to localStorage on every state change,
      // so explicitly save latest state to ensure it's flushed, then confirm.
      const tutorialGroup = groups.find((g) => g?.id === TUTORIAL_GROUP_ID);
      if (tutorialGroup) saveTutorialGroupToStorage(tutorialGroup);
      showToast("success", "✅ Perubahan tutorial disimpan di browser ini.");
      return;
    }
    if (!activeGroup?.id || !user?.email) return;
    const latestGroups = loadDraftGroups(user.email);
    const storedGroup = latestGroups.find((g) => g?.id === activeGroup.id) || null;
    const effectiveGroup = {
      ...storedGroup,
      ...activeGroup,
      preferences: {
        ...(storedGroup?.preferences || {}),
        ...(activeGroup?.preferences || {}),
      },
    };
    const shareId = effectiveGroup?.preferences?.shareId;
    if (!shareId) {
      showToast("info", "Klik \"Share\" terlebih dahulu untuk membuat link, lalu simpan preferences.");
      return;
    }
    setIsSavingPrefs(true);
    try {
      await syncExistingGroupShare(effectiveGroup);
      markSharedGroupSyncState(effectiveGroup.id, false);
      showToast("success", "✅ Perubahan group berhasil disimpan ke link share!");
    } catch (e) {
      showToast("error", e?.message || "Gagal menyimpan perubahan group");
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const buildSharedFramesForActiveGroup = useCallback(async (groupOverride = null) => {
    const requestedDraftIds = Array.isArray(groupOverride?.draftIds)
      ? groupOverride.draftIds.filter(Boolean)
      : Array.from(groupDraftIdSet);
    const sourceDrafts = isTutorialGroupActive
      ? [
          ...tutorialFrames,
          ...sortedDrafts.filter((sd) => !tutorialFrames.some((tf) => tf.id === sd.id)),
        ]
      : sortedDrafts;
    const draftsById = new Map(sourceDrafts.filter(Boolean).map((draft) => [draft.id, draft]));
    const groupDrafts = requestedDraftIds.map((draftId) => draftsById.get(draftId)).filter(Boolean);

    if (groupDrafts.length === 0) {
      throw new Error("Tambahkan minimal 1 frame ke group terlebih dahulu");
    }

    if (groupDrafts.length !== requestedDraftIds.length) {
      throw new Error("Beberapa frame group belum selesai dimuat. Coba simpan lagi.");
    }

    const sharedFrames = [];

    for (const draft of groupDrafts) {
      let full = draft;
      const frameTitle = draft?.title || "Draft";
      if (isTutorialGroupActive) {
        sharedFrames.push({
          shareId: null,
          title: frameTitle,
          description: draft.description || "",
          thumbnail: draft.thumbnail || draft.preview || null,
        });
        continue;
      }
      if (!Array.isArray(full?.elements)) {
        full = await draftStorage.getDraftById(draft.id, user?.email);
      }
      if (!full && draft?._frameData) {
        const parsed = typeof draft._frameData === "string" ? JSON.parse(draft._frameData) : draft._frameData;
        full = { ...draft, ...parsed };
      }
      if (!full && draft?.cloudId) {
        const cloudDraft = await draftService.getDraftById(draft.cloudId);
        if (cloudDraft?.frame_data) {
          const parsed = typeof cloudDraft.frame_data === "string" ? JSON.parse(cloudDraft.frame_data) : cloudDraft.frame_data;
          full = { title: cloudDraft.title, preview: cloudDraft.preview_url, ...parsed };
        }
      }

      if (!full) {
        throw new Error(`Frame "${frameTitle}" belum siap untuk dishare. Coba tambah ulang frame tersebut.`);
      }

      // CRITICAL FIX: Always create a fresh cloud draft — never reuse existingShareId.
      // Old cloud drafts were saved without photo-type elements (old Create.jsx filtered them
      // out). Reusing those stale shareIds causes TakeMoment to compute maxCaptures=1.
      const canvasW = full.canvasWidth || 1080;
      const canvasH = full.canvasHeight || 1920;
      let photoEls = Array.isArray(full.elements)
        ? full.elements.filter((e) => e.type === "photo")
        : [];

      // Fallback: derive photo elements from the draft's stored slots (saved by updated
      // handlePickFrame for fixed frames from the catalog).
      if (photoEls.length === 0 && Array.isArray(full.slots) && full.slots.length > 0) {
        photoEls = full.slots.map((slot, idx) => ({
          id: String(slot.id || `slot_${idx + 1}`),
          type: "photo",
          x: (typeof slot.left === "number" ? slot.left : 0) * canvasW,
          y: (typeof slot.top === "number" ? slot.top : 0) * canvasH,
          width: (typeof slot.width === "number" ? slot.width : 0.5) * canvasW,
          height: (typeof slot.height === "number" ? slot.height : 0.5) * canvasH,
          zIndex: slot.zIndex || 2,
          rotation: slot.rotation || 0,
          data: {
            photoIndex: slot.photoIndex ?? idx,
            image: null,
            aspectRatio: slot.aspectRatio || "4:5",
            borderRadius: slot.borderRadius || 0,
          },
        }));
      }

      const frameData = JSON.stringify({
        aspectRatio: full.aspectRatio || "9:16",
        canvasBackground: full.canvasBackground || "#f7f1ed",
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        elements: full.elements || [],
      });

      const result = await draftService.saveDraftToCloud({
        title: full.title || "Shared Frame",
        frameData,
        previewUrl: full.thumbnail || full.preview || null,
        draftId: null,
      });

      const shareId = result?.draft?.share_id;
      if (!shareId) {
        throw new Error(`Frame "${frameTitle}" gagal dibuatkan link share.`);
      }

      // Include maxCaptures + slots so SharedGroup / TakeMoment can reconstruct
      // photo slot positions without relying solely on frame_data.elements.
      sharedFrames.push({
        shareId,
        title: full.title || frameTitle,
        description: full.description || "",
        thumbnail: full.thumbnail || full.preview || null,
        maxCaptures: photoEls.length || 1,
        slots: photoEls.map((el, idx) => ({
          id: el.id || `slot_${idx + 1}`,
          left: el.x / canvasW,
          top: el.y / canvasH,
          width: el.width / canvasW,
          height: el.height / canvasH,
          zIndex: el.zIndex || 1,
          photoIndex: el.data?.photoIndex ?? idx,
          aspectRatio: el.data?.aspectRatio || "4:5",
          borderRadius: el.data?.borderRadius || 0,
        })),
      });
    }

    if (sharedFrames.length === 0) {
      throw new Error("Gagal memuat frame di group");
    }

    if (sharedFrames.length !== groupDrafts.length) {
      throw new Error("Sebagian frame group gagal disiapkan untuk link share.");
    }

    return sharedFrames;
  }, [groupDraftIdSet, isTutorialGroupActive, sortedDrafts, tutorialFrames, user?.email]);

  const handleSaveShareSlug = useCallback(async () => {
    if (isTutorialGroupActive) {
      await prepareTutorialShare();
      setShowShareModal(true);
      showToast("success", "Link tutorial berhasil dibuat.");
      return;
    }
    const raw = (slugInput || "").trim();
    if (raw.length < 3) {
      setShareSlugError("Slug minimal 3 karakter.");
      return;
    }

    if (!user?.email || !activeGroup?.id) return;

    const latestGroups = loadDraftGroups(user.email);
    const latestGroup = latestGroups.find((g) => g?.id === activeGroup?.id) || null;
    const currentShareId = latestGroup?.preferences?.shareId;

    if (currentShareId) {
      setSlugInput(currentShareId);
      showToast("info", "Link group sudah dibuat dan tidak bisa diubah lagi.");
      return;
    }

    const effectiveGroup = {
      ...latestGroup,
      ...activeGroup,
      preferences: {
        ...(latestGroup?.preferences || {}),
        ...(activeGroup?.preferences || {}),
      },
    };

    setIsSavingSlug(true);
    setShareSlugError("");
    try {
      const sharedFrames = await buildSharedFramesForActiveGroup(effectiveGroup);
      const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
      const response = await fetch(`${API_URL}/groups/public-share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: effectiveGroup?.name || "Group Frames",
          frames: sharedFrames,
          preferences: buildGroupSharePreferences(effectiveGroup?.preferences),
          shareId: raw,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || err?.error || "Gagal membuat link group");
      }

      const data = await response.json();
      const groupShareId = data?.group?.share_id;
      if (!groupShareId) {
        throw new Error("Gagal mendapatkan group share ID");
      }

      const newLink = `${window.location.origin}/share/${groupShareId}`;
      const newQr = await generateQR(newLink);
      handleUpdateGroupPref({ shareId: groupShareId, shareSlug: groupShareId, qrDataUrl: newQr });
      setSlugInput(groupShareId);
      setShareLink(newLink);
      setQrDataUrl(newQr);
      setCopied(false);
      setShareSlugError("");
      showToast("success", "✅ Link group berhasil dibuat dan dikunci!");
    } catch (error) {
      setShareSlugError(error?.message || "Terjadi kesalahan, coba lagi.");
    } finally {
      setIsSavingSlug(false);
    }
  }, [activeGroup, buildGroupSharePreferences, buildSharedFramesForActiveGroup, generateQR, handleUpdateGroupPref, isTutorialGroupActive, prepareTutorialShare, showToast, slugInput, user?.email]);

  // ── Frame picker (browse all frames from API, like /frames page) ──
  const closeFramePicker = useCallback(() => {
    setShowFramePicker(false);
    setFramePickerIntent({ type: "add", replaceDraftId: null });
    setFramePickerSearch("");
  }, []);

  const openFramePicker = async (intent = { type: "add", replaceDraftId: null }) => {
    setFramePickerIntent(intent || { type: "add", replaceDraftId: null });
    setShowFramePicker(true);
    if (allFrames.length > 0) return;
    setLoadingFrames(true);
    try {
      const loaded = await unifiedFrameService.getAllFrames();
      const visible = (loaded || []).filter((f) => !(f?.isHidden ?? f?.is_hidden));
      visible.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
      setAllFrames(visible);
    } catch (_) {
      showToast("error", "Gagal memuat frame");
    } finally {
      setLoadingFrames(false);
    }
  };

  // When user picks a frame from the frame picker, it gets added to draft list
  // then toggled into the active group. We build a local draft from the frame config.
  const handlePickFrame = async (frame) => {
    if (!user?.email || !activeGroup?.id) {
      showToast("info", "Login untuk menambahkan frame ke group.");
      return;
    }
    const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
    // Record a view
    try { fetch(`${API_URL}/frames/${frame.id}/view`, { method: "POST" }).catch(() => {}); } catch (_) {}

    // Build a draft object from the base frame
    const layout = typeof frame.layout === "string" ? JSON.parse(frame.layout || "{}") : (frame.layout || {});
    const canvasW = frame.canvas_width || frame.canvasWidth || layout.canvasWidth || 1080;
    const canvasH = frame.canvas_height || frame.canvasHeight || layout.canvasHeight || 1920;

    // For "fixed" frames from the catalog, `layout.elements` contains only decorative
    // elements (background, overlays) but NOT photo slots — those live in `frame.slots`.
    // Inject them as `type: "photo"` elements so cloud drafts always carry slot info.
    let mergedElements = layout.elements || [];
    const hasPhotoInLayout = mergedElements.some((el) => el.type === "photo");
    if (!hasPhotoInLayout && Array.isArray(frame.slots) && frame.slots.length > 0) {
      const slotEls = frame.slots.map((slot, idx) => ({
        id: String(slot.id || `slot_${idx + 1}`),
        type: "photo",
        x: (typeof slot.left === "number" ? slot.left : 0) * canvasW,
        y: (typeof slot.top === "number" ? slot.top : 0) * canvasH,
        width: (typeof slot.width === "number" ? slot.width : 0.5) * canvasW,
        height: (typeof slot.height === "number" ? slot.height : 0.5) * canvasH,
        zIndex: slot.zIndex || 2,
        rotation: slot.rotation || 0,
        data: {
          photoIndex: slot.photoIndex ?? idx,
          image: null,
          aspectRatio: slot.aspectRatio || "4:5",
          borderRadius: slot.borderRadius || 0,
        },
      }));
      mergedElements = [...mergedElements, ...slotEls];
    }

    const frameData = JSON.stringify({
      aspectRatio: layout.aspectRatio || frame.aspect_ratio || "9:16",
      canvasBackground: frame.canvas_background || layout.backgroundColor || "#ffffff",
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      elements: mergedElements,
    });

    try {
      const result = await draftService.saveDraftToCloud({
        title: frame.name || "Frame",
        frameData,
        previewUrl: getFrameImageUrl(frame) || null,
        draftId: null,
      });
      if (!result?.draft) throw new Error("Gagal menyimpan ke cloud");

      const cloudDraft = result.draft;
      const localDraft = await draftStorage.saveDraft({
        title: frame.name || "Frame",
        elements: mergedElements,
        slots: Array.isArray(frame.slots) && frame.slots.length > 0 ? frame.slots : undefined,
        maxCaptures: frame.maxCaptures || frame.max_captures || frame.slots?.length || 1,
        aspectRatio: layout.aspectRatio || frame.aspect_ratio || "9:16",
        canvasBackground: frame.canvas_background || layout.backgroundColor || "#ffffff",
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        preview: getFrameImageUrl(frame) || null,
        thumbnail: getFrameImageUrl(frame) || null,
        cloudId: cloudDraft.id,
        shareId: cloudDraft.share_id,
      });

      setDrafts((prev) => {
        const without = prev.filter((d) => d.id !== localDraft.id);
        return [...without, localDraft];
      });

      if (framePickerIntent?.type === "replace" && framePickerIntent.replaceDraftId) {
        replaceDraftInActiveGroup(framePickerIntent.replaceDraftId, localDraft.id);
        closeFramePicker();
        showToast("success", `"${frame.name}" berhasil menggantikan frame di group!`);
        return;
      }

      updateActiveGroupDraftIds((currentIds) => (
        currentIds.includes(localDraft.id) ? currentIds : [...currentIds, localDraft.id]
      ));

      closeFramePicker();
      showToast("success", `"${frame.name}" ditambahkan ke group!`);
    } catch (e) {
      showToast("error", e?.message || "Gagal menambahkan frame");
    }
  };

  // ── Share group ──
  const handleShareGroup = async () => {
    if (isTutorialGroupActive) {
      setShareDraftTitle(activeGroup?.name || TUTORIAL_GROUP_NAME);
      setCopied(false);
      setShowShareModal(true);
      await prepareTutorialShare();
      return;
    }
    if (!activeGroup?.id || !user?.email) return;

    const baseUrl = window.location.origin;
    const latestGroups = loadDraftGroups(user.email);
    const storedGroup = latestGroups.find((g) => g?.id === activeGroup.id) || null;
    const effectiveGroup = {
      ...storedGroup,
      ...activeGroup,
      preferences: {
        ...(storedGroup?.preferences || {}),
        ...(activeGroup?.preferences || {}),
      },
    };
    const storedShareId = effectiveGroup?.preferences?.shareId;

    if (!Array.isArray(effectiveGroup?.draftIds) || effectiveGroup.draftIds.length === 0) {
      showToast("info", "Tambahkan minimal 1 frame ke group terlebih dahulu");
      return;
    }

    setShareDraftTitle(effectiveGroup?.name || "Group Frames");
    setCopied(false);
    setShowShareModal(true);

    if (!storedShareId) {
      setShareLink("");
      setQrDataUrl("");
      setSlugInput(effectiveGroup?.preferences?.shareSlug || "");
      return;
    }

    const shareLinkValue = `${baseUrl}/share/${storedShareId}`;
    const storedQr = effectiveGroup?.preferences?.qrDataUrl || "";
    setShareLink(shareLinkValue);
    setQrDataUrl(storedQr);
    setSlugInput(effectiveGroup?.preferences?.shareSlug || storedShareId);

    setIsGeneratingLink(true);
    try {
      const syncResult = await syncExistingGroupShare(effectiveGroup, { ensureQr: true });
      markSharedGroupSyncState(effectiveGroup.id, false);
      if (!storedQr && syncResult?.qrData) {
        setQrDataUrl(syncResult.qrData);
      }
    } catch (e) {
      showToast("error", e?.message || "Gagal memperbarui link group");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = useCallback(async () => {
    if (!shareLink) {
      showToast("info", "Link share belum tersedia.");
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareLink;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("error", "Gagal menyalin link.");
    }
  }, [shareLink, showToast]);

  const handleDownloadQr = useCallback(async () => {
    if (!shareLink) {
      showToast("info", "Link share belum tersedia.");
      return;
    }

    try {
      const qrSource = qrDataUrl || await generateQR(shareLink);
      if (!qrSource) {
        showToast("error", "QR code belum tersedia.");
        return;
      }

      if (!qrDataUrl) {
        setQrDataUrl(qrSource);
      }

      const downloadLink = document.createElement("a");
      downloadLink.href = qrSource;
      downloadLink.download = `${shareModalDisplayId || "group-share"}-qr.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    } catch {
      showToast("error", "Gagal mengunduh QR code.");
    }
  }, [generateQR, qrDataUrl, shareLink, shareModalDisplayId, showToast]);

  // ── Frame locked check (same logic as Frames.jsx) ──
  const isFrameLocked = useCallback((frame) => {
    const isPremium = !!(frame?.isPremium ?? frame?.is_premium);
    if (!isPremium) return false;
    if (!hasAccess) return true;
    const accessSet = new Set((accessibleFrameIds || []).map((id) => String(id)));
    if (accessSet.size === 0) return false; // empty list = access to all
    return !accessSet.has(String(frame.id));
  }, [hasAccess, accessibleFrameIds]);

  // ── Frame picker filtered frames ──
  const filteredPickerFrames = useMemo(() => {
    if (framePickerSource === "draft") return [];
    let list = [...allFrames].sort((a, b) => {
      const aRank = a?.source === "designer" ? 1 : 0;
      const bRank = b?.source === "designer" ? 1 : 0;
      if (aRank !== bRank) return aRank - bRank;
      return (a?.displayOrder || 999) - (b?.displayOrder || 999);
    });
    if (framePickerSearch.trim()) {
      const q = framePickerSearch.trim().toLowerCase();
      list = list.filter((f) => (f.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [allFrames, framePickerSource, framePickerSearch]);

  const filteredByFremioFrames = useMemo(
    () => filteredPickerFrames.filter((frame) => frame?.source !== "designer"),
    [filteredPickerFrames]
  );

  const filteredByDesignerFrames = useMemo(
    () => filteredPickerFrames.filter((frame) => frame?.source === "designer"),
    [filteredPickerFrames]
  );

  // ── Draft picker: drafts not yet in group ──
  const filteredPickerDrafts = useMemo(() => {
    if (framePickerSource !== "draft") return [];
    let list = pickerDraftAccess.accessibleDrafts.filter((d) => !groupDraftIdSet.has(d?.id));
    if (framePickerSearch.trim()) {
      const q = framePickerSearch.trim().toLowerCase();
      list = list.filter((d) => (d.title || "").toLowerCase().includes(q));
    }
    return list;
  }, [framePickerSource, framePickerSearch, groupDraftIdSet, pickerDraftAccess.accessibleDrafts]);

  useEffect(() => {
    if (!showTutorial || !tutorialStep) return;
    const targetNode = tutorialTargetRefs.current[tutorialStep.target];
    if (!targetNode || typeof targetNode.scrollIntoView !== "function") return;
    const timer = window.setTimeout(() => {
      targetNode.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [showTutorial, tutorialStep, groupViewMode, showFramesEditorModal, showShareModal]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsTutorialMobileViewport(!!mediaQuery.matches);

    updateViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    if (!showTutorial || !tutorialStep || !isTutorialMobileViewport || typeof window === "undefined") {
      setTutorialCardInlineStyle(undefined);
      return undefined;
    }

    let frameId = 0;
    let timeoutId = 0;

    const updatePosition = () => {
      const targetNode = tutorialTargetRefs.current[tutorialStep.target];
      const cardNode = tutorialCardRef.current;
      if (!targetNode || !cardNode) return;

      const targetRect = targetNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const horizontalInset = 12;
      const verticalInset = 12;
      const width = Math.min(360, viewportWidth - horizontalInset * 2);
      const cardHeight = Math.min(cardNode.offsetHeight || 220, viewportHeight - verticalInset * 2);
      const spaceAbove = targetRect.top - verticalInset;
      const spaceBelow = viewportHeight - targetRect.bottom - verticalInset;
      const preferBelow = spaceBelow >= cardHeight + 8 || spaceBelow >= spaceAbove;

      let top = preferBelow
        ? targetRect.bottom + 12
        : targetRect.top - cardHeight - 12;

      top = Math.max(verticalInset, Math.min(top, viewportHeight - cardHeight - verticalInset));

      setTutorialCardInlineStyle({
        left: `${Math.round(Math.max(horizontalInset, (viewportWidth - width) / 2))}px`,
        top: `${Math.round(top)}px`,
        right: "auto",
        bottom: "auto",
        transform: "none",
        width: `${Math.round(width)}px`,
        maxHeight: `${Math.max(180, Math.min(260, viewportHeight - verticalInset * 2))}px`,
        overflowY: "auto",
      });
    };

    const queueUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePosition);
    };

    timeoutId = window.setTimeout(queueUpdate, 220);
    window.addEventListener("resize", queueUpdate);
    window.addEventListener("orientationchange", queueUpdate);
    window.addEventListener("scroll", queueUpdate, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", queueUpdate);
      window.removeEventListener("orientationchange", queueUpdate);
      window.removeEventListener("scroll", queueUpdate, true);
    };
  }, [showTutorial, tutorialStep, isTutorialMobileViewport, groupViewMode, showFramesEditorModal, showShareModal]);

  useEffect(() => {
    if (!showTutorial || !isGuestTutorialMode || !tutorialStep) return;

    if (tutorialStep.key === "share-button") {
      setShowFramePicker(false);
      closeFramesEditorModal();
      setShowShareModal(false);
      setGroupViewMode("preferences");
      return;
    }

    if (tutorialStep.key === "share-modal" || tutorialStep.key === "open-page") {
      setShowFramePicker(false);
      closeFramesEditorModal();
      setGroupViewMode("preferences");
      setShowShareModal(true);
      void ensureTutorialSharePrepared();
    }
  }, [
    closeFramesEditorModal,
    ensureTutorialSharePrepared,
    showTutorial,
    tutorialStep,
  ]);

  // ── Pick a draft directly into group (no API call needed) ──
  const handlePickDraft = (draft) => {
    if (!user?.email || !activeGroup?.id) {
      showToast("info", "Login untuk menambahkan draft ke group.");
      return;
    }

    if (framePickerIntent?.type === "replace" && framePickerIntent.replaceDraftId) {
      replaceDraftInActiveGroup(framePickerIntent.replaceDraftId, draft.id);
      closeFramePicker();
      showToast("success", `"${draft.title || "Draft"}" berhasil menggantikan frame di group!`);
      return;
    }

    updateActiveGroupDraftIds((currentIds) => (
      currentIds.includes(draft.id) ? currentIds : [...currentIds, draft.id]
    ));
    closeFramePicker();
    showToast("success", `"${draft.title || "Draft"}" ditambahkan ke group!`);
  };

  const renderStandaloneFramePickerModal = () => {
    if (!showFramePicker) return null;

    return (
      <div className={`shares-modal-backdrop${isFramePickerTutorialStep ? " shares-modal-backdrop--tutorial-picker" : ""}`} onClick={closeFramePicker}>
        <div className={`shares-modal shares-modal--picker${isFramePickerTutorialStep ? " shares-modal--tutorial-focus" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="shares-modal-header">
            <h2 className="shares-modal-title">{framePickerIntent?.type === "replace" ? "Ganti Frame" : "Pilih Frame"}</h2>
            <button type="button" className="shares-modal-close" onClick={closeFramePicker}><X size={20} /></button>
          </div>

          <div className="shares-picker-toggles">
            <div
              ref={registerTutorialTarget("framePickerSources")}
              className={`shares-picker-toggle-group${isTutorialTargetActive("framePickerSources") ? " shares-tutorial-highlight" : ""}`}
            >
              <button
                type="button"
                className={`shares-picker-toggle${framePickerSource === "fremio" ? " shares-picker-toggle--active" : ""}`}
                onClick={() => setFramePickerSource("fremio")}
              >
                By Fremio
              </button>
              <button
                type="button"
                ref={registerTutorialTarget("framePickerDraftSource")}
                className={`shares-picker-toggle${framePickerSource === "draft" ? " shares-picker-toggle--active" : ""}${isTutorialTargetActive("framePickerDraftSource") ? " shares-tutorial-highlight" : ""}`}
                onClick={() => setFramePickerSource("draft")}
              >
                Draft
              </button>
            </div>
            <div className="shares-picker-search">
              <Search size={15} />
              <input
                type="text"
                placeholder={framePickerSource === "draft" ? "Cari nama draft..." : "Cari nama frame..."}
                value={framePickerSearch}
                onChange={(e) => setFramePickerSearch(e.target.value)}
              />
            </div>
          </div>

          {!hasAccess && framePickerSource !== "draft" && (
            <div className="shares-picker-access-notice">
              🔒 Kamu hanya bisa menambahkan <strong>frame gratis</strong>. <a href="/pricing" onClick={closeFramePicker}>Upgrade membership</a> untuk akses semua frame.
            </div>
          )}

          {!hasAccess && framePickerSource === "draft" && pickerDraftAccess.lockedDraftsCount > 0 && (
            <div className="shares-picker-access-notice">
              🔒 Tanpa membership, draft membership tetap terkunci. {pickerDraftAccess.lockedDraftsCount} draft membership tidak bisa dipakai.
              <a href="/pricing" onClick={closeFramePicker}> Upgrade membership</a>
            </div>
          )}

          <p className="shares-picker-hint">
            {framePickerSource === "draft"
              ? framePickerIntent?.type === "replace"
                ? "Klik draft untuk menggantikan frame yang sedang dipilih di group."
                : "Klik draft untuk langsung menambahkannya ke group."
              : framePickerIntent?.type === "replace"
                ? "Klik frame untuk menggantikan frame yang sedang dipilih di group."
                : "Klik frame untuk menambahkan ke group. Frame yang sudah ada di group tidak bisa dipilih ulang di sini — hapus lewat tampilan group."}
          </p>

          {framePickerSource === "draft" ? (
            loadingDrafts ? (
              <div className="shares-loading"><div className="shares-spinner" /><span>Memuat draft...</span></div>
            ) : filteredPickerDrafts.length === 0 ? (
              <div className="shares-empty-hint" style={{ textAlign: "center", padding: "40px 0" }}>
                {framePickerSearch
                  ? `Tidak ada draft dengan nama "${framePickerSearch}"`
                  : pickerDraftsSource.length === 0
                    ? "Belum ada draft. Buat desain dulu di halaman Create."
                    : pickerDraftAccess.accessibleDrafts.length === 0
                      ? "Semua draft yang bisa diakses sudah ada di group ini."
                      : "Semua draft sudah ada di group ini."}
              </div>
            ) : (
              <div className="shares-picker-grid">
                {filteredPickerDrafts.map((draft, i) => (
                  <button
                    key={draft.id || i}
                    type="button"
                    className="shares-picker-card"
                    onClick={() => handlePickDraft(draft)}
                  >
                    <div className="shares-picker-card__img">
                      {draft.thumbnail || draft.preview || draft.thumbnailUrl ? (
                        <img src={draft.thumbnail || draft.preview || draft.thumbnailUrl} alt={draft.title || "Draft"} />
                      ) : (
                        <span style={{ fontSize: "11px", color: "#9ca3af" }}>No preview</span>
                      )}
                    </div>
                    <div className="shares-picker-card__name">{draft.title?.trim() || `Draft ${i + 1}`}</div>
                  </button>
                ))}
              </div>
            )
          ) : (
            loadingFrames ? (
              <div className="shares-loading"><div className="shares-spinner" /><span>Memuat frame...</span></div>
            ) : filteredPickerFrames.length === 0 ? (
              <div className="shares-empty-hint" style={{ textAlign: "center", padding: "40px 0" }}>
                {framePickerSearch ? `Tidak ada frame dengan nama "${framePickerSearch}"` : "Belum ada frame tersedia."}
              </div>
            ) : (
              <div className="shares-picker-grid">
                {filteredPickerFrames.map((frame) => {
                  const imgUrl = getFrameImageUrl(frame);
                  const locked = isFrameLocked(frame);
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      className={`shares-picker-card${locked ? " shares-picker-card--locked" : ""}`}
                      onClick={() => {
                        if (locked) {
                          showToast("info", "Frame ini khusus member. Upgrade untuk menggunakannya.");
                          return;
                        }
                        handlePickFrame(frame);
                      }}
                      title={locked ? "Khusus member — upgrade untuk akses" : frame.name}
                    >
                      <div className="shares-picker-card__img">
                        {imgUrl ? (
                          <img src={imgUrl} alt={frame.name} style={{ opacity: locked ? 0.45 : 1 }} />
                        ) : (
                          <span style={{ fontSize: "11px", color: "#9ca3af" }}>No preview</span>
                        )}
                        {locked && <div className="shares-picker-card__lock">🔒</div>}
                      </div>
                      <div className="shares-picker-card__name" style={{ color: locked ? "#9ca3af" : undefined }}>{frame.name}</div>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  // ── Thumbnail renderer ──
  const renderDraftThumbnail = (draft) => {
    const src = draft.thumbnail || draft.preview || draft.thumbnailUrl || draft.thumbnail_path || draft.previewImage;
    if (src) return (
      <img src={src} alt={draft.title || "Draft"} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "4px" }} />
    );
    return (
      <div style={{ position: "absolute", inset: "12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
        <span style={{ fontSize: "12px" }}>Gambar tidak tersedia</span>
      </div>
    );
  };

  // ── Draft card inside group (shows checkmark overlay when in picker mode) ──
  function DraftCard({ draft, index, inGroup }) {
    const description = draft?.description || "";
    const maxLength = 50;
    const shouldTruncate = description.length > maxLength;
    const isExpanded = expandedDescriptions.has(draft?.id);
    const displayDescription = isExpanded ? description : description.slice(0, maxLength);

    return (
      <div
        className="shares-frame-card"
        style={{ border: inGroup ? "2px solid #e0b7a9" : "2px solid transparent" }}
      >
        {inGroup ? (
          /* Checkmark badge = click to REMOVE from group */
          <div
            className="shares-frame-card__check"
            title="Hapus dari group"
            onClick={(e) => {
              e.stopPropagation();
              if (!activeGroup?.id) return;
              handleToggleDraftInGroup(activeGroup.id, draft.id);
            }}
            style={{ cursor: "pointer" }}
          >
            <X size={13} />
          </div>
        ) : (
          /* Plus badge = click whole card to ADD (only shown outside group view) */
          <div
            className="shares-frame-card__plus"
            onClick={() => {
              if (!activeGroup?.id) return;
              handleToggleDraftInGroup(activeGroup.id, draft.id);
            }}
          >+</div>
        )}
        <div className="shares-frame-card__img">
          {renderDraftThumbnail(draft)}
        </div>
        <div className="shares-frame-card__name">
          {draft?.title?.trim() || `Draft - ${index + 1}`}
        </div>
        {description && (
          <div className="shares-frame-card__desc">
            <span>{displayDescription}{shouldTruncate && !isExpanded && "..."}</span>
            {shouldTruncate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedDescriptions((prev) => {
                    const next = new Set(prev);
                    if (isExpanded) next.delete(draft.id); else next.add(draft.id);
                    return next;
                  });
                }}
                className="shares-frame-card__more"
              >
                {isExpanded ? "Sembunyikan" : "Selengkapnya"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Preferences panel ──
  const groupDraftsForPreview = useMemo(() => {
    const combined = isTutorialGroupActive
      ? [
          ...tutorialFrames,
          ...sortedDrafts.filter((sd) => !tutorialFrames.some((tf) => tf.id === sd.id)),
        ]
      : sortedDrafts;
    return combined.filter((d) => groupDraftIdSet.has(d?.id));
  }, [isTutorialGroupActive, tutorialFrames, sortedDrafts, groupDraftIdSet]);

  const renderFramesSliderControl = useCallback((label, value, options) => {
    const {
      min,
      max,
      step = 1,
      onChange,
      formatValue = (current) => String(current),
    } = options;

    return (
      <div className="shares-pref-row">
        <label className="shares-pref-label">{label}</label>
        <div className="shares-pref-ctrl shares-pref-ctrl--slider">
          <input
            className="shares-pref-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="shares-pref-slider__value">{formatValue(value)}</span>
        </div>
      </div>
    );
  }, []);

  const renderFramesElementStyleControls = useCallback((label, key, defaults, options = {}) => {
    const { hidePosition = false, allowJustify = true } = options;
    const prefs = activeGroup?.preferences || {};
    const alignOptions = allowJustify
      ? TEXT_ALIGN_OPTIONS
      : TEXT_ALIGN_OPTIONS.filter((option) => option.value !== "justify");
    const rawTextAlign = prefs?.[`${key}TextAlign`] || defaults.textAlign;
    const textAlign = alignOptions.some((option) => option.value === rawTextAlign)
      ? rawTextAlign
      : defaults.textAlign;
    const fontFamily = prefs?.[`${key}FontFamily`] || defaults.fontFamily;
    const fontSize = clampPositive(prefs?.[`${key}FontSize`], defaults.fontSize, 10, 72);
    const fontSizeDraft = Object.prototype.hasOwnProperty.call(fontSizeDrafts, key)
      ? fontSizeDrafts[key]
      : String(fontSize);
    const isFontPickerOpen = openFontPickerKey === key;
    const isFontSizePickerOpen = openFontSizePickerKey === key;
    const floatingFontMenuStyle = isFontPickerOpen
      ? getFloatingMenuStyle(fontPickerAnchorRefs.current[key], { minWidth: 280, preferredMaxHeight: 320 })
      : undefined;
    const floatingFontSizeMenuStyle = isFontSizePickerOpen
      ? getFloatingMenuStyle(fontSizePickerAnchorRefs.current[key], { align: "right", minWidth: 112, preferredMaxHeight: 240 })
      : undefined;

    const clearFontSizeDraft = () => {
      setFontSizeDrafts((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, key)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };

    const handleAlignChange = (value) => {
      const nextPatch = {
        [`${key}TextAlign`]: value,
      };
      if (!hidePosition) {
        nextPatch[`${key}Position`] = value;
      }
      handleUpdateGroupPref(nextPatch);
    };

    const handleFontSizeChange = (value) => {
      setFontSizeDrafts((current) => ({
        ...current,
        [key]: String(value).replace(/[^0-9]/g, "").slice(0, 2),
      }));
    };

    const commitFontSizeDraft = () => {
      const numeric = Number(fontSizeDraft);
      clearFontSizeDraft();
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      handleUpdateGroupPref({ [`${key}FontSize`]: clampRange(numeric, defaults.fontSize, 10, 72) });
    };

    const nudgeFontSize = (delta) => {
      const numericDraft = Number(fontSizeDraft);
      const baseSize = Number.isFinite(numericDraft) && numericDraft > 0
        ? clampRange(numericDraft, fontSize, 10, 72)
        : fontSize;
      clearFontSizeDraft();
      handleUpdateGroupPref({ [`${key}FontSize`]: clampRange(baseSize + delta, defaults.fontSize, 10, 72) });
    };

    return (
      <>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Perataan</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--text-tools">
            <div className="shares-text-align-group" role="group" aria-label={`Perataan ${label}`}>
              {alignOptions.map((option) => (
                <button
                  key={`${key}-align-${option.value}`}
                  type="button"
                  className={`shares-text-align-btn${textAlign === option.value ? " shares-text-align-btn--active" : ""}`}
                  onClick={() => handleAlignChange(option.value)}
                  aria-pressed={textAlign === option.value}
                  title={option.label}
                >
                  <img src={option.icon} alt={option.label} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Font</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--text-tools">
            <div className="shares-font-type-field">
              <span className="shares-font-type-field__icon" aria-hidden="true">
                <img src={fontTypeIcon} alt="" />
              </span>
              <div className="shares-font-picker" ref={registerFontPickerAnchorRef(key)}>
                <button
                  type="button"
                  className={`shares-font-picker__trigger${isFontPickerOpen ? " shares-font-picker__trigger--open" : ""}`}
                  onClick={() => setOpenFontPickerKey((current) => current === key ? null : key)}
                  aria-haspopup="listbox"
                  aria-expanded={isFontPickerOpen}
                >
                  <span className="shares-font-picker__value" style={{ fontFamily }}>
                    {fontFamily}
                  </span>
                  <span className="shares-font-picker__chevron" aria-hidden="true">▾</span>
                </button>
                {isFontPickerOpen && (
                  <div
                    className="shares-font-picker__menu shares-font-picker__menu--floating"
                    role="listbox"
                    aria-label={`Jenis font ${label}`}
                    style={floatingFontMenuStyle}
                  >
                    {EDITOR_FONT_FAMILIES.map((font) => (
                      <button
                        key={`${key}-${font}`}
                        type="button"
                        className={`shares-font-picker__option${fontFamily === font ? " shares-font-picker__option--active" : ""}`}
                        style={{ fontFamily: font }}
                        onClick={() => {
                          handleUpdateGroupPref({ [`${key}FontFamily`]: font });
                          setOpenFontPickerKey(null);
                        }}
                        role="option"
                        aria-selected={fontFamily === font}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Ukuran</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--text-tools">
            <div className="shares-font-size-field">
              <button
                type="button"
                className="shares-font-size-btn shares-font-size-btn--decrease"
                onClick={() => nudgeFontSize(-1)}
                aria-label={`Kecilkan ukuran ${label}`}
                title={`Kecilkan ukuran ${label}`}
              >
                <span className="shares-font-size-btn__icon" aria-hidden="true">
                  <span className="shares-font-size-btn__base shares-font-size-btn__base--decrease">T</span>
                  <span className="shares-font-size-btn__mark">-</span>
                </span>
              </button>
              <div className="shares-font-size-picker" data-key={key} ref={registerFontSizePickerAnchorRef(key)}>
                <div className={`shares-font-size-picker__field${isFontSizePickerOpen ? " shares-font-size-picker__field--open" : ""}`}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fontSizeDraft}
                    onChange={(e) => handleFontSizeChange(e.target.value)}
                    onBlur={(e) => {
                      if (e.relatedTarget instanceof Element && e.relatedTarget.closest(`.shares-font-size-picker[data-key="${key}"]`)) {
                        return;
                      }
                      commitFontSizeDraft();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitFontSizeDraft();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="shares-font-size-picker__trigger"
                    onClick={() => setOpenFontSizePickerKey((current) => current === key ? null : key)}
                    aria-haspopup="listbox"
                    aria-expanded={isFontSizePickerOpen}
                  >
                    <span className="shares-font-size-picker__chevron" aria-hidden="true">▾</span>
                  </button>
                </div>
                {isFontSizePickerOpen && (
                  <div
                    className="shares-font-size-picker__menu shares-font-size-picker__menu--floating"
                    role="listbox"
                    aria-label={`Preset ukuran ${label}`}
                    style={floatingFontSizeMenuStyle}
                  >
                    {FONT_SIZE_OPTIONS.map((size) => (
                      <button
                        key={`${key}-${size}`}
                        type="button"
                        className={`shares-font-size-picker__option${fontSize === size ? " shares-font-size-picker__option--active" : ""}`}
                        onClick={() => {
                          clearFontSizeDraft();
                          handleUpdateGroupPref({ [`${key}FontSize`]: size });
                          setOpenFontSizePickerKey(null);
                        }}
                        role="option"
                        aria-selected={fontSize === size}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="shares-font-size-btn shares-font-size-btn--increase"
                onClick={() => nudgeFontSize(1)}
                aria-label={`Besarkan ukuran ${label}`}
                title={`Besarkan ukuran ${label}`}
              >
                <span className="shares-font-size-btn__icon" aria-hidden="true">
                  <span className="shares-font-size-btn__base shares-font-size-btn__base--increase">T</span>
                  <span className="shares-font-size-btn__mark">+</span>
                </span>
              </button>
            </div>
          </div>
        </div>
        {!hidePosition && false && (
          <div className="shares-pref-row">
            <label className="shares-pref-label">Posisi {label}</label>
            <div className="shares-pref-ctrl">
              <input
                type="text"
                value={prefs?.[`${key}Position`] || defaults.position}
                readOnly
              />
            </div>
          </div>
        )}
      </>
    );
  }, [activeGroup?.preferences, fontSizeDrafts, handleUpdateGroupPref, openFontPickerKey, openFontSizePickerKey]);

  const renderInfoBoxControls = useCallback(() => {
    const prefs = activeGroup?.preferences || {};
    return (
      <>
        <div className="shares-pref-section-label">Wadah</div>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Warna Wadah</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--color">
            <input type="color" value={prefs.infoBoxColor || "#ffffff"} onChange={(e) => handleUpdateGroupPref({ infoBoxColor: e.target.value })} />
            <span className="shares-pref-hex">{prefs.infoBoxColor || "#ffffff"}</span>
          </div>
        </div>
        {renderFramesSliderControl("Transparansi", prefs.infoBoxOpacity ?? 100, {
          min: 0,
          max: 100,
          onChange: (value) => handleUpdateGroupPref({ infoBoxOpacity: clampRange(value, 100, 0, 100) }),
          formatValue: (value) => `${value}%`,
        })}
        {renderFramesSliderControl("Padding Horizontal", prefs.infoBoxPaddingX ?? 18, {
          min: 0,
          max: 160,
          onChange: (value) => handleUpdateGroupPref({ infoBoxPaddingX: clampRange(value, 18, 0, 160) }),
          formatValue: (value) => `${value}px`,
        })}
        {renderFramesSliderControl("Padding Vertikal", prefs.infoBoxPaddingY ?? 14, {
          min: 0,
          max: 120,
          onChange: (value) => handleUpdateGroupPref({ infoBoxPaddingY: clampRange(value, 14, 0, 120) }),
          formatValue: (value) => `${value}px`,
        })}
        {renderFramesSliderControl("Roundness", prefs.infoBoxRadius ?? 0, {
          min: 0,
          max: 80,
          onChange: (value) => handleUpdateGroupPref({ infoBoxRadius: clampRange(value, 0, 0, 80) }),
          formatValue: (value) => `${value}px`,
        })}
      </>
    );
  }, [activeGroup?.preferences, handleUpdateGroupPref, renderFramesSliderControl]);

  const renderLogoControls = useCallback(() => {
    const prefs = activeGroup?.preferences || {};
    const logoUploadInputId = `shares-logo-upload-${activeGroup?.id || "default"}`;

    return (
      <>
        <div className="shares-pref-section-label">Logo</div>
        <div className="shares-pref-row shares-pref-row--col">
          <label className="shares-pref-label">Logo Brand / Event</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--stack">
            <input
              id={logoUploadInputId}
              className="shares-logo-upload-input"
              type="file"
              accept="image/*"
              onChange={(e) => handleLogoFileChange(e.target.files?.[0])}
            />
            <label htmlFor={logoUploadInputId} className="shares-logo-upload-btn">
              Masukkan logo Brand / Event kamu
            </label>
            <p className="shares-logo-upload-hint">
              {prefs.logoFileName
                ? `File terpilih: ${prefs.logoFileName}`
                : prefs.logoDataUrl
                  ? "Logo brand / event sudah dimuat dan siap dipakai di preview."
                  : "Gunakan logo brand atau event supaya halaman share terlihat lebih personal."}
            </p>
            {prefs.logoDataUrl && (
              <button type="button" className="shares-pref-clear" onClick={() => handleUpdateGroupPref({ logoDataUrl: null, logoFileName: "" })}>Hapus Logo</button>
            )}
          </div>
        </div>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Posisi Logo</label>
          <div className="shares-pref-ctrl">
            <select
              value={prefs.logoPosition || "center"}
              onChange={(e) => handleUpdateGroupPref({ logoPosition: e.target.value })}
            >
              {HORIZONTAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        {renderFramesSliderControl("Ukuran Logo", prefs.logoWidth || 220, {
          min: 80,
          max: 280,
          onChange: (value) => handleUpdateGroupPref({ logoWidth: clampPositive(value, 220, 80, 280) }),
          formatValue: (value) => `${value}px`,
        })}
      </>
    );
  }, [activeGroup?.id, activeGroup?.preferences, handleLogoFileChange, handleUpdateGroupPref, renderFramesSliderControl]);

  const renderBasicPageAppearanceControls = useCallback(() => {
    const prefs = activeGroup?.preferences || {};
    const isTakeMoment = prefPage === "takemoment";
    const headerKey = isTakeMoment ? "takeMomentHeaderColor" : "editPhotoHeaderColor";
    const backgroundKey = isTakeMoment ? "takeMomentBgColor" : "editPhotoBgColor";
    const headerFallback = "#ffffff";
    const backgroundFallback = "#fdf7f4";

    return (
      <>
        <div className="shares-pref-section-label">Warna Halaman</div>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Header Color</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--color">
            <input
              type="color"
              value={prefs?.[headerKey] || headerFallback}
              onChange={(e) => handleUpdateGroupPref({ [headerKey]: e.target.value })}
            />
            <span className="shares-pref-hex">{prefs?.[headerKey] || headerFallback}</span>
          </div>
        </div>
        <div className="shares-pref-row">
          <label className="shares-pref-label">Background</label>
          <div className="shares-pref-ctrl shares-pref-ctrl--color">
            <input
              type="color"
              value={prefs?.[backgroundKey] || backgroundFallback}
              onChange={(e) => handleUpdateGroupPref({ [backgroundKey]: e.target.value })}
            />
            <span className="shares-pref-hex">{prefs?.[backgroundKey] || backgroundFallback}</span>
          </div>
        </div>
      </>
    );
  }, [activeGroup?.preferences, handleUpdateGroupPref, prefPage]);

  const editorTargets = prefPage === "frames" ? FRAME_EDITOR_TARGETS : (BASIC_PAGE_EDITOR_TARGETS[prefPage] || []);
  const normalizedFramesEditorSelection = framesEditorSelection;
  const frameSelectionMatch = /^frame-(\d+)$/.exec(normalizedFramesEditorSelection || "");
  const infoSubtitleSelectionMatch = /^infoSubtitle-(\d+)$/.exec(normalizedFramesEditorSelection || "");
  const textSelectionMatch = /^text-(\d+)$/.exec(normalizedFramesEditorSelection || "");
  const selectedFrameIndex = frameSelectionMatch ? Number(frameSelectionMatch[1]) : null;
  const selectedInfoSubtitleColumnIndex = infoSubtitleSelectionMatch ? Number(infoSubtitleSelectionMatch[1]) : null;
  const selectedTextColumnIndex = textSelectionMatch ? Number(textSelectionMatch[1]) : null;
  const selectedFrameEditorTarget = selectedFrameIndex !== null
    ? { key: normalizedFramesEditorSelection, label: `Frame ${selectedFrameIndex + 1}` }
    : selectedInfoSubtitleColumnIndex !== null
    ? { key: normalizedFramesEditorSelection, label: `Sub Judul Kolom ${selectedInfoSubtitleColumnIndex + 1}` }
    : selectedTextColumnIndex !== null
      ? { key: normalizedFramesEditorSelection, label: `Teks Kolom ${selectedTextColumnIndex + 1}` }
      : editorTargets.find((item) => item.key === normalizedFramesEditorSelection) || null;
  const framesEditorPopoverInlineStyle = framesEditorPopoverPosition
    ? {
        top: `${Math.round(framesEditorPopoverPosition.y)}px`,
        left: `${Math.round(framesEditorPopoverPosition.x)}px`,
        right: "auto",
      }
    : undefined;

  useEffect(() => {
    if (!framesEditorActive || !selectedFrameEditorTarget) return;

    const targetSection = framesEditorFocusSection || normalizedFramesEditorSelection;
    const rafId = window.requestAnimationFrame(() => {
      scrollFramesEditorToSection(targetSection);
    });
    const focusTimer = inlinePreviewEditingField
      ? null
      : window.setTimeout(() => {
          focusFramesEditorField(framesEditorFocusField);
        }, 180);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (focusTimer) window.clearTimeout(focusTimer);
    };
  }, [
    focusFramesEditorField,
    framesEditorFocusField,
    framesEditorFocusSection,
    inlinePreviewEditingField,
    normalizedFramesEditorSelection,
    scrollFramesEditorToSection,
    selectedFrameEditorTarget,
    framesEditorActive,
  ]);

  const renderFramesEditorShell = (standalone = false) => {
    const titleLabel = (PREVIEW_EDITOR_PAGES.find((item) => item.key === prefPage)?.deviceLabel) || "Frames";
    const handleClose = standalone ? closeStandaloneFramesEditor : closeFramesEditorModal;
    const handleBackClick = standalone
      ? () => { if (activeGroupNeedsSync) { setShowUnsavedConfirm(true); } else { closeStandaloneFramesEditor(); } }
      : handleClose;

    if (standalone) {
      return (
        <div className="shares-standalone-frame-editor">
          {showUnsavedConfirm && (
            <div className="shares-unsaved-confirm-overlay">
              <div className="shares-unsaved-confirm-dialog">
                <p className="shares-unsaved-confirm-title">Simpan perubahan?</p>
                <p className="shares-unsaved-confirm-subtitle">Kamu punya perubahan yang belum tersimpan.</p>
                <button
                  type="button"
                  className="shares-action-btn shares-action-btn--primary shares-unsaved-confirm-btn"
                  onClick={async () => { setShowUnsavedConfirm(false); await handleSavePreferences(); closeStandaloneFramesEditor(); }}
                  disabled={isSavingPrefs}
                >
                  {isSavingPrefs ? "Menyimpan..." : "Ya, simpan"}
                </button>
                <button
                  type="button"
                  className="shares-action-btn shares-unsaved-confirm-btn shares-unsaved-confirm-btn--dismiss"
                  onClick={() => { setShowUnsavedConfirm(false); closeStandaloneFramesEditor(); }}
                >
                  Tidak simpan perubahan
                </button>
              </div>
            </div>
          )}
          <div className="shares-standalone-frame-editor__toolbar">
            <div className="shares-standalone-frame-editor__back-group">
              <button type="button" className="shares-frame-editor-modal__close shares-standalone-frame-editor__back" onClick={handleBackClick}>
                <ChevronLeft size={18} />
                <span>Kembali</span>
              </button>
              <button
                type="button"
                className="shares-standalone-save-btn"
                onClick={handleSavePreferences}
                disabled={isSavingPrefs}
              >
                {isSavingPrefs ? "Menyimpan..." : "Simpan"}
              </button>
              {isTutorialGroupActive && (
                <button
                  type="button"
                  className="shares-action-btn shares-action-btn--open-page"
                  onClick={handleTutorialOpenPage}
                  disabled={isGeneratingLink}
                >
                  <ExternalLink size={15} />
                  <span>{isGeneratingLink ? "Membuka..." : "Coba Secara Langsung"}</span>
                </button>
              )}
            </div>

            <div className="shares-standalone-frame-editor__toolbar-group">
              <div className="shares-pref-page-tabs shares-pref-page-tabs--editor shares-pref-page-tabs--standalone">
                {PREVIEW_EDITOR_PAGES.map(({ key, shortLabel }) => (
                  <button
                    key={key}
                    type="button"
                    className={`shares-pref-page-tab${prefPage === key ? " shares-pref-page-tab--active" : ""}`}
                    onClick={() => {
                      setPrefPage(key);
                    }}
                  >
                    {shortLabel}
                  </button>
                ))}
              </div>

              <div className="shares-pref-device-toggle shares-pref-device-toggle--editor shares-pref-device-toggle--standalone" aria-label="Pilih perangkat preview">
                <button
                  type="button"
                  className={`shares-pref-device-btn${prefDevice === "mobile" ? " shares-pref-device-btn--active" : ""}`}
                  onClick={() => setPrefDevice("mobile")}
                  aria-pressed={prefDevice === "mobile"}
                >Mobile</button>
                <button
                  type="button"
                  className={`shares-pref-device-btn${prefDevice === "desktop" ? " shares-pref-device-btn--active" : ""}`}
                  onClick={() => setPrefDevice("desktop")}
                  aria-pressed={prefDevice === "desktop"}
                >Desktop</button>
              </div>
            </div>
          </div>

          <div className="shares-standalone-frame-editor__viewport">
            {renderPagePreview(prefPage, prefDevice, "standalone")}
          </div>

          {selectedFrameEditorTarget ? (
            <div className="shares-standalone-frame-editor__popover shares-frame-editor-popover" ref={framesEditorPopoverRef} style={framesEditorPopoverInlineStyle}>
              {renderFramesInteractiveInspector()}
            </div>
          ) : null}

        </div>
      );
    }

    return (
      <div className={`shares-frame-editor-modal${standalone ? " shares-frame-editor-modal--standalone" : ""}`}>
        <div className="shares-frame-editor-modal__topbar">
          <div className="shares-frame-editor-modal__left-actions">
            <button type="button" className="shares-frame-editor-modal__close" onClick={handleClose}>
              <ChevronLeft size={18} />
              <span>{standalone ? "Kembali" : "Close"}</span>
            </button>
          </div>

          <div className="shares-frame-editor-modal__heading">
            <span className="shares-frame-editor-modal__eyebrow">Full Preview</span>
            <strong className="shares-frame-editor-modal__title">
              Edit Tampilan {titleLabel} {prefDevice === "desktop" ? "Desktop" : "Mobile"}
            </strong>
          </div>

          <div
            ref={registerTutorialTarget("editorControls")}
            className={`shares-frame-editor-modal__controls${isTutorialTargetActive("editorControls") ? " shares-tutorial-highlight" : ""}`}
          >
            <div className="shares-pref-page-tabs shares-pref-page-tabs--editor">
              {PREVIEW_EDITOR_PAGES.map(({ key, shortLabel }) => (
                <button
                  key={key}
                  type="button"
                  className={`shares-pref-page-tab${prefPage === key ? " shares-pref-page-tab--active" : ""}`}
                  onClick={() => {
                    setPrefPage(key);
                    if (!showTutorial) {
                      resetPrefDeviceForViewport();
                    }
                  }}
                >
                  {shortLabel}
                </button>
              ))}
            </div>

            <div className="shares-pref-device-toggle shares-pref-device-toggle--editor" aria-label="Pilih perangkat preview">
              <button
                type="button"
                className={`shares-pref-device-btn${prefDevice === "mobile" ? " shares-pref-device-btn--active" : ""}`}
                onClick={() => setPrefDevice("mobile")}
                aria-pressed={prefDevice === "mobile"}
              >Mobile</button>
              <button
                type="button"
                className={`shares-pref-device-btn${prefDevice === "desktop" ? " shares-pref-device-btn--active" : ""}`}
                onClick={() => setPrefDevice("desktop")}
                aria-pressed={prefDevice === "desktop"}
              >Desktop</button>
            </div>
          </div>
        </div>

        <div className={`shares-frame-editor-modal__body${isPreviewTutorialStep ? " shares-frame-editor-modal__body--tutorial-focus" : ""}`}>
          <div
            ref={registerTutorialTarget("previewStage")}
            className={`shares-frame-editor-stage${isTutorialTargetActive("previewStage") || isPreviewTutorialStep ? " shares-tutorial-highlight" : ""}`}
          >
            {renderPagePreview(prefPage, prefDevice, "editor")}
          </div>

          {selectedFrameEditorTarget ? (
            <div className={`shares-frame-editor-popover${isPreviewTutorialStep ? " shares-tutorial-highlight" : ""}`} ref={framesEditorPopoverRef} style={framesEditorPopoverInlineStyle}>
              {renderFramesInteractiveInspector()}
            </div>
          ) : null}
        </div>

        <div className="shares-frame-editor-modal__footer">
          <button
            type="button"
            className="shares-action-btn shares-action-btn--primary shares-frame-editor-modal__save"
            onClick={handleSavePreferences}
            disabled={isSavingPrefs}
          >
            {isSavingPrefs ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!inlinePreviewEditingField) return;

    const rafId = window.requestAnimationFrame(() => {
      focusInlinePreviewField(inlinePreviewEditingField);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [focusInlinePreviewField, inlinePreviewEditingField]);

  const renderFrameTextContentControl = (label, key, placeholder, multiline = false, focusFieldKey = null) => {
    const value = activeGroup?.preferences?.[key] || "";
    return (
      <div className="shares-pref-row shares-pref-row--col">
        <label className="shares-pref-label">{label}</label>
        <div className="shares-pref-ctrl shares-pref-ctrl--stack">
          {multiline ? (
            <textarea
              ref={registerFramesEditorFieldRef(focusFieldKey || key)}
              rows={4}
              value={value}
              placeholder={placeholder}
              onChange={(e) => handleUpdateGroupPref({ [key]: e.target.value })}
            />
          ) : (
            <input
              ref={registerFramesEditorFieldRef(focusFieldKey || key)}
              type="text"
              value={value}
              placeholder={placeholder}
              onChange={(e) => handleUpdateGroupPref({ [key]: e.target.value })}
            />
          )}
        </div>
      </div>
    );
  };

  const renderInfoLayoutControls = () => {
    const prefs = activeGroup?.preferences || {};
    const infoColumnsCount = getInfoColumnsCount(prefs);

    const handleLayoutChange = (value) => {
      const nextCount = clampRange(value, 1, 1, MAX_INFO_COLUMNS);
      const nextColumns = normalizeInfoColumns(prefs.infoColumns);

      if (nextCount > 1 && !nextColumns[0].text && prefs.text) {
        nextColumns[0] = {
          ...nextColumns[0],
          text: prefs.text,
        };
      }

      const nextPatch = {
        infoColumnsCount: nextCount,
        infoColumns: nextColumns,
      };

      if (nextCount === 1 && !prefs.text && nextColumns[0].text) {
        nextPatch.text = nextColumns[0].text;
      }

      handleUpdateGroupPref(nextPatch);
    };

    return (
      <div className="shares-pref-row">
        <label className="shares-pref-label">Layout Isi</label>
        <div className="shares-pref-ctrl">
          <select value={infoColumnsCount} onChange={(e) => handleLayoutChange(e.target.value)}>
            <option value={1}>1 Kolom</option>
            <option value={2}>2 Kolom</option>
            <option value={3}>3 Kolom</option>
          </select>
        </div>
      </div>
    );
  };

  const renderInfoSubtitleContentControls = (columnIndex = null) => {
    const prefs = activeGroup?.preferences || {};
    const infoColumnsCount = getInfoColumnsCount(prefs);
    const infoColumns = normalizeInfoColumns(prefs.infoColumns);

    if (infoColumnsCount <= 1) return null;

    const updateInfoColumn = (index, patch) => {
      const nextColumns = normalizeInfoColumns(prefs.infoColumns);
      nextColumns[index] = { ...nextColumns[index], ...patch };
      handleUpdateGroupPref({ infoColumns: nextColumns });
    };

    return (
      <div className="shares-pref-row shares-pref-row--col">
        <label className="shares-pref-label">Sub Judul</label>
        <div className="shares-pref-ctrl shares-pref-ctrl--stack" style={{ width: "100%" }}>
          {(columnIndex === null ? Array.from({ length: infoColumnsCount }, (_, index) => index) : [columnIndex]).map((index) => (
            <div
              key={`info-subtitle-column-${index}`}
              style={{
                width: "100%",
                border: "1px solid #ead8d1",
                borderRadius: "12px",
                background: "#fffaf7",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#7a4c40",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Kolom {index + 1}
              </div>
              <input
                ref={registerFramesEditorFieldRef(`info-column-${index}-subtitle`)}
                type="text"
                value={infoColumns[index].subtitle}
                placeholder={`Sub judul ${index + 1}`}
                onChange={(e) => updateInfoColumn(index, { subtitle: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderInfoTextContentControls = (columnIndex = null) => {
    const prefs = activeGroup?.preferences || {};
    const infoColumnsCount = getInfoColumnsCount(prefs);
    const infoColumns = normalizeInfoColumns(prefs.infoColumns);

    if (infoColumnsCount === 1) {
      return renderFrameTextContentControl("Teks", "text", "Deskripsi singkat...", true, "text");
    }

    const updateInfoColumn = (index, patch) => {
      const nextColumns = normalizeInfoColumns(prefs.infoColumns);
      nextColumns[index] = { ...nextColumns[index], ...patch };
      handleUpdateGroupPref({ infoColumns: nextColumns });
    };

    return (
      <div className="shares-pref-row shares-pref-row--col">
        <label className="shares-pref-label">Teks</label>
        <div className="shares-pref-ctrl shares-pref-ctrl--stack" style={{ width: "100%" }}>
          {(columnIndex === null ? Array.from({ length: infoColumnsCount }, (_, index) => index) : [columnIndex]).map((index) => (
            <div
              key={`info-text-column-${index}`}
              style={{
                width: "100%",
                border: "1px solid #ead8d1",
                borderRadius: "12px",
                background: "#fffaf7",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#7a4c40",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Kolom {index + 1}
              </div>
              <textarea
                ref={registerFramesEditorFieldRef(`info-column-${index}-text`)}
                rows={4}
                value={infoColumns[index].text}
                placeholder={`Teks kolom ${index + 1}`}
                onChange={(e) => updateInfoColumn(index, { text: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFramesInteractiveInspector = () => {
    if (!selectedFrameEditorTarget) {
      return (
        <div className="shares-frame-inspector shares-frame-inspector--empty">
          <div className="shares-frame-inspector__head">
            <button
              type="button"
              className="shares-frame-inspector__close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={closeFramesEditorProperties}
              aria-label="Close properties"
            >
              <X size={16} />
            </button>
            <div className="shares-frame-inspector__intro">
              <h3 className="shares-frame-inspector__title">Properties</h3>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="shares-frame-inspector">
          <div
            className={`shares-frame-inspector__head shares-frame-inspector__head--draggable${isDraggingFramesEditorPopover ? " shares-frame-inspector__head--dragging" : ""}`}
            onPointerDown={handleFramesEditorPopoverPointerDown}
          >
            <button
              type="button"
              className="shares-frame-inspector__close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={closeFramesEditorProperties}
              aria-label="Close properties"
            >
              <X size={16} />
            </button>
            <div className="shares-frame-inspector__intro">
              <h3 className="shares-frame-inspector__title">{selectedFrameEditorTarget.label}</h3>
              <span className="shares-frame-inspector__drag-hint">Geser header ini untuk memindahkan panel</span>
            </div>
          </div>

          {normalizedFramesEditorSelection === "page" && (
            <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef("page")}>
              {prefPage === "frames" ? (
              <>
                <div className="shares-pref-section-label">Warna Halaman</div>
                <div className="shares-pref-row">
                  <label className="shares-pref-label">Header Color</label>
                  <div className="shares-pref-ctrl shares-pref-ctrl--color">
                    <input type="color" value={activeGroup?.preferences?.headerColor || "#ffffff"} onChange={(e) => handleUpdateGroupPref({ headerColor: e.target.value })} />
                    <span className="shares-pref-hex">{activeGroup?.preferences?.headerColor || "#ffffff"}</span>
                  </div>
                </div>
                <div className="shares-pref-row">
                  <label className="shares-pref-label">Background</label>
                  <div className="shares-pref-ctrl shares-pref-ctrl--color">
                    <input type="color" value={activeGroup?.preferences?.backgroundColor || "#fdf7f4"} onChange={(e) => handleUpdateGroupPref({ backgroundColor: e.target.value })} />
                    <span className="shares-pref-hex">{activeGroup?.preferences?.backgroundColor || "#fdf7f4"}</span>
                  </div>
                </div>
              </>
              ) : renderBasicPageAppearanceControls()}
            </div>
          )}

          {(normalizedFramesEditorSelection === "frames" || selectedFrameIndex !== null) && (
            <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef("frames")}>
              <div className="shares-frame-tool-card shares-frame-tool-card--frames">
                <div className="shares-frame-tool-card__head">
                  <h4 className="shares-frame-tool-card__title">Kelola Frames Group</h4>
                </div>
                <p className="shares-frame-manager__hint">
                  Tambah frame baru ke group ini, atau ganti frame tertentu langsung dari preview.
                </p>
                <button
                  type="button"
                  className="shares-action-btn shares-action-btn--primary shares-frame-manager__add-btn"
                  onClick={() => openFramePicker({ type: "add", replaceDraftId: null })}
                >
                  Tambah Frame
                </button>

                {groupDraftsForPreview.length === 0 ? (
                  <div className="shares-frame-manager__empty">
                    Belum ada frame di group ini. Klik tombol di atas untuk menambahkan frame pertama.
                  </div>
                ) : (
                  <div className="shares-frame-manager__list">
                    {groupDraftsForPreview.map((draft, index) => {
                      const isSelectedFrame = selectedFrameIndex === index;
                      const thumbnail = draft.thumbnail || draft.preview || draft.thumbnailUrl || null;

                      return (
                        <div
                          key={draft.id || index}
                          className={`shares-frame-manager__item${isSelectedFrame ? " shares-frame-manager__item--active" : ""}`}
                        >
                          <button
                            type="button"
                            className="shares-frame-manager__meta"
                            onClick={() => openFramesEditorTarget(`frame-${index}`, "frames")}
                          >
                            <div className="shares-frame-manager__thumb">
                              {thumbnail ? <img src={thumbnail} alt={draft.title || `Frame ${index + 1}`} /> : <span>No preview</span>}
                            </div>
                            <div className="shares-frame-manager__text">
                              <strong>{draft.title || `Frame ${index + 1}`}</strong>
                              <span>{isSelectedFrame ? "Sedang dipilih untuk diganti" : `Frame ${index + 1} di group`}</span>
                            </div>
                          </button>

                          <div className="shares-frame-manager__actions">
                            <button
                              type="button"
                              className="shares-action-btn"
                              onClick={() => openFramePicker({ type: "replace", replaceDraftId: draft.id })}
                            >
                              Ganti
                            </button>
                            <button
                              type="button"
                              className="shares-action-btn shares-action-btn--danger"
                              onClick={() => {
                                if (!activeGroup?.id) return;
                                setFramesEditorSelection("frames");
                                handleToggleDraftInGroup(activeGroup.id, draft.id);
                              }}
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {normalizedFramesEditorSelection === "logo" && (
            <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef("logo")}>
              {renderLogoControls()}
            </div>
          )}

          {normalizedFramesEditorSelection === "title1" && (
            <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef("title1")}>
              {renderFrameTextContentControl("Teks", "title1Text", DEFAULT_TITLE1_TEXT, false, "title1Text")}
              {renderFramesElementStyleControls("Judul 1", "title1", { position: "center", fontFamily: "Inter", fontSize: 22, textAlign: "center" }, { allowJustify: false })}
            </div>
          )}

          {normalizedFramesEditorSelection === "title2" && (
            <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef("title2")}>
              {renderFrameTextContentControl("Teks", "title2Text", "Judul...", false, "title2Text")}
              {renderFramesElementStyleControls("Judul", "title2", { position: "left", fontFamily: "Inter", fontSize: 22, textAlign: "left" }, { allowJustify: false })}
            </div>
          )}

          {(normalizedFramesEditorSelection === "infoSubtitle" || selectedInfoSubtitleColumnIndex !== null) && getInfoColumnsCount(activeGroup?.preferences || {}) > 1 && (
            <>
              <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef(normalizedFramesEditorSelection)}>
                {renderInfoSubtitleContentControls(selectedInfoSubtitleColumnIndex)}
              </div>
              <div className="shares-frame-tool-card shares-frame-tool-card--subtitle shares-frame-inspector__section">
                <div className="shares-frame-tool-card__head">
                  <h4 className="shares-frame-tool-card__title">Sub Judul</h4>
                </div>
                {renderFramesElementStyleControls("Sub Judul", "infoSubtitle", {
                  fontFamily: activeGroup?.preferences?.infoSubtitleFontFamily || activeGroup?.preferences?.title2FontFamily || "Inter",
                  fontSize: clampPositive(
                    activeGroup?.preferences?.infoSubtitleFontSize,
                    Math.max(12, clampPositive(activeGroup?.preferences?.title2FontSize, 22, 10, 72) - 4),
                    10,
                    72,
                  ),
                  textAlign: activeGroup?.preferences?.infoSubtitleTextAlign || activeGroup?.preferences?.textTextAlign || activeGroup?.preferences?.title2TextAlign || "left",
                }, { hidePosition: true, allowJustify: false })}
              </div>
            </>
          )}

          {(normalizedFramesEditorSelection === "text" || selectedTextColumnIndex !== null) && (
            <>
              <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef(normalizedFramesEditorSelection)}>
                {renderInfoTextContentControls(selectedTextColumnIndex)}
              </div>
              <div className="shares-frame-tool-card shares-frame-tool-card--text shares-frame-inspector__section">
                <div className="shares-frame-tool-card__head">
                  <h4 className="shares-frame-tool-card__title">Teks</h4>
                </div>
                {renderFramesElementStyleControls(
                  "Teks",
                  "text",
                  { position: "left", fontFamily: "Inter", fontSize: 13, textAlign: "left" },
                  { hidePosition: getInfoColumnsCount(activeGroup?.preferences || {}) > 1 },
                )}
              </div>
            </>
          )}

          {normalizedFramesEditorSelection === "infoBox" && (
            <>
              <div className="shares-frame-inspector__section" ref={registerFramesEditorSectionRef("infoBox")}>
                {renderInfoBoxControls()}
                {renderInfoLayoutControls()}
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  // ── Preferences preview renderer ──
  const renderPagePreview = (page, device, mode = "inline") => {
    const prefs = activeGroup?.preferences || {};
    const logo = prefs.logoDataUrl || defaultLogotype;
    const logoPosition = prefs.logoPosition || "center";
    const logoWidth = clampPositive(prefs.logoWidth, 220, 80, 280);
    const isEditorInteractive = mode === "editor" || mode === "standalone";
    const isStandalonePreview = mode === "standalone";
    const isFramesInteractive = page === "frames" && isEditorInteractive;
    const isBasicPageEditor = isEditorInteractive && page !== "frames";
    const effectiveFramesEditorSelection = framesEditorSelection;
    const getTutorialTargetClassName = (targetKey) => (
      targetKey && isTutorialTargetActive(targetKey) ? "shares-tutorial-highlight" : ""
    );
    const attachTutorialTarget = (props, targetKey, options = {}) => {
      if (!targetKey) return props;

      const nextProps = {
        ...(props || {}),
        className: [props?.className, getTutorialTargetClassName(targetKey), options.className]
          .filter(Boolean)
          .join(" "),
      };

      if (options.withRef !== false) {
        nextProps.ref = registerTutorialTarget(targetKey);
      }

      return nextProps;
    };

    const selectableProps = (target, extraClass = "") => {
      const className = [
        extraClass,
        isEditorInteractive ? "shares-frame-editor-node" : "",
        isEditorInteractive && effectiveFramesEditorSelection === target ? "shares-frame-editor-node--active" : "",
      ].filter(Boolean).join(" ");

      if (!isEditorInteractive) {
        return className ? { className } : {};
      }

      return {
        className,
        role: "button",
        tabIndex: 0,
        onClick: (e) => {
          e.stopPropagation();
          setInlinePreviewEditingField(null);
          openFramesEditorTarget(target);
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setInlinePreviewEditingField(null);
            openFramesEditorTarget(target);
          }
        },
      };
    };

    const selectableTextProps = (target, focusSection, focusField, extraClass = "") => {
      const className = [
        extraClass,
        isEditorInteractive ? "shares-frame-editor-node" : "",
        isEditorInteractive && effectiveFramesEditorSelection === target ? "shares-frame-editor-node--active" : "",
      ].filter(Boolean).join(" ");

      if (!isEditorInteractive) {
        return className ? { className } : {};
      }

      return {
        className,
        role: "button",
        tabIndex: 0,
        onClick: (e) => {
          e.stopPropagation();
          openFramesEditorTarget(target, focusSection, null);
          setInlinePreviewEditingField(focusField);
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openFramesEditorTarget(target, focusSection, null);
            setInlinePreviewEditingField(focusField);
          }
        },
      };
    };

    const selectableFrameCardProps = (index, extraClass = "") => {
      const target = `frame-${index}`;
      const className = [
        extraClass,
        isEditorInteractive ? "shares-frame-editor-node" : "",
        isEditorInteractive && effectiveFramesEditorSelection === target ? "shares-frame-editor-node--active" : "",
      ].filter(Boolean).join(" ");

      if (!isEditorInteractive) {
        return className ? { className } : {};
      }

      return {
        className,
        role: "button",
        tabIndex: 0,
        onClick: (e) => {
          e.stopPropagation();
          setInlinePreviewEditingField(null);
          openFramesEditorTarget(target, "frames");
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setInlinePreviewEditingField(null);
            openFramesEditorTarget(target, "frames");
          }
        },
      };
    };

    const updateInlinePreviewValue = (fieldKey, nextValue) => {
      if (!fieldKey) return;

      const infoColumnMatch = /^info-column-(\d+)-(subtitle|text)$/.exec(fieldKey);
      if (infoColumnMatch) {
        const index = Number(infoColumnMatch[1]);
        const valueKey = infoColumnMatch[2];
        const nextColumns = normalizeInfoColumns(prefs.infoColumns);
        nextColumns[index] = {
          ...nextColumns[index],
          [valueKey]: nextValue,
        };
        handleUpdateGroupPref({ infoColumns: nextColumns });
        return;
      }

      handleUpdateGroupPref({ [fieldKey]: nextValue });
    };

    const getInlinePreviewFieldValue = (fieldKey) => {
      const infoColumnMatch = /^info-column-(\d+)-(subtitle|text)$/.exec(fieldKey || "");
      if (infoColumnMatch) {
        const index = Number(infoColumnMatch[1]);
        const valueKey = infoColumnMatch[2];
        return normalizeInfoColumns(prefs.infoColumns)[index]?.[valueKey] || "";
      }

      return prefs?.[fieldKey] || "";
    };

    const renderInlinePreviewEditor = ({
      fieldKey,
      multiline = false,
      placeholder = "",
      className = "",
      style = {},
    }) => {
      const sharedProps = {
        ref: registerInlinePreviewFieldRef(fieldKey),
        className: `${className} ${multiline ? "shares-pmock-inline-textarea" : "shares-pmock-inline-input"}`.trim(),
        value: getInlinePreviewFieldValue(fieldKey),
        placeholder,
        onChange: (e) => updateInlinePreviewValue(fieldKey, e.target.value),
        onClick: (e) => e.stopPropagation(),
        onBlur: () => setInlinePreviewEditingField(null),
        onKeyDown: (e) => {
          if (!multiline && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (multiline && (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        },
        style,
      };

      if (multiline) {
        return <textarea rows={4} {...sharedProps} />;
      }

      return <input type="text" {...sharedProps} />;
    };

    let headerColor, bgColor;
    if (page === "takemoment") {
      headerColor = prefs.takeMomentHeaderColor || "#ffffff";
      bgColor = prefs.takeMomentBgColor || "#fdf7f4";
    } else if (page === "editphoto") {
      headerColor = prefs.editPhotoHeaderColor || "#ffffff";
      bgColor = prefs.editPhotoBgColor || "#fdf7f4";
    } else {
      headerColor = prefs.headerColor || "#ffffff";
      bgColor = prefs.backgroundColor || "#fdf7f4";
    }

    const title1PreviewText = prefs.title1Text || (isFramesInteractive ? DEFAULT_TITLE1_TEXT : "");
    const title2PreviewText = prefs.title2Text || (isFramesInteractive ? "Judul" : "");
    const textPreviewText = prefs.text || (isFramesInteractive ? "Teks deskripsi singkat untuk group share." : "");
    const infoColumnsCount = getInfoColumnsCount(prefs);
    const infoColumns = normalizeInfoColumns(prefs.infoColumns).slice(0, infoColumnsCount);
    const infoColumnsHaveContent = infoColumns.some((item) => item.subtitle.trim() || item.text.trim());
    const previewInfoColumns = infoColumnsCount > 1
      ? infoColumns.map((item, index) => ({
          subtitle: item.subtitle || (isFramesInteractive ? `Sub Judul ${index + 1}` : ""),
          text: item.text || (isFramesInteractive ? `Teks kolom ${index + 1}` : ""),
        }))
      : [];
    const showInfoBox = Boolean(prefs.title2Text || prefs.text || infoColumnsHaveContent || isFramesInteractive);
    const infoBoxIsPlaceholder = isFramesInteractive && !prefs.title2Text && !prefs.text && !infoColumnsHaveContent;
    const infoBoxIsEngaged = effectiveFramesEditorSelection === "infoBox";

    const headerBlock = (
      <div className={`shares-pmock-header${isBasicPageEditor ? " shares-pmock-header--editor-page" : ""}`} style={{ background: headerColor, justifyContent: getPlacement(logoPosition) }}>
        <div {...selectableProps("logo") }>
          {logo ? (
            <img src={logo} alt="Logo" className={`shares-pmock-logo${isBasicPageEditor ? " shares-pmock-logo--editor-page" : ""}`} style={{ width: `${logoWidth}px`, maxWidth: "100%" }} />
          ) : (
            <div className={`shares-pmock-logo-ph${isBasicPageEditor ? " shares-pmock-logo-ph--editor-page" : ""}`} style={{ width: `${Math.min(logoWidth, 140)}px` }} />
          )}
        </div>
      </div>
    );

    if (isStandalonePreview && page !== "frames") {
      const standaloneHeaderProps = appendClassName(selectableProps("page"), "shares-basic-preview-page__header");
      const standaloneBodyProps = appendClassName(
        selectableProps("page"),
        `shares-basic-preview-page__body shares-basic-preview-page__body--${page} shares-basic-preview-page__body--${device}`
      );

      if (page === "takemoment") {
        return (
          <div className={`shares-basic-preview-page shares-basic-preview-page--${page} shares-basic-preview-page--${device}`} style={{ background: bgColor }}>
            <div
              {...standaloneHeaderProps}
              style={{
                ...standaloneHeaderProps.style,
                background: headerColor,
                justifyContent: getPlacement(logoPosition),
              }}
            >
              <div {...appendClassName(selectableProps("logo"), "shares-basic-preview-page__logo-wrap")}>
                {logo ? (
                  <img
                    src={logo}
                    alt="Logo"
                    className="shares-basic-preview-page__logo"
                    style={{ width: `${logoWidth}px`, maxWidth: `${logoWidth}px` }}
                  />
                ) : (
                  <div className="shares-pmock-logo-ph shares-pmock-logo-ph--editor-page" style={{ width: `${Math.min(logoWidth, 140)}px` }} />
                )}
              </div>
            </div>

            {device === "desktop" ? (
              <div {...standaloneBodyProps}>
                <div className="shares-basic-preview-page__tm-main">
                  <div className="shares-basic-preview-page__back">← Kembali</div>
                  <div className="shares-basic-preview-page__title">Pilih momen berhargamu</div>
                  <div className="shares-basic-preview-page__camera shares-basic-preview-page__camera--desktop" />
                  <div className="shares-basic-preview-page__actions">
                    <div className="shares-basic-preview-page__action-btn">📷 Ambil Foto</div>
                  </div>
                </div>
              </div>
            ) : (
              <div {...standaloneBodyProps}>
                <div className="shares-basic-preview-page__back">← Kembali</div>
                <div className="shares-basic-preview-page__title">Pilih momen berhargamu</div>
                <div className="shares-basic-preview-page__camera shares-basic-preview-page__camera--mobile" />
                <div className="shares-basic-preview-page__actions">
                  <div className="shares-basic-preview-page__action-btn">📷 Ambil Foto</div>
                </div>
              </div>
            )}
          </div>
        );
      }

      return (
        <div className={`shares-basic-preview-page shares-basic-preview-page--${page} shares-basic-preview-page--${device}`} style={{ background: bgColor }}>
          <div
            {...standaloneHeaderProps}
            style={{
              ...standaloneHeaderProps.style,
              background: headerColor,
              justifyContent: getPlacement(logoPosition),
            }}
          >
            <div {...appendClassName(selectableProps("logo"), "shares-basic-preview-page__logo-wrap")}>
              {logo ? (
                <img
                  src={logo}
                  alt="Logo"
                  className="shares-basic-preview-page__logo"
                  style={{ width: `${logoWidth}px`, maxWidth: `${logoWidth}px` }}
                />
              ) : (
                <div className="shares-pmock-logo-ph shares-pmock-logo-ph--editor-page" style={{ width: `${Math.min(logoWidth, 140)}px` }} />
              )}
            </div>
          </div>

          <div {...standaloneBodyProps}>
            <div className={`shares-basic-preview-page__photo shares-basic-preview-page__photo--${device}`} />
            <div className="shares-basic-preview-page__actions">
              <div className="shares-basic-preview-page__action-btn">⬇ Download Foto</div>
            </div>
          </div>
        </div>
      );
    }

    let bodyBlock;
    if (page === "frames") {
      const hasFrames = groupDraftsForPreview.length > 0;
      const items = (hasFrames ? groupDraftsForPreview : [{}, {}, {}, {}])
        .slice(0, device === "desktop" ? 5 : 4);
      const fullPageItems = hasFrames ? groupDraftsForPreview : [{}, {}, {}];
      const desktopPreviewColumnCount = Math.max(1, Math.min(items.length, 5));
      const viewports = mode === "editor" ? FRAME_EDITOR_VIEWPORTS : FRAME_PREVIEW_VIEWPORTS;
      const viewport = viewports[device] || viewports.mobile;
      const scale = viewport.screenWidth / viewport.width;
      const shouldScrollFrameBody = mode === "editor" && device === "desktop";
      const title1NodeProps = appendClassName(
        attachTutorialTarget(selectableTextProps("title1", "title1", "title1Text"), "previewText"),
        "shares-pmock-title1 shares-pmock-text-block"
      );
      const infoBoxNodeProps = attachTutorialTarget(selectableProps(
        "infoBox",
        infoBoxIsPlaceholder ? "shares-frame-editor-node--placeholder shares-frame-editor-node--block" : "shares-frame-editor-node--block"
      ), "previewInfoBox");
      const title2NodeProps = appendClassName(
        attachTutorialTarget(
          selectableTextProps("title2", "title2", "title2Text", !prefs.title2Text ? "shares-frame-editor-node--placeholder" : ""),
          "previewText",
          { withRef: false }
        ),
        "shares-pmock-title2 shares-pmock-text-block"
      );
      const textNodeProps = appendClassName(
        attachTutorialTarget(
          selectableTextProps("text", "text", "text", !prefs.text && !infoColumnsHaveContent ? "shares-frame-editor-node--placeholder" : ""),
          "previewText",
          { withRef: false }
        ),
        "shares-pmock-text shares-pmock-text-block"
      );

      if (isStandalonePreview) {
        const standaloneTitle1NodeProps = appendClassName(selectableTextProps("title1", "title1", "title1Text"), "shares-full-preview-page__title");
        const standaloneTitle2NodeProps = appendClassName(selectableTextProps("title2", "title2", "title2Text", !prefs.title2Text ? "shares-frame-editor-node--placeholder" : ""), "shares-full-preview-page__info-title");
        const standaloneTextNodeProps = appendClassName(selectableTextProps("text", "text", "text", !prefs.text && !infoColumnsHaveContent ? "shares-frame-editor-node--placeholder" : ""), "shares-full-preview-page__info-text");
        const standaloneHeaderProps = appendClassName(selectableProps("page"), "shares-full-preview-page__header");
        const standaloneBodyProps = appendClassName(selectableProps("page"), "shares-full-preview-page__body");
        const standaloneInfoBoxProps = appendClassName(selectableProps("infoBox", infoBoxIsPlaceholder ? "shares-frame-editor-node--placeholder shares-frame-editor-node--block" : "shares-frame-editor-node--block"), "shares-full-preview-page__info-box");

        return (
          <div className={`shares-full-preview-page shares-full-preview-page--${device}`} style={{ background: bgColor }}>
            <div
              {...standaloneHeaderProps}
              style={{
                ...standaloneHeaderProps.style,
                background: headerColor,
                justifyContent: getPlacement(logoPosition),
              }}
            >
              <div {...appendClassName(selectableProps("logo"), "shares-full-preview-page__logo-wrap")}>
                {logo ? (
                  <img
                    src={logo}
                    alt="Logo"
                    className="shares-full-preview-page__logo"
                    style={{ width: `${logoWidth}px`, maxWidth: `${logoWidth}px` }}
                  />
                ) : (
                  <div className="shares-pmock-logo-ph" style={{ width: `${Math.min(logoWidth, 140)}px` }} />
                )}
              </div>
            </div>

            <div {...standaloneBodyProps}>
              <div className="shares-full-preview-page__inner">
                {title1PreviewText ? (
                  inlinePreviewEditingField === "title1Text" ? (
                    renderInlinePreviewEditor({
                      fieldKey: "title1Text",
                      placeholder: DEFAULT_TITLE1_TEXT,
                      className: standaloneTitle1NodeProps.className,
                      style: getFrameTextPreviewStyle(prefs, "title1", { position: "center", fontFamily: "Inter", fontSize: 22, textAlign: "center" }),
                    })
                  ) : (
                    <div
                      {...standaloneTitle1NodeProps}
                      style={getFrameTextPreviewStyle(prefs, "title1", { position: "center", fontFamily: "Inter", fontSize: 22, textAlign: "center" })}
                    >
                      {title1PreviewText}
                    </div>
                  )
                ) : null}

                <div
                  {...appendClassName(selectableProps("frames", "shares-frame-editor-node--block"), `shares-full-preview-page__grid shares-full-preview-page__grid--${device}`)}
                >
                  {!hasFrames && isEditorInteractive ? (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "12px",
                        padding: "32px 16px",
                        border: "2px dashed rgba(192,112,85,0.4)",
                        borderRadius: "12px",
                        cursor: "pointer",
                        background: "rgba(255,255,255,0.5)",
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); openFramePicker({ type: "add", replaceDraftId: null }); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFramePicker({ type: "add", replaceDraftId: null }); } }}
                    >
                      <span style={{ fontSize: "28px" }}>🖼️</span>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#c07055" }}>+ Tambah Frame</span>
                      <span style={{ fontSize: "11px", color: "#9b7b73" }}>Group belum memiliki frame</span>
                    </div>
                  ) : (
                    fullPageItems.map((d, i) => {
                      const cardTitle = d.title ? d.title.slice(0, 48) : `Frame ${i + 1}`;
                      const cardDescription = d.description || "Contoh frame coffee shop untuk tutorial group share.";

                      return (
                        <div key={d?.id || i} {...selectableFrameCardProps(i, "shares-full-preview-page__card")}>
                          <div className="shares-full-preview-page__card-thumb">
                            {(d.thumbnail || d.preview || d.thumbnailUrl) ? (
                              <img src={d.thumbnail || d.preview || d.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            ) : null}
                          </div>
                          <div className="shares-full-preview-page__card-title">{cardTitle}</div>
                          <div className="shares-full-preview-page__card-desc">
                            {String(cardDescription).slice(0, 46)}
                            {String(cardDescription).length > 46 ? "... " : " "}
                            <span className="shares-full-preview-page__card-more">Selengkapnya</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {showInfoBox ? (
                  <div
                    {...standaloneInfoBoxProps}
                    style={{
                      ...getInfoBoxStyle(prefs),
                      ...(infoBoxIsPlaceholder
                        ? {
                            minHeight: device === "desktop" ? "92px" : "78px",
                            border: "1px dashed rgba(192, 112, 85, 0.45)",
                            background: infoBoxIsEngaged
                              ? hexToRgba(prefs?.infoBoxColor || "#ffffff", prefs?.infoBoxOpacity ?? 100)
                              : "rgba(255, 255, 255, 0.28)",
                          }
                        : null),
                    }}
                  >
                    {title2PreviewText ? (
                      inlinePreviewEditingField === "title2Text" ? (
                        renderInlinePreviewEditor({
                          fieldKey: "title2Text",
                          placeholder: "Judul",
                          className: standaloneTitle2NodeProps.className,
                          style: {
                            opacity: 1,
                            fontStyle: "normal",
                            ...getFrameTextPreviewStyle(prefs, "title2", { position: "left", fontFamily: "Inter", fontSize: 22, textAlign: "left" }, { insideBox: true }),
                          },
                        })
                      ) : (
                        <div
                          {...standaloneTitle2NodeProps}
                          style={{
                            opacity: prefs.title2Text ? 1 : 0.62,
                            fontStyle: prefs.title2Text ? "normal" : "italic",
                            ...getFrameTextPreviewStyle(prefs, "title2", { position: "left", fontFamily: "Inter", fontSize: 22, textAlign: "left" }, { insideBox: true }),
                          }}
                        >
                          {title2PreviewText}
                        </div>
                      )
                    ) : null}

                    {infoColumnsCount > 1 ? (
                      <div
                        className={`shares-full-preview-page__info-grid shares-full-preview-page__info-grid--${device}`}
                        style={{
                          marginTop: title2PreviewText ? "10px" : "0",
                          gridTemplateColumns: device === "mobile" ? "1fr" : `repeat(${infoColumnsCount}, minmax(0, 1fr))`,
                        }}
                      >
                        {previewInfoColumns.map((column, index) => (
                          <div key={`standalone-info-column-${index}`} className="shares-full-preview-page__info-col">
                            {inlinePreviewEditingField === `info-column-${index}-subtitle`
                              ? renderInlinePreviewEditor({
                                  fieldKey: `info-column-${index}-subtitle`,
                                  placeholder: `Sub Judul ${index + 1}`,
                                  className: "shares-full-preview-page__info-subtitle",
                                  style: {
                                    color: "#1e293b",
                                    fontWeight: 700,
                                    fontStyle: "normal",
                                    ...getInfoColumnSubtitlePreviewStyle(prefs),
                                  },
                                })
                              : (
                                <div
                                  {...selectableTextProps(`infoSubtitle-${index}`, `infoSubtitle-${index}`, `info-column-${index}-subtitle`)}
                                  className="shares-full-preview-page__info-subtitle"
                                  style={{
                                    color: TUTORIAL_BRAND_TEXT_COLOR,
                                    fontWeight: 700,
                                    fontStyle: column.subtitle ? "normal" : "italic",
                                    ...getInfoColumnSubtitlePreviewStyle(prefs),
                                  }}
                                >
                                  {column.subtitle}
                                </div>
                              )}

                            {inlinePreviewEditingField === `info-column-${index}-text`
                              ? renderInlinePreviewEditor({
                                  fieldKey: `info-column-${index}-text`,
                                  multiline: true,
                                  placeholder: `Teks kolom ${index + 1}`,
                                  className: "shares-full-preview-page__info-text",
                                  style: {
                                    color: "#475569",
                                    whiteSpace: "pre-wrap",
                                    fontStyle: "normal",
                                    ...getInfoColumnTextPreviewStyle(prefs),
                                  },
                                })
                              : (
                                <div
                                  {...selectableTextProps(`text-${index}`, `text-${index}`, `info-column-${index}-text`)}
                                  className="shares-full-preview-page__info-text"
                                  style={{
                                    color: "#475569",
                                    whiteSpace: "pre-wrap",
                                    fontStyle: column.text ? "normal" : "italic",
                                    ...getInfoColumnTextPreviewStyle(prefs),
                                  }}
                                >
                                  {column.text}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    ) : textPreviewText ? (
                      inlinePreviewEditingField === "text" ? (
                        renderInlinePreviewEditor({
                          fieldKey: "text",
                          multiline: true,
                          placeholder: "Teks",
                          className: standaloneTextNodeProps.className,
                          style: {
                            marginTop: prefs.title2Text ? "8px" : "0",
                            opacity: 1,
                            fontStyle: "normal",
                            ...getFrameTextPreviewStyle(prefs, "text", { position: "left", fontFamily: "Inter", fontSize: 13, textAlign: "left" }, { insideBox: true }),
                          },
                        })
                      ) : (
                        <div
                          {...standaloneTextNodeProps}
                          style={{
                            marginTop: prefs.title2Text ? "8px" : "0",
                            opacity: prefs.text ? 1 : 0.62,
                            fontStyle: prefs.text ? "normal" : "italic",
                            ...getFrameTextPreviewStyle(prefs, "text", { position: "left", fontFamily: "Inter", fontSize: 13, textAlign: "left" }, { insideBox: true }),
                          }}
                        >
                          {textPreviewText}
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      }

      bodyBlock = (
        <div
          style={{
            width: `${viewport.screenWidth}px`,
            height: `${Math.round(viewport.height * scale)}px`,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: `${viewport.width}px`,
              height: `${viewport.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: bgColor,
              display: "flex",
              flexDirection: "column",
            }}
            {...selectableProps("page", "shares-frame-editor-page")}
          >
            <div
              {...appendClassName(attachTutorialTarget(selectableProps("page"), "previewHeader"), "shares-pmock-header")}
              style={{
                background: headerColor,
                justifyContent: getPlacement(logoPosition),
                padding: "0 16px",
                minHeight: "72px",
                height: "72px",
              }}
            >
              <div {...attachTutorialTarget(selectableProps("logo"), "previewLogo")}>
                {logo ? (
                  <img
                    src={logo}
                    alt="Logo"
                    className="shares-pmock-logo"
                    style={{
                      width: `${logoWidth}px`,
                      maxWidth: `${logoWidth}px`,
                      maxHeight: "56px",
                    }}
                  />
                ) : (
                  <div className="shares-pmock-logo-ph" style={{ width: `${Math.min(logoWidth, 140)}px` }} />
                )}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: shouldScrollFrameBody ? "auto" : "visible",
                overflowX: "hidden",
                paddingTop: "28px",
                paddingBottom: "48px",
              }}
              {...attachTutorialTarget(selectableProps("page", "shares-frame-editor-page"), "previewBackground")}
            >
              <div
                className="shares-pmock-body"
                style={{
                  padding: "0 16px",
                  gap: "18px",
                }}
              >
                {title1PreviewText && (
                  inlinePreviewEditingField === "title1Text" ? (
                    renderInlinePreviewEditor({
                      fieldKey: "title1Text",
                      placeholder: DEFAULT_TITLE1_TEXT,
                      className: title1NodeProps.className,
                      style: getFrameTextPreviewStyle(prefs, "title1", { position: "center", fontFamily: "Inter", fontSize: 22, textAlign: "center" }),
                    })
                  ) : (
                    <div
                      {...title1NodeProps}
                      style={getFrameTextPreviewStyle(prefs, "title1", { position: "center", fontFamily: "Inter", fontSize: 22, textAlign: "center" })}
                    >
                      {title1PreviewText}
                    </div>
                  )
                )}

                <div
                  {...appendClassName(
                    selectableProps("frames", "shares-frame-editor-node--block"),
                    `shares-pmock-grid${device === "desktop" ? " shares-pmock-grid--desktop" : ""}`
                  )}
                  style={device === "desktop" ? {
                    gridTemplateColumns: `repeat(${desktopPreviewColumnCount}, minmax(0, 220px))`,
                    justifyContent: "center",
                  } : undefined}
                >
                  {!hasFrames && isEditorInteractive ? (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        padding: "16px 8px",
                        border: "1.5px dashed rgba(192,112,85,0.4)",
                        borderRadius: "8px",
                        cursor: "pointer",
                        background: "rgba(255,255,255,0.5)",
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); openFramePicker({ type: "add", replaceDraftId: null }); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFramePicker({ type: "add", replaceDraftId: null }); } }}
                    >
                      <span style={{ fontSize: "18px" }}>🖼️</span>
                      <span style={{ fontSize: "9px", fontWeight: "700", color: "#c07055" }}>+ Tambah Frame</span>
                    </div>
                  ) : (
                    items.map((d, i) => (
                      <div key={d?.id || i} {...selectableFrameCardProps(i, "shares-pmock-card")}>
                        <div className="shares-pmock-thumb">
                          {(d.thumbnail || d.preview || d.thumbnailUrl) ? (
                            <img src={d.thumbnail || d.preview || d.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          ) : null}
                        </div>
                        <div className="shares-pmock-card-name">{d.title ? d.title.slice(0, 12) : `Frame ${i + 1}`}</div>
                      </div>
                    ))
                  )}
                </div>

                {showInfoBox ? (
                  <div
                    {...infoBoxNodeProps}
                    style={{
                      ...getInfoBoxStyle(prefs),
                      ...(infoBoxIsPlaceholder
                        ? {
                            minHeight: device === "desktop" ? "92px" : "78px",
                            border: "1px dashed rgba(192, 112, 85, 0.45)",
                            background: infoBoxIsEngaged
                              ? hexToRgba(prefs?.infoBoxColor || "#ffffff", prefs?.infoBoxOpacity ?? 100)
                              : "rgba(255, 255, 255, 0.28)",
                          }
                        : null),
                    }}
                  >
                    {title2PreviewText ? (
                      inlinePreviewEditingField === "title2Text" ? (
                        renderInlinePreviewEditor({
                          fieldKey: "title2Text",
                          placeholder: "Judul",
                          className: title2NodeProps.className,
                          style: {
                            opacity: 1,
                            fontStyle: "normal",
                            ...getFrameTextPreviewStyle(prefs, "title2", { position: "left", fontFamily: "Inter", fontSize: 22, textAlign: "left" }, { insideBox: true }),
                          },
                        })
                      ) : (
                        <div
                          {...title2NodeProps}
                          style={{
                            opacity: prefs.title2Text ? 1 : 0.62,
                            fontStyle: prefs.title2Text ? "normal" : "italic",
                            ...getFrameTextPreviewStyle(prefs, "title2", { position: "left", fontFamily: "Inter", fontSize: 22, textAlign: "left" }, { insideBox: true }),
                          }}
                        >
                          {title2PreviewText}
                        </div>
                      )
                    ) : null}

                    {infoColumnsCount > 1 ? (
                      <div
                        className={getTutorialTargetClassName("previewInfoBox")}
                        style={{
                          width: "100%",
                          marginTop: title2PreviewText ? "10px" : "0",
                          display: "grid",
                          gridTemplateColumns: device === "mobile" ? "1fr" : `repeat(${infoColumnsCount}, minmax(0, 1fr))`,
                          gap: "12px",
                          opacity: infoColumnsHaveContent ? 1 : 0.62,
                        }}
                      >
                        {previewInfoColumns.map((column, index) => (
                          <div
                            key={`preview-info-column-${index}`}
                            style={{
                              minWidth: 0,
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            {inlinePreviewEditingField === `info-column-${index}-subtitle`
                              ? renderInlinePreviewEditor({
                                  fieldKey: `info-column-${index}-subtitle`,
                                  placeholder: `Sub Judul ${index + 1}`,
                                  className: appendClassName(selectableTextProps(`infoSubtitle-${index}`, `infoSubtitle-${index}`, `info-column-${index}-subtitle`), "shares-pmock-text-block").className,
                                  style: {
                                    color: "#1e293b",
                                    fontWeight: 700,
                                    fontStyle: "normal",
                                    ...getInfoColumnSubtitlePreviewStyle(prefs),
                                  },
                                })
                              : (
                                <div
                                  {...appendClassName(attachTutorialTarget(selectableTextProps(`infoSubtitle-${index}`, `infoSubtitle-${index}`, `info-column-${index}-subtitle`), "previewText", { withRef: false }), "shares-pmock-text-block")}
                                  style={{
                                    color: TUTORIAL_BRAND_TEXT_COLOR,
                                    fontWeight: 700,
                                    fontStyle: column.subtitle ? "normal" : "italic",
                                    ...getInfoColumnSubtitlePreviewStyle(prefs),
                                  }}
                                >
                                  {column.subtitle}
                                </div>
                              )}
                              {inlinePreviewEditingField === `info-column-${index}-text`
                                ? renderInlinePreviewEditor({
                                    fieldKey: `info-column-${index}-text`,
                                    multiline: true,
                                    placeholder: `Teks kolom ${index + 1}`,
                                    className: appendClassName(selectableTextProps(`text-${index}`, `text-${index}`, `info-column-${index}-text`), "shares-pmock-text-block").className,
                                    style: {
                                      color: "#475569",
                                      whiteSpace: "pre-wrap",
                                      fontStyle: "normal",
                                      ...getInfoColumnTextPreviewStyle(prefs),
                                    },
                                  })
                                : (
                                  <div
                                    {...appendClassName(attachTutorialTarget(selectableTextProps(`text-${index}`, `text-${index}`, `info-column-${index}-text`), "previewText", { withRef: false }), "shares-pmock-text-block")}
                                    style={{
                                      color: isTutorialGroupActive ? "#475569" : "#475569",
                                      whiteSpace: "pre-wrap",
                                      fontStyle: column.text ? "normal" : "italic",
                                      ...getInfoColumnTextPreviewStyle(prefs),
                                    }}
                                  >
                                    {column.text}
                                  </div>
                                )}
                          </div>
                        ))}
                      </div>
                    ) : textPreviewText ? (
                      inlinePreviewEditingField === "text" ? (
                        renderInlinePreviewEditor({
                          fieldKey: "text",
                          multiline: true,
                          placeholder: "Teks",
                          className: textNodeProps.className,
                          style: {
                            marginTop: prefs.title2Text ? "8px" : "0",
                            opacity: 1,
                            fontStyle: "normal",
                            ...getFrameTextPreviewStyle(prefs, "text", { position: "left", fontFamily: "Inter", fontSize: 13, textAlign: "left" }, { insideBox: true }),
                          },
                        })
                      ) : (
                        <div
                          {...textNodeProps}
                          style={{
                            marginTop: prefs.title2Text ? "8px" : "0",
                            opacity: prefs.text ? 1 : 0.62,
                            fontStyle: prefs.text ? "normal" : "italic",
                            ...getFrameTextPreviewStyle(prefs, "text", { position: "left", fontFamily: "Inter", fontSize: 13, textAlign: "left" }, { insideBox: true }),
                          }}
                        >
                          {textPreviewText}
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      );
    } else if (page === "takemoment") {
      bodyBlock = device === "desktop" ? (
        <div className={`shares-pmock-body shares-pmock-body--tm-desktop${mode === "editor" ? " shares-pmock-body--tm-desktop-editor" : ""}`}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
            <div className={`shares-pmock-tm-title${mode === "editor" ? " shares-pmock-tm-title--editor" : ""}`}>Pilih momen berhargamu</div>
            <div className={`shares-pmock-tm-camera${mode === "editor" ? " shares-pmock-tm-camera--editor" : ""}`} />
            <div className="shares-pmock-tm-controls"><div className={`shares-pmock-tm-btn${mode === "editor" ? " shares-pmock-tm-btn--editor" : ""}`}>📷 Ambil Foto</div></div>
          </div>
        </div>
      ) : (
        <div className={`shares-pmock-body shares-pmock-body--takemoment${mode === "editor" ? " shares-pmock-body--takemoment-editor" : ""}`}>
          <div className={`shares-pmock-tm-back${mode === "editor" ? " shares-pmock-tm-back--editor" : ""}`}>← Kembali</div>
          <div className={`shares-pmock-tm-title${mode === "editor" ? " shares-pmock-tm-title--editor" : ""}`}>Pilih momen berhargamu</div>
          <div className={`shares-pmock-tm-camera${mode === "editor" ? " shares-pmock-tm-camera--editor" : ""}`} />
          <div className="shares-pmock-tm-controls"><div className={`shares-pmock-tm-btn${mode === "editor" ? " shares-pmock-tm-btn--editor" : ""}`}>📷</div></div>
        </div>
      );
    } else {
      bodyBlock = device === "desktop" ? (
        <div className={`shares-pmock-body shares-pmock-body--ep-desktop${mode === "editor" ? " shares-pmock-body--ep-desktop-editor" : ""}`}>
          <div className={`shares-pmock-ep-photo${mode === "editor" ? " shares-pmock-ep-photo--editor" : ""}`} />
          <div className="shares-pmock-ep-btns"><div className={`shares-pmock-ep-btn${mode === "editor" ? " shares-pmock-ep-btn--editor" : ""}`}>⬇ Download Foto</div></div>
        </div>
      ) : (
        <div className={`shares-pmock-body shares-pmock-body--editphoto${mode === "editor" ? " shares-pmock-body--editphoto-editor" : ""}`}>
          <div className={`shares-pmock-ep-photo${mode === "editor" ? " shares-pmock-ep-photo--editor" : ""}`} />
          <div className="shares-pmock-ep-btns"><div className={`shares-pmock-ep-btn${mode === "editor" ? " shares-pmock-ep-btn--editor" : ""}`}>⬇ Download</div></div>
        </div>
      );
    }

    if (device === "mobile") {
      return (
        <div className={`shares-pmock-mobile${page === "frames" && mode === "editor" ? " shares-pmock-mobile--frames" : ""}${mode === "editor" ? " shares-pmock-mobile--editor" : ""}`}>
          <div className="shares-pmock-mobile-screen" style={{ background: page === "frames" ? "#ffffff" : bgColor }}>
            {page === "frames" ? bodyBlock : (
              <div {...selectableProps("page", "shares-frame-editor-page") }>
                {headerBlock}
                {bodyBlock}
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className={`shares-pmock-desktop${page === "frames" && mode === "editor" ? " shares-pmock-desktop--frames" : ""}${mode === "editor" ? " shares-pmock-desktop--editor" : ""}`}>
        <div className="shares-pmock-desktop-chrome">
          <div className="shares-pmock-desktop-dots"><span /><span /><span /></div>
          <div className="shares-pmock-desktop-url">
            fremio.id/{page === "frames" ? "share/…" : page === "takemoment" ? "take-moment" : "edit-photo"}
          </div>
        </div>
        <div className="shares-pmock-desktop-screen" style={{ background: page === "frames" ? "#ffffff" : bgColor }}>
          {page === "frames" ? bodyBlock : (
            <div {...selectableProps("page", "shares-frame-editor-page") }>
              {headerBlock}
              {bodyBlock}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  if (isStandaloneEditorMode) {
    const standaloneLoading = Boolean(requestedStandaloneGroupId) && groups.length === 0;
    const standaloneGroupExists = requestedStandaloneGroupId
      ? groups.some((group) => group?.id === requestedStandaloneGroupId)
      : Boolean(activeGroup?.id);
    const standaloneGroupReady = !requestedStandaloneGroupId || activeGroup?.id === requestedStandaloneGroupId;

    return (
      <section className="shares-wrap shares-wrap--standalone-editor">
        <div className="shares-standalone-editor-shell">
          {standaloneLoading || (standaloneGroupExists && !standaloneGroupReady) ? (
            <div className="shares-empty-main shares-empty-main--standalone-editor">
              <div className="shares-empty-main__icon">⏳</div>
              <p>Memuat editor group...</p>
            </div>
          ) : !standaloneGroupExists ? (
            <div className="shares-empty-main shares-empty-main--standalone-editor">
              <div className="shares-empty-main__icon">🖼️</div>
              <p>Group untuk editor ini tidak ditemukan atau belum siap dimuat.</p>
              <button type="button" className="shares-action-btn shares-action-btn--primary" onClick={closeStandaloneFramesEditor}>
                Kembali ke Shares
              </button>
            </div>
          ) : (
            <>
              {renderFramesEditorShell(true)}
              {renderStandaloneFramePickerModal()}
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="shares-wrap">
      <div className="container">

        {/* ── Header ── */}
        <div className="shares-header">
          <div className="shares-header__content">
            <div>
              <h1 className="shares-title">Fremio Share</h1>
              <p className="shares-subtitle">Kelola grup frame dan bagikan link ke pelangganmu.</p>
            </div>
          </div>
        </div>

        <div className="shares-layout">

          {/* ── Sidebar: group list + create ── */}
          <aside className={`shares-sidebar${isTutorialTargetActive("createGroupButton") || isTutorialTargetActive("tutorialGroupItem") ? " shares-tutorial-highlight" : ""}`}>
            <button
              type="button"
              ref={registerTutorialTarget("createGroupButton")}
              className={`shares-create-group-btn${isTutorialTargetActive("createGroupButton") ? " shares-tutorial-highlight" : ""}`}
              onClick={handleCreateGroup}
            >
              <Plus size={16} />
              <span>Buat Group Baru</span>
            </button>

            {groups.length === 0 ? (
              <p className="shares-empty-hint">Belum ada group. Buat group baru untuk mulai berbagi koleksi frame.</p>
            ) : (
              <ul className="shares-group-list">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      ref={g.id === TUTORIAL_GROUP_ID ? registerTutorialTarget("tutorialGroupItem") : null}
                      className={`shares-group-item${activeGroupId === g.id ? " shares-group-item--active" : ""}${isTutorialTargetActive("tutorialGroupItem") && g.id === TUTORIAL_GROUP_ID ? " shares-tutorial-highlight" : ""}`}
                      onClick={() => { setActiveGroupId(g.id); setGroupViewMode("preferences"); }}
                    >
                      <span className="shares-group-item__name">{g.name || "Group"}</span>
                      <span className="shares-group-item__count">{(g.draftIds || []).length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* ── Main content area ── */}
          <main className="shares-main">
            {!activeGroup ? (
              <div className="shares-empty-main">
                <div className="shares-empty-main__icon">📦</div>
                <p>Pilih group dari sidebar, atau buat group baru untuk mulai.</p>
              </div>
            ) : (
              <>
                {/* Group header */}
                <div className="shares-group-header">
                  <div className="shares-group-header__left">
                    {/* Editable group name */}
                    <input
                      className="shares-group-name-input"
                      value={activeGroup.name || ""}
                      placeholder="Nama group..."
                      onChange={(e) => {
                        if (activeGroup.id === TUTORIAL_GROUP_ID) {
                          updateTutorialGroup((group) => ({
                            ...group,
                            name: e.target.value,
                          }));
                          return;
                        }
                        if (!user?.email) return;
                        const next = loadDraftGroups(user.email).map((g) =>
                          g.id === activeGroup.id ? { ...g, name: e.target.value, updatedAt: new Date().toISOString() } : g
                        );
                        saveDraftGroups(user.email, next);
                        setGroups((current) => {
                          const currentTutorial = current.find((item) => item?.id === TUTORIAL_GROUP_ID) || null;
                          return mergeGroupsWithTutorial(next, currentTutorial);
                        });
                      }}
                    />
                    <span className="shares-group-count">{(activeGroup.draftIds || []).length} frame</span>
                  </div>
                  <div className="shares-group-header__actions">
                    <button
                      type="button"
                      ref={registerTutorialTarget("preferencesTabButton")}
                      className={`shares-action-btn${groupViewMode === "preferences" ? " shares-action-btn--active" : ""}${isTutorialTargetActive("preferencesTabButton") ? " shares-tutorial-highlight" : ""}`}
                      onClick={() => setGroupViewMode("preferences")}
                    >
                      <span>Preferences</span>
                    </button>
                    <button
                      type="button"
                      className={`shares-action-btn${groupViewMode === "analytics" ? " shares-action-btn--active" : ""}`}
                      onClick={() => setGroupViewMode("analytics")}
                      disabled={isTutorialGroupActive || !activeGroupShareId}
                      title={
                        isTutorialGroupActive
                          ? "Analytics tidak tersedia untuk tutorial"
                          : !activeGroupShareId
                            ? "Buat link share dulu untuk melihat analytics"
                            : "Lihat analytics group"
                      }
                    >
                      <BarChart3 size={15} />
                      <span>Analytics</span>
                    </button>
                    <button
                      type="button"
                      className="shares-action-btn shares-action-btn--open-page"
                      onClick={handleOpenGroupPage}
                    >
                      <ExternalLink size={15} />
                      <span>Buka Halaman</span>
                    </button>
                    <button
                      type="button"
                      className={`shares-action-btn shares-action-btn--primary${isTutorialTargetActive("shareButton") ? " shares-tutorial-highlight" : ""}`}
                      ref={registerTutorialTarget("shareButton")}
                      onClick={handleShareGroup}
                      disabled={isGeneratingLink}
                    >
                      <Share2 size={15} />
                      <span>{isGeneratingLink ? "Membuat link..." : "Share"}</span>
                    </button>
                    <button
                      type="button"
                      className="shares-action-btn shares-action-btn--danger"
                      onClick={() => handleDeleteGroup(activeGroup.id, activeGroup.name || "Group ini")}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* ── Preferences view ── */}
                {groupViewMode === "analytics" ? (
                  isTutorialGroupActive ? (
                    <div className="shares-empty-group">
                      <p>Analytics tidak tersedia untuk group tutorial.</p>
                    </div>
                  ) : !activeGroupShareId ? (
                    <div className="shares-empty-group">
                      <p>Buat link share dulu untuk melihat analytics group ini.</p>
                    </div>
                  ) : (
                    <section className="shares-group-analytics">
                      <div className="shares-group-analytics__header">
                        <div>
                          <h3 className="shares-group-analytics__title">Analytics Group</h3>
                          <p className="shares-group-analytics__subtitle">
                            {activeAnalyticsMonth
                              ? `Menampilkan aktivitas bulan ${activeAnalyticsMonth.label} dari ${GROUP_ANALYTICS_DAYS} hari terakhir.`
                              : `Perkembangan ${GROUP_ANALYTICS_DAYS} hari terakhir untuk link ini.`}
                          </p>
                        </div>
                        <div className="shares-group-analytics__actions">
                          {analyticsMonthOptions.length > 0 ? (
                            <label className="shares-group-analytics__month-filter">
                              <span>Bulan</span>
                              <select
                                value={activeAnalyticsMonth?.key || ""}
                                onChange={(event) => setSelectedAnalyticsMonth(event.target.value)}
                              >
                                {analyticsMonthOptions.map((item) => (
                                  <option key={item.key} value={item.key}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <button
                            type="button"
                            className="shares-action-btn"
                            onClick={() => setGroupAnalyticsReloadKey((current) => current + 1)}
                            disabled={isLoadingGroupAnalytics}
                          >
                            <span>{isLoadingGroupAnalytics ? "Memuat..." : "Muat Ulang"}</span>
                          </button>
                        </div>
                      </div>

                      {groupAnalyticsError ? (
                        <p className="shares-group-analytics__error">{groupAnalyticsError}</p>
                      ) : null}

                      <div className="shares-group-analytics__stats">
                        <div className="shares-group-analytics__stat-card">
                          <span className="shares-group-analytics__stat-label">Link Dibuka</span>
                          <strong className="shares-group-analytics__stat-value">
                            {analyticsNumberFormatter.format(activeAnalyticsMonth?.totals?.linkOpens || 0)}
                          </strong>
                        </div>
                        <div className="shares-group-analytics__stat-card">
                          <span className="shares-group-analytics__stat-label">Download</span>
                          <strong className="shares-group-analytics__stat-value">
                            {analyticsNumberFormatter.format(activeAnalyticsMonth?.totals?.downloads || 0)}
                          </strong>
                        </div>
                      </div>

                      <div className="shares-group-analytics__table-wrap">
                        <table className="shares-group-analytics__table">
                          <thead>
                            <tr>
                              <th>Tanggal</th>
                              <th>Link Dibuka</th>
                              <th>Download</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(activeAnalyticsMonth?.daily || []).length > 0 ? (
                              (activeAnalyticsMonth?.daily || []).map((item) => (
                                <tr key={item.eventDate}>
                                  <td>{formatAnalyticsDate(item.eventDate)}</td>
                                  <td>{analyticsNumberFormatter.format(item.linkOpens || 0)}</td>
                                  <td>{analyticsNumberFormatter.format(getAnalyticsDownloadCount(item))}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="3">Belum ada aktivitas untuk group ini.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )
                ) : (
                  <div className="shares-pref-wrap">
                    <div className="shares-pref-preview-toolbar">
                      <button
                        type="button"
                        ref={registerTutorialTarget("editPreviewButton")}
                        className={`shares-pref-preview-edit-btn${isTutorialTargetActive("editPreviewButton") ? " shares-tutorial-highlight" : ""}`}
                        onClick={() => {
                          if (showTutorial) {
                            openFramesEditorModal(prefPage);
                            return;
                          }
                          openStandaloneFramesEditorTab(prefPage, activeGroup?.id);
                        }}
                      >
                        <ExternalLink size={16} />
                        <span>Edit Preview</span>
                      </button>
                    </div>

                    {/* Page tab strip */}
                    <div className="shares-pref-page-tabs">
                      {PREVIEW_EDITOR_PAGES.map(({ key, icon, tabLabel }) => (
                        <button
                          key={key}
                          type="button"
                          className={`shares-pref-page-tab${prefPage === key ? " shares-pref-page-tab--active" : ""}`}
                          onClick={() => {
                            setPrefPage(key);
                            if (!showTutorial) {
                              resetPrefDeviceForViewport();
                            }
                          }}
                        >
                          <span>{icon}</span><span>{tabLabel}</span>
                        </button>
                      ))}
                    </div>

                    <div className="shares-pref-layout">
                      <div className="shares-pref-form shares-pref-form--frames-launcher">
                        <div className="shares-frames-editor-launcher">
                          <div className="shares-frames-editor-inline">
                            <div className="shares-frames-editor-inline__previews">
                              <div className="shares-frames-editor-inline__preview-card">
                                <div className="shares-frames-editor-inline__preview-label">Mobile</div>
                                <div className="shares-frames-editor-inline__preview">
                                  {renderPagePreview(prefPage, "mobile", "preview")}
                                </div>
                              </div>
                              <div className="shares-frames-editor-inline__preview-card">
                                <div className="shares-frames-editor-inline__preview-label">Desktop</div>
                                <div className="shares-frames-editor-inline__preview">
                                  {renderPagePreview(prefPage, "desktop", "preview")}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>

      </div>

      {showShareEntryPromoModal && (
        <div className="shares-modal-backdrop" onClick={() => setShowShareEntryPromoModal(false)}>
          <div className="shares-modal shares-modal--entry-promo" onClick={(e) => e.stopPropagation()}>
            <div className="shares-modal-header">
              <div className="shares-entry-promo__intro">
                <h2 className="shares-modal-title">Fremio Share</h2>
                <p className="shares-entry-promo__body">
                  Perkuat cerita brandmu dengan satu link QR untuk halaman dan frame brand, ambil foto dan tamu share brand kamu
                </p>
              </div>
              <button type="button" className="shares-modal-close" onClick={() => setShowShareEntryPromoModal(false)}><X size={20} /></button>
            </div>

            <div className="shares-entry-promo__grid">
              <figure className="shares-entry-promo__card">
                <div className="shares-entry-promo__media" onClick={() => setShareEntryPromoLightboxImg(membershipPlusQrcode)}>
                  <img src={membershipPlusQrcode} alt="QR code Fremio Share" />
                  <span className="shares-entry-promo__label">QR Tamu</span>
                </div>
              </figure>

              <figure className="shares-entry-promo__card">
                <div className="shares-entry-promo__media" onClick={() => setShareEntryPromoLightboxImg(membershipPlusLinkPage)}>
                  <img src={membershipPlusLinkPage} alt="Halaman link Fremio Share" />
                  <span className="shares-entry-promo__label">Halaman Brand</span>
                </div>
              </figure>

              <figure className="shares-entry-promo__card">
                <div className="shares-entry-promo__media" onClick={() => setShareEntryPromoLightboxImg(membershipPlusTakephoto)}>
                  <img src={membershipPlusTakephoto} alt="Halaman ambil foto Fremio Share" />
                  <span className="shares-entry-promo__label">Take Photo</span>
                </div>
              </figure>

              <figure className="shares-entry-promo__card">
                <div className="shares-entry-promo__media" onClick={() => setShareEntryPromoLightboxImg(membershipPlusMockup)}>
                  <img src={membershipPlusMockup} alt="Preview hasil Fremio Share" />
                  <span className="shares-entry-promo__label">Hasil Share</span>
                </div>
              </figure>
            </div>

            <div className="shares-entry-promo__actions">
              <button
                type="button"
                className="shares-action-btn shares-action-btn--primary shares-entry-promo__cta"
                onClick={() => {
                  setShowShareEntryPromoModal(false);
                  startTutorial();
                }}
              >
                <span>Lihat Cara Kerjanya</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {shareEntryPromoLightboxImg && (
        <div
          className="shares-entry-promo-lightbox"
          onClick={() => setShareEntryPromoLightboxImg(null)}
        >
          <img
            src={shareEntryPromoLightboxImg}
            alt="Preview Membership Plus"
            className="shares-entry-promo-lightbox__image"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="shares-entry-promo-lightbox__close"
            onClick={() => setShareEntryPromoLightboxImg(null)}
          >
            ×
          </button>
        </div>
      )}

      {renderStandaloneFramePickerModal()}

      {showFramesEditorModal && (
        <div className={`shares-modal-backdrop shares-modal-backdrop--frame-editor${isPreviewTutorialStep ? " shares-modal-backdrop--frame-editor-tutorial" : ""}`} onClick={closeFramesEditorModal}>
          <div onClick={(e) => e.stopPropagation()}>
            {renderFramesEditorShell(false)}
          </div>
        </div>
      )}

      {/* ─────── Share Modal ─────── */}
      {showShareModal && (
        <div className={`shares-modal-backdrop${isShareTutorialStep ? " shares-modal-backdrop--tutorial-share" : ""}`} onClick={() => setShowShareModal(false)}>
          <div
            ref={registerTutorialTarget("shareModal")}
            className={`shares-modal shares-modal--share${isShareTutorialStep ? " shares-modal--tutorial-focus" : ""}${isTutorialTargetActive("shareModal") || isShareTutorialStep ? " shares-tutorial-highlight" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shares-modal-header">
              <h2 className="shares-modal-title">Link Group: {shareDraftTitle}</h2>
              <button type="button" className="shares-modal-close" onClick={() => setShowShareModal(false)}><X size={20} /></button>
            </div>

            {shareModalLocked ? (
              <>
                <div className="shares-share-status shares-share-status--locked">
                  Link sudah dibuat dan dikunci. QR code akan selalu mengarah ke link yang sama.
                </div>

                {qrDataUrl && (
                  <div className="shares-share-qr-wrap">
                    <img src={qrDataUrl} alt="QR Code" className="shares-share-qr" />
                  </div>
                )}

                <div className="shares-share-link-box">
                  <span className="shares-share-link-text">{shareLink}</span>
                  <div className="shares-share-link-actions">
                    <button type="button" className="shares-share-copy-btn shares-share-copy-btn--secondary" onClick={handleDownloadQr}>
                      <Download size={16} />
                      <span>Unduh PNG</span>
                    </button>
                    <button type="button" className="shares-share-copy-btn" onClick={handleCopyLink}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copied ? "Tersalin!" : "Salin"}</span>
                    </button>
                  </div>
                </div>

                <div className="shares-share-slug-row shares-share-slug-row--locked">
                  <span className="shares-share-slug-prefix">{window.location.origin}/share/</span>
                  <input
                    type="text"
                    className="shares-share-slug-input shares-share-slug-input--locked"
                    value={shareModalDisplayId}
                    readOnly
                    disabled
                  />
                  <span className="shares-share-lock-badge">Terkunci</span>
                </div>

                <a
                  ref={registerTutorialTarget("shareOpenLink")}
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (isTutorialTargetActive("shareOpenLink")) {
                      setTutorialLinkOpened(true);
                    }
                  }}
                  className={`shares-share-open-link${isTutorialTargetActive("shareOpenLink") ? " shares-tutorial-highlight" : ""}`}
                >
                  Buka halaman →
                </a>
              </>
            ) : (
              <>
                <div className="shares-share-status">
                  Tentukan slug final untuk link group. Setelah disubmit, link dan QR code akan dibuat otomatis lalu tidak bisa diubah lagi.
                </div>

                <div className="shares-share-slug-row">
                  <span className="shares-share-slug-prefix">{window.location.origin}/share/</span>
                  <input
                    type="text"
                    className={`shares-share-slug-input${shareSlugError ? " shares-share-slug-input--error" : ""}`}
                    value={slugInput}
                    placeholder="custom-slug"
                    onChange={(e) => {
                      setSlugInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60));
                      if (shareSlugError) setShareSlugError("");
                    }}
                  />
                  <button
                    type="button"
                    disabled={isSavingSlug}
                    className="shares-slug-ok-btn"
                    onClick={handleSaveShareSlug}
                  >
                    {isSavingSlug ? "Membuat..." : "Buat Link"}
                  </button>
                </div>

                {shareSlugError ? (
                  <p className="shares-share-helper shares-share-helper--error">
                    {shareSlugError}
                  </p>
                ) : (
                  <p className="shares-share-helper">
                    Gunakan hanya huruf, angka, tanda hubung, atau underscore. Minimal 3 karakter.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─────── Confirm Dialog ─────── */}
      {confirmDialog && (
        <div className="shares-modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div className="shares-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="shares-confirm-dialog__title">Hapus group?</h3>
            <p className="shares-confirm-dialog__body">
              Group &ldquo;{confirmDialog.title}&rdquo; akan dihapus. Frame di dalamnya tetap ada di draftmu.
            </p>
            <div className="shares-confirm-dialog__actions">
              <button type="button" className="shares-action-btn" onClick={() => setConfirmDialog(null)}>Batal</button>
              <button type="button" className="shares-action-btn shares-action-btn--danger" onClick={() => confirmDeleteGroup(confirmDialog.id)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {showTutorial && tutorialStep ? (
        <div className={`shares-tutorial-overlay${isPreviewTutorialStep ? " shares-tutorial-overlay--editor-focus" : ""}${isShareTutorialStep ? " shares-tutorial-overlay--share-focus" : ""}${isFramePickerTutorialStep ? " shares-tutorial-overlay--picker-focus" : ""}`} aria-live="polite">
          <div className="shares-tutorial-overlay__backdrop" />
          <div className={`shares-tutorial-card${isTutorialMobileViewport ? " shares-tutorial-card--mobile" : ""}`} ref={tutorialCardRef} style={tutorialCardInlineStyle} role="dialog" aria-modal="false" aria-label={tutorialStep.title}>
            <div className="shares-tutorial-card__eyebrow">Tutorial Shares</div>
            <h3 className="shares-tutorial-card__title">{tutorialStep.title}</h3>
            <p className="shares-tutorial-card__body">{isTutorialMobileViewport ? (tutorialStep.mobileBody || tutorialStep.body) : tutorialStep.body}</p>
            <div className="shares-tutorial-card__footer">
              <div className="shares-tutorial-card__steps">Langkah {tutorialStepIndex + 1} / {tutorialSteps.length}</div>
              <div className="shares-tutorial-card__actions">
                <button type="button" className="shares-action-btn" onClick={closeTutorial}>Close</button>
                {tutorialStepIndex > 0 ? (
                  <button type="button" className="shares-action-btn" onClick={goToPreviousTutorialStep}>Kembali</button>
                ) : null}
                {tutorialStep.ctaLabel ? (
                  <button type="button" className="shares-action-btn shares-action-btn--primary" onClick={handleTutorialOpenPage}>
                    {tutorialStep.ctaLabel}
                  </button>
                ) : null}
                {tutorialStepIndex < tutorialSteps.length - 1 ? (
                  <button type="button" className="shares-action-btn shares-action-btn--primary" onClick={goToNextTutorialStep}>
                    Lanjut
                  </button>
                ) : tutorialLinkOpened ? (
                  <button type="button" className="shares-action-btn shares-action-btn--primary" onClick={goToNextTutorialStep}>
                    Selesai
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
