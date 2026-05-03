import { useCallback, useEffect, useMemo, useState } from "react";
import AdminBackButton from "../../components/admin/AdminBackButton.jsx";
import api from "../../services/api";

const STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map((item) => Number.parseInt(item, 10));
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    }
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
};

const getStatusPillStyle = (status) => {
  if (status === "approved") {
    return { background: "#dcfce7", color: "#15803d" };
  }
  if (status === "rejected") {
    return { background: "#fee2e2", color: "#dc2626" };
  }
  return { background: "#fef3c7", color: "#92400e" };
};

export default function AdminEventSubmissions() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actingId, setActingId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: "300", offset: "0" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("q", search);

      const response = await api.get(`/groups/admin/event-submissions?${params.toString()}`);
      setItems(Array.isArray(response?.items) ? response.items : []);
      setTotal(Number(response?.total || 0));
    } catch (err) {
      setError(err?.message || "Gagal memuat pengajuan event");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === "pending").length,
    [items]
  );

  const handleReview = async (id, status) => {
    try {
      setActingId(id);
      await api.put(`/groups/admin/event-submissions/${id}/review`, {
        status,
      });
      await fetchData();
    } catch (err) {
      setError(err?.message || "Gagal memproses review");
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Hapus pengajuan event ini?");
    if (!confirmed) return;

    try {
      setActingId(id);
      await api.delete(`/groups/admin/event-submissions/${id}`);
      await fetchData();
    } catch (err) {
      setError(err?.message || "Gagal menghapus pengajuan event");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <AdminBackButton />

      <div
        style={{
          marginBottom: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>
            🎉 Event Submissions
          </h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>
            Approval link event dari owner share.
          </p>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #fb7185 0%, #7c3aed 100%)",
            color: "white",
            borderRadius: 12,
            padding: "10px 16px",
            minWidth: 120,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{pendingCount}</div>
          <div style={{ fontSize: 12, opacity: 0.88 }}>Pending</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            borderRadius: 10,
            border: "1px solid #d1d5db",
            padding: "9px 12px",
            fontSize: 14,
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
          style={{ display: "flex", gap: 8, flex: 1, minWidth: 260 }}
        >
          <input
            type="text"
            placeholder="Cari share ID / judul / email owner..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            style={{
              flex: 1,
              borderRadius: 10,
              border: "1px solid #d1d5db",
              padding: "9px 12px",
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            style={{
              border: "none",
              borderRadius: 10,
              background: "#111827",
              color: "white",
              padding: "0 14px",
              cursor: "pointer",
            }}
          >
            Cari
          </button>
        </form>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          background: "white",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            Memuat data...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            Tidak ada pengajuan event.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["Share", "Judul", "Owner", "Status", "Tanggal Event", "Pengajuan", "Aksi"].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        color: "#374151",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const statusStyle = getStatusPillStyle(item.status);
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: index < items.length - 1 ? "1px solid #f3f4f6" : "none" }}
                    >
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontFamily: "monospace", color: "#7c3aed", fontWeight: 700 }}>
                        {item.shareId}
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: 220 }}>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{item.title || "-"}</div>
                        {item.description ? (
                          <div
                            style={{
                              marginTop: 4,
                              color: "#6b7280",
                              fontSize: 12,
                              lineHeight: 1.4,
                              maxWidth: 340,
                            }}
                          >
                            {item.description}
                          </div>
                        ) : null}
                        <a
                          href={`https://fremio.id/share/${item.shareId}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#ec4899", fontSize: 12, textDecoration: "none" }}
                        >
                          /share/{item.shareId} ↗
                        </a>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151", minWidth: 180 }}>
                        {item.ownerEmail || "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontWeight: 700,
                            fontSize: 12,
                            ...statusStyle,
                          }}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                        {formatDateOnly(item.eventDate)}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {formatDate(item.createdAt)}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {item.status === "pending" ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              disabled={actingId === item.id}
                              onClick={() => handleReview(item.id, "approved")}
                              style={{
                                border: "none",
                                borderRadius: 8,
                                background: "#16a34a",
                                color: "white",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={actingId === item.id}
                              onClick={() => handleReview(item.id, "rejected")}
                              style={{
                                border: "none",
                                borderRadius: 8,
                                background: "#dc2626",
                                color: "white",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={actingId === item.id}
                              onClick={() => handleDelete(item.id)}
                              style={{
                                border: "none",
                                borderRadius: 8,
                                background: "#6b7280",
                                color: "white",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Hapus
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <span style={{ color: "#9ca3af", fontSize: 12, alignSelf: "center" }}>Selesai</span>
                            <button
                              type="button"
                              disabled={actingId === item.id}
                              onClick={() => handleDelete(item.id)}
                              style={{
                                border: "none",
                                borderRadius: 8,
                                background: "#6b7280",
                                color: "white",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Hapus
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading ? (
        <p style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
          Menampilkan {items.length} dari {total} pengajuan.
        </p>
      ) : null}
    </div>
  );
}
