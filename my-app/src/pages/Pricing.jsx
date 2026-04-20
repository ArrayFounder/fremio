import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import paymentService from "../services/paymentService";
import shareSubscriptionService from "../services/shareSubscriptionService";
import membershipPlusLinkPage from "../assets/membership_plus_link_page.png";
import membershipPlusMockup from "../assets/membership_plus_mockup.png";
import membershipPlusTakephoto from "../assets/membership_plus_takephoto.png";
import membershipPlusQrcode from "../assets/membership_plus_qrcode.png";
import instagramLogo from "../assets/instagram.png";
import unifiedFrameService from "../services/unifiedFrameService";
import { useTranslation } from "react-i18next";
import "./Pricing.css";

// ── Frame size helpers ────────────────────────────────────────────────────────
const _normRatio = (v) => String(v || "").toLowerCase().trim();
const _getWH = (frame) => {
  const l = frame?.layout, cs = frame?.canvas_size || frame?.canvasSize;
  const w = l?.canvasWidth ?? l?.canvas_width ?? frame?.canvasWidth ?? frame?.canvas_width ?? cs?.width ?? cs?.w;
  const h = l?.canvasHeight ?? l?.canvas_height ?? frame?.canvasHeight ?? frame?.canvas_height ?? cs?.height ?? cs?.h;
  return { w: Number.isFinite(Number(w)) ? Number(w) : null, h: Number.isFinite(Number(h)) ? Number(h) : null };
};
const _is4R = (frame) => {
  const r = _normRatio(frame?.layout?.aspectRatio ?? frame?.layout?.aspect_ratio ?? frame?.aspectRatio ?? frame?.aspect_ratio);
  if (["photostrip","1200:1800","2:3","4:6","4r"].includes(r)) return true;
  if (r.includes(":")) { const [a,b] = r.split(":").map(v => Number(v.trim())); if (a===1200&&b===1800) return true; }
  const {w,h} = _getWH(frame); return w===1200 && h===1800;
};
const _is2R = (frame) => {
  const r = _normRatio(frame?.layout?.aspectRatio ?? frame?.layout?.aspect_ratio ?? frame?.aspectRatio ?? frame?.aspect_ratio);
  if (["2r","1:3","600:1800"].includes(r)) return true;
  const {w,h} = _getWH(frame); return w===600 && h===1800;
};
const _frameSize = (frame) => _is2R(frame) ? "2r" : _is4R(frame) ? "4r" : "story";
// ─────────────────────────────────────────────────────────────────────────────

