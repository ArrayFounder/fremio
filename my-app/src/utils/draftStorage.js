import safeStorage from "./safeStorage.js";
import indexedDBStorage from "./indexedDBStorage.js";
import {
  saveDraftToCloud,
  getDraftsFromCloud,
  deleteDraftFromCloud,
  syncLocalDraftsToCloud,
} from "../services/draftCloudService.js";

const STORAGE_KEY = "fremio-creator-drafts";
const USE_INDEXEDDB = true; // Enable IndexedDB for larger storage capacity

const DEBUG = !!import.meta?.env?.DEV;

const SUMMARY_CACHE_PREFIX = "fremio-creator-draft-summaries:";

// DISABLED: Firebase cloud sync is not used in VPS mode
// Cloud sync now uses VPS backend via draftService.js (called from Create.jsx)
const USE_CLOUD_SYNC = false; // Disabled - using VPS backend instead of Firebase

const ensureArray = (value) => (Array.isArray(value) ? value : []);

// Get current user ID from localStorage
// CRITICAL: Wait for auth initialization, never return "guest" if user is logged in
const getCurrentUserId = () => {
  try {
    // Check multiple times to ensure storage is ready
    let userStr = null;
    for (let i = 0; i < 3; i++) {
      userStr = localStorage.getItem("fremio_user") || sessionStorage.getItem("fremio_user_cache");
      if (userStr) break;
    }
    
    if (userStr) {
      const user = JSON.parse(userStr);
      const userId = user?.email || user?.id;
      if (userId) {
        if (DEBUG) console.log('🔑 [getCurrentUserId] Found user:', userId);
        return userId;
      }
    }
  } catch (error) {
    console.error("❌ Failed to get current user:", error);
  }
  
  // Only return guest as last resort
  if (DEBUG) console.warn('⚠️ [getCurrentUserId] Returning guest - no user found in localStorage');
  return "guest";
};

const buildDraftSummary = (draft) => {
  if (!draft?.id) return null;
  return {
    id: draft.id,
    userId: draft.userId,
    title: draft.title ?? "Draft",
    description: draft.description,
    name: draft.name,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    preview: draft.preview,
    thumbnail: draft.thumbnail,
    signature: draft.signature,
    aspectRatio: draft.aspectRatio,
    cloudId: draft.cloudId ?? null,
    shareId: draft.shareId ?? null,
  };
};

