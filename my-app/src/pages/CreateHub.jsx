import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Share2, Check, Copy, Trash2, Download, LayoutTemplate } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import logoSalem from "../assets/logo-salem.png";
import burgerBarIcon from "../assets/burger-bar.png";
import draftStorage from "../utils/draftStorage.js";
import draftService from "../services/draftService.js";
import { trackFrameView } from "../services/analyticsService.js";
import paymentService from "../services/paymentService";
import userStorage from "../utils/userStorage.js";
import { generateShareLink } from "../services/frameShareService.js";
import { splitDraftsByMembershipAccess } from "../utils/draftAccess.js";
import {
  createDraftGroup,
  deleteDraftGroup,
  loadDraftGroups,
  saveDraftGroups,
  toggleDraftInGroup,
  updateDraftGroupPreferences,
} from "../utils/draftGroupStorage.js";
import { buildSlotMaps } from "../utils/slotSystem.js";
import CanvasPreview from "../components/creator/CanvasPreview.jsx";
import "./CreateHub.css";

const MAX_INFO_COLUMNS = 3;
const DEFAULT_INFO_COLUMNS_COUNT = 2;
const DEFAULT_TITLE1_TEXT = "Nama Brand / Event Kamu";

const toFinite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

export default function CreateHub() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const [cloudDrafts, setCloudDrafts] = useState([]);
  const [hasCloudDraftSnapshot, setHasCloudDraftSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareDraftTitle, setShareDraftTitle] = useState("");
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessibleFrameIds, setAccessibleFrameIds] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { type: 'frame-batch'|'group', ids?, id?, title? }
  // Batch-delete mode
  const [isDeletingMode, setIsDeletingMode] = useState(false);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState(new Set());
  const isMountedRef = useRef(true);
  const shareLinkCacheRef = useRef({}); // draftId/groupId → share link
  const [expandedDescriptions, setExpandedDescriptions] = useState(() => new Set());

  const [groups, setGroups] = useState([]);
  const [activeTab, setActiveTab] = useState({ type: "all" });
  const [addingToGroupId, setAddingToGroupId] = useState(null);
  const [groupViewMode, setGroupViewMode] = useState("frames");
  const [slugInput, setSlugInput] = useState(""); // local editing state for share link slug
  const [isSavingSlug, setIsSavingSlug] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(""); // QR code for current share modal

  // Generate QR data URL from a link string
  const generateQR = useCallback(async (link) => {
    try {
      return await QRCode.toDataURL(link, { width: 256, margin: 2, color: { dark: "#1f2937", light: "#ffffff" } });
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync authenticated user to storage so utilities like getCurrentUserId work reliably
  useEffect(() => {
    if (user?.email) {
      try {
        const payload = JSON.stringify(user);
        localStorage.setItem("fremio_user", payload);
        sessionStorage.setItem("fremio_user_cache", payload);
        console.log("🔐 [CreateHub] Synced user to storage:", user.email);
      } catch (err) {
        console.warn("⚠️ [CreateHub] Failed to sync user to storage", err);
      }
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    setGroups(loadDraftGroups(user.email));
  }, [user?.email]);

  // Load designer templates
  useEffect(() => {
    setTemplatesLoading(true);
    const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
    const headers = {};
    const storedToken = token || localStorage.getItem("fremio_token");
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
    fetch(`${API_URL}/designer/templates`, { headers })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const all = data.templates || [];
        // Free templates first (left), paid/locked templates last (right).
        // Within each group, backend display_order is already preserved.
        const free = all.filter((t) => !t.is_premium);
        const paid = all.filter((t) => !!t.is_premium);
        setTemplates([...free, ...paid]);
      })
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [token]);

  // Check user's subscription access for premium templates
  useEffect(() => {
    if (!user?.email) {
      setHasAccess(false);
      setAccessibleFrameIds([]);
      return;
    }
    paymentService.getAccess()
      .then((res) => {
        if (res.success && res.hasAccess) {
          setHasAccess(true);
          setAccessibleFrameIds(res.data?.frameIds || []);
        } else {
          setHasAccess(false);
          setAccessibleFrameIds([]);
        }
      })
      .catch(() => {
        setHasAccess(false);
        setAccessibleFrameIds([]);
      });
  }, [user?.email]);

  // Clean up guest keys and migrate global activeDraft to user-scoped
  useEffect(() => {
    if (!user?.email) return;
    
    try {
      // Remove guest-prefixed keys
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("guest:")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      if (keysToRemove.length > 0) {
        console.log(`🧹 [CreateHub] Removed ${keysToRemove.length} guest keys`);
      }
      
      // Migrate global activeDraftId to user-scoped
      const globalActiveDraftId = localStorage.getItem("activeDraftId");
      if (globalActiveDraftId) {
        userStorage.setItem("activeDraftId", globalActiveDraftId);
        localStorage.removeItem("activeDraftId");
        console.log("🔄 [CreateHub] Migrated global activeDraftId to user storage");
      }

      // Draft membership locks were historically stored only in localStorage,
      // which makes the same account show different states on different devices.
      // Clear that per-device cache so cloud drafts remain consistent everywhere.
      localStorage.removeItem(`fremio_locked_drafts_${user.email}`);
    } catch (err) {
      console.warn("⚠️ [CreateHub] Failed to clean up storage:", err);
    }
  }, [user?.email]);

  const reloadDrafts = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setHasCloudDraftSnapshot(false);

    const storedToken = localStorage.getItem("fremio_token");

    // VPS-FIRST: token alone is sufficient (server decodes userId from JWT).
    // Do NOT gate on user?.email — auth context may finish AFTER first render on mobile.
    if (storedToken) {
      try {
        const cloudData = await draftService.getCloudDrafts();
        const cloudList = Array.isArray(cloudData) ? cloudData : [];
        if (isMountedRef.current) {
          setCloudDrafts(cloudList);
          setHasCloudDraftSnapshot(true);
          console.log(`✅ [CreateHub] Loaded ${cloudList.length} VPS drafts`);
          setLoading(false);
        }
        // Also load local drafts (for offline/unsynced items) but don't block UI
        if (user?.email) {
          try {
            const localDrafts = draftStorage.loadDraftSummaries
              ? await draftStorage.loadDraftSummaries()
              : await draftStorage.loadDrafts();
            if (isMountedRef.current) {
              setDrafts(Array.isArray(localDrafts) ? localDrafts : []);
            }
          } catch { /* local load failure is non-critical */ }
        }
        return;
      } catch (cloudError) {
        console.warn("☁️ [CreateHub] VPS load failed, using local fallback:", cloudError.message);
      }
    }

    // Fallback: local IndexedDB only (offline / no token)
    if (!user?.email) {
      if (isMountedRef.current) setLoading(false);
      return;
    }
    try {
      const localDrafts = draftStorage.loadDraftSummaries
        ? await draftStorage.loadDraftSummaries()
        : await draftStorage.loadDrafts();
      if (isMountedRef.current) {
        setCloudDrafts([]);
        setDrafts(Array.isArray(localDrafts) ? localDrafts : []);
        console.log(`✅ [CreateHub] Loaded ${localDrafts?.length || 0} local drafts (fallback)`);
      }
    } catch (error) {
      console.error("⚠️ Failed to load drafts", error);
      if (isMountedRef.current) {
        setCloudDrafts([]);
        setDrafts([]);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    reloadDrafts();
  }, [reloadDrafts]);

  const sortedDrafts = useMemo(() => {
    const byDate = (a, b) =>
      new Date(b?.updatedAt || b?.createdAt || 0).getTime() -
      new Date(a?.updatedAt || a?.createdAt || 0).getTime();

    // When cloud fetch succeeds, use the VPS list as the only source of truth so
    // desktop and mobile show the same drafts instead of mixing stale local data.
    if (hasCloudDraftSnapshot) {
      // Map VPS entries to display shape — sort newest first, dedupe by title
      const allVps = cloudDrafts
        .map((cd) => ({
          id: `cloud-${cd.id}`,
          cloudId: cd.id,
          shareId: cd.share_id,
          title: cd.title || "Draft",
          thumbnail: cd.preview_url || null,
          thumbnailUrl: cd.preview_url || null,
          preview: cd.preview_url || null,
          createdAt: cd.created_at,
          updatedAt: cd.updated_at,
          isCloudOnly: true,
        }))
        .sort(byDate);

      // Deduplicate: per title, keep only the most recent entry
      const seenTitles = new Set();
      const vpsDraftList = allVps.filter((d) => {
        const key = d.title.trim().toLowerCase();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      });

      return vpsDraftList;
    }

    // Fallback: local only (offline / VPS unavailable)
    return [...drafts].sort(byDate);
  }, [drafts, cloudDrafts, hasCloudDraftSnapshot]);

  const activeGroup = useMemo(() => {
    if (activeTab?.type !== "group") return null;
    return groups.find((g) => g?.id === activeTab?.groupId) || null;
  }, [activeTab, groups]);

  // Keep slugInput in sync with the active group's stored slug
  useEffect(() => {
    const stored = activeGroup?.preferences?.shareSlug || activeGroup?.preferences?.shareId || "";
    setSlugInput(stored);
  }, [activeGroup?.id, activeGroup?.preferences?.shareSlug, activeGroup?.preferences?.shareId]);

  const groupDraftIdSet = useMemo(() => {
    const ids = activeGroup?.draftIds;
    return new Set(Array.isArray(ids) ? ids : []);
  }, [activeGroup]);

  const selectionGroup = useMemo(() => {
    if (!addingToGroupId) return null;
    return groups.find((g) => g?.id === addingToGroupId) || null;
  }, [addingToGroupId, groups]);

  const selectionGroupDraftIdSet = useMemo(() => {
    const ids = selectionGroup?.draftIds;
    return new Set(Array.isArray(ids) ? ids : []);
  }, [selectionGroup]);


  // Batch-delete helpers
  const enterDeleteMode = useCallback(() => {
    setIsDeletingMode(true);
    setDeleteSelectedIds(new Set());
    setAddingToGroupId(null);
  }, []);

  const exitDeleteMode = useCallback(() => {
    setIsDeletingMode(false);
    setDeleteSelectedIds(new Set());
  }, []);

  const toggleDeleteSelection = useCallback((draftId) => {
    setDeleteSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  }, []);

  const handleDeleteFrame = useCallback(() => {
    if (deleteSelectedIds.size === 0) return;
    setConfirmDialog({ type: 'frame-batch', ids: Array.from(deleteSelectedIds) });
  }, [deleteSelectedIds]);

  const confirmDeleteFrame = useCallback(async (ids) => {
    try {
      await Promise.all(ids.map(async (id) => {
        if (String(id).startsWith('cloud-')) {
          // Cloud-only draft: delete via API
          const cloudId = String(id).replace('cloud-', '');
          await draftService.deleteDraftFromCloud(cloudId).catch(() => {});
          setCloudDrafts((prev) => prev.filter((cd) => String(cd.id) !== cloudId));
          // Also remove any stale local IndexedDB entry with this cloud-prefixed ID
          await draftStorage.deleteDraft(id).catch(() => {});
        } else {
          // Local draft: also delete its cloud copy if it was synced, to prevent ghost cards
          const localDraft = drafts.find((d) => d.id === id);
          if (localDraft?.cloudId) {
            await draftService.deleteDraftFromCloud(localDraft.cloudId).catch(() => {});
            setCloudDrafts((prev) => prev.filter((cd) => String(cd.id) !== String(localDraft.cloudId)));
          }
          await draftStorage.deleteDraft(id);
        }
      }));
      const idSet = new Set(ids);
      setDrafts((prev) => prev.filter((d) => !idSet.has(d.id)));
      // Also remove deleted IDs from persisted locked set so they don't ghost-block new saves
      if (user?.email) {
        try {
          const raw = localStorage.getItem(`fremio_locked_drafts_${user.email}`);
          if (raw) {
            const lockedArr = JSON.parse(raw);
            const deletedIds = new Set(ids.map((id) => String(id)));
            const deletedRawCloudIds = new Set(
              ids
                .map((id) => (String(id).startsWith('cloud-') ? String(id).replace('cloud-', '') : null))
                .filter(Boolean)
            );
            const updated = lockedArr.filter(
              (lid) => !deletedIds.has(String(lid)) && !deletedRawCloudIds.has(String(lid))
            );
            localStorage.setItem(`fremio_locked_drafts_${user.email}`, JSON.stringify(updated));
          }
        } catch (_) {}
      }
      if (user?.email) {
        const updatedGroups = loadDraftGroups(user.email).map((g) => ({
          ...g,
          draftIds: (g.draftIds || []).filter((id) => !idSet.has(id)),
        }));
        saveDraftGroups(user.email, updatedGroups);
        setGroups(updatedGroups);
      }
      showToast("success", `${ids.length} frame berhasil dihapus`);
    } catch (e) {
      showToast("error", "Gagal menghapus frame");
    } finally {
      setConfirmDialog(null);
      exitDeleteMode();
    }
  }, [user, showToast, exitDeleteMode, drafts]);

  // Delete a group only — frames remain in All Frames
  const handleDeleteGroup = useCallback((groupId, groupName) => {
    setConfirmDialog({ type: 'group', id: groupId, title: groupName });
  }, []);

  const confirmDeleteGroup = useCallback((groupId) => {
    if (!user?.email) return;
    const updated = deleteDraftGroup(user.email, groupId);
    setGroups(updated);
    setActiveTab({ type: 'all' });
    setConfirmDialog(null);
    showToast("success", "Group berhasil dihapus (frame tetap ada)");
  }, [user, showToast]);

  // Navigate to editor for new frame
  const handleCreateNew = () => {
    // Clear any active draft
    userStorage.removeItem("activeDraftId");
    userStorage.removeItem("activeDraftSignature");
    navigate("/create/editor");
  };

  // Navigate to editor with existing draft
  const handleOpenDraft = async (draft) => {
    if (!draft) return;

    // Cloud-only draft: fetch full frame_data from VPS then cache locally
    if (draft.isCloudOnly && draft.cloudId) {
      try {
        const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
        const storedToken = localStorage.getItem("fremio_token");
        const res = await fetch(`${API_URL}/drafts/by-id/${draft.cloudId}`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const vps = data.draft;
        let fd = {};
        try { fd = JSON.parse(vps.frame_data || "{}"); } catch { /**/ }
        const draftPreview = fd.thumbnail || fd.preview || vps.preview_url || null;
        const localDraft = await draftStorage.saveDraft({
          title: vps.title || draft.title,
          elements: fd.elements || [],
          aspectRatio: fd.aspectRatio,
          canvasBackground: fd.canvasBackground,
          canvasWidth: fd.canvasWidth,
          canvasHeight: fd.canvasHeight,
          preview: draftPreview,
          thumbnail: draftPreview,
          cloudId: vps.id,
          shareId: vps.share_id,
          userId: user?.email, // CRITICAL: prevents "guest" userId mismatch
        });
        userStorage.setItem("activeDraftId", localDraft.id);
        userStorage.removeItem("activeDraftSignature");
        navigate("/create/editor", { state: { draftId: localDraft.id } });
        return;
      } catch (err) {
        console.error("Failed to open cloud draft:", err);
        showToast("error", "Gagal membuka frame");
        return;
      }
    }

    // Local draft (normal case)
    userStorage.setItem("activeDraftId", draft.id);
    if (draft.signature) {
      userStorage.setItem("activeDraftSignature", draft.signature);
    } else {
      userStorage.removeItem("activeDraftSignature");
    }
    navigate("/create/editor", { state: { draftId: draft.id } });
  };

  // Share draft - upload ke VPS PostgreSQL lalu generate link
  const handleShareDraft = async (e, draft) => {
    e.stopPropagation(); // Prevent card click
    if (!user?.email) {
      showToast("info", "Anda belum login, silakan login untuk menggunakan fitur ini");
      return;
    }
    if (!draft?.id) return;

    const baseUrl = window.location.origin;

    // Reuse cached link if already generated
    if (shareLinkCacheRef.current[draft.id]) {
      const _cachedLink = shareLinkCacheRef.current[draft.id];
      setShareLink(_cachedLink);
      setShareDraftTitle(draft.title || "Draft");
      setQrDataUrl("");
      generateQR(_cachedLink).then(setQrDataUrl).catch(() => {});
      setShowShareModal(true);
      setCopied(false);
      return;
    }

    // Cloud-only draft already has a share_id — use it directly
    if (draft.shareId) {
      const link = `${baseUrl}/take-moment?share=${draft.shareId}`;
      shareLinkCacheRef.current[draft.id] = link;
      setShareLink(link);
      setShareDraftTitle(draft.title || "Draft");
      setQrDataUrl("");
      generateQR(link).then(setQrDataUrl).catch(() => {});
      setShowShareModal(true);
      setCopied(false);
      return;
    }
    
    setIsGeneratingLink(true);
    
    try {

      // Ensure we have the full draft (summaries may not include elements)
      let fullDraft = draft;
      if (!Array.isArray(fullDraft?.elements)) {
        fullDraft = await draftStorage.getDraftById(draft.id, user?.email);
      }
      // Fallback for cloud-only drafts not stored in IndexedDB
      if (!fullDraft && draft?._frameData) {
        const parsed = typeof draft._frameData === 'string' ? JSON.parse(draft._frameData) : draft._frameData;
        fullDraft = { ...draft, ...parsed };
      }
      if (!fullDraft && draft?.cloudId) {
        const cloudDraft = await draftService.getDraftById(draft.cloudId);
        if (cloudDraft?.frame_data) {
          const parsed = typeof cloudDraft.frame_data === 'string' ? JSON.parse(cloudDraft.frame_data) : cloudDraft.frame_data;
          fullDraft = {
            title: cloudDraft.title,
            preview: parsed?.thumbnail || parsed?.preview || cloudDraft.preview_url,
            thumbnail: parsed?.thumbnail || parsed?.preview || cloudDraft.preview_url,
            ...parsed,
          };
        }
      }
      if (!fullDraft) {
        throw new Error("Draft tidak ditemukan");
      }
      
      const frameData = JSON.stringify({
        aspectRatio: fullDraft.aspectRatio || "9:16",
        canvasBackground: fullDraft.canvasBackground || "#f7f1ed",
        canvasWidth: fullDraft.canvasWidth || 1080,
        canvasHeight: fullDraft.canvasHeight || 1920,
        elements: fullDraft.elements || []
      });
      
      // Use existing cloud draft if available (update instead of always insert new)
      // This prevents creating duplicate ghost cloud entries on every share click
      const existingCloudId = draft.cloudId || fullDraft.cloudId || null;
      const result = await draftService.saveDraftToCloud({
        title: fullDraft.title || "Shared Frame",
        frameData: frameData,
        previewUrl: fullDraft.preview || null,
        draftId: existingCloudId
      });
      
      if (!result?.draft?.share_id) {
        throw new Error("Gagal mendapatkan share ID");
      }
      
      // Make it public
      await draftService.updateVisibility(result.draft.id, true);
      
      const cloudDraftResult = result.draft;
      const link = `${baseUrl}/take-moment?share=${cloudDraftResult.share_id}`;
      shareLinkCacheRef.current[draft.id] = link;
      
      // Save shareId (and cloudId if new) back to local draft so future shares reuse it
      if (!String(draft.id).startsWith('cloud-') && (!draft.shareId || !draft.cloudId)) {
        try {
          const existingLocal = await draftStorage.getDraftById(draft.id);
          if (existingLocal) {
            await draftStorage.saveDraft({
              ...existingLocal,
              cloudId: cloudDraftResult.id,
              shareId: cloudDraftResult.share_id,
            });
            setDrafts((prev) => prev.map((d) =>
              d.id === draft.id
                ? { ...d, cloudId: cloudDraftResult.id, shareId: cloudDraftResult.share_id }
                : d
            ));
          }
        } catch (_) { /* non-critical */ }
      }
      
      setShareLink(link);
      setShareDraftTitle(fullDraft.title || "Draft");
      setQrDataUrl("");
      generateQR(link).then(setQrDataUrl).catch(() => {});
      setShowShareModal(true);
      setCopied(false);
      setIsGeneratingLink(false);
      
      showToast("success", "✅ Link siap di-share ke teman!");
    } catch (error) {
      console.error("Error generating share link:", error);
      setIsGeneratingLink(false);
      showToast("error", "Gagal membuat link share. Periksa koneksi internet dan coba lagi.");
    }
  };

  const handleCreateGroup = () => {
    if (!user?.email) {
      showToast("info", "Anda belum login, silakan login untuk menggunakan fitur ini");
      return;
    }
    const group = createDraftGroup(user.email);
    const next = loadDraftGroups(user.email);
    setGroups(next);
    setActiveTab({ type: "group", groupId: group.id });
    setAddingToGroupId(null);
    setGroupViewMode("frames");
  };

  const handleToggleDraftInGroup = (groupId, draftId) => {
    if (!user?.email || !groupId || !draftId) return;
    const next = toggleDraftInGroup(user.email, groupId, draftId);
    setGroups(next);
  };

  const handleStartAddFramesToGroup = () => {
    if (!user?.email || !activeGroup?.id) return;
    setAddingToGroupId(activeGroup.id);
    setActiveTab({ type: "all" });
    setGroupViewMode("frames");
  };

  const handleTogglePreferencesView = () => {
    if (activeTab.type !== "group" || !activeGroup?.id) return;
    setGroupViewMode((prev) => (prev === "preferences" ? "frames" : "preferences"));
  };

  const handleUpdateActiveGroupPreferences = (patch) => {
    if (!user?.email || !activeGroup?.id) return;
    const next = updateDraftGroupPreferences(user.email, activeGroup.id, patch);
    setGroups(next);
  };

  const handleLogoFileChange = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Gagal membaca file"));
        reader.readAsDataURL(file);
      });
      handleUpdateActiveGroupPreferences({ logoDataUrl: dataUrl });
    } catch (e) {
      showToast("error", e?.message || "Gagal upload logo");
    }
  };

  const handleShareGroup = async () => {
    if (!activeGroup?.id || !user?.email) return;

    const baseUrl = window.location.origin;
    const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

    // Always read from localStorage — avoids stale React state closure
    const latestGroups = loadDraftGroups(user.email);
    const latestGroup = latestGroups.find((g) => g?.id === activeGroup.id) || null;
    const storedShareId = latestGroup?.preferences?.shareId;

    // If already shared, push latest preferences/frames to DB then show link
    if (storedShareId) {
      setIsGeneratingLink(true);
      try {
        // Build latest sharedFrames from current group drafts
        const groupDrafts = sortedDrafts.filter((d) => groupDraftIdSet.has(d?.id));
        const sharedFrames = [];
        for (const draft of groupDrafts) {
          let fullDraft = draft;
          if (!Array.isArray(fullDraft?.elements)) {
            fullDraft = await draftStorage.getDraftById(draft.id, user?.email);
          }
          if (!fullDraft && draft?._frameData) {
            const parsed = typeof draft._frameData === 'string' ? JSON.parse(draft._frameData) : draft._frameData;
            fullDraft = { ...draft, ...parsed };
          }
          if (!fullDraft && draft?.cloudId) {
            const cloudDraft = await draftService.getDraftById(draft.cloudId);
            if (cloudDraft?.frame_data) {
              const parsed = typeof cloudDraft.frame_data === 'string' ? JSON.parse(cloudDraft.frame_data) : cloudDraft.frame_data;
              fullDraft = {
                title: cloudDraft.title,
                preview: parsed?.thumbnail || parsed?.preview || cloudDraft.preview_url,
                thumbnail: parsed?.thumbnail || parsed?.preview || cloudDraft.preview_url,
                ...parsed,
              };
            }
          }
          if (!fullDraft) continue;

          const frameData = JSON.stringify({
            aspectRatio: fullDraft.aspectRatio || "9:16",
            canvasBackground: fullDraft.canvasBackground || "#f7f1ed",
            canvasWidth: fullDraft.canvasWidth || 1080,
            canvasHeight: fullDraft.canvasHeight || 1920,
            elements: fullDraft.elements || [],
          });

          const result = await draftService.saveDraftToCloud({
            title: fullDraft.title || "Shared Frame",
            frameData,
            previewUrl: fullDraft.thumbnail || fullDraft.preview || null,
            draftId: null,
          });

          const shareId = result?.draft?.share_id;
          if (!shareId) continue;

          sharedFrames.push({
            shareId,
            title: fullDraft.title || "Draft",
            description: fullDraft.description || "",
            thumbnail: fullDraft.thumbnail || fullDraft.preview || null,
          });
        }

        // Refresh the existing shared group without changing its slug
        if (sharedFrames.length === 0) {
          throw new Error("Gagal memuat frame di group. Tambahkan frame terlebih dahulu.");
        }

        const resp = await fetch(`${API_URL}/groups/public-share/${storedShareId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: latestGroup.name || "Group Frames",
            frames: sharedFrames,
            preferences: latestGroup.preferences || null,
          }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err?.message || err?.error || "Gagal memperbarui link group");
        }

        const link = `${baseUrl}/share/${storedShareId}`;
        // Always regenerate QR so it reflects the current link
        const freshQr = await generateQR(link);
        if (freshQr !== (latestGroup?.preferences?.qrDataUrl || "")) {
          handleUpdateActiveGroupPreferences({ qrDataUrl: freshQr });
        }
        setQrDataUrl(freshQr);
        setShareLink(link);
        setShareDraftTitle(latestGroup.name || "Group Frames");
        setShowShareModal(true);
        setCopied(false);
        showToast("success", "✅ Link group diperbarui!");
      } catch (error) {
        console.error("Error syncing group share:", error);
        showToast("error", error?.message || "Gagal memperbarui link group");
      } finally {
        setIsGeneratingLink(false);
      }
      return;
    }

    setIsGeneratingLink(true);
    try {
      const groupDrafts = sortedDrafts.filter((d) => groupDraftIdSet.has(d?.id));
      if (groupDrafts.length === 0) {
        showToast("info", "Pilih minimal 1 frame untuk group ini");
        setIsGeneratingLink(false);
        return;
      }

      // Upload each draft to VPS drafts table (public share) and collect share_ids
      const sharedFrames = [];
      for (const draft of groupDrafts) {
        let fullDraft = draft;
        if (!Array.isArray(fullDraft?.elements)) {
          fullDraft = await draftStorage.getDraftById(draft.id, user?.email);
        }
        if (!fullDraft && draft?._frameData) {
          const parsed = typeof draft._frameData === 'string' ? JSON.parse(draft._frameData) : draft._frameData;
          fullDraft = { ...draft, ...parsed };
        }
        if (!fullDraft && draft?.cloudId) {
          const cloudDraft = await draftService.getDraftById(draft.cloudId);
          if (cloudDraft?.frame_data) {
            const parsed = typeof cloudDraft.frame_data === 'string' ? JSON.parse(cloudDraft.frame_data) : cloudDraft.frame_data;
            fullDraft = {
              title: cloudDraft.title,
              preview: parsed?.thumbnail || parsed?.preview || cloudDraft.preview_url,
              thumbnail: parsed?.thumbnail || parsed?.preview || cloudDraft.preview_url,
              ...parsed,
            };
          }
        }
        if (!fullDraft) continue;

        const frameData = JSON.stringify({
          aspectRatio: fullDraft.aspectRatio || "9:16",
          canvasBackground: fullDraft.canvasBackground || "#f7f1ed",
          canvasWidth: fullDraft.canvasWidth || 1080,
          canvasHeight: fullDraft.canvasHeight || 1920,
          elements: fullDraft.elements || [],
        });

        const result = await draftService.saveDraftToCloud({
          title: fullDraft.title || "Shared Frame",
          frameData,
          previewUrl: fullDraft.thumbnail || fullDraft.preview || null,
          draftId: null,
        });

        const shareId = result?.draft?.share_id;
        if (!shareId) continue;

        sharedFrames.push({
          shareId,
          title: fullDraft.title || "Draft",
          description: fullDraft.description || "",
          thumbnail: fullDraft.thumbnail || fullDraft.preview || null,
        });
      }

      if (sharedFrames.length === 0) {
        throw new Error("Gagal membuat share untuk frame di group");
      }

      // Use custom slug from preferences if set, otherwise auto-generate
      const customSlug = latestGroup?.preferences?.shareSlug || undefined;

      // Create group share on backend
      const response = await fetch(`${API_URL}/groups/public-share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeGroup.name || "Group Frames",
          frames: sharedFrames,
          preferences: activeGroup.preferences || null,
          ...(customSlug ? { shareId: customSlug } : {}),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || err?.error || "Gagal membuat link group");
      }
      const data = await response.json();
      const groupShareId = data?.group?.share_id;
      if (!groupShareId) throw new Error("Gagal mendapatkan group share ID");

      // Persist shareId so subsequent loads just show this link
      // Generate QR once — stored permanently, never regenerated
      const qr = await generateQR(`${baseUrl}/share/${groupShareId}`);
      handleUpdateActiveGroupPreferences({ shareId: groupShareId, shareSlug: groupShareId, qrDataUrl: qr });

      const link = `${baseUrl}/share/${groupShareId}`;
      setQrDataUrl(qr);
      setShareLink(link);
      setShareDraftTitle(activeGroup.name || "Group Frames");
      setShowShareModal(true);
      setCopied(false);
      showToast("success", "✅ Link group siap di-share!");
    } catch (error) {
      console.error("Error generating group share link:", error);
      showToast("error", error?.message || "Gagal membuat link group");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        // Fallback for HTTP or older browsers
        const textArea = document.createElement("textarea");
        textArea.value = shareLink;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      showToast("success", "Link berhasil disalin!");
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      // Final fallback - prompt user to copy manually
      showToast("info", "Tekan lama pada link untuk menyalin");
    }
  };

  // Render draft thumbnail
  const renderDraftThumbnail = (draft) => {
    // Draft dapat menyimpan preview di berbagai field
    const previewImage =
      draft.thumbnail ||
      draft.preview ||
      draft.thumbnailUrl ||
      draft.thumbnail_path ||
      draft.previewImage;
    
    if (previewImage) {
      return (
        <img
          src={previewImage}
          alt={draft.title || "Draft"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            borderRadius: "4px",
          }}
        />
      );
    }
    
    // Fallback placeholder
    return (
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
    );
  };

  // ── size-filter helpers (same logic as Frames.jsx) ──────────────────────
  const _normalizeRatio = (value) => String(value || "").toLowerCase().trim();
  const _getCanvasSize = (frame) => {
    const layout = frame?.layout;
    const canvasSize = frame?.canvas_size || frame?.canvasSize;
    const width = layout?.canvasWidth ?? layout?.canvas_width ?? frame?.canvasWidth ?? frame?.canvas_width ?? canvasSize?.width ?? canvasSize?.w;
    const height = layout?.canvasHeight ?? layout?.canvas_height ?? frame?.canvasHeight ?? frame?.canvas_height ?? canvasSize?.height ?? canvasSize?.h;
    const widthNum = width != null ? Number(width) : null;
    const heightNum = height != null ? Number(height) : null;
    return { width: Number.isFinite(widthNum) ? widthNum : null, height: Number.isFinite(heightNum) ? heightNum : null };
  };
  const _is4RTemplate = (tmpl) => {
    const ratio = _normalizeRatio(tmpl?.layout?.aspectRatio ?? tmpl?.layout?.aspect_ratio ?? tmpl?.aspectRatio ?? tmpl?.aspect_ratio);
    if (["photostrip", "1200:1800", "2:3", "4:6", "4r"].includes(ratio)) return true;
    if (ratio.includes(":")) {
      const [w, h] = ratio.split(":").map(Number);
      if (w === 1200 && h === 1800) return true;
    }
    const { width, height } = _getCanvasSize(tmpl);
    return width === 1200 && height === 1800;
  };
  const _is2RTemplate = (tmpl) => {
    const ratio = _normalizeRatio(tmpl?.layout?.aspectRatio ?? tmpl?.layout?.aspect_ratio ?? tmpl?.aspectRatio ?? tmpl?.aspect_ratio);
    if (["2r", "1:3", "600:1800"].includes(ratio)) return true;
    const { width, height } = _getCanvasSize(tmpl);
    return width === 600 && height === 1800;
  };
  // ── size-filter state ─────────────────────────────────────────────────────
  const [tmplSizeFilter, setTmplSizeFilter] = useState("story");

  const groupedTemplates = useMemo(() => {
    const show4R = tmplSizeFilter === "4r";
    const show2R = tmplSizeFilter === "2r";
    const filtered = (templates || []).filter((tmpl) => {
      const is4R = _is4RTemplate(tmpl);
      const is2R = _is2RTemplate(tmpl);
      if (show4R) return is4R && !is2R;
      if (show2R) return is2R;
      return !is4R && !is2R; // story / default
    });
    const groups = {};
    filtered.forEach((tmpl) => {
      const cat = tmpl.category || "Lainnya";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tmpl);
    });
    return groups;
  }, [templates, tmplSizeFilter]);

  function DraftCard({ draft, index, mode }) {
    const description = draft?.description || "";
    const maxLength = 50;
    const shouldTruncate = description.length > maxLength;
    const isExpanded = expandedDescriptions.has(draft?.id);
    const displayDescription = isExpanded
      ? description
      : description.slice(0, maxLength);

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
          cursor: "pointer",
          transition:
            "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
          position: "relative",
        }}
        onClick={() => {
          if (mode === "select") {
            handleToggleDraftInGroup(addingToGroupId, draft.id);
            return;
          }
          if (mode === "delete") {
            toggleDeleteSelection(draft.id);
            return;
          }
          handleOpenDraft(draft);
        }}
        onMouseEnter={(e) => {
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
        {mode === "all" && (
          <button
            type="button"
            onClick={(e) => handleShareDraft(e, draft)}
            onTouchEnd={(e) => handleShareDraft(e, draft)}
            title="Bagikan frame"
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              background: "linear-gradient(to right, #e0b7a9, #d4a99a)",
              color: "white",
              border: "none",
              width: "32px",
              height: "28px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
              boxShadow: "0 10px 22px rgba(224, 183, 169, 0.25)",
            }}
          >
            <Share2 size={14} />
          </button>
        )}

        {mode === "delete" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "6px",
              border: deleteSelectedIds.has(draft.id)
                ? "2.5px solid #e57373"
                : "2.5px solid transparent",
              background: deleteSelectedIds.has(draft.id)
                ? "rgba(229,115,115,0.10)"
                : "transparent",
              pointerEvents: "none",
              zIndex: 10,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "8px",
                left: "8px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: deleteSelectedIds.has(draft.id) ? "#e57373" : "rgba(255,255,255,0.9)",
                border: deleteSelectedIds.has(draft.id) ? "none" : "1.5px solid rgba(229,115,115,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {deleteSelectedIds.has(draft.id) && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
        )}

        {mode === "select" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleDraftInGroup(addingToGroupId, draft.id);
            }}
            title={
              selectionGroupDraftIdSet.has(draft.id)
                ? "Remove from group"
                : "Add to group"
            }
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              background: selectionGroupDraftIdSet.has(draft.id)
                ? "linear-gradient(to right, #e0b7a9, #d4a99a)"
                : "rgba(255, 255, 255, 0.95)",
              color: selectionGroupDraftIdSet.has(draft.id) ? "white" : "#1e293b",
              border: selectionGroupDraftIdSet.has(draft.id)
                ? "none"
                : "1px solid rgba(224, 183, 169, 0.6)",
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
              boxShadow: "0 10px 22px rgba(224, 183, 169, 0.18)",
            }}
          >
            {selectionGroupDraftIdSet.has(draft.id) ? <Check size={16} /> : "+"}
          </button>
        )}

        {/* Image Container - 9:16 aspect ratio */}
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
          {renderDraftThumbnail(draft)}
        </div>

        {/* Name */}
        <div
          style={{
            padding: "8px 8px 4px 8px",
            textAlign: "center",
            fontSize:
              draft?.title && String(draft.title).length > 25 ? "10px" : "12px",
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
          {draft?.title?.trim() || `Draft - ${index + 1}`}
        </div>

        {/* Description */}
        {description && (
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
              {shouldTruncate && !isExpanded && "..."}
            </span>
            {shouldTruncate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedDescriptions((prev) => {
                    const next = new Set(prev);
                    if (isExpanded) next.delete(draft.id);
                    else next.add(draft.id);
                    return next;
                  });
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
                {isExpanded ? "Sembunyikan" : "Selengkapnya"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="anchor create-hub-wrap">
      <div className="container">
        {/* PROMO BANNER */}
        <div style={{
          background: 'linear-gradient(135deg, #c89585 0%, #b07060 100%)',
          borderRadius: '16px',
          padding: '18px 24px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: '800', color: '#fff' }}>🎨 Akses Semua Frames & Templates Premium</span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>Jadi member dan akses penuh ke ratusan frame dan template eksklusif — mulai Rp 5.000.</span>
          </div>
          <button
            onClick={() => navigate('/pricing')}
            style={{
              background: '#fff',
              color: '#c89585',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 22px',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              flexShrink: 0,
              marginLeft: 'auto',
              alignSelf: 'flex-end',
            }}
          >
            Lihat Paket →
          </button>
        </div>
        {/* Create your frame + Templates — side by side on desktop, stacked on mobile */}
        <div className="create-hub-section create-hub-top-row">
          {/* Create New Frame Card */}
          <div style={{ flexShrink: 0 }}>
            <h2 className="create-hub-title">Create your frame</h2>
            <div className="create-hub-create-card" onClick={handleCreateNew}>
              <div className="create-hub-create-icon">
                <Plus size={48} strokeWidth={1} />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="create-hub-top-row-divider" />

          {/* Drafts Section — horizontal scroll like templates */}
          <div className="create-hub-templates-section" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
              <h2 className="create-hub-title" style={{ margin: 0 }}>Drafts</h2>
              {sortedDrafts.length > 0 && (
                <span style={{ fontSize: "11px", fontWeight: "600", background: "#fdf0eb", color: "#c07055", border: "1px solid #e0b7a9", borderRadius: "20px", padding: "2px 8px" }}>
                  {sortedDrafts.length}
                </span>
              )}
              {isDeletingMode ? (
                <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                  <button type="button" className="create-hub-group-add-btn" onClick={exitDeleteMode}>Batal</button>
                  <button
                    type="button"
                    className="create-hub-group-share-btn"
                    style={{
                      background: deleteSelectedIds.size > 0 ? "linear-gradient(to right, #e57373, #ef5350)" : "linear-gradient(to right, #ccc, #bbb)",
                      cursor: deleteSelectedIds.size > 0 ? "pointer" : "not-allowed",
                    }}
                    disabled={deleteSelectedIds.size === 0}
                    onClick={handleDeleteFrame}
                  >
                    <Trash2 size={13} />
                    <span>Hapus ({deleteSelectedIds.size})</span>
                  </button>
                </div>
              ) : (
                sortedDrafts.length > 0 && (
                  <button
                    type="button"
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#e57373", padding: "4px 8px", borderRadius: "6px", display: "flex", alignItems: "center" }}
                    onClick={enterDeleteMode}
                    title="Hapus frame"
                  >
                    <Trash2 size={15} />
                  </button>
                )
              )}
            </div>

            {loading ? (
              <p style={{ color: "#9ca3af", fontSize: "13px" }}>Memuat draft...</p>
            ) : sortedDrafts.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", color: "#c4a39b", fontSize: "13px", background: "#fdf7f4", borderRadius: "12px", border: "1px dashed #e0b7a9" }}>
                Belum ada draft. Klik + untuk mulai membuat!
              </div>
            ) : (() => {
              const { accessibleDrafts: activeDrafts, lockedDrafts } = splitDraftsByMembershipAccess(sortedDrafts, hasAccess);
              const allScrollDrafts = [
                ...activeDrafts,
                ...lockedDrafts.map((d) => ({ ...d, _isLockedMembership: true })),
              ];
              return (
                <div
                  className="create-hub-templates-scroll"
                  ref={(el) => {
                    if (!el || el._scrollListenersAttached) return;
                    el._scrollListenersAttached = true;
                    let startX = 0;
                    let dragged = false;
                    el.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; dragged = false; }, { passive: true });
                    el.addEventListener("touchmove", (e) => { if (Math.abs(e.touches[0].clientX - startX) > 8) dragged = true; }, { passive: true });
                    el._wasDragged = () => dragged;
                  }}
                >
                  {allScrollDrafts.map((draft, index) => {
                    const isLocked = !!draft._isLockedMembership;
                    const CARD_W = 100;
                    const CARD_H = Math.round(CARD_W * (16 / 9));
                    return (
                      <div
                        key={draft.id || index}
                        onClick={() => {
                          const strip = document.querySelector(".create-hub-templates-scroll");
                          if (strip?._wasDragged?.()) return;
                          if (isDeletingMode) { toggleDeleteSelection(draft.id); return; }
                          if (isLocked) { navigate("/pricing?reason=draft-limit"); return; }
                          handleOpenDraft(draft);
                        }}
                        className="create-hub-template-card"
                        style={{
                          flexShrink: 0,
                          width: `${CARD_W}px`,
                          cursor: "pointer",
                          borderRadius: "10px",
                          border: `1.5px solid ${isLocked ? "#c4b5d0" : "#ecdeda"}`,
                          background: "#fff",
                          overflow: "hidden",
                          transition: "transform 0.15s, box-shadow 0.15s",
                          boxShadow: "0 1px 4px rgba(74,48,43,0.07)",
                          opacity: isLocked ? 0.85 : 1,
                          position: "relative",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(74,48,43,0.14)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 4px rgba(74,48,43,0.07)"; }}
                      >
                        <div style={{ width: `${CARD_W}px`, height: `${CARD_H}px`, position: "relative", background: "#f9fafb", overflow: "hidden" }}>
                          {/* Lock badge for membership drafts */}
                          {isLocked && (
                            <div style={{
                              position: "absolute", top: "4px", right: "4px",
                              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                              color: "white", padding: "2px 5px", borderRadius: "4px",
                              fontSize: "8px", fontWeight: "600", zIndex: 10,
                              lineHeight: 1.3,
                            }}>
                              🔒
                            </div>
                          )}
                          {/* Share button — visible when not deleting and not locked */}
                          {!isDeletingMode && !isLocked && (
                            <button
                              type="button"
                              onClick={(e) => handleShareDraft(e, draft)}
                              onTouchEnd={(e) => handleShareDraft(e, draft)}
                              title="Bagikan frame"
                              style={{
                                position: "absolute", top: "5px", right: "5px",
                                background: "linear-gradient(to right, #e0b7a9, #d4a99a)",
                                color: "white", border: "none",
                                width: "24px", height: "22px",
                                borderRadius: "6px",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", zIndex: 10,
                                boxShadow: "0 2px 8px rgba(224,183,169,0.4)",
                              }}
                            >
                              <Share2 size={11} />
                            </button>
                          )}
                          {/* Delete mode checkbox overlay */}
                          {isDeletingMode && (
                            <div style={{
                              position: "absolute", inset: 0, borderRadius: "8px",
                              border: deleteSelectedIds.has(draft.id) ? "2px solid #e57373" : "2px solid transparent",
                              background: deleteSelectedIds.has(draft.id) ? "rgba(229,115,115,0.10)" : "transparent",
                              pointerEvents: "none", zIndex: 10, transition: "border-color 0.15s, background 0.15s",
                            }}>
                              <div style={{
                                position: "absolute", top: "5px", left: "5px",
                                width: "16px", height: "16px", borderRadius: "50%",
                                background: deleteSelectedIds.has(draft.id) ? "#e57373" : "rgba(255,255,255,0.9)",
                                border: deleteSelectedIds.has(draft.id) ? "none" : "1.5px solid rgba(229,115,115,0.6)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {deleteSelectedIds.has(draft.id) && (
                                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}
                          {renderDraftThumbnail(draft)}
                        </div>
                        <div style={{ padding: "6px 6px 8px" }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#4a302b", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {draft.title?.trim() || `Draft ${index + 1}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Designer Frame Templates — categorized by category */}
        <div className="create-hub-section">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
            <h2 className="create-hub-title" style={{ margin: 0 }}>✨ Frame by Designer</h2>
            <span style={{ fontSize: "12px", color: "#9b7b73" }}>Frame bisa dikustomisasi sesuai keinginanmu</span>
            {templates.length > 0 && (
              <span style={{ fontSize: "11px", fontWeight: "600", background: "#fdf0eb", color: "#c07055", border: "1px solid #e0b7a9", borderRadius: "20px", padding: "2px 8px" }}>
                {templates.length}
              </span>
            )}
          </div>

          {/* Size filter tabs — same style as Frames page */}
          {!templatesLoading && templates.length > 0 && (
            <div style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
              <div style={{ display: "inline-flex", gap: "6px", padding: "6px", borderRadius: "999px", background: "rgba(224, 183, 169, 0.22)", border: "1px solid rgba(224, 183, 169, 0.35)" }}>
                <button
                  type="button"
                  aria-pressed={tmplSizeFilter === "story"}
                  onClick={() => setTmplSizeFilter("story")}
                  style={{ border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: "999px", fontWeight: 700, fontSize: "12px", background: tmplSizeFilter === "story" ? "linear-gradient(to right, #e0b7a9, #c89585)" : "transparent", color: tmplSizeFilter === "story" ? "white" : "#4a302b" }}
                >
                  Story Instagram
                </button>
                <button
                  type="button"
                  aria-pressed={tmplSizeFilter === "4r"}
                  onClick={() => setTmplSizeFilter("4r")}
                  style={{ border: tmplSizeFilter === "4r" ? "none" : "1px solid rgba(200, 149, 133, 0.55)", cursor: "pointer", padding: "8px 14px", borderRadius: "999px", fontWeight: 700, fontSize: "12px", background: tmplSizeFilter === "4r" ? "linear-gradient(to right, #e0b7a9, #c89585)" : "transparent", color: tmplSizeFilter === "4r" ? "white" : "#4a302b" }}
                >
                  4R
                </button>
                <button
                  type="button"
                  aria-pressed={tmplSizeFilter === "2r"}
                  onClick={() => setTmplSizeFilter("2r")}
                  style={{ border: tmplSizeFilter === "2r" ? "none" : "1px solid rgba(200, 149, 133, 0.55)", cursor: "pointer", padding: "8px 14px", borderRadius: "999px", fontWeight: 700, fontSize: "12px", background: tmplSizeFilter === "2r" ? "linear-gradient(to right, #e0b7a9, #c89585)" : "transparent", color: tmplSizeFilter === "2r" ? "white" : "#4a302b", position: "relative" }}
                >
                  2R
                  <span style={{ position: "absolute", top: "-8px", right: "-6px", padding: "2px 6px", borderRadius: "999px", fontSize: "10px", fontWeight: 800, background: "linear-gradient(to right, #e0b7a9, #c89585)", color: "white", lineHeight: 1.2 }}>New</span>
                </button>
              </div>
            </div>
          )}

          {/* Headline copy below size tabs */}
          {!templatesLoading && templates.length > 0 && (
            <p style={{ textAlign: "center", fontSize: "clamp(14px, 3.5vw, 17px)", fontWeight: "bold", color: "#1e293b", marginBottom: "28px", lineHeight: 1.25 }}>
              {tmplSizeFilter === "story"
                ? "Kenangan yang pas untuk Story Instagram."
                : tmplSizeFilter === "4r"
                ? "Kenangan dalam ukuran foto klasik."
                : "Kenangan kecil yang selalu dekat."}
            </p>
          )}

          {templatesLoading ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af", fontSize: "13px" }}>
              Memuat frame...
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: "48px 32px", background: "linear-gradient(135deg, #fdf0eb 0%, #fae6de 100%)", border: "2px dashed #e0b7a9", borderRadius: "16px", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎨</div>
              <h3 style={{ fontSize: "20px", fontWeight: "bold", color: "#4a302b", marginBottom: "10px" }}>Belum ada frame dari designer</h3>
              <p style={{ color: "#7c5a53", lineHeight: 1.6, margin: 0 }}>Jadilah yang pertama! Desain frame kamu dan bagikan ke semua pengguna Fremio.</p>
            </div>
          ) : Object.keys(groupedTemplates).length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#c4a39b", fontSize: "13px", background: "#fdf7f4", borderRadius: "12px", border: "1px dashed #e0b7a9" }}>
              Belum ada frame ukuran ini dari designer.
            </div>
          ) : (
            Object.entries(groupedTemplates).map(([category, catTemplates]) => (
              <div key={category} style={{ marginBottom: "40px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: "bold", color: "#1e293b", marginBottom: "16px" }}>
                  {category} ({catTemplates.length})
                </h3>
                <div className="frames-grid">
                  {catTemplates.map((tmpl) => {
                    const cw = tmpl.canvas_width || 1080;
                    const ch = tmpl.canvas_height || 1920;
                    const layoutAspRatio = `${cw}:${ch}`;
                                const isTmplPremium = !!(tmpl.is_premium);
                    const accessibleSet = new Set((accessibleFrameIds || []).map((id) => String(id)));
                    const isTmplLocked =
                      isTmplPremium &&
                      !(hasAccess && ((accessibleFrameIds || []).length === 0 || accessibleSet.has(String(tmpl.id))));
                    return (
                      <div
                        key={tmpl.id}
                        className="frame-card"
                        style={{
                          display: "flex", flexDirection: "column", overflow: "hidden",
                          borderRadius: "8px", backgroundColor: "white",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12)", border: "2px solid transparent",
                          cursor: "pointer", transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                          position: "relative", opacity: isTmplLocked ? 0.85 : 1,
                        }}
                        onClick={() => {
                          trackFrameView(tmpl.id, tmpl.name).catch(() => {});
                          if (isTmplLocked) {
                            navigate(`/pricing?reason=locked&frameId=${encodeURIComponent(String(tmpl.id))}`);
                            return;
                          }
                          const _API = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
                          fetch(`${_API}/frames/${tmpl.id}/view`, { method: "POST" }).catch(() => {});
                          navigate("/create/editor", {
                            state: {
                              prefillFromBaseFrame: true,
                              baseFrame: {
                                ...tmpl,
                                canvasWidth: tmpl.canvas_width,
                                canvasHeight: tmpl.canvas_height,
                                canvasBackground: tmpl.canvas_background,
                              },
                            },
                          });
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.15)"; e.currentTarget.style.borderColor = "#e0a899"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)"; e.currentTarget.style.borderColor = "transparent"; }}
                      >
                        {isTmplLocked && (
                          <div style={{
                            position: "absolute", top: "8px", right: "8px",
                            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            color: "white", padding: "4px 8px", borderRadius: "4px",
                            fontSize: "10px", fontWeight: "600", zIndex: 10,
                            display: "flex", alignItems: "center", gap: "4px",
                          }}>
                            🔒 Member Only
                          </div>
                        )}
                        <div style={{
                          position: "relative", overflow: "hidden",
                          backgroundColor: "#f9fafb", aspectRatio: "9/16",
                          width: "100%", boxSizing: "border-box",
                        }}>
                          {tmpl.image_path ? (
                            <>
                              <img
                                src={tmpl.image_path}
                                alt={tmpl.name}
                                style={{ width: "100%", height: "100%", objectFit: "contain", position: "relative", zIndex: 2 }}
                              />
                            </>
                          ) : tmpl.layout ? (() => {
                            const layout = typeof tmpl.layout === "string" ? JSON.parse(tmpl.layout) : tmpl.layout;
                            const layoutElements = Array.isArray(layout?.elements) ? layout.elements : [];
                            const layoutBg = layout?.backgroundColor || tmpl.canvas_background || "#ffffff";
                            return (
                              <CanvasPreview
                                elements={layoutElements}
                                selectedElementId={null}
                                canvasBackground={layoutBg}
                                aspectRatio={layoutAspRatio}
                                previewConstraints={{ maxWidth: 200, maxHeight: 356 }}
                                onSelect={() => {}}
                                onUpdate={() => {}}
                                onBringToFront={() => {}}
                                onRemove={() => {}}
                                onDuplicate={() => {}}
                                onToggleLock={() => {}}
                                onResizeUpload={() => {}}
                              />
                            );
                          })() : (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#c4a39b", fontSize: "11px" }}>
                              No preview
                            </div>
                          )}
                        </div>
                        <div style={{
                          padding: "8px 8px 4px 8px", textAlign: "center",
                          fontSize: tmpl.name && String(tmpl.name).length > 25 ? "10px" : "12px",
                          fontWeight: 600, color: "#1e293b", lineHeight: "1.3",
                          wordWrap: "break-word", overflowWrap: "break-word", hyphens: "auto",
                          minHeight: "32px", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {tmpl.name}
                        </div>
                        <div style={{ padding: "0 8px 8px 8px", textAlign: "center", fontSize: "10px", color: "#9b7b73" }}>
                          by Designer ✨
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fullscreen Loading Overlay for Share */}
      {isGeneratingLink && (
        <div className="create-hub-fullscreen-loading">
          <div className="create-hub-fullscreen-loading-content">
            <div className="create-hub-fullscreen-spinner"></div>
            <p>Menyiapkan link share...</p>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="create-hub-modal-overlay" onClick={() => { setShowShareModal(false); setQrDataUrl(""); }}>
          <div className="create-hub-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="create-hub-modal-title">Bagikan</h3>
            <p className="create-hub-modal-desc">
              Orang lain dapat menggunakan frame ini dengan link berikut:
            </p>

            {/* QR Code — only for group shares, generated once, never changes */}
            {qrDataUrl && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", margin: "12px 0" }}>
                <img src={qrDataUrl} alt="QR Code" style={{ width: 180, height: 180, borderRadius: "12px", border: "1px solid #e5e7eb" }} />
                <a
                  href={qrDataUrl}
                  download="qrcode-fremio.png"
                  style={{ fontSize: "12px", color: "#c4887a", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
                >
                  <Download size={13} /> Unduh QR Code
                </a>
              </div>
            )}
            
            <div className="create-hub-share-link-container">
              <input 
                type="text" 
                className="create-hub-share-input" 
                value={shareLink} 
                readOnly 
              />
              <button
                className={copied ? "create-hub-copy-btn copied" : "create-hub-copy-btn"}
                onClick={handleCopyLink}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "Tersalin!" : "Salin"}
              </button>
            </div>

            <button
              className="create-hub-modal-close"
              onClick={() => setShowShareModal(false)}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Confirmation dialog for delete frame (batch) / delete group */}
      {confirmDialog && (
        <div
          className="create-hub-modal-overlay"
          onClick={() => setConfirmDialog(null)}
          style={{ zIndex: 300 }}
        >
          <div className="create-hub-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "360px" }}>
            <h3 className="create-hub-modal-title" style={{ color: "#e57373" }}>
              {confirmDialog.type === "frame-batch"
                ? `Hapus ${confirmDialog.ids.length} Frame?`
                : "Hapus Group?"}
            </h3>
            <p className="create-hub-modal-desc">
              {confirmDialog.type === "frame-batch"
                ? `${confirmDialog.ids.length} frame akan dihapus permanen dan tidak bisa dikembalikan.`
                : `Group "${confirmDialog.title}" akan dihapus. Frame di dalamnya tetap ada di All Frames.`}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                className="create-hub-modal-close"
                style={{ margin: 0, flex: 1 }}
                onClick={() => setConfirmDialog(null)}
              >
                Batal
              </button>
              <button
                className="create-hub-group-share-btn"
                style={{ background: "linear-gradient(to right, #e57373, #ef5350)", flex: 1 }}
                onClick={() =>
                  confirmDialog.type === "frame-batch"
                    ? confirmDeleteFrame(confirmDialog.ids)
                    : confirmDeleteGroup(confirmDialog.id)
                }
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
