import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Send, CalendarDays } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import {
  fetchApprovedEvents,
  fetchMyShareLinks,
  submitEventApplication,
} from "../services/groupService.js";
import { loadDraftGroups } from "../utils/draftGroupStorage.js";

const API_ORIGIN =
  (import.meta.env.VITE_API_URL || "/api").replace(/\/api\/?$/, "") || "";

const MONTH_FILTERS = [
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
];

const getTodayDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDateKey = (value) => {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map((item) => Number.parseInt(item, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const formatEventDateLabel = (value) => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return "Tanggal event";
  const [year, month, day] = normalized.split("-").map((item) => Number.parseInt(item, 10));
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

const normalizeThumbUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  if (!raw.startsWith("/")) return `${API_ORIGIN}/${raw.replace(/^\/+/, "")}`;
  return `${API_ORIGIN}${raw}`;
};

export default function Event() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const [applyOpen, setApplyOpen] = useState(false);
  const [shareLinkInput, setShareLinkInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [eventDateInput, setEventDateInput] = useState(getTodayDateKey());
  const [myShareLinks, setMyShareLinks] = useState([]);
  const [loadingMyShareLinks, setLoadingMyShareLinks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const currentMonth = new Date().getMonth() + 1;
    return MONTH_FILTERS.some((item) => item.value === currentMonth) ? currentMonth : 5;
  });

  const loadEvents = useCallback(async (query = "") => {
    try {
      setLoading(true);
      setError("");
      const result = await fetchApprovedEvents({ q: query, limit: 80 });
      setEvents(result.items || []);
      setTotal(Number(result.total || 0));
    } catch (err) {
      setError(err?.message || "Gagal memuat event");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents(searchKeyword);
  }, [loadEvents, searchKeyword]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchKeyword(searchInput.trim());
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!applyOpen || !isAuthenticated || !token) return;

    let cancelled = false;
    const loadMyShareLinks = async () => {
      try {
        setLoadingMyShareLinks(true);
        const items = await fetchMyShareLinks(token);
        let filteredItems = Array.isArray(items) ? items : [];

        if (user?.email) {
          const groups = loadDraftGroups(user.email);
          const allowedShareIds = new Set(
            groups
              .map((group) => group?.preferences?.shareId)
              .filter((value) => typeof value === "string" && value.trim())
          );
          if (allowedShareIds.size > 0) {
            filteredItems = filteredItems.filter((item) => allowedShareIds.has(item?.shareId));
          }
        }

        if (!cancelled) {
          setMyShareLinks(filteredItems);
        }
      } catch {
        if (!cancelled) {
          setMyShareLinks([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMyShareLinks(false);
        }
      }
    };

    loadMyShareLinks();

    return () => {
      cancelled = true;
    };
  }, [applyOpen, isAuthenticated, token, user?.email]);

  const todayDateKey = useMemo(() => getTodayDateKey(), []);

  const visibleEvents = useMemo(() => {
    const filtered = events.filter((item) => {
      const dateKey = normalizeDateKey(item?.eventDate || "");
      if (!dateKey) return false;
      const month = Number.parseInt(dateKey.slice(5, 7), 10);
      return month === selectedMonth;
    });

    return filtered.sort((a, b) => {
      const dateA = normalizeDateKey(a?.eventDate || "") || "";
      const dateB = normalizeDateKey(b?.eventDate || "") || "";
      const pastA = dateA < todayDateKey;
      const pastB = dateB < todayDateKey;

      if (pastA !== pastB) return pastA ? 1 : -1;
      if (dateA !== dateB) {
        return pastA ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
      }

      const submittedA = String(a?.submittedAt || "");
      const submittedB = String(b?.submittedAt || "");
      return submittedB.localeCompare(submittedA);
    });
  }, [events, selectedMonth, todayDateKey]);

  const groupedEvents = useMemo(() => {
    const grouped = new Map();
    for (const item of visibleEvents) {
      const dateKey = normalizeDateKey(item?.eventDate || "");
      if (!dateKey) continue;
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey).push(item);
    }

    return Array.from(grouped.entries()).map(([dateKey, items]) => ({
      dateKey,
      items,
      isPast: dateKey < todayDateKey,
    }));
  }, [visibleEvents, todayDateKey]);

  const filteredCountText = useMemo(() => {
    const monthLabel = MONTH_FILTERS.find((item) => item.value === selectedMonth)?.label || "Bulan";
    if (!searchKeyword) return `${visibleEvents.length} event bulan ${monthLabel}`;
    return `${visibleEvents.length} hasil pencarian bulan ${monthLabel}`;
  }, [searchKeyword, selectedMonth, visibleEvents.length]);

  const openApplyModal = () => {
    if (!isAuthenticated) {
      showToast("info", "Login dulu untuk mendaftarkan event");
      navigate("/login");
      return;
    }
    setEventDateInput((current) => normalizeDateKey(current) || getTodayDateKey());
    setApplyOpen(true);
  };

  const handleSubmitApply = async (event) => {
    event.preventDefault();
    if (!shareLinkInput.trim()) {
      showToast("error", "Masukkan link share terlebih dahulu");
      return;
    }
    if (!descriptionInput.trim()) {
      showToast("error", "Deskripsi event wajib diisi");
      return;
    }
    if (!normalizeDateKey(eventDateInput)) {
      showToast("error", "Tanggal event wajib diisi");
      return;
    }

    try {
      setSubmitting(true);
      const result = await submitEventApplication({
        shareLink: shareLinkInput.trim(),
        description: descriptionInput.trim(),
        eventDate: eventDateInput,
        token,
      });
      showToast(
        "success",
        result?.message || "Event berhasil diajukan ke admin"
      );
      setApplyOpen(false);
      setShareLinkInput("");
      setDescriptionInput("");
      setEventDateInput(getTodayDateKey());
    } catch (err) {
      showToast("error", err?.message || "Gagal mengajukan event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #fff8f4 0%, #fff 48%, #f7efe9 100%)",
        padding: "28px 16px 56px",
      }}
    >
      <div style={{ maxWidth: 1220, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(28px, 3vw, 40px)",
                color: "#1f2937",
                fontWeight: 900,
                letterSpacing: "-0.02em",
              }}
            >
              Event kamu ada frame nya di fremio
            </h1>
            <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 14 }}>
              Cari event, pilih frame, bagikan ke dunia.
            </p>
          </div>

          <button
            type="button"
            onClick={openApplyModal}
            style={{
              border: "none",
              borderRadius: 999,
              background: "#DEB6A9",
              color: "#4a2c23",
              padding: "11px 18px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 10px 24px rgba(122, 77, 63, 0.18)",
            }}
          >
            <Send size={16} />
            Daftarkan Event
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          {MONTH_FILTERS.map((month) => {
            const active = selectedMonth === month.value;
            return (
              <button
                key={month.value}
                type="button"
                onClick={() => setSelectedMonth(month.value)}
                style={{
                  border: active ? "1px solid #7a4d3f" : "1px solid #e5e7eb",
                  borderRadius: 999,
                  background: active ? "#9f6d5b" : "#fff",
                  color: active ? "#fff" : "#6b7280",
                  padding: "8px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {month.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <Search
              size={16}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}
            />
            <input
              type="text"
              placeholder="Cari judul event atau share ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: "100%",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: "11px 14px 11px 38px",
                outline: "none",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>
          {searchInput ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchKeyword("");
              }}
              style={{
                border: "none",
                borderRadius: 10,
                background: "#e5e7eb",
                color: "#111827",
                padding: "0 14px",
                cursor: "pointer",
                height: 42,
              }}
            >
              Reset
            </button>
          ) : null}
        </div>

        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>
          {loading ? "Memuat event..." : filteredCountText}
        </p>

        {error ? (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#dc2626",
              borderRadius: 12,
              padding: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        {!error && !loading && groupedEvents.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d1d5db",
              borderRadius: 14,
              background: "rgba(255,255,255,0.7)",
              padding: "42px 18px",
              textAlign: "center",
            }}
          >
            <CalendarDays size={26} color="#9ca3af" />
            <p style={{ margin: "12px 0 0", color: "#6b7280" }}>
              {searchKeyword
                ? `Belum ada event yang cocok dengan "${searchKeyword}"`
                : "Belum ada event pada bulan ini."}
            </p>
          </div>
        ) : null}

        {!error && groupedEvents.length > 0 ? (
          <div style={{ display: "grid", gap: 16 }}>
            {groupedEvents.map((group) => (
              <div key={group.dateKey}>
                <div
                  style={{
                    marginBottom: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: group.isPast ? "#f3f4f6" : "#fdf1eb",
                    color: group.isPast ? "#6b7280" : "#7a4d3f",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {formatEventDateLabel(group.dateKey)}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  {group.items.map((item) => {
                    const thumbUrl = normalizeThumbUrl(item.thumbnail);
                    return (
                      <Link
                        key={item.id || item.shareId}
                        to={`/share/${item.shareId}`}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          borderRadius: 14,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          overflow: "hidden",
                          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
                        }}
                      >
                        <div
                          style={{
                            aspectRatio: "3/5",
                            background: thumbUrl
                              ? `url(${thumbUrl}) center/cover no-repeat`
                              : "linear-gradient(160deg, #f3f4f6, #e5e7eb)",
                          }}
                        />
                        <div style={{ padding: "10px 11px 12px" }}>
                          <p
                            style={{
                              margin: 0,
                              color: "#111827",
                              fontWeight: 700,
                              fontSize: 13,
                              lineHeight: 1.35,
                            }}
                          >
                            {item.title || `Event ${item.shareId}`}
                          </p>
                          {item.description ? (
                            <p
                              style={{
                                margin: "6px 0 0",
                                color: "#6b7280",
                                fontSize: 12,
                                lineHeight: 1.4,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {applyOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => (submitting ? null : setApplyOpen(false))}
        >
          <form
            onSubmit={handleSubmitApply}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 22, color: "#111827" }}>
              Daftarkan Event
            </h3>
            <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 14 }}>
              Masukkan link share event kamu. Admin akan review dulu sebelum tampil di halaman ini.
            </p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#374151" }}>
              Link share
            </label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setShareLinkInput(e.target.value);
                }
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid #d8b3a4",
                padding: "10px 12px",
                marginBottom: 8,
                background: "#fff7f3",
                color: "#7a4d3f",
                fontWeight: 600,
              }}
              disabled={loadingMyShareLinks}
            >
              <option value="">
                {loadingMyShareLinks
                  ? "Memuat link share milik kamu..."
                  : myShareLinks.length > 0
                    ? "Pilih dari group frame kamu (opsional)"
                    : "Belum ada link share group pada akun kamu"}
              </option>
              {myShareLinks.map((item) => (
                <option
                  key={item.shareId}
                  value={`${window.location.origin}/share/${item.shareId}`}
                >
                  {item.title || item.shareId} • /share/{item.shareId}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="https://fremio.id/share/xxxx"
              value={shareLinkInput}
              onChange={(e) => setShareLinkInput(e.target.value)}
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                padding: "10px 12px",
                marginBottom: 12,
              }}
            />

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#374151" }}>
              Deskripsi Event *
            </label>
            <p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: 12 }}>
              Wajib diisi. Deskripsi ini akan muncul di tampilan event kamu.
            </p>
            <textarea
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder="Contoh: Event ulang tahun Sandy tanggal 18 Mei di Kopi Salem"
              rows={4}
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                padding: "10px 12px",
                resize: "vertical",
                marginBottom: 14,
              }}
            />

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#374151" }}>
              Tanggal Event *
            </label>
            <input
              type="date"
              value={eventDateInput}
              onChange={(e) => setEventDateInput(e.target.value)}
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                padding: "10px 12px",
                marginBottom: 14,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setApplyOpen(false)}
                disabled={submitting}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: "#e5e7eb",
                  color: "#111827",
                  padding: "10px 14px",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #ec4899 0%, #7c3aed 100%)",
                  color: "#fff",
                  padding: "10px 16px",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
