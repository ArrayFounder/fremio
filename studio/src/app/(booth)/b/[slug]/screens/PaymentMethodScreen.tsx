"use client";

import { useEffect, useState } from "react";
import type { BoothConfigData, PaymentMethod, WelcomeScreenPrefs } from "../types";
import { getEffectivePrefs } from "./IdleScreen";

function useIsPortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return portrait;
}

interface PaymentMethodScreenProps {
  booth:           BoothConfigData;
  onSelect:        (method: PaymentMethod) => void;
  onBack?:         () => void;
  prefsOverride?:  WelcomeScreenPrefs | null;
}

const METHODS: { id: PaymentMethod; emoji: string; label: string; desc: string }[] = [
  { id: "CASHLESS", emoji: "💳", label: "Cashless",     desc: "Bayar dengan QRIS, GoPay, OVO, atau e-wallet lainnya" },
  { id: "VOUCHER",  emoji: "🏷️", label: "Use Voucher",  desc: "Masukkan kode voucher diskon atau voucher gratis" },
  { id: "CASH",     emoji: "💵", label: "Bayar Tunai",  desc: "Bayar langsung ke kasir dengan uang kertas" },
];

const COLORFUL_PAYMENT_BG = ["#bae6fd", "#fda4af", "#e9d5ff"];
const BOLD_PAYMENT_BG     = ["#7c3aed", "#0891b2", "#ea580c"];

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

// ── Card (default — matches screenshot) ─────────────────────────────────────
function CardsCard({ methods, cardBorder, onSelect, isPortrait }: {
  methods: typeof METHODS; cardBorder: string; onSelect: (id: PaymentMethod) => void; isPortrait: boolean;
}) {
  const emojiSize = isPortrait ? "15vmin" : "9vw";
  const labelSize = isPortrait ? "4.5vmin" : "1.8vw";
  const iconSize  = isPortrait ? "6vmin"  : "3vw";
  const padding   = isPortrait ? "5vmin 4vmin" : "5vw 2vw";
  const n = methods.length;
  const cols = Math.min(n, 3);
  return (
    <div style={{ display: "grid", gridTemplateColumns: isPortrait ? "1fr" : `repeat(${cols}, 1fr)`, gap: "2vmin", width: "100%" }}>
      {methods.map((m) => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className="active:scale-95 transition-transform"
          style={{ background: "white", borderRadius: "2vmin", overflow: "hidden",
                   border: `1.5px solid ${cardBorder}`, display: "flex",
                   flexDirection: isPortrait ? "row" : "column" }}>
          <div style={{ flex: isPortrait ? undefined : 1, display: "flex", alignItems: "center",
                        justifyContent: "center", padding,
                        minWidth: isPortrait ? "20vmin" : undefined }}>
            <span style={{ fontSize: emojiSize }}>{m.emoji}</span>
          </div>
          <div style={{ background: "#111827", padding: isPortrait ? "0 4vmin" : `1.8vw 2.5vw`,
                        flex: isPortrait ? 1 : undefined,
                        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ color: "white", fontWeight: 800, fontSize: labelSize }}>{m.label}</p>
            <div style={{ width: iconSize, height: iconSize, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: `calc(${iconSize} * 0.5)`, color: "white", flexShrink: 0, marginLeft: "2vmin" }}>→</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Minimal ──────────────────────────────────────────────────────────────────
function CardsMinimal({ methods, accentColor, onSelect, isPortrait }: {
  methods: typeof METHODS; accentColor: string; onSelect: (id: PaymentMethod) => void; isPortrait: boolean;
}) {
  const iconSize = isPortrait ? "10vmin" : "5vw";
  const emojiSize = isPortrait ? "5vmin" : "2.5vw";
  const labelSize = isPortrait ? "4vmin" : "2vw";
  const descSize = isPortrait ? "2.8vmin" : "1.4vw";
  const padding = isPortrait ? "4vmin 5vmin" : "2.5vw 3vw";
  return (
    <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "3vmin", overflow: "hidden", width: "100%" }}>
      {methods.map((m, i) => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className="active:scale-95 transition-transform"
          style={{ display: "flex", alignItems: "center", gap: "4vmin", padding,
                   borderBottom: i < methods.length - 1 ? "1px solid #e5e7eb" : "none",
                   background: i % 2 === 1 ? "#fef9e7" : "white", width: "100%", textAlign: "left" }}>
          <div style={{ width: iconSize, height: iconSize, borderRadius: "50%", flexShrink: 0,
                        backgroundColor: accentColor, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: emojiSize }}>{m.emoji}</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: labelSize, color: "#111827" }}>{m.label}</p>
            {!isPortrait && <p style={{ fontSize: descSize, color: "#6b7280", marginTop: "0.3vmin" }}>{m.desc}</p>}
          </div>
          <span style={{ fontSize: labelSize, color: accentColor, flexShrink: 0 }}>→</span>
        </button>
      ))}
    </div>
  );
}

// ── Colorful ─────────────────────────────────────────────────────────────────
function CardsColorful({ methods, onSelect, isPortrait }: {
  methods: typeof METHODS; onSelect: (id: PaymentMethod) => void; isPortrait: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isPortrait ? "1fr" : `repeat(${Math.min(methods.length, 3)}, 1fr)`, gap: "3vmin", width: "100%" }}>
      {methods.map((m, i) => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className="active:scale-95 transition-transform"
          style={{ backgroundColor: COLORFUL_PAYMENT_BG[i % 3], borderRadius: "3vmin",
                   padding: isPortrait ? "4vmin 6vmin" : "4vw 2vw",
                   display: "flex", flexDirection: isPortrait ? "row" : "column",
                   alignItems: "center", gap: "3vmin", textAlign: isPortrait ? "left" : "center" }}>
          <span style={{ fontSize: isPortrait ? "12vmin" : "8vw" }}>{m.emoji}</span>
          <p style={{ fontWeight: 800, fontSize: isPortrait ? "5vmin" : "2vw", color: "#1f2937", lineHeight: 1.3 }}>{m.label}</p>
        </button>
      ))}
    </div>
  );
}

// ── Columns ───────────────────────────────────────────────────────────────────
function CardsColumns({ methods, textPrimary, cardBorder, onSelect, isPortrait }: {
  methods: typeof METHODS; textPrimary: string; cardBorder: string; onSelect: (id: PaymentMethod) => void; isPortrait: boolean;
}) {
  return (
    <div style={{ display: isPortrait ? "flex" : "grid", flexDirection: "column", gridTemplateColumns: isPortrait ? undefined : `repeat(${Math.min(methods.length, 3)}, 1fr)`, width: "100%", gap: isPortrait ? "2vmin" : 0 }}>
      {methods.map((m, i) => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className="active:scale-95 transition-transform"
          style={{ padding: isPortrait ? "4vmin 6vmin" : "3vw 1vw",
                   display: "flex", flexDirection: isPortrait ? "row" : "column",
                   alignItems: "center", gap: isPortrait ? "4vmin" : "2vw", textAlign: "center",
                   borderRight: !isPortrait && (i + 1) % Math.min(methods.length, 3) !== 0 && i < methods.length - 1 ? `1px solid ${cardBorder}` : "none",
                   borderBottom: isPortrait && i < methods.length - 1 ? `1px solid ${cardBorder}` : "none" }}>
          <span style={{ fontSize: isPortrait ? "12vmin" : "7vw" }}>{m.emoji}</span>
          <p style={{ fontWeight: 900, fontSize: isPortrait ? "4.5vmin" : "1.5vw", color: textPrimary,
                      textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{m.label}</p>
        </button>
      ))}
    </div>
  );
}

// ── Bold ──────────────────────────────────────────────────────────────────────
function CardsBold({ methods, onSelect, isPortrait }: {
  methods: typeof METHODS; onSelect: (id: PaymentMethod) => void; isPortrait: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isPortrait ? "1fr" : `repeat(${Math.min(methods.length, 3)}, 1fr)`, gap: 0, width: "100%" }}>
      {methods.map((m, i) => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className="active:scale-95 transition-transform"
          style={{ backgroundColor: BOLD_PAYMENT_BG[i % 3],
                   padding: isPortrait ? "5vmin 6vmin" : "4vw 1.5vw",
                   display: "flex", flexDirection: isPortrait ? "row" : "column",
                   alignItems: "center", gap: isPortrait ? "4vmin" : "1.5vw", textAlign: "center" }}>
          <div style={{ width: isPortrait ? "14vmin" : "6vw", height: isPortrait ? "14vmin" : "6vw",
                        borderRadius: "50%", backgroundColor: "white", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: isPortrait ? "7vmin" : "3vw" }}>{m.emoji}</div>
          <p style={{ fontWeight: 900, fontSize: isPortrait ? "4.5vmin" : "1.8vw", color: "white",
                      textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{m.label}</p>
        </button>
      ))}
    </div>
  );
}

