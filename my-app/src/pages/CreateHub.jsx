import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Share2, Check, Copy, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import logoSalem from "../assets/logo-salem.png";
import burgerBarIcon from "../assets/burger-bar.png";
import draftStorage from "../utils/draftStorage.js";
import draftService from "../services/draftService.js";
import userStorage from "../utils/userStorage.js";
import { generateShareLink } from "../services/frameShareService.js";
import {
  createDraftGroup,
  deleteDraftGroup,
  loadDraftGroups,
  saveDraftGroups,
  toggleDraftInGroup,
  updateDraftGroupPreferences,
} from "../utils/draftGroupStorage.js";
import "./CreateHub.css";

export default function CreateHub() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const [cloudDrafts, setCloudDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareDraftTitle, setShareDraftTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { type: 'frame-batch'|'group', ids?, id?, title? }
  // Batch-delete mode
  const [isDeletingMode, setIsDeletingMode] = useState(false);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState(new Set());
  const isMountedRef = useRef(true);
  const [expandedDescriptions, setExpandedDescriptions] = useState(() => new Set());

  const [groups, setGroups] = useState([]);
  const [activeTab, setActiveTab] = useState({ type: "all" });
  const [addingToGroupId, setAddingToGroupId] = useState(null);
  const [groupViewMode, setGroupViewMode] = useState("frames");

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
    } catch (err) {
      console.warn("⚠️ [CreateHub] Failed to clean up storage:", err);
    }
  }, [user?.email]);

  const reloadDrafts = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    // Wait for user authentication before loading drafts
    if (!user?.email) {
      console.log("⏳ [CreateHub] Waiting for user auth before loading drafts...");
      setLoading(false);
      return;
    }
    
    console.log("📂 [CreateHub] Loading drafts for user:", user.email);

    // Show cached summaries immediately to avoid long spinner
    try {
      const cached = draftStorage.getCachedDraftSummaries
        ? draftStorage.getCachedDraftSummaries(user.email)
        : [];
      if (Array.isArray(cached) && cached.length > 0 && isMountedRef.current) {
        setDrafts(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }

    try {
      // Load local drafts fast (summaries) so the list renders quickly
      const localDrafts = draftStorage.loadDraftSummaries
        ? await draftStorage.loadDraftSummaries()
        : await draftStorage.loadDrafts();
      if (isMountedRef.current) {
        setDrafts(Array.isArray(localDrafts) ? localDrafts : []);
        console.log(`✅ [CreateHub] Loaded ${localDrafts?.length || 0} local drafts`);
      }

      // Load from cloud in the background (do not block initial render)
      if (user) {
        void (async () => {
          try {
            const cloudData = await draftService.getCloudDrafts();
            if (isMountedRef.current) {
              setCloudDrafts(Array.isArray(cloudData) ? cloudData : []);
            }
          } catch (cloudError) {
            console.log("☁️ Cloud drafts not available:", cloudError.message);
          }
        })();
      }
    } catch (error) {
      console.error("⚠️ Failed to load drafts", error);
      if (isMountedRef.current) {
        setDrafts([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    reloadDrafts();
  }, [reloadDrafts]);

  const sortedDrafts = useMemo(() => {
    // Build set of cloud IDs already represented by a local draft
    const localCloudIds = new Set(
      drafts.map((d) => (d.cloudId != null ? String(d.cloudId) : null)).filter(Boolean)
    );

    // Cloud drafts that have no local counterpart (created on another device)
    const cloudOnlyDrafts = cloudDrafts
      .filter((cd) => !localCloudIds.has(String(cd.id)))
      .map((cd) => ({
        id: `cloud-${cd.id}`,
        cloudId: cd.id,
        shareId: cd.share_id,
        title: cd.title || "Untitled",
        thumbnail: cd.preview_url || null,
        thumbnailUrl: cd.preview_url || null,
        preview: cd.preview_url || null,
        createdAt: cd.created_at,
        updatedAt: cd.updated_at,
        isCloudOnly: true,
        _frameData: cd.frame_data,
      }));

    return [...drafts, ...cloudOnlyDrafts].sort((a, b) => {
      const left = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const right = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return right - left;
    });
  }, [drafts, cloudDrafts]);

  const activeGroup = useMemo(() => {
    if (activeTab?.type !== "group") return null;
    return groups.find((g) => g?.id === activeTab?.groupId) || null;
  }, [activeTab, groups]);

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
        } else {
          await draftStorage.deleteDraft(id);
        }
      }));
      const idSet = new Set(ids);
      setDrafts((prev) => prev.filter((d) => !idSet.has(d.id)));
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
  }, [user, showToast, exitDeleteMode]);

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

    // Cloud-only draft (no local copy): download and cache locally first
    if (draft.isCloudOnly && draft._frameData) {
      try {
        const parsed = JSON.parse(draft._frameData);
        const localDraft = await draftStorage.saveDraft({
          title: draft.title,
          elements: parsed.elements || [],
          aspectRatio: parsed.aspectRatio,
          canvasBackground: parsed.canvasBackground,
          canvasWidth: parsed.canvasWidth,
          canvasHeight: parsed.canvasHeight,
          preview: draft.preview || null,
          thumbnail: draft.thumbnail || null,
          cloudId: draft.cloudId,
          shareId: draft.shareId,
        });
        // Refresh local list so the cloud entry is replaced by the new local entry
        setDrafts((prev) => {
          const without = prev.filter((d) => d.id !== localDraft.id);
          return [...without, localDraft];
        });
        userStorage.setItem("activeDraftId", localDraft.id);
        userStorage.removeItem("activeDraftSignature");
        navigate("/create/editor", { state: { draftId: localDraft.id } });
        return;
      } catch (err) {
        console.error("Failed to cache cloud draft locally:", err);
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
    if (!draft?.id) return;
    
    setIsGeneratingLink(true);
    
    try {

      // Ensure we have the full draft (summaries may not include elements)
      let fullDraft = draft;
      if (!Array.isArray(fullDraft?.elements)) {
        fullDraft = await draftStorage.getDraftById(draft.id, user?.email);
      }
      if (!fullDraft) {
        throw new Error("Draft tidak ditemukan");
      }
      
      // Step 1: Upload draft to VPS PostgreSQL
      // CRITICAL: Include ALL data needed for EditPhoto to render properly
      // This includes canvasWidth/Height for coordinate conversion and ALL elements
      console.log("📤 [SHARE] Draft data being shared:", {
        title: fullDraft.title,
        elementsCount: fullDraft.elements?.length,
        elementTypes: fullDraft.elements?.map(el => el.type),
        hasBackground: fullDraft.elements?.some(el => el.type === 'background-photo'),
        hasOverlay: fullDraft.elements?.some(el => el.type === 'upload'),
        canvasWidth: fullDraft.canvasWidth,
        canvasHeight: fullDraft.canvasHeight,
      });
      
      const frameData = JSON.stringify({
        aspectRatio: fullDraft.aspectRatio || "9:16",
        canvasBackground: fullDraft.canvasBackground || "#f7f1ed",
        canvasWidth: fullDraft.canvasWidth || 1080,
        canvasHeight: fullDraft.canvasHeight || 1920,
        elements: fullDraft.elements || []
      });
      
      const result = await draftService.saveDraftToCloud({
        title: fullDraft.title || "Shared Frame",
        frameData: frameData,
        previewUrl: fullDraft.preview || null,
        draftId: null // Always create new for sharing
      });
      
      if (!result?.draft?.share_id) {
        throw new Error("Gagal mendapatkan share ID");
      }
      
      // Step 2: Make it public
      await draftService.updateVisibility(result.draft.id, true);
      
      // Step 3: Generate share link with share_id
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/take-moment?share=${result.draft.share_id}`;
      
      setShareLink(link);
      setShareDraftTitle(fullDraft.title || "Draft");
      setShowShareModal(true);
      setCopied(false);
      setIsGeneratingLink(false);
      
      showToast("success", "✅ Link siap di-share ke teman!");
    } catch (error) {
      console.error("Error generating share link:", error);
      
      // NOTE: The old ?d= offline fallback is intentionally removed.
      // Those links strip background/upload images and appear blank for other users.
      // Always require a successful VPS upload for a valid share link.
      setIsGeneratingLink(false);
      showToast("error", "Gagal membuat link share. Periksa koneksi internet dan coba lagi.");
    }
  };

  const handleCreateGroup = () => {
    if (!user?.email) {
      showToast("error", "Login diperlukan");
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
    if (!activeGroup?.id) return;

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

      // Create group share on backend (public)
      const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
      const response = await fetch(`${API_URL}/groups/public-share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeGroup.name || "Group Frames",
          frames: sharedFrames,
          preferences: activeGroup.preferences || null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || "Gagal membuat link group");
      }
      const data = await response.json();
      const groupShareId = data?.group?.share_id;
      if (!groupShareId) throw new Error("Gagal mendapatkan group share ID");

      const baseUrl = window.location.origin;
      const link = `${baseUrl}/g/${groupShareId}`;
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
        {/* Create New Frame Card */}
        <div className="create-hub-section">
          <h2 className="create-hub-title">Create your frame</h2>
          
          <div className="create-hub-create-card" onClick={handleCreateNew}>
            <div className="create-hub-create-icon">
              <Plus size={48} strokeWidth={1} />
            </div>
          </div>
        </div>

        {/* Drafts Section */}
        <div className="create-hub-section">
          <h2 className="create-hub-title">Drafts</h2>

          {/* Tabs: All Frames + Groups */}
          {/* Delete-mode action bar */}
          {isDeletingMode && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "#64748b", flex: 1 }}>
                {deleteSelectedIds.size === 0
                  ? "Pilih frame yang ingin dihapus"
                  : `${deleteSelectedIds.size} frame dipilih`}
              </span>
              <button
                type="button"
                className="create-hub-group-add-btn"
                onClick={exitDeleteMode}
              >
                Batal
              </button>
              <button
                type="button"
                className="create-hub-group-share-btn"
                style={{
                  background: deleteSelectedIds.size > 0
                    ? "linear-gradient(to right, #e57373, #ef5350)"
                    : "linear-gradient(to right, #ccc, #bbb)",
                  cursor: deleteSelectedIds.size > 0 ? "pointer" : "not-allowed",
                }}
                disabled={deleteSelectedIds.size === 0}
                onClick={handleDeleteFrame}
              >
                <Trash2 size={15} />
                <span>Hapus ({deleteSelectedIds.size})</span>
              </button>
            </div>
          )}

          <div className="create-hub-tabs">
            <button
              type="button"
              className={
                activeTab.type === "all"
                  ? "create-hub-tab create-hub-tab--active"
                  : "create-hub-tab"
              }
              onClick={() => {
                setActiveTab({ type: "all" });
                setAddingToGroupId(null);
                setGroupViewMode("frames");
                if (isDeletingMode) exitDeleteMode();
              }}
            >
              All Frames
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={
                  activeTab.type === "group" && activeTab.groupId === g.id
                    ? "create-hub-tab create-hub-tab--active"
                    : "create-hub-tab"
                }
                onClick={() => {
                  setActiveTab({ type: "group", groupId: g.id });
                  setAddingToGroupId(null);
                  setGroupViewMode("frames");
                }}
              >
                {g.name || "Group"}
              </button>
            ))}
            <button
              type="button"
              className="create-hub-tab create-hub-tab--add"
              onClick={handleCreateGroup}
              title="Tambah group"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            {!isDeletingMode && (
              <button
                type="button"
                className="create-hub-tab"
                style={{ color: "#e57373", borderColor: "rgba(229,115,115,0.45)", marginLeft: "auto" }}
                onClick={enterDeleteMode}
                title="Hapus frame"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          {activeTab.type === "group" && activeGroup && (
            <div className="create-hub-group-share">
              <h3 className="create-hub-group-share-title">
                {groupViewMode === "preferences" ? "Preferences" : "Share Group Link"}
              </h3>
              <div className="create-hub-group-share-actions">
                <button
                  type="button"
                  className={
                    groupViewMode === "preferences"
                      ? "create-hub-group-add-btn create-hub-group-add-btn--active"
                      : "create-hub-group-add-btn"
                  }
                  onClick={handleTogglePreferencesView}
                >
                  <span>Preferences</span>
                </button>

                {groupViewMode !== "preferences" && (
                  <>
                    <button
                      type="button"
                      className="create-hub-group-share-btn"
                      onClick={handleShareGroup}
                    >
                      <Share2 size={16} />
                      <span>Share</span>
                    </button>
                    <button
                      type="button"
                      className="create-hub-group-add-btn"
                      onClick={handleStartAddFramesToGroup}
                    >
                      <Plus size={16} />
                      <span>Add Frame</span>
                    </button>
                    <button
                      type="button"
                      className="create-hub-group-add-btn"
                      style={{ color: "#e57373", borderColor: "rgba(229,115,115,0.45)" }}
                      onClick={() => handleDeleteGroup(activeGroup.id, activeGroup.name || "Group ini")}
                    >
                      <Trash2 size={16} />
                      <span>Hapus Group</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab.type === "group" && activeGroup && (
            <></>
          )}
          
          {loading ? (
            <div className="create-hub-loading">
              <div className="create-hub-spinner"></div>
              <span>Memuat draft...</span>
            </div>
          ) : sortedDrafts.length === 0 ? (
            <div className="create-hub-empty">
              <p>Belum ada draft. Buat frame baru untuk memulai!</p>
            </div>
          ) : (() => {
            const isSelectingForGroup = activeTab.type === "all" && !!addingToGroupId;
            const visibleDrafts =
              activeTab.type === "group"
                ? sortedDrafts.filter((d) => groupDraftIdSet.has(d?.id))
                : sortedDrafts;

            if (activeTab.type === "group" && visibleDrafts.length === 0) {
              return (
                <div className="create-hub-empty">
                  <p>Belum ada frame di group ini.</p>
                </div>
              );
            }

            if (
              activeTab.type === "group" &&
              activeGroup &&
              groupViewMode === "preferences"
            ) {
              const pref =
                activeGroup?.preferences && typeof activeGroup.preferences === "object"
                  ? activeGroup.preferences
                  : {};
              const headerColor = pref?.headerColor || "#ffffff";
              const backgroundColor = pref?.backgroundColor || "#ffffff";
              const logoDataUrl = pref?.logoDataUrl || null;
              const title1Text = pref?.title1Text || "";
              const title2Text = pref?.title2Text || "";
              const text = pref?.text || "";
              const pageTitle = title1Text || activeGroup.name || "Group Frames";

              return (
                <div className="create-hub-pref-layout">
                  <div className="create-hub-pref-preview">
                    <div className="create-hub-pref-phone">
                      <div
                        className="create-hub-pref-phone-screen"
                        style={{ background: backgroundColor }}
                      >
                        <div
                          className="create-hub-pref-phone-topbar"
                          style={{ background: headerColor }}
                        >
                          <img
                            className="create-hub-pref-phone-topbar-logo"
                            src={logoDataUrl || logoSalem}
                            alt="Logo"
                          />
                          <button type="button" className="create-hub-pref-phone-topbar-menu">
                            <img src={burgerBarIcon} alt="Menu" />
                          </button>
                        </div>

                        <div className="create-hub-pref-phone-body">
                          <div className="create-hub-pref-phone-page-title create-hub-pref-phone-page-title--top">
                            {pageTitle}
                          </div>

                          <div className="create-hub-pref-phone-grid">
                            {visibleDrafts.slice(0, 12).map((draft, idx) => (
                              <div key={draft?.id || idx} className="create-hub-pref-phone-card">
                                <div className="create-hub-pref-phone-thumb">
                                  {renderDraftThumbnail(draft)}
                                </div>
                                <div className="create-hub-pref-phone-name">
                                  {draft?.title?.trim() || `Draft - ${idx + 1}`}
                                </div>
                                {draft?.description ? (
                                  <div className="create-hub-pref-phone-desc">
                                    {String(draft.description).slice(0, 40)}
                                    {String(draft.description).length > 40 ? "... " : " "}
                                    <span className="create-hub-pref-phone-more">
                                      Selengkapnya
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>

                          {title2Text ? (
                            <div className="create-hub-pref-phone-page-title create-hub-pref-phone-page-title--below">
                              {title2Text}
                            </div>
                          ) : null}
                          {text ? (
                            <div className="create-hub-pref-phone-page-text create-hub-pref-phone-page-text--below">
                              {text}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="create-hub-pref-form">
                    <div className="create-hub-group-preferences">
                      <div className="create-hub-group-pref-row">
                        <div className="create-hub-group-pref-label">Add Logo</div>
                        <div className="create-hub-group-pref-control">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleLogoFileChange(e.target.files?.[0])}
                          />
                          {activeGroup?.preferences?.logoDataUrl ? (
                            <button
                              type="button"
                              className="create-hub-group-pref-clear"
                              onClick={() =>
                                handleUpdateActiveGroupPreferences({ logoDataUrl: null })
                              }
                            >
                              Hapus
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="create-hub-group-pref-row">
                        <div className="create-hub-group-pref-label">Header Color</div>
                        <div className="create-hub-group-pref-control">
                          <input
                            type="color"
                            value={activeGroup?.preferences?.headerColor || "#ffffff"}
                            onChange={(e) =>
                              handleUpdateActiveGroupPreferences({
                                headerColor: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="create-hub-group-pref-row">
                        <div className="create-hub-group-pref-label">
                          Background Color
                        </div>
                        <div className="create-hub-group-pref-control">
                          <input
                            type="color"
                            value={activeGroup?.preferences?.backgroundColor || "#ffffff"}
                            onChange={(e) =>
                              handleUpdateActiveGroupPreferences({
                                backgroundColor: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="create-hub-group-pref-row">
                        <div className="create-hub-group-pref-label">Judul 1 teks</div>
                        <div className="create-hub-group-pref-control">
                          <input
                            type="text"
                            value={activeGroup?.preferences?.title1Text || ""}
                            onChange={(e) =>
                              handleUpdateActiveGroupPreferences({
                                title1Text: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="create-hub-group-pref-row">
                        <div className="create-hub-group-pref-label">Judul 2 teks</div>
                        <div className="create-hub-group-pref-control">
                          <input
                            type="text"
                            value={activeGroup?.preferences?.title2Text || ""}
                            onChange={(e) =>
                              handleUpdateActiveGroupPreferences({
                                title2Text: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="create-hub-group-pref-row">
                        <div className="create-hub-group-pref-label">Teks</div>
                        <div className="create-hub-group-pref-control">
                          <input
                            type="text"
                            value={activeGroup?.preferences?.text || ""}
                            onChange={(e) =>
                              handleUpdateActiveGroupPreferences({ text: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            if (activeTab.type === "group" && activeGroup) {
              return (
                <div className="frames-grid">
                  {visibleDrafts.map((draft, index) => (
                    <DraftCard
                      key={draft.id || index}
                      draft={draft}
                      index={index}
                      mode={isDeletingMode ? "delete" : "all"}
                    />
                  ))}
                </div>
              );
            }

            return (
              <div className="frames-grid">
                {visibleDrafts.map((draft, index) => (
                  <DraftCard
                    key={draft.id || index}
                    draft={draft}
                    index={index}
                    mode={isDeletingMode ? "delete" : isSelectingForGroup ? "select" : "all"}
                  />
                ))}
              </div>
            );
          })()}
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
        <div className="create-hub-modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="create-hub-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="create-hub-modal-title">Bagikan</h3>
            <p className="create-hub-modal-desc">
              Orang lain dapat menggunakan frame ini dengan link berikut:
            </p>
            
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
