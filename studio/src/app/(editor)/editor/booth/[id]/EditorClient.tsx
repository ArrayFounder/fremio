"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type EditTarget = "background" | "logo" | "tutorial_background" | "cta" | "tutorial_header" | "tutorial_steps" | "tutorial_cta" | "tutorial_timer" | "payment_background" | "frame_select_bg" | "frame_select_panel" | "camera_bg" | "delivery_bg" | "delivery_header" | "print_count_bg" | "preview_bg" | "overlay" | null;
type EditorScreen = "idle" | "tutorial" | "payment" | "frame_select" | "camera" | "preview" | "print_count" | "payment_qris" | "delivery";

interface OverlayElement {
  id:          string;
  screen:      EditorScreen;
  type:        "text" | "image";
  x:           number;   // % from left (center of element)
  y:           number;   // % from top (center of element)
  width:       number;   // % of container width
  text?:       string;
  fontSize?:   number;
  fontWeight?: number;
  color?:      string;
  textAlign?:  "left" | "center" | "right";
  imageUrl?:   string;
}

interface WelcomeScreenPrefs {
  backgroundType:      "color" | "image";
  backgroundColor:     string;
  backgroundImageUrl:  string | null;
  ctaText:             string;
  ctaColor:            string;
  ctaX:                number;
  ctaY:                number;
  ctaWidth:            number;
  logoX:               number;
  logoY:               number;
  logoWidth:           number;
  logoImageUrl?:       string | null;  // Custom logo URL (overrides booth.logoUrl)
  tutorialStepsX:      number;
  tutorialStepsY:      number;
  tutorialStepsWidth:  number;
  tutorialHeaderText:  string;
  tutorialHeaderX:     number;
  tutorialHeaderY:     number;
  tutorialHeaderSize:  number;
  tutorialHeaderFont:  string;
  tutorialHeaderColor: string;
  tutorialCtaX:        number;
  tutorialCtaY:        number;
  tutorialCtaWidth:    number;
  tutorialCtaText:     string;
  tutorialCtaColor:    string;
  tutorialBackgroundType:     "color" | "image";
  tutorialBackgroundColor:    string;
  tutorialBackgroundImageUrl: string | null;
  tutorialStyle:              "card" | "minimal" | "colorful" | "columns" | "bold";
  paymentBgColor:    string;
  paymentHeaderText: string;
  paymentStyle:      "card" | "minimal" | "colorful" | "columns" | "bold";
  /** Timer widget visual */
  timerX:         number;
  timerY:         number;
  timerRingColor: string;
  timerBgColor:   string;
  /** Per-screen backgrounds & teks */
  frameSelectBgColor?:    string;
  frameSelectHeaderText?: string;
  frameSelectPanelColor?: string;
  cameraBgColor?:         string;
  deliveryBgColor?:       string;
  deliveryHeaderText?:    string;
  printCountBgColor?:     string;
  previewBgColor?:        string;
  overlayElements?:       OverlayElement[];
}

