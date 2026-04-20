import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DesignerTOSModal } from "./policies/DesignerTOS.jsx";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export default function DesignerLogin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login"); // "login" | "register"

  // Login state
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  // Register state
  const [regData, setRegData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const saveDesignerAuth = (user, token) => {
    localStorage.setItem("fremio_token", token);
    localStorage.setItem("fremio_user", JSON.stringify(user));
    localStorage.setItem("designer_token", token);
    localStorage.setItem("designer_user", JSON.stringify(user));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/designer/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });
      const data = await res.json();
      if (data.success) {
        saveDesignerAuth(data.user, data.token);
        navigate("/designer/dashboard");
      } else {
        setError(data.message || "Login gagal");
      }
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (regData.password !== regData.confirmPassword) {
      setError("Password tidak cocok");
      return;
    }
    if (regData.password.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/designer/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regData.email,
          password: regData.password,
          displayName: regData.displayName,
          tosAgreed: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        saveDesignerAuth(data.user, data.token);
        if (data.upgraded) {
          setSuccessMsg("Akun kamu berhasil diupgrade menjadi designer! Mengalihkan...");
          setTimeout(() => navigate("/designer/dashboard"), 1500);
        } else {
          navigate("/designer/dashboard");
        }
      } else {
        setError(data.message || "Registrasi gagal");
      }
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / Header */}
        <div style={styles.header}>
          <div style={styles.logoText}>fremio</div>
          <h1 style={styles.title}>Selamat datang kembali</h1>
          <p style={styles.subtitle}>Masuk ke portal desainer Fremio</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === "login" ? styles.tabActive : {}) }}
            onClick={() => { setTab("login"); setError(""); setSuccessMsg(""); }}
          >
            Masuk
          </button>
          <button
            style={{ ...styles.tab, ...(tab === "register" ? styles.tabActive : {}) }}
            onClick={() => { setTab("register"); setError(""); setSuccessMsg(""); }}
          >
            Daftar
          </button>
        </div>

        {/* Error / Success */}
        {error && <div style={styles.errorBox}>{error}</div>}
        {successMsg && <div style={styles.successBox}>{successMsg}</div>}

        {/* Login Form */}
        {tab === "login" && (
          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="email@example.com"
              value={loginData.email}
              onChange={(e) => setLoginData((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Password"
              value={loginData.password}
              onChange={(e) => setLoginData((p) => ({ ...p, password: e.target.value }))}
              required
            />
            <button style={styles.submitBtn} type="submit" disabled={loading}>
              {loading ? "Memproses..." : "Masuk ke Dashboard"}
            </button>
          </form>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <form onSubmit={handleRegister} style={styles.form}>
            <label style={styles.label}>Nama Tampilan</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Nama kamu"
              value={regData.displayName}
              onChange={(e) => setRegData((p) => ({ ...p, displayName: e.target.value }))}
            />
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="email@example.com"
              value={regData.email}
              onChange={(e) => setRegData((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Min. 6 karakter"
              value={regData.password}
              onChange={(e) => setRegData((p) => ({ ...p, password: e.target.value }))}
              required
            />
            <label style={styles.label}>Konfirmasi Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Ulangi password"
              value={regData.confirmPassword}
              onChange={(e) => setRegData((p) => ({ ...p, confirmPassword: e.target.value }))}
              required
            />

            <button
              style={styles.submitBtn}
              type="submit"
              disabled={loading}
            >
              {loading ? "Mendaftarkan..." : "Daftar sebagai Designer"}
            </button>
          </form>
        )}

        <div style={styles.footer}>
          <a href="/designer" style={styles.backLink}>← Kembali ke halaman utama</a>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#fdf6f3",
    backgroundImage: "linear-gradient(180deg, #fff 0%, #f5ece8 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Inter', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  card: {
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: "20px",
    padding: "44px 40px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
    position: "relative",
    zIndex: 1,
  },
  header: {
    textAlign: "center",
    marginBottom: "28px",
  },
  logoText: {
    fontSize: "28px",
    fontWeight: "800",
    letterSpacing: "-1px",
    color: "#1a1a1a",
    marginBottom: "16px",
  },
  title: {
    margin: "0 0 6px",
    fontSize: "20px",
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: "-0.3px",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    color: "rgba(0,0,0,0.45)",
  },
  tabs: {
    display: "flex",
    borderRadius: "10px",
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.1)",
    marginBottom: "24px",
    background: "rgba(0,0,0,0.03)",
  },
  tab: {
    flex: 1,
    padding: "10px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "rgba(0,0,0,0.4)",
    transition: "all 0.2s",
  },
  tabActive: {
    background: "rgba(224,140,115,0.12)",
    color: "#b5502e",
    fontWeight: "700",
  },
  errorBox: {
    background: "rgba(200,60,60,0.07)",
    border: "1px solid rgba(200,60,60,0.25)",
    color: "#c0392b",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "16px",
  },
  successBox: {
    background: "rgba(40,167,69,0.08)",
    border: "1px solid rgba(40,167,69,0.30)",
    color: "#1e7e34",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "16px",
  },
  infoBox: {
    background: "rgba(224,140,115,0.10)",
    border: "1px solid rgba(224,140,115,0.30)",
    color: "#7a3520",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "8px",
    lineHeight: "1.5",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "rgba(0,0,0,0.55)",
    marginTop: "8px",
    marginBottom: "4px",
  },
  input: {
    padding: "11px 14px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: "10px",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
    background: "#f9f9f9",
    color: "#1a1a1a",
  },
  hint: {
    fontSize: "12px",
    color: "rgba(0,0,0,0.38)",
    margin: "2px 0 8px",
  },
  tosRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    marginTop: "14px",
    marginBottom: "4px",
  },
  tosCheckbox: {
    marginTop: "2px",
    width: "16px",
    height: "16px",
    cursor: "pointer",
    flexShrink: 0,
  },
  tosLabel: {
    fontSize: "13px",
    color: "rgba(0,0,0,0.65)",
    lineHeight: 1.5,
    cursor: "default",
  },
  tosLink: {
    background: "none",
    border: "none",
    padding: 0,
    color: "#b5502e",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
    textDecoration: "underline",
  },
  submitBtn: {
    marginTop: "16px",
    padding: "13px",
    background: "#e0b7a9",
    color: "#1a0c09",
    border: "none",
    borderRadius: "100px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "opacity 0.2s",
    letterSpacing: "-0.2px",
  },
  footer: {
    marginTop: "24px",
    textAlign: "center",
  },
  backLink: {
    fontSize: "13px",
    color: "rgba(0,0,0,0.38)",
    textDecoration: "none",
  },
};
