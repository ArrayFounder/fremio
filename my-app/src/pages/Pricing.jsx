import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import paymentService from "../services/paymentService";
import unifiedFrameService from "../services/unifiedFrameService";
import "./Pricing.css";

const Pricing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState(null);
  const [canPurchase, setCanPurchase] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Avoid running syncAccess multiple times for the same redirect
  const [syncedOrderFromQuery, setSyncedOrderFromQuery] = useState(null);

  // Premium frames categories shown on Pricing page
  // Must match the exact category strings used when uploading frames in Admin.
  const tabs = [
    "Holiday Fremio Series",
    "Aesthetic Scrapbook & Retro",
    "Cute Characters",
    "Self-love",
    "Romance",
  ];
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [premiumFramesByCategory, setPremiumFramesByCategory] = useState({});
  const [loadingPreviewFrames, setLoadingPreviewFrames] = useState(true);

  useEffect(() => {
    // Set page title
    document.title = "Membership — Fremio";

    // Pricing page should be viewable without login (Midtrans verification / marketing)
    // Only purchase flow requires auth.
    if (currentUser) {
      loadAccessInfo();
    } else {
      setAccess(null);
      setCanPurchase(false);
      setCheckingAccess(false);
    }

    loadSnapScript();
    loadPreviewFrames();
  }, [currentUser]);

  // If Midtrans redirects back with order_id/orderId (common for VTWeb / DANA),
  // immediately sync status to grant access and navigate to /frames.
  useEffect(() => {
    if (!currentUser) return;

    const qs = new URLSearchParams(location.search || "");
    const orderId =
      qs.get("order_id") ||
      qs.get("orderId") ||
      qs.get("order") ||
      null;

    if (!orderId) return;
    if (syncedOrderFromQuery === orderId) return;

    setSyncedOrderFromQuery(orderId);
    syncAccess(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, location.search, syncedOrderFromQuery]);

  const loadPreviewFrames = async () => {
    try {
      setLoadingPreviewFrames(true);
      const frames = await unifiedFrameService.getAllFrames();

      // Pricing preview is based on category only (not tied to paid/free).
      const allowed = new Set(tabs);
      const grouped = (frames || []).reduce((acc, frame) => {
        const rawCategories = Array.isArray(frame?.categories)
          ? frame.categories
          : String(frame?.category || "")
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean);

        const match = rawCategories.find((c) => allowed.has(String(c)));
        if (!match) return acc;

        if (!acc[match]) acc[match] = [];
        acc[match].push(frame);
        return acc;
      }, {});

      // Sort within each category by displayOrder then createdAt
      Object.keys(grouped).forEach((category) => {
        grouped[category].sort(
            (a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
        );
      });

      setPremiumFramesByCategory(grouped);
    } catch (error) {
      console.error("Load preview frames error:", error);
      setPremiumFramesByCategory({});
    } finally {
      setLoadingPreviewFrames(false);
    }
  };

  const loadAccessInfo = async () => {
    try {
      setCheckingAccess(true);

      // Reset pending state
      setPendingPayment(null);

      // Check current access
      try {
        const accessResponse = await paymentService.getAccess();
        if (
          accessResponse &&
          accessResponse.success &&
          accessResponse.hasAccess
        ) {
          setAccess(accessResponse.data);
        } else {
          setAccess(null);
        }
      } catch (accessError) {
        console.log("⚠️ Could not load access info:", accessError.message);
        setAccess(null);
      }

      // Check if can purchase
      try {
        const purchaseResponse = await paymentService.canPurchase();
        if (purchaseResponse && purchaseResponse.success) {
          setCanPurchase(purchaseResponse.canPurchase);
        } else {
          setCanPurchase(true); // Default: allow purchase if check fails
        }
      } catch (purchaseError) {
        console.log(
          "⚠️ Could not check purchase eligibility:",
          purchaseError.message
        );
        setCanPurchase(true); // Default: allow purchase if check fails
      }

      // Check if there is a pending payment to resume
      try {
        const pendingResponse = await paymentService.getPending();
        if (
          pendingResponse?.success &&
          pendingResponse?.hasPending &&
          pendingResponse?.data
        ) {
          setPendingPayment(pendingResponse.data);
          // Prevent new checkout while pending exists
          setCanPurchase(false);
        } else if (pendingResponse?.success && pendingResponse?.data?.orderId) {
          // /payment/pending may have self-healed access (webhook missed) OR
          // cleared stale pending on the server. Refresh client state so the
          // user doesn't need to manually refresh.
          const status = String(pendingResponse.data.status || "").toLowerCase();
          const isPaid =
            status === "settlement" || status === "capture" || status === "completed";

          if (isPaid) {
            try {
              const accessResponse2 = await paymentService.getAccess();
              if (accessResponse2?.success && accessResponse2?.hasAccess) {
                setAccess(accessResponse2.data);
                setCanPurchase(false);
              }
            } catch (e) {
              // ignore; access state will be refreshed on next visit
            }
          } else if (status && status !== "pending") {
            // If the server decided it's no longer pending (failed/cancel/expire/etc),
            // re-check purchase eligibility because our earlier /can-purchase call
            // happened before /pending refresh.
            try {
              const purchaseResponse2 = await paymentService.canPurchase();
              if (purchaseResponse2 && purchaseResponse2.success) {
                setCanPurchase(purchaseResponse2.canPurchase);
              } else {
                setCanPurchase(true);
              }
            } catch {
              setCanPurchase(true);
            }

            setPendingPayment(null);
          }
        }
      } catch (pendingError) {
        console.log("⚠️ Could not load pending payment:", pendingError.message);
      }
    } catch (error) {
      console.error("Load access info error:", error);
      // Set defaults on error
      setAccess(null);
      setCanPurchase(true);
    } finally {
      setCheckingAccess(false);
    }
  };

  const syncAccess = async (orderId = null, retries = 3) => {
    try {
      if (orderId) {
        await paymentService.checkStatus(orderId);
      } else {
        await paymentService.reconcileLatest?.();
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      const accessResponse = await paymentService.getAccess();
      if (accessResponse?.success && accessResponse?.hasAccess) {
        try {
          localStorage.removeItem("fremio_last_order_id");
        } catch {
          // ignore
        }
        alert(
          "✅ Access berhasil! Sekarang Anda bisa menggunakan semua frame premium."
        );
        navigate("/frames");
        return true;
      }

      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return syncAccess(orderId, retries - 1);
      }

      return false;
    } catch (e) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return syncAccess(orderId, retries - 1);
      }
      return false;
    }
  };

  const loadSnapScript = async () => {
    try {
      await paymentService.loadSnapScript();
    } catch (error) {
      console.error("Load Snap script error:", error);
    }
  };

  const handleBuyPackage = async () => {
    console.log("🛒 Buy package clicked");
    console.log("👤 Current user:", currentUser);
    console.log("💳 Can purchase:", canPurchase);
    console.log("🔑 Has access:", access);

    if (!currentUser) {
      console.warn("⚠️ User not logged in, redirecting to register");

      // Show friendly message
      const userChoice = confirm(
        "Anda perlu login untuk melakukan pembelian.\n\n" +
          "Klik OK untuk Register (akun baru)\n" +
          "Klik Cancel untuk Login (sudah punya akun)"
      );

      if (userChoice) {
        // User wants to register
        navigate("/register?redirect=/pricing");
      } else {
        // User wants to login
        navigate("/login?redirect=/pricing");
      }
      return;
    }

    if (!canPurchase && access) {
      alert("Anda masih memiliki akses aktif. Tidak bisa membeli paket baru.");
      return;
    }

    if (!termsAccepted) {
      alert(
        "Sebelum melanjutkan pembayaran, Anda wajib menyetujui Syarat & Ketentuan (termasuk kebijakan No Refund)."
      );
      return;
    }

    try {
      setLoading(true);

      // Auto-check for pending payment and resume if exists
      if (
        pendingPayment &&
        (pendingPayment.snapToken || pendingPayment.redirectUrl)
      ) {
        console.log("📋 Found pending payment, auto-resuming...");
        await paymentService.loadSnapScript();

        if (pendingPayment.snapToken) {
          try {
            if (pendingPayment.orderId) {
              localStorage.setItem("fremio_last_order_id", pendingPayment.orderId);
            }
          } catch {
            // ignore
          }
          paymentService.openSnapPayment(pendingPayment.snapToken, {
            onSuccess: () =>
              syncAccess(pendingPayment.orderId).finally(() =>
                setLoading(false)
              ),
            onPending: () =>
              syncAccess(pendingPayment.orderId).finally(() =>
                setLoading(false)
              ),
            onError: async () => {
              // Auto-cancel and create new on error
              console.log(
                "⚠️ Resume failed, auto-canceling and creating new payment..."
              );
              try {
                await paymentService.cancelLatestPending();
                setPendingPayment(null);
                setCanPurchase(true);
                // Retry create payment (recursive call)
                setLoading(false);
                await handleBuyPackage();
              } catch (cancelError) {
                console.error("Cancel pending error:", cancelError);
                alert(
                  "Gagal melanjutkan pembayaran. Silakan refresh halaman dan coba lagi."
                );
                setLoading(false);
              }
            },
          });
          return;
        }

        if (pendingPayment.redirectUrl) {
          try {
            if (pendingPayment.orderId) {
              localStorage.setItem("fremio_last_order_id", pendingPayment.orderId);
            }
          } catch {
            // ignore
          }
          window.open(
            pendingPayment.redirectUrl,
            "_blank",
            "noopener,noreferrer"
          );
          setTimeout(() => {
            syncAccess(pendingPayment.orderId);
          }, 1500);
          setLoading(false);
          return;
        }
      }

      console.log("💰 Creating payment for:", currentUser.email);
      console.log("📋 Request data:", {
        email: currentUser.email,
        name: currentUser.displayName || "Fremio User",
        phone: currentUser.phoneNumber || "",
      });

      // Create payment
      const response = await paymentService.createPayment({
        email: currentUser.email,
        name: currentUser.displayName || "Fremio User",
        phone: currentUser.phoneNumber || "",
      });

      console.log("✅ Payment response:", response);

      // Check if response has required fields
      if (!response) {
        console.error("❌ No response received");
        throw new Error("Failed to create payment: No response");
      }

      // Response is already unwrapped by paymentService
      // Structure: {success, data: {orderId, token, redirectUrl}} OR direct {orderId, token, redirectUrl}
      const paymentData = response.data || response; // Handle both formats

      if (!paymentData || !paymentData.token || !paymentData.orderId) {
        console.error("❌ Payment token or orderId missing:", response);
        throw new Error("Payment token not received from server");
      }

      console.log(
        "🎫 Payment token received:",
        paymentData.token.substring(0, 20) + "..."
      );
      console.log("📦 Order ID:", paymentData.orderId);

      const orderId = paymentData.orderId;

      try {
        localStorage.setItem("fremio_last_order_id", orderId);
      } catch {
        // ignore
      }

      // Open Midtrans Snap
      console.log("🚀 Opening Midtrans Snap popup...");

      if (!window.snap) {
        console.error("❌ window.snap not available! Snap script not loaded.");
        alert(
          "Payment system not ready. Please refresh the page and try again."
        );
        setLoading(false);
        return;
      }

      paymentService.openSnapPayment(paymentData.token, {
        onSuccess: (result) => {
          console.log("Payment success:", result);
          syncAccess(orderId).then((ok) => {
            if (!ok) {
              setLoading(false);
            }
          });
        },
        onPending: (result) => {
          console.log("Payment pending:", result);
          syncAccess(orderId).finally(() => setLoading(false));
        },
        onError: (result) => {
          console.error("Payment error:", result);
          alert("Pembayaran gagal. Silakan coba lagi.");
          setLoading(false);
        },
      });
    } catch (error) {
      console.error("❌ Buy package error:", error);
      console.error("Error details:", {
        message: error.message,
        response: error.response,
        data: error.data,
        stack: error.stack,
      });

      const errorMsg =
        error.message ||
        error.data?.message ||
        "Terjadi kesalahan. Silakan coba lagi.";

      alert(
        `Gagal membuat pembayaran:\n${errorMsg}\n\nSilakan refresh halaman dan coba lagi.`
      );

      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="pricing-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Memuat informasi...</p>
        </div>
      </div>
    );
  }

  const tabFrames = premiumFramesByCategory[activeTab] || [];

  const pendingCanResume =
    !!pendingPayment &&
    !pendingPayment.unavailable &&
    !!(pendingPayment.snapToken || pendingPayment.redirectUrl);

  const pendingCanManage = !!pendingPayment && !pendingPayment.unavailable;

  const previewQuoteByCategory = {
    "Holiday Fremio Series": "“Holiday Frames untuk temani liburan”",
    "Aesthetic Scrapbook & Retro": "“Aesthetic & Retro untuk cerita kamu”",
    "Cute Characters": "“Cute Characters untuk vibes gemas”",
    "Self-love": "“Self-love untuk momen yang lebih bermakna”",
    Romance: "Romance untuk momen spesial",
  };

  const previewQuote =
    previewQuoteByCategory[activeTab] || "“Koleksi frames untuk member Fremio”";

  const membershipCategoryCounts = tabs.map((category) => ({
    category,
    count: (premiumFramesByCategory[category] || []).length || 0,
  }));

  const membershipTotalFrames = membershipCategoryCounts.reduce(
    (sum, entry) => sum + (entry.count || 0),
    0
  );

  return (
    <div className="pricing-container">
      {/* PREVIEW FRAME KOLEKSI FREMIO - At the top for immediate visibility */}
      <div className="pricing-preview">
        <h3
          style={{
            fontSize: "24px",
            fontWeight: "700",
            textAlign: "center",
            marginBottom: "20px",
            color: "#333",
          }}
        >
          Preview Frame Koleksi Fremio
        </h3>

        <div className="preview-tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`preview-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="preview-panel">
          <div className="preview-quote">{previewQuote}</div>

          {loadingPreviewFrames ? (
            <div className="preview-loading">Memuat preview frames...</div>
          ) : tabFrames.length === 0 ? (
            <div className="preview-empty">
              Belum ada frames untuk kategori ini.
            </div>
          ) : (
            <div className="preview-grid">
              {tabFrames.slice(0, 10).map((frame, idx) => (
                <div key={frame.id || idx} className="preview-item">
                  <div className="preview-thumb">
                    <img
                      src={
                        frame.thumbnailUrl || frame.imageUrl || frame.imagePath
                      }
                      alt={frame.name || `Frame ${idx + 1}`}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                  <div className="preview-name">Frame {idx + 1}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pricing-hero">
        <div
          style={{
            background: "linear-gradient(135deg, #fef5f1 0%, #fff 100%)",
            padding: "40px 30px",
            borderRadius: "16px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            maxWidth: "800px",
            margin: "0 auto 40px",
          }}
        >
          <div className="pricing-tagline">
            <span className="brand-soft">
              Jadi bagian dari perjalanan cerita di Fremio
            </span>
          </div>
          <div
            className="pricing-subtitle"
            style={{
              fontSize: "16px",
              lineHeight: "1.6",
              color: "#666",
              marginTop: "20px",
              textAlign: "center",
            }}
          >
            Setiap orang punya momen.
            <br />
            Fremio hadir untuk memberi ruang agar momen itu bisa diekspresikan,
            dirasakan, dan diingat.
            <br />
            Bukan sekadar frame.
            <br />
            Ini tentang bagaimana kita memaknai cerita hidup.
            <br />
            <strong>
              Mulai sebagai member, dan ikut menjaga ruang ini tetap hidup.
            </strong>
          </div>
        </div>
      </div>

      {access && (
        <div className="current-access">
          <div className="access-card">
            <div className="access-header">
              <span className="access-badge active">✅ Member Aktif</span>
              <span className="days-remaining">
                {access.daysRemaining} hari tersisa
              </span>
            </div>
            <div className="access-info">
              <p>
                <strong>Akses Frame:</strong> {access.totalFrames} frames
              </p>
              <p>
                <strong>Status:</strong> Member Fremio Aktif
              </p>
              <p>
                <strong>Berakhir:</strong>{" "}
                {new Date(access.accessEnd).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WHY FREMIO EXISTS SECTION */}
      <div
        className="why-fremio-section"
        style={{
          padding: "30px 20px",
          background: "linear-gradient(135deg, #fef5f1 0%, #fff 100%)",
          marginBottom: "30px",
          borderRadius: "12px",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: "700",
            textAlign: "center",
            marginBottom: "15px",
            color: "#333",
          }}
        >
          Mengapa Fremio Ada?
        </h2>
        <div
          style={{
            maxWidth: "650px",
            margin: "0 auto",
            fontSize: "15px",
            lineHeight: "1.6",
            color: "#555",
            textAlign: "center",
          }}
        >
          <p style={{ marginBottom: "12px" }}>
            Di tengah dunia yang serba cepat, banyak momen berlalu tanpa sempat
            dirayakan.
          </p>
          <p style={{ marginBottom: "15px" }}>
            Fremio diciptakan sebagai ruang kecil untuk berhenti sejenak —
            menyimpan, membingkai, dan merayakan cerita yang berarti.
          </p>
          <div
            style={{
              marginTop: "15px",
              padding: "20px",
              background: "white",
              borderRadius: "10px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            }}
          >
            <p
              style={{
                fontWeight: "600",
                marginBottom: "10px",
                fontSize: "14px",
              }}
            >
              Kami percaya:
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                textAlign: "left",
                maxWidth: "450px",
                margin: "0 auto",
                fontSize: "14px",
              }}
            >
              <li style={{ marginBottom: "8px" }}>
                ✓ Setiap momen layak punya tempat
              </li>
              <li style={{ marginBottom: "8px" }}>
                ✓ Ekspresi tidak harus ramai untuk bermakna
              </li>
              <li style={{ marginBottom: "8px" }}>
                ✓ Cerita personal juga penting
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="pricing-offer-card">
        {access ? (
          <>
            <div className="offer-title" style={{ color: "#10b981" }}>
              ✓ Terima kasih sudah menjadi Member Fremio
            </div>
            <div
              className="offer-subtitle"
              style={{
                fontSize: "16px",
                color: "#666",
                marginTop: "10px",
                textAlign: "center",
              }}
            >
              Keanggotaan Anda aktif hingga{" "}
              {new Date(access.accessEnd).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>

            <div className="offer-columns" style={{ marginTop: "30px" }}>
              <div className="offer-col">
                <div className="offer-col-title">Yang Kamu Dapatkan:</div>
                <ul>
                  <li>✓ Akses ke {access.totalFrames} premium frames</li>
                  <li>✓ Semua koleksi frame Fremio</li>
                  <li>✓ Frame baru setiap bulan</li>
                  <li>✓ Akses lebih awal ke seri mendatang</li>
                </ul>
              </div>
              <div className="offer-col">
                <div className="offer-col-title">Manfaatkan Keanggotaan:</div>
                <ul>
                  <li>Ekspresikan momen dengan frame pilihan</li>
                  <li>Download hasil tanpa watermark</li>
                  <li>Akses seri khusus (Holiday, Year-End, dll)</li>
                  <li>Perpanjang kapan saja sebelum berakhir</li>
                </ul>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* WHAT YOU UNLOCK SECTION */}
            <div
              style={{
                padding: "30px 20px 15px",
                marginBottom: "10px",
              }}
            >
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "700",
                  textAlign: "center",
                  marginBottom: "20px",
                  color: "#333",
                }}
              >
                Yang Kamu Dapatkan sebagai Member Fremio
              </h2>
              <p
                style={{
                  textAlign: "center",
                  fontSize: "16px",
                  color: "#666",
                  marginBottom: "30px",
                }}
              >
                Sebagai member, kamu mendapatkan akses penuh ke seluruh
                ekosistem Fremio:
              </p>
              <div className="offer-columns">
                <div className="offer-col">
                  <div className="offer-col-title">Akses Penuh:</div>
                  <ul>
                    <li>✓ Unlimited ke seluruh koleksi frame Fremio</li>
                    <li>✓ Frame baru setiap bulan</li>
                    <li>✓ Seri khusus (Holiday, Year-End, dll)</li>
                    <li>✓ Akses lebih awal ke seri mendatang</li>
                  </ul>
                </div>
                <div className="offer-col">
                  <div className="offer-col-title">
                    Koleksi Membership Frames:
                  </div>
                  <ul>
                    {membershipCategoryCounts.map((entry) => (
                      <li key={entry.category}>
                        {entry.count} {entry.category} frames
                      </li>
                    ))}
                    <li>Total: {membershipTotalFrames} frames</li>
                  </ul>
                </div>
              </div>
              <p
                style={{
                  textAlign: "center",
                  fontSize: "16px",
                  fontStyle: "italic",
                  color: "#888",
                  marginTop: "10px",
                  marginBottom: "0",
                }}
              >
                Tanpa perlu memilih satu per satu.
              </p>
            </div>

            {/* MEMBERSHIP CARD SECTION */}
            <div
              onClick={() => {
                const ctaButton = document.querySelector(".offer-cta");
                if (ctaButton) {
                  ctaButton.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }
              }}
              style={{
                background: "linear-gradient(135deg, #e0b7a9 0%, #d4a59a 100%)",
                padding: "20px 20px",
                borderRadius: "12px",
                color: "white",
                textAlign: "center",
                marginTop: "10px",
                marginBottom: "10px",
                boxShadow: "0 4px 12px rgba(224, 183, 169, 0.25)",
                maxWidth: "400px",
                margin: "15px auto",
                cursor: "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(224, 183, 169, 0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(224, 183, 169, 0.25)";
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  marginBottom: "6px",
                }}
              >
                Keanggotaan Fremio
              </h2>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "15px",
                  opacity: 0.95,
                }}
              >
                fremio Member
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    textDecoration: "line-through",
                    opacity: 0.85,
                    color: "#dc2626",
                    letterSpacing: "-0.5px",
                  }}
                >
                  Rp 50.000
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "32px",
                      fontWeight: "800",
                      lineHeight: "1",
                    }}
                  >
                    Rp 10.000
                  </span>
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: "400",
                      opacity: 0.9,
                    }}
                  >
                    / bulan
                  </span>
                </div>
              </div>

              <p
                style={{
                  fontSize: "13px",
                  lineHeight: "1.4",
                  marginTop: "12px",
                  opacity: 0.95,
                }}
              >
                Kontribusi ini membantu Fremio terus berkembang, menciptakan
                frame baru, dan menjaga ruang ekspresi ini tetap terbuka.
              </p>
            </div>

            {/* SOCIAL / BELONGING SECTION */}
            <div
              id="social-belonging-section"
              style={{
                padding: "20px 20px 15px",
                textAlign: "center",
                marginBottom: "5px",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  marginBottom: "15px",
                  color: "#333",
                }}
              >
                Kamu Tidak Sendiri di Sini
              </h3>
              <p
                style={{
                  fontSize: "15px",
                  lineHeight: "1.6",
                  color: "#666",
                  maxWidth: "550px",
                  margin: "0 auto",
                }}
              >
                Fremio digunakan oleh banyak orang dengan cerita yang
                berbeda-beda.
                <br />
                Namun semuanya berbagi satu hal yang sama:
                <br />
                <strong>
                  keinginan untuk mengekspresikan momen dengan cara yang lebih
                  bermakna.
                </strong>
                <br />
                <br />
                Setiap member adalah bagian dari perjalanan ini.
              </p>
            </div>
          </>
        )}

        {!access && (
          <>
            {/* FINAL CTA SECTION - Moved to top */}
            <div
              id="membership-cta-section"
              style={{
                textAlign: "center",
                padding: "15px 20px 10px",
                marginTop: "5px",
              }}
            >
              <h3
                style={{
                  fontSize: "26px",
                  fontWeight: "700",
                  marginBottom: "15px",
                  color: "#333",
                }}
              >
                Siap Menjadi Bagian dari Fremio?
              </h3>
              <p
                style={{
                  fontSize: "16px",
                  color: "#666",
                  marginBottom: "25px",
                }}
              >
                Ini bukan tentang membeli sesuatu.
                <br />
                Ini tentang memilih untuk ikut dalam sebuah perjalanan.
              </p>
            </div>

            {/* TRANSPARENCY & TRUST SECTION */}
            <div className="pricing-terms">
              <div className="pricing-terms-title">Tentang Keanggotaan</div>
              <ul className="pricing-terms-list">
                <li>
                  Keanggotaan bersifat digital dan aktif selama periode
                  berlangganan
                </li>
                <li>Akses diberikan selama status member aktif</li>
                <li>Pembayaran bersifat final setelah berhasil diproses</li>
                <li>
                  Jika ada kendala, kamu selalu bisa menghubungi kami di{" "}
                  <a
                    className="pricing-terms-link"
                    href="mailto:fremioid@gmail.com"
                  >
                    fremioid@gmail.com
                  </a>
                </li>
              </ul>
              <p
                style={{
                  textAlign: "center",
                  fontSize: "15px",
                  color: "#666",
                  marginTop: "20px",
                  fontStyle: "italic",
                }}
              >
                Kami ingin hubungan yang jujur, sederhana, dan saling
                menghargai.
              </p>

              <label className="pricing-terms-agree">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>
                  Saya memahami dan menyetujui ketentuan keanggotaan Fremio
                </span>
              </label>
            </div>
          </>
        )}

        <button
          className={`offer-cta ${
            access
              ? "active-subscription"
              : loading || (currentUser && !access && !termsAccepted)
              ? "disabled"
              : ""
          }`}
          onClick={access ? () => navigate("/frames") : handleBuyPackage}
          disabled={
            !access && (loading || (currentUser && !access && !termsAccepted))
          }
          style={{
            fontSize: access ? "16px" : "18px",
            padding: access ? "12px 30px" : "16px 50px",
            fontWeight: "700",
            minHeight: access ? "auto" : "60px",
            boxShadow: access ? "" : "0 8px 20px rgba(224, 183, 169, 0.4)",
          }}
        >
          {loading
            ? "Memproses..."
            : access
            ? "Gunakan Frame Premium Sekarang →"
            : "Gabung sebagai Member Fremio"}
        </button>

        {!currentUser && (
          <div className="offer-note">Login diperlukan untuk melanjutkan.</div>
        )}

        {currentUser && !access && pendingPayment && (
          <div className="offer-note">
            Anda memiliki transaksi yang sedang pending. Klik "Gabung sebagai
            Member Fremio" untuk melanjutkan pembayaran.
          </div>
        )}
        {currentUser && !canPurchase && access && (
          <div className="offer-note">
            Anda dapat memperpanjang keanggotaan setelah berakhir pada{" "}
            {new Date(access.accessEnd).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        )}
      </div>

      <div className="payment-info">
        <h3>🔒 Pembayaran Aman</h3>
        <p>
          Transaksi Anda dilindungi oleh Midtrans, payment gateway terpercaya di
          Indonesia
        </p>
        <div
          className="payment-methods"
          style={{
            display: "flex",
            gap: "15px",
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: "15px",
          }}
        >
          <span
            style={{
              padding: "8px 16px",
              background: "#f0f0f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#333",
            }}
          >
            💳 Kartu Kredit/Debit
          </span>
          <span
            style={{
              padding: "8px 16px",
              background: "#f0f0f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#333",
            }}
          >
            🏪 Bank Transfer
          </span>
          <span
            style={{
              padding: "8px 16px",
              background: "#f0f0f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#333",
            }}
          >
            📱 E-Wallet
          </span>
          <span
            style={{
              padding: "8px 16px",
              background: "#f0f0f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#333",
            }}
          >
            🏬 Convenience Store
          </span>
        </div>
      </div>

      <div className="faq-section">
        <h3>❓ Pertanyaan Umum</h3>
        <div className="faq-item">
          <h4>Berapa lama keanggotaan berlaku?</h4>
          <p>
            Keanggotaan Fremio berlaku selama 30 hari sejak pembayaran berhasil
            diproses.
          </p>
        </div>
        <div className="faq-item">
          <h4>Apa yang didapat sebagai member?</h4>
          <p>
            Akses unlimited ke semua koleksi frame Fremio, termasuk frame baru
            yang dirilis setiap bulan dan seri khusus (Holiday, Year-End, dll).
          </p>
        </div>
        <div className="faq-item">
          <h4>Bisakah saya perpanjang keanggotaan sebelum 30 hari berakhir?</h4>
          <p>
            Saat ini perpanjangan otomatis hanya bisa dilakukan setelah masa
            aktif berakhir. Kami akan mengingatkan Anda mendekati tanggal
            berakhir.
          </p>
        </div>
        <div className="faq-item">
          <h4>Apa yang terjadi setelah keanggotaan berakhir?</h4>
          <p>
            Frame premium akan terkunci kembali. Anda perlu memperpanjang
            keanggotaan untuk mendapatkan akses lagi ke seluruh koleksi.
          </p>
        </div>
        <div className="faq-item">
          <h4>Bagaimana cara pembayaran?</h4>
          <p>
            Klik "Gabung sebagai Member Fremio", pilih metode pembayaran favorit
            Anda (Kartu Kredit/Debit, Bank Transfer, E-Wallet, atau Convenience
            Store), dan ikuti instruksi pembayaran dari Midtrans.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
