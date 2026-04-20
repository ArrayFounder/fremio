"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type EditTarget = "background" | "tutorial_background" | "cta" | "tutorial_header" | "tutorial_steps" | "tutorial_cta" | "tutorial_timer" | "payment_background" | null;
type EditorScreen = "idle" | "tutorial" | "payment";

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
    tutorialStyle:              "card",
    paymentBgColor:    primaryColor,
    paymentHeaderText: "Pilih Metode Pembayaran",
    paymentStyle:      "card",
    timerX:         88,
    timerY:         8,
    timerRingColor: "#ffffff",
    timerBgColor:   "#000000",
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
            : target === "cta" ? "🔲 Tombol Mulai"
            : target === "tutorial_header" ? "✏️ Judul Tutorial"
            : target === "tutorial_steps" ? "📋 Blok Langkah"
            : target === "tutorial_timer" ? "⏱️ Timer"
            : "🔲 Tombol Tutorial"}
        </span>
        <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none font-bold">×</button>
      </div>

      <div className="p-4 space-y-4">
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
  containerRef,
  onPrefsChange,
}: {
  prefs:          WelcomeScreenPrefs;
  containerRef:   React.RefObject<HTMLDivElement>;
  onPrefsChange:  (p: WelcomeScreenPrefs) => void;
}) {
  const [isSelected, setIsSelected] = useState(false);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const prefsRef    = useRef(prefs);
  prefsRef.current  = prefs;
  const dragState   = useRef({ mx: 0, my: 0, startX: 0, startY: 0, startW: 0, mode: "none" as "none"|"move"|Corner });

  // Deselect when clicking outside
  useEffect(() => {
    if (!isSelected) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isSelected]);

  // ── Drag to move ────────────────────────────────────────────────────────
  const onBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsSelected(true);
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
        src="/logo-fremio.png"
        alt="Fremio"
        draggable={false}
        style={{ width: "100%", height: "auto", display: "block", cursor: isSelected ? "grab" : "pointer" }}
        onClick={() => setIsSelected(true)}
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
  const style      = prefs.tutorialStyle ?? "card";

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
  const style      = prefs.paymentStyle ?? "card";

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

      {/* Draggable Fremio logo */}
      <DraggableLogo
        prefs={prefs}
        containerRef={containerRef}
        onPrefsChange={onPrefsChange}
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
  const booth: BoothData = { boothId, boothName, slug, pricePerSession, primaryColor, accentColor, logoUrl };

  const [prefs,        setPrefs]       = useState<WelcomeScreenPrefs>(() => mergePrefs(savedPrefs, primaryColor, accentColor));
  const [selected,     setSelected]    = useState<EditTarget>(null);
  const [editorScreen, setEditorScreen] = useState<EditorScreen>("idle");
  const [saveState,    setSaveState]   = useState<"idle" | "saving" | "saved" | "error">("idle");
  const containerRef = useRef<HTMLDivElement>(null);

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
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0" style={{ background: "#1a1a2e" }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard/booths" className="text-white/50 hover:text-white/90 text-sm flex items-center gap-1">← Kembali</a>
          <span className="text-white/20">|</span>
          <span className="text-white font-bold text-sm">{boothName}</span>
          <span className="text-white/40 text-sm">— Welcome Screen</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Screen toggle */}
          {(["idle", "tutorial", "payment"] as EditorScreen[]).map((s) => (
            <button key={s}
              onClick={() => { setEditorScreen(s); setSelected(null); }}
              className="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors"
              style={editorScreen === s
                ? { background: accentColor, color: primaryColor, borderColor: accentColor }
                : { background: "transparent", color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.15)" }}
            >
              {s === "idle" ? "Layar Sambut" : s === "tutorial" ? "Tutorial" : "Metode Bayar"}
            </button>
          ))}
          <span className="text-white/20 text-sm mx-1">|</span>
          <button
            onClick={() => { setPrefs(buildDefaultPrefs(primaryColor, accentColor)); setSelected(null); }}
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
              background: saveState === "saved" ? "#16a34a" : saveState === "error" ? "#dc2626" : saveState === "saving" ? "#6b7280" : accentColor,
              color: saveState === "saved" || saveState === "error" ? "white" : primaryColor,
            }}
          >
            {saveState === "saving" ? "Menyimpan…" : saveState === "saved" ? "✓ Tersimpan" : saveState === "error" ? "✗ Gagal" : "Simpan"}
          </button>
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
            ) : (
              <PaymentMethodPreview
                prefs={prefs}
                accentColor={accentColor}
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
                  value={prefs.tutorialStyle ?? "card"}
                  onChange={(style) => setPrefs({ ...prefs, tutorialStyle: style as WelcomeScreenPrefs["tutorialStyle"] })}
                  accentColor={accentColor}
                />
              </div>
            )}
            {/* Payment style picker — top-left overlay */}
            {editorScreen === "payment" && (
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 200 }}
                onClick={(e) => e.stopPropagation()}>
                <TutorialStylePicker
                  value={prefs.paymentStyle ?? "card"}
                  onChange={(style) => setPrefs({ ...prefs, paymentStyle: style as WelcomeScreenPrefs["paymentStyle"] })}
                  accentColor={accentColor}
                />
              </div>
            )}
          </div>
        </div>

        {/* Properties panel */}
        <div onClick={(e) => e.stopPropagation()}>
          <PropsPanel
            target={selected}
            prefs={prefs}
            accentColor={accentColor}
            onPrefsChange={setPrefs}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}