export const getCachedDraftSummaries = (userId = null) => {
  try {
    const uid = userId || getCurrentUserId();
    if (!uid) return [];
    const cached = safeStorage.getJSON(`${SUMMARY_CACHE_PREFIX}${uid}`, []);
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
};

const setCachedDraftSummaries = (userId, summaries) => {
  try {
    if (!userId) return;
    const list = Array.isArray(summaries) ? summaries : [];
    safeStorage.setJSON(`${SUMMARY_CACHE_PREFIX}${userId}`, list);
  } catch {
    // ignore cache write errors
  }
};

const upsertCachedDraftSummary = (userId, summary) => {
  try {
    if (!userId || !summary?.id) return;
    const existing = getCachedDraftSummaries(userId);
    const idx = existing.findIndex((s) => s?.id === summary.id);
    const next = idx >= 0 ? [...existing.slice(0, idx), summary, ...existing.slice(idx + 1)] : [summary, ...existing];
    setCachedDraftSummaries(userId, next);
  } catch {
    // ignore
  }
};

const removeCachedDraftSummary = (userId, id) => {
  try {
    if (!userId || !id) return;
    const existing = getCachedDraftSummaries(userId);
    setCachedDraftSummaries(
      userId,
      existing.filter((s) => s?.id !== id)
    );
  } catch {
    // ignore
  }
};

export const loadDraftSummaries = async () => {
  const currentUserId = getCurrentUserId();

  // Fast path: local cache (instant)
  // But invalidate if cache was built before cloudId was tracked (old format)
  const cached = getCachedDraftSummaries(currentUserId);
  if (cached.length > 0 && Object.prototype.hasOwnProperty.call(cached[0], 'cloudId')) {
    return cached;
  }
  // If cache exists but is old format (missing cloudId), clear it so we rebuild below
  if (cached.length > 0) {
    setCachedDraftSummaries(currentUserId, []);
  }

  if (USE_INDEXEDDB) {
    try {
      if (DEBUG) console.log("📦 Loading draft summaries from IndexedDB for user:", currentUserId);
      const summaries = await indexedDBStorage.getDraftSummariesByUserId(currentUserId);
      // Only use IndexedDB summaries if they have the cloudId field (new format)
      if (Array.isArray(summaries) && summaries.length > 0 && Object.prototype.hasOwnProperty.call(summaries[0], 'cloudId')) {
        setCachedDraftSummaries(currentUserId, summaries);
        return summaries;
      }

      // Backfill summaries from full drafts (one-time cost per browser)
      // Also runs if IndexedDB summaries are in old format (missing cloudId)
      const userDrafts = await indexedDBStorage.getDraftsByUserId(currentUserId);
      const built = ensureArray(userDrafts)
        .map(buildDraftSummary)
        .filter(Boolean);

      // Write summaries in bulk (faster) but don't block returning
      setCachedDraftSummaries(currentUserId, built);
      void indexedDBStorage.saveDraftSummariesBulk(built);
      return built;
    } catch (error) {
      console.error("❌ Failed to load draft summaries from IndexedDB:", error);
    }
  }

  // Fallback to localStorage (metadata-only best effort)
  const drafts = safeStorage.getJSON(STORAGE_KEY, []);
  const userDrafts = ensureArray(drafts).filter(
    (draft) => draft.userId === currentUserId
  );
  return userDrafts.map(buildDraftSummary).filter(Boolean);
};

const generateId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const loadDrafts = async () => {
  const currentUserId = getCurrentUserId();

  // Try to load from cloud first if user is logged in
  if (USE_CLOUD_SYNC && currentUserId !== "guest") {
    try {
      console.log("☁️ Loading drafts from cloud for user:", currentUserId);
      const cloudDrafts = await getDraftsFromCloud(currentUserId);

      if (cloudDrafts.length > 0) {
        console.log(`✅ Loaded ${cloudDrafts.length} drafts from cloud`);

        // Also save to local storage for offline access
        if (USE_INDEXEDDB) {
          for (const draft of cloudDrafts) {
            await indexedDBStorage.saveDraft(draft);
          }
        } else {
          safeStorage.setJSON(STORAGE_KEY, cloudDrafts);
        }

        return cloudDrafts;
      }
    } catch (error) {
      console.warn("⚠️ Failed to load from cloud, using local storage:", error);
    }
  }

  if (USE_INDEXEDDB) {
    try {
      if (DEBUG) console.log("📦 Loading drafts from IndexedDB for user:", currentUserId);
      const userDrafts = await indexedDBStorage.getDraftsByUserId(currentUserId);
      if (DEBUG) console.log(`✅ Loaded ${userDrafts.length} drafts for user ${currentUserId}`);
      return userDrafts;
    } catch (error) {
      console.error(
        "❌ Failed to load from IndexedDB, falling back to localStorage:",
        error
      );
      // Fallback to localStorage
      const drafts = safeStorage.getJSON(STORAGE_KEY, []);
      const userDrafts = ensureArray(drafts).filter(
        (draft) => draft.userId === currentUserId
      );
      return userDrafts;
    }
  } else {
    const drafts = safeStorage.getJSON(STORAGE_KEY, []);
    const userDrafts = ensureArray(drafts).filter(
      (draft) => draft.userId === currentUserId
    );
    return userDrafts;
  }
};

export const getDraftById = async (id, userEmail = null) => {
  // Use provided userEmail if available, otherwise fall back to getCurrentUserId()
  // This bypasses localStorage timing issues when called from Create.jsx
  const currentUserId = userEmail || getCurrentUserId();
  console.log(`🔍 [getDraftById] Looking for draft ${id} with userId: "${currentUserId}"`);

  if (USE_INDEXEDDB) {
    try {
      const draft = await indexedDBStorage.getDraft(id);
      
      // CRITICAL: If currentUserId is "guest" but draft has a real user, this is an auth timing issue
      if (draft && currentUserId === "guest" && draft.userId && draft.userId !== "guest") {
        console.error(`🚨 AUTH TIMING ISSUE: Draft belongs to ${draft.userId} but currentUserId is guest!`);
        console.error(`   This means authentication hasn't initialized yet.`);
        console.error(`   Caller should provide userEmail parameter to bypass localStorage.`);
        return null;
      }
      
      // Verify draft belongs to current user
      if (draft && draft.userId === currentUserId) {
        console.log(`✅ [getDraftById] Draft ${id} found and belongs to user ${currentUserId}`);
        return draft;
      }
      // Enhanced logging for debugging userId mismatch
      if (draft) {
        console.warn(`⚠️ Draft ${id} belongs to different user:`);
        console.warn(`   Draft userId: "${draft.userId}"`);
        console.warn(`   Current userId: "${currentUserId}"`);
        console.warn(`   Match: ${draft.userId === currentUserId}`);
      } else {
        console.warn(`⚠️ Draft ${id} not found in IndexedDB`);
      }
      return null;
    } catch (error) {
      console.error(
        "❌ Failed to get draft from IndexedDB, falling back to localStorage:",
        error
      );
      // Fallback to localStorage
      const drafts = safeStorage.getJSON(STORAGE_KEY, []);
      const draft = ensureArray(drafts).find((draft) => draft.id === id);
      // Verify draft belongs to current user
      if (draft && draft.userId === currentUserId) {
        return draft;
      }
      return null;
    }
  } else {
    const drafts = safeStorage.getJSON(STORAGE_KEY, []);
    const draft = ensureArray(drafts).find((draft) => draft.id === id);
    // Verify draft belongs to current user
    if (draft && draft.userId === currentUserId) {
      return draft;
    }
    return null;
  }
};

const persistDraftsToLocalStorage = async (drafts) => {
  try {
    if (DEBUG) console.log("💾 [persistDrafts] Attempting to save to localStorage:", {
      count: drafts.length,
      ids: drafts.map((d) => d.id),
    });

    const success = safeStorage.setJSON(STORAGE_KEY, drafts);

    if (DEBUG) console.log("💾 [persistDrafts] setJSON result:", success);

    if (!success) {
      throw new Error(
        "Failed to save drafts to localStorage (setJSON returned false)"
      );
    }

    const verification = safeStorage.getJSON(STORAGE_KEY);

    if (DEBUG) console.log("✅ [persistDrafts] Verification result:", {
      isArray: Array.isArray(verification),
      count: verification?.length,
      ids: verification?.map((d) => d.id),
    });

    if (!Array.isArray(verification)) {
      throw new Error("Draft persistence verification failed - not an array");
    }

    if (verification.length !== drafts.length) {
      console.warn("⚠️ [persistDrafts] Draft count mismatch!", {
        expected: drafts.length,
        actual: verification.length,
      });
    }

    if (DEBUG) console.log("✅ [persistDrafts] Drafts successfully persisted and verified");
    return true;
  } catch (error) {
    console.error("❌ [persistDrafts] Failed to persist drafts", error);
    console.error("❌ [persistDrafts] Error details:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    throw error;
  }
};

const buildSavedDraft = (incoming, nowIso, existing, id) => {
  const currentUserId = getCurrentUserId();
  
  const result = {
    ...existing,
    ...incoming,
    id,
    userId: incoming.userId ?? existing?.userId ?? currentUserId, // Always set userId
    title: incoming.title ?? existing?.title ?? "Draft",
    createdAt: existing?.createdAt ?? incoming.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  
  // Debug logging for userId tracking - use string interpolation for better visibility
  if (DEBUG) {
    console.log(`🔍 [buildSavedDraft] userId resolution for ${id.substring(0, 20)}:`);
    console.log(`   incoming.userId: "${incoming.userId}"`);
    console.log(`   existing.userId: "${existing?.userId}"`);
    console.log(`   currentUserId: "${currentUserId}"`);
    console.log(`   FINAL userId: "${result.userId}"`);
  }
  
  return result;
};

const saveDraftToIndexedDB = async (incoming, nowIso) => {
  const id = incoming.id ?? generateId();
  const normalizedIncoming = { ...incoming, id };
  const existing = incoming.id
    ? await indexedDBStorage.getDraft(incoming.id)
    : null;
  const savedDraft = buildSavedDraft(normalizedIncoming, nowIso, existing, id);

  if (DEBUG) console.log("💾 [saveDraft] Persisting single draft to IndexedDB:", {
    id: savedDraft.id,
    hasElements: Array.isArray(savedDraft.elements),
  });

  await indexedDBStorage.saveDraft(savedDraft);
  // Keep summary in sync for faster listing
  const summary = buildDraftSummary(savedDraft);
  if (summary) {
    await indexedDBStorage.saveDraftSummary(summary);
    upsertCachedDraftSummary(savedDraft.userId, summary);
  }
  return savedDraft;
};

const saveDraftToLocalStorage = async (incoming, nowIso) => {
  const drafts = ensureArray(safeStorage.getJSON(STORAGE_KEY, []));
  const id = incoming.id ?? generateId();
  const index = drafts.findIndex((draft) => draft.id === id);
  const existing = index !== -1 ? drafts[index] : null;
  const savedDraft = buildSavedDraft({ ...incoming, id }, nowIso, existing, id);

  if (index !== -1) {
    drafts[index] = savedDraft;
  } else {
    drafts.push(savedDraft);
  }

  await persistDraftsToLocalStorage(drafts);
  return savedDraft;
};

export const deleteDraft = async (id) => {
  const currentUserId = getCurrentUserId();

  if (USE_INDEXEDDB) {
    try {
      // Verify draft belongs to current user before deleting
      const draft = await indexedDBStorage.getDraft(id);
      if (draft && draft.userId === currentUserId) {
        await indexedDBStorage.deleteDraft(id);
        await indexedDBStorage.deleteDraftSummary(id);
        removeCachedDraftSummary(currentUserId, id);
        console.log(
          `✅ Deleted draft ${id} from IndexedDB for user ${currentUserId}`
        );
      } else {
        console.warn(
          `⚠️ Cannot delete draft ${id} - belongs to different user`
        );
      }

      // Delete from cloud if enabled
      if (USE_CLOUD_SYNC && currentUserId !== "guest") {
        try {
          console.log("☁️ Deleting draft from cloud:", id);
          await deleteDraftFromCloud(currentUserId, id);
          console.log("✅ Deleted from cloud:", id);
        } catch (cloudError) {
          console.error(
            "⚠️ Failed to delete from cloud (local delete succeeded):",
            cloudError
          );
        }
      }

      return await loadDrafts(); // Return updated list for current user
    } catch (error) {
      console.error("❌ Failed to delete from IndexedDB:", error);
      // Fallback to localStorage
      const drafts = safeStorage.getJSON(STORAGE_KEY, []);
      const nextDrafts = ensureArray(drafts).filter(
        (draft) => draft.id !== id || draft.userId !== currentUserId
      );
      safeStorage.setJSON(STORAGE_KEY, nextDrafts);

      // Delete from cloud if enabled
      if (USE_CLOUD_SYNC && currentUserId !== "guest") {
        try {
          await deleteDraftFromCloud(currentUserId, id);
        } catch (cloudError) {
          console.error("⚠️ Failed to delete from cloud:", cloudError);
        }
      }

      return nextDrafts.filter((draft) => draft.userId === currentUserId);
    }
  } else {
    const drafts = safeStorage.getJSON(STORAGE_KEY, []);
    const nextDrafts = ensureArray(drafts).filter(
      (draft) => draft.id !== id || draft.userId !== currentUserId
    );
    safeStorage.setJSON(STORAGE_KEY, nextDrafts);

    // Delete from cloud if enabled
    if (USE_CLOUD_SYNC && currentUserId !== "guest") {
      try {
        console.log("☁️ Deleting draft from cloud:", id);
        await deleteDraftFromCloud(currentUserId, id);
        console.log("✅ Deleted from cloud:", id);
      } catch (cloudError) {
        console.error(
          "⚠️ Failed to delete from cloud (local delete succeeded):",
          cloudError
        );
      }
    }

    return nextDrafts.filter((draft) => draft.userId === currentUserId);
  }
};

export const clearDrafts = async () => {
  if (USE_INDEXEDDB) {
    try {
      await indexedDBStorage.clearAllDrafts();
    } catch (error) {
      console.error("❌ Failed to clear IndexedDB:", error);
    }
  }
  safeStorage.removeItem(STORAGE_KEY);
};

export const saveDraft = async (inputDraft) => {
  const nowIso = new Date().toISOString();
  const incoming = { ...inputDraft };
  const currentUserId = getCurrentUserId();

  let savedDraft;

  if (USE_INDEXEDDB) {
    try {
      savedDraft = await saveDraftToIndexedDB(incoming, nowIso);
    } catch (error) {
      console.error(
        "❌ [saveDraft] Failed to save draft to IndexedDB, falling back to localStorage:",
        error
      );
      savedDraft = await saveDraftToLocalStorage(incoming, nowIso);
    }
  } else {
    savedDraft = await saveDraftToLocalStorage(incoming, nowIso);
  }

  // Save to cloud if enabled and user is logged in
  if (USE_CLOUD_SYNC && currentUserId !== "guest") {
    try {
      console.log("☁️ Syncing draft to cloud:", savedDraft.id);
      await saveDraftToCloud(currentUserId, savedDraft);
      console.log("✅ Synced to cloud:", savedDraft.id);
    } catch (cloudError) {
      console.error(
        "⚠️ Failed to sync to cloud (local save succeeded):",
        cloudError
      );
      // Don't throw - local save succeeded
    }
  }

  return savedDraft;
};

export default {
  loadDrafts,
  loadDraftSummaries,
  getCachedDraftSummaries,
  getDraftById,
  saveDraft,
  deleteDraft,
  clearDrafts,
};
