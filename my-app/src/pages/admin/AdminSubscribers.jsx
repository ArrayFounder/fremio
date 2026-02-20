import { useCallback, useEffect, useMemo, useState } from "react";
import AdminBackButton from "../../components/admin/AdminBackButton.jsx";
import api from "../../services/api";

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

const formatRemaining = (remaining) => {
  if (!remaining) return "-";
  const d = Number(remaining.days ?? 0);
  const h = Number(remaining.hours ?? 0);
  const m = Number(remaining.minutes ?? 0);
  return `${d} hari ${h} jam ${m} menit`;
};

export default function AdminSubscribers() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [email, setEmail] = useState("");
  const [durationDays, setDurationDays] = useState("30");

  const fetchSubscribers = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const res = await api.get("/admin/subscribers?limit=500&offset=0");
      const list = res?.data?.items || [];
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || "Gagal memuat subscribers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aMs = Number(a?.remainingMs ?? 0);
      const bMs = Number(b?.remainingMs ?? 0);
      return aMs - bMs;
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems;
    
    const query = searchQuery.toLowerCase().trim();
    return sortedItems.filter((item) => {
      const email = String(item.email || "").toLowerCase();
      return email.includes(query);
    });
  }, [sortedItems, searchQuery]);

  const onGrant = async (e) => {
    e.preventDefault();

    const emailTrim = String(email).trim().toLowerCase();
    const daysNum = Number(durationDays);

    if (!emailTrim || !emailTrim.includes("@")) {
      alert("Email tidak valid");
      return;
    }
    if (!Number.isFinite(daysNum) || daysNum <= 0) {
      alert("Durasi harus angka > 0 (hari)");
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/admin/subscribers/grant", {
        email: emailTrim,
        durationDays: daysNum,
      });
      setEmail("");
      setDurationDays("30");
      await fetchSubscribers();
      alert("✅ Member berhasil ditambahkan");
    } catch (err) {
      alert(err?.message || "Gagal menambahkan member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      <AdminBackButton />

      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>
          Subscribers
        </h1>
        <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
          Daftar akun yang sedang aktif berlangganan + sisa durasi.
        </p>
      </div>

      <form
        onSubmit={onGrant}
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
          display: "grid",
          gridTemplateColumns: "1fr 160px 160px",
          gap: "12px",
          alignItems: "end",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 700,
              color: "#374151",
              marginBottom: "6px",
            }}
          >
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contoh: user@email.com"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 700,
              color: "#374151",
              marginBottom: "6px",
            }}
          >
            Durasi (hari)
          </label>
          <input
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            inputMode="numeric"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 12px",
            border: "none",
            borderRadius: "10px",
            background: submitting ? "#9ca3af" : "#111827",
            color: "#fff",
            fontWeight: 800,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Menambahkan..." : "Tambah Member"}
        </button>
      </form>

      {error ? (
        <div
          style={{
            padding: "12px 14px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ fontWeight: 800 }}>
            Active Subscribers ({filteredItems.length}
            {searchQuery && sortedItems.length !== filteredItems.length
              ? ` dari ${sortedItems.length}`
              : ""})
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan email..."
              style={{
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                width: "250px",
                fontSize: "14px",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  padding: "8px 10px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  color: "#374151",
                }}
              >
                Clear
              </button>
            )}
            <button
              onClick={fetchSubscribers}
              disabled={loading}
              style={{
                padding: "8px 10px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 700,
                color: "#374151",
              }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "12px 16px" }}>
                  Email
                </th>
                <th style={{ textAlign: "left", padding: "12px 16px" }}>
                  Access End
                </th>
                <th style={{ textAlign: "left", padding: "12px 16px" }}>
                  Sisa Durasi
                </th>
                <th style={{ textAlign: "left", padding: "12px 16px" }}>
                  Payment Method
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((row) => (
                <tr
                  key={`${row.userId}_${row.accessEnd || ""}`}
                  style={{ borderTop: "1px solid #e5e7eb" }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    {row.email || "(email tidak ditemukan)"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {formatDateTime(row.accessEnd)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {formatRemaining(row.remaining)}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151" }}>
                    {row.paymentMethod || "-"}
                  </td>
                </tr>
              ))}

              {!loading && filteredItems.length === 0 && !searchQuery ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: "16px", color: "#6b7280" }}
                  >
                    Belum ada subscriber aktif.
                  </td>
                </tr>
              ) : null}

              {!loading && filteredItems.length === 0 && searchQuery ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: "16px", color: "#6b7280", textAlign: "center" }}
                  >
                    Tidak ada subscriber dengan email yang cocok dengan "{searchQuery}".
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
