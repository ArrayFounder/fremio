import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  Users,
  Send,
  X,
  ExternalLink,
} from "lucide-react";
import CanvasPreview from "../../components/creator/CanvasPreview.jsx";

// Build element list from raw submission frame_data for read-only preview
function buildPreviewElements(rawFrameData) {
  let fd = rawFrameData;
  if (typeof fd === "string") {
    try { fd = JSON.parse(fd); } catch { fd = {}; }
  }
  if (!fd || typeof fd !== "object") return { elements: [], aspectRatio: "9:16", canvasBackground: "#ffffff" };

  const cw = fd.canvasWidth || 1080;
  const ch = fd.canvasHeight || 1920;
  const elements = [];

  // Background image
  if (fd.backgroundImage) {
    elements.push({
      id: "bg-0", type: "background-photo",
      x: 0, y: 0, width: cw, height: ch, zIndex: -4000,
      data: { image: fd.backgroundImage, objectFit: "cover", label: "Background" },
    });
  }

  // Photo slots (stored as normalized 0..1)
  if (Array.isArray(fd.slots)) {
    fd.slots.forEach((slot, idx) => {
      if (!slot) return;
      elements.push({
        id: slot.id || `photo_${idx}`,
        type: "photo",
        x: (slot.left || 0) * cw, y: (slot.top || 0) * ch,
        width: (slot.width || 0) * cw, height: (slot.height || 0) * ch,
        rotation: slot.rotation || 0, zIndex: 0,
        data: { photoIndex: slot.photoIndex ?? idx, borderRadius: slot.borderRadius || 0, label: "Foto" },
      });
    });
  }

  // Overlay elements (absolute pixels, already in editor coordinate space)
  if (Array.isArray(fd.elements)) {
    fd.elements.forEach((el) => {
      if (!el || el.type === "photo") return;
      const zIndex = el.type === "background-photo" ? (el.zIndex ?? -4000) : Math.max(el.zIndex || 100, 100);
      elements.push({ ...el, zIndex });
    });
  }

  return {
    elements,
    aspectRatio: fd.aspectRatio || fd.canvasAspectRatio || "9:16",
    canvasBackground: fd.canvasBackground || "#ffffff",
  };
}

const API_URL = import.meta.env.VITE_API_URL || "/api";
const getToken = () => localStorage.getItem("fremio_token");

const STATUS_CONFIG = {
  pending: { label: "Menunggu", icon: Clock, color: "#f59e0b", bg: "#fef3c7" },
  approved: { label: "Diterima", icon: CheckCircle, color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "Ditolak", icon: XCircle, color: "#ef4444", bg: "#fee2e2" },
};

const BASE_CATEGORIES = [
  "Christmas Fremio Series",
  "Holiday Fremio Series",
  "Year-End Recap Fremio Series",
  "Fremio Series",
  "Self-love",
  "Cute Characters",
  "Romance",
  "Aesthetic Scrapbook & Retro",
  "Wedding",
  "Birthday",
  "Graduation",
  "Event",
  "Music",
  "Custom",
];

function loadAllCategories() {
  try {
    const saved = localStorage.getItem("fremio_custom_categories");
    const custom = saved ? JSON.parse(saved) : [];
    // Merge without duplicates
    return [...BASE_CATEGORIES, ...custom.filter((c) => !BASE_CATEGORIES.includes(c))];
  } catch {
    return BASE_CATEGORIES;
  }
}

