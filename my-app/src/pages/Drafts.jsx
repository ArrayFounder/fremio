import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import draftStorage from "../utils/draftStorage.js";
import userStorage from "../utils/userStorage.js";
import "../styles/drafts.css";
import "../styles/profile.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";

// Normalize a VPS draft row (from GET /api/drafts) to local draft shape
function normalizeVpsDraft(d) {
  return {
    id: `vps-${d.id}`,
    cloudId: d.id,
    shareId: d.share_id,
    title: d.title || "Draft",
    preview: d.preview_url || null,
    canvasWidth:  d.canvas_width  || 1080,
    canvasHeight: d.canvas_height || 1920,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    _isVps: true,
  };
}

export default function Drafts() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  // Inline confirm state — replaces window.confirm (mobile-safe)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const isMountedRef = useRef(true);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  // Get user info for avatar
  const fullName =
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    (user?.email ? user.email.split("@")[0] : "User");

  const initials =
    (fullName || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  // Get profile photo from localStorage (UID first, email fallback)
  const profilePhoto =
    localStorage.getItem(`profilePhoto_${user?.uid}`) ||
    localStorage.getItem(`profilePhoto_${user?.email}`);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reloadDrafts = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setErrorMessage("");

    try {
      // PRIMARY: load from VPS (cloud) for cross-device sync.
      // Token alone is sufficient — server decodes userId from JWT.
      // Do NOT gate on user?.email (auth context may still be loading on mobile).
      const token = localStorage.getItem("fremio_token");
      if (token) {
        const res = await fetch(`${API_URL}/drafts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const vpsDrafts = (data.drafts || []).map(normalizeVpsDraft);
          if (isMountedRef.current) setDrafts(vpsDrafts);
          return;
        }
        // If 401/403, token is invalid — fall through to IndexedDB
      }
      // FALLBACK: local IndexedDB (no token or API unavailable)
      const loaded = await draftStorage.loadDrafts();
      if (isMountedRef.current) setDrafts(Array.isArray(loaded) ? loaded : []);
    } catch (error) {
      console.error("⚠️ Failed to load drafts", error);
      try {
        const loaded = await draftStorage.loadDrafts();
        if (isMountedRef.current) setDrafts(Array.isArray(loaded) ? loaded : []);
      } catch {
        if (isMountedRef.current) {
          setErrorMessage("Gagal memuat draft. Coba lagi nanti.");
          setDrafts([]);
        }
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadDrafts();
  }, [reloadDrafts]);

  const sortedDrafts = useMemo(() => {
    const sorted = [...drafts].sort((a, b) => {
      const left = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const right = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return right - left;
    });
    // Deduplicate by title — keep only the most recent per title
    const seen = new Set();
    return sorted.filter((d) => {
      const key = (d.title || "Draft").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [drafts]);

  const handleUseDraft = async (draft) => {
    if (!draft || openingId) return;
    setErrorMessage("");
    setOpeningId(draft.id);

    try {
      if (draft._isVps && draft.cloudId) {
        // Fetch full VPS draft (with frame_data) and save to IndexedDB so Create.jsx can find it
        const token = localStorage.getItem("fremio_token");
        if (token) {
          const res = await fetch(`${API_URL}/drafts/by-id/${draft.cloudId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const vps = data.draft;
            let fd = {};
            try { fd = JSON.parse(vps.frame_data || "{}"); } catch { /**/ }
            // Save to IndexedDB with explicit userId = user.email
            await draftStorage.saveDraft({
              id: draft.id,
              cloudId: vps.id,
              shareId: vps.share_id,
              title: vps.title || "Draft",
              elements: fd.elements || [],
              canvasWidth:  fd.canvasWidth  || 1080,
              canvasHeight: fd.canvasHeight || 1920,
              preview: vps.preview_url || null,
              userId: user.email,  // explicit — prevents "guest" userId bug
              createdAt: vps.created_at,
              updatedAt: vps.updated_at,
            });
          }
        }
      }

      userStorage.setItem("activeDraftId", draft.id);
      userStorage.removeItem("activeDraftSignature");
      navigate("/create/editor", { state: { draftId: draft.id } });
    } catch (err) {
      console.error("❌ Failed to open draft", err);
      if (isMountedRef.current) setErrorMessage("Gagal membuka draft. Coba lagi.");
    } finally {
      if (isMountedRef.current) setOpeningId(null);
    }
  };

  // Show inline confirmation (replaces window.confirm for mobile compatibility)  
  const handleDeleteRequest = (draftId) => {
    setConfirmDeleteId(draftId);
  };

  const handleDeleteCancel = () => {
    setConfirmDeleteId(null);
  };

  const handleDeleteConfirm = async (draftId) => {
    if (!draftId) return;
    const draft = drafts.find((d) => d.id === draftId);
    setConfirmDeleteId(null);
    if (isMountedRef.current) setDeletingId(draftId);
    try {
      // PRIMARY: delete from VPS
      const token = localStorage.getItem("fremio_token");
      if (draft?.cloudId && token) {
        await fetch(`${API_URL}/drafts/${draft.cloudId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      // ALSO clean up local IndexedDB (best-effort)
      await draftStorage.deleteDraft(draftId).catch(() => {});
      // Remove from UI immediately
      if (isMountedRef.current) setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch (error) {
      console.error("❌ Failed to delete draft", error);
      if (isMountedRef.current) setErrorMessage("Draft tidak bisa dihapus. Coba lagi.");
      // Re-fetch to show correct state
      await reloadDrafts();
    } finally {
      if (isMountedRef.current) setDeletingId(null);
    }
  };

  const renderDraftRow = (draft) => {
    const frameTitle = draft.title?.trim() || "Draft Frame";

    // Determine aspect ratio
    let ratioWidth = 9;
    let ratioHeight = 16;

    if (draft.aspectRatio && typeof draft.aspectRatio === "string") {
      const [ratioW, ratioH] = draft.aspectRatio.split(":").map(Number);
      if (
        Number.isFinite(ratioW) &&
        ratioW > 0 &&
        Number.isFinite(ratioH) &&
        ratioH > 0
      ) {
        ratioWidth = ratioW;
        ratioHeight = ratioH;
      }
    } else if (draft.canvasWidth && draft.canvasHeight) {
      const width = Number(draft.canvasWidth);
      const height = Number(draft.canvasHeight);
      if (
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0
      ) {
        ratioWidth = width;
        ratioHeight = height;
      }
    }

    const numericRatio = ratioWidth / ratioHeight;
    let displayRatio = "9:16";
    if (Math.abs(numericRatio - 9 / 16) < 0.01) {
      displayRatio = "9:16";
    } else if (Math.abs(numericRatio - 4 / 5) < 0.01) {
      displayRatio = "4:5";
    } else if (Math.abs(numericRatio - 2 / 3) < 0.01) {
      displayRatio = "2:3";
    } else {
      displayRatio = `${ratioWidth}:${ratioHeight}`;
    }

    // Format date
    const updatedDate = draft.updatedAt || draft.createdAt;
    const formattedDate = updatedDate
      ? new Date(updatedDate).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "-";

    // Thumbnail size for row display
    const THUMB_HEIGHT = 80;
    const thumbWidth = Math.round(THUMB_HEIGHT * (ratioWidth / ratioHeight));

    return (
      <div
        key={draft.id}
        className="profile-row"
        style={{ alignItems: "center" }}
      >
        <div
          className="label"
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
        >
          {/* Thumbnail */}
          <div
            style={{
              width: `${thumbWidth}px`,
              height: `${THUMB_HEIGHT}px`,
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              flexShrink: 0,
              position: "relative",
            }}
          >
            {draft.preview ? (
              <img
                src={draft.preview}
                alt={frameTitle}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                loading="lazy"
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f3f4f6",
                  fontSize: "10px",
                  color: "#9ca3af",
                  fontWeight: 600,
                }}
              >
                No Preview
              </div>
            )}
            {/* Ratio badge */}
            <div
              style={{
                position: "absolute",
                bottom: "4px",
                right: "4px",
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: 600,
              }}
            >
              {displayRatio}
            </div>
          </div>
          {/* Info */}
          <div>
            <div
              style={{ fontWeight: 700, color: "#222", marginBottom: "4px" }}
            >
              {frameTitle}
            </div>
            <div style={{ fontSize: "13px", color: "#999" }}>
              Updated: {formattedDate}
            </div>
          </div>
        </div>
        <div
          className="value"
          style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}
        >
          {confirmDeleteId === draft.id ? (
            // Inline confirm — no window.confirm, works on all mobile browsers
            <>
              <span style={{ fontSize: "13px", color: "#dc2626", fontWeight: 600 }}>
                Hapus draft ini?
              </span>
              <button
                type="button"
                onClick={() => handleDeleteConfirm(draft.id)}
                style={{
                  padding: "8px 16px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ya, Hapus
              </button>
              <button
                type="button"
                onClick={handleDeleteCancel}
                style={{
                  padding: "8px 16px",
                  background: "#fff",
                  color: "#555",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleUseDraft(draft)}
                disabled={openingId === draft.id}
                style={{
                  padding: "8px 16px",
                  background: "linear-gradient(to right, #e0b7a9, #c89585)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: openingId === draft.id ? "not-allowed" : "pointer",
                  opacity: openingId === draft.id ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                {openingId === draft.id ? "Membuka..." : "Gunakan"}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRequest(draft.id)}
                disabled={deletingId === draft.id}
                style={{
                  padding: "8px 16px",
                  background: "#fff",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: deletingId === draft.id ? "not-allowed" : "pointer",
                  opacity: deletingId === draft.id ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                {deletingId === draft.id ? "Menghapus..." : "Hapus"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="profile-page">
      <div className="profile-shell container">
        {/* Header matches Profile & Settings */}
        <div className="profile-header">
          <div
            className="profile-avatar"
            aria-hidden
            style={{
              background: profilePhoto ? `url(${profilePhoto})` : "#d9d9d9",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!profilePhoto && <span>{initials}</span>}
          </div>
          <h1 className="profile-title">My Drafts</h1>
        </div>

        <div className="profile-body">
          {/* Sidebar navigation */}
          <aside className="profile-sidebar" aria-label="Profile navigation">
            <nav>
              <Link className="nav-item" to="/profile">
                My Profile
              </Link>
              <Link className="nav-item" to="/settings">
                Settings
              </Link>
              <Link className="nav-item active" to="/drafts">
                Drafts
              </Link>
            </nav>
            <button className="nav-logout" onClick={handleLogout}>
              Logout
            </button>
          </aside>

          {/* Content */}
          <main className="profile-content">
            <h2 className="section-title">My Drafts</h2>

            <div
              style={{
                marginBottom: "20px",
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <Link
                to="/create/editor"
                style={{
                  padding: "10px 20px",
                  background: "linear-gradient(to right, #e0b7a9, #c89585)",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Buat Draft Baru
              </Link>
              <button
                type="button"
                onClick={reloadDrafts}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  background: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                {loading ? "Memuat..." : "Refresh"}
              </button>
            </div>

            {errorMessage ? (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  color: "#dc2626",
                  fontSize: "14px",
                  marginBottom: "16px",
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            {loading ? (
              <div
                style={{
                  marginTop: "80px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  color: "#666",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "3px solid #e5e7eb",
                    borderTop: "3px solid #a2665a",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span style={{ fontSize: "14px" }}>Memuat draft...</span>
              </div>
            ) : sortedDrafts.length === 0 ? (
              <div
                style={{
                  marginTop: "80px",
                  padding: "60px 24px",
                  background: "linear-gradient(to bottom, #fef8f5, #fff)",
                  border: "2px dashed #e0b7a9",
                  borderRadius: "12px",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    marginBottom: "12px",
                  }}
                >
                  Belum ada draft tersimpan.
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    marginBottom: "24px",
                    maxWidth: "400px",
                    margin: "0 auto 24px",
                  }}
                >
                  Buat frame pertama kamu di halaman Create, lalu simpan untuk
                  digunakan kembali.
                </p>
                <Link
                  to="/create/editor"
                  style={{
                    display: "inline-block",
                    padding: "12px 24px",
                    background: "linear-gradient(to right, #e0b7a9, #c89585)",
                    color: "#fff",
                    textDecoration: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "14px",
                    transition: "all 0.2s",
                  }}
                >
                  Mulai Buat Frame
                </Link>
              </div>
            ) : (
              <div className="profile-details">
                {sortedDrafts.map((draft) => renderDraftRow(draft))}
              </div>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
