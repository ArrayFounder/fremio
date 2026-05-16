import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useTranslation } from "react-i18next";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticateUser, resetPassword } = useAuth();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [error, setError] = useState(
    (() => {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err === 'google_auth_failed') return 'Login Google gagal. Coba lagi.';
      if (err === 'no_credential') return 'Autentikasi Google tidak lengkap.';
      if (err === 'callback_error') return 'Terjadi kesalahan saat login.';
      return '';
    })()
  );
  const [successMessage, setSuccessMessage] = useState(
    location.state?.message || ""
  );
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetLoading, setResetLoading] = useState(false);


  // Custom Google Sign-In button handler (manual redirect flow)
  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google Sign-In tidak dikonfigurasi');
      return;
    }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem('google_oauth_state', state);

    // Build Google OAuth 2.0 redirect URL
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=https%3A%2F%2Ffremio.id%2Fauth%2Fgoogle%2Fcallback&` +
      `response_type=code&` +
      `scope=openid%20profile%20email&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${state}`;

    // Redirect to Google
    window.location.href = googleAuthUrl;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError("");
    setSuccessMessage(""); // Clear success message when user starts typing
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!formData.email || !formData.password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      const result = await authenticateUser(formData.email, formData.password);

      // Check if user needs to set password first
      if (result.requirePasswordSetup) {
        navigate("/set-password", {
          state: {
            email: result.email,
            tempToken: result.tempToken
          }
        });
        return;
      }

      if (result.success) {
        // Check if user is admin and redirect accordingly
        const storedUser = localStorage.getItem("fremio_user");
        if (storedUser) {
          const user = JSON.parse(storedUser);
          if (user.role === "admin") {
            // Admin goes to admin dashboard
            navigate("/admin/dashboard", { replace: true });
          } else {
            // Regular users go to frames
            const from = location.state?.from?.pathname || "/frames";
            navigate(from, { replace: true });
          }
        } else {
          // Fallback
          const from = location.state?.from?.pathname || "/frames";
          navigate(from, { replace: true });
        }
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setResetSuccess("");
    setResetLoading(true);

    if (!resetEmail) {
      setError("Please enter your email address");
      setResetLoading(false);
      return;
    }

    try {
      // Use VPS API for password reset
      const result = await resetPassword(resetEmail);
      
      if (result.success) {
        setResetSuccess(result.message || t("login.reset_sent"));
        setResetEmail("");
        setTimeout(() => {
          setShowForgotPassword(false);
          setResetSuccess("");
        }, 8000); // Extended to 8 seconds untuk user sempat baca
      } else {
        setError(result.message || "Failed to send reset email");
      }
    } catch (error) {
      console.error("Password reset error:", error);
      setError("Failed to send reset email. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <section className="anchor auth-wrap">
      <div className="container">
        <div className="auth-titlebar">
          <h1>Log In</h1>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <Link to="/login" className="auth-tab active">
              🔓 Log in
            </Link>
            <Link to="/register" className="auth-tab">
              👥 Register
            </Link>
          </div>

          <form className="auth-body" onSubmit={handleSubmit}>
            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#fee",
                  border: "1px solid #fcc",
                  borderRadius: "8px",
                  color: "#c33",
                  fontSize: "0.9rem",
                  marginBottom: "16px",
                }}
              >
                {error}
              </div>
            )}

            {successMessage && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#efe",
                  border: "1px solid #cfc",
                  borderRadius: "8px",
                  color: "#3c3",
                  fontSize: "0.9rem",
                  marginBottom: "16px",
                }}
              >
                {successMessage}
              </div>
            )}

            {resetSuccess && (
              <div
                style={{
                  padding: "16px",
                  background: "#d1fae5",
                  border: "1px solid #6ee7b7",
                  borderRadius: "8px",
                  color: "#065f46",
                  fontSize: "0.9rem",
                  marginBottom: "16px",
                  whiteSpace: "pre-line",
                  lineHeight: "1.6",
                }}
              >
                {resetSuccess}
              </div>
            )}

            {!showForgotPassword ? (
              <>
                <label className="auth-label">Email address</label>
                <input
                  className="auth-input"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                />

                <label className="auth-label">Password</label>
                <input
                  className="auth-input"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <label className="auth-check" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      name="rememberMe"
                      checked={formData.rememberMe}
                      onChange={handleChange}
                      disabled={loading}
                    />{" "}
                    remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#c89585",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>

                <button className="auth-btn" type="submit" disabled={loading}>
                  {loading ? "Logging in..." : "Login"}
                </button>

                <div style={{ marginTop: "16px", textAlign: "center" }}>
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "#94a3b8",
                      marginBottom: "8px",
                    }}
                  >
                    or
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      width: "100%",
                      maxWidth: "320px",
                      margin: "0 auto",
                      padding: "12px 24px",
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "0.95rem",
                      fontWeight: "500",
                      color: "#374151",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </button>
                </div>

                <p className="auth-help">
                  don't have account? <Link to="/register">register</Link>
                </p>
              </>
            ) : (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <h3
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      marginBottom: "8px",
                    }}
                  >
                    Reset Password
                  </h3>
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "#64748b",
                      marginBottom: "8px",
                    }}
                  >
                    Enter your email address and we'll send you a link to reset
                    your password.
                  </p>
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      color: "#0369a1",
                    }}
                  >
                    💡 Check your spam/junk folder if you don't see the email
                  </div>
                </div>

                <label className="auth-label">Email address</label>
                <input
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={resetLoading}
                />

                <button
                  className="auth-btn"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  style={{ marginBottom: "12px" }}
                >
                  {resetLoading ? "Sending..." : "Send Reset Link"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmail("");
                    setError("");
                  }}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    color: "#64748b",
                    fontSize: "0.95rem",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Back to Login
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
