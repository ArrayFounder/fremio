import { useState, useEffect, useCallback } from "react";
import { Wallet, Download, Search, RefreshCw, CheckCircle, XCircle, Phone } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

function exportToCSV(data) {
  const headers = ["No", "Nama", "Email", "Nomor DANA", "Nomor GoPay", "Bergabung"];
  const rows = data.map((d, i) => [
    i + 1,
    d.display_name || "-",
    d.email || "-",
    d.dana_number || "-",
    d.gopay_number || "-",
    d.created_at ? new Date(d.created_at).toLocaleDateString("id-ID") : "-",
  ]);
  const csvContent = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `designer-wallets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminDesignerWallet() {
  const [designers, setDesigners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | has_dana | has_gopay | has_any | missing

  const token =
    localStorage.getItem("fremio_token") ||
    localStorage.getItem("admin_token");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/designer/admin/designers-wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDesigners(data.designers || []);
    } catch {
      setDesigners([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = designers.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (d.display_name || "").toLowerCase().includes(q) ||
      (d.email || "").toLowerCase().includes(q) ||
      (d.dana_number || "").includes(q) ||
      (d.gopay_number || "").includes(q);

    const matchFilter =
      filter === "all" ||
      (filter === "has_dana" && d.dana_number) ||
      (filter === "has_gopay" && d.gopay_number) ||
      (filter === "has_any" && (d.dana_number || d.gopay_number)) ||
      (filter === "missing" && !d.dana_number && !d.gopay_number);

    return matchSearch && matchFilter;
  });

  const stats = {
    total: designers.length,
    has_dana: designers.filter((d) => d.dana_number).length,
    has_gopay: designers.filter((d) => d.gopay_number).length,
    missing: designers.filter((d) => !d.dana_number && !d.gopay_number).length,
  };

  const FILTERS = [
    { id: "all", label: "Semua" },
    { id: "has_dana", label: "Punya DANA" },
    { id: "has_gopay", label: "Punya GoPay" },
    { id: "has_any", label: "Punya Salah Satu" },
    { id: "missing", label: "Belum Isi" },
  ];

  return (
    <div style={{ padding: "24px", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, #e0b7a9, #c89585)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: "#1f2937" }}>Designer Wallets</h1>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>Nomor DANA & GoPay yang didaftarkan designer</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={load}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", color: "#374151", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => exportToCSV(filtered)}
            disabled={filtered.length === 0}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", border: "none", borderRadius: "8px", background: filtered.length === 0 ? "#e5e7eb" : "linear-gradient(135deg, #10b981, #059669)", color: filtered.length === 0 ? "#9ca3af" : "#fff", fontWeight: "700", fontSize: "13px", cursor: filtered.length === 0 ? "not-allowed" : "pointer" }}
          >
            <Download size={14} /> Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Total Designer", value: stats.total, color: "#6366f1", bg: "#eef2ff" },
          { label: "Punya DANA", value: stats.has_dana, color: "#118EEA", bg: "#e8f4fd" },
          { label: "Punya GoPay", value: stats.has_gopay, color: "#00AED6", bg: "#e6f7fa" },
          { label: "Belum Isi", value: stats.missing, color: "#ef4444", bg: "#fef2f2" },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: "12px", padding: "14px 16px", border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: "24px", fontWeight: "800", color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500", marginTop: "2px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1", minWidth: "200px" }}>
          <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau nomor..."
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", color: "#374151", outline: "none" }}
          />
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid", fontSize: "12px", fontWeight: "600", cursor: "pointer", borderColor: filter === f.id ? "#6366f1" : "#e5e7eb", background: filter === f.id ? "#eef2ff" : "#fff", color: filter === f.id ? "#6366f1" : "#6b7280", transition: "all 0.15s" }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>Tidak ada data ditemukan.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["#", "Designer", "Nomor DANA", "Nomor GoPay", "Bergabung"].map((h) => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontWeight: "700", color: "#374151", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6", transition: "background 0.1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 14px", color: "#9ca3af", fontWeight: "500" }}>{i + 1}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: "600", color: "#111827" }}>{d.display_name || "-"}</div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "1px" }}>{d.email}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {d.dana_number ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <CheckCircle size={13} color="#10b981" />
                          <span style={{ color: "#118EEA", fontWeight: "600", fontFamily: "monospace", fontSize: "13px" }}>+62{d.dana_number.startsWith("0") ? d.dana_number.slice(1) : d.dana_number}</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#d1d5db" }}>
                          <XCircle size={13} /> <span style={{ fontSize: "12px" }}>Belum diisi</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {d.gopay_number ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <CheckCircle size={13} color="#10b981" />
                          <span style={{ color: "#00AED6", fontWeight: "600", fontFamily: "monospace", fontSize: "13px" }}>+62{d.gopay_number.startsWith("0") ? d.gopay_number.slice(1) : d.gopay_number}</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#d1d5db" }}>
                          <XCircle size={13} /> <span style={{ fontSize: "12px" }}>Belum diisi</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {d.created_at ? new Date(d.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#9ca3af" }}>
        Menampilkan {filtered.length} dari {designers.length} designer
      </p>
    </div>
  );
}
