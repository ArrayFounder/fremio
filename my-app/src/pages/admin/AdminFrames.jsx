import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import unifiedFrameService from "../../services/unifiedFrameService";

// Mini canvas preview for frames that have no thumbnail image (designer-approved frames)
function LayoutPreview({ frame, style }) {
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
    const scaleX = w / cW;
    const scaleY = h / cH;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = frame?.canvasBackground || "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    const drawNext = (idx) => {
      if (idx >= sorted.length) return;
      const el = sorted[idx];
      const ex = (el.x || 0) * scaleX;
      const ey = (el.y || 0) * scaleY;
      const ew = (el.width || 0) * scaleX;
      const eh = (el.height || 0) * scaleY;

      if (el.type === "background-photo" || el.type === "upload") {
        const src = el.data?.image;
        if (src && typeof src === "string" && src.length > 10) {
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, ex, ey, ew, eh); drawNext(idx + 1); };
          img.onerror = () => drawNext(idx + 1);
          img.src = src;
          return;
        }
      } else if (el.type === "photo") {
        ctx.fillStyle = "rgba(148,163,184,0.4)";
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeStyle = "rgba(100,116,139,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(ex, ey, ew, eh);
        ctx.fillStyle = "rgba(100,116,139,0.7)";
        ctx.font = `${Math.max(8, ew * 0.12)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("FOTO", ex + ew / 2, ey + eh / 2);
      } else if (el.type === "shape") {
        ctx.fillStyle = el.data?.fill || el.data?.color || "#cccccc";
        ctx.fillRect(ex, ey, ew, eh);
      } else if (el.type === "text") {
        ctx.fillStyle = el.data?.color || "#000000";
        ctx.font = `${Math.max(6, (el.data?.fontSize || 24) * scaleY)}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(el.data?.text || "", ex, ey);
      }
      drawNext(idx + 1);
    };
    drawNext(0);
  }, [elements, cW, cH, frame?.canvasBackground]);

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={Math.round(120 * (cH / cW))}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", ...style }}
    />
  );
}

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

const normalizeAspectRatioString = (raw) => {
  const normalized = String(raw || "")
    .toLowerCase()
    .trim()
    .replace("/", ":")
    .replace("x", ":")
    .replace(/\s+/g, "");
  if (normalized === "photostrip" || normalized === "4r") return "2:3";
  if (normalized === "2r") return "1:3";
  return normalized;
};

const getFrameThumbnailPaddingTop = (frame) => {
  const ratioRaw =
    frame?.layout?.aspectRatio ??
    frame?.layout?.aspect_ratio ??
    frame?.aspectRatio ??
    frame?.aspect_ratio;

  const ratio = normalizeAspectRatioString(ratioRaw);
  if (ratio.includes(":")) {
    const [wStr, hStr] = ratio.split(":").map((v) => v.trim());
    const w = Number(wStr);
    const h = Number(hStr);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return `${((h / w) * 100).toFixed(2)}%`;
    }
  }

  const { width, height } = getCanvasSize(frame);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return `${((height / width) * 100).toFixed(2)}%`;
  }

  // Default: Story Instagram 9:16
  return "177.78%";
};