export default function AdminDesignerSubmissions() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [designers, setDesigners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("submissions");

  // Review modal state
  const [reviewModal, setReviewModal] = useState(null); // submission object
  const [reviewAction, setReviewAction] = useState("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewCategory, setReviewCategory] = useState("Fremio Series");
  const [reviewIsTemplate, setReviewIsTemplate] = useState(false);
  const [reviewSource, setReviewSource] = useState("designer");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [allCategories, setAllCategories] = useState(loadAllCategories);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Preview modal
  const [previewSub, setPreviewSub] = useState(null);
  const [previewSubDetail, setPreviewSubDetail] = useState(null);
  const [previewSubLoading, setPreviewSubLoading] = useState(false);

  // Takedown / restore / update
  const [takedownLoading, setTakedownLoading] = useState(null); // submission id
  const [updateFrameLoading, setUpdateFrameLoading] = useState(null); // submission id

  // Fetch full submission detail (includes frame_data) when preview modal opens
  useEffect(() => {
    if (!previewSub) { setPreviewSubDetail(null); return; }
    setPreviewSubLoading(true);
    fetch(`${API_URL}/designer/admin/submissions/${previewSub.id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => setPreviewSubDetail(d.submission || null))
      .catch(() => setPreviewSubDetail(null))
      .finally(() => setPreviewSubLoading(false));
  }, [previewSub]);

  // Sync custom categories in real-time when UploadFrame updates localStorage
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "fremio_custom_categories") {
        setAllCategories(loadAllCategories());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subRes, desRes] = await Promise.all([
        fetch(
          `${API_URL}/designer/admin/submissions${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        ),
        fetch(`${API_URL}/designer/admin/designers`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
      ]);
      const subData = await subRes.json();
      const desData = await desRes.json();
      if (subData.success) setSubmissions(subData.submissions || []);
      if (desData.success) setDesigners(desData.designers || []);
    } catch (e) {
      console.error("Failed to load admin designer data", e);
    } finally {
      setLoading(false);
    }
  };

  const loadFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch(`${API_URL}/designer/admin/feedback`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setFeedback(data.feedback || []);
    } catch (e) {
      console.error("Failed to load feedback", e);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const markFeedbackRead = async (id) => {
    await fetch(`${API_URL}/designer/admin/feedback/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setFeedback((prev) => prev.map((f) => f.id === id ? { ...f, is_read: true } : f));
  };

  const openReviewModal = (submission) => {
    setReviewModal(submission);
    setReviewAction("approved");
    setReviewNotes("");
    setReviewCategory("Fremio Series");
    setReviewIsTemplate(false);
    setReviewSource("designer");
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    setReviewLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/designer/admin/submissions/${reviewModal.id}/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            action: reviewAction,
            adminNotes: reviewNotes,
            category: reviewCategory,
            source: reviewSource,
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setReviewModal(null);
        loadData();
      } else {
        alert(data.message || "Gagal memproses review");
      }
    } catch (e) {
      alert("Terjadi kesalahan");
    } finally {
      setReviewLoading(false);
    }
  };

  const repairFrames = async () => {
    if (!window.confirm("Perbaiki semua frame designer yang bermasalah? Proses ini akan memperbarui data slot foto dari submission aslinya.")) return;
    setRepairLoading(true);
    setRepairResult(null);
    try {
      const res = await fetch(`${API_URL}/designer/admin/repair-frames`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setRepairResult(data);
      if (data.repaired?.length > 0) loadData();
    } catch (e) {
      setRepairResult({ success: false, message: e.message });
    } finally {
      setRepairLoading(false);
    }
  };

  const handleTakedown = async (sub) => {
    if (!window.confirm(`Takedown frame "${sub.frame_name}"? Frame akan disembunyikan dari publik tapi data tetap tersimpan.`)) return;
    setTakedownLoading(sub.id);
    try {
      const res = await fetch(`${API_URL}/designer/admin/submissions/${sub.id}/takedown`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions((prev) => prev.map((s) => s.id === sub.id ? { ...s, frame_is_active: false } : s));
      } else {
        alert(data.message || "Gagal melakukan takedown");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setTakedownLoading(null);
    }
  };

  const handleRestore = async (sub) => {
    if (!window.confirm(`Pulihkan frame "${sub.frame_name}"? Frame akan ditampilkan kembali ke publik.`)) return;
    setTakedownLoading(sub.id);
    try {
      const res = await fetch(`${API_URL}/designer/admin/submissions/${sub.id}/restore`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions((prev) => prev.map((s) => s.id === sub.id ? { ...s, frame_is_active: true } : s));
      } else {
        alert(data.message || "Gagal memulihkan frame");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setTakedownLoading(null);
    }
  };

  const handleUpdateFrame = async (sub) => {
    if (!window.confirm(`Update frame "${sub.frame_name}"? Data layout dan slot akan diperbarui dari submission ini. View/download count tidak akan direset.`)) return;
    setUpdateFrameLoading(sub.id);
    try {
      const res = await fetch(`${API_URL}/designer/admin/submissions/${sub.id}/update-frame`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert(data.message || "Gagal memperbarui frame");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setUpdateFrameLoading(null);
    }
  };

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === "pending").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.pageTitle}>Designer Submissions</h1>
          <p style={S.pageSubtitle}>Review dan kelola frame yang disubmit designer</p>
        </div>
        <button
          onClick={repairFrames}
          disabled={repairLoading}
          style={{ padding: "8px 16px", background: repairLoading ? "#9ca3af" : "#f59e0b", color: "white",
                   border: "none", borderRadius: "8px", cursor: repairLoading ? "not-allowed" : "pointer",
                   fontSize: "13px", fontWeight: 600 }}
        >
          {repairLoading ? "Memperbaiki..." : "🔧 Perbaiki Slot Frame"}
        </button>
      </div>
      {repairResult && (
        <div style={{ margin: "0 0 16px", padding: "12px 16px", borderRadius: "8px",
                      background: repairResult.success ? "#d1fae5" : "#fee2e2",
                      fontSize: "13px", color: repairResult.success ? "#065f46" : "#991b1b" }}>
          {repairResult.message}
          {repairResult.repaired?.length > 0 && (
            <span> — {repairResult.repaired.map(f => f.name).join(", ")}</span>
          )}
          {repairResult.failed?.length > 0 && (
            <span style={{ color: "#b45309" }}> | Gagal: {repairResult.failed.map(f => `${f.name}: ${f.reason}`).join(", ")}</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={S.statsGrid}>
        {[
          { label: "Total", value: stats.total, color: "#6366f1" },
          { label: "Menunggu", value: stats.pending, color: "#f59e0b" },
          { label: "Diterima", value: stats.approved, color: "#10b981" },
          { label: "Ditolak", value: stats.rejected, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} style={S.statCard}>
            <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        <button
          style={{ ...S.tab, ...(activeTab === "submissions" ? S.tabActive : {}) }}
          onClick={() => setActiveTab("submissions")}
        >
          Submissions
        </button>
        <button
          style={{ ...S.tab, ...(activeTab === "designers" ? S.tabActive : {}) }}
          onClick={() => setActiveTab("designers")}
        >
          <Users size={14} style={{ marginRight: "6px" }} />
          Designers ({designers.length})
        </button>
        <button
          style={{ ...S.tab, ...(activeTab === "feedback" ? S.tabActive : {}) }}
          onClick={() => { setActiveTab("feedback"); loadFeedback(); }}
        >
          💬 Masukan Designer
          {feedback.filter((f) => !f.is_read).length > 0 && (
            <span style={{ marginLeft: "6px", background: "#ef4444", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: "700" }}>
              {feedback.filter((f) => !f.is_read).length}
            </span>
          )}
        </button>
      </div>

      {/* Submissions Tab */}
      {activeTab === "submissions" && (
        <>
          {/* Filter */}
          <div style={S.filterRow}>
            {["all", "pending", "approved", "rejected"].map((f) => (
              <button
                key={f}
                style={{
                  ...S.filterBtn,
                  ...(filterStatus === f ? S.filterBtnActive : {}),
                }}
                onClick={() => setFilterStatus(f)}
              >
                {f === "all"
                  ? "Semua"
                  : f === "pending"
                  ? "Menunggu"
                  : f === "approved"
                  ? "Diterima"
                  : "Ditolak"}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={S.loading}>Memuat data...</div>
          ) : submissions.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎨</div>
              <div>Belum ada submission</div>
            </div>
          ) : (
            <div style={S.subList}>
              {submissions.map((sub) => {
                const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <div key={sub.id} style={S.subCard}>
                    {/* Thumbnail */}
                    <div style={S.thumb}>
                      {sub.thumbnail_data_url ? (
                        <img
                          src={sub.thumbnail_data_url}
                          alt={sub.frame_name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                        />
                      ) : (
                        <div style={S.thumbPlaceholder}>🖼️</div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={S.subInfo}>
                      <div style={S.subName}>{sub.frame_name}</div>
                      <div style={S.subDesigner}>
                        👤 {sub.designer_name || sub.designer_email}
                        <span style={{ color: "#9ca3af", marginLeft: "6px" }}>
                          ({sub.designer_email})
                        </span>
                      </div>
                      {sub.frame_description && (
                        <div style={S.subDesc}>{sub.frame_description}</div>
                      )}
                      <div style={S.subMeta}>
                        Disubmit:{" "}
                        {new Date(sub.submitted_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {sub.admin_notes && (
                        <div style={S.adminNote}>
                          📝 {sub.admin_notes}
                        </div>
                      )}
                      {sub.published_frame_name && (
                        <div style={sub.frame_is_active === false ? { ...S.publishedNote, background: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" } : S.publishedNote}>
                          {sub.frame_is_active === false ? "🚫 Ditakedown" : "✅ Published"}: {sub.published_frame_name}
                        </div>
                      )}
                    </div>

                    {/* Status + Actions */}
                    <div style={S.actions}>
                      <div
                        style={{
                          ...S.statusBadge,
                          color: cfg.color,
                          background: cfg.bg,
                        }}
                      >
                        <Icon size={13} />
                        {cfg.label}
                      </div>

                      {sub.thumbnail_data_url && (
                        <button
                          style={S.btnSecondary}
                          onClick={() => setPreviewSub(sub)}
                        >
                          <Eye size={14} />
                          Preview
                        </button>
                      )}

                      {sub.status === "pending" && (
                        <button
                          style={S.btnReview}
                          onClick={() => openReviewModal(sub)}
                        >
                          Review
                        </button>
                      )}

                      {sub.status === "approved" && sub.published_frame_id && (
                        <button
                          disabled={updateFrameLoading === sub.id}
                          style={{ padding: "6px 12px", background: updateFrameLoading === sub.id ? "#9ca3af" : "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: updateFrameLoading === sub.id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                          onClick={() => handleUpdateFrame(sub)}
                        >
                          {updateFrameLoading === sub.id ? "Updating..." : "🔄 Update"}
                        </button>
                      )}

                      {sub.status === "approved" && sub.published_frame_id && sub.frame_is_active !== false && (
                        <button
                          disabled={takedownLoading === sub.id}
                          style={{ padding: "6px 12px", background: takedownLoading === sub.id ? "#9ca3af" : "#fef3c7", color: "#92400e", border: "1px solid #f59e0b", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: takedownLoading === sub.id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                          onClick={() => handleTakedown(sub)}
                        >
                          🚫 Takedown
                        </button>
                      )}

                      {sub.status === "approved" && sub.published_frame_id && sub.frame_is_active === false && (
                        <button
                          disabled={takedownLoading === sub.id}
                          style={{ padding: "6px 12px", background: takedownLoading === sub.id ? "#9ca3af" : "#d1fae5", color: "#065f46", border: "1px solid #10b981", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: takedownLoading === sub.id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                          onClick={() => handleRestore(sub)}
                        >
                          ✅ Pulihkan
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Designers Tab */}
      {activeTab === "designers" && (
        <div>
          {designers.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>👥</div>
              <div>Belum ada designer terdaftar</div>
            </div>
          ) : (
            <div style={S.designerTable}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Designer", "Email", "Total", "Pending", "Approved", "Rejected", "Bergabung", "Sertifikat"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {designers.map((d) => (
                    <tr
                      key={d.id}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td style={S.td}>{d.display_name || "—"}</td>
                      <td style={S.td}>{d.email}</td>
                      <td style={{ ...S.td, fontWeight: "700" }}>{d.total_submissions}</td>
                      <td style={{ ...S.td, color: "#f59e0b" }}>{d.pending}</td>
                      <td style={{ ...S.td, color: "#10b981" }}>{d.approved}</td>
                      <td style={{ ...S.td, color: "#ef4444" }}>{d.rejected}</td>
                      <td style={{ ...S.td, color: "#9ca3af" }}>
                        {new Date(d.created_at).toLocaleDateString("id-ID")}
                      </td>
                      <td style={S.td}>
                        {d.certificate_name ? (
                          <div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b", borderRadius: "8px", padding: "3px 8px", fontSize: "12px", fontWeight: "700" }}>
                              🎖️ {d.certificate_name}
                            </span>
                            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "3px" }}>
                              {new Date(d.certificate_claimed_at).toLocaleDateString("id-ID")}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#d1d5db", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Feedback Tab */}
      {activeTab === "feedback" && (
        <div>
          {feedbackLoading ? (
            <div style={S.empty}>Memuat masukan...</div>
          ) : feedback.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>💬</div>
              <div>Belum ada masukan dari designer</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {feedback.map((f) => (
                <div
                  key={f.id}
                  style={{
                    background: f.is_read ? "#fff" : "#f0f4ff",
                    border: `1px solid ${f.is_read ? "#e5e7eb" : "#c7d2fe"}`,
                    borderLeft: `4px solid ${f.is_read ? "#e5e7eb" : "#6366f1"}`,
                    borderRadius: "10px",
                    padding: "16px 20px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "700", fontSize: "14px", color: "#1a1a2e" }}>
                          {f.designer_name || f.designer_email || `Designer #${f.designer_id}`}
                        </span>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>{f.designer_email}</span>
                        <span style={{
                          padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "600",
                          background: { editor: "#dbeafe", bug: "#fee2e2", suggestion: "#d1fae5", general: "#f3f4f6" }[f.type] || "#f3f4f6",
                          color: { editor: "#1d4ed8", bug: "#b91c1c", suggestion: "#065f46", general: "#374151" }[f.type] || "#374151",
                        }}>
                          {{ editor: "🛠 Editor", bug: "🐛 Bug", suggestion: "💡 Saran", general: "💬 Umum" }[f.type] || f.type}
                        </span>
                        {!f.is_read && <span style={{ background: "#6366f1", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: "700" }}>Baru</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: "14px", color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{f.message}</p>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "8px" }}>
                        {new Date(f.submitted_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {!f.is_read && (
                      <button
                        onClick={() => markFeedbackRead(f.id)}
                        style={{ padding: "5px 12px", background: "#f0f0ff", color: "#6366f1", border: "1px solid #c7d2fe", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Tandai dibaca
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewSub && (
        <div style={S.modalOverlay} onClick={() => setPreviewSub(null)}>
          <div
            style={S.previewModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={S.modalHeader}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>
                Preview: {previewSub.frame_name}
              </h3>
              <button
                onClick={() => setPreviewSub(null)}
                style={S.closeBtn}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "16px", overflow: "hidden", minHeight: "100px", alignItems: "center" }}>
              {previewSubLoading ? (
                <div style={{ padding: "40px 0", color: "#9ca3af", fontSize: "13px" }}>Memuat preview...</div>
              ) : previewSubDetail ? (() => {
                const { elements, aspectRatio, canvasBackground } = buildPreviewElements(previewSubDetail.frame_data);
                return (
                  <div style={{ pointerEvents: "none", userSelect: "none" }}>
                    <CanvasPreview
                      elements={elements}
                      selectedElementId={null}
                      canvasBackground={canvasBackground}
                      aspectRatio={aspectRatio}
                      previewConstraints={{ maxWidth: 260, maxHeight: 480 }}
                      onSelect={() => {}}
                      onUpdate={() => {}}
                      onBringToFront={() => {}}
                      onRemove={() => {}}
                      onDuplicate={() => {}}
                      onToggleLock={() => {}}
                      onResizeUpload={() => {}}
                    />
                  </div>
                );
              })() : (
                <img
                  src={previewSub.thumbnail_data_url}
                  alt={previewSub.frame_name}
                  style={{ maxWidth: "100%", maxHeight: "55vh", borderRadius: "8px" }}
                />
              )}
            </div>
            {/* Open in Editor button */}
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => {
                  setPreviewSub(null);
                  navigate(`/designer/editor?adminPreview=${previewSub.id}`);
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  width: "100%", padding: "11px 16px",
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  color: "#fff", border: "none", borderRadius: "10px",
                  fontSize: "14px", fontWeight: "700", cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
                }}
              >
                <ExternalLink size={16} />
                Buka di Editor (Preview Admin)
              </button>
              <p style={{ margin: 0, fontSize: "11px", color: "#9ca3af", textAlign: "center" }}>
                Mode simulasi — perubahan tidak akan disimpan
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div style={S.modalOverlay} onClick={() => setReviewModal(null)}>
          <div style={S.reviewModal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>
                Review: {reviewModal.frame_name}
              </h3>
              <button onClick={() => setReviewModal(null)} style={S.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <div style={S.modalBody}>
              {/* Designer info */}
              <div style={S.infoBox}>
                <strong>Designer:</strong> {reviewModal.designer_name || reviewModal.designer_email}
                <br />
                <strong>Deskripsi:</strong> {reviewModal.frame_description || "(tidak ada)"}
              </div>

              {reviewModal.thumbnail_data_url && (
                <img
                  src={reviewModal.thumbnail_data_url}
                  alt=""
                  style={{
                    width: "120px",
                    height: "auto",
                    borderRadius: "8px",
                    display: "block",
                    margin: "0 auto 16px",
                  }}
                />
              )}

              {/* Action */}
              <label style={S.mLabel}>Keputusan *</label>
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <button
                  style={{
                    ...S.actionBtn,
                    background: reviewAction === "approved" ? "#10b981" : "#f3f4f6",
                    color: reviewAction === "approved" ? "#fff" : "#374151",
                  }}
                  onClick={() => setReviewAction("approved")}
                >
                  <CheckCircle size={16} />
                  Terima
                </button>
                <button
                  style={{
                    ...S.actionBtn,
                    background: reviewAction === "rejected" ? "#ef4444" : "#f3f4f6",
                    color: reviewAction === "rejected" ? "#fff" : "#374151",
                  }}
                  onClick={() => setReviewAction("rejected")}
                >
                  <XCircle size={16} />
                  Tolak
                </button>
              </div>

              {/* Approve options (only for approve) */}
              {reviewAction === "approved" && (
                <div style={{ marginBottom: "14px" }}>
                  {/* Category */}
                  <label style={S.mLabel}>Kategori Frame *</label>
                  <select
                    value={reviewCategory}
                    onChange={(e) => setReviewCategory(e.target.value)}
                    style={{ ...S.select, marginBottom: "12px" }}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Source type */}
                  <label style={S.mLabel}>Tipe Frame *</label>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "4px" }}>
                    <button
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: reviewSource === "designer" ? "2px solid #6366f1" : "2px solid #e5e7eb",
                        background: reviewSource === "designer" ? "#eef2ff" : "#f9fafb",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onClick={() => setReviewSource("designer")}
                    >
                      <div style={{ fontWeight: "700", fontSize: "13px", color: reviewSource === "designer" ? "#4338ca" : "#374151" }}>🎨 By Designer</div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>Bisa dikustom — muncul di /create → Templates</div>
                    </button>
                    <button
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: reviewSource === "fremio" ? "2px solid #f59e0b" : "2px solid #e5e7eb",
                        background: reviewSource === "fremio" ? "#fffbeb" : "#f9fafb",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onClick={() => setReviewSource("fremio")}
                    >
                      <div style={{ fontWeight: "700", fontSize: "13px", color: reviewSource === "fremio" ? "#92400e" : "#374151" }}>✨ By Fremio</div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>Siap pakai — muncul di /admin/frames → By Fremio</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <label style={S.mLabel}>
                Catatan untuk Designer
                {reviewAction === "rejected" && " *"}
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === "approved"
                    ? "Opsional: pesan untuk designer..."
                    : "Jelaskan mengapa frame ditolak..."
                }
                rows={3}
                style={S.textarea}
              />
            </div>

            <div style={S.modalFooter}>
              <button
                onClick={() => setReviewModal(null)}
                style={S.btnCancel}
                disabled={reviewLoading}
              >
                Batal
              </button>
              <button
                onClick={submitReview}
                style={{
                  ...S.btnSubmit,
                  background:
                    reviewAction === "approved" ? "#10b981" : "#ef4444",
                }}
                disabled={
                  reviewLoading ||
                  (reviewAction === "rejected" && !reviewNotes.trim())
                }
              >
                {reviewLoading ? (
                  "Memproses..."
                ) : (
                  <>
                    <Send size={14} />
                    {reviewAction === "approved" ? "Setujui & Publish" : "Tolak Frame"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page: { maxWidth: "1000px", margin: "0 auto", fontFamily: "'Inter', sans-serif" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" },
  pageTitle: { margin: "0 0 4px", fontSize: "22px", fontWeight: "700", color: "#1a1a2e" },
  pageSubtitle: { margin: 0, fontSize: "14px", color: "#6b7280" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" },
  statCard: { background: "#fff", borderRadius: "10px", padding: "16px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  statValue: { fontSize: "28px", fontWeight: "800" },
  statLabel: { fontSize: "12px", color: "#6b7280", marginTop: "4px" },
  tabs: { display: "flex", gap: "4px", borderBottom: "2px solid #e5e7eb", marginBottom: "16px" },
  tab: { padding: "10px 20px", background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "500", color: "#6b7280", borderBottom: "2px solid transparent", marginBottom: "-2px", display: "flex", alignItems: "center" },
  tabActive: { color: "#6366f1", borderBottomColor: "#6366f1", fontWeight: "700" },
  filterRow: { display: "flex", gap: "8px", marginBottom: "16px" },
  filterBtn: { padding: "6px 14px", border: "1px solid #e5e7eb", background: "#fff", borderRadius: "20px", cursor: "pointer", fontSize: "13px", color: "#6b7280" },
  filterBtnActive: { background: "#6366f1", color: "#fff", borderColor: "#6366f1" },
  loading: { textAlign: "center", padding: "40px", color: "#6b7280" },
  empty: { textAlign: "center", padding: "60px", background: "#fff", borderRadius: "12px", color: "#6b7280" },
  subList: { display: "flex", flexDirection: "column", gap: "10px" },
  subCard: { display: "flex", alignItems: "flex-start", gap: "14px", background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  thumb: { width: "64px", height: "96px", flexShrink: 0, borderRadius: "8px", background: "#f3f4f6", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  thumbPlaceholder: { fontSize: "24px" },
  subInfo: { flex: 1, minWidth: 0 },
  subName: { fontWeight: "700", fontSize: "15px", color: "#1a1a2e", marginBottom: "3px" },
  subDesigner: { fontSize: "13px", color: "#6366f1", marginBottom: "4px" },
  subDesc: { fontSize: "13px", color: "#6b7280", marginBottom: "4px" },
  subMeta: { fontSize: "12px", color: "#9ca3af" },
  adminNote: { marginTop: "6px", padding: "6px 10px", background: "#fff0f0", borderRadius: "6px", fontSize: "12px", color: "#c33" },
  publishedNote: { marginTop: "6px", padding: "6px 10px", background: "#d1fae5", borderRadius: "6px", fontSize: "12px", color: "#065f46" },
  actions: { display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end", flexShrink: 0 },
  statusBadge: { display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap" },
  btnSecondary: { display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", border: "1px solid #e5e7eb", background: "#fff", borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: "#374151" },
  btnReview: { padding: "7px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  designerTable: { background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  td: { padding: "12px 16px", fontSize: "13px", color: "#374151" },
  // Modals
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  previewModal: { background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "400px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  reviewModal: { background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" },
  modalBody: { padding: "20px" },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: "10px", padding: "16px 20px", borderTop: "1px solid #e5e7eb" },
  closeBtn: { background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: "4px" },
  infoBox: { background: "#f9fafb", borderRadius: "8px", padding: "12px", fontSize: "13px", color: "#374151", marginBottom: "14px", lineHeight: "1.6" },
  mLabel: { display: "block", fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "6px" },
  actionBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600", transition: "all 0.2s" },
  select: { width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", marginBottom: "16px", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", resize: "none", boxSizing: "border-box", marginBottom: "8px" },
  btnCancel: { padding: "9px 20px", background: "#f3f4f6", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", color: "#374151" },
  btnSubmit: { display: "flex", alignItems: "center", gap: "6px", padding: "9px 20px", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700", color: "#fff" },
};
