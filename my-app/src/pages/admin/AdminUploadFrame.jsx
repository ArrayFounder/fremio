import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  Upload,
  FileImage,
  Plus,
  Trash2,
  Save,
  Eye,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { isVPSMode } from "../../config/backend";
import "../../styles/admin.css";
import unifiedFrameService from "../../services/unifiedFrameService";
import { quickDetectSlots } from "../../utils/slotDetector";

export default function AdminUploadFrame() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // State declarations FIRST
  const [frameName, setFrameName] = useState("");
  const [frameDescription, setFrameDescription] = useState("");
  const [frameCategory, setFrameCategory] = useState("custom");
  const [canvasSize, setCanvasSize] = useState("story"); // "story" | "4r" | "2r"
  const [maxCaptures, setMaxCaptures] = useState(3);
  const [duplicatePhotos, setDuplicatePhotos] = useState(false);

  // Frame image
  const [frameImageFile, setFrameImageFile] = useState(null);
  const [frameImagePreview, setFrameImagePreview] = useState("");

  // Slots configuration
  const [slots, setSlots] = useState([]);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // UI State
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageInfo, setStorageInfo] = useState(null);

  console.log("🎨 AdminUploadFrame component rendered");
  console.log("👤 Current user:", user);
  
  // Get storage info on mount
  useEffect(() => {
    const info = {
      isVPSMode: isVPSMode,
      storageType: isVPSMode ? "VPS Server" : "LocalStorage/Firebase",
    };
    setStorageInfo(info);
    console.log("☁️ Storage Info:", info);
  }, []); // Run only once on mount

  // Helper function to clear frames
  const handleClearStorage = async () => {
    if (window.confirm(
      "⚠️ PERINGATAN!\n\n" +
      "Ini akan menghapus SEMUA custom frames.\n\n" +
      "Apakah Anda yakin ingin melanjutkan?"
    )) {
      try {
        await unifiedFrameService.clearAllFrames();
        alert("✅ Custom frames berhasil dihapus!\n\nSilakan refresh halaman.");
        window.location.reload();
      } catch (error) {
        alert("❌ Gagal menghapus: " + error.message);
      }
    }
  };

  // Aggressive clear - hapus semua data yang memakan space
  const handleClearAllStorage = async () => {
    if (window.confirm(
      "⚠️ PERINGATAN KERAS!\n\n" +
      "Ini akan menghapus:\n" +
      "- Semua custom frames\n" +
      "- Semua data cache lokal\n\n" +
      "Apakah Anda YAKIN ingin melanjutkan?"
    )) {
      try {
        // Clear all frames
        await unifiedFrameService.clearAllFrames();
        
        // Clear localStorage items
        localStorage.removeItem('capturedPhotos');
        localStorage.removeItem('capturedVideos');
        localStorage.removeItem('frameConfig');
        localStorage.removeItem('activeDraftId');
        
        alert("✅ Storage dibersihkan!\n\nHalaman akan di-refresh...");
        window.location.reload();
      } catch (error) {
        alert("❌ Gagal menghapus: " + error.message);
      }
    }
  };

  // Handle frame image upload with auto slot detection
  const handleImageUpload = async (e) => {
    console.log("🖼️ handleImageUpload triggered");
    const file = e.target.files[0];
    console.log("📁 Selected file:", file);

    if (!file) {
      console.log("❌ No file selected");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/png")) {
      console.log("❌ Invalid file type:", file.type);
      alert("Hanya file PNG yang diperbolehkan");
      return;
    }

    // ✅ NO FILE SIZE LIMIT - Large files supported (updated 2026-02-17)
    console.log("✅ Valid PNG file:", file.name, "Size:", (file.size / 1024 / 1024).toFixed(2), "MB");
    setFrameImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = async () => {
      console.log("✅ Preview created successfully");
      setFrameImagePreview(reader.result);

      // Auto-detect slots from transparent areas
      console.log("🔍 Starting automatic slot detection...");
      setAutoDetecting(true);

      try {
        const detectedSlots = await quickDetectSlots(reader.result);
        console.log("✅ Auto-detected slots:", detectedSlots.length);

        if (detectedSlots.length > 0) {
          setSlots(detectedSlots);
          setMaxCaptures(detectedSlots.length);
          alert(
            `🎯 Berhasil mendeteksi ${detectedSlots.length} slot foto secara otomatis!\n\n` +
              `Anda dapat edit posisi slot jika perlu, atau langsung upload frame.`
          );
        } else {
          console.log("⚠️ No slots detected, user can add manually");
          alert(
            "⚠️ Tidak ada area transparan yang terdeteksi.\n\n" +
              "Gunakan tombol 'Add Slot' untuk menambah slot secara manual."
          );
        }
      } catch (error) {
        console.error("❌ Error detecting slots:", error);
        alert(
          "⚠️ Gagal mendeteksi slot otomatis.\n\n" +
            "Gunakan tombol 'Add Slot' untuk menambah slot secara manual."
        );
      } finally {
        setAutoDetecting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Add new slot
  const addSlot = () => {
    const newSlot = {
      id: `slot_${slots.length + 1}`,
      left: 0.1,
      top: 0.1,
      width: 0.4,
      height: 0.3,
      aspectRatio: "4:5",
      zIndex: 2,
      photoIndex: slots.length % maxCaptures,
    };
    setSlots([...slots, newSlot]);
  };

  // Update slot configuration
  const updateSlot = (index, field, value) => {
    const updatedSlots = [...slots];
    updatedSlots[index] = {
      ...updatedSlots[index],
      [field]:
        field === "left" ||
        field === "top" ||
        field === "width" ||
        field === "height"
          ? parseFloat(value)
          : value,
    };
    setSlots(updatedSlots);
  };

  // Delete slot
  const deleteSlot = (index) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  // Save frame
  const handleSaveFrame = async () => {
    console.log("🔥 handleSaveFrame called");
    console.log("📝 Frame name:", frameName);
    console.log("🖼️ Frame image file:", frameImageFile);
    console.log("📍 Slots:", slots);
    console.log("🔧 VPS Mode:", isVPSMode);

    // Validation
    if (!frameName.trim()) {
      alert("Nama frame harus diisi");
      return;
    }

    if (!frameImageFile) {
      alert("Upload gambar frame terlebih dahulu");
      return;
    }

    if (slots.length === 0) {
      alert("Tambahkan minimal 1 slot foto");
      return;
    }

    setSaving(true);
    console.log("💾 Starting save process...");

    // Add timeout protection
    const timeoutId = setTimeout(() => {
      console.error("⏰ Save timeout after 30 seconds");
      setSaving(false);
      alert(
        "❌ Timeout: Proses simpan terlalu lama.\n\n" +
        "Kemungkinan penyebab:\n" +
        "- File image terlalu besar\n" +
        "- LocalStorage penuh\n" +
        "- Browser memory issue\n\n" +
        "Coba:\n" +
        "1. Compress image (< 500KB)\n" +
        "2. Clear browser cache\n" +
        "3. Reload page dan coba lagi"
      );
    }, 30000); // 30 seconds timeout

    try {
      // Create frame configuration object with unique ID (name + timestamp)
      const uniqueId = frameName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

      // Canvas layout based on selected canvas size
      const canvasLayoutMap = {
        story: { aspectRatio: "9:16", canvasWidth: 1080, canvasHeight: 1920, orientation: "portrait" },
        "4r":  { aspectRatio: "4r",   canvasWidth: 1200, canvasHeight: 1800, orientation: "portrait" },
        "2r":  { aspectRatio: "2r",   canvasWidth: 600,  canvasHeight: 1800, orientation: "portrait" },
      };
      const selectedLayout = canvasLayoutMap[canvasSize] || canvasLayoutMap.story;

      const frameConfig = {
        id: uniqueId,
        name: frameName,
        description: frameDescription,
        category: frameCategory,
        maxCaptures: parseInt(maxCaptures),
        duplicatePhotos,
        slots: slots.map((slot) => ({
          ...slot,
          left: parseFloat(slot.left),
          top: parseFloat(slot.top),
          width: parseFloat(slot.width),
          height: parseFloat(slot.height),
          zIndex: parseInt(slot.zIndex),
          photoIndex: parseInt(slot.photoIndex),
        })),
        layout: {
          ...selectedLayout,
          backgroundColor: "#ffffff",
        },
      };

      console.log("📦 Frame config created:", frameConfig);

      // Use unified frame service (handles both Firebase/localStorage and VPS)
      console.log("💾 Using unified frame service (Mode: " + (isVPSMode ? "VPS" : "Firebase/LocalStorage") + ")");
      
      const result = await unifiedFrameService.createFrame(
        {
          ...frameConfig,
          createdBy: user?.email || "admin",
        },
        frameImageFile
      );

      console.log("✅ Save result:", result);

      if (result.success) {
        clearTimeout(timeoutId); // Clear timeout on success
        
        alert(
          "✅ Frame berhasil disimpan ke Firebase!\n\n" +
          "Frame ID: " + (result.frameId || frameConfig.id) + "\n\n" +
          "Frame sekarang tersedia di halaman Frames untuk semua user."
        );
        navigate("/admin/frames");
      } else {
        clearTimeout(timeoutId);
        throw new Error(result.message || "Failed to save frame");
      }
    } catch (error) {
      clearTimeout(timeoutId); // Clear timeout on error
      console.error("❌ Error saving frame:", error);
      console.error("❌ Error stack:", error.stack);
      
      // Better error message
      let errorMessage = error.message;
      
      if (error.message.includes("quota") || error.message.includes("Quota")) {
        errorMessage = 
          "❌ LocalStorage Penuh!\n\n" +
          "Solusi:\n" +
          "1. Compress image Anda (<200KB)\n" +
          "2. Hapus frame lama di console:\n" +
          "   window.storageDebug.clearFrames(true)\n" +
          "3. Clear browser cache\n\n" +
          "Tips: Gunakan tinypng.com untuk compress image";
      }
      
      alert("Gagal menyimpan frame:\n\n" + errorMessage);
    } finally {
      setSaving(false);
      console.log("🏁 Save process completed");
    }
  };

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, #fdf7f4 0%, #fff 50%, #f7f1ed 100%)",
        minHeight: "100vh",
        padding: "32px 0 48px",
      }}
    >
      {/* Header with Back Button */}
      <div style={{ maxWidth: "1120px", margin: "0 auto 32px", padding: "0 16px" }}>
        <button
          onClick={() => navigate("/admin")}
          className="admin-button-secondary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
            padding: "10px 16px",
          }}
        >
          <ArrowLeft size={18} />
          Kembali ke Dashboard
        </button>
        <h1
          style={{
            fontSize: "clamp(22px, 4vw, 34px)",
            fontWeight: "800",
            color: "#222",
            margin: "0 0 8px",
          }}
        >
          Upload Custom Frame
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>
          Buat frame baru untuk photobooth
        </p>
      </div>

      {/* Debug Info */}
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto 20px",
          padding: "16px",
          backgroundColor: "#dbeafe",
          border: "2px solid #3b82f6",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      >
        <strong>☁️ Storage Info (Firebase Cloud):</strong>
        <br />
        Component: AdminUploadFrame ✅<br />
        User: {user?.email || "Not logged in"}
        <br />
        Path: /admin/upload-frame
        {storageInfo?.isFirebase && (
          <>
            <br />
            <strong style={{ color: "#2563eb" }}>
              � Firebase Storage: Unlimited Cloud Storage
            </strong>
            <br />
            <span style={{ color: "#2563eb" }}>
              ✅ Data disimpan di Firebase Firestore & Storage
            </span>
          </>
        )}
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={handleClearStorage}
            style={{
              backgroundColor: "#f59e0b",
              color: "white",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            🗑️ Hapus Custom Frames
          </button>
          <button
            onClick={handleClearAllStorage}
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            ⚠️ Bersihkan Semua Storage
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {/* Left Column - Configuration */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            {/* Basic Info */}
            <section className="admin-card">
              <div className="admin-card-header">
                <h2 className="admin-card-title">Informasi Frame</h2>
              </div>

              <div
                className="admin-card-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div>
                  <label className="admin-label">Nama Frame *</label>
                  <input
                    type="text"
                    value={frameName}
                    onChange={(e) => setFrameName(e.target.value)}
                    className="admin-input"
                    placeholder="contoh: FremioSeries-red-3"
                  />
                </div>

                <div>
                  <label className="admin-label">Deskripsi</label>
                  <textarea
                    value={frameDescription}
                    onChange={(e) => setFrameDescription(e.target.value)}
                    rows={3}
                    className="admin-textarea"
                    placeholder="Deskripsi frame..."
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                  }}
                >
                  <div>
                    <label className="admin-label">Kategori</label>
                    <select
                      value={frameCategory}
                      onChange={(e) => setFrameCategory(e.target.value)}
                      className="admin-select"
                    >
                      <option value="custom">Custom</option>
                      <option value="fremio-series">Fremio Series</option>
                      <option value="inspired-by">Inspired By</option>
                      <option value="seasonal">Seasonal</option>
                    </select>
                  </div>

                  <div>
                    <label className="admin-label">Jumlah Foto</label>
                    <input
                      type="number"
                      value={maxCaptures}
                      onChange={(e) => setMaxCaptures(e.target.value)}
                      min="1"
                      max="10"
                      className="admin-input"
                    />
                  </div>
                </div>

                {/* Canvas Size Selector */}
                <div>
                  <label className="admin-label">Ukuran Canvas</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                    {[
                      { key: "story", label: "Story Instagram", sub: "1080×1920 (9:16)" },
                      { key: "4r",    label: "4R (Photostrip)",  sub: "1200×1800 (2:3)"  },
                      { key: "2r",    label: "2R",               sub: "600×1800 (1:3)"   },
                    ].map(({ key, label, sub }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCanvasSize(key)}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "8px",
                          border: canvasSize === key ? "2px solid #c89585" : "2px solid #e0b7a9",
                          background: canvasSize === key ? "linear-gradient(135deg, #e0b7a9, #c89585)" : "#fff",
                          color: canvasSize === key ? "white" : "#4a302b",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor: "pointer",
                          lineHeight: 1.4,
                          textAlign: "left",
                        }}
                      >
                        <div>{label}</div>
                        <div style={{ fontSize: "10px", opacity: 0.85, fontWeight: 500 }}>{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="checkbox"
                    id="duplicatePhotos"
                    checked={duplicatePhotos}
                    onChange={(e) => setDuplicatePhotos(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <label
                    htmlFor="duplicatePhotos"
                    style={{
                      fontSize: "14px",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    Duplikat foto (2 copy per foto)
                  </label>
                </div>
              </div>
            </section>

            {/* Frame Image Upload */}
            <section className="admin-card">
              <div className="admin-card-header">
                <h2 className="admin-card-title">Upload Frame (PNG)</h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#a89289",
                    marginTop: "4px",
                  }}
                >
                  Upload gambar frame dalam format PNG dengan area transparan
                  untuk foto
                </p>
              </div>

              <div
                className="admin-card-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                {/* Upload Area */}
                {!frameImagePreview ? (
                  <div
                    onClick={() => {
                      console.log("🖱️ Upload area clicked");
                      document.getElementById("frame-upload").click();
                    }}
                    style={{
                      border: "3px dashed #e0b7a9",
                      borderRadius: "16px",
                      padding: "48px 32px",
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      backgroundColor: "#fefcfb",
                      minHeight: "280px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#d4a89a";
                      e.currentTarget.style.backgroundColor = "#fff5f2";
                      e.currentTarget.style.transform = "scale(1.01)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e0b7a9";
                      e.currentTarget.style.backgroundColor = "#fefcfb";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <input
                      type="file"
                      accept="image/png"
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                      id="frame-upload"
                    />

                    {/* Upload Icon */}
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "50%",
                        backgroundColor: "#fff0ec",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "20px",
                        border: "3px solid #e0b7a9",
                      }}
                    >
                      <Upload size={40} style={{ color: "#e0b7a9" }} />
                    </div>

                    {/* Upload Text */}
                    <h3
                      style={{
                        fontSize: "20px",
                        fontWeight: "700",
                        color: "#2d1b14",
                        marginBottom: "8px",
                      }}
                    >
                      Klik atau Drag & Drop File PNG
                    </h3>

                    <p
                      style={{
                        color: "#8b7064",
                        marginBottom: "16px",
                        fontSize: "15px",
                        lineHeight: "1.6",
                      }}
                    >
                      Upload gambar frame photobooth Anda di sini
                    </p>

                    {/* File Info */}
                    <div
                      style={{
                        backgroundColor: "#fff",
                        padding: "16px 24px",
                        borderRadius: "12px",
                        border: "2px solid #ecdeda",
                        maxWidth: "400px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}
                      >
                        <FileImage size={20} style={{ color: "#e0b7a9" }} />
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "#6d5449",
                          }}
                        >
                          Spesifikasi File:
                        </span>
                      </div>
                      <ul
                        style={{
                          fontSize: "12px",
                          color: "#a89289",
                          listStyle: "none",
                          padding: 0,
                          margin: 0,
                          lineHeight: "1.8",
                        }}
                      >
                        <li>✓ Format: PNG dengan transparency</li>
                        <li>✓ Story: 1080×1920 px (9:16)</li>
                        <li>✓ 4R: 1200×1800 px (2:3)</li>
                        <li>✓ 2R: 600×1800 px (1:3)</li>
                        <li>✓ Max size: 15MB</li>
                      </ul>
                    </div>

                    {/* Decorative Background */}
                    <div
                      style={{
                        position: "absolute",
                        top: "-50%",
                        right: "-50%",
                        width: "200%",
                        height: "200%",
                        background:
                          "radial-gradient(circle, rgba(224,183,169,0.05) 0%, transparent 70%)",
                        pointerEvents: "none",
                        zIndex: 0,
                      }}
                    />
                  </div>
                ) : (
                  /* Preview with Edit Button */
                  <div>
                    <div style={{ position: "relative", marginBottom: "16px" }}>
                      <img
                        src={frameImagePreview}
                        alt="Frame preview"
                        style={{
                          width: "100%",
                          borderRadius: "14px",
                          border: "3px solid #e0b7a9",
                          boxShadow: "0 8px 24px rgba(224, 183, 169, 0.2)",
                        }}
                      />
                      <div
                        className="admin-badge-success"
                        style={{
                          position: "absolute",
                          top: "16px",
                          right: "16px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          padding: "8px 16px",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        <CheckCircle size={18} />
                        File Terupload
                      </div>
                    </div>

                    {/* File Info Display */}
                    {frameImageFile && (
                      <div
                        style={{
                          backgroundColor: "#fefcfb",
                          padding: "16px",
                          borderRadius: "12px",
                          border: "2px solid #ecdeda",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <FileImage size={24} style={{ color: "#e0b7a9" }} />
                          <div>
                            <p
                              style={{
                                fontSize: "14px",
                                fontWeight: "600",
                                color: "#2d1b14",
                                marginBottom: "2px",
                              }}
                            >
                              {frameImageFile.name}
                            </p>
                            <p style={{ fontSize: "12px", color: "#a89289" }}>
                              {(frameImageFile.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setFrameImageFile(null);
                            setFrameImagePreview("");
                          }}
                          className="admin-button-secondary"
                          style={{ padding: "8px 16px", fontSize: "13px" }}
                        >
                          Ganti File
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Slot Configuration */}
            <section className="admin-card">
              <div
                className="admin-card-header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h2 className="admin-card-title">
                    Slot Foto ({slots.length})
                  </h2>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#a89289",
                      marginTop: "4px",
                    }}
                  >
                    {autoDetecting
                      ? "🔍 Mendeteksi slot otomatis..."
                      : "Slot akan terdeteksi otomatis saat upload PNG"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  {frameImagePreview && (
                    <button
                      onClick={async () => {
                        setAutoDetecting(true);
                        try {
                          const detectedSlots = await quickDetectSlots(
                            frameImagePreview
                          );
                          if (detectedSlots.length > 0) {
                            setSlots(detectedSlots);
                            setMaxCaptures(detectedSlots.length);
                            alert(
                              `✅ Berhasil mendeteksi ${detectedSlots.length} slot!`
                            );
                          } else {
                            alert("⚠️ Tidak ada area transparan terdeteksi");
                          }
                        } catch (error) {
                          console.error("❌ Error re-detecting slots:", error);
                          alert("❌ Gagal mendeteksi slot");
                        } finally {
                          setAutoDetecting(false);
                        }
                      }}
                      disabled={autoDetecting}
                      className="admin-button-secondary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        opacity: autoDetecting ? 0.6 : 1,
                        cursor: autoDetecting ? "wait" : "pointer",
                      }}
                    >
                      <Eye size={20} />
                      {autoDetecting ? "Detecting..." : "Re-detect Slots"}
                    </button>
                  )}
                  <button
                    onClick={addSlot}
                    className="admin-button-primary"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Plus size={20} />
                    Tambah Manual
                  </button>
                </div>
              </div>

              <div
                className="admin-card-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {slots.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "#a89289",
                      backgroundColor: "#fefcfb",
                      borderRadius: "12px",
                      border: "2px dashed #e0b7a9",
                    }}
                  >
                    <FileImage
                      size={48}
                      style={{ margin: "0 auto 12px", color: "#c8b5ae" }}
                    />
                    <p
                      style={{
                        fontSize: "15px",
                        fontWeight: "600",
                        marginBottom: "8px",
                      }}
                    >
                      {frameImagePreview
                        ? "🎯 Slot akan terdeteksi otomatis"
                        : "Upload frame PNG untuk auto-detect slot"}
                    </p>
                    <p style={{ fontSize: "13px", color: "#b8a39d" }}>
                      {frameImagePreview
                        ? "Klik 'Re-detect Slots' atau 'Tambah Manual'"
                        : "Area transparan pada PNG akan otomatis terdeteksi sebagai slot foto"}
                    </p>
                  </div>
                ) : (
                  slots.map((slot, index) => (
                    <SlotConfig
                      key={index}
                      slot={slot}
                      index={index}
                      maxCaptures={maxCaptures}
                      onUpdate={updateSlot}
                      onDelete={deleteSlot}
                    />
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Right Column - Live Preview */}
          <div
            style={{ position: "sticky", top: "32px", alignSelf: "flex-start" }}
          >
            <section className="admin-card">
              <div
                className="admin-card-header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2 className="admin-card-title">Live Preview</h2>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="admin-button-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Eye size={20} />
                  {showPreview ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>

              <div className="admin-card-body">
                {showPreview && frameImagePreview && (
                  <div
                    style={{
                      position: "relative",
                      backgroundColor: "#f7f1ed",
                      borderRadius: "14px",
                      overflow: "hidden",
                      aspectRatio: canvasSize === "story" ? "9/16" : canvasSize === "4r" ? "2/3" : "5/7",
                    }}
                  >
                    {/* Frame image */}
                    <img
                      src={frameImagePreview}
                      alt="Frame"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        zIndex: 3,
                      }}
                    />

                    {/* Photo slots overlay */}
                    {slots.map((slot, index) => {
                      // Convert aspect ratio string to CSS value
                      const getAspectRatioCSS = (ratio) => {
                        switch (ratio) {
                          case "1:1":
                            return "1/1";
                          case "4:5":
                            return "4/5";
                          case "3:4":
                            return "3/4";
                          case "16:9":
                            return "16/9";
                          case "9:16":
                            return "9/16";
                          default:
                            return "4/5";
                        }
                      };

                      return (
                        <div
                          key={index}
                          style={{
                            position: "absolute",
                            border: "2px solid #3b82f6",
                            backgroundColor: "rgba(59, 130, 246, 0.15)",
                            left: `${slot.left * 100}%`,
                            top: `${slot.top * 100}%`,
                            width: `${slot.width * 100}%`,
                            aspectRatio: getAspectRatioCSS(slot.aspectRatio),
                            zIndex: 1,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: "4px",
                              left: "4px",
                              backgroundColor: "#3b82f6",
                              color: "white",
                              fontSize: "11px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontWeight: "600",
                            }}
                          >
                            Slot {index + 1} (Foto {slot.photoIndex + 1})
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!showPreview && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "60px 20px",
                      color: "#a89289",
                    }}
                  >
                    <Eye
                      size={48}
                      style={{ margin: "0 auto 12px", color: "#c8b5ae" }}
                    />
                    <p style={{ fontSize: "15px" }}>
                      Klik "Tampilkan" untuk preview
                    </p>
                  </div>
                )}
                {/* Canvas size info badge */}
                <div style={{ marginTop: "12px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: "999px",
                    background: "#f3e8e3",
                    color: "#7a4a3a",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}>
                    Canvas: {canvasSize === "story" ? "Story Instagram (9:16)" : canvasSize === "4r" ? "4R Photostrip (2:3)" : "2R (1:3)"}
                  </span>
                </div>
              </div>
            </section>

            {/* Action Buttons */}
            <div style={{ marginTop: "24px", display: "flex", gap: "16px" }}>
              <button
                onClick={() => navigate("/admin/frames")}
                className="admin-button-secondary"
                style={{ flex: 1, padding: "14px" }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveFrame}
                disabled={saving}
                className="admin-button-primary"
                style={{
                  flex: 1,
                  padding: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  opacity: saving ? 0.5 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <Save size={20} />
                {saving ? "Menyimpan..." : "Simpan Frame"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Slot Configuration Component
function SlotConfig({ slot, index, maxCaptures, onUpdate, onDelete }) {
  return (
    <div
      style={{
        border: "2px solid var(--border)",
        borderRadius: "12px",
        padding: "16px",
        backgroundColor: "#fdfbfa",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <h3 style={{ fontWeight: "700", color: "#2d1b14", fontSize: "15px" }}>
          Slot {index + 1}
        </h3>
        <button
          onClick={() => onDelete(index)}
          style={{
            color: "#dc2626",
            padding: "6px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            borderRadius: "6px",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#fee2e2")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
      >
        <div>
          <label className="admin-label" style={{ fontSize: "12px" }}>
            Kiri (0.0-1.0)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={slot.left}
            onChange={(e) => onUpdate(index, "left", e.target.value)}
            className="admin-input"
            style={{ fontSize: "13px", padding: "8px 12px" }}
          />
        </div>

        <div>
          <label className="admin-label" style={{ fontSize: "12px" }}>
            Atas (0.0-1.0)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={slot.top}
            onChange={(e) => onUpdate(index, "top", e.target.value)}
            className="admin-input"
            style={{ fontSize: "13px", padding: "8px 12px" }}
          />
        </div>

        <div>
          <label className="admin-label" style={{ fontSize: "12px" }}>
            Lebar (0.0-1.0)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={slot.width}
            onChange={(e) => onUpdate(index, "width", e.target.value)}
            className="admin-input"
            style={{ fontSize: "13px", padding: "8px 12px" }}
          />
        </div>

        <div>
          <label className="admin-label" style={{ fontSize: "12px" }}>
            Tinggi (0.0-1.0)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={slot.height}
            onChange={(e) => onUpdate(index, "height", e.target.value)}
            className="admin-input"
            style={{ fontSize: "13px", padding: "8px 12px" }}
          />
        </div>

        <div>
          <label className="admin-label" style={{ fontSize: "12px" }}>
            Aspect Ratio
          </label>
          <select
            value={slot.aspectRatio || "4:5"}
            onChange={(e) => onUpdate(index, "aspectRatio", e.target.value)}
            className="admin-select"
            style={{ fontSize: "13px", padding: "8px 12px" }}
          >
            <option value="4:5">4:5 (Portrait)</option>
            <option value="1:1">1:1 (Square)</option>
            <option value="16:9">16:9 (Landscape)</option>
            <option value="3:4">3:4 (Portrait)</option>
            <option value="9:16">9:16 (Tall Portrait)</option>
          </select>
        </div>

        <div>
          <label className="admin-label" style={{ fontSize: "12px" }}>
            Index Foto
          </label>
          <select
            value={slot.photoIndex}
            onChange={(e) => onUpdate(index, "photoIndex", e.target.value)}
            className="admin-select"
            style={{ fontSize: "13px", padding: "8px 12px" }}
          >
            {Array.from({ length: maxCaptures }, (_, i) => (
              <option key={i} value={i}>
                Foto {i + 1}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          fontSize: "12px",
          color: "#8b7064",
          backgroundColor: "#fff",
          padding: "10px",
          borderRadius: "8px",
          marginTop: "12px",
          border: "1px solid var(--border)",
        }}
      >
        Posisi: ({(slot.left * 100).toFixed(1)}%, {(slot.top * 100).toFixed(1)}
        %) • Ukuran: {(slot.width * 100).toFixed(1)}% ×{" "}
        {(slot.height * 100).toFixed(1)}%
      </div>
    </div>
  );
}
