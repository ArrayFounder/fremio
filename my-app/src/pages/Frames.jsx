import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import frameProvider from "../utils/frameProvider.js";
import safeStorage from "../utils/safeStorage.js";
import unifiedFrameService from "../services/unifiedFrameService";
import paymentService from "../services/paymentService";
import { trackFrameView } from "../services/analyticsService";
import { useSEO } from "../hooks/useSEO.js";

const DEBUG_FRAMES =
  import.meta.env.DEV || String(import.meta.env.VITE_DEBUG_FRAMES) === "true";

// Helper to construct full URL for frame images
const getFrameImageUrl = (frame) => {
  const candidates = [
    frame.imagePath,
    frame.imageUrl,
    frame.thumbnailUrl,
    frame.thumbnailPath,
  ].filter(Boolean);

  if (candidates.length === 0) return null;

  // Prefer already-absolute URLs first
  const absolute = candidates.find(
    (v) =>
      typeof v === "string" &&
      (v.startsWith("http://") || v.startsWith("https://"))
  );
  if (absolute) return absolute;

  // Base URL for relative paths/filenames
  const backendBase = import.meta.env.DEV
    ? "https://localhost:5050"
    : (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

  const raw = String(candidates[0] || "").trim();
  if (!raw) return null;

  // If we got a full path without a leading slash
  if (raw.startsWith("uploads/")) {
    return `${backendBase}/${raw}`;
  }

  // If we got a normal relative path
  if (raw.startsWith("/")) {
    return `${backendBase}${raw}`;
  }

  // If backend accidentally returns only a filename (e.g. "<uuid>.webp")
  // assume it lives under /uploads/frames/
  const looksLikeFile = /\.(png|jpe?g|webp|gif|svg)$/i.test(raw);
  if (looksLikeFile) {
    return `${backendBase}/uploads/frames/${raw}`;
  }

  // Last resort: treat as path segment
  return `${backendBase}/${raw}`;
};

const normalizeRatio = (value) => String(value || "").toLowerCase().trim();

const getCanvasSize = (frame) => {
  const layout = frame?.layout;
  const canvasSize = frame?.canvas_size || frame?.canvasSize;

  const width =
    layout?.canvasWidth ??
    layout?.canvas_width ??
    frame?.canvasWidth ??
    frame?.canvas_width ??
    canvasSize?.width ??
    canvasSize?.w;

  const height =
    layout?.canvasHeight ??
    layout?.canvas_height ??
    frame?.canvasHeight ??
    frame?.canvas_height ??
    canvasSize?.height ??
    canvasSize?.h;

  const widthNum = width != null ? Number(width) : null;
  const heightNum = height != null ? Number(height) : null;

  return {
    width: Number.isFinite(widthNum) ? widthNum : null,
    height: Number.isFinite(heightNum) ? heightNum : null,
  };
};

const isPhotostripCanvas = (frame) => {
  const ratioRaw =
    frame?.layout?.aspectRatio ??
    frame?.layout?.aspect_ratio ??
    frame?.aspectRatio ??
    frame?.aspect_ratio;

  const ratio = normalizeRatio(ratioRaw);
  // Photostrip / 4R commonly represented as 2:3 (4x6), sometimes as 1200:1800 or the literal "photostrip".
  if (ratio === "photostrip" || ratio === "1200:1800" || ratio === "2:3" || ratio === "4:6" || ratio === "4r") {
    return true;
  }

  // Sometimes aspect ratio may be stored as "1200:1800" with spaces
  if (ratio.includes(":")) {
    const [wStr, hStr] = ratio.split(":").map((v) => v.trim());
    const w = Number(wStr);
    const h = Number(hStr);
    if (Number.isFinite(w) && Number.isFinite(h) && w === 1200 && h === 1800) {
      return true;
    }
  }

  const { width, height } = getCanvasSize(frame);
  return width === 1200 && height === 1800;
};

const is2RCanvas = (frame) => {
  const ratioRaw =
    frame?.layout?.aspectRatio ??
    frame?.layout?.aspect_ratio ??
    frame?.aspectRatio ??
    frame?.aspect_ratio;

  const ratio = normalizeRatio(ratioRaw);
  if (ratio === "2r" || ratio === "1:3" || ratio === "600:1800") return true;

  const { width, height } = getCanvasSize(frame);
  return width === 600 && height === 1800;
};

// Mini canvas preview for designer-approved frames with no thumbnail image
function LayoutPreview({ frame }) {
  const canvasRef = useRef(null);
  const elements = frame?.layout?.elements || [];
  const cW = frame?.canvasWidth || 1080;
  const cH = frame?.canvasHeight || 1920;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const sX = w / cW;
    const sY = h / cH;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = frame?.canvasBackground || "#ffffff";
    ctx.fillRect(0, 0, w, h);
    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const draw = (idx) => {
      if (idx >= sorted.length) return;
      const el = sorted[idx];
      const ex = (el.x || 0) * sX, ey = (el.y || 0) * sY;
      const ew = (el.width || 0) * sX, eh = (el.height || 0) * sY;
      if ((el.type === "background-photo" || el.type === "upload") && el.data?.image?.length > 10) {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, ex, ey, ew, eh); draw(idx + 1); };
        img.onerror = () => draw(idx + 1);
        img.src = el.data.image;
        return;
      } else if (el.type === "photo") {
        ctx.fillStyle = "rgba(148,163,184,0.4)";
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeStyle = "rgba(100,116,139,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(ex, ey, ew, eh);
        ctx.fillStyle = "rgba(100,116,139,0.8)";
        ctx.font = `${Math.max(7, ew * 0.12)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("FOTO", ex + ew / 2, ey + eh / 2);
      } else if (el.type === "shape") {
        ctx.fillStyle = el.data?.fill || el.data?.color || "#cccccc";
        ctx.fillRect(ex, ey, ew, eh);
      } else if (el.type === "text") {
        ctx.fillStyle = el.data?.color || "#000";
        ctx.font = `${Math.max(6, (el.data?.fontSize || 24) * sY)}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(el.data?.text || "", ex, ey);
      }
      draw(idx + 1);
    };
    draw(0);
  }, [elements, cW, cH, frame?.canvasBackground]);

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={Math.round(120 * (cH / cW))}
      style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "4px" }}
    />
  );
}

