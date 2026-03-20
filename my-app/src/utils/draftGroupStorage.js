import safeStorage from "./safeStorage.js";

const STORAGE_PREFIX = "fremio-creator-draft-groups:";

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const nowIso = () => new Date().toISOString();

const buildStorageKey = (userId) => `${STORAGE_PREFIX}${userId || "guest"}`;

export const loadDraftGroups = (userId) => {
  try {
    const key = buildStorageKey(userId);
    const groups = safeStorage.getJSON(key, []);
    return ensureArray(groups);
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
      headerColor: "#ffffff",
      backgroundColor: "#fdf7f4",
      title1Text: "",
      title2Text: "",
      text: "",
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
      preferences: {
        logoDataUrl: current?.logoDataUrl ?? null,
        headerColor: current?.headerColor || "#ffffff",
        backgroundColor: current?.backgroundColor || "#fdf7f4",
        title1Text: current?.title1Text || "",
        title2Text: current?.title2Text || "",
        text: current?.text || "",
        ...patch,
      },
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
