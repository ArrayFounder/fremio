import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Link2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Save,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import api from "../../services/api";

const STUDIO_BASE_URL = "https://studio.fremio.id";

const parseFrameList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.frames)) return payload.frames;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const isFrame4R = (frame) => {
  const w = Number(frame?.canvasWidth || frame?.canvas_width || 0);
  const h = Number(frame?.canvasHeight || frame?.canvas_height || 0);
  if (w > 0 && h > 0) {
    const ratio = h / w;
    return ratio >= 1.45 && ratio <= 1.55;
  }

  const aspect = String(frame?.layout?.aspectRatio || frame?.aspectRatio || "").toLowerCase();
  return aspect === "2:3" || aspect === "3:2";
};

export default function AdminStudioBoothControl() {
  const navigate = useNavigate();
  const [ownerSearch, setOwnerSearch] = useState("");
  const [frameSearch, setFrameSearch] = useState("");
  const [owners, setOwners] = useState([]);
  const [frames, setFrames] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [loadingFrames, setLoadingFrames] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [enforceWhitelist, setEnforceWhitelist] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dirty, setDirty] = useState(false);

  const loadOwners = useCallback(async () => {
    setLoadingOwners(true);
    try {
      const json = await api.get("/admin/studio/operators");
      if (!json.success) throw new Error(json.message || "Gagal memuat owner studio");
      setOwners(json.data || []);
    } catch (e) {
      setError(e.message || "Gagal memuat owner studio");
    } finally {
      setLoadingOwners(false);
    }
  }, []);

  const loadFrames = useCallback(async () => {
    setLoadingFrames(true);
    try {
      const response = await api.get("/frames?includeHidden=true&limit=1000&source=studio_booth");
      const allFrames = parseFrameList(response);
      const only4R = allFrames.filter((f) => isFrame4R(f));
      setFrames(only4R);
    } catch (e) {
      setError(e.message || "Gagal memuat frame katalog");
    } finally {
      setLoadingFrames(false);
    }
  }, []);

  const loadManagedConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const json = await api.get("/admin/studio/managed-frames");
      if (!json.success) throw new Error(json.message || "Gagal memuat pengaturan studio");

      const ids = Array.isArray(json?.data?.allowedFrameIds)
        ? json.data.allowedFrameIds.map((v) => String(v))
        : [];

      setEnforceWhitelist(Boolean(json?.data?.enforceWhitelist) || ids.length > 0);
      setSelectedIds(new Set(ids));
      setDirty(false);
    } catch (e) {
      setError(e.message || "Gagal memuat pengaturan studio");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setError("");
    setSuccess("");
    await Promise.all([loadOwners(), loadFrames(), loadManagedConfig()]);
  }, [loadOwners, loadFrames, loadManagedConfig]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const visibleOwners = useMemo(() => {
    const q = ownerSearch.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter((o) => {
      const boothNames = (o.boothConfigs || []).map((b) => b.boothName).join(" ").toLowerCase();
      return (
        String(o.email || "").toLowerCase().includes(q) ||
        String(o.businessName || "").toLowerCase().includes(q) ||
        boothNames.includes(q)
      );
    });
  }, [owners, ownerSearch]);

  const visibleFrames = useMemo(() => {
    const q = frameSearch.trim().toLowerCase();
    if (!q) return frames;
    return frames.filter((f) => {
      const text = `${f.name || ""} ${f.category || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [frames, frameSearch]);

  const toggleFrame = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleFrames.forEach((f) => next.add(String(f.id)));
      return next;
    });
    setDirty(true);
  };

  const clearAll = () => {
    setSelectedIds(new Set());
    setDirty(true);
  };

  const saveConfig = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const json = await api.put("/admin/studio/managed-frames", {
        enforceWhitelist: enforceWhitelist || selectedIds.size > 0,
        allowedFrameIds: Array.from(selectedIds),
      });
      if (!json.success) throw new Error(json.message || "Gagal menyimpan pengaturan");
      setSuccess("Pengaturan frame studio berhasil disimpan.");
      setDirty(false);
    } catch (e) {
      setError(e.message || "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFrame = async (frameId, frameName) => {
    if (!confirm(`Hapus frame "${frameName}"?\n\nTindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setDeleting(frameId);
    setError("");
    setSuccess("");
    try {
      await unifiedFrameService.deleteFrame(frameId);
      // Remove from frames list and selectedIds
      setFrames((prev) => prev.filter((f) => String(f.id) !== String(frameId)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(String(frameId));
        return next;
      });
      setSuccess(`Frame "${frameName}" berhasil dihapus.`);
    } catch (e) {
      setError(e.message || `Gagal menghapus frame "${frameName}"`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#1f2937" }}>
            Studio Booth Control
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#6b7280" }}>
            Kelola owner + link booth studio dan tentukan frame khusus Studio Booth yang boleh diimport ke studio.fremio.id.
          </p>
        </div>
        <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/admin/studio-booths/editor")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: "none",
              borderRadius: "10px",
              background: "#4f46e5",
              color: "#fff",
              padding: "9px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Buat Frame Studio
          </button>
          <button
            onClick={loadAll}
            disabled={loadingOwners || loadingFrames || loadingConfig}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              background: "#fff",
              color: "#374151",
              padding: "9px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: "12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "10px", padding: "10px 12px", fontSize: "13px" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: "12px", background: "#ecfdf5", border: "1px solid #86efac", color: "#166534", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px", marginBottom: "18px" }}>
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Building2 size={18} color="#6d28d9" />
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#111827" }}>Owner Studio & Link Booth</h2>
            </div>
            <div style={{ position: "relative", minWidth: "260px", width: "360px", maxWidth: "100%" }}>
              <Search size={15} style={{ position: "absolute", left: "10px", top: "10px", color: "#9ca3af" }} />
              <input
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                placeholder="Cari owner, email, atau booth..."
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "8px 10px 8px 32px", fontSize: "13px" }}
              />
            </div>
          </div>

          {loadingOwners ? (
            <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>Memuat owner studio...</p>
          ) : visibleOwners.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>Tidak ada owner yang cocok.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
              {visibleOwners.map((owner) => (
                <article key={owner.id} style={{ border: "1px solid #f3f4f6", borderRadius: "12px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{owner.businessName || "Tanpa Nama"}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>{owner.email}</div>
                    </div>
                    <div style={{ fontSize: "12px", color: owner.isActive ? "#166534" : "#b91c1c", fontWeight: 700 }}>
                      {owner.isActive ? "Active" : "Nonaktif"}
                    </div>
                  </div>

                  <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr", gap: "6px" }}>
                    {(owner.boothConfigs || []).length === 0 ? (
                      <span style={{ fontSize: "12px", color: "#9ca3af" }}>Belum punya booth aktif</span>
                    ) : (
                      owner.boothConfigs.map((booth) => (
                        <a
                          key={booth.id}
                          href={`${STUDIO_BASE_URL}/b/${booth.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            width: "fit-content",
                            fontSize: "12px",
                            color: "#4f46e5",
                            textDecoration: "none",
                          }}
                        >
                          <Link2 size={13} />
                          {booth.boothName} ({booth.slug})
                        </a>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <SlidersHorizontal size={18} color="#6d28d9" />
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#111827" }}>Katalog Frame Studio Booth</h2>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#374151", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={enforceWhitelist}
                onChange={(e) => {
                  setEnforceWhitelist(e.target.checked);
                  setDirty(true);
                }}
              />
              Aktifkan whitelist frame
            </label>
          </div>

          <div style={{ marginBottom: "10px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px", fontSize: "12px", color: "#4b5563", display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={14} color="#4f46e5" />
            Hanya frame source studio_booth yang tampil di sini. Jika whitelist aktif, owner studio hanya bisa import frame 4R yang dipilih di sini.
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ position: "relative", minWidth: "260px", width: "380px", maxWidth: "100%" }}>
              <Search size={15} style={{ position: "absolute", left: "10px", top: "10px", color: "#9ca3af" }} />
              <input
                value={frameSearch}
                onChange={(e) => setFrameSearch(e.target.value)}
                placeholder="Cari frame 4R..."
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "8px 10px 8px 32px", fontSize: "13px" }}
              />
            </div>
            <button onClick={selectAllVisible} style={{ border: "1px solid #e5e7eb", borderRadius: "9px", background: "#fff", padding: "8px 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Pilih Semua (Visible)</button>
            <button onClick={clearAll} style={{ border: "1px solid #e5e7eb", borderRadius: "9px", background: "#fff", padding: "8px 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Hapus Semua</button>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#6b7280" }}>{selectedIds.size} dipilih</span>
          </div>

          {loadingFrames || loadingConfig ? (
            <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>Memuat data frame studio...</p>
          ) : visibleFrames.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>Tidak ada frame 4R ditemukan.</p>
          ) : (
            <div style={{ maxHeight: "420px", overflow: "auto", border: "1px solid #f3f4f6", borderRadius: "10px" }}>
              {visibleFrames.map((frame) => {
                const checked = selectedIds.has(String(frame.id));
                return (
                  <label
                    key={frame.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 42px 1fr auto",
                      gap: "10px",
                      alignItems: "center",
                      padding: "9px 10px",
                      borderBottom: "1px solid #f9fafb",
                      background: checked ? "#f5f3ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleFrame(String(frame.id))} />
                    <img
                      src={frame.thumbnailUrl || frame.imageUrl || frame.imagePath || ""}
                      alt={frame.name}
                      style={{ width: "42px", height: "62px", objectFit: "cover", borderRadius: "6px", border: "1px solid #eee" }}
                    />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>{frame.name}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>{frame.category} • {frame.id}</div>
                    </div>
                    <span style={{ fontSize: "11px", color: "#4f46e5", fontWeight: 700, border: "1px solid #ddd6fe", background: "#f5f3ff", borderRadius: "999px", padding: "3px 7px" }}>4R</span>
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={saveConfig}
              disabled={saving || !dirty}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                border: "none",
                borderRadius: "10px",
                background: saving || !dirty ? "#9ca3af" : "#4f46e5",
                color: "#fff",
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: 800,
                cursor: saving || !dirty ? "not-allowed" : "pointer",
              }}
            >
              <Save size={15} />
              {saving ? "Menyimpan..." : "Simpan Pengaturan Studio"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