// FrameCard component with expandable description
function FrameCard({
  frame,
  onSelect,
  imageError,
  onImageError,
  getImageUrl,
  isLocked,
}) {
  const [expanded, setExpanded] = useState(false);
  const description = frame.description || "";
  const maxLength = 50; // characters before truncating
  const shouldTruncate = description.length > maxLength;
  const displayDescription = expanded
    ? description
    : description.slice(0, maxLength);

  return (
    <div
      className="frame-card"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: "8px",
        backgroundColor: "white",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        border: "2px solid transparent",
        cursor: "pointer",
        transition:
          "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        position: "relative",
        opacity: isLocked ? 0.7 : 1,
      }}
      onClick={() => onSelect(frame)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.15)";
        e.currentTarget.style.borderColor = isLocked ? "#94a3b8" : "#e0a899";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {/* Locked Badge */}
      {isLocked && (
        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "10px",
            fontWeight: "600",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          🔒 Member Only
        </div>
      )}

      {/* Frame Image Container - 9:16 aspect ratio */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#f9fafb",
          aspectRatio: "9/16",
          width: "100%",
          padding: "12px",
          boxSizing: "border-box",
        }}
      >
        {imageError || !getImageUrl(frame) ? (
          <div
            style={{
              position: "absolute",
              inset: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
            }}
          >
            <span style={{ fontSize: "12px" }}>Gambar tidak tersedia</span>
          </div>
        ) : (
          <img
            src={getImageUrl(frame)}
            alt={frame.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: "4px",
            }}
            onError={() => onImageError(frame.id)}
          />
        )}
      </div>

      {/* Frame Name - wrap to multiple lines if needed, smaller font for long names */}
      <div
        style={{
          padding: "8px 8px 4px 8px",
          textAlign: "center",
          fontSize: frame.name && frame.name.length > 25 ? "10px" : "12px",
          fontWeight: 600,
          color: "#1e293b",
          lineHeight: "1.3",
          wordWrap: "break-word",
          overflowWrap: "break-word",
          hyphens: "auto",
          minHeight: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {frame.name}
      </div>

      {/* Frame Description */}
      {description && (
        <div
          style={{
            padding: "0 8px 8px 8px",
            textAlign: "center",
            fontSize: "10px",
            color: "#64748b",
            lineHeight: "1.4",
          }}
        >
          <span>
            {displayDescription}
            {shouldTruncate && !expanded && "..."}
          </span>
          {shouldTruncate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              style={{
                display: "inline",
                marginLeft: "4px",
                padding: 0,
                border: "none",
                background: "none",
                color: "#c89585",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {expanded ? "Sembunyikan" : "Selengkapnya"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Frames() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();

  useSEO({
    title: "Pilih Frame Foto - Photo Booth Online | Fremio",
    description: "Pilih dari ratusan frame foto keren untuk photo booth online kamu. Frame wisuda, lebaran, ulang tahun, couple, dan masih banyak lagi. Gratis di Fremio!",
    keywords: "frame foto online, bingkai foto gratis, frame photo booth, frame wisuda, frame lebaran, frame couple, photobox frame",
    canonical: "https://fremio.id/frames",
  });

  const [customFrames, setCustomFrames] = useState([]);
  const [imageErrors, setImageErrors] = useState({});
  const [accessibleFrameIds, setAccessibleFrameIds] = useState([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCanvasCategory, setActiveCanvasCategory] = useState("story");

  const headlineText = activeCanvasCategory === "story"
    ? "Kenangan yang pas untuk Story Instagram."
    : activeCanvasCategory === "4r"
    ? "Kenangan dalam ukuran foto klasik."
    : "Kenangan kecil yang selalu dekat.";

  const sizeFilteredFrames = useMemo(() => {
    const show4R = activeCanvasCategory === "4r";
    const show2R = activeCanvasCategory === "2r";
    return (customFrames || []).filter((frame) => {
      // Only show non-designer (Siap Pakai) frames
      if (frame.source === "designer") return false;
      const is4RFrame = isPhotostripCanvas(frame);
      const is2RFrame = is2RCanvas(frame);
      if (show4R) return is4RFrame && !is2RFrame;
      if (show2R) return is2RFrame;
      // story: neither 4R nor 2R
      return !is4RFrame && !is2RFrame;
    });
  }, [customFrames, activeCanvasCategory]);

  // Group frames by category and sort categories by min displayOrder
  const groupedFrames = useMemo(() => {
    // First, group frames by category
    const groups = sizeFilteredFrames.reduce((acc, frame) => {
      const category = frame.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(frame);
      return acc;
    }, {});

    // Sort frames within each category: free first (newest first), paid last (by displayOrder)
    Object.keys(groups).forEach((category) => {
      groups[category].sort((a, b) => {
        const aPaid = !!(a.isPremium ?? a.is_premium);
        const bPaid = !!(b.isPremium ?? b.is_premium);
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        if (!aPaid && !bPaid) return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
      });
    });

    // Get category order based on minimum displayOrder of frames in each category
    const categoryOrder = Object.keys(groups).map((category) => ({
      category,
      minDisplayOrder: Math.min(
        ...groups[category].map((f) => f.displayOrder ?? 999)
      ),
    }));

    // Sort categories by their minimum displayOrder
    categoryOrder.sort((a, b) => a.minDisplayOrder - b.minDisplayOrder);

    // Build ordered result
    const orderedGroups = {};
    categoryOrder.forEach(({ category }) => {
      orderedGroups[category] = groups[category];
    });

    return orderedGroups;
  }, [sizeFilteredFrames]);

  // Clear old frameConfig when entering Frames page
  useEffect(() => {
    // Clear frame-related data
    safeStorage.removeItem("frameConfig");
    safeStorage.removeItem("frameConfigTimestamp");
    safeStorage.removeItem("selectedFrame");
    safeStorage.removeItem("capturedPhotos");
    safeStorage.removeItem("capturedVideos");

    // Load custom frames and user access
    const loadFramesAndAccess = async () => {
      setLoading(true);
      try {
        // Load frames
        console.log("🔍 Loading custom frames...");
        console.log(
          `📡 Backend mode: ${
            unifiedFrameService.isVPSMode() ? "VPS" : "Firebase"
          }`
        );

        const loadedCustomFrames = await unifiedFrameService.getAllFrames();
        if (DEBUG_FRAMES) {
          console.log("🎨 Custom frames loaded:", loadedCustomFrames.length);
        }

        // Never show hidden frames on user-facing frames page
        const visibleFrames = (loadedCustomFrames || []).filter((frame) => {
          const isHidden = !!(frame?.isHidden ?? frame?.is_hidden);
          return !isHidden;
        });

        // Sort: free first (newest first), paid last (by displayOrder)
        visibleFrames.sort((a, b) => {
          const aPaid = !!(a.isPremium ?? a.is_premium);
          const bPaid = !!(b.isPremium ?? b.is_premium);
          if (aPaid !== bPaid) return aPaid ? 1 : -1;
          if (!aPaid && !bPaid) return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          return (a.displayOrder || 999) - (b.displayOrder || 999);
        });

        if (DEBUG_FRAMES) {
          if (visibleFrames.length > 0) {
            visibleFrames.forEach((f, idx) => {
              console.log(
                `  ${idx + 1}. ${f.name} (ID: ${f.id}, Order: ${
                  f.displayOrder ?? "N/A"
                })`
              );
              console.log(
                `     - imagePath: ${(
                  f.imagePath || f.imageUrl || f.thumbnailUrl || ""
                )?.substring(0, 60)}...`
              );
            });
          } else {
            console.warn("⚠️ NO CUSTOM FRAMES FOUND!");
          }
        }

        setCustomFrames(visibleFrames);

        // Check user access (only if logged in)
        if (currentUser) {
          try {
            // Self-heal path 1: if we know the last orderId (stored during checkout),
            // ask backend to check status and grant access if settled.
            try {
              const qs = new URLSearchParams(location.search || "");
              const orderIdFromQuery =
                qs.get("order_id") || qs.get("orderId") || qs.get("order") || null;

              if (orderIdFromQuery) {
                try {
                  localStorage.setItem("fremio_last_order_id", orderIdFromQuery);
                } catch {
                  // ignore
                }
              }

              const lastOrderId =
                orderIdFromQuery || localStorage.getItem("fremio_last_order_id");
              if (lastOrderId) {
                await paymentService.checkStatus(lastOrderId);
              }
            } catch (e) {
              const msg = String(e?.message || "");
              const msgLower = msg.toLowerCase();
              const looksMissing =
                msgLower.includes("http 404") ||
                msgLower.includes("transaction") && msgLower.includes("does") && msgLower.includes("exist");
              if (looksMissing) {
                try {
                  localStorage.removeItem("fremio_last_order_id");
                } catch {
                  // ignore
                }
              }
            }

            // Self-heal: some payment methods (e.g., DANA) may complete outside
            // of the Snap popup callbacks. Reconcile the latest transaction so
            // access can be granted even if webhook/JS callbacks were missed.
            try {
              await paymentService.reconcileLatest?.();
            } catch (e) {
              // non-fatal
            }

            const accessResponse = await paymentService.getAccess();
            if (accessResponse.success && accessResponse.hasAccess) {
              setHasAccess(true);
              setAccessibleFrameIds(accessResponse.data.frameIds || []);
              try {
                localStorage.removeItem("fremio_last_order_id");
              } catch {
                // ignore
              }
              console.log(
                "✅ User has access to frames:",
                accessResponse.data.frameIds?.length
              );
            } else {
              setHasAccess(false);
              setAccessibleFrameIds([]);
              console.log("❌ User has no active access");
            }
          } catch (error) {
            console.error("Error checking access:", error);
            setHasAccess(false);
            setAccessibleFrameIds([]);
          }
        } else {
          setHasAccess(false);
          setAccessibleFrameIds([]);
        }
      } catch (error) {
        console.error("❌ Error loading frames:", error);
        setCustomFrames([]);
      } finally {
        setLoading(false);
      }
    };

    loadFramesAndAccess();
  }, [currentUser, location.search]);

  const handleImageError = (frameId) => {
    if (DEBUG_FRAMES) {
      console.error(`❌ Image failed to load for frame: ${frameId}`);
    }
    // Don't just set error - this prevents showing frame at all
    // Let frame render with fallback instead
    setImageErrors((prev) => ({ ...prev, [frameId]: true }));
  };

  const handleSelectFrame = async (frame) => {
    console.log("🎬 User clicked frame:", frame.name);
    console.log("📦 Frame data:", frame);

    const isPremium = !!(frame?.isPremium ?? frame?.is_premium);
    const accessibleSet = new Set(
      (accessibleFrameIds || []).map((id) => String(id))
    );
    // If backend returns an empty frameIds list for an active subscription,
    // treat it as "access to all premium frames".
    const isAccessible =
      !isPremium ||
      (hasAccess &&
        ((accessibleFrameIds || []).length === 0 ||
          accessibleSet.has(String(frame.id))));

    if (!isAccessible) {
      navigate(
        `/pricing?reason=locked&frameId=${encodeURIComponent(String(frame.id))}`
      );
      return;
    }

    // No login required - allow all users to access frames

    const hasValidSlots = frame.slots && Array.isArray(frame.slots) && frame.slots.length > 0;
    const hasPhotoInLayout = Array.isArray(frame.layout?.elements) &&
      frame.layout.elements.some((el) => el.type === "photo");
    if (!hasValidSlots && !hasPhotoInLayout) {
      alert("Error: Frame ini tidak memiliki slot foto.");
      return;
    }

    if (!frame.imagePath && !frame.thumbnailUrl && !frame.imageUrl && !hasPhotoInLayout) {
      alert("Error: Frame ini tidak memiliki gambar.");
      return;
    }

    await trackFrameView(frame.id, null, frame.name);

    // Increment click count in DB (fire-and-forget)
    const _API = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
    fetch(`${_API}/frames/${frame.id}/view`, { method: "POST" }).catch(() => {});

    // Designer frames → open in editor (same as template click in /create)
    if (frame.source === "designer") {
      navigate("/create/editor", {
        state: {
          prefillFromBaseFrame: true,
          baseFrame: {
            ...frame,
            canvasWidth: frame.canvasWidth ?? frame.canvas_width,
            canvasHeight: frame.canvasHeight ?? frame.canvas_height,
            canvasBackground: frame.canvasBackground ?? frame.canvas_background,
          },
        },
      });
      return;
    }

    const flowTypeRaw = frame?.flowType ?? frame?.flow_type;
    const flowType = String(flowTypeRaw || "fixed").toLowerCase().trim();

    if (flowType === "personalized") {
      navigate("/create/editor", {
        state: {
          prefillFromBaseFrame: true,
          baseFrame: frame,
        },
      });
      return;
    }

    try {
      const success = await frameProvider.setCustomFrame(frame);

      if (success !== false) {
        navigate("/take-moment");
      } else {
        alert("Error: Gagal memilih frame");
      }
    } catch (error) {
      console.error("Error in setCustomFrame:", error);
      alert("Error: Gagal memilih frame - " + error.message);
    }
  };

  return (
    <>
      {/* Responsive CSS for frames grid */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .frames-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .frames-grid .frame-card {
          width: 100%;
          max-width: 220px;
        }
        @media (min-width: 768px) {
          .frames-grid {
            grid-template-columns: repeat(6, 1fr);
            gap: 20px;
          }
          .frames-grid .frame-card {
            width: 100%;
            max-width: 220px;
          }
        }
      `}</style>
      <section
        style={{
          minHeight: "100vh",
          background: "linear-gradient(to bottom, #fdf7f4, white, #f7f1ed)",
          paddingTop: "48px",
          paddingBottom: "48px",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 16px",
          }}
        >
          {/* PROMO BANNER */}
          <div style={{
            background: 'linear-gradient(135deg, #c89585 0%, #b07060 100%)',
            borderRadius: '16px',
            padding: '18px 24px',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '15px', fontWeight: '800', color: '#fff' }}>🎨 Akses Semua Frames & Templates Premium</span>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>Jadi member dan akses penuh ke ratusan frame dan template eksklusif — mulai Rp 5.000.</span>
            </div>
            <button
              onClick={() => navigate('/pricing')}
              style={{
                background: '#fff',
                color: '#c89585',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 22px',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                flexShrink: 0,
                marginLeft: 'auto',
                alignSelf: 'flex-end',
              }}
            >
              Lihat Paket →
            </button>
          </div>
          {/* Canvas Size Category Tabs */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                gap: "6px",
                padding: "6px",
                borderRadius: "999px",
                background: "rgba(224, 183, 169, 0.22)",
                border: "1px solid rgba(224, 183, 169, 0.35)",
              }}
            >
              <button
                type="button"
                aria-pressed={activeCanvasCategory === "story"}
                onClick={() => setActiveCanvasCategory("story")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  fontSize: "12px",
                  background:
                    activeCanvasCategory === "story"
                      ? "linear-gradient(to right, #e0b7a9, #c89585)"
                      : "transparent",
                  color:
                    activeCanvasCategory === "story" ? "white" : "#4a302b",
                }}
              >
                Story Instagram
              </button>
              <button
                type="button"
                aria-pressed={activeCanvasCategory === "4r"}
                onClick={() => setActiveCanvasCategory("4r")}
                style={{
                  border:
                    activeCanvasCategory === "4r"
                      ? "none"
                      : "1px solid rgba(200, 149, 133, 0.55)",
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  fontSize: "12px",
                  background:
                    activeCanvasCategory === "4r"
                      ? "linear-gradient(to right, #e0b7a9, #c89585)"
                      : "transparent",
                  color: activeCanvasCategory === "4r" ? "white" : "#4a302b",
                }}
              >
                4R
              </button>
              <button
                type="button"
                aria-pressed={activeCanvasCategory === "2r"}
                onClick={() => setActiveCanvasCategory("2r")}
                style={{
                  border:
                    activeCanvasCategory === "2r"
                      ? "none"
                      : "1px solid rgba(200, 149, 133, 0.55)",
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  fontSize: "12px",
                  background:
                    activeCanvasCategory === "2r"
                      ? "linear-gradient(to right, #e0b7a9, #c89585)"
                      : "transparent",
                  color: activeCanvasCategory === "2r" ? "white" : "#4a302b",
                  position: "relative",
                }}
              >
                2R
                <span
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-6px",
                    padding: "2px 6px",
                    borderRadius: "999px",
                    fontSize: "10px",
                    fontWeight: 800,
                    letterSpacing: "0.2px",
                    background: "linear-gradient(to right, #e0b7a9, #c89585)",
                    color: "white",
                    boxShadow: "0 6px 14px rgba(200, 149, 133, 0.25)",
                    lineHeight: 1.2,
                  }}
                >
                  New
                </span>
              </button>
            </div>
          </div>

          {/* Title */}
          <h2
            style={{
              marginBottom: "32px",
              textAlign: "center",
              fontSize: "clamp(18px, 4.8vw, 24px)",
              fontWeight: "bold",
              color: "#1e293b",
              lineHeight: 1.25,
            }}
          >
            {headlineText}
          </h2>



          {/* Loading State */}
          {loading && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  border: "4px solid #f3f3f3",
                  borderTop: "4px solid #c89585",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 20px",
                }}
              />
              <p style={{ color: "#666" }}>Memuat frames...</p>
            </div>
          )}

          {/* Frames by Category */}
          {!loading && Object.keys(groupedFrames).length > 0
            ? Object.entries(groupedFrames).map(([category, frames]) => (
                <div key={category} style={{ marginBottom: "40px" }}>
                  {/* Category Header */}
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: "#1e293b",
                      marginBottom: "16px",
                    }}
                  >
                    {category} ({frames.length})
                  </h3>

                  {/* Frames Grid - Responsive: 3 cols mobile, 6 cols desktop */}
                  <div className="frames-grid">
                    {frames.map((frame) => {
                      const isPremium = !!(
                        frame?.isPremium ?? frame?.is_premium
                      );
                      const accessibleSet = new Set(
                        (accessibleFrameIds || []).map((id) => String(id))
                      );
                      const isLocked =
                        isPremium &&
                        !(hasAccess && accessibleSet.has(String(frame.id)));

                      return (
                        <FrameCard
                          key={frame.id}
                          frame={frame}
                          onSelect={handleSelectFrame}
                          imageError={imageErrors[frame.id]}
                          onImageError={handleImageError}
                          getImageUrl={getFrameImageUrl}
                          isLocked={isLocked}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            : !loading && (
                <div style={{ padding: "48px", background: "linear-gradient(to bottom right, #f8fafc, #f1f5f9)", border: "2px solid #e2e8f0", borderRadius: "16px", textAlign: "center" }}>
                  <h3 style={{ fontSize: "24px", fontWeight: "bold", color: "#1e293b", marginBottom: "12px" }}>Belum Ada Frame Tersedia</h3>
                  <p style={{ color: "#64748b" }}>Frame sedang dalam proses penambahan oleh admin.</p>
                </div>
              )}
        </div>
      </section>
    </>
  );
}
