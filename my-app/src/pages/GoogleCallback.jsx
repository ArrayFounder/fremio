import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function GoogleCallback() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [step, setStep] = useState("loading"); // loading | processing | done | error

  useEffect(() => {
    const processGoogleCallback = async () => {
      try {
        // Get code + state from URL search params (OAuth redirect flow)
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");

        if (!code) {
          setError("Autentikasi Google tidak lengkap. Kode otorisasi tidak ditemukan.");
          setStep("error");
          return;
        }

        setStep("processing");

        // Retrieve stored state for CSRF check
        const storedState = sessionStorage.getItem("google_oauth_state");
        sessionStorage.removeItem("google_oauth_state");

        // Exchange code for user data
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state: storedState }),
        });

        const data = await res.json();

        if (data.success && data.token) {
          // Store auth data
          localStorage.setItem("fremio_token", data.token);
          localStorage.setItem("fremio_user", JSON.stringify(data.user));
          localStorage.setItem("fremio_token_timestamp", Date.now().toString());
          setStep("done");
          // Redirect after short delay
          setTimeout(() => {
            if (data.user?.role === "admin") {
              navigate("/admin/dashboard", { replace: true });
            } else {
              navigate("/frames", { replace: true });
            }
          }, 500);
        } else {
          setError(data.error || "Login Google gagal. Coba lagi.");
          setStep("error");
        }
      } catch (e) {
        console.error("Google callback error:", e);
        setError("Terjadi kesalahan saat login dengan Google.");
        setStep("error");
      }
    };

    processGoogleCallback();
  }, [navigate]);

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "40px",
          borderRadius: "16px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          textAlign: "center",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        {step === "loading" && (
          <>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "3px solid #e5e7eb",
                borderTopColor: "#c89585",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h2 style={{ color: "#374151", fontSize: "1.2rem", marginBottom: "8px" }}>
              Memproses login...
            </h2>
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
              Harap tunggu sebentar
            </p>
          </>
        )}

        {step === "processing" && (
          <>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "3px solid #e5e7eb",
                borderTopColor: "#c89585",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h2 style={{ color: "#374151", fontSize: "1.2rem", marginBottom: "8px" }}>
              Verifikasi dengan Google...
            </h2>
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
              Menghubungkan ke server...
            </p>
          </>
        )}

        {step === "done" && (
          <>
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "#22c55e",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: "24px",
              }}
            >
              ✓
            </div>
            <h2 style={{ color: "#22c55e", fontSize: "1.2rem", marginBottom: "8px" }}>
              Login Berhasil!
            </h2>
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
              Mengalihkan ke dashboard...
            </p>
          </>
        )}

        {step === "error" && (
          <>
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "#fee2e2",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: "24px",
              }}
            >
              ✗
            </div>
            <h2 style={{ color: "#dc2626", fontSize: "1.2rem", marginBottom: "8px" }}>
              Login Gagal
            </h2>
            <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: "20px" }}>
              {error}
            </p>
            <button
              onClick={() => navigate("/login")}
              style={{
                background: "#c89585",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Kembali ke Login
            </button>
          </>
        )}
      </div>
    </section>
  );
}