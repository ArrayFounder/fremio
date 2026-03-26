import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { PlusSquare, Clock, CheckCircle, XCircle, Pencil, FileText, Trash2 } from "lucide-react";
import { getDraftsForDesigner, removeDraft } from "./DesignerEditor.jsx";

// ─── Canvas size helpers ───────────────────────────────────────────────────
const CANVAS_W = 1080;
function _getCanvasDims(ratio) {
  if (typeof ratio !== "string") return { w: CANVAS_W, h: 1920 };
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return { w: CANVAS_W, h: 1920 };
  if (rh >= rw) return { w: CANVAS_W, h: Math.round((CANVAS_W * rh) / rw) };
  return { w: Math.round((1920 * rw) / rh), h: 1920 };
}
function _canvasSize(ratio) {
  const r = (ratio || "9:16").toLowerCase().replace(/\s/g, "");
  if (["2r","1:3","600:1800"].includes(r)) return "2r";
  if (["photostrip","1200:1800","2:3","4:6","4r"].includes(r)) return "4r";
  return "story";
}
// Mini canvas preview for draft thumbnails
function DraftPreview({ draft, thumbW = 72 }) {
  const ratio = draft.canvasAspectRatio || "9:16";
  const { w: cW, h: cH } = _getCanvasDims(ratio);
  const scale = thumbW / cW;
  const thumbH = Math.round(cH * scale);
  const elements = draft.elements || [];
  const bg = draft.canvasBackground || "#f7f1ed";
  const sorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return (
    <div style={{ width: thumbW, height: thumbH, background: bg, borderRadius: "6px", overflow: "hidden", position: "relative", flexShrink: 0 }}>
      {sorted.map((el) => {
        const x = Math.round((el.x ?? 0) * scale);
        const y = Math.round((el.y ?? 0) * scale);
        const w = Math.round((el.width ?? 0) * scale);
        const h = Math.round((el.height ?? 0) * scale);
        const base = {
          position: "absolute", left: x, top: y, width: w, height: h,
          borderRadius: el.data?.borderRadius ? Math.max(1, Math.round(el.data.borderRadius * scale)) : undefined,
          overflow: "hidden",
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        };
        if ((el.type === "background-photo" || el.type === "upload") && el.data?.image) {
          return <img key={el.id} src={el.data.image} style={{ ...base, objectFit: "cover", display: "block" }} alt="" />;
        }
        if (el.type === "photo") {
          return <div key={el.id} style={{ ...base, background: el.data?.fill || "#d1e3f0", border: "1px solid rgba(0,0,0,0.1)" }} />;
        }
        if (el.type === "shape") {
          return <div key={el.id} style={{ ...base, background: el.data?.fill || "#ccc", opacity: el.data?.opacity ?? 1 }} />;
        }
        if (el.type === "text") {
          return (
            <div key={el.id} style={{ ...base, fontSize: Math.max(4, Math.round((el.data?.fontSize || 40) * scale)), color: el.data?.color || "#000", fontWeight: el.data?.fontWeight || "normal", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
              {el.data?.text || ""}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

const GREETINGS = [
  (name) => ({
    title: `Hai, ${name}! 👋`,
    body: "Setiap frame yang kamu buat adalah hadiah abadi bagi seseorang. Hari ini, karya apa yang ingin kamu tinggalkan untuk dunia?",
  }),
  (name) => ({
    title: `Selamat datang, ${name}. ✨`,
    body: "Di balik setiap foto yang dicetak, ada desainer yang membuat momen itu terasa lebih bermakna — dan hari ini, desainer itu adalah kamu.",
  }),
  (name) => ({
    title: `${name}, studio-mu sudah menanti. 🎨`,
    body: "Kreativitasmu bukan sekadar keahlian — ini adalah cara kamu bercerita kepada jutaan keluarga Indonesia yang ingin mengabadikan kenangan mereka.",
  }),
  (name) => ({
    title: `Kembali lagi, ${name}! 🖼️`,
    body: "Karya terbaik selalu lahir dari desainer yang percaya bahwa detail kecil pun punya cerita besar. Teruslah berkarya dengan penuh makna.",
  }),
  (name) => ({
    title: `${name}, karyamu dinantikan. 🌟`,
    body: "Fremio ada karena desainer seperti kamu percaya bahwa setiap momen layak dirayakan dengan indah. Terima kasih sudah jadi bagian dari cerita ini.",
  }),
];

const API_URL = import.meta.env.VITE_API_URL || "/api";

const getToken = () =>
  localStorage.getItem("designer_token") || localStorage.getItem("fremio_token");

const STATUS_CONFIG = {
  pending: { label: "Menunggu Review", icon: Clock, color: "#f59e0b", bg: "#fef3c7" },
  approved: { label: "Diterima", icon: CheckCircle, color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "Ditolak", icon: XCircle, color: "#ef4444", bg: "#fee2e2" },
};

const SIZE_FILTERS = [
  { key: "all", label: "Semua" },
  { key: "story", label: "Story Instagram" },
  { key: "4r", label: "4R" },
  { key: "2r", label: "2R" },
];
function SizeFilterBar({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
      {SIZE_FILTERS.map((f) => (
        <button key={f.key} onClick={() => onChange(f.key)} style={{
          padding: "5px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "600", cursor: "pointer",
          border: value === f.key ? "1.5px solid #c07055" : "1.5px solid #e0c8c0",
          background: value === f.key ? "#fdf0eb" : "#fff",
          color: value === f.key ? "#c07055" : "#7a5a52",
          transition: "all 0.15s",
        }}>{f.label}</button>
      ))}
    </div>
  );
}

export default function DesignerDashboard() {
  const [submissions, setSubmissions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("drafts");
  const [draftSizeFilter, setDraftSizeFilter] = useState("all");
  const [subSizeFilter, setSubSizeFilter] = useState("all");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null);

  const designerName = useMemo(() => {
    try {
      const u = JSON.parse(
        localStorage.getItem("designer_user") ||
          localStorage.getItem("fremio_user") ||
          "null"
      );
      return u?.displayName || u?.display_name || u?.email?.split("@")[0] || "Desainer";
    } catch {
      return "Desainer";
    }
  }, []);

  const greeting = useMemo(() => {
    const idx = Math.floor(Math.random() * GREETINGS.length);
    return GREETINGS[idx](designerName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // intentionally empty so it's fixed per session

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    // Load drafts from IndexedDB
    getDraftsForDesigner().then(setDrafts).catch(() => {});
    try {
      const [subRes, notifRes] = await Promise.all([
        fetch(`${API_URL}/designer/submissions`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
        fetch(`${API_URL}/designer/notifications`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
      ]);
      const subData = await subRes.json();
      const notifData = await notifRes.json();
      if (subData.success) setSubmissions(subData.submissions || []);
      if (notifData.success) setNotifications(notifData.notifications || []);
    } catch (e) {
      console.error("Error loading dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    await fetch(`${API_URL}/designer/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (feedbackMessage.trim().length < 10) return;
    setFeedbackLoading(true);
    setFeedbackResult(null);
    try {
      const res = await fetch(`${API_URL}/designer/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ type: feedbackType, message: feedbackMessage }),
      });
      const data = await res.json();
      setFeedbackResult(data);
      if (data.success) {
        setFeedbackMessage("");
        setFeedbackType("general");
      }
    } catch {
      setFeedbackResult({ success: false, message: "Tidak dapat menghubungi server" });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const markRead = async (id) => {
    await fetch(`${API_URL}/designer/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setNotifications((n) =>
      n.map((x) => (x.id === id ? { ...x, is_read: true } : x))
    );
  };

  const handleDeleteDraft = useCallback(async (id) => {
    await removeDraft(id);
    const updated = await getDraftsForDesigner();
    setDrafts(updated);
  }, []);

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === "pending").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.spinner} />
        <p>Memuat dashboard...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard Designer</h1>
          <p style={styles.pageSubtitle}>Kelola frame desain kamu di sini</p>
        </div>
        <Link to="/designer/editor" style={styles.createBtn}>
          <PlusSquare size={18} />
          Buat Frame Baru
        </Link>
      </div>

      {/* Greeting Banner */}
      <div style={styles.greetingCard}>
        <div style={styles.greetingAccent} />
        <div style={styles.greetingContent}>
          <h2 style={styles.greetingTitle}>{greeting.title}</h2>
          <p style={styles.greetingBody}>{greeting.body}</p>
        </div>
        <div style={styles.greetingDeco}>🎨</div>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        {[
          { label: "Total Submission", value: stats.total, color: "#6366f1" },
          { label: "Menunggu Review", value: stats.pending, color: "#f59e0b" },
          { label: "Diterima", value: stats.approved, color: "#10b981" },
          { label: "Ditolak", value: stats.rejected, color: "#ef4444" },
        ].map((stat) => (
          <div key={stat.label} style={styles.statCard}>
            <div style={{ ...styles.statValue, color: stat.color }}>{stat.value}</div>
            <div style={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Feedback Banner */}
      <div style={styles.feedbackBanner}>
        <div style={styles.feedbackBannerLeft}>
          <span style={styles.feedbackBannerEmoji}>💬</span>
          <div>
            <div style={styles.feedbackBannerTitle}>Ada masukan atau keluhan?</div>
            <div style={styles.feedbackBannerSub}>Ceritakan ke kami — mulai dari tools yang kamu butuhkan hingga ide yang ingin kamu lihat di Fremio for Designer</div>
          </div>
        </div>
        <button style={styles.feedbackBannerBtn} onClick={() => { setShowFeedback(true); setFeedbackResult(null); }}>
          Kirim Masukan
        </button>
      </div>

      {/* Feedback Modal */}
      {showFeedback && (
        <div style={styles.modalOverlay} onClick={() => setShowFeedback(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Kirim Masukan ke Fremio</h2>
              <button style={styles.modalClose} onClick={() => setShowFeedback(false)}>✕</button>
            </div>
            <p style={styles.modalDesc}>
              Kami senang mendengar dari kamu. Setiap masukan membantu Fremio menjadi tools yang lebih baik buat semua desainer.
            </p>
            {feedbackResult ? (
              <div style={{ ...styles.feedbackResult, background: feedbackResult.success ? "#d1fae5" : "#fee2e2", color: feedbackResult.success ? "#065f46" : "#c0392b" }}>
                {feedbackResult.success ? "✅ " : "❌ "}{feedbackResult.message}
                {feedbackResult.success && (
                  <button style={styles.feedbackNewBtn} onClick={() => { setFeedbackResult(null); setShowFeedback(false); }}>
                    Tutup
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit}>
                <label style={styles.feedbackLabel}>Kategori</label>
                <div style={styles.feedbackTypeRow}>
                  {[
                    { key: "editor", label: "🛠 Editor / Tools" },
                    { key: "bug", label: "🐛 Bug / Error" },
                    { key: "suggestion", label: "💡 Saran Fitur" },
                    { key: "general", label: "💬 Umum" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      style={{ ...styles.feedbackTypeBtn, ...(feedbackType === t.key ? styles.feedbackTypeBtnActive : {}) }}
                      onClick={() => setFeedbackType(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <label style={styles.feedbackLabel}>Pesan</label>
                <textarea
                  style={styles.feedbackTextarea}
                  rows={5}
                  placeholder="Ceritakan detail masukan, keluhan, atau ide kamu di sini..."
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  required
                />
                <div style={styles.feedbackFooter}>
                  <span style={{ fontSize: "12px", color: feedbackMessage.length < 10 ? "#ef4444" : "#9ca3af" }}>
                    {feedbackMessage.length < 10 ? `Minimal ${10 - feedbackMessage.length} karakter lagi` : `${feedbackMessage.length} karakter`}
                  </span>
                  <button
                    type="submit"
                    style={{ ...styles.feedbackSubmitBtn, opacity: feedbackLoading || feedbackMessage.trim().length < 10 ? 0.6 : 1 }}
                    disabled={feedbackLoading || feedbackMessage.trim().length < 10}
                  >
                    {feedbackLoading ? "Mengirim..." : "Kirim Masukan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === "drafts" ? styles.tabActive : {}) }}
          onClick={() => { getDraftsForDesigner().then(setDrafts).catch(() => {}); setActiveTab("drafts"); }}
        >
          <FileText size={14} />
          Drafts {drafts.length > 0 && <span style={{ ...styles.badge, background: "#e0b7a9", color: "#2c1508" }}>{drafts.length}</span>}
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === "submissions" ? styles.tabActive : {}) }}
          onClick={() => setActiveTab("submissions")}
        >
          Submissions ({stats.total})
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === "notifications" ? styles.tabActive : {}) }}
          onClick={() => setActiveTab("notifications")}
        >
          Notifikasi {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
        </button>
      </div>

      {/* Submissions Tab */}
      {activeTab === "submissions" && (
        <div style={styles.section}>
          {/* Size filter */}
          {submissions.length > 0 && (
            <SizeFilterBar value={subSizeFilter} onChange={setSubSizeFilter} />
          )}
          {submissions.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🎨</div>
              <h3 style={styles.emptyTitle}>Belum ada submission</h3>
              <p style={styles.emptyText}>Mulai buat frame pertama kamu!</p>
              <Link to="/designer/editor" style={styles.createBtn}>
                <PlusSquare size={16} />
                Buat Frame Sekarang
              </Link>
            </div>
          ) : (() => {
            const filtered = subSizeFilter === "all" ? submissions : submissions.filter(s => _canvasSize(s.canvas_aspect_ratio) === subSizeFilter);
            return filtered.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>🔍</div>
                <h3 style={styles.emptyTitle}>Tidak ada submission ukuran ini</h3>
              </div>
            ) : (
            <div style={styles.submissionList}>
              {filtered.map((sub) => {
                const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <div key={sub.id} style={styles.subCard}>
                    {/* Thumbnail */}
                    <div style={styles.subThumb}>
                      {sub.thumbnail_data_url ? (
                        <img
                          src={sub.thumbnail_data_url}
                          alt={sub.frame_name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                        />
                      ) : (
                        <div style={styles.subThumbPlaceholder}>🖼️</div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={styles.subInfo}>
                      <div style={styles.subName}>{sub.frame_name}</div>
                      {sub.frame_description && (
                        <div style={styles.subDesc}>{sub.frame_description}</div>
                      )}
                      <div style={styles.subMeta}>
                        Disubmit:{" "}
                        {new Date(sub.submitted_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      {sub.admin_notes && sub.status === "rejected" && (
                        <div style={styles.adminNote}>
                          📝 <strong>Catatan admin:</strong> {sub.admin_notes}
                        </div>
                      )}
                      {sub.published_frame_name && (
                        <div style={styles.publishedNote}>
                          ✅ Dipublikasikan sebagai: <strong>{sub.published_frame_name}</strong>
                        </div>
                      )}
                    </div>

                    {/* Right side: edit button + status */}
                    <div style={styles.subRight}>
                      <Link
                        to={`/designer/editor?edit=${sub.id}`}
                        style={styles.editBtn}
                      >
                        <Pencil size={13} />
                        Edit
                      </Link>
                      <div
                        style={{
                          ...styles.statusBadge,
                          color: cfg.color,
                          background: cfg.bg,
                        }}
                      >
                        <Icon size={14} />
                        {cfg.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      )}
      {activeTab === "drafts" && (
        <div style={styles.section}>
          {/* Size filter */}
          {drafts.length > 0 && (
            <SizeFilterBar value={draftSizeFilter} onChange={setDraftSizeFilter} />
          )}
          {drafts.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📄</div>
              <h3 style={styles.emptyTitle}>Belum ada draft tersimpan</h3>
              <p style={styles.emptyText}>
                Saat kamu sedang mengerjakan frame dan belum siap submit, simpan sebagai draft dari editor.
              </p>
              <Link to="/designer/editor" style={styles.createBtn}>
                <PlusSquare size={16} />
                Buat Frame Baru
              </Link>
            </div>
          ) : (() => {
            const filtered = draftSizeFilter === "all" ? drafts : drafts.filter(d => _canvasSize(d.canvasAspectRatio) === draftSizeFilter);
            return filtered.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>🔍</div>
                <h3 style={styles.emptyTitle}>Tidak ada draft ukuran ini</h3>
              </div>
            ) : (
            <div style={styles.submissionList}>
              {filtered.map((draft) => (
                <div key={draft.id} style={styles.subCard}>
                  {/* Preview */}
                  <DraftPreview draft={draft} thumbW={72} />

                  {/* Info */}
                  <div style={styles.subInfo}>
                    <div style={styles.subName}>{draft.frameName || <em style={{ color: "#9ca3af" }}>Tanpa nama</em>}</div>
                    {draft.frameDescription && (
                      <div style={styles.subDesc}>{draft.frameDescription}</div>
                    )}
                    <div style={styles.subMeta}>
                      {draft.elementCount != null ? `${draft.elementCount} area foto · ` : ""}
                      Disimpan:{" "}
                      {new Date(draft.savedAt).toLocaleDateString("id-ID", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ ...styles.subRight, gap: "8px" }}>
                    <Link
                      to={`/designer/editor?draft=${draft.id}`}
                      style={{ ...styles.editBtn, background: "#fdf0eb", color: "#a06040", borderColor: "#e0b7a9", textDecoration: "none" }}
                    >
                      <Pencil size={13} />
                      Lanjutkan
                    </Link>
                    <button
                      onClick={() => handleDeleteDraft(draft.id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        padding: "6px 12px", borderRadius: "8px",
                        border: "1px solid #fecaca", background: "#fff5f5",
                        color: "#ef4444", fontSize: "13px", fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={13} />
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
            );
          })()}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <div style={styles.section}>
          {notifications.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🔔</div>
              <h3 style={styles.emptyTitle}>Belum ada notifikasi</h3>
              <p style={styles.emptyText}>Notifikasi akan muncul setelah admin mereview frame kamu</p>
            </div>
          ) : (
            <>
              {unreadCount > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                  <button onClick={markAllRead} style={styles.markAllBtn}>
                    Tandai semua sudah dibaca
                  </button>
                </div>
              )}
              <div style={styles.notifList}>
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    style={{
                      ...styles.notifCard,
                      background: notif.is_read ? "#fff" : "#f0f4ff",
                      borderLeft: notif.is_read ? "3px solid #e5e7eb" : "3px solid #6366f1",
                    }}
                    onClick={() => !notif.is_read && markRead(notif.id)}
                  >
                    <div style={styles.notifTitle}>{notif.title}</div>
                    <div style={styles.notifMessage}>{notif.message}</div>
                    <div style={styles.notifTime}>
                      {new Date(notif.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {!notif.is_read && <span style={styles.unreadDot} />}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: "900px", margin: "0 auto" },
  loadingPage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "50vh",
    color: "#666",
    gap: "12px",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid #e5e7eb",
    borderTopColor: "#6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "24px",
    flexWrap: "wrap",
    gap: "12px",
  },
  pageTitle: { margin: "0 0 4px", fontSize: "24px", fontWeight: "700", color: "#1a1a2e" },
  pageSubtitle: { margin: 0, fontSize: "14px", color: "#666" },
  createBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 18px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "#fff",
    borderRadius: "8px",
    textDecoration: "none",
    fontWeight: "600",
    fontSize: "14px",
  },
  greetingCard: {
    position: "relative",
    background: "linear-gradient(135deg, #faeee6 0%, #f5ddd0 60%, #fae6d6 100%)",
    border: "1px solid rgba(200,149,133,0.3)",
    borderRadius: "16px",
    padding: "28px 32px",
    marginBottom: "24px",
    display: "flex",
    alignItems: "center",
    gap: "20px",
    overflow: "hidden",
  },
  greetingAccent: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    width: "5px",
    background: "linear-gradient(180deg, #c89585, #a06040)",
    borderRadius: "16px 0 0 16px",
  },
  greetingContent: { flex: 1, paddingLeft: "4px" },
  greetingTitle: {
    margin: "0 0 8px",
    fontSize: "19px",
    fontWeight: "700",
    color: "#2c1508",
    letterSpacing: "-0.3px",
  },
  greetingBody: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.7",
    color: "#7a4530",
    maxWidth: "640px",
  },
  greetingDeco: {
    fontSize: "40px",
    opacity: 0.25,
    flexShrink: 0,
    userSelect: "none",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
    marginBottom: "24px",
  },
  statCard: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  statValue: { fontSize: "32px", fontWeight: "800", lineHeight: 1 },
  statLabel: { fontSize: "13px", color: "#666", marginTop: "6px" },
  tabs: {
    display: "flex",
    gap: "4px",
    borderBottom: "2px solid #e5e7eb",
    marginBottom: "20px",
  },
  tab: {
    padding: "10px 20px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "#6b7280",
    borderBottom: "2px solid transparent",
    marginBottom: "-2px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  tabActive: {
    color: "#6366f1",
    borderBottomColor: "#6366f1",
    fontWeight: "700",
  },
  badge: {
    background: "#ef4444",
    color: "#fff",
    borderRadius: "10px",
    padding: "2px 7px",
    fontSize: "11px",
    fontWeight: "700",
  },
  section: {},
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  emptyIcon: { fontSize: "48px", marginBottom: "12px" },
  emptyTitle: { fontSize: "18px", fontWeight: "700", color: "#1a1a2e", margin: "0 0 8px" },
  emptyText: { fontSize: "14px", color: "#666", margin: "0 0 20px" },
  submissionList: { display: "flex", flexDirection: "column", gap: "12px" },
  subCard: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    background: "#fff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  subThumb: {
    width: "72px",
    height: "108px",
    flexShrink: 0,
    borderRadius: "8px",
    background: "#f3f4f6",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  subThumbPlaceholder: { fontSize: "28px" },
  subInfo: { flex: 1, minWidth: 0 },
  subName: { fontWeight: "700", fontSize: "15px", color: "#1a1a2e", marginBottom: "4px" },
  subDesc: { fontSize: "13px", color: "#666", marginBottom: "4px" },
  subMeta: { fontSize: "12px", color: "#9ca3af" },
  adminNote: {
    marginTop: "8px",
    padding: "8px 12px",
    background: "#fff0f0",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#c33",
  },
  publishedNote: {
    marginTop: "8px",
    padding: "8px 12px",
    background: "#d1fae5",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#065f46",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  subRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "8px",
    flexShrink: 0,
  },
  editBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 12px",
    background: "#f0f0ff",
    color: "#6366f1",
    border: "1px solid #c7d2fe",
    borderRadius: "6px",
    textDecoration: "none",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  notifList: { display: "flex", flexDirection: "column", gap: "10px" },
  notifCard: {
    background: "#fff",
    borderRadius: "10px",
    padding: "14px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  notifTitle: { fontWeight: "700", fontSize: "14px", color: "#1a1a2e", marginBottom: "4px" },
  notifMessage: { fontSize: "13px", color: "#555", marginBottom: "6px" },
  notifTime: {
    fontSize: "11px",
    color: "#9ca3af",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  unreadDot: {
    width: "8px",
    height: "8px",
    background: "#6366f1",
    borderRadius: "50%",
    display: "inline-block",
  },
  markAllBtn: {
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid #6366f1",
    color: "#6366f1",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
  },
  feedbackBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "18px 24px",
    marginBottom: "20px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    flexWrap: "wrap",
  },
  feedbackBannerLeft: { display: "flex", alignItems: "center", gap: "14px", flex: 1 },
  feedbackBannerEmoji: { fontSize: "28px", flexShrink: 0 },
  feedbackBannerTitle: { fontWeight: "700", fontSize: "15px", color: "#1a1a2e", marginBottom: "3px" },
  feedbackBannerSub: { fontSize: "13px", color: "#666", lineHeight: 1.5 },
  feedbackBannerBtn: {
    padding: "9px 20px",
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "20px",
  },
  modalBox: {
    background: "#fff",
    borderRadius: "16px",
    padding: "32px",
    width: "100%",
    maxWidth: "520px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  modalTitle: { margin: 0, fontSize: "18px", fontWeight: "800", color: "#1a1a2e" },
  modalClose: { background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#9ca3af", lineHeight: 1 },
  modalDesc: { fontSize: "14px", color: "#555", marginBottom: "20px", lineHeight: 1.6 },
  feedbackLabel: { display: "block", fontWeight: "600", fontSize: "13px", color: "#374151", marginBottom: "8px" },
  feedbackTypeRow: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" },
  feedbackTypeBtn: {
    padding: "6px 12px",
    border: "1.5px solid #e5e7eb",
    borderRadius: "20px",
    background: "#fff",
    fontSize: "13px",
    cursor: "pointer",
    color: "#374151",
    fontWeight: "500",
  },
  feedbackTypeBtnActive: {
    border: "1.5px solid #6366f1",
    background: "#eef2ff",
    color: "#4f46e5",
    fontWeight: "700",
  },
  feedbackTextarea: {
    width: "100%",
    padding: "12px",
    border: "1.5px solid #e5e7eb",
    borderRadius: "10px",
    fontSize: "14px",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    marginBottom: "12px",
    color: "#1a1a2e",
  },
  feedbackFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" },
  feedbackSubmitBtn: {
    padding: "10px 22px",
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
  },
  feedbackResult: {
    borderRadius: "10px",
    padding: "16px 20px",
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: 1.6,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  feedbackNewBtn: {
    alignSelf: "flex-start",
    padding: "7px 16px",
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "13px",
  },
};
