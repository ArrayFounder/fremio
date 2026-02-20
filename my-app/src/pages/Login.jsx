import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../config/firebase.js";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticateUser } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState(
    location.state?.message || ""
  );
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

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
      // Configure action code settings to avoid spam
      const actionCodeSettings = {
        url: window.location.origin + "/reset-password",
        handleCodeInApp: false,
      };

      await sendPasswordResetEmail(auth, resetEmail, actionCodeSettings);
      setResetSuccess(
        "✅ Email reset password sudah dikirim!\n\n" +
          "📧 Silakan cek email Anda (termasuk folder Spam/Junk).\n\n" +
          "💡 Tips: Jika email masuk ke Spam, klik 'Bukan Spam' agar email selanjutnya masuk ke Inbox."
      );
      setResetEmail("");
      setTimeout(() => {
        setShowForgotPassword(false);
        setResetSuccess("");
      }, 8000); // Extended to 8 seconds untuk user sempat baca
    } catch (error) {
      console.error("Password reset error:", error);
      if (error.code === "auth/user-not-found") {
        setError("No account found with this email address");
      } else if (error.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (error.code === "auth/too-many-requests") {
        setError("Too many requests. Please try again later.");
      } else {
        setError("Failed to send password reset email. Please try again.");
      }
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
