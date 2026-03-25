import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
    inviteCode: "",
  });

  const [error, setError] = useState("");
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
          inviteCode: regData.inviteCode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        saveDesignerAuth(data.user, data.token);
        navigate("/designer/dashboard");
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
            onClick={() => { setTab("login"); setError(""); }}
          >
            Masuk
          </button>
          <button
            style={{ ...styles.tab, ...(tab === "register" ? styles.tabActive : {}) }}
            onClick={() => { setTab("register"); setError(""); }}
          >
            Daftar
          </button>
        </div>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

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
            <label style={styles.label}>Kode Undangan</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Masukkan kode undangan"
              value={regData.inviteCode}
              onChange={(e) => setRegData((p) => ({ ...p, inviteCode: e.target.value }))}
              required
            />
            <p style={styles.hint}>
              Butuh kode undangan untuk mendaftar sebagai designer.
            </p>
            <button style={styles.submitBtn} type="submit" disabled={loading}>
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
    background: "#0f0704",
    backgroundImage: "linear-gradient(180deg, #1a0c09 0%, #0f0704 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Inter', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(224,183,169,0.2)",
    backdropFilter: "blur(12px)",
    borderRadius: "20px",
    padding: "44px 40px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
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
    color: "#fdf7f4",
    marginBottom: "16px",
  },
  title: {
    margin: "0 0 6px",
    fontSize: "20px",
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: "-0.3px",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    color: "rgba(255,255,255,0.5)",
  },
  tabs: {
    display: "flex",
    borderRadius: "10px",
    overflow: "hidden",
    border: "1px solid rgba(224,183,169,0.2)",
    marginBottom: "24px",
    background: "rgba(255,255,255,0.03)",
  },
  tab: {
    flex: 1,
    padding: "10px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "rgba(255,255,255,0.45)",
    transition: "all 0.2s",
  },
  tabActive: {
    background: "rgba(224,183,169,0.15)",
    color: "#e0b7a9",
    fontWeight: "700",
  },
  errorBox: {
    background: "rgba(200,60,60,0.15)",
    border: "1px solid rgba(200,60,60,0.3)",
    color: "#ff9999",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    marginTop: "8px",
    marginBottom: "4px",
  },
  input: {
    padding: "11px 14px",
    border: "1px solid rgba(224,183,169,0.2)",
    borderRadius: "10px",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
  },
  hint: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
    margin: "2px 0 8px",
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
    color: "rgba(255,255,255,0.4)",
    textDecoration: "none",
  },
};