const Pricing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState(null);
  const [canPurchase, setCanPurchase] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // ── Share Plus (Membership Plus) ──────────────────────────────────────────
  const SHARE_PLUS_PLANS = {
    starter: { label: "Starter", grossAmount: 35000, originalAmount: 45000, dailyQuota: 50,  tag: "Brand / event kecil" },
    pro:     { label: "Pro",     grossAmount: 45000, originalAmount: 65000, dailyQuota: 100, tag: "Brand / event menengah" },
    max:     { label: "Max",     grossAmount: 65000, originalAmount: 100000, dailyQuota: 200, tag: "Brand besar" },
  };
  const [sharePlusStatus, setSharePlusStatus] = useState(null);
  const [selectedSharePlusTier, setSelectedSharePlusTier] = useState(null);
  const [loadingSharePlus, setLoadingSharePlus] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

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
    "Fremio Series",
    "Ramadan Series",
    "Holiday Fremio Series",
    "Christmas Fremio Series",
    "Year-End Recap Fremio Series",
    "Aesthetic Scrapbook & Retro",
    "Cute Characters",
    "Self-love",
    "Romance",
    "Music",
    "Wedding",
    "Birthday",
    "Graduation",
    "Event",
    "Custom",
  ];
  const [activeSizeTab, setActiveSizeTab] = useState("story");
  const [activeCategoryTab, setActiveCategoryTab] = useState(tabs[0]);
  const [premiumFramesBySizeCategory, setPremiumFramesBySizeCategory] = useState({});
  const [loadingPreviewFrames, setLoadingPreviewFrames] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const isInternational = i18n.language === 'en';

  const BRAND = '#c89585';
  const BRAND_LIGHT = '#fef5f1';
  const BRAND_SHADOW = 'rgba(200,149,133,0.18)';

  const PLANS = {
        '1day':  { label: '1 Hari',   amount: 5000,  originalAmount: null, durationLabel: '/hari',   badge: null },
        '7days': { label: '1 Minggu', amount: 15000, originalAmount: null, durationLabel: '/minggu', badge: null },
        '30days': { label: '1 Bulan', amount: 25000, originalAmount: 45000, durationLabel: '/bulan', badge: null },
      };

  useEffect(() => {
    // Set page title
    document.title = "Membership — Fremio";

    // Pricing page should be viewable without login (Midtrans verification / marketing)
    // Only purchase flow requires auth.
    if (currentUser) {
      loadAccessInfo();
      loadSharePlusStatus();
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

      const allowed = new Set(tabs);
      // grouped: { story: { category: frames[] }, '4r': {...}, '2r': {...} }
      const grouped = {};

      for (const frame of (frames || [])) {
        const rawCategories = Array.isArray(frame?.categories)
          ? frame.categories
          : String(frame?.category || "").split(",").map((c) => c.trim()).filter(Boolean);

        const match = rawCategories.find((c) => allowed.has(String(c)));
        if (!match) continue;

        const size = _frameSize(frame);
        if (!grouped[size]) grouped[size] = {};
        if (!grouped[size][match]) grouped[size][match] = [];
        grouped[size][match].push(frame);
      }

      // Sort within each size/category by displayOrder
      for (const size of Object.keys(grouped)) {
        for (const cat of Object.keys(grouped[size])) {
          grouped[size][cat].sort(
            (a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
          );
        }
      }

      setPremiumFramesBySizeCategory(grouped);
    } catch (error) {
      console.error("Load preview frames error:", error);
      setPremiumFramesBySizeCategory({});
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
        alert(t("pricing.alert_access_granted"));
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

  const loadSharePlusStatus = async () => {
    try {
      const res = await shareSubscriptionService.getStatus();
      if (res?.success) setSharePlusStatus(res);
    } catch {
      // non-fatal
    }
  };

  const handleBuySharePlus = async (tier) => {
    if (!currentUser) {
      const ok = confirm("Login atau daftar untuk berlangganan Membership Plus.");
      navigate(ok ? "/register?redirect=/pricing" : "/login?redirect=/pricing");
      return;
    }
    try {
      setLoadingSharePlus(true);
      await paymentService.loadSnapScript();
      const response = await shareSubscriptionService.createSubscription({
        tier,
        name: currentUser.displayName || "Fremio User",
        phone: currentUser.phoneNumber || "",
      });
      const data = response?.data || response;
      if (!data?.token) throw new Error("Token pembayaran tidak diterima");
      paymentService.openSnapPayment(data.token, {
        onSuccess: () => { loadSharePlusStatus(); setLoadingSharePlus(false); },
        onPending: () => { loadSharePlusStatus(); setLoadingSharePlus(false); },
        onError: () => { alert("Pembayaran gagal. Silakan coba lagi."); setLoadingSharePlus(false); },
        onClose: () => setLoadingSharePlus(false),
      });
    } catch (err) {
      alert(`Gagal membuat pembayaran Membership Plus:\n${err?.message || err}`);
      setLoadingSharePlus(false);
    }
  };

  const handleBuyPackage = async () => {
    console.log("🛒 Buy package clicked");
    console.log("👤 Current user:", currentUser);
    console.log("💳 Can purchase:", canPurchase);
    console.log("🔑 Has access:", access);

    if (!currentUser) {
      console.warn("⚠️ User not logged in, redirecting to register");

      const userChoice = confirm(t("pricing.alert_login_required_msg"));

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
      alert(t("pricing.alert_already_has_access"));
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
                alert(t("pricing.alert_resume_failed"));
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

  const tabFrames = premiumFramesBySizeCategory[activeSizeTab]?.[activeCategoryTab] || [];

  const pendingCanResume =
    !!pendingPayment &&
    !pendingPayment.unavailable &&
    !!(pendingPayment.snapToken || pendingPayment.redirectUrl);

  const pendingCanManage = !!pendingPayment && !pendingPayment.unavailable;

  const previewQuoteByCategory = {
    "Fremio Series": "“Koleksi khas dari Fremio”",
    "Holiday Fremio Series": "“Holiday Frames untuk temani liburan”",
    "Christmas Fremio Series": "“Semangat Natal yang meriah”",
    "Year-End Recap Fremio Series": "“Tutup tahun dengan kenangan indah”",
    "Aesthetic Scrapbook & Retro": "“Aesthetic & Retro untuk cerita kamu”",
    "Cute Characters": "“Cute Characters untuk vibes gemas”",
    "Self-love": "“Self-love untuk momen yang lebih bermakna”",
    Romance: "“Romance untuk momen spesial”",
    "Ramadan Series": "“Ramadan Series untuk momen penuh berkah”",
    Music: "“Frame spesial bertema musik”",
    Wedding: "“Abadikan momen pernikahan yang istimewa”",
    Birthday: "“Rayakan hari spesialmu dengan gaya”",
    Graduation: "“Momen wisuda yang tak terlupakan”",
    Event: "“Frame untuk setiap acara spesial”",
    Custom: "“Frame unik sesuai keinginanmu”",
  };

  const previewQuote =
    previewQuoteByCategory[activeCategoryTab] || "“Koleksi frames untuk member Fremio”";

  // Categories available for the active size (only those with >=1 frame)
  const currentSizeData = premiumFramesBySizeCategory[activeSizeTab] || {};
  const availableCategories = tabs.filter(
    (cat) => (currentSizeData[cat] || []).length > 0
  );

  const handleSizeChange = (size) => {
    setActiveSizeTab(size);
    const sizeData = premiumFramesBySizeCategory[size] || {};
    const available = tabs.filter((cat) => (sizeData[cat] || []).length > 0);
    if (!sizeData[activeCategoryTab] || sizeData[activeCategoryTab].length === 0) {
      setActiveCategoryTab(available[0] || tabs[0]);
    }
  };

  const membershipCategoryCounts = tabs.map((category) => ({
    category,
    count: Object.values(premiumFramesBySizeCategory).reduce(
      (sum, sizeData) => sum + (sizeData[category] || []).length,
      0
    ),
  }));

  const membershipTotalFrames = membershipCategoryCounts.reduce(
    (sum, entry) => sum + (entry.count || 0),
    0
  );

  return (
    <div className="pricing-container">
      {/* PRICING PLANS SECTION */}
      <div
        className="pricing-plans-section"
        style={{
          padding: '8px 20px 16px',
          background: '#fff',
          marginBottom: '10px',
        }}
      >
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
                  {t('pricing.promo_text')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {[[t('pricing.promo_hours'), h], [t('pricing.promo_minutes'), m], [t('pricing.promo_seconds'), s]].map(([label, val]) => (
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
                    {label !== t('pricing.promo_seconds') && (
                      <span style={{ color: '#fff', fontSize: '22px', fontWeight: '700', opacity: 0.8, marginBottom: '12px' }}>:</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
                {t('pricing.promo_footer')}
              </div>
            </div>
          );
        })()}

        {/* ── MEMBERSHIP WRAPPER (cards + frame preview + share section) ── */}
        <div className="pricing-membership-shell" style={{
          background: 'linear-gradient(135deg, #fdf8f6 0%, #fff 100%)',
          border: '1px solid #ecdeda',
          borderRadius: '20px',
          padding: '32px 24px 24px',
          maxWidth: '900px',
          margin: '0 auto 36px',
        }}>

        {/* ── Section title: Membership ── */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b', margin: '0', lineHeight: 1.15 }}>
            Membership
          </h1>
        </div>

        {/* Unified Plan Cards Grid: Free | 25k | 35k | 45k | 65k */}
        {(() => {
          const amountToPlanKey = { 5000: '1day', 15000: '7days', 19000: '30days', 10000: '30days', 25000: '30days' };
          const frameActivePlanKey = access
            ? (amountToPlanKey[access.packageAmount] || '30days')
            : null;
          const sharePlusTierActive = sharePlusStatus?.hasSubscription
            ? sharePlusStatus?.subscription?.tier
            : null;
          const isFreeActive = !frameActivePlanKey && !sharePlusTierActive;

          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
              columnGap: '14px',
              rowGap: '28px',
              maxWidth: '860px',
              margin: '0 auto 28px',
            }}>
              {/* FREE CARD */}
              <div style={{
                position: 'relative',
                border: isFreeActive ? '2px solid #94a3b8' : '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: isFreeActive ? '36px 16px 20px' : '36px 16px 20px',
                background: isFreeActive ? '#f8fafc' : '#fff',
                boxShadow: isFreeActive ? '0 4px 16px rgba(148,163,184,0.2)' : '0 2px 8px rgba(0,0,0,0.06)',
                textAlign: 'center',
                display: 'flex', flexDirection: 'column',
              }}>
                {isFreeActive && (
                  <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: '#64748b', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                    ✓ {t('pricing.badge_active_plan')}
                  </div>
                )}
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '10px' }}>Gratis</div>
                <div style={{ height: '18px', marginBottom: '3px' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '20px', fontWeight: '800', color: '#64748b' }}>Rp 0</span>
                  <span style={{ fontSize: '11px', color: '#888', fontWeight: '400' }}>/ selamanya</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', fontSize: '12px', color: '#555', textAlign: 'left', flexGrow: 1 }}>
                  <li style={{ marginBottom: '4px' }}>✓ Akses basic frames</li>
                  <li style={{ marginBottom: '4px' }}>✓ Akses basic templates</li>
                  <li style={{ marginBottom: '4px' }}>✓ Simpan hingga 5 draft</li>
                </ul>
                <button type="button" disabled style={{ width: '100%', padding: '9px 0', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#94a3b8', fontSize: '13px', fontWeight: '700', cursor: 'default', marginTop: 'auto' }}>
                  {isFreeActive ? t('pricing.badge_active_plan') : 'Gratis'}
                </button>
              </div>

              {/* LITE CARD — 5K/hari */}
              {(() => {
                const isPlanActive = frameActivePlanKey === '1day' && !sharePlusTierActive;
                const isSelected = selectedPlan === '1day';
                return (
                  <div
                    onClick={() => { if (!isPlanActive) { setSelectedPlan('1day'); setSelectedSharePlusTier(null); } }}
                    style={{
                      position: 'relative',
                      border: isPlanActive ? '2px solid #16a34a' : isSelected ? `2px solid ${BRAND}` : '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '36px 16px 20px',
                      background: isPlanActive ? '#f0fdf4' : isSelected ? BRAND_LIGHT : '#fff',
                      cursor: isPlanActive ? 'default' : 'pointer',
                      boxShadow: isPlanActive ? '0 4px 16px rgba(22,163,74,0.15)' : isSelected ? `0 4px 16px ${BRAND_SHADOW}` : '0 2px 8px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s', textAlign: 'center',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {isPlanActive ? (
                      <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        ✓ {t('pricing.badge_active_plan')}
                      </div>
                    ) : (
                      <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: '#94a3b8', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        Coba Dulu
                      </div>
                    )}
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '10px' }}>Lite</div>
                    <div style={{ height: '18px', marginBottom: '3px' }} />
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px', marginBottom: '10px', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '19px', fontWeight: '800', color: isPlanActive ? '#16a34a' : isSelected ? BRAND : '#1a1a1a', lineHeight: '1', whiteSpace: 'nowrap' }}>Rp 5.000</span>
                      <span style={{ fontSize: '11px', color: '#888', fontWeight: '400' }}>/hari</span>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', fontSize: '12px', color: '#555', textAlign: 'left', flexGrow: 1 }}>
                      <li style={{ marginBottom: '4px' }}>✓ Akses basic &amp; premium frames</li>
                      <li style={{ marginBottom: '4px' }}>✓ Akses basic &amp; premium templates</li>
                      <li style={{ marginBottom: '4px' }}>✓ Save draft sepuasnya</li>
                      <li style={{ marginBottom: '4px' }}>✓ Lebih lengkap</li>
                    </ul>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPlanActive) return;
                        if (!isSelected) { setSelectedPlan('1day'); setSelectedSharePlusTier(null); return; }
                        handleBuyPackage();
                      }}
                      disabled={(isSelected && loading) || isPlanActive}
                      style={{ width: '100%', padding: '9px 0', borderRadius: '8px', border: 'none', background: isPlanActive ? '#dcfce7' : isSelected ? BRAND : '#f3f4f6', color: isPlanActive ? '#16a34a' : isSelected ? '#fff' : '#666', fontSize: '13px', fontWeight: '700', cursor: isPlanActive ? 'default' : 'pointer', transition: 'background 0.2s', boxShadow: isSelected && !isPlanActive ? `0 4px 12px ${BRAND_SHADOW}` : 'none', marginTop: 'auto' }}
                    >
                      {isPlanActive ? t('pricing.badge_active_plan') : isSelected ? (loading ? t('pricing.btn_processing') : t('pricing.btn_pay_now')) : t('pricing.btn_select')}
                    </button>
                  </div>
                );
              })()}

              {/* MOON CARD — 15K/minggu */}
              {(() => {
                const isPlanActive = frameActivePlanKey === '7days' && !sharePlusTierActive;
                const isSelected = selectedPlan === '7days';
                return (
                  <div
                    onClick={() => { if (!isPlanActive) { setSelectedPlan('7days'); setSelectedSharePlusTier(null); } }}
                    style={{
                      position: 'relative',
                      border: isPlanActive ? '2px solid #16a34a' : isSelected ? `2px solid ${BRAND}` : '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '36px 16px 20px',
                      background: isPlanActive ? '#f0fdf4' : isSelected ? BRAND_LIGHT : '#fff',
                      cursor: isPlanActive ? 'default' : 'pointer',
                      boxShadow: isPlanActive ? '0 4px 16px rgba(22,163,74,0.15)' : isSelected ? `0 4px 16px ${BRAND_SHADOW}` : '0 2px 8px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s', textAlign: 'center',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {isPlanActive ? (
                      <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        ✓ {t('pricing.badge_active_plan')}
                      </div>
                    ) : (
                      <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: '#7c6f9f', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        Fleksibel
                      </div>
                    )}
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '10px' }}>Moon</div>
                    <div style={{ height: '18px', marginBottom: '3px' }} />
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px', marginBottom: '10px', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '19px', fontWeight: '800', color: isPlanActive ? '#16a34a' : isSelected ? BRAND : '#1a1a1a', lineHeight: '1', whiteSpace: 'nowrap' }}>Rp 15.000</span>
                      <span style={{ fontSize: '11px', color: '#888', fontWeight: '400' }}>/minggu</span>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', fontSize: '12px', color: '#555', textAlign: 'left', flexGrow: 1 }}>
                      <li style={{ marginBottom: '4px' }}>✓ Akses basic &amp; premium frames</li>
                      <li style={{ marginBottom: '4px' }}>✓ Akses basic &amp; premium templates</li>
                      <li style={{ marginBottom: '4px' }}>✓ Save draft sepuasnya</li>
                      <li style={{ marginBottom: '4px' }}>✓ Lebih lengkap</li>
                    </ul>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPlanActive) return;
                        if (!isSelected) { setSelectedPlan('7days'); setSelectedSharePlusTier(null); return; }
                        handleBuyPackage();
                      }}
                      disabled={(isSelected && loading) || isPlanActive}
                      style={{ width: '100%', padding: '9px 0', borderRadius: '8px', border: 'none', background: isPlanActive ? '#dcfce7' : isSelected ? BRAND : '#f3f4f6', color: isPlanActive ? '#16a34a' : isSelected ? '#fff' : '#666', fontSize: '13px', fontWeight: '700', cursor: isPlanActive ? 'default' : 'pointer', transition: 'background 0.2s', boxShadow: isSelected && !isPlanActive ? `0 4px 12px ${BRAND_SHADOW}` : 'none', marginTop: 'auto' }}
                    >
                      {isPlanActive ? t('pricing.badge_active_plan') : isSelected ? (loading ? t('pricing.btn_processing') : t('pricing.btn_pay_now')) : t('pricing.btn_select')}
                    </button>
                  </div>
                );
              })()}

              {/* 25K MEMBERSHIP CARD */}
              {(() => {
                const isPlanActive = frameActivePlanKey === '30days' && !sharePlusTierActive;
                const isSelected = selectedPlan === '30days';
                return (
                  <div
                    onClick={() => { if (!isPlanActive) { setSelectedPlan('30days'); setSelectedSharePlusTier(null); } }}
                    style={{
                      position: 'relative',
                      border: isPlanActive ? '2px solid #16a34a' : isSelected ? `2px solid ${BRAND}` : '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '52px 16px 20px',
                      background: isPlanActive ? '#f0fdf4' : isSelected ? BRAND_LIGHT : '#fff',
                      cursor: isPlanActive ? 'default' : 'pointer',
                      boxShadow: isPlanActive ? '0 4px 16px rgba(22,163,74,0.15)' : isSelected ? `0 4px 16px ${BRAND_SHADOW}` : '0 2px 8px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s', textAlign: 'center',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {isPlanActive ? (
                      <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        ✓ {t('pricing.badge_active_plan')}
                      </div>
                    ) : (
                      <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: BRAND, color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        ★ Paling Populer
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)', background: '#3b82f6', color: '#fff', fontSize: '11px', fontWeight: '600', padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                      Bebas, hemat &amp; lengkap
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>Stars</div>
                    <div style={{ fontSize: '13px', color: '#ef4444', textDecoration: 'line-through', marginBottom: '3px', fontWeight: '500' }}>Rp 45.000</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px', marginBottom: '10px', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '19px', fontWeight: '800', color: isPlanActive ? '#16a34a' : isSelected ? BRAND : '#1a1a1a', lineHeight: '1', whiteSpace: 'nowrap' }}>Rp 25.000</span>
                      <span style={{ fontSize: '11px', color: '#888', fontWeight: '400' }}>/bulan</span>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', fontSize: '12px', color: '#555', textAlign: 'left', flexGrow: 1 }}>
                      <li style={{ marginBottom: '4px' }}>✓ Akses basic &amp; premium frames</li>
                      <li style={{ marginBottom: '4px' }}>✓ Akses basic &amp; premium templates</li>
                      <li style={{ marginBottom: '4px' }}>✓ Save draft sepuasnya</li>
                      <li style={{ marginBottom: '4px' }}>✓ Lebih hemat, lengkap dan bebas</li>
                    </ul>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPlanActive) return;
                        if (!isSelected) { setSelectedPlan('30days'); setSelectedSharePlusTier(null); return; }
                        handleBuyPackage();
                      }}
                      disabled={(isSelected && loading) || isPlanActive}
                      style={{ width: '100%', padding: '9px 0', borderRadius: '8px', border: 'none', background: isPlanActive ? '#dcfce7' : isSelected ? BRAND : '#f3f4f6', color: isPlanActive ? '#16a34a' : isSelected ? '#fff' : '#666', fontSize: '13px', fontWeight: '700', cursor: isPlanActive ? 'default' : 'pointer', transition: 'background 0.2s', boxShadow: isSelected && !isPlanActive ? `0 4px 12px ${BRAND_SHADOW}` : 'none', marginTop: 'auto' }}
                    >
                      {isPlanActive ? t('pricing.badge_active_plan') : isSelected ? (loading ? t('pricing.btn_processing') : t('pricing.btn_pay_now')) : t('pricing.btn_select')}
                    </button>
                  </div>
                );
              })()}

            </div>
          );
        })()}

        {/* ── Frame Preview (compact) ── */}
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(236,222,218,0.6)', paddingTop: '20px' }}>
          {/* Title */}
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' }}>Preview Frame</h2>
          {/* Size Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'inline-flex', background: '#fef5f1', borderRadius: '999px', padding: '4px', gap: '3px', boxShadow: 'inset 0 1px 4px rgba(200,149,133,0.15)' }}>
              {[{ key: 'story', label: 'Story' }, { key: '4r', label: '4R' }, { key: '2r', label: '2R' }].map(({ key, label }) => (
                <button key={key} type="button" onClick={() => handleSizeChange(key)} style={{ padding: '6px 14px', borderRadius: '999px', border: 'none', fontWeight: '700', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', background: activeSizeTab === key ? 'linear-gradient(135deg, #e0b7a9, #c89585)' : 'transparent', color: activeSizeTab === key ? '#fff' : '#7a5248', boxShadow: activeSizeTab === key ? '0 2px 8px rgba(200,149,133,0.4)' : 'none' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Category Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
            {loadingPreviewFrames ? (
              <span style={{ fontSize: '12px', color: '#bbb' }}>{t('pricing.loading_category')}</span>
            ) : availableCategories.length === 0 ? (
              <span style={{ fontSize: '12px', color: '#bbb' }}>{t('pricing.no_frames_size')}</span>
            ) : availableCategories.map((cat) => (
              <button key={cat} type="button" onClick={() => setActiveCategoryTab(cat)} style={{ padding: '4px 12px', borderRadius: '999px', border: activeCategoryTab === cat ? 'none' : '1px solid rgba(200,149,133,0.45)', fontWeight: activeCategoryTab === cat ? '700' : '500', fontSize: '11px', cursor: 'pointer', transition: 'all 0.18s', background: activeCategoryTab === cat ? '#c89585' : 'transparent', color: activeCategoryTab === cat ? '#fff' : '#7a5248' }}>
                {cat}
              </button>
            ))}
          </div>
          {/* Grid */}
          <div className="preview-panel">
            {loadingPreviewFrames ? (
              <div className="preview-loading">{t('pricing.loading_preview')}</div>
            ) : tabFrames.length === 0 ? (
              <div className="preview-empty">{t('pricing.no_frames_category')}</div>
            ) : (
              <div className="preview-grid">
                {tabFrames.slice(0, 12).map((frame, idx) => (
                  <div key={frame.id || idx} className="preview-item">
                    <div className="preview-thumb" style={{ aspectRatio: activeSizeTab === '4r' ? '2 / 3' : activeSizeTab === '2r' ? '1 / 3' : '9 / 16' }}>
                      <img src={frame.thumbnailUrl || frame.imageUrl || frame.imagePath} alt={frame.name || `Frame ${idx + 1}`} onError={(e) => (e.currentTarget.style.display = 'none')} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isInternational && (
          <div style={{
            maxWidth: '800px',
            margin: '12px auto 0',
            padding: '12px 16px',
            background: '#fff8f5',
            border: '1px solid #e0b7a9',
            borderRadius: '10px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#7a5248',
          }}>
            🇮🇩 Payment is currently only available for users in Indonesia (via Midtrans). International billing coming soon!
          </div>
        )}

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
              <span style={{ fontWeight: '700', color: '#15803d' }}>{t('pricing.access_active')}</span>
              <span style={{ fontSize: '13px', color: '#555', marginLeft: '8px' }}>
                {t('pricing.access_expires')}{' '}
                {new Date(access.accessEnd).toLocaleDateString(i18n.language === 'id' ? 'id-ID' : 'en-US', {
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
              {t('pricing.btn_use_frames')}
            </button>
          </div>
        )}
        {!currentUser && (
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#999', marginTop: '4px' }}>
            {t('pricing.login_required')}
          </p>
        )}
        {currentUser && !access && pendingPayment && (
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#b45309', marginTop: '4px' }}>
            {t('pricing.pending_payment_notice')}
          </p>
        )}
      </div>

      </div>



      {access && (
        <div className="current-access">
          <div className="access-card">
            <div className="access-header">
              <span className="access-badge active">{t('pricing.member_active_badge')}</span>
              <span className="days-remaining">
                {t('pricing.days_remaining', { count: access.daysRemaining })}
              </span>
            </div>
            <div className="access-info">
              <p>
                <strong>{t('pricing.access_frames_label')}</strong> {access.totalFrames} frames
              </p>
              <p>
                <strong>{t('pricing.access_status_label')}</strong> {t('pricing.member_status')}
              </p>
              <p>
                <strong>{t('pricing.access_ends_label')}</strong>{" "}
                {new Date(access.accessEnd).toLocaleDateString(i18n.language === 'id' ? 'id-ID' : 'en-US', {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      )}



      <div className="faq-section">
        <h3>{t('pricing.faq_title')}</h3>
        <div className="faq-item">
          <h4>{t('pricing.faq_1_q')}</h4>
          <p dangerouslySetInnerHTML={{ __html: t('pricing.faq_1_a') }} />
        </div>
        <div className="faq-item">
          <h4>{t('pricing.faq_2_q')}</h4>
          <p>{t('pricing.faq_2_a')}</p>
        </div>
        <div className="faq-item">
          <h4>{t('pricing.faq_3_q')}</h4>
          <p>{t('pricing.faq_3_a')}</p>
        </div>
        <div className="faq-item">
          <h4>{t('pricing.faq_4_q')}</h4>
          <p>{t('pricing.faq_4_a')}</p>
        </div>
        <div className="faq-item">
          <h4>{t('pricing.faq_5_q')}</h4>
          <p dangerouslySetInnerHTML={{ __html: t('pricing.faq_5_a') }} />
        </div>
      </div>
    </div>
  );
};

export default Pricing;

