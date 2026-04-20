import safeStorage from "./safeStorage.js";

const STORAGE_PREFIX = "fremio-creator-draft-groups:";
const DEFAULT_HEADER_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_COLOR = "#fdf7f4";
const LEGACY_TAKE_MOMENT_COLOR = "#F4E6DA";
const MAX_INFO_COLUMNS = 3;
const DEFAULT_INFO_COLUMNS_COUNT = 2;
const DEFAULT_TITLE1_TEXT = "Nama Brand / Event Kamu";

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const nowIso = () => new Date().toISOString();

const buildStorageKey = (userId) => `${STORAGE_PREFIX}${userId || "guest"}`;

const normalizeInfoColumns = (value) => {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: MAX_INFO_COLUMNS }, (_, index) => ({
    subtitle: typeof source[index]?.subtitle === "string" ? source[index].subtitle : "",
    text: typeof source[index]?.text === "string" ? source[index].text : "",
  }));
};

const normalizeInfoColumnsCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_INFO_COLUMNS_COUNT;
  return Math.min(MAX_INFO_COLUMNS, Math.max(1, numeric));
};

const normalizePreferences = (preferences) => {
  const current = preferences && typeof preferences === "object" ? preferences : {};

  return {
    ...current,
    headerColor: current?.headerColor || DEFAULT_HEADER_COLOR,
    backgroundColor: current?.backgroundColor || DEFAULT_BACKGROUND_COLOR,
    takeMomentHeaderColor:
      !current?.takeMomentHeaderColor || current.takeMomentHeaderColor === LEGACY_TAKE_MOMENT_COLOR
        ? DEFAULT_HEADER_COLOR
        : current.takeMomentHeaderColor,
    takeMomentBgColor:
      !current?.takeMomentBgColor || current.takeMomentBgColor === LEGACY_TAKE_MOMENT_COLOR
        ? DEFAULT_BACKGROUND_COLOR
        : current.takeMomentBgColor,
    editPhotoHeaderColor:
      !current?.editPhotoHeaderColor || current.editPhotoHeaderColor === DEFAULT_BACKGROUND_COLOR
        ? DEFAULT_HEADER_COLOR
        : current.editPhotoHeaderColor,
    editPhotoBgColor: current?.editPhotoBgColor || DEFAULT_BACKGROUND_COLOR,
    infoSubtitleFontFamily: current?.infoSubtitleFontFamily || current?.title2FontFamily || "Inter",
    infoSubtitleFontSize:
      Number(current?.infoSubtitleFontSize) > 0
        ? Number(current.infoSubtitleFontSize)
        : Math.max(12, Number(current?.title2FontSize) > 0 ? Number(current.title2FontSize) - 4 : 18),
    infoSubtitleTextAlign: current?.infoSubtitleTextAlign || current?.textTextAlign || current?.title2TextAlign || "left",
    infoColumnsCount: normalizeInfoColumnsCount(current?.infoColumnsCount),
    infoColumns: normalizeInfoColumns(current?.infoColumns),
  };
};

const normalizeGroup = (group) => {
  if (!group || typeof group !== "object") return group;
  return {
    ...group,
    preferences: normalizePreferences(group.preferences),
  };
};

export const loadDraftGroups = (userId) => {
  try {
    const key = buildStorageKey(userId);
    const groups = ensureArray(safeStorage.getJSON(key, [])).map(normalizeGroup);
    safeStorage.setJSON(key, groups);
    return groups;
  } catch {
    return [];
  }
};

export const saveDraftGroups = (userId, groups) => {
  try {
    const key = buildStorageKey(userId);
    safeStorage.setJSON(key, ensureArray(groups));
  } catch {
    // ignore
  }
};