export function PaymentMethodScreen({ booth, onSelect, onBack, prefsOverride }: PaymentMethodScreenProps) {
  const prefs = getEffectivePrefs(booth, prefsOverride);
  const { accentColor } = booth;
  const isPortrait = useIsPortrait();

  // Baca enabledPaymentMethods langsung dari welcomeScreenPrefs (tidak melalui getEffectivePrefs karena field ini tidak ada di WelcomeScreenPrefs)
  const rawPrefs = (prefsOverride ?? booth.welcomeScreenPrefs) as Record<string, unknown> | null;
  const enabledMethods = rawPrefs?.enabledPaymentMethods as ("TICKET" | "CASHLESS" | "VOUCHER" | "CASH")[] | undefined;
  const visibleMethods = METHODS.filter((m) =>
    enabledMethods ? enabledMethods.includes(m.id) : true
  );

  const bgColor       = prefs.paymentBgColor ?? booth.primaryColor;
  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)";
  const cardBorder    = light ? "rgba(0,0,0,0.10)"  : "rgba(255,255,255,0.14)";
  const style         = prefs.paymentStyle ?? "bold";

  return (
    <div className="flex flex-col h-full px-8 py-10 select-none" style={{ backgroundColor: bgColor }}>
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="self-start rounded-full p-3 active:scale-95 transition-transform shadow-lg mb-4"
          style={{
            backgroundColor: light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.2)",
            color: textPrimary,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
      )}
      
      {/* Header */}
      <div className={`text-center ${isPortrait ? "mb-6" : "mb-10"}`}>
        <h2 className={`font-black ${isPortrait ? "text-3xl" : "text-4xl"}`} style={{ color: textPrimary }}>
          {prefs.paymentHeaderText || "Pilih Metode Pembayaran"}
        </h2>
        <p className="text-sm mt-2" style={{ color: textSecondary }}>
          Klik icon untuk memilih metode yang akan kamu pakai
        </p>
      </div>

      {/* Method cards */}
      <div className="flex-1 flex items-center">
        {style === "minimal" ? (
          <CardsMinimal methods={visibleMethods} accentColor={accentColor} onSelect={onSelect} isPortrait={isPortrait} />
        ) : style === "colorful" ? (
          <CardsColorful methods={visibleMethods} onSelect={onSelect} isPortrait={isPortrait} />
        ) : style === "columns" ? (
          <CardsColumns methods={visibleMethods} textPrimary={textPrimary} cardBorder={cardBorder} onSelect={onSelect} isPortrait={isPortrait} />
        ) : style === "bold" ? (
          <CardsBold methods={visibleMethods} onSelect={onSelect} isPortrait={isPortrait} />
        ) : (
          <CardsCard methods={visibleMethods} cardBorder={cardBorder} onSelect={onSelect} isPortrait={isPortrait} />
        )}
      </div>
    </div>
  );
}
