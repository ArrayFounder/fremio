import { useCallback, useEffect, useState } from "react";
import AdminBackButton from "../../components/admin/AdminBackButton.jsx";
import api from "../../services/api";

const API_BASE = import.meta.env.VITE_API_URL || "https://api.fremio.id/api";

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

function exportCsv(items) {
  const headers = ["Share ID", "Judul", "Owner Email", "Jumlah Frame", "URL", "Dibuat"];
  const rows = items.map((item) => [
    item.shareId,
    `"${(item.title || "").replace(/"/g, '""')}"`,
    item.ownerEmail || "",
    item.frameCount,
    `https://fremio.id/share/${item.shareId}`,
    formatDate(item.createdAt),
  ]);

  const csvContent =
    [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `share-links-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminShareLinks() {
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [inputVal, setInputVal] = useState("");

  const fetchData = useCallback(async (q = "") => {
    try {
      setError("");
      setLoading(true);
      const params = new URLSearchParams({ limit: "500", offset: "0" });
      if (q) params.set("q", q);
      const res = await api.get(`/groups/admin/share-links?${params.toString()}`);
      const data = res?.data;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(search);
  }, [fetchData, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(inputVal.trim());
  };

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <AdminBackButton />

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>
            🔗 Share Links
          </h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            Semua link share yang dibuat pengguna
          </p>
        </div>

        {/* Stat badge */}
        <div style={{
          background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
          color: "white",
          borderRadius: 12,
          padding: "12px 20px",
          textAlign: "center",
          minWidth: 110,
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{loading ? "…" : total}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Total Link</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1 }}>
          <input
            type="text"
            placeholder="Cari share ID atau judul…"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Cari
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setInputVal(""); setSearch(""); }}
              style={{
                padding: "8px 12px",
                background: "#f3f4f6",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕ Reset
            </button>
          )}
        </form>

        <button
          onClick={() => exportCsv(items)}
          disabled={items.length === 0}
          style={{
            padding: "8px 16px",
            background: items.length === 0 ? "#e5e7eb" : "#10b981",
            color: items.length === 0 ? "#9ca3af" : "white",
            border: "none",
            borderRadius: 8,
            cursor: items.length === 0 ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{
        background: "white",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "3px solid #e5e7eb",
              borderTopColor: "#8b5cf6",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }} />
            Memuat data…
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            {search ? `Tidak ada hasil untuk "${search}"` : "Belum ada share link"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["Share ID", "Judul", "Owner Email", "Frame", "URL", "Dibuat"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#374151",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={item.shareId}
                    style={{
                      borderBottom: idx < items.length - 1 ? "1px solid #f3f4f6" : "none",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#fdf4ff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 600, color: "#8b5cf6" }}>
                      {item.shareId}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#111827", maxWidth: 200 }}>
                      <span style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {item.title || <span style={{ color: "#9ca3af" }}>—</span>}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6b7280" }}>
                      {item.ownerEmail || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#374151", textAlign: "center" }}>
                      <span style={{
                        background: "#f3f4f6",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontWeight: 600,
                      }}>
                        {item.frameCount}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <a
                        href={`https://fremio.id/share/${item.shareId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#ec4899", textDecoration: "none", fontWeight: 500, fontSize: 12 }}
                      >
                        /share/{item.shareId} ↗
                      </a>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && items.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#9ca3af" }}>
          Menampilkan {items.length} dari {total} share link{search ? ` (filter: "${search}")` : ""}
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