export const createDraftGroup = (userId, { name } = {}) => {
  const existing = loadDraftGroups(userId);
  const nextIndex = existing.length + 1;
  const group = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || `Group ${nextIndex}`,
    draftIds: [],
    preferences: {
      logoDataUrl: null,
      headerColor: DEFAULT_HEADER_COLOR,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      logoPosition: "center",
      logoWidth: 220,
      title1Text: DEFAULT_TITLE1_TEXT,
      title1Position: "center",
      title1FontFamily: "Inter",
      title1FontSize: 22,
      title1TextAlign: "center",
      title2Text: "",
      title2Position: "left",
      title2FontFamily: "Inter",
      title2FontSize: 22,
      title2TextAlign: "left",
      infoSubtitleFontFamily: "Inter",
      infoSubtitleFontSize: 18,
      infoSubtitleTextAlign: "left",
      text: "",
      textPosition: "left",
      textFontFamily: "Inter",
      textFontSize: 13,
      textTextAlign: "left",
      infoColumnsCount: DEFAULT_INFO_COLUMNS_COUNT,
      infoColumns: normalizeInfoColumns(),
      infoBoxColor: "#ffffff",
      infoBoxOpacity: 100,
      infoBoxWidth: 420,
      infoBoxPaddingX: 18,
      infoBoxPaddingY: 14,
      infoBoxRadius: 0,
      takeMomentHeaderColor: DEFAULT_HEADER_COLOR,
      takeMomentBgColor: DEFAULT_BACKGROUND_COLOR,
      editPhotoHeaderColor: DEFAULT_HEADER_COLOR,
      editPhotoBgColor: DEFAULT_BACKGROUND_COLOR,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const next = [...existing, group];
  saveDraftGroups(userId, next);
  return group;
};

export const updateDraftGroupPreferences = (userId, groupId, preferences) => {
  if (!groupId) return loadDraftGroups(userId);

  const existing = loadDraftGroups(userId);
  const next = existing.map((g) => {
    if (!g || g.id !== groupId) return g;
    const current = g?.preferences && typeof g.preferences === "object" ? g.preferences : {};
    const patch = preferences && typeof preferences === "object" ? preferences : {};
    return {
      ...g,
      preferences: normalizePreferences({
        logoDataUrl: current?.logoDataUrl ?? null,
        headerColor: current?.headerColor || DEFAULT_HEADER_COLOR,
        backgroundColor: current?.backgroundColor || DEFAULT_BACKGROUND_COLOR,
        logoPosition: current?.logoPosition || "center",
        logoWidth: Number(current?.logoWidth) > 0 ? Number(current.logoWidth) : 220,
        title1Text: current?.title1Text || "",
        title1Position: current?.title1Position || "center",
        title1FontFamily: current?.title1FontFamily || "Inter",
        title1FontSize: Number(current?.title1FontSize) > 0 ? Number(current.title1FontSize) : 22,
        title1TextAlign: current?.title1TextAlign || "center",
        title2Text: current?.title2Text || "",
        title2Position: current?.title2Position || "left",
        title2FontFamily: current?.title2FontFamily || "Inter",
        title2FontSize: Number(current?.title2FontSize) > 0 ? Number(current.title2FontSize) : 22,
        title2TextAlign: current?.title2TextAlign || "left",
        infoSubtitleFontFamily: current?.infoSubtitleFontFamily || current?.title2FontFamily || "Inter",
        infoSubtitleFontSize:
          Number(current?.infoSubtitleFontSize) > 0
            ? Number(current.infoSubtitleFontSize)
            : Math.max(12, Number(current?.title2FontSize) > 0 ? Number(current.title2FontSize) - 4 : 18),
        infoSubtitleTextAlign: current?.infoSubtitleTextAlign || current?.textTextAlign || current?.title2TextAlign || "left",
        text: current?.text || "",
        textPosition: current?.textPosition || "left",
        textFontFamily: current?.textFontFamily || "Inter",
        textFontSize: Number(current?.textFontSize) > 0 ? Number(current.textFontSize) : 13,
        textTextAlign: current?.textTextAlign || "left",
        infoColumnsCount: normalizeInfoColumnsCount(current?.infoColumnsCount),
        infoColumns: normalizeInfoColumns(current?.infoColumns),
        infoBoxColor: current?.infoBoxColor || "#ffffff",
        infoBoxOpacity: Number(current?.infoBoxOpacity) >= 0 ? Number(current.infoBoxOpacity) : 100,
        infoBoxWidth: Number(current?.infoBoxWidth) > 0 ? Number(current.infoBoxWidth) : 420,
        infoBoxPaddingX: Number(current?.infoBoxPaddingX) >= 0 ? Number(current.infoBoxPaddingX) : 18,
        infoBoxPaddingY: Number(current?.infoBoxPaddingY) >= 0 ? Number(current.infoBoxPaddingY) : 14,
        infoBoxRadius: Number(current?.infoBoxRadius) >= 0 ? Number(current.infoBoxRadius) : 0,
        takeMomentHeaderColor: current?.takeMomentHeaderColor || DEFAULT_HEADER_COLOR,
        takeMomentBgColor: current?.takeMomentBgColor || DEFAULT_BACKGROUND_COLOR,
        editPhotoHeaderColor: current?.editPhotoHeaderColor || DEFAULT_HEADER_COLOR,
        editPhotoBgColor: current?.editPhotoBgColor || DEFAULT_BACKGROUND_COLOR,
        // Preserve share persistence fields — allow patch to override or clear
        shareId: current?.shareId ?? null,
        shareSlug: current?.shareSlug ?? null,
        ...patch,
        // QR code is generated once and never overwritten — ignore patch if it doesn't have a real value
        qrDataUrl: patch?.qrDataUrl || current?.qrDataUrl || null,
      }),
      updatedAt: nowIso(),
    };
  });

  saveDraftGroups(userId, next);
  return next;
};

export const toggleDraftInGroup = (userId, groupId, draftId) => {
  if (!groupId || !draftId) return loadDraftGroups(userId);

  const existing = loadDraftGroups(userId);
  const next = existing.map((g) => {
    if (!g || g.id !== groupId) return g;
    const current = new Set(ensureArray(g.draftIds));
    if (current.has(draftId)) current.delete(draftId);
    else current.add(draftId);
    return {
      ...g,
      draftIds: Array.from(current),
      updatedAt: nowIso(),
    };
  });
  saveDraftGroups(userId, next);
  return next;
};

export const getDraftGroupById = (userId, groupId) => {
  const groups = loadDraftGroups(userId);
  return groups.find((g) => g?.id === groupId) || null;
};

// Delete a group without touching its drafts (frames stay in All Frames)
export const deleteDraftGroup = (userId, groupId) => {
  const existing = loadDraftGroups(userId);
  const next = existing.filter((g) => g?.id !== groupId);
  saveDraftGroups(userId, next);
  return next;
};
