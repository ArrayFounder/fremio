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

  // Promo countdown — resets every midnight (purely decorative / urgency)
  const getSecondsUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight - now) / 1000);
  };
  const [promoSecondsLeft, setPromoSecondsLeft] = useState(getSecondsUntilMidnight);
  useEffect(() => {
    const timer = setInterval(() => {
      setPromoSecondsLeft(getSecondsUntilMidnight());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [pendingPayment, setPendingPayment] = useState(null);

  // Avoid running syncAccess multiple times for the same redirect
  const [syncedOrderFromQuery, setSyncedOrderFromQuery] = useState(null);

  // Premium frames categories shown on Pricing page
  // Must match the exact category strings used when uploading frames in Admin.
  const tabs = [
    "Ramadan Series",
    "Holiday Fremio Series",
    "Aesthetic Scrapbook & Retro",
    "Cute Characters",
    "Self-love",
    "Romance",
  ];
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [premiumFramesByCategory, setPremiumFramesByCategory] = useState({});
  const [loadingPreviewFrames, setLoadingPreviewFrames] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const PLANS = {
    '3days':  { label: '3 Hari', amount: 5000,  originalAmount: 10000, durationLabel: '/ 3 hari',  badge: null },
    '7days':  { label: '1 Minggu', amount: 7000,  originalAmount: 15000, durationLabel: '/ 1 minggu', badge: 'Populer' },
    '30days': { label: '1 Bulan', amount: 10000, originalAmount: 35000, durationLabel: '/ 1 bulan', badge: 'Terbaik' },
  };

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

    try {
      setLoading(true);

      // Auto-check for pending payment and resume if exists
      // But first: if user selected a DIFFERENT plan than the pending payment, cancel it
      let activePending = pendingPayment; // local copy — React setState is async
      if (activePending && selectedPlan) {
        const selectedAmount = PLANS[selectedPlan]?.amount;
        const pendingAmount = activePending.grossAmount;
        if (pendingAmount && selectedAmount && pendingAmount !== selectedAmount) {
          console.log(`🔄 Selected plan (${selectedAmount}) differs from pending (${pendingAmount}), canceling old payment...`);
          try {
            await paymentService.cancelLatestPending();
            activePending = null; // clear local copy immediately
            setPendingPayment(null);
            setCanPurchase(true);
          } catch (cancelErr) {
            console.warn('Cancel pending error:', cancelErr);
          }
          // Fall through to create new payment below
        }
      }

      if (
        activePending &&
        (activePending.snapToken || activePending.redirectUrl)
      ) {
        console.log("📋 Found pending payment, auto-resuming...");
        await paymentService.loadSnapScript();

        if (activePending.snapToken) {
          try {
            if (activePending.orderId) {
              localStorage.setItem("fremio_last_order_id", activePending.orderId);
            }
          } catch {
            // ignore
          }
          paymentService.openSnapPayment(activePending.snapToken, {
            onSuccess: () =>
              syncAccess(activePending.orderId).finally(() =>
                setLoading(false)
              ),
            onPending: () =>
              syncAccess(activePending.orderId).finally(() =>
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
            onClose: () => {
              // User closed Snap without paying — allow them to freely switch plan
              setLoading(false);
            },
          });
          return;
        }

        if (activePending.redirectUrl) {
          try {
            if (activePending.orderId) {
              localStorage.setItem("fremio_last_order_id", activePending.orderId);
            }
          } catch {
            // ignore
          }
          window.open(
            activePending.redirectUrl,
            "_blank",
            "noopener,noreferrer"
          );
          setTimeout(() => {
            syncAccess(activePending.orderId);
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
        plan: selectedPlan,
      });

      // Create payment
      const response = await paymentService.createPayment({
        email: currentUser.email,
        name: currentUser.displayName || "Fremio User",
        phone: currentUser.phoneNumber || "",
        plan: selectedPlan,
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
    "Ramadan Series": "“Ramadan Series untuk momen penuh berkah”",
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
          Preview Frame Membership Fremio
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

      {/* PRICING PLANS SECTION */}
      <div
        className="pricing-plans-section"
        style={{
          padding: '32px 20px',
          background: '#fff',
          marginBottom: '10px',
        }}
      >
        <h2
          style={{
            fontSize: '26px',
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: '8px',
            color: '#1a1a1a',
          }}
        >
          Pilih Paket Keanggotaan
        </h2>
        <p
          style={{
            textAlign: 'center',
            fontSize: '15px',
            color: '#666',
            marginBottom: '20px',
          }}
        >
          Coba dulu atau langsung hemat lebih banyak dengan paket bulanan.
        </p>

        {/* PROMO COUNTDOWN BANNER */}
        {(() => {
          const h = String(Math.floor(promoSecondsLeft / 3600)).padStart(2, '0');
          const m = String(Math.floor((promoSecondsLeft % 3600) / 60)).padStart(2, '0');
          const s = String(promoSecondsLeft % 60).padStart(2, '0');
          return (
            <div style={{
              background: 'linear-gradient(135deg, #c89585 0%, #b07060 100%)',
              borderRadius: '14px',
              padding: '14px 20px',
              marginBottom: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 18px rgba(200,149,133,0.35)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '18px' }}>🔥</span>
                <span style={{ color: '#fff', fontWeight: '700', fontSize: '14px', letterSpacing: '0.3px' }}>
                  Harga promo hanya berlaku hari ini!
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {[['jam', h], ['menit', m], ['detik', s]].map(([label, val]) => (
                  <React.Fragment key={label}>
                    <div style={{
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: '10px',
                      padding: '8px 14px',
                      minWidth: '52px',
                      textAlign: 'center',
                    }}>
                      <div style={{ color: '#fff', fontSize: '26px', fontWeight: '800', lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{val}</div>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '10px', marginTop: '3px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{label}</div>
                    </div>
                    {label !== 'detik' && (
                      <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700', opacity: 0.8, marginBottom: '12px' }}>:</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
                Harga kembali normal tengah malam — jangan sampai kehabisan! ✨
              </div>
            </div>
          );
        })()}

        {/* 3 Plan Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            maxWidth: '800px',
            margin: '0 auto 28px',
          }}
        >
          {Object.entries(PLANS).map(([key, plan]) => {
            const isSelected = selectedPlan === key;
            const isBadged = !!plan.badge;
            const BRAND = '#c89585';
            const BRAND_LIGHT = '#fef5f1';
            const BRAND_SHADOW = 'rgba(200,149,133,0.18)';
            return (
              <div
                key={key}
                onClick={() => !isSelected && setSelectedPlan(key)}
                style={{
                  position: 'relative',
                  border: isSelected ? `2px solid ${BRAND}` : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: isBadged ? '36px 20px 24px' : '24px 20px',
                  background: isSelected ? BRAND_LIGHT : '#fff',
                  cursor: isSelected ? 'default' : 'pointer',
                  boxShadow: isSelected
                    ? `0 4px 16px ${BRAND_SHADOW}`
                    : '0 2px 8px rgba(0,0,0,0.06)',
                  transition: 'all 0.2s',
                  textAlign: 'center',
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-13px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: BRAND,
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: '700',
                      padding: '3px 14px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {plan.badge === 'Terbaik' ? '🌟 Terbaik' : plan.badge}
                  </div>
                )}

                {/* Plan label */}
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#1a1a1a',
                    marginBottom: '12px',
                  }}
                >
                  {plan.label}
                </div>

                {/* Strikethrough original price */}
                <div
                  style={{
                    fontSize: '14px',
                    color: '#ef4444',
                    textDecoration: 'line-through',
                    marginBottom: '4px',
                    fontWeight: '500',
                  }}
                >
                  Rp {plan.originalAmount.toLocaleString('id-ID')}
                </div>

                {/* Real price */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'center',
                    gap: '4px',
                    marginBottom: '16px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '30px',
                      fontWeight: '800',
                      color: isSelected ? BRAND : '#1a1a1a',
                      lineHeight: '1',
                    }}
                  >
                    Rp {plan.amount.toLocaleString('id-ID')}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: '#888',
                      fontWeight: '400',
                    }}
                  >
                    {plan.durationLabel}
                  </span>
                </div>

                {/* Features */}
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: '0 0 16px',
                    fontSize: '13px',
                    color: '#555',
                    textAlign: 'left',
                  }}
                >
                  <li style={{ marginBottom: '6px' }}>✓ Akses semua frame premium</li>
                  <li style={{ marginBottom: '6px' }}>✓ Semua koleksi Fremio</li>
                  <li style={{ marginBottom: '6px' }}>✓ Akses ke frame terbaru</li>
                </ul>

                {/* Action button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSelected) {
                      handleBuyPackage();
                    } else {
                      setSelectedPlan(key);
                    }
                  }}
                  disabled={isSelected && loading}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSelected ? BRAND : '#f3f4f6',
                    color: isSelected ? '#fff' : '#666',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: isSelected && loading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s, transform 0.1s',
                    boxShadow: isSelected ? `0 4px 12px ${BRAND_SHADOW}` : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (isSelected && !loading) e.currentTarget.style.background = '#b87d6a';
                  }}
                  onMouseLeave={(e) => {
                    if (isSelected) e.currentTarget.style.background = BRAND;
                  }}
                >
                  {isSelected
                    ? loading ? 'Memproses...' : 'Bayar Sekarang →'
                    : 'Pilih'}
                </button>
              </div>
            );
          })}
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: '13px',
            color: '#aaa',
          }}
        >
          🔒 Pembayaran aman via Midtrans · Semua metode tersedia
        </p>

        {/* Status notes */}
        {access && (
          <div
            style={{
              maxWidth: '800px',
              margin: '0 auto 10px',
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <span style={{ fontWeight: '700', color: '#15803d' }}>✅ Keanggotaan aktif</span>
              <span style={{ fontSize: '13px', color: '#555', marginLeft: '8px' }}>
                Berakhir{' '}
                {new Date(access.accessEnd).toLocaleDateString('id-ID', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/frames')}
              style={{
                background: '#c89585', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '8px 18px',
                fontWeight: '700', fontSize: '13px', cursor: 'pointer',
              }}
            >
              Gunakan Frame Premium →
            </button>
          </div>
        )}
        {!currentUser && (
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#999', marginTop: '4px' }}>
            Login diperlukan untuk melanjutkan pembelian.
          </p>
        )}
        {currentUser && !access && pendingPayment && (
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#b45309', marginTop: '4px' }}>
            ⏳ Ada transaksi yang belum selesai. Lanjutkan pembayaran atau pilih paket lain — paket lama akan otomatis dibatalkan.
          </p>
        )}
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
            Tersedia 3 pilihan: <strong>3 hari</strong> (Rp 5.000),{' '}
            <strong>1 minggu / 7 hari</strong> (Rp 7.000), dan{' '}
            <strong>1 bulan / 30 hari</strong> (Rp 10.000). Pilih sesuai
            kebutuhanmu sebelum melanjutkan pembayaran.
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

