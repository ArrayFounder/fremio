import { useState, useEffect, useRef } from "react";
import { User, Mail, Calendar, Pencil, CheckCircle, AlertCircle, X, Camera } from "lucide-react";

const C = {
  bg: "#fdf7f4",
  bgAlt: "#fff",
  border: "#ecdeda",
  accent: "#e0b7a9",
  accentDark: "#c89585",
  accentLight: "#f5e6e0",
  accentXLight: "#fdf0eb",
  text: "#4a302b",
  textMuted: "#9b7b73",
  textLight: "#c4a39b",
  activeText: "#c07055",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  red: "#dc2626",
  redBg: "#fef2f2",
  redBorder: "#fecaca",
};

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function formatJoinDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function DesignerProfile() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("designer_user") ||
        localStorage.getItem("fremio_user") ||
        "{}"
      );
    } catch { return {}; }
  });

  const [nickname, setNickname] = useState(user.displayName || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error'
  const [avatar, setAvatar] = useState(user.photoURL || user.avatar || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState(null); // 'success' | 'error'
  const fileInputRef = useRef(null);

  const token =
    localStorage.getItem("designer_token") ||
    localStorage.getItem("fremio_token");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/designer/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const merged = { ...user, ...data };
        setUser(merged);
        setNickname(data.displayName || data.nickname || user.displayName || "");
        setAvatar(data.photoURL || data.avatar || user.photoURL || user.avatar || null);
      })
      .catch(() => {});
  }, [token]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Only allow images up to 5MB
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarStatus("error_size");
      setTimeout(() => setAvatarStatus(null), 3500);
      return;
    }
    // Show preview immediately
    const localUrl = URL.createObjectURL(file);
    setAvatar(localUrl);
    setAvatarUploading(true);
    setAvatarStatus(null);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch(`${API_BASE}/designer/profile/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const photoURL = data.photoURL || data.avatar || localUrl;
      setAvatar(photoURL);
      const updated = { ...user, photoURL };
      setUser(updated);
      const key = localStorage.getItem("designer_user") ? "designer_user" : "fremio_user";
      localStorage.setItem(key, JSON.stringify(updated));
      setAvatarStatus("success");
    } catch {
      // Keep local preview even if upload fails
      setAvatarStatus("error");
    } finally {
      setAvatarUploading(false);
      setTimeout(() => setAvatarStatus(null), 3500);
    }
  };

  const handleSave = async () => {
    if (!nickname.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/designer/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: nickname.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated = { ...user, displayName: nickname.trim() };
      setUser(updated);
      // Persist to localStorage
      const key = localStorage.getItem("designer_user") ? "designer_user" : "fremio_user";
      localStorage.setItem(key, JSON.stringify(updated));
      setStatus("success");
      setEditing(false);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3500);
    }
  };

  const handleCancel = () => {
    setNickname(user.displayName || "");
    setEditing(false);
    setStatus(null);
  };

  const initial = (user.displayName || user.email || "D")[0].toUpperCase();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        padding: "28px 20px 60px",
        maxWidth: "600px",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <User size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: C.text, letterSpacing: "-0.4px" }}>
              Profil
            </h1>
            <p style={{ margin: 0, fontSize: "12px", color: C.textMuted }}>
              Kelola informasi akun desainer-mu
            </p>
          </div>
        </div>
      </div>

      {/* Avatar + name card */}
      <div
        style={{
          background: C.bgAlt,
          borderRadius: "16px",
          border: `1px solid ${C.border}`,
          padding: "24px 20px",
          marginBottom: "16px",
          boxShadow: "0 1px 4px rgba(74,48,43,0.06)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        {/* Avatar with camera button */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: "800",
              fontSize: "28px",
              boxShadow: `0 4px 12px ${C.accent}80`,
              overflow: "hidden",
            }}
          >
            {avatar ? (
              <img
                src={avatar}
                alt="avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              initial
            )}
          </div>
          {/* Camera button overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            title="Ganti foto profil"
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: avatarUploading ? C.border : C.accentDark,
              border: `2px solid ${C.bgAlt}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: avatarUploading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {avatarUploading ? (
              <div style={{
                width: "10px", height: "10px", borderRadius: "50%",
                border: `2px solid ${C.textLight}`, borderTopColor: "transparent",
                animation: "spin 0.7s linear infinite",
              }} />
            ) : (
              <Camera size={11} color="#fff" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: "800", fontSize: "17px", color: C.text, lineHeight: 1.2 }}>
            {user.displayName || user.email?.split("@")[0] || "Designer"}
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: "5px",
              fontSize: "11px",
              fontWeight: "600",
              color: C.accentDark,
              background: C.accentXLight,
              border: `1px solid ${C.accent}`,
              borderRadius: "20px",
              padding: "2px 10px",
              letterSpacing: "0.3px",
            }}
          >
            Designer
          </div>
          {avatarStatus === "success" && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "7px", fontSize: "11px", color: C.green, fontWeight: "500" }}>
              <CheckCircle size={11} /> Foto berhasil diperbarui
            </div>
          )}
          {avatarStatus === "error" && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "7px", fontSize: "11px", color: C.red, fontWeight: "500" }}>
              <AlertCircle size={11} /> Gagal upload, coba lagi
            </div>
          )}
          {avatarStatus === "error_size" && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "7px", fontSize: "11px", color: C.red, fontWeight: "500" }}>
              <AlertCircle size={11} /> Ukuran file maks. 5MB
            </div>
          )}
        </div>
      </div>

      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Nickname field */}
      <div
        style={{
          background: C.bgAlt,
          borderRadius: "16px",
          border: `1px solid ${C.border}`,
          padding: "20px",
          marginBottom: "12px",
          boxShadow: "0 1px 4px rgba(74,48,43,0.06)",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: "11px",
            fontWeight: "700",
            color: C.textLight,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Nama / Nickname
        </label>

        {editing ? (
          <div>
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={40}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 14px",
                border: `1.5px solid ${C.accentDark}`,
                borderRadius: "10px",
                fontSize: "15px",
                color: C.text,
                background: C.accentXLight,
                outline: "none",
                fontWeight: "600",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button
                onClick={handleSave}
                disabled={saving || !nickname.trim()}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "none",
                  borderRadius: "9px",
                  background: saving || !nickname.trim()
                    ? C.border
                    : `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                  color: saving || !nickname.trim() ? C.textLight : "#fff",
                  fontWeight: "700",
                  fontSize: "13px",
                  cursor: saving || !nickname.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.18s",
                }}
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: "10px 14px",
                  border: `1px solid ${C.border}`,
                  borderRadius: "9px",
                  background: C.bgAlt,
                  color: C.textMuted,
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <X size={14} />
                Batal
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ fontSize: "15px", fontWeight: "600", color: C.text }}>
              {user.displayName || <span style={{ color: C.textLight, fontStyle: "italic" }}>Belum diatur</span>}
            </span>
            <button
              onClick={() => setEditing(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                border: `1px solid ${C.border}`,
                borderRadius: "8px",
                background: C.accentXLight,
                color: C.accentDark,
                fontWeight: "600",
                fontSize: "12px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Pencil size={12} />
              Edit
            </button>
          </div>
        )}

        {status === "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "9px 12px", background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: "8px", fontSize: "12px", color: C.green, fontWeight: "500" }}>
            <CheckCircle size={13} /> Nama berhasil disimpan!
          </div>
        )}
        {status === "error" && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "9px 12px", background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: "8px", fontSize: "12px", color: C.red, fontWeight: "500" }}>
            <AlertCircle size={13} /> Gagal menyimpan. Coba lagi.
          </div>
        )}
      </div>

      {/* Email field */}
      <div
        style={{
          background: C.bgAlt,
          borderRadius: "16px",
          border: `1px solid ${C.border}`,
          padding: "20px",
          marginBottom: "12px",
          boxShadow: "0 1px 4px rgba(74,48,43,0.06)",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: "11px",
            fontWeight: "700",
            color: C.textLight,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Email
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Mail size={15} color={C.textLight} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "14px", color: C.textMuted, fontWeight: "500" }}>
            {user.email || "-"}
          </span>
        </div>
        <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: C.textLight }}>
          Email tidak bisa diubah.
        </p>
      </div>

      {/* Join date field */}
      <div
        style={{
          background: C.bgAlt,
          borderRadius: "16px",
          border: `1px solid ${C.border}`,
          padding: "20px",
          boxShadow: "0 1px 4px rgba(74,48,43,0.06)",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: "11px",
            fontWeight: "700",
            color: C.textLight,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Bergabung Sejak
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Calendar size={15} color={C.textLight} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "14px", color: C.textMuted, fontWeight: "500" }}>
            {formatJoinDate(user.createdAt || user.joinedAt || user.created_at) || "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
