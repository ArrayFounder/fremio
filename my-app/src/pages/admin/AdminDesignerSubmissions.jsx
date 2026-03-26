import { useState, useEffect, useRef } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  Users,
  Send,
  X,
} from "lucide-react";

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
  const [reviewLoading, setReviewLoading] = useState(false);
  const [allCategories, setAllCategories] = useState(loadAllCategories);

  // Preview modal
  const [previewSub, setPreviewSub] = useState(null);

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

  const openReviewModal = (submission) => {
    setReviewModal(submission);
    setReviewAction("approved");
    setReviewNotes("");
    setReviewCategory("Fremio Series");
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
      </div>

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
                        <div style={S.publishedNote}>
                          ✅ Published: {sub.published_frame_name}
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
                    {["Designer", "Email", "Total", "Pending", "Approved", "Rejected", "Bergabung"].map(
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
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <div style={{ textAlign: "center", padding: "16px" }}>
              <img
                src={previewSub.thumbnail_data_url}
                alt={previewSub.frame_name}
                style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: "8px" }}
              />
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

              {/* Category (only for approve) */}
              {reviewAction === "approved" && (
                <>
                  <label style={S.mLabel}>Kategori Frame</label>
                  <select
                    value={reviewCategory}
                    onChange={(e) => setReviewCategory(e.target.value)}
                    style={S.select}
                  >
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </>
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