const AdminFrames = () => {
  console.log("AdminFrames component rendering...");
  
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState("fremio"); // 'fremio' | 'designer'
  const [activeCanvasCategory, setActiveCanvasCategory] = useState("story");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortOrder, setSortOrder] = useState("display-order"); // display-order, category-asc, category-desc, name-asc, name-desc, newest, oldest
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState([]); // Order of categories for display
  const [togglingPaidId, setTogglingPaidId] = useState(null);
  const [togglingHiddenId, setTogglingHiddenId] = useState(null);
  const [togglingFlowId, setTogglingFlowId] = useState(null);
  const [movingSourceId, setMovingSourceId] = useState(null);

  const fetchFrames = React.useCallback(async (source = activeSource) => {
    const data = await unifiedFrameService.getAllFrames({
      includeHidden: true,
      throwOnError: true,
      source,
    });
    const sortedData = [...data].sort(
      (a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
    );
    setFrames(sortedData);
    return sortedData;
  }, [activeSource]);

  const getFlowType = (frame) => {
    const raw = frame?.flowType ?? frame?.flow_type;
    const normalized = String(raw || "fixed").toLowerCase().trim();
    return normalized === "personalized" ? "personalized" : "fixed";
  };

  useEffect(() => {
    const loadFrames = async () => {
      console.log("AdminFrames loading...");
      console.log(`📡 Backend mode: ${unifiedFrameService.isVPSMode() ? 'VPS' : 'Firebase'}`);
      try {
        const data = await fetchFrames(activeSource);
        console.log("Frames loaded:", data);
      } catch (err) {
        console.error("Error:", err);
        alert("Gagal memuat frames dari server. Coba reload halaman / cek koneksi.");
      }
      setLoading(false);
    };
    loadFrames();
  }, [activeSource, fetchFrames]);

  const sizeFilteredFrames = React.useMemo(() => {
    const show4R = activeCanvasCategory === "4r";
    const show2R = activeCanvasCategory === "2r";
    return (frames || []).filter((frame) => {
      // Source filter
      if (activeSource === "fremio" && frame.source === "designer") return false;
      if (activeSource === "designer" && frame.source !== "designer") return false;

      const is4RFrame = isPhotostripCanvas(frame);
      const is2RFrame = is2RCanvas(frame);
      if (show4R) return is4RFrame && !is2RFrame;
      if (show2R) return is2RFrame;
      return !is4RFrame && !is2RFrame;
    });
  }, [frames, activeCanvasCategory, activeSource]);

  // Get unique categories (alphabetically sorted for filter dropdown)
  const categories = [...new Set(sizeFilteredFrames.map((f) => f.category || "Uncategorized"))].sort();

  // Initialize categoryOrder based on displayOrder from database
  useEffect(() => {
    if (frames.length > 0 && categoryOrder.length === 0) {
      // Calculate category order based on minimum displayOrder of frames in each category
      const categoryMinOrder = {};
      frames.forEach(frame => {
        const cat = frame.category || "Uncategorized";
        const order = frame.displayOrder ?? 999;
        if (categoryMinOrder[cat] === undefined || order < categoryMinOrder[cat]) {
          categoryMinOrder[cat] = order;
        }
      });
      
      // Sort categories by their minimum displayOrder
      const sortedCategories = Object.keys(categoryMinOrder).sort(
        (a, b) => categoryMinOrder[a] - categoryMinOrder[b]
      );
      
      setCategoryOrder(sortedCategories);
    } else if (frames.length > 0 && categoryOrder.length > 0) {
      // Add any new categories that don't exist in categoryOrder
      const existingCategories = [...new Set(frames.map(f => f.category || "Uncategorized"))];
      const newCategories = existingCategories.filter(c => !categoryOrder.includes(c));
      if (newCategories.length > 0) {
        setCategoryOrder([...categoryOrder, ...newCategories]);
      }
      // Remove any categories that no longer exist
      const validCategories = categoryOrder.filter(c => existingCategories.includes(c));
      if (validCategories.length !== categoryOrder.length) {
        setCategoryOrder(validCategories);
      }
    }
  }, [frames.length, categoryOrder.length]); // Depend on frames length

  // Filter and sort frames
  const filteredAndSortedFrames = React.useMemo(() => {
    let result = [...sizeFilteredFrames];
    
    // Filter by category
    if (selectedCategory !== "all") {
      result = result.filter(f => (f.category || "Uncategorized") === selectedCategory);
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortOrder) {
        case "display-order": {
          const aPaid = !!(a.isPremium ?? a.is_premium);
          const bPaid = !!(b.isPremium ?? b.is_premium);
          if (aPaid !== bPaid) return aPaid ? 1 : -1; // free first, paid last
          if (!aPaid && !bPaid) {
            // both free: newest first (highest createdAt)
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          }
          // both paid: original display order
          return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
        }
        case "category-asc":
          return (a.category || "Uncategorized").localeCompare(b.category || "Uncategorized");
        case "category-desc":
          return (b.category || "Uncategorized").localeCompare(a.category || "Uncategorized");
        case "name-asc":
          return (a.name || "").localeCompare(b.name || "");
        case "name-desc":
          return (b.name || "").localeCompare(a.name || "");
        case "newest":
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case "oldest":
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        default:
          return 0;
      }
    });
    
    return result;
  }, [sizeFilteredFrames, selectedCategory, sortOrder]);

  // Group frames by category for display
  // Always group by category unless in reorder mode
  const groupedFrames = React.useMemo(() => {
    // Always group by category
    const groups = {};
    filteredAndSortedFrames.forEach(frame => {
      const cat = frame.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(frame);
    });
    
    // Sort categories based on categoryOrder
    const sortedGroups = {};
    categoryOrder.forEach(key => {
      if (groups[key]) {
        sortedGroups[key] = groups[key];
      }
    });
    
    // Add any remaining categories not in categoryOrder
    Object.keys(groups).forEach(key => {
      if (!sortedGroups[key]) {
        sortedGroups[key] = groups[key];
      }
    });
    
    return sortedGroups;
  }, [filteredAndSortedFrames, categoryOrder]);

  // Move frame up in order within its category
  const moveFrameUp = (frameId, category) => {
    // Get frames in this category
    const categoryFrames = frames.filter(f => (f.category || "Uncategorized") === category);
    const otherFrames = frames.filter(f => (f.category || "Uncategorized") !== category);
    
    const currentIndex = categoryFrames.findIndex(f => f.id === frameId);
    if (currentIndex <= 0) return;
    
    // Swap within category
    [categoryFrames[currentIndex - 1], categoryFrames[currentIndex]] = [categoryFrames[currentIndex], categoryFrames[currentIndex - 1]];
    
    // Rebuild frames array based on categoryOrder
    const newFrames = [];
    categoryOrder.forEach(cat => {
      if (cat === category) {
        newFrames.push(...categoryFrames);
      } else {
        newFrames.push(...frames.filter(f => (f.category || "Uncategorized") === cat));
      }
    });
    
    // Add any remaining frames not in categoryOrder
    otherFrames.forEach(f => {
      if (!newFrames.find(nf => nf.id === f.id)) {
        newFrames.push(f);
      }
    });
    
    // Update displayOrder for all frames
    newFrames.forEach((frame, idx) => {
      frame.displayOrder = idx;
    });
    
    setFrames(newFrames);
  };

  // Move frame down in order within its category
  const moveFrameDown = (frameId, category) => {
    // Get frames in this category
    const categoryFrames = frames.filter(f => (f.category || "Uncategorized") === category);
    
    const currentIndex = categoryFrames.findIndex(f => f.id === frameId);
    if (currentIndex < 0 || currentIndex >= categoryFrames.length - 1) return;
    
    // Swap within category
    [categoryFrames[currentIndex], categoryFrames[currentIndex + 1]] = [categoryFrames[currentIndex + 1], categoryFrames[currentIndex]];
    
    // Rebuild frames array based on categoryOrder
    const newFrames = [];
    categoryOrder.forEach(cat => {
      if (cat === category) {
        newFrames.push(...categoryFrames);
      } else {
        newFrames.push(...frames.filter(f => (f.category || "Uncategorized") === cat));
      }
    });
    
    // Add any remaining frames
    frames.forEach(f => {
      if (!newFrames.find(nf => nf.id === f.id)) {
        newFrames.push(f);
      }
    });
    
    // Update displayOrder for all frames
    newFrames.forEach((frame, idx) => {
      frame.displayOrder = idx;
    });
    
    setFrames(newFrames);
  };

  // Move category up
  const moveCategoryUp = (category) => {
    const currentIndex = categoryOrder.indexOf(category);
    if (currentIndex <= 0) return;
    
    const newOrder = [...categoryOrder];
    [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
    setCategoryOrder(newOrder);
    
    // Rebuild frames array based on new category order
    rebuildFramesOrder(newOrder);
  };

  // Move category down
  const moveCategoryDown = (category) => {
    const currentIndex = categoryOrder.indexOf(category);
    if (currentIndex < 0 || currentIndex >= categoryOrder.length - 1) return;
    
    const newOrder = [...categoryOrder];
    [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
    setCategoryOrder(newOrder);
    
    // Rebuild frames array based on new category order
    rebuildFramesOrder(newOrder);
  };

  // Rebuild frames order based on category order
  const rebuildFramesOrder = (newCategoryOrder) => {
    const newFrames = [];
    newCategoryOrder.forEach(cat => {
      const categoryFrames = frames.filter(f => (f.category || "Uncategorized") === cat);
      // Sort by current displayOrder within category
      categoryFrames.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
      newFrames.push(...categoryFrames);
    });
    
    // Add any remaining frames
    frames.forEach(f => {
      if (!newFrames.find(nf => nf.id === f.id)) {
        newFrames.push(f);
      }
    });
    
    // Update displayOrder for all frames
    newFrames.forEach((frame, idx) => {
      frame.displayOrder = idx;
    });
    
    setFrames(newFrames);
  };

  // Save current order to database
  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const frameOrders = frames.map((frame, idx) => ({
        id: frame.id,
        displayOrder: idx
      }));
      
      console.log("📋 Saving frame orders:", frameOrders.map(f => `${f.id}: ${f.displayOrder}`));
      
      await unifiedFrameService.updateFramesOrder(frameOrders);
      console.log("✅ Frame orders saved successfully!");

      // Reload frames from server to ensure sync.
      // IMPORTANT: do not wipe the UI if the reload fails (network/auth hiccup).
      try {
        const sortedData = await fetchFrames(activeSource);
        if (sortedData.length > 0) {
          setFrames(sortedData);
        }
      } catch (reloadErr) {
        console.error("Error reloading frames after save:", reloadErr);
      }
      
      alert("Urutan berhasil disimpan!");
      setIsReorderMode(false);
    } catch (err) {
      console.error("Error saving order:", err);
      alert("Gagal menyimpan urutan: " + err.message);
    }
    setSavingOrder(false);
  };

  const handleDelete = async (frameId) => {
    if (window.confirm("Yakin ingin menghapus frame ini?")) {
      try {
        const result = await unifiedFrameService.deleteFrame(frameId);
        if (result.success !== false) {
          // Reload frames from server instead of just filtering
          await fetchFrames(activeSource);
          alert("Frame berhasil dihapus!");
        } else {
          alert("Gagal menghapus: " + result.message);
        }
      } catch (err) {
        alert("Gagal menghapus: " + err.message);
      }
    }
  };

  const handleTogglePaid = async (frame) => {
    const isPaid = !!(frame?.isPremium ?? frame?.is_premium);
    try {
      setTogglingPaidId(frame.id);
      const result = await unifiedFrameService.updateFrame(frame.id, {
        is_premium: !isPaid,
      });

      if (result?.success === false) {
        throw new Error(result?.message || "Gagal mengubah status paid/free");
      }

      // Reload frames from server to ensure sync
      await fetchFrames(activeSource);
    } catch (err) {
      alert("Gagal mengubah status: " + (err?.message || String(err)));
    } finally {
      setTogglingPaidId(null);
    }
  };

  const handleToggleHidden = async (frame) => {
    const isHidden = !!(frame?.isHidden ?? frame?.is_hidden);
    try {
      setTogglingHiddenId(frame.id);
      const result = await unifiedFrameService.updateFrame(frame.id, {
        is_hidden: !isHidden,
      });

      if (result?.success === false) {
        throw new Error(result?.message || "Gagal mengubah visibilitas (hide/show)");
      }

      // Reload frames from server to ensure sync
      await fetchFrames(activeSource);
    } catch (err) {
      alert("Gagal mengubah visibilitas: " + (err?.message || String(err)));
    } finally {
      setTogglingHiddenId(null);
    }
  };

  const handleSetFlowType = async (frame, nextFlowType) => {
    const normalized = String(nextFlowType || "fixed").toLowerCase().trim();
    const safeFlowType = normalized === "personalized" ? "personalized" : "fixed";

    const previousFlowType = getFlowType(frame);
    // Optimistic UI: update local state immediately so the select doesn't snap back.
    setFrames((prev) =>
      (prev || []).map((f) =>
        f?.id === frame.id
          ? {
              ...f,
              flowType: safeFlowType,
              flow_type: safeFlowType,
            }
          : f
      )
    );

    try {
      setTogglingFlowId(frame.id);
      const result = await unifiedFrameService.updateFrame(frame.id, {
        flow_type: safeFlowType,
      });

      if (result?.success === false) {
        throw new Error(result?.message || "Gagal mengubah flow type");
      }

      const sortedData = await fetchFrames(activeSource);

      // Verify server actually persisted the change.
      const updated = sortedData.find((f) => f?.id === frame.id);
      const serverFlow = updated ? getFlowType(updated) : null;
      if (serverFlow && serverFlow !== safeFlowType) {
        alert(
          "Flow type belum tersimpan di server. Pastikan backend sudah di-deploy dan migration flow_type sudah dijalankan."
        );
      }
    } catch (err) {
      // Rollback optimistic update
      setFrames((prev) =>
        (prev || []).map((f) =>
          f?.id === frame.id
            ? {
                ...f,
                flowType: previousFlowType,
                flow_type: previousFlowType,
              }
            : f
        )
      );
      alert("Gagal mengubah flow type: " + (err?.message || String(err)));
    } finally {
      setTogglingFlowId(null);
    }
  };

  const handleMoveSource = async (frame) => {
    const currentSource = frame.source || 'fremio';
    const newSource = currentSource === 'fremio' ? 'designer' : 'fremio';

    try {
      setMovingSourceId(frame.id);
      const result = await unifiedFrameService.updateFrame(frame.id, {
        source: newSource,
        is_template: newSource === 'designer',
        flow_type: newSource === 'designer' ? 'personalized' : 'fixed',
      });
      if (result?.success === false) {
        throw new Error(result?.message || 'Gagal memindahkan frame');
      }
      await fetchFrames(activeSource);
    } catch (err) {
      alert('Gagal memindahkan frame: ' + (err?.message || String(err)));
    } finally {
      setMovingSourceId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Loading frames...</p>
      </div>
    );
  }

  // ULTRA SIMPLE - just to test if component renders at all
  console.log("AdminFrames about to return JSX, frames count:", frames.length);

  // Frame card component
  const FrameCard = ({ frame, index, category, categoryFrames }) => {
    const displayImageUrl = frame.imageUrl || frame.thumbnailUrl || frame.imagePath;
    const isFirst = index === 0;
    const isLast = index === categoryFrames.length - 1;
    const isPaid = !!(frame?.isPremium ?? frame?.is_premium);
    const isHidden = !!(frame?.isHidden ?? frame?.is_hidden);
    const flowType = getFlowType(frame);
    
    return (
      <div 
        style={{ 
          background: "white", 
          borderRadius: "12px", 
          overflow: "hidden",
          boxShadow: isReorderMode ? "0 4px 12px rgba(79, 70, 229, 0.2)" : "0 2px 8px rgba(0,0,0,0.1)",
          border: isReorderMode ? "2px solid #4f46e5" : "none",
          position: "relative",
          opacity: isHidden ? 0.72 : 1
        }}
      >
        {/* Order number badge in reorder mode */}
        {isReorderMode && (
          <div style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            background: "#4f46e5",
            color: "white",
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: "bold",
            zIndex: 10
          }}>
            {index + 1}
          </div>
        )}
        
        {/* Frame thumbnail with per-frame aspect ratio */}
        <div style={{ 
          position: "relative",
          paddingTop: getFrameThumbnailPaddingTop(frame),
          background: frame.canvasBackground || "#f3f4f6",
          overflow: "hidden"
        }}>
          {displayImageUrl ? (
            <img 
              src={displayImageUrl}
              alt={frame.name}
              style={{ 
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain"
              }}
              onError={(e) => {
                console.error("Image load error for:", displayImageUrl);
                const parent = e.target.parentElement;
                e.target.style.display = "none";
                // If layout.elements available, the LayoutPreview sibling will show
                if (parent && !parent.querySelector('.img-error-placeholder') &&
                    !(frame?.layout?.elements?.length > 0)) {
                  const ph = document.createElement('div');
                  ph.className = 'img-error-placeholder';
                  ph.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#9ca3af;font-size:12px;text-align:center;';
                  ph.textContent = 'No Image';
                  parent.appendChild(ph);
                }
              }}
            />
          ) : null}
          {/* Canvas preview for designer frames with no thumbnail */}
          {!displayImageUrl && frame?.layout?.elements?.length > 0 && (
            <LayoutPreview frame={frame} />
          )}
          {!displayImageUrl && !(frame?.layout?.elements?.length > 0) && (
            <div style={{ 
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#9ca3af" 
            }}>No Image</div>
          )}
        </div>
        <div style={{ padding: "12px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>{frame.name || "Untitled"}</h3>
          <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#6b7280" }}>
            {frame.category || "No category"}
          </p>

          {/* Click count */}
          {!isReorderMode && (
            <p style={{ margin: "0 0 8px 0", fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
              <span>👆</span>
              <span style={{ fontWeight: 600, color: "#6b7280" }}>{frame.viewCount ?? frame.view_count ?? 0}</span>
              <span>{activeSource === "designer" ? "klik di templates" : "klik di /frames"}</span>
            </p>
          )}

          {/* Flow Type Selector (always visible) */}
          {!isReorderMode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                margin: "0 0 10px 0",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  color: "#334155",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                Flow
              </span>
              <select
                value={flowType}
                disabled={togglingFlowId === frame.id}
                onChange={(e) => handleSetFlowType(frame, e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px",
                  background:
                    flowType === "personalized" ? "#ffedd5" : "#f1f5f9",
                  color: "#0f172a",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  cursor:
                    togglingFlowId === frame.id ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
                title="Pilih flow type: Fixed / Personalized"
              >
                <option value="fixed">FIXED</option>
                <option value="personalized">PERSONALIZED</option>
              </select>
            </div>
          )}
          
          {isReorderMode ? (
            // Reorder controls
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => moveFrameUp(frame.id, category)}
                disabled={isFirst}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: isFirst ? "#e5e7eb" : "#dbeafe",
                  color: isFirst ? "#9ca3af" : "#1d4ed8",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isFirst ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "bold"
                }}
                title="Pindah ke atas"
              >
                ↑
              </button>
              <button 
                onClick={() => moveFrameDown(frame.id, category)}
                disabled={isLast}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: isLast ? "#e5e7eb" : "#dbeafe",
                  color: isLast ? "#9ca3af" : "#1d4ed8",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isLast ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "bold"
                }}
                title="Pindah ke bawah"
              >
                ↓
              </button>
            </div>
          ) : (
            // Normal edit/delete controls — 2×2 grid
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
              <button
                onClick={() => handleTogglePaid(frame)}
                disabled={togglingPaidId === frame.id}
                style={{
                  padding: "5px 4px",
                  background: isPaid ? "#ede9fe" : "#dcfce7",
                  color: isPaid ? "#6d28d9" : "#166534",
                  border: "none",
                  borderRadius: "4px",
                  cursor: togglingPaidId === frame.id ? "not-allowed" : "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
                title="Toggle status paid/free"
              >
                {togglingPaidId === frame.id ? "..." : isPaid ? "PAID" : "FREE"}
              </button>
              <button
                onClick={() => handleToggleHidden(frame)}
                disabled={togglingHiddenId === frame.id}
                style={{
                  padding: "5px 4px",
                  background: isHidden ? "#f3f4f6" : "#e0f2fe",
                  color: isHidden ? "#374151" : "#0369a1",
                  border: "none",
                  borderRadius: "4px",
                  cursor: togglingHiddenId === frame.id ? "not-allowed" : "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
                title="Hide/Show frame untuk user"
              >
                {togglingHiddenId === frame.id ? "..." : isHidden ? "HIDDEN" : "SHOW"}
              </button>
              <Link
                to={`/admin/upload-frame?edit=${frame.id}`}
                style={{
                  padding: "5px 4px",
                  background: "#e0e7ff",
                  color: "#4f46e5",
                  borderRadius: "4px",
                  textAlign: "center",
                  textDecoration: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                Edit
              </Link>
              <button
                onClick={() => handleMoveSource(frame)}
                disabled={movingSourceId === frame.id}
                style={{
                  padding: "5px 4px",
                  background: (frame.source || 'fremio') === 'fremio' ? "#fef9c3" : "#fce7f3",
                  color: (frame.source || 'fremio') === 'fremio' ? "#854d0e" : "#9d174d",
                  border: "none",
                  borderRadius: "4px",
                  cursor: movingSourceId === frame.id ? "not-allowed" : "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
                title={(frame.source || 'fremio') === 'fremio' ? 'Pindahkan ke By Designer (jadi template)' : 'Pindahkan ke By Fremio (jadi frame siap pakai)'}
              >
                {movingSourceId === frame.id ? "..." : (frame.source || 'fremio') === 'fremio' ? "→ Designer" : "→ Fremio"}
              </button>
              <button
                onClick={() => handleDelete(frame.id)}
                style={{
                  gridColumn: "1 / -1",
                  padding: "5px 4px",
                  background: "#fee2e2",
                  color: "#dc2626",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                Hapus
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "20px", backgroundColor: "#fff", minHeight: "200px" }}>
      <h1 style={{ color: "#111", marginBottom: "20px" }}>🖼️ Kelola Frame</h1>

      {/* Source Master Toggle */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
        <div style={{ display: "inline-flex", gap: "6px", padding: "5px", borderRadius: "999px", background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
          {[
            { id: "fremio", label: "By Fremio 🎨" },
            { id: "designer", label: "By Designer ✨" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setActiveSource(s.id); setActiveCanvasCategory("story"); setSelectedCategory("all"); }}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "9px 22px",
                borderRadius: "999px",
                fontWeight: 700,
                fontSize: "13px",
                transition: "all 0.18s",
                background: activeSource === s.id ? "linear-gradient(135deg, #1f2937, #374151)" : "transparent",
                color: activeSource === s.id ? "#fff" : "#6b7280",
                boxShadow: activeSource === s.id ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Size Category Tabs */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
        <div
          style={{
            display: "inline-flex",
            gap: "6px",
            padding: "6px",
            borderRadius: "999px",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
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
                  ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                  : "transparent",
              color: activeCanvasCategory === "story" ? "white" : "#3730a3",
            }}
          >
            Story Instagram
          </button>
          <button
            type="button"
            aria-pressed={activeCanvasCategory === "4r"}
            onClick={() => setActiveCanvasCategory("4r")}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "8px 14px",
              borderRadius: "999px",
              fontWeight: 700,
              fontSize: "12px",
              background:
                activeCanvasCategory === "4r"
                  ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                  : "transparent",
              color: activeCanvasCategory === "4r" ? "white" : "#3730a3",
            }}
          >
            4R (Photostrip)
          </button>
          <button
            type="button"
            aria-pressed={activeCanvasCategory === "2r"}
            onClick={() => setActiveCanvasCategory("2r")}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "8px 14px",
              borderRadius: "999px",
              fontWeight: 700,
              fontSize: "12px",
              background:
                activeCanvasCategory === "2r"
                  ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                  : "transparent",
              color: activeCanvasCategory === "2r" ? "white" : "#3730a3",
            }}
          >
            2R
          </button>
        </div>
      </div>
      
      <p style={{ color: "#666", marginBottom: "20px" }}>
        Total frames: {frames.length}
        {` • Menampilkan: ${filteredAndSortedFrames.length}`}
        {isReorderMode && " • Mode Atur Urutan Aktif"}
      </p>
      
      {/* Reorder Mode Banner */}
      {isReorderMode && (
        <div style={{
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          color: "white",
          padding: "16px 20px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div>
            <strong style={{ fontSize: "16px" }}>📋 Mode Atur Urutan</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "14px", opacity: 0.9 }}>
              • Gunakan tombol "↑ Kategori" / "↓ Kategori" untuk mengubah urutan kategori
            </p>
            <p style={{ margin: "4px 0 0 0", fontSize: "14px", opacity: 0.9 }}>
              • Gunakan tombol ↑ ↓ pada frame untuk mengubah urutan dalam kategori
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setIsReorderMode(false)}
              style={{
                padding: "10px 20px",
                background: "rgba(255,255,255,0.2)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Batal
            </button>
            <button
              onClick={saveOrder}
              disabled={savingOrder}
              style={{
                padding: "10px 20px",
                background: "white",
                color: "#4f46e5",
                border: "none",
                borderRadius: "8px",
                cursor: savingOrder ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600"
              }}
            >
              {savingOrder ? "Menyimpan..." : "💾 Simpan Urutan"}
            </button>
          </div>
        </div>
      )}
      
      {/* Filter and Sort Controls */}
      <div style={{ 
        display: "flex", 
        flexWrap: "wrap",
        gap: "12px", 
        marginBottom: "20px",
        alignItems: "center"
      }}>
        <Link 
          to="/admin/upload-frame"
          style={{
            display: "inline-block",
            background: "#4f46e5",
            color: "white",
            padding: "10px 20px",
            borderRadius: "8px",
            textDecoration: "none",
          }}
        >
          + Upload Frame Baru
        </Link>
        
        {/* Reload Button */}
        <button
          onClick={async () => {
            setLoading(true);
            try {
              await fetchFrames(activeSource);
              alert("✅ Data berhasil dimuat ulang!");
            } catch (err) {
              alert("Gagal memuat ulang: " + err.message);
            } finally {
              setLoading(false);
            }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "#eff6ff",
            color: "#1e40af",
            padding: "10px 20px",
            borderRadius: "8px",
            border: "1px solid #93c5fd",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500"
          }}
        >
          🔄 Reload Data
        </button>
        
        {/* Reorder Mode Toggle Button */}
        {!isReorderMode && (
          <button
            onClick={() => {
              setIsReorderMode(true);
              setSortOrder("display-order");
              setSelectedCategory("all");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#f0fdf4",
              color: "#15803d",
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid #86efac",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500"
            }}
          >
            ↕️ Atur Urutan Tampilan
          </button>
        )}

        {/* Category Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>
            Filter Kategori:
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              background: "white",
              cursor: "pointer",
              minWidth: "150px"
            }}
          >
            <option value="all">Semua Kategori</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Sort Order */}
        {!isReorderMode && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>
              Urutkan:
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                background: "white",
                cursor: "pointer",
                minWidth: "180px"
              }}
            >
              <option value="display-order">Urutan Tampilan</option>
              <option value="name-asc">Nama (A-Z)</option>
              <option value="name-desc">Nama (Z-A)</option>
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </div>
        )}
      </div>

      {frames.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", background: "#f3f4f6", borderRadius: "8px" }}>
          <p style={{ color: "#6b7280" }}>Belum ada frame yang diupload</p>
        </div>
      ) : filteredAndSortedFrames.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", background: "#f3f4f6", borderRadius: "8px" }}>
          <p style={{ color: "#6b7280" }}>Tidak ada frame dalam kategori "{selectedCategory}"</p>
        </div>
      ) : (
        // Always show grouped by category view
        <div>
          {Object.entries(groupedFrames || {}).map(([category, categoryFrames], catIndex) => {
            const isFirstCategory = catIndex === 0;
            const isLastCategory = catIndex === Object.keys(groupedFrames).length - 1;
            
            return (
              <div key={category} style={{ marginBottom: "32px" }}>
                <div style={{ 
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  paddingBottom: "8px",
                  borderBottom: isReorderMode ? "2px solid #4f46e5" : "2px solid #e5e7eb",
                  background: isReorderMode ? "#f0f9ff" : "transparent",
                  padding: isReorderMode ? "12px" : "0 0 8px 0",
                  borderRadius: isReorderMode ? "8px 8px 0 0" : "0"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {isReorderMode && (
                      <span style={{
                        background: "#4f46e5",
                        color: "white",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: "bold"
                      }}>
                        {catIndex + 1}
                      </span>
                    )}
                    <h2 style={{ 
                      fontSize: "18px", 
                      fontWeight: "600", 
                      color: "#1f2937", 
                      margin: 0,
                    }}>
                      {category} 
                      <span style={{ 
                        fontSize: "14px", 
                        fontWeight: "normal", 
                        color: "#6b7280",
                        marginLeft: "8px"
                      }}>
                        ({categoryFrames.length} frame)
                      </span>
                    </h2>
                  </div>
                  
                  {/* Category reorder controls */}
                  {isReorderMode && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button 
                        onClick={() => moveCategoryUp(category)}
                        disabled={isFirstCategory}
                        style={{
                          padding: "6px 12px",
                          background: isFirstCategory ? "#e5e7eb" : "#dbeafe",
                          color: isFirstCategory ? "#9ca3af" : "#1d4ed8",
                          border: "none",
                          borderRadius: "4px",
                          cursor: isFirstCategory ? "not-allowed" : "pointer",
                          fontSize: "14px",
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        title="Pindah kategori ke atas"
                      >
                        ↑ Kategori
                      </button>
                      <button 
                        onClick={() => moveCategoryDown(category)}
                        disabled={isLastCategory}
                        style={{
                          padding: "6px 12px",
                          background: isLastCategory ? "#e5e7eb" : "#dbeafe",
                          color: isLastCategory ? "#9ca3af" : "#1d4ed8",
                          border: "none",
                          borderRadius: "4px",
                          cursor: isLastCategory ? "not-allowed" : "pointer",
                          fontSize: "14px",
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        title="Pindah kategori ke bawah"
                      >
                        ↓ Kategori
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", 
                  gap: "20px" 
                }}>
                  {categoryFrames.map((frame, index) => (
                    <FrameCard 
                      key={frame.id} 
                      frame={frame} 
                      index={index} 
                      category={category}
                      categoryFrames={categoryFrames}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminFrames;
