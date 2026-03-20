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
          <div style={styles.logo}>🎨</div>
          <h1 style={styles.title}>Fremio Designer</h1>
          <p style={styles.subtitle}>Portal untuk desainer frame Fremio</p>
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
          <a href="/" style={styles.backLink}>← Kembali ke Fremio</a>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Inter', sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  header: {
    textAlign: "center",
    marginBottom: "28px",
  },
  logo: {
    fontSize: "48px",
    marginBottom: "8px",
  },
  title: {
    margin: "0 0 4px",
    fontSize: "24px",
    fontWeight: "700",
    color: "#1a1a2e",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    color: "#666",
  },
  tabs: {
    display: "flex",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #e0e0e0",
    marginBottom: "24px",
  },
  tab: {
    flex: 1,
    padding: "10px",
    border: "none",
    background: "#f5f5f5",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "#666",
    transition: "all 0.2s",
  },
  tabActive: {
    background: "#667eea",
    color: "#fff",
    fontWeight: "700",
  },
  errorBox: {
    background: "#fff0f0",
    border: "1px solid #ffcccc",
    color: "#c33",
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
    color: "#444",
    marginTop: "8px",
    marginBottom: "4px",
  },
  input: {
    padding: "10px 14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  hint: {
    fontSize: "12px",
    color: "#888",
    margin: "2px 0 8px",
  },
  submitBtn: {
    marginTop: "16px",
    padding: "12px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  footer: {
    marginTop: "24px",
    textAlign: "center",
  },
  backLink: {
    fontSize: "13px",
    color: "#667eea",
    textDecoration: "none",
  },
};
