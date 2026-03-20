import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PlusSquare, Clock, CheckCircle, XCircle, Eye } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const getToken = () =>
  localStorage.getItem("fremio_token") || localStorage.getItem("designer_token");

const STATUS_CONFIG = {
  pending: { label: "Menunggu Review", icon: Clock, color: "#f59e0b", bg: "#fef3c7" },
  approved: { label: "Diterima", icon: CheckCircle, color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "Ditolak", icon: XCircle, color: "#ef4444", bg: "#fee2e2" },
};

export default function DesignerDashboard() {
  const [submissions, setSubmissions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("submissions");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
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

  const markRead = async (id) => {
    await fetch(`${API_URL}/designer/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setNotifications((n) =>
      n.map((x) => (x.id === id ? { ...x, is_read: true } : x))
    );
  };

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

      {/* Tabs */}
      <div style={styles.tabs}>
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
          ) : (
            <div style={styles.submissionList}>
              {submissions.map((sub) => {
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

                    {/* Status Badge */}
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
                );
              })}
            </div>
          )}
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
};