interface BoothData {
  boothId:         string;
  boothName:       string;
  slug:            string;
  pricePerSession: number;
  primaryColor:    string;
  accentColor:     string;
  logoUrl:         string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildDefaultPrefs(primaryColor: string, accentColor: string): WelcomeScreenPrefs {
  return {
    backgroundType:      "color",
    backgroundColor:     primaryColor,
    backgroundImageUrl:  null,
    ctaText:             "✨ Mulai Foto",
    ctaColor:            accentColor === "#ffffff" ? "#deb7a9" : accentColor,
    ctaX:                50,
    ctaY:                80,
    ctaWidth:            72,
    logoX:               50,
    logoY:               50,
    logoWidth:           40,
    logoImageUrl:        null,
    tutorialStepsX:      50,
    tutorialStepsY:      42,
    tutorialStepsWidth:  92,
    tutorialHeaderText:  "Tutorial",
    tutorialHeaderX:     50,
    tutorialHeaderY:     10,
    tutorialHeaderSize:  28,
    tutorialHeaderFont:  "inherit",
    tutorialHeaderColor: accentColor,
    tutorialCtaX:        50,
    tutorialCtaY:        82,
    tutorialCtaWidth:    72,
    tutorialCtaText:     "Mulai Sekarang →",
    tutorialCtaColor:    accentColor,
    tutorialBackgroundType:     "color",
    tutorialBackgroundColor:    primaryColor,
    tutorialBackgroundImageUrl: null,
    tutorialStyle:              "bold",
    paymentBgColor:    primaryColor,
    paymentHeaderText: "Pilih Metode Pembayaran",
    paymentStyle:      "bold",
    timerX:         88,
    timerY:         8,
    timerRingColor: "#ffffff",
    timerBgColor:   "#000000",
    frameSelectBgColor:    primaryColor,
    frameSelectHeaderText: "Pilih Frame",
    frameSelectPanelColor: isLightColor(primaryColor) ? "#4a4a6a" : "#5a5a7a",
    cameraBgColor:         primaryColor,
    deliveryBgColor:       primaryColor,
    deliveryHeaderText:    "Foto Siap Diunduh",
    printCountBgColor:     primaryColor,
    previewBgColor:        primaryColor,
    overlayElements:       [],
  };
}

function mergePrefs(saved: Record<string, unknown> | null, primaryColor: string, accentColor: string): WelcomeScreenPrefs {
  const d = buildDefaultPrefs(primaryColor, accentColor);
  if (!saved) return d;
  return {
    backgroundType:      (saved.backgroundType as "color" | "image") ?? d.backgroundType,
    backgroundColor:     (saved.backgroundColor as string) ?? d.backgroundColor,
    backgroundImageUrl:  (saved.backgroundImageUrl as string | null) ?? null,
    ctaText:             (saved.ctaText as string) ?? d.ctaText,
    ctaColor:            (saved.ctaColor as string) ?? d.ctaColor,
    ctaX:                typeof saved.ctaX === "number" ? saved.ctaX : d.ctaX,
    ctaY:                typeof saved.ctaY === "number" ? saved.ctaY : d.ctaY,
    ctaWidth:            typeof saved.ctaWidth === "number" ? saved.ctaWidth : d.ctaWidth,
    logoX:               typeof saved.logoX === "number" ? saved.logoX : d.logoX,
    logoY:               typeof saved.logoY === "number" ? saved.logoY : d.logoY,
    logoWidth:           typeof saved.logoWidth === "number" ? saved.logoWidth : d.logoWidth,
    logoImageUrl:        (saved.logoImageUrl as string | null | undefined) ?? d.logoImageUrl,
    tutorialStepsX:      typeof saved.tutorialStepsX === "number" ? saved.tutorialStepsX : d.tutorialStepsX,
    tutorialStepsY:      typeof saved.tutorialStepsY === "number" ? saved.tutorialStepsY : d.tutorialStepsY,
    tutorialStepsWidth:  typeof saved.tutorialStepsWidth === "number" ? saved.tutorialStepsWidth : d.tutorialStepsWidth,
    tutorialHeaderText:  (saved.tutorialHeaderText as string) ?? d.tutorialHeaderText,
    tutorialHeaderX:     typeof saved.tutorialHeaderX === "number" ? saved.tutorialHeaderX : d.tutorialHeaderX,
    tutorialHeaderY:     typeof saved.tutorialHeaderY === "number" ? saved.tutorialHeaderY : d.tutorialHeaderY,
    tutorialHeaderSize:  typeof saved.tutorialHeaderSize === "number" ? saved.tutorialHeaderSize : d.tutorialHeaderSize,
    tutorialHeaderFont:  (saved.tutorialHeaderFont as string) ?? d.tutorialHeaderFont,
    tutorialHeaderColor: (saved.tutorialHeaderColor as string) ?? d.tutorialHeaderColor,
    tutorialCtaX:        typeof saved.tutorialCtaX === "number" ? saved.tutorialCtaX : d.tutorialCtaX,
    tutorialCtaY:        typeof saved.tutorialCtaY === "number" ? saved.tutorialCtaY : d.tutorialCtaY,
    tutorialCtaWidth:    typeof saved.tutorialCtaWidth === "number" ? saved.tutorialCtaWidth : d.tutorialCtaWidth,
    tutorialCtaText:     (saved.tutorialCtaText as string) ?? d.tutorialCtaText,
    tutorialCtaColor:    (saved.tutorialCtaColor as string) ?? d.tutorialCtaColor,
    tutorialBackgroundType:     (saved.tutorialBackgroundType as "color" | "image") ?? d.tutorialBackgroundType,
    tutorialBackgroundColor:    (saved.tutorialBackgroundColor as string) ?? d.tutorialBackgroundColor,
    tutorialBackgroundImageUrl: (saved.tutorialBackgroundImageUrl as string | null) ?? null,
    tutorialStyle:              (saved.tutorialStyle as "card" | "minimal" | "colorful" | "columns" | "bold") ?? d.tutorialStyle,
    paymentBgColor:    (saved.paymentBgColor as string) ?? d.paymentBgColor,
    paymentHeaderText: (saved.paymentHeaderText as string) ?? d.paymentHeaderText,
    paymentStyle:      (saved.paymentStyle as "card" | "minimal" | "colorful" | "columns" | "bold") ?? d.paymentStyle,
    timerX:         typeof saved.timerX === "number" ? saved.timerX : d.timerX,
    timerY:         typeof saved.timerY === "number" ? saved.timerY : d.timerY,
    timerRingColor: (saved.timerRingColor as string) ?? d.timerRingColor,
    timerBgColor:   (saved.timerBgColor as string) ?? d.timerBgColor,
    frameSelectBgColor:    (saved.frameSelectBgColor as string | undefined) ?? d.frameSelectBgColor,
    frameSelectHeaderText: (saved.frameSelectHeaderText as string | undefined) ?? d.frameSelectHeaderText,
    frameSelectPanelColor: (saved.frameSelectPanelColor as string | undefined) ?? d.frameSelectPanelColor,
    cameraBgColor:         (saved.cameraBgColor as string | undefined) ?? d.cameraBgColor,
    deliveryBgColor:       (saved.deliveryBgColor as string | undefined) ?? d.deliveryBgColor,
    deliveryHeaderText:    (saved.deliveryHeaderText as string | undefined) ?? d.deliveryHeaderText,
    printCountBgColor:     (saved.printCountBgColor as string | undefined) ?? d.printCountBgColor,
    previewBgColor:        (saved.previewBgColor as string | undefined) ?? d.previewBgColor,
    overlayElements:       (saved.overlayElements as OverlayElement[] | undefined) ?? d.overlayElements,
  };
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// ─── Tutorial Style Picker ──────────────────────────────────────────────────────

const TUTORIAL_STYLE_OPTIONS = [
  { id: "card",     label: "Card" },
  { id: "minimal",  label: "Minimal" },
  { id: "colorful", label: "Warna" },
  { id: "columns",  label: "Kolom" },
  { id: "bold",     label: "Bold" },
] as const;

function StyleThumbnail({ id }: { id: string }) {
  const shared: React.CSSProperties = { height: 44, overflow: "hidden" };
  if (id === "card") return (
    <div style={{ ...shared, background: "#1a1a3a", padding: 4, display: "flex", gap: 3, alignItems: "center" }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ flex: 1, height: 36, borderRadius: 4, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }} />
      ))}
    </div>
  );
  if (id === "minimal") return (
    <div style={{ ...shared, background: "#f3f4f6", padding: 3 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, height: "100%" }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{ background: "white", borderRadius: 2, display: "flex", alignItems: "center", gap: 2, padding: "0 3px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1e3a5f", flexShrink: 0 }} />
            <div style={{ height: 2, background: "#ccc", flex: 1, borderRadius: 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
  if (id === "colorful") return (
    <div style={{ ...shared, background: "#eee", padding: 2 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, height: "100%" }}>
        {["#bae6fd","#fda4af","#e9d5ff","#bbf7d0","#fed7aa","#a5f3fc"].map((c, i) => (
          <div key={i} style={{ background: c, borderRadius: 3 }} />
        ))}
      </div>
    </div>
  );
  if (id === "columns") return (
    <div style={{ ...shared, background: "#111", padding: 3, display: "flex", gap: 2 }}>
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.3)" }} />
          <div style={{ height: 2, width: "80%", background: "rgba(255,255,255,0.2)", borderRadius: 1 }} />
        </div>
      ))}
    </div>
  );
  // bold
  return (
    <div style={{ ...shared }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", height: "100%" }}>
        {["#7c3aed","#db2777","#0891b2","#ea580c","#dc2626","#16a34a"].map((c, i) => (
          <div key={i} style={{ background: c, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "white" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorialStylePicker({ value, onChange, accentColor }: {
  value: string;
  onChange: (s: string) => void;
  accentColor: string;
}) {
  return (
    <div style={{
      background: "rgba(15,15,26,0.88)", backdropFilter: "blur(8px)",
      borderRadius: 14, padding: "8px 7px", display: "flex", flexDirection: "column", gap: 5,
      border: "1px solid rgba(255,255,255,0.12)",
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", marginBottom: 2 }}>
        Gaya
      </span>
      {TUTORIAL_STYLE_OPTIONS.map((s) => (
        <button key={s.id} onClick={() => onChange(s.id)} title={s.label}
          style={{
            width: 68, borderRadius: 8, overflow: "hidden", cursor: "pointer",
            border: value === s.id ? `2px solid ${accentColor}` : "2px solid rgba(255,255,255,0.12)",
            transition: "border-color 0.15s", padding: 0, background: "transparent",
          }}>
          <StyleThumbnail id={s.id} />
          <div style={{
            fontSize: 9, fontWeight: 600, padding: "3px 0",
            color: value === s.id ? accentColor : "rgba(255,255,255,0.45)",
            background: "rgba(0,0,0,0.55)", textAlign: "center",
          }}>
            {s.label}
          </div>
        </button>
      ))}
    </div>
  );
}

function PropsPanel({
  target,
  prefs,
  accentColor,
  onPrefsChange,
  onClose,
}: {
  target:         EditTarget;
  prefs:          WelcomeScreenPrefs;
  accentColor:    string;
  onPrefsChange:  (p: WelcomeScreenPrefs) => void;
  onClose:        () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = useCallback(
    <K extends keyof WelcomeScreenPrefs>(key: K, value: WelcomeScreenPrefs[K]) =>
      onPrefsChange({ ...prefs, [key]: value }),
    [prefs, onPrefsChange]
  );

  if (!target) return null;

  return (
    <div style={{
      position: "fixed", top: "80px", right: "24px", width: "300px",
      background: "white", borderRadius: "16px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 100, overflow: "hidden",
    }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: accentColor }}>
        <span className="font-bold text-sm text-white">
          {target === "background" ? "🎨 Background"
            : target === "tutorial_background" ? "🎨 Background Tutorial"
            : target === "payment_background" ? "🎨 Background Pembayaran"
            : target === "frame_select_bg" ? "🖼️ Background Pilih Frame"
            : target === "frame_select_panel" ? "🎨 Warna Wadah"
            : target === "camera_bg" ? "📸 Background Kamera"
            : target === "delivery_bg" ? "🎉 Background Hasil Akhir"
            : target === "delivery_header" ? "✏️ Judul Hasil Akhir"
            : target === "print_count_bg" ? "🖨️ Background Jml. Print"
            : target === "preview_bg" ? "🖼️ Background Hasil & Filter"
            : target === "logo" ? "🖼️ Logo"
            : target === "cta" ? "🔲 Tombol Mulai"
            : target === "tutorial_header" ? "✏️ Judul Tutorial"
            : target === "tutorial_steps" ? "📋 Blok Langkah"
            : target === "tutorial_timer" ? "⏱️ Timer"
            : "🔲 Tombol Tutorial"}
        </span>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none font-bold">×</button>
      </div>

      <div className="p-4 space-y-4">
        {target === "logo" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">Upload Logo</label>
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400">
                📁 Pilih dari file
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 4 * 1024 * 1024) { alert("Maks 4 MB"); return; }
                  const reader = new FileReader();
                  reader.onload = () => {
                    onPrefsChange({ ...prefs, logoImageUrl: reader.result as string });
                  };
                  reader.readAsDataURL(file);
                }} />
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mt-2">Atau URL</label>
              <input type="url" placeholder="https://..." value={(prefs as any).logoImageUrl ?? ""}
                onChange={(e) => onPrefsChange({ ...prefs, logoImageUrl: e.target.value || null } as any)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {(prefs as any).logoImageUrl && (
                <button onClick={() => onPrefsChange({ ...prefs, logoImageUrl: null } as any)}
                  className="text-xs text-red-500 hover:underline">Hapus logo custom</button>
              )}
            </div>
            <p className="text-xs text-gray-400">Drag logo di preview untuk pindah posisi. Drag pojok untuk resize.</p>
          </div>
        )}

        {target === "background" && (
          <>
            <div className="flex gap-2">
              {(["color", "image"] as const).map((t) => (
                <button key={t}
                  onClick={() => set("backgroundType", t)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors"
                  style={prefs.backgroundType === t
                    ? { background: accentColor, color: "white", borderColor: accentColor }
                    : { background: "white", color: "#374151", borderColor: "#e5e7eb" }}
                >
                  {t === "color" ? "Warna" : "Gambar"}
                </button>
              ))}
            </div>

            {prefs.backgroundType === "color" && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Pilih Warna</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={prefs.backgroundColor}
                    onChange={(e) => set("backgroundColor", e.target.value)}
                    className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                  <input type="text" value={prefs.backgroundColor} maxLength={7}
                    onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("backgroundColor", e.target.value); }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
              </div>
            )}

            {prefs.backgroundType === "image" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">Upload Gambar</label>
                <button onClick={() => fileRef.current?.click()}
                  className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400">
                  📁 Pilih dari file
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 4 * 1024 * 1024) { alert("Maks 4 MB"); return; }
                    const reader = new FileReader();
                    reader.onload = () => {
                      onPrefsChange({ ...prefs, backgroundImageUrl: reader.result as string, backgroundType: "image" });
                    };
                    reader.readAsDataURL(file);
                  }} />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mt-2">Atau URL</label>
                <input type="url" placeholder="https://..." value={prefs.backgroundImageUrl ?? ""}
                  onChange={(e) => set("backgroundImageUrl", e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                {prefs.backgroundImageUrl && (
                  <button onClick={() => { set("backgroundImageUrl", null); set("backgroundType", "color"); }}
                    className="text-xs text-red-500 hover:underline">Hapus gambar</button>
                )}
              </div>
            )}
          </>
        )}

        {target === "tutorial_background" && (
          <>
            <div className="flex gap-2">
              {(["color", "image"] as const).map((t) => (
                <button key={t}
                  onClick={() => set("tutorialBackgroundType", t)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors"
                  style={prefs.tutorialBackgroundType === t
                    ? { background: accentColor, color: "white", borderColor: accentColor }
                    : { background: "white", color: "#374151", borderColor: "#e5e7eb" }}
                >
                  {t === "color" ? "Warna" : "Gambar"}
                </button>
              ))}
            </div>

            {prefs.tutorialBackgroundType === "color" && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Pilih Warna</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={prefs.tutorialBackgroundColor}
                    onChange={(e) => set("tutorialBackgroundColor", e.target.value)}
                    className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                  <input type="text" value={prefs.tutorialBackgroundColor} maxLength={7}
                    onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("tutorialBackgroundColor", e.target.value); }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
              </div>
            )}

            {prefs.tutorialBackgroundType === "image" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">Upload Gambar</label>
                <button onClick={() => fileRef.current?.click()}
                  className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400">
                  📁 Pilih dari file
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 4 * 1024 * 1024) { alert("Maks 4 MB"); return; }
                    const reader = new FileReader();
                    reader.onload = () => {
                      onPrefsChange({ ...prefs, tutorialBackgroundImageUrl: reader.result as string, tutorialBackgroundType: "image" });
                    };
                    reader.readAsDataURL(file);
                  }} />
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mt-2">Atau URL</label>
                <input type="url" placeholder="https://..." value={prefs.tutorialBackgroundImageUrl ?? ""}
                  onChange={(e) => set("tutorialBackgroundImageUrl", e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                {prefs.tutorialBackgroundImageUrl && (
                  <button onClick={() => { set("tutorialBackgroundImageUrl", null); set("tutorialBackgroundType", "color"); }}
                    className="text-xs text-red-500 hover:underline">Hapus gambar</button>
                )}
              </div>
            )}
          </>
        )}

        {target === "cta" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Teks Tombol</label>
              <input type="text" value={prefs.ctaText}
                onChange={(e) => set("ctaText", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="✨ Mulai Foto" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Tombol</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.ctaColor}
                  onChange={(e) => set("ctaColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.ctaColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("ctaColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Drag tombol di preview untuk pindah posisi</p>
          </div>
        )}

        {target === "tutorial_header" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Teks Judul</label>
              <input type="text" value={prefs.tutorialHeaderText}
                onChange={(e) => set("tutorialHeaderText", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Tutorial" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ukuran Font (px)</label>
              <input type="number" value={prefs.tutorialHeaderSize} min={14} max={120}
                onChange={(e) => set("tutorialHeaderSize", Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jenis Font</label>
              <select value={prefs.tutorialHeaderFont}
                onChange={(e) => set("tutorialHeaderFont", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="inherit">Default</option>
                <option value="'Inter', sans-serif">Inter</option>
                <option value="'Georgia', serif">Georgia</option>
                <option value="'Courier New', monospace">Courier</option>
                <option value="'Arial Black', sans-serif">Arial Black</option>
                <option value="'Playfair Display', serif">Playfair Display</option>
                <option value="'Pacifico', cursive">Pacifico</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Teks</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.tutorialHeaderColor}
                  onChange={(e) => set("tutorialHeaderColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.tutorialHeaderColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("tutorialHeaderColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Drag teks untuk pindah posisi</p>
          </div>
        )}

        {target === "tutorial_steps" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              Drag blok langkah untuk pindahkan. Drag pojok untuk ubah lebar.
            </p>
          </div>
        )}

        {target === "payment_background" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.paymentBgColor}
                  onChange={(e) => set("paymentBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.paymentBgColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("paymentBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Teks Judul</label>
              <input type="text" value={prefs.paymentHeaderText}
                onChange={(e) => set("paymentHeaderText", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Pilih Metode Pembayaran" />
            </div>
            <p className="text-xs text-gray-400">Warna teks menyesuaikan otomatis dengan background.</p>
          </div>
        )}

        {target === "tutorial_cta" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Teks Tombol</label>
              <input type="text" value={prefs.tutorialCtaText}
                onChange={(e) => set("tutorialCtaText", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Mulai Sekarang →" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Tombol</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.tutorialCtaColor}
                  onChange={(e) => set("tutorialCtaColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.tutorialCtaColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("tutorialCtaColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Drag tombol untuk pindah posisi. Drag pojok untuk ubah lebar.</p>
          </div>
        )}

        {target === "tutorial_timer" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Ring</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.timerRingColor}
                  onChange={(e) => set("timerRingColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.timerRingColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("timerRingColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.timerBgColor}
                  onChange={(e) => set("timerBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.timerBgColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("timerBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Drag timer untuk pindah posisi. Warna ring berubah otomatis ke kuning/merah saat waktu hampir habis.</p>
          </div>
        )}

        {target === "frame_select_bg" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.frameSelectBgColor ?? prefs.backgroundColor}
                  onChange={(e) => set("frameSelectBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.frameSelectBgColor ?? prefs.backgroundColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("frameSelectBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Teks Judul</label>
              <input type="text" value={prefs.frameSelectHeaderText ?? "Pilih Frame"}
                onChange={(e) => set("frameSelectHeaderText", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Pilih Frame" />
            </div>
          </div>
        )}

        {target === "frame_select_panel" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Wadah</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.frameSelectPanelColor ?? "#3c3c52"}
                  onChange={(e) => set("frameSelectPanelColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.frameSelectPanelColor ?? "#3c3c52"} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("frameSelectPanelColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Warna ini diterapkan ke semua panel: grid frame, kategori, dan info harga di bawah.</p>
          </div>
        )}

        {target === "camera_bg" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.cameraBgColor ?? prefs.backgroundColor}
                  onChange={(e) => set("cameraBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.cameraBgColor ?? prefs.backgroundColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("cameraBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Warna tombol kamera mengikuti warna aksen booth.</p>
          </div>
        )}

        {target === "delivery_bg" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.deliveryBgColor ?? prefs.backgroundColor}
                  onChange={(e) => set("deliveryBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.deliveryBgColor ?? prefs.backgroundColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("deliveryBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
          </div>
        )}

        {target === "delivery_header" && (
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Teks Judul</label>
            <input type="text" value={prefs.deliveryHeaderText ?? "Foto Siap Diunduh"}
              onChange={(e) => set("deliveryHeaderText", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Foto Siap Diunduh" />
            <p className="text-xs text-gray-400 mt-2">Teks yang muncul di atas QR code saat customer selesai foto.</p>
          </div>
        )}

        {target === "print_count_bg" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.printCountBgColor ?? prefs.backgroundColor}
                  onChange={(e) => set("printCountBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.printCountBgColor ?? prefs.backgroundColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("printCountBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Warna teks menyesuaikan otomatis dengan background.</p>
          </div>
        )}

        {target === "preview_bg" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={prefs.previewBgColor ?? prefs.backgroundColor}
                  onChange={(e) => set("previewBgColor", e.target.value)}
                  className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200" />
                <input type="text" value={prefs.previewBgColor ?? prefs.backgroundColor} maxLength={7}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set("previewBgColor", e.target.value); }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-400">Warna teks menyesuaikan otomatis. Filter foto tidak dapat diubah melalui editor.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Overlay Properties Panel ─────────────────────────────────────────────────

function OverlayPropsPanel({
  element, accentColor, onChange, onDelete, onClose,
}: {
  element:     OverlayElement;
  accentColor: string;
  onChange:    (patch: Partial<OverlayElement>) => void;
  onDelete:    () => void;
  onClose:     () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_048_576) { alert("File terlalu besar (maks 1MB). Gunakan URL gambar."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => onChange({ imageUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div style={{ position: "fixed", top: "80px", right: "24px", width: "300px", background: "white", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 100, overflow: "hidden" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: accentColor }}>
        <span className="font-bold text-sm text-white">{element.type === "text" ? "✏️ Elemen Teks" : "🖼️ Elemen Gambar"}</span>
        <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
      </div>
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {element.type === "text" && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Isi Teks</label>
              <textarea value={element.text ?? ""} onChange={(e) => onChange({ text: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ukuran</label>
                <input type="number" value={element.fontSize ?? 32} min={8} max={300}
                  onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Warna</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={element.color ?? "#ffffff"} onChange={(e) => onChange({ color: e.target.value })}
                    className="h-9 w-9 rounded-lg cursor-pointer border border-gray-200 shrink-0" />
                  <input type="text" value={element.color ?? "#ffffff"} maxLength={7}
                    onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange({ color: e.target.value }); }}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-xs font-mono" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Tebal</label>
              <div className="flex gap-2">
                {([400, 600, 700, 900] as const).map(w => (
                  <button key={w} onClick={() => onChange({ fontWeight: w })}
                    className="flex-1 py-1.5 rounded-lg text-xs border"
                    style={element.fontWeight === w ? { background: accentColor, color: "white", borderColor: accentColor } : { background: "white", color: "#374151", borderColor: "#e5e7eb" }}
                  >{w}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Rata Teks</label>
              <div className="flex gap-2">
                {(["left", "center", "right"] as const).map(a => (
                  <button key={a} onClick={() => onChange({ textAlign: a })}
                    className="flex-1 py-1.5 rounded-lg text-xs border"
                    style={element.textAlign === a ? { background: accentColor, color: "white", borderColor: accentColor } : { background: "white", color: "#374151", borderColor: "#e5e7eb" }}
                  >{a === "left" ? "← Kiri" : a === "center" ? "↔ Tengah" : "Kanan →"}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {element.type === "image" && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Upload Gambar</label>
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 rounded-lg text-sm border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700">
                📁 Pilih File (maks 1MB)
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Atau URL Gambar</label>
              <input type="text" value={element.imageUrl ?? ""} placeholder="https://..."
                onChange={(e) => onChange({ imageUrl: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {element.imageUrl && (
              <div className="rounded-lg overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={element.imageUrl} alt="" className="w-full object-contain max-h-32" />
              </div>
            )}
          </>
        )}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Lebar — {element.width}%</label>
          <input type="range" min={5} max={100} value={element.width}
            onChange={(e) => onChange({ width: Number(e.target.value) })} className="w-full" />
        </div>
        <div className="pt-2 border-t border-gray-100">
          <button onClick={onDelete} className="w-full py-2 rounded-lg text-sm text-red-500 border border-red-200 hover:bg-red-50">
            🗑️ Hapus Elemen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Draggable Resizable Logo ──────────────────────────────────────────────────

// Corner/edge handle visual (matches canvas editor style)
const SALEM = "#f7a998";

const cornerStyle: React.CSSProperties = {
  position:    "absolute",
  width:       14,
  height:      14,
  background:  "#ffffff",
  border:      `2px solid ${SALEM}`,
  borderRadius: "50%",
  boxShadow:   "0 1px 3px rgba(0,0,0,0.18)",
  zIndex:      30,
  userSelect:  "none",
};

type Corner = "tl" | "tr" | "br" | "bl";
const CORNER_STYLES: Record<Corner, React.CSSProperties> = {
  tl: { ...cornerStyle, top: 0,  left:  0,  transform: "translate(-50%,-50%)", cursor: "nwse-resize" },
  tr: { ...cornerStyle, top: 0,  right: 0,  transform: "translate(50%,-50%)",  cursor: "nesw-resize" },
  br: { ...cornerStyle, bottom: 0, right: 0, transform: "translate(50%,50%)",  cursor: "nwse-resize" },
  bl: { ...cornerStyle, bottom: 0, left:  0, transform: "translate(-50%,50%)", cursor: "nesw-resize" },
};

function DraggableLogo({
  prefs,
  logoUrl,
  containerRef,
  onPrefsChange,
  isSelected,
  onSelect,
}: {
  prefs:          WelcomeScreenPrefs;
  logoUrl:        string | null;
  containerRef:   React.RefObject<HTMLDivElement>;
  onPrefsChange:  (p: WelcomeScreenPrefs) => void;
  isSelected:     boolean;
  onSelect:       () => void;
}) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const prefsRef    = useRef(prefs);
  prefsRef.current  = prefs;
  const dragState   = useRef({ mx: 0, my: 0, startX: 0, startY: 0, startW: 0, mode: "none" as "none"|"move"|Corner });

  // Sync selection state with parent
  useEffect(() => {
    if (!isSelected) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        // Parent will handle deselection
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isSelected]);

  // ── Drag to move ────────────────────────────────────────────────────────
  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.logoX; dr.startY = prefsRef.current.logoY;
    dr.startW = prefsRef.current.logoWidth;
    dr.mode = "move";
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx   = (ev.clientX - dr.mx) / rect.width  * 100;
      const dy   = (ev.clientY - dr.my) / rect.height * 100;
      onPrefsChange({ ...prefsRef.current, logoX: clamp(dr.startX + dx, 5, 95), logoY: clamp(dr.startY + dy, 2, 95) });
    };
    const onUp = () => { dr.mode = "none"; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Resize from corner (maintains aspect ratio, center stays fixed) ──────
  const onCornerMouseDown = (corner: Corner) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.logoX; dr.startY = prefsRef.current.logoY;
    dr.startW = prefsRef.current.logoWidth;
    dr.mode = corner;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx   = (ev.clientX - dr.mx) / rect.width * 100;
      // TL/BL → drag left to grow (sign -1), TR/BR → drag right to grow (sign +1)
      const sign = (corner === "tr" || corner === "br") ? 1 : -1;
      onPrefsChange({ ...prefsRef.current, logoWidth: clamp(dr.startW + sign * dx * 2, 6, 85) });
    };
    const onUp = () => { dr.mode = "none"; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        position:  "absolute",
        left:      `${prefs.logoX}%`,
        top:       `${prefs.logoY}%`,
        width:     `${prefs.logoWidth}%`,
        transform: "translate(-50%, -50%)",
        zIndex:    10,
        userSelect: "none",
      }}
    >
      {/* Image — click to select, drag to move */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={(prefs as any).logoImageUrl ?? logoUrl ?? "/fremio_studio.png"}
        alt="Logo"
        draggable={false}
        style={{ width: "100%", height: "auto", display: "block", cursor: isSelected ? "grab" : "pointer" }}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onMouseDown={isSelected ? onBodyMouseDown : undefined}
      />

      {/* Selection border */}
      {isSelected && (
        <div style={{ position: "absolute", inset: 0, outline: `2px solid ${SALEM}`, outlineOffset: 2, pointerEvents: "none", zIndex: 20 }} />
      )}

      {/* 4 Corner handles — only when selected */}
      {isSelected && (["tl","tr","br","bl"] as Corner[]).map((c) => (
        <div key={c} style={CORNER_STYLES[c]} onMouseDown={onCornerMouseDown(c)} />
      ))}
    </div>
  );
}

// ─── Draggable CTA Button ─────────────────────────────────────────────────────

function DraggableButton({
  prefs,
  containerRef,
  isSelected,
  onSelect,
  onPrefsChange,
}: {
  prefs:         WelcomeScreenPrefs;
  containerRef:  React.RefObject<HTMLDivElement>;
  isSelected:    boolean;
  onSelect:      () => void;
  onPrefsChange: (p: WelcomeScreenPrefs) => void;
}) {
  const prefsRef   = useRef(prefs);
  prefsRef.current = prefs;
  const dragState  = useRef({ mx: 0, my: 0, startX: 0, startY: 0, startW: 0 });

  // ── Click to select (no drag) ─────────────────────────────────────────────
  const onClickSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  // ── Drag to move (only when already selected) ─────────────────────────────
  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.ctaX; dr.startY = prefsRef.current.ctaY;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (ev.clientX - dr.mx) / rect.width  * 100;
      const dy = (ev.clientY - dr.my) / rect.height * 100;
      onPrefsChange({ ...prefsRef.current, ctaX: clamp(dr.startX + dx, 10, 90), ctaY: clamp(dr.startY + dy, 5, 95) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Corner resize ─────────────────────────────────────────────────────────
  const onCornerMouseDown = (corner: Corner) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current.mx     = e.clientX;
    dragState.current.startW = prefsRef.current.ctaWidth;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx   = (ev.clientX - dragState.current.mx) / rect.width * 100;
      const sign = (corner === "tr" || corner === "br") ? 1 : -1;
      onPrefsChange({ ...prefsRef.current, ctaWidth: clamp(dragState.current.startW + sign * dx * 2, 20, 95) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Corner styles — positioned at button corners (button is rounded-3xl, so offset slightly)
  const btnCornerStyle = (c: Corner): React.CSSProperties => ({
    ...CORNER_STYLES[c],
    // override top/bottom since button has py-10 height — push corners to visual edge
    ...(c === "tl" || c === "tr" ? { top: "10%" } : { bottom: "10%" }),
  });

  return (
    <div
      style={{
        position:   "absolute",
        left:       `${prefs.ctaX}%`,
        top:        `${prefs.ctaY}%`,
        transform:  "translate(-50%, -50%)",
        zIndex:     15,
        userSelect: "none",
        width:      `${prefs.ctaWidth}%`,
      }}
    >
      <button
        style={{ backgroundColor: prefs.ctaColor, color: prefs.backgroundColor, width: "100%",
                 cursor: isSelected ? "grab" : "pointer" }}
        className="py-10 rounded-3xl text-4xl font-black tracking-tight"
        onClick={!isSelected ? onClickSelect : undefined}
        onMouseDown={isSelected ? onBodyMouseDown : undefined}
      >
        {prefs.ctaText}
      </button>

      {/* Selection border */}
      {isSelected && (
        <div style={{ position: "absolute", inset: 0, borderRadius: "1.5rem",
                      outline: `2px solid ${SALEM}`, outlineOffset: 3,
                      pointerEvents: "none", zIndex: 20 }} />
      )}

      {/* 4 corner resize handles — only when selected */}
      {isSelected && (["tl","tr","br","bl"] as Corner[]).map((c) => (
        <div key={c} style={btnCornerStyle(c)} onMouseDown={onCornerMouseDown(c)} />
      ))}
    </div>
  );
}

// ─── Draggable Tutorial Header ─────────────────────────────────────────────────

function DraggableTutorialHeader({
  prefs,
  containerRef,
  isSelected,
  onSelect,
  onPrefsChange,
}: {
  prefs:         WelcomeScreenPrefs;
  containerRef:  React.RefObject<HTMLDivElement>;
  isSelected:    boolean;
  onSelect:      () => void;
  onPrefsChange: (p: WelcomeScreenPrefs) => void;
}) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const prefsRef    = useRef(prefs);
  prefsRef.current  = prefs;
  const dragState   = useRef({ mx: 0, my: 0, startX: 0, startY: 0, startSize: 0 });

  // ── Drag body to move ────────────────────────────────────────────────────────
  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.tutorialHeaderX; dr.startY = prefsRef.current.tutorialHeaderY;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (ev.clientX - dr.mx) / rect.width  * 100;
      const dy = (ev.clientY - dr.my) / rect.height * 100;
      onPrefsChange({ ...prefsRef.current, tutorialHeaderX: clamp(dr.startX + dx, 5, 95), tutorialHeaderY: clamp(dr.startY + dy, 2, 95) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Corner drag to resize font ────────────────────────────────────────────────
  const onCornerMouseDown = (corner: Corner) => (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startSize = prefsRef.current.tutorialHeaderSize;
    // Each corner grows when dragged AWAY from its opposite corner
    // BR: right/down = away from TL → +x,+y grows
    // TL: left/up   = away from BR → -x,-y grows
    // TR: right/up  = away from BL → +x,-y grows
    // BL: left/down = away from TR → -x,+y grows
    const sx = (corner === "tr" || corner === "br") ? 1 : -1;
    const sy = (corner === "bl" || corner === "br") ? 1 : -1;
    const onMove = (ev: MouseEvent) => {
      const delta = sx * (ev.clientX - dr.mx) + sy * (ev.clientY - dr.my);
      onPrefsChange({ ...prefsRef.current, tutorialHeaderSize: clamp(Math.round(dr.startSize + delta * 0.5), 10, 200) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        position:   "absolute",
        left:       `${prefs.tutorialHeaderX}%`,
        top:        `${prefs.tutorialHeaderY}%`,
        transform:  "translate(-50%, -50%)",
        zIndex:     10,
        userSelect: "none",
        cursor:     isSelected ? "grab" : "pointer",
        fontFamily: prefs.tutorialHeaderFont === "inherit" ? undefined : prefs.tutorialHeaderFont,
        fontSize:   prefs.tutorialHeaderSize,
        fontWeight: 900,
        color:      prefs.tutorialHeaderColor,
        whiteSpace: "nowrap",
        padding:    "4px 8px",
      }}
      onClick={(e) => { e.stopPropagation(); if (!isSelected) onSelect(); }}
      onMouseDown={isSelected ? onBodyMouseDown : undefined}
    >
      {prefs.tutorialHeaderText || "Tutorial"}

      {isSelected && (
        <>
          <div style={{ position:"absolute", inset:-4, outline:`2px solid ${SALEM}`, outlineOffset:2, pointerEvents:"none", zIndex:20 }} />
          {(["tl","tr","br","bl"] as Corner[]).map((c) => (
            <div key={c} style={CORNER_STYLES[c]} onMouseDown={onCornerMouseDown(c)} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Draggable Tutorial Steps Block ───────────────────────────────────────────

const TUTORIAL_STEPS_PREVIEW = [
  { emoji: "💳", title: "Pembayaran" },
  { emoji: "🖼️", title: "Pilih Frame" },
  { emoji: "🖨️", title: "Cetak" },
  { emoji: "📸",  title: "Foto" },
  { emoji: "🎨",  title: "Filter" },
  { emoji: "🎉",  title: "Download" },
];

const COLORFUL_CELL_BG_ED = ["#bae6fd","#fda4af","#e9d5ff","#bbf7d0","#fed7aa","#a5f3fc"];
const BOLD_CELL_BG_ED     = ["#7c3aed","#db2777","#0891b2","#ea580c","#dc2626","#16a34a"];

function StepsPreview({ prefs, accentColor }: { prefs: WelcomeScreenPrefs; accentColor: string }) {
  const bgColor    = prefs.tutorialBackgroundColor ?? prefs.backgroundColor;
  const light      = isLightColor(bgColor);
  const cardBg     = light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.10)";
  const cardBorder = light ? "rgba(0,0,0,0.10)"  : "rgba(255,255,255,0.12)";
  const textColor  = light ? "rgba(0,0,0,0.80)"  : "rgba(255,255,255,0.85)";
  const style      = prefs.tutorialStyle ?? "bold";

  if (style === "minimal") return (
    <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "1.5vw", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {TUTORIAL_STEPS_PREVIEW.map((step, i) => (
          <div key={i} style={{
            padding: "2vw 1.5vw", display: "flex", alignItems: "center", gap: "1vw",
            background: Math.floor(i / 3) % 2 === 1 ? "#fef9e7" : "white",
            borderRight: i % 3 < 2 ? "1px solid #e5e7eb" : "none",
            borderBottom: i < 3 ? "1px solid #e5e7eb" : "none",
          }}>
            <div style={{ width: "3.5vw", height: "3.5vw", borderRadius: "50%", flexShrink: 0, backgroundColor: accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5vw", fontWeight: 900, color: "white" }}>{i + 1}</div>
            <p style={{ fontWeight: 800, fontSize: "1.4vw", color: "#111827", lineHeight: 1.3 }}>{step.title}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if (style === "colorful") return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.7vw" }}>
      {TUTORIAL_STEPS_PREVIEW.map((step, i) => (
        <div key={i} style={{ backgroundColor: COLORFUL_CELL_BG_ED[i % 6], borderRadius: "1.5vw", padding: "2vw 1vw", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.7vw", textAlign: "center" }}>
          <span style={{ fontSize: "3.5vw" }}>{step.emoji}</span>
          <p style={{ fontWeight: 800, fontSize: "1.4vw", color: "#1f2937", lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );

  if (style === "columns") return (
    <div style={{ display: "flex", width: "100%" }}>
      {TUTORIAL_STEPS_PREVIEW.map((step, i) => (
        <div key={i} style={{ flex: 1, padding: "1.5vw 0.5vw", display: "flex", flexDirection: "column", alignItems: "center", gap: "1vw", textAlign: "center", borderRight: i < TUTORIAL_STEPS_PREVIEW.length - 1 ? `1px solid ${cardBorder}` : "none" }}>
          <span style={{ fontSize: "3.5vw" }}>{step.emoji}</span>
          <p style={{ fontWeight: 900, fontSize: "1.1vw", color: textColor, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );

  if (style === "bold") return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
      {TUTORIAL_STEPS_PREVIEW.map((step, i) => (
        <div key={i} style={{ backgroundColor: BOLD_CELL_BG_ED[i % 6], padding: "2.2vw 1.2vw", display: "flex", flexDirection: "column", alignItems: "center", gap: "1vw", textAlign: "center" }}>
          <div style={{ width: "4.5vw", height: "4.5vw", borderRadius: "50%", backgroundColor: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.9vw", fontWeight: 900, color: BOLD_CELL_BG_ED[i % 6] }}>{i + 1}</div>
          <p style={{ fontWeight: 900, fontSize: "1.3vw", color: "white", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );

  // default: card
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1vw", width: "100%" }}>
      {TUTORIAL_STEPS_PREVIEW.map((step, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", borderRadius: "1.5vw", padding: "1.5vw 1vw", gap: "0.6vw", backgroundColor: cardBg, border: `1.5px solid ${cardBorder}` }}>
          <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", flexShrink: 0, backgroundColor: accentColor, color: bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2vw", fontWeight: 900 }}>{i + 1}</div>
          <span style={{ fontSize: "3vw" }}>{step.emoji}</span>
          <p style={{ fontWeight: 900, fontSize: "1.2vw", color: textColor, lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b)/255 > 0.5;
}

function DraggableTutorialSteps({
  prefs,
  booth,
  containerRef,
  isSelected,
  onSelect,
  onPrefsChange,
}: {
  prefs:         WelcomeScreenPrefs;
  booth:         BoothData;
  containerRef:  React.RefObject<HTMLDivElement>;
  isSelected:    boolean;
  onSelect:      () => void;
  onPrefsChange: (p: WelcomeScreenPrefs) => void;
}) {
  const prefsRef   = useRef(prefs);
  prefsRef.current = prefs;
  const dragState  = useRef({ mx: 0, my: 0, startX: 0, startY: 0, startW: 0 });

  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.tutorialStepsX; dr.startY = prefsRef.current.tutorialStepsY;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (ev.clientX - dr.mx) / rect.width  * 100;
      const dy = (ev.clientY - dr.my) / rect.height * 100;
      onPrefsChange({ ...prefsRef.current, tutorialStepsX: clamp(dr.startX + dx, 20, 80), tutorialStepsY: clamp(dr.startY + dy, 10, 90) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onCornerMouseDown = (corner: Corner) => (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    dragState.current.mx     = e.clientX;
    dragState.current.startW = prefsRef.current.tutorialStepsWidth;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx   = (ev.clientX - dragState.current.mx) / rect.width * 100;
      const sign = (corner === "tr" || corner === "br") ? 1 : -1;
      onPrefsChange({ ...prefsRef.current, tutorialStepsWidth: clamp(dragState.current.startW + sign * dx * 2, 40, 100) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{
        position:  "absolute",
        left:      `${prefs.tutorialStepsX}%`,
        top:       `${prefs.tutorialStepsY}%`,
        width:     `${prefs.tutorialStepsWidth}%`,
        transform: "translate(-50%, -50%)",
        zIndex:    12,
        userSelect: "none",
        cursor:    isSelected ? "grab" : "pointer",
      }}
      onClick={!isSelected ? (e => { e.stopPropagation(); onSelect(); }) : undefined}
      onMouseDown={isSelected ? onBodyMouseDown : undefined}
    >
      <StepsPreview prefs={prefs} accentColor={booth.accentColor} />

      {/* Selection border */}
      {isSelected && (
        <div style={{ position:"absolute", inset:0, outline:`2px solid ${SALEM}`, outlineOffset:3, borderRadius:"1rem", pointerEvents:"none", zIndex:20 }} />
      )}
      {/* Corner handles */}
      {isSelected && (["tl","tr","br","bl"] as Corner[]).map((c) => (
        <div key={c} style={CORNER_STYLES[c]} onMouseDown={onCornerMouseDown(c)} />
      ))}
    </div>
  );
}

// ─── Draggable Tutorial CTA ────────────────────────────────────────────────────

function DraggableTutorialCta({
  prefs,
  containerRef,
  isSelected,
  onSelect,
  onPrefsChange,
}: {
  prefs:         WelcomeScreenPrefs;
  containerRef:  React.RefObject<HTMLDivElement>;
  isSelected:    boolean;
  onSelect:      () => void;
  onPrefsChange: (p: WelcomeScreenPrefs) => void;
}) {
  const prefsRef   = useRef(prefs);
  prefsRef.current = prefs;
  const dragState  = useRef({ mx: 0, my: 0, startX: 0, startY: 0, startW: 0 });

  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.tutorialCtaX; dr.startY = prefsRef.current.tutorialCtaY;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (ev.clientX - dr.mx) / rect.width  * 100;
      const dy = (ev.clientY - dr.my) / rect.height * 100;
      onPrefsChange({ ...prefsRef.current, tutorialCtaX: clamp(dr.startX + dx, 10, 90), tutorialCtaY: clamp(dr.startY + dy, 5, 95) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onCornerMouseDown = (corner: Corner) => (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    dragState.current.mx     = e.clientX;
    dragState.current.startW = prefsRef.current.tutorialCtaWidth;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx   = (ev.clientX - dragState.current.mx) / rect.width * 100;
      const sign = (corner === "tr" || corner === "br") ? 1 : -1;
      onPrefsChange({ ...prefsRef.current, tutorialCtaWidth: clamp(dragState.current.startW + sign * dx * 2, 20, 95) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const btnCornerStyle = (c: Corner): React.CSSProperties => ({
    ...CORNER_STYLES[c],
    ...(c === "tl" || c === "tr" ? { top: "10%" } : { bottom: "10%" }),
  });

  return (
    <div
      style={{
        position:  "absolute",
        left:      `${prefs.tutorialCtaX}%`,
        top:       `${prefs.tutorialCtaY}%`,
        width:     `${prefs.tutorialCtaWidth}%`,
        transform: "translate(-50%, -50%)",
        zIndex:    15,
        userSelect: "none",
      }}
    >
      <button
        style={{ backgroundColor: prefs.tutorialCtaColor, color: prefs.backgroundColor, width: "100%",
                 cursor: isSelected ? "grab" : "pointer", pointerEvents: "all" }}
        className="py-10 rounded-3xl text-4xl font-black tracking-tight"
        onClick={!isSelected ? (e => { e.stopPropagation(); onSelect(); }) : undefined}
        onMouseDown={isSelected ? onBodyMouseDown : undefined}
      >
        {prefs.tutorialCtaText || "Mulai Sekarang →"}
      </button>
      {isSelected && (
        <div style={{ position:"absolute", inset:0, borderRadius:"1rem", outline:`2px solid ${SALEM}`, outlineOffset:3, pointerEvents:"none", zIndex:20 }} />
      )}
      {isSelected && (["tl","tr","br","bl"] as Corner[]).map((c) => (
        <div key={c} style={btnCornerStyle(c)} onMouseDown={onCornerMouseDown(c)} />
      ))}
    </div>
  );
}

// ─── Draggable Tutorial Timer ──────────────────────────────────────────────────

function DraggableTutorialTimer({
  prefs,
  containerRef,
  isSelected,
  onSelect,
  onPrefsChange,
}: {
  prefs:         WelcomeScreenPrefs;
  containerRef:  React.RefObject<HTMLDivElement>;
  isSelected:    boolean;
  onSelect:      () => void;
  onPrefsChange: (p: WelcomeScreenPrefs) => void;
}) {
  const prefsRef   = useRef(prefs);
  prefsRef.current = prefs;
  const dragState  = useRef({ mx: 0, my: 0, startX: 0, startY: 0 });

  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const dr = dragState.current;
    dr.mx = e.clientX; dr.my = e.clientY;
    dr.startX = prefsRef.current.timerX; dr.startY = prefsRef.current.timerY;
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (ev.clientX - dr.mx) / rect.width  * 100;
      const dy = (ev.clientY - dr.my) / rect.height * 100;
      onPrefsChange({ ...prefsRef.current, timerX: clamp(dr.startX + dx, 5, 95), timerY: clamp(dr.startY + dy, 2, 95) });
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const SIZE   = 60;
  const RADIUS = 23;
  const STROKE = 3.5;
  const CIRC   = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * 0.2; // show ~80% progress as demo

  const ringHex = prefs.timerRingColor ?? "#ffffff";
  const bgHex   = prefs.timerBgColor   ?? "#000000";

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const ringRgba = hexToRgba(ringHex, 0.92);
  const bgRgba   = hexToRgba(bgHex, 0.28);

  return (
    <div
      style={{
        position:   "absolute",
        left:       `${prefs.timerX}%`,
        top:        `${prefs.timerY}%`,
        width:      SIZE,
        height:     SIZE,
        transform:  "translate(-50%, -50%)",
        zIndex:     20,
        userSelect: "none",
        cursor:     isSelected ? "grab" : "pointer",
      }}
      onClick={(e) => { e.stopPropagation(); if (!isSelected) onSelect(); }}
      onMouseDown={isSelected ? onBodyMouseDown : undefined}
    >
      <div style={{ position: "relative", width: SIZE, height: SIZE, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Frosted backdrop */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: bgRgba, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />
        {/* SVG ring */}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={SIZE/2} cy={SIZE/2} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={STROKE} />
          <circle cx={SIZE/2} cy={SIZE/2} r={RADIUS} fill="none"
            stroke={ringRgba} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={dashOffset}
          />
        </svg>
        {/* Time label */}
        <span style={{ position: "relative", color: ringRgba, fontSize: "11px", fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          2:24
        </span>
      </div>
      {/* Selection border */}
      {isSelected && (
        <div style={{ position: "absolute", inset: -4, borderRadius: "50%", outline: `2px solid ${SALEM}`, outlineOffset: 2, pointerEvents: "none", zIndex: 30 }} />
      )}
    </div>
  );
}

// ─── Frame Select Preview ─────────────────────────────────────────────────────

function FrameSelectPreview({
  prefs, booth, containerRef, selected, onSelect,
}: {
  prefs:        WelcomeScreenPrefs;
  booth:        BoothData;
  containerRef: React.RefObject<HTMLDivElement>;
  selected:     EditTarget;
  onSelect:     (t: EditTarget) => void;
}) {
  const bgColor       = prefs.frameSelectBgColor ?? prefs.backgroundColor;
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"   : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"   : "rgba(255,255,255,0.55)";
  const panelColor    = prefs.frameSelectPanelColor ?? "#3c3c52";
  const panelLight    = isLightColor(panelColor);
  const panelText     = panelLight ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)";
  const panelTextSub  = panelLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)";
  const isSelectedBg    = selected === "frame_select_bg";
  const isSelectedPanel = selected === "frame_select_panel";
  const catColors     = ["#f472b6", "#f59e0b", "#06b6d4"];
  const mockCats      = ["Kawaii", "Retro", "Neon"];
  const frameAccents  = [booth.accentColor,"#c9a96e","#f472b6","#64748b","#f59e0b","#06b6d4","#e11d48","#10b981","#6366f1","#ea580c"];
  return (
    <div
      ref={containerRef}
      className="relative h-full cursor-pointer select-none overflow-hidden"
      style={{ backgroundColor: bgColor, outline: isSelectedBg ? "2px solid #f7a998" : "none", outlineOffset: -2 }}
      onClick={() => onSelect("frame_select_bg")}
    >
      <div className="flex h-full" style={{ gap: 12, padding: 12 }}>
        {/* Left: category panel — w-44 = 176px, matches real */}
        <div onClick={(e) => { e.stopPropagation(); onSelect("frame_select_panel"); }} style={{ width: 176, flexShrink: 0, borderRadius: 16, backgroundColor: panelColor, display: "flex", flexDirection: "column", overflow: "hidden", outline: isSelectedPanel ? "2px solid #f7a998" : "none", outlineOffset: -2, cursor: "pointer" }}>
          <div style={{ padding: "8px 10px 4px", pointerEvents: "none" }}>
            <p style={{ fontWeight: 700, fontSize: 12, color: panelText }}>Pilih Kategori</p>
            <p style={{ fontSize: 9, color: panelTextSub, marginTop: 2 }}>Klik untuk memilih</p>
          </div>
          <div style={{ flex: 1, padding: "0 6px 6px", display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
            {mockCats.map((name, i) => (
              <div key={name} style={{ borderRadius: 10, overflow: "hidden", border: `2.5px solid ${i === 0 ? booth.accentColor : "transparent"}`, position: "relative", flexShrink: 0 }}>
                <div style={{ width: "100%", aspectRatio: "2/3", background: `linear-gradient(135deg, ${catColors[i]}44, ${catColors[i]}88)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 16 }}>🖼️</span>
                </div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)", display: "flex", alignItems: "flex-end", padding: "3px 5px" }}>
                  <p style={{ color: "white", fontSize: 9, fontWeight: 600 }}>{name}</p>
                </div>
                {i === 0 && (
                  <span style={{ position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", backgroundColor: booth.accentColor, color: booth.primaryColor, fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: frame grid */}
        <div onClick={(e) => { e.stopPropagation(); onSelect("frame_select_panel"); }} style={{ flex: 1, borderRadius: 16, backgroundColor: panelColor, display: "flex", flexDirection: "column", overflow: "hidden", outline: isSelectedPanel ? "2px solid #f7a998" : "none", outlineOffset: -2, cursor: "pointer" }}>
          <div style={{ padding: "8px 10px 4px", flexShrink: 0, pointerEvents: "none" }}>
            <p style={{ fontWeight: 700, fontSize: 12, color: panelText }}>{prefs.frameSelectHeaderText || "Pilih Frame"}</p>
            <p style={{ fontSize: 9, color: panelTextSub, marginTop: 1 }}>Kawaii</p>
          </div>
          <div style={{ flex: 1, padding: "0 6px 6px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, alignContent: "start", overflow: "hidden" }}>
            {frameAccents.map((accent, i) => (
              <div key={i} style={{ borderRadius: 8, overflow: "hidden", border: `2px solid ${i === 2 ? accent : "transparent"}` }}>
                <div style={{ width: "100%", aspectRatio: "9/16", background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${accent}44` }}>
                  <span style={{ fontSize: 10 }}>🖼️</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: selected frame preview — w-80 = 320px, matches real */}
        <div onClick={(e) => { e.stopPropagation(); onSelect("frame_select_panel"); }} style={{ width: 320, flexShrink: 0, borderRadius: 16, backgroundColor: panelColor, display: "flex", flexDirection: "column", overflow: "hidden", outline: isSelectedPanel ? "2px solid #f7a998" : "none", outlineOffset: -2, cursor: "pointer" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {/* Real placeholder: two stacked cards */}
            <div style={{ position: "relative", height: 112, width: 80 }}>
              <div style={{ position: "absolute", top: 8, left: 8, width: 64, height: 96, borderRadius: 12, background: "rgba(255,255,255,0.10)" }} />
              <div style={{ position: "absolute", top: 0, left: 0, width: 64, height: 96, borderRadius: 12, background: "rgba(255,255,255,0.20)", border: "1px solid rgba(255,255,255,0.20)" }} />
            </div>
          </div>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", backgroundColor: panelColor, filter: "brightness(0.80)", borderRadius: "0 0 14px 14px", pointerEvents: "none" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: panelText }}>Frame Terpilih</p>
              <p style={{ fontSize: 9, color: panelTextSub, marginTop: 1 }}>Rp {booth.pricePerSession.toLocaleString("id-ID")}</p>
            </div>
            <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: booth.accentColor, color: booth.primaryColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 }}>→</div>
          </div>
        </div>
      </div>
      {!isSelectedBg && !isSelectedPanel && (
        <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik wadah untuk ubah warna · Klik area lain untuk ubah background
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Camera Screen Preview ────────────────────────────────────────────────────

function CameraScreenPreview({
  prefs, booth, containerRef, selected, onSelect,
}: {
  prefs:        WelcomeScreenPrefs;
  booth:        BoothData;
  containerRef: React.RefObject<HTMLDivElement>;
  selected:     EditTarget;
  onSelect:     (t: EditTarget) => void;
}) {
  const bgColor       = prefs.cameraBgColor ?? prefs.backgroundColor;
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)";
  const isSelectedBg  = selected === "camera_bg";
  return (
    <div
      ref={containerRef}
      className="relative flex h-full select-none overflow-hidden cursor-pointer"
      style={{ backgroundColor: bgColor, outline: isSelectedBg ? "2px solid #f7a998" : "none", outlineOffset: -2 }}
      onClick={() => onSelect("camera_bg")}
    >
      {/* Left: camera + controls */}
      <div className="flex-1 flex flex-col items-center justify-between py-6 px-4">
        <div className="text-center shrink-0 pointer-events-none">
          <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>Berpose Sekarang!</h2>
          <p className="text-sm mt-1" style={{ color: textSecondary }}>Foto ke-1 · sisa 3 lagi</p>
        </div>
        {/* Viewfinder mock */}
        <div className="relative rounded-2xl overflow-hidden pointer-events-none" style={{ aspectRatio: "16/9", width: "100%", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
          <div style={{ position: "absolute", inset: "8%", border: "2px dashed rgba(255,255,255,0.3)", borderRadius: 8 }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: booth.accentColor }}>3</span>
          </div>
        </div>
        {/* Capture button */}
        <button className="pointer-events-none py-4 rounded-3xl text-xl font-black w-full max-w-sm" style={{ backgroundColor: booth.accentColor, color: bgColor }}>
          📸 Ambil Foto
        </button>
      </div>
      {/* Right: strip preview — clamp(200px,30vw,400px), matches real */}
      <div className="shrink-0 flex flex-col items-center justify-center py-6 pr-4 pl-2" style={{ width: "clamp(200px,30vw,400px)" }}>
        <p className="text-xs uppercase tracking-widest mb-3 pointer-events-none" style={{ color: textSecondary }}>Preview</p>
        <div className="relative rounded-2xl overflow-hidden w-full" style={{ aspectRatio: "9/16", background: light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)", border: `1px solid ${light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)"}` }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              position: "absolute", width: "46%", height: "46%",
              top: i < 2 ? "2%" : "52%", left: i % 2 === 0 ? "2%" : "52%",
              background: i === 0 ? `${booth.accentColor}25` : (light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)"),
              borderRadius: 6, border: `1px solid ${i === 0 ? booth.accentColor + "50" : (light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)")}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: light ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)" }}>{i+1}</span>
            </div>
          ))}
        </div>
      </div>
      {!isSelectedBg && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik untuk ubah warna background
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Delivery Screen Preview ──────────────────────────────────────────────────

function DeliveryPreview({
  prefs, booth, containerRef, selected, onSelect,
}: {
  prefs:        WelcomeScreenPrefs;
  booth:        BoothData;
  containerRef: React.RefObject<HTMLDivElement>;
  selected:     EditTarget;
  onSelect:     (t: EditTarget) => void;
}) {
  const bgColor       = prefs.deliveryBgColor ?? prefs.backgroundColor;
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"   : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"   : "rgba(255,255,255,0.55)";
  const textTertiary  = light ? "rgba(0,0,0,0.30)"   : "rgba(255,255,255,0.35)";
  const surfaceBg     = light ? "rgba(0,0,0,0.05)"   : "rgba(255,255,255,0.08)";
  const surfaceBorder = light ? "rgba(0,0,0,0.10)"   : "rgba(255,255,255,0.14)";
  const isSelectedBg  = selected === "delivery_bg";
  const isSelectedHd  = selected === "delivery_header";
  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full items-center justify-between py-10 px-6 select-none overflow-hidden cursor-pointer"
      style={{ backgroundColor: bgColor, outline: isSelectedBg ? "2px solid #f7a998" : "none", outlineOffset: -2 }}
      onClick={() => onSelect("delivery_bg")}
    >
      {/* Editable header */}
      <div
        className="text-center"
        style={{ cursor: "pointer", outline: isSelectedHd ? "2px solid #f7a998" : "none", outlineOffset: 4, borderRadius: 8, padding: "2px 10px" }}
        onClick={(e) => { e.stopPropagation(); onSelect(isSelectedHd ? null : "delivery_header"); }}
      >
        <h2 className="text-3xl font-bold pointer-events-none" style={{ color: textPrimary }}>
          {prefs.deliveryHeaderText || "Foto Siap Diunduh"}
        </h2>
        <p className="text-sm mt-1 pointer-events-none" style={{ color: textSecondary }}>Scan QR di bawah dengan kameramu</p>
        {!isSelectedHd && <p className="text-[10px] mt-0.5 pointer-events-none" style={{ color: textTertiary }}>Klik untuk ubah teks</p>}
      </div>

      {/* QR mock */}
      <div className="flex flex-col items-center gap-3 pointer-events-none">
        <div style={{ background: "white", borderRadius: 20, padding: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
          <div style={{ width: 150, height: 150, background: "repeating-conic-gradient(#333 0% 25%, transparent 0% 50%) 0 0 / 8px 8px", borderRadius: 3 }} />
        </div>
        <p className="text-xs" style={{ color: textTertiary }}>studio.fremio.id/download/xxxxxx</p>
      </div>

      {/* Email input mock */}
      <div className="w-full max-w-sm flex flex-col gap-1.5 pointer-events-none">
        <p className="text-sm text-center font-medium" style={{ color: textSecondary }}>Kirim link ke email kamu</p>
        <div className="flex gap-2 items-center">
          <div className="flex-1 rounded-xl px-3 py-2.5 text-sm" style={{ backgroundColor: surfaceBg, border: `1px solid ${surfaceBorder}`, color: textSecondary }}>namakamu</div>
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: textPrimary }}>@gmail.com</span>
          <div className="px-3 py-2.5 rounded-xl text-sm font-bold" style={{ backgroundColor: booth.accentColor, color: booth.primaryColor }}>Kirim</div>
        </div>
      </div>

      {/* Countdown + Done */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm pointer-events-none">
        <p className="text-sm" style={{ color: textTertiary }}>
          Reset dalam <span style={{ fontWeight: 700, color: booth.accentColor }}>120</span> detik
        </p>
        <button className="w-full py-5 rounded-3xl text-2xl font-black" style={{ backgroundColor: booth.accentColor, color: booth.primaryColor }}>
          Selesai ✓
        </button>
      </div>

      {!isSelectedBg && !isSelectedHd && (
        <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik background · Klik teks judul untuk edit
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Print Count Preview ──────────────────────────────────────────────────────

function PrintCountPreview({
  prefs, booth, containerRef, selected, onSelect,
}: {
  prefs:        WelcomeScreenPrefs;
  booth:        BoothData;
  containerRef: React.RefObject<HTMLDivElement>;
  selected:     EditTarget;
  onSelect:     (t: EditTarget) => void;
}) {
  const bgColor       = prefs.printCountBgColor ?? booth.primaryColor;
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)";
  const surfaceBg     = light ? "rgba(0,0,0,0.06)"  : "rgba(255,255,255,0.10)";
  const surfaceBorder = light ? "rgba(0,0,0,0.10)"  : "rgba(255,255,255,0.14)";
  const btnText       = isLightColor(booth.accentColor) ? "rgba(0,0,0,0.80)" : "white";
  const isSelectedBg  = selected === "print_count_bg";
  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full px-8 py-8 select-none cursor-pointer overflow-hidden"
      style={{ backgroundColor: bgColor, outline: isSelectedBg ? "2px solid #f7a998" : "none", outlineOffset: -2 }}
      onClick={() => onSelect("print_count_bg")}
    >
      <div className="mb-5 pointer-events-none">
        <h2 className="text-3xl font-black text-center" style={{ color: textPrimary }}>Pilih Jumlah Print</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="rounded-lg" style={{ width: 22, height: 30, background: `${booth.accentColor}40`, border: `1px solid ${booth.accentColor}60` }} />
          <p style={{ color: textSecondary, fontSize: 13 }}>
            <span style={{ color: textPrimary, fontWeight: 700 }}>Classic Frame</span> · 4 foto
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-8 mb-5 pointer-events-none">
        <div className="flex items-center justify-center rounded-full font-black text-2xl" style={{ width: 52, height: 52, backgroundColor: surfaceBg, border: `1.5px solid ${surfaceBorder}`, color: textPrimary, opacity: 0.3 }}>−</div>
        <div className="flex flex-col items-center">
          <span className="font-black leading-none" style={{ fontSize: 72, color: textPrimary }}>1</span>
          <span style={{ color: textSecondary, fontSize: 12, fontWeight: 600 }}>lembar</span>
        </div>
        <div className="flex items-center justify-center rounded-full font-black text-2xl" style={{ width: 52, height: 52, backgroundColor: surfaceBg, border: `1.5px solid ${surfaceBorder}`, color: textPrimary }}>+</div>
      </div>
      <div className="rounded-2xl overflow-hidden shrink-0 pointer-events-none" style={{ backgroundColor: surfaceBg, border: `1px solid ${surfaceBorder}` }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${surfaceBorder}` }}>
          <p style={{ color: textSecondary, fontSize: 12 }}>Sesi + 1 print</p>
          <p style={{ color: textPrimary, fontWeight: 600, fontSize: 12 }}>Rp {booth.pricePerSession.toLocaleString("id-ID")}</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <p style={{ color: textSecondary, fontSize: 12, fontWeight: 600 }}>Total</p>
          <p className="font-black" style={{ fontSize: 22, color: booth.accentColor }}>Rp {booth.pricePerSession.toLocaleString("id-ID")}</p>
        </div>
      </div>
      <div className="flex-1" />
      <button className="w-full rounded-2xl font-black py-5 text-lg pointer-events-none" style={{ backgroundColor: booth.accentColor, color: btnText }}>
        Lanjut ke Pembayaran →
      </button>
      {!isSelectedBg && (
        <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik untuk ubah background
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Payment Screen Preview ───────────────────────────────────────────────────

const PAYMENT_WALLETS_ED = [
  { name: "GoPay",     bg: "#00AED6" }, { name: "OVO",      bg: "#4C3494" },
  { name: "Dana",      bg: "#118EEA" }, { name: "ShopeePay",bg: "#EE4D2D" },
  { name: "LinkAja",   bg: "#CC0000" }, { name: "BCA",      bg: "#005DAA" },
  { name: "BNI",       bg: "#EB5B1E" }, { name: "BRI",      bg: "#00529B" },
  { name: "Mandiri",   bg: "#003087" }, { name: "BSI",      bg: "#2D8654" },
  { name: "CIMB",      bg: "#C8102E" }, { name: "Permata",  bg: "#0066B3" },
  { name: "SeaBank",   bg: "#FF6600" },
];

function PaymentPreview({
  booth, containerRef,
}: {
  booth:        BoothData;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div ref={containerRef} className="flex flex-col h-full items-center justify-center gap-4 select-none pointer-events-none" style={{ backgroundColor: booth.primaryColor }}>
      <div className="flex flex-col items-center gap-4 rounded-3xl p-6" style={{ backgroundColor: "white" }}>
        {/* QR mock — w-64 h-64 = 256px, matches real */}
        <div style={{ width: 256, height: 256, background: "repeating-conic-gradient(#333 0% 25%, transparent 0% 50%) 0 0 / 10px 10px", borderRadius: 4 }} />
        <div className="text-center">
          <p className="text-gray-400 text-xs">Total Pembayaran</p>
          <p className="font-black text-gray-900 text-2xl">Rp {booth.pricePerSession.toLocaleString("id-ID")}</p>
        </div>
      </div>
      <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: "white", width: 320 }}>
        <p className="text-gray-400 text-xs font-medium mb-3 text-center uppercase tracking-wider">Pembayaran Melalui</p>
        <div className="flex flex-wrap justify-center gap-2">
          {PAYMENT_WALLETS_ED.map((b) => (
            <span key={b.name} className="px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={{ backgroundColor: b.bg }}>{b.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Photo Preview Screen Preview (Hasil & Filter) ────────────────────────────

const FILTER_DATA_ED = [
  { name: "Original",    color: "linear-gradient(135deg,#f0ebe4,#a09488)" },
  { name: "Retro Matte", color: "linear-gradient(135deg,#e8d8b0,#a07840)" },
  { name: "Soft Grain",  color: "linear-gradient(135deg,#faf4e8,#c8bc9c)" },
  { name: "Soft Mono",   color: "linear-gradient(135deg,#f0f0f0,#404040)" },
  { name: "Film Noir",   color: "linear-gradient(135deg,#484848,#080808)" },
];

function PhotoPreviewPreview({
  prefs, booth, containerRef, selected, onSelect,
}: {
  prefs:        WelcomeScreenPrefs;
  booth:        BoothData;
  containerRef: React.RefObject<HTMLDivElement>;
  selected:     EditTarget;
  onSelect:     (t: EditTarget) => void;
}) {
  const bgColor       = prefs.previewBgColor ?? booth.primaryColor;
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)";
  const isSelectedBg  = selected === "preview_bg";
  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full py-2 px-3 select-none cursor-pointer overflow-hidden"
      style={{ backgroundColor: bgColor, outline: isSelectedBg ? "2px solid #f7a998" : "none", outlineOffset: -2 }}
      onClick={() => onSelect("preview_bg")}
    >
      <div className="shrink-0 text-center mb-1.5 pointer-events-none">
        <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>Preview Foto</h2>
        <p className="text-xs mt-0.5" style={{ color: textSecondary }}>Pilih filter lalu simpan</p>
      </div>
      <div className="flex-1 flex flex-row w-full gap-1.5 min-h-0 overflow-hidden pointer-events-none">
        {([
          { emoji: "📸", badge: "FOTO" },
          { emoji: "🎞", badge: "GIF"  },
          { emoji: "🎬", badge: "LIVE" },
        ] as const).map((col, i) => (
          <div key={i} className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 relative rounded-xl overflow-hidden shadow-lg min-h-0" style={{ background: `${booth.accentColor}14`, border: `1px solid ${booth.accentColor}28` }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <span style={{ fontSize: 28, opacity: 0.25 }}>{col.emoji}</span>
              </div>
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: booth.accentColor + "bb", color: booth.primaryColor }}>{col.badge}</div>
            </div>
            <div className="shrink-0 pt-0.5">
              <div className="flex justify-center gap-0.5">
                {FILTER_DATA_ED.map((f, fi) => (
                  <div key={fi} className="flex flex-col items-center gap-0.5">
                    <div className="rounded-sm" style={{ width: 20, height: 20, background: f.color, outline: fi === 0 ? `2px solid ${booth.accentColor}` : "2px solid transparent", outlineOffset: 1 }} />
                    <span style={{ fontSize: 5, color: fi === 0 ? booth.accentColor : textSecondary, fontWeight: 600 }}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 flex gap-2.5 w-full mt-1.5 pointer-events-none">
        <button className="flex-1 py-3 rounded-2xl font-bold text-sm" style={{ backgroundColor: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", color: textSecondary, border: `1px solid ${light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.12)"}` }}>
          ↩ Ulangi
        </button>
        <button className="py-3 rounded-2xl font-black text-sm" style={{ flex: 2, backgroundColor: booth.accentColor, color: booth.primaryColor }}>
          Simpan &amp; Lanjut →
        </button>
      </div>
      {!isSelectedBg && (
        <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik untuk ubah background
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Tutorial Preview ──────────────────────────────────────────────────────────

function TutorialPreview({
  booth,
  prefs,
  selected,
  containerRef,
  onSelect,
  onPrefsChange,
}: {
  booth:         BoothData;
  prefs:         WelcomeScreenPrefs;
  selected:      EditTarget;
  containerRef:  React.RefObject<HTMLDivElement>;
  onSelect:      (t: EditTarget) => void;
  onPrefsChange: (p: WelcomeScreenPrefs) => void;
}) {
  const bgStyle: React.CSSProperties =
    prefs.tutorialBackgroundType === "image" && prefs.tutorialBackgroundImageUrl
      ? { backgroundImage: `url(${prefs.tutorialBackgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: prefs.tutorialBackgroundColor };

  const light         = isLightColor(prefs.tutorialBackgroundColor);
  const textSecondary = light ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.50)";

  return (
    <div
      ref={containerRef}
      className="relative h-full select-none overflow-hidden"
      style={bgStyle}
      onClick={() => onSelect("tutorial_background")}
    >
      {/* Background click zone */}
      <div className="absolute inset-0 cursor-pointer" style={{ zIndex: 0 }} />

      {/* Draggable header text */}
      <DraggableTutorialHeader
        prefs={prefs}
        containerRef={containerRef}
        isSelected={selected === "tutorial_header"}
        onSelect={() => onSelect("tutorial_header")}
        onPrefsChange={onPrefsChange}
      />

      {/* Draggable tutorial steps */}
      <DraggableTutorialSteps
        prefs={prefs}
        booth={booth}
        containerRef={containerRef}
        isSelected={selected === "tutorial_steps"}
        onSelect={() => onSelect("tutorial_steps")}
        onPrefsChange={onPrefsChange}
      />

      {/* Draggable tutorial CTA */}
      <DraggableTutorialCta
        prefs={prefs}
        containerRef={containerRef}
        isSelected={selected === "tutorial_cta"}
        onSelect={() => onSelect("tutorial_cta")}
        onPrefsChange={onPrefsChange}
      />

      {/* Draggable timer widget */}
      <DraggableTutorialTimer
        prefs={prefs}
        containerRef={containerRef}
        isSelected={selected === "tutorial_timer"}
        onSelect={() => onSelect("tutorial_timer")}
        onPrefsChange={onPrefsChange}
      />

      {/* Hint */}
      {!selected && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik elemen untuk pilih · Klik background untuk ubah warna
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Payment Method Preview ────────────────────────────────────────────────────

const PAYMENT_COLORFUL_BG_ED = ["#bae6fd", "#fda4af", "#e9d5ff"];
const PAYMENT_BOLD_BG_ED     = ["#7c3aed", "#0891b2", "#ea580c"];

function PaymentCardsPreview({ prefs, accentColor }: { prefs: WelcomeScreenPrefs; accentColor: string }) {
  const bgColor    = prefs.paymentBgColor ?? "#ffffff";
  const light      = isLightColor(bgColor);
  const cardBorder = light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.14)";
  const textColor  = light ? "rgba(0,0,0,0.80)"  : "rgba(255,255,255,0.85)";
  const style      = prefs.paymentStyle ?? "bold";

  const items = [
    { emoji: "🎫", label: "Scan Ticket" },
    { emoji: "💳", label: "Cashless"    },
    { emoji: "🏷️", label: "Use Voucher" },
  ];

  if (style === "minimal") return (
    <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "1.5vw", overflow: "hidden", width: "100%" }}>
      {items.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "2vw", padding: "2.5vw 3vw",
                              borderBottom: i < items.length - 1 ? "1px solid #e5e7eb" : "none",
                              background: i % 2 === 1 ? "#fef9e7" : "white" }}>
          <div style={{ width: "5vw", height: "5vw", borderRadius: "50%", flexShrink: 0, backgroundColor: accentColor,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5vw" }}>{m.emoji}</div>
          <p style={{ fontWeight: 800, fontSize: "2vw", color: "#111827", flex: 1 }}>{m.label}</p>
          <span style={{ fontSize: "2vw", color: accentColor }}>→</span>
        </div>
      ))}
    </div>
  );

  if (style === "colorful") return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5vw", width: "100%" }}>
      {items.map((m, i) => (
        <div key={i} style={{ backgroundColor: PAYMENT_COLORFUL_BG_ED[i % 3], borderRadius: "2vw", padding: "4vw 2vw",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5vw", textAlign: "center" }}>
          <span style={{ fontSize: "8vw" }}>{m.emoji}</span>
          <p style={{ fontWeight: 800, fontSize: "2vw", color: "#1f2937" }}>{m.label}</p>
        </div>
      ))}
    </div>
  );

  if (style === "columns") return (
    <div style={{ display: "flex", width: "100%" }}>
      {items.map((m, i) => (
        <div key={i} style={{ flex: 1, padding: "3vw 1vw", display: "flex", flexDirection: "column",
                              alignItems: "center", gap: "2vw", textAlign: "center",
                              borderRight: i < items.length - 1 ? `1px solid ${cardBorder}` : "none" }}>
          <span style={{ fontSize: "7vw" }}>{m.emoji}</span>
          <p style={{ fontWeight: 900, fontSize: "1.5vw", color: textColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</p>
        </div>
      ))}
    </div>
  );

  if (style === "bold") return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, width: "100%" }}>
      {items.map((m, i) => (
        <div key={i} style={{ backgroundColor: PAYMENT_BOLD_BG_ED[i % 3], padding: "4vw 1.5vw",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5vw", textAlign: "center" }}>
          <div style={{ width: "6vw", height: "6vw", borderRadius: "50%", backgroundColor: "white",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3vw" }}>{m.emoji}</div>
          <p style={{ fontWeight: 900, fontSize: "1.8vw", color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</p>
        </div>
      ))}
    </div>
  );

  // default: card (screenshot style)
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2vw", width: "100%" }}>
      {items.map((m, i) => (
        <div key={i} style={{ background: "white", borderRadius: "2vw", overflow: "hidden",
                              border: `1.5px solid ${cardBorder}`, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "4vw 2vw" }}>
            <span style={{ fontSize: "8vw" }}>{m.emoji}</span>
          </div>
          <div style={{ background: "#111827", padding: "1.5vw 2.5vw", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ color: "white", fontWeight: 800, fontSize: "1.8vw" }}>{m.label}</p>
            <div style={{ width: "3vw", height: "3vw", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4vw", color: "white" }}>→</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentMethodPreview({
  prefs,
  accentColor,
  containerRef,
  selected,
  onSelect,
}: {
  prefs:        WelcomeScreenPrefs;
  accentColor:  string;
  containerRef: React.RefObject<HTMLDivElement>;
  selected:     EditTarget;
  onSelect:     (t: EditTarget) => void;
}) {
  const bgColor       = prefs.paymentBgColor ?? "#ffffff";
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)";
  const isSelected    = selected === "payment_background";

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full px-8 py-10 select-none overflow-hidden cursor-pointer"
      style={{ backgroundColor: bgColor, outline: isSelected ? `2px solid #f7a998` : "none", outlineOffset: -2 }}
      onClick={() => onSelect("payment_background")}
    >
      {/* Header — centered */}
      <div className="text-center mb-8" style={{ pointerEvents: "none" }}>
        <h2 className="text-3xl font-black" style={{ color: textPrimary }}>
          {prefs.paymentHeaderText || "Pilih Metode Pembayaran"}
        </h2>
        <p className="text-sm mt-2" style={{ color: textSecondary }}>
          Klik icon untuk memilih metode yang akan kamu pakai
        </p>
      </div>

      {/* Cards preview */}
      <div className="flex-1 flex items-center pointer-events-none">
        <PaymentCardsPreview prefs={prefs} accentColor={accentColor} />
      </div>

      {/* Hint */}
      {!isSelected && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: textSecondary, background: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}>
            Klik untuk ubah warna background & judul
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Booth Preview ─────────────────────────────────────────────────────────────
function BoothPreview({
  booth,
  prefs,
  selected,
  containerRef,
  onSelect,
  onPrefsChange,
}: {
  booth:          BoothData;
  prefs:          WelcomeScreenPrefs;
  selected:       EditTarget;
  containerRef:   React.RefObject<HTMLDivElement>;
  onSelect:       (t: EditTarget) => void;
  onPrefsChange:  (p: WelcomeScreenPrefs) => void;
}) {
  const bgStyle: React.CSSProperties =
    prefs.backgroundType === "image" && prefs.backgroundImageUrl
      ? { backgroundImage: `url(${prefs.backgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: prefs.backgroundColor };

  const ring = (t: EditTarget) =>
    selected === t
      ? "outline outline-2 outline-offset-2 outline-blue-400"
      : "hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-blue-300/60";

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full items-center justify-between py-16 px-8 select-none overflow-hidden"
      style={bgStyle}
      onClick={() => onSelect("background")}
    >
      {/* Background click zone */}
      <div className="absolute inset-0 cursor-pointer" style={{ zIndex: 0 }} />

      {/* Draggable Logo */}
      <DraggableLogo
        prefs={prefs}
        logoUrl={booth.logoUrl}
        containerRef={containerRef}
        onPrefsChange={onPrefsChange}
        isSelected={selected === "logo"}
        onSelect={() => onSelect("logo")}
      />

      {/* Draggable CTA button */}
      <DraggableButton
        prefs={prefs}
        containerRef={containerRef}
        isSelected={selected === "cta"}
        onSelect={() => onSelect("cta")}
        onPrefsChange={onPrefsChange}
      />

      {/* Hint */}
      {!selected && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none" style={{ zIndex: 5 }}>
          <span className="text-white/30 text-xs bg-black/20 px-3 py-1 rounded-full">
            Klik elemen untuk pilih · Drag pojok untuk resize · Drag untuk pindah
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main EditorClient ─────────────────────────────────────────────────────────

export function EditorClient({
  boothId,
  boothName,
  slug,
  pricePerSession,
  primaryColor,
  accentColor,
  logoUrl,
  savedPrefs,
}: {
  boothId:         string;
  boothName:       string;
  slug:            string;
  pricePerSession: number;
  primaryColor:    string;
  accentColor:     string;
  logoUrl:         string | null;
  savedPrefs:      Record<string, unknown> | null;
}) {
  const [prefs,        setPrefs]       = useState<WelcomeScreenPrefs>(() => mergePrefs(savedPrefs, primaryColor, accentColor));
  const [selected,     setSelected]    = useState<EditTarget>(null);
  const [editorScreen, setEditorScreen] = useState<EditorScreen>("idle");
  const [saveState,    setSaveState]   = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [liveColors,   setLiveColors]  = useState({ primary: primaryColor, accent: accentColor });
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const booth: BoothData = { boothId, boothName, slug, pricePerSession, primaryColor: liveColors.primary, accentColor: liveColors.accent, logoUrl };

  const saveColors = useCallback(async (patch: { primaryColor?: string; accentColor?: string }) => {
    await fetch(`/api/dashboard/booths/${boothId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  }, [boothId]);

  const addOverlay = useCallback((type: "text" | "image") => {
    const id = `ovl_${Date.now()}`;
    const newEl: OverlayElement = { id, screen: editorScreen, type, x: 50, y: 50, width: 30, text: type === "text" ? "Teks Baru" : undefined, fontSize: 32, fontWeight: 700, color: "#ffffff", textAlign: "center" };
    setPrefs(p => ({ ...p, overlayElements: [...(p.overlayElements ?? []), newEl] }));
    setSelectedOverlayId(id); setSelected("overlay");
  }, [editorScreen]);

  const updateOverlay = useCallback((id: string, patch: Partial<OverlayElement>) => {
    setPrefs(p => ({ ...p, overlayElements: (p.overlayElements ?? []).map(el => el.id === id ? { ...el, ...patch } : el) }));
  }, []);

  const deleteOverlay = useCallback((id: string) => {
    setPrefs(p => ({ ...p, overlayElements: (p.overlayElements ?? []).filter(el => el.id !== id) }));
    setSelectedOverlayId(null); setSelected(null);
  }, []);

  const handleAddImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 1_048_576) { alert("File terlalu besar (maks 1MB). Masukkan URL di panel properties."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const id = `ovl_${Date.now()}`;
      setPrefs(p => ({ ...p, overlayElements: [...(p.overlayElements ?? []), { id, screen: editorScreen, type: "image", x: 50, y: 50, width: 25, imageUrl: ev.target?.result as string }] }));
      setSelectedOverlayId(id); setSelected("overlay");
    };
    reader.readAsDataURL(file); e.target.value = "";
  }, [editorScreen]);

  const selectedOverlay = selectedOverlayId ? (prefs.overlayElements ?? []).find(el => el.id === selectedOverlayId) ?? null : null;

  const handleSave = async () => {
    setSaveState("saving");
    try {
      const res  = await fetch(`/api/dashboard/booths/${boothId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ welcomeScreenPrefs: prefs }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "Gagal");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "#0f0f1a" }}>
      {/* Header */}
      <header className="flex flex-col border-b border-white/10 shrink-0" style={{ background: "#1a1a2e" }}>
        {/* Row 1: nav + actions */}
        <div className="flex items-center justify-between px-5 py-2">
          <div className="flex items-center gap-3">
            <a href="/booths" className="text-white/50 hover:text-white/90 text-sm flex items-center gap-1">← Kembali</a>
            <span className="text-white/20">|</span>
            <span className="text-white font-bold text-sm">{boothName}</span>
            <span className="text-white/40 text-sm">— {editorScreen === "idle" ? "Layar Sambut" : editorScreen === "tutorial" ? "Tutorial" : editorScreen === "payment" ? "Metode Bayar" : editorScreen === "frame_select" ? "Pilih Frame" : editorScreen === "camera" ? "Kamera" : editorScreen === "preview" ? "Hasil & Filter" : editorScreen === "print_count" ? "Jumlah Print" : editorScreen === "payment_qris" ? "Pembayaran" : "Hasil Akhir"}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Warna Utama */}
            <label title="Warna Utama" className="flex items-center gap-1 cursor-pointer">
              <div style={{ width: 20, height: 20, borderRadius: 4, background: liveColors.primary, border: "2px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
              <input type="color" value={liveColors.primary}
                onChange={(e) => setLiveColors(c => ({ ...c, primary: e.target.value }))}
                onBlur={(e) => saveColors({ primaryColor: e.target.value })} className="sr-only" />
              <span className="text-[10px] font-mono text-white/35">{liveColors.primary}</span>
            </label>
            {/* Warna Aksen */}
            <label title="Warna Aksen" className="flex items-center gap-1 cursor-pointer mr-1 pr-2 border-r border-white/10">
              <div style={{ width: 20, height: 20, borderRadius: 4, background: liveColors.accent, border: "2px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
              <input type="color" value={liveColors.accent}
                onChange={(e) => setLiveColors(c => ({ ...c, accent: e.target.value }))}
                onBlur={(e) => saveColors({ accentColor: e.target.value })} className="sr-only" />
              <span className="text-[10px] font-mono text-white/35">{liveColors.accent}</span>
            </label>
            {/* Add Text */}
            <button onClick={() => addOverlay("text")}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-white/15 text-white/60 hover:text-white hover:border-white/30">
              T+ Teks
            </button>
            {/* Add Image */}
            <label className="px-2.5 py-1.5 rounded-lg text-xs border border-white/15 text-white/60 hover:text-white hover:border-white/30 cursor-pointer mr-1">
              🖼 Gambar
              <input type="file" accept="image/*" className="sr-only" onChange={handleAddImage} />
            </label>
            <button
              onClick={() => { setPrefs(buildDefaultPrefs(primaryColor, accentColor)); setSelected(null); setSelectedOverlayId(null); }}
              className="px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20"
            >Reset</button>
            <a href={`/b/${slug}`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white/90 border border-white/10 hover:border-white/20">
              Lihat Langsung ↗
            </a>
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60"
              style={{
                background: saveState === "saved" ? "#16a34a" : saveState === "error" ? "#dc2626" : saveState === "saving" ? "#6b7280" : liveColors.accent,
                color: saveState === "saved" || saveState === "error" ? "white" : liveColors.primary,
              }}
            >
              {saveState === "saving" ? "Menyimpan…" : saveState === "saved" ? "✓ Tersimpan" : saveState === "error" ? "✗ Gagal" : "Simpan"}
            </button>
          </div>
        </div>
        {/* Row 2: screen tabs */}
        <div className="flex items-center gap-1.5 px-5 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {(["idle", "tutorial", "payment", "frame_select", "print_count", "payment_qris", "camera", "preview", "delivery"] as EditorScreen[]).map((s) => (
            <button key={s}
              onClick={() => { setEditorScreen(s); setSelected(null); setSelectedOverlayId(null); }}
              className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors"
              style={editorScreen === s
                ? { background: liveColors.accent, color: liveColors.primary, borderColor: liveColors.accent }
                : { background: "transparent", color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.15)" }}
            >
              {s === "idle" ? "Layar Sambut" : s === "tutorial" ? "Tutorial" : s === "payment" ? "Metode Bayar" : s === "frame_select" ? "Pilih Frame" : s === "camera" ? "Kamera" : s === "preview" ? "Hasil & Filter" : s === "print_count" ? "Jml. Print" : s === "payment_qris" ? "Pembayaran" : "Hasil Akhir"}
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden" onClick={() => setSelected(null)}>
        {/* Preview */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "#1e1e2e" }}>
          <div
            className="relative w-full h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {editorScreen === "idle" ? (
              <BoothPreview
                booth={booth}
                prefs={prefs}
                selected={selected}
                containerRef={containerRef}
                onSelect={(t) => setSelected(prev => prev === t ? null : t)}
                onPrefsChange={setPrefs}
              />
            ) : editorScreen === "tutorial" ? (
              <TutorialPreview
                booth={booth}
                prefs={prefs}
                selected={selected}
                containerRef={containerRef}
                onSelect={(t) => setSelected(prev => prev === t ? null : t)}
                onPrefsChange={setPrefs}
              />
            ) : editorScreen === "payment" ? (
              <PaymentMethodPreview
                prefs={prefs}
                accentColor={liveColors.accent}
                containerRef={containerRef}
                selected={selected}
                onSelect={(t) => setSelected(prev => prev === t ? null : t)}
              />
            ) : editorScreen === "frame_select" ? (
              <FrameSelectPreview
                prefs={prefs}
                booth={booth}
                containerRef={containerRef}
                selected={selected}
                onSelect={(t) => setSelected(prev => prev === t ? null : t)}
              />
            ) : editorScreen === "camera" ? (
              <CameraScreenPreview
                prefs={prefs}
                booth={booth}
                containerRef={containerRef}
                selected={selected}
                onSelect={(t) => setSelected(prev => prev === t ? null : t)}
              />
            ) : editorScreen === "preview" ? (
              <PhotoPreviewPreview prefs={prefs} booth={booth} containerRef={containerRef} selected={selected} onSelect={(t) => setSelected(prev => prev === t ? null : t)} />
            ) : editorScreen === "print_count" ? (
              <PrintCountPreview prefs={prefs} booth={booth} containerRef={containerRef} selected={selected} onSelect={(t) => setSelected(prev => prev === t ? null : t)} />
            ) : editorScreen === "payment_qris" ? (
              <PaymentPreview booth={booth} containerRef={containerRef} />
            ) : (
              <DeliveryPreview
                prefs={prefs}
                booth={booth}
                containerRef={containerRef}
                selected={selected}
                onSelect={(t) => setSelected(prev => prev === t ? null : t)}
              />
            )}
            {/* Tutorial style picker — top-left overlay */}
            {editorScreen === "tutorial" && (
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 200 }}
                onClick={(e) => e.stopPropagation()}>
                <TutorialStylePicker
                  value={prefs.tutorialStyle ?? "bold"}
                  onChange={(style) => setPrefs({ ...prefs, tutorialStyle: style as WelcomeScreenPrefs["tutorialStyle"] })}
                  accentColor={liveColors.accent}
                />
              </div>
            )}
            {/* Payment style picker — top-left overlay */}
            {editorScreen === "payment" && (
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 200 }}
                onClick={(e) => e.stopPropagation()}>
                <TutorialStylePicker
                  value={prefs.paymentStyle ?? "bold"}
                  onChange={(style) => setPrefs({ ...prefs, paymentStyle: style as WelcomeScreenPrefs["paymentStyle"] })}
                  accentColor={liveColors.accent}
                />
              </div>
            )}
            {/* Overlay elements for current screen */}
            {(prefs.overlayElements ?? []).filter(el => el.screen === editorScreen).map(el => (
              <div
                key={el.id}
                style={{
                  position: "absolute", left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`,
                  transform: "translate(-50%, -50%)", cursor: "move",
                  outline: selectedOverlayId === el.id ? "2px solid #f7a998" : "2px dashed rgba(255,255,255,0.45)",
                  outlineOffset: 2, userSelect: "none", zIndex: 50,
                }}
                onClick={(e) => { e.stopPropagation(); setSelectedOverlayId(el.id); setSelected("overlay"); }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y;
                  const onMove = (ev: MouseEvent) => updateOverlay(el.id, {
                    x: clamp(ox + (ev.clientX - sx) / rect.width * 100, 0, 100),
                    y: clamp(oy + (ev.clientY - sy) / rect.height * 100, 0, 100),
                  });
                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              >
                {el.type === "text" ? (
                  <p style={{ color: el.color ?? "#fff", fontSize: el.fontSize ?? 32, fontWeight: el.fontWeight ?? 700, textAlign: el.textAlign ?? "center", margin: 0, lineHeight: 1.3, wordBreak: "break-word", textShadow: "0 2px 8px rgba(0,0,0,0.5)", whiteSpace: "pre-wrap" }}>
                    {el.text ?? ""}
                  </p>
                ) : el.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={el.imageUrl} alt="" style={{ width: "100%", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: 60, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12 }}>Pilih gambar →</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Properties panel */}
        <div onClick={(e) => e.stopPropagation()}>
          <PropsPanel
            target={selected === "overlay" ? null : selected}
            prefs={prefs}
            accentColor={liveColors.accent}
            onPrefsChange={setPrefs}
            onClose={() => setSelected(null)}
          />
          {selected === "overlay" && selectedOverlay && (
            <OverlayPropsPanel
              element={selectedOverlay}
              accentColor={liveColors.accent}
              onChange={(patch) => updateOverlay(selectedOverlay.id, patch)}
              onDelete={() => deleteOverlay(selectedOverlay.id)}
              onClose={() => { setSelected(null); setSelectedOverlayId(null); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
