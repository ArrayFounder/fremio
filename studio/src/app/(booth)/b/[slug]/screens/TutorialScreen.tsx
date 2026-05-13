"use client";

import React from "react";
import type { BoothConfigData, WelcomeScreenPrefs } from "../types";
import { getEffectivePrefs } from "./IdleScreen";

interface TutorialScreenProps {
  booth:           BoothConfigData;
  onStart:         () => void;
  onBack?:         () => void;
  prefsOverride?:  WelcomeScreenPrefs | null;
}

const STEPS = [
  {
    emoji: "💳",
    title: "Pilih Metode Pembayaran",
    desc: "Bayar dengan Scan Ticket, Cashless, atau Voucher — pilih yang paling mudah buatmu.",
  },
  {
    emoji: "🖼️",
    title: "Pilih Frame",
    desc: "Pilih frame favorit dari koleksi Fremio Designer. Preview langsung sebelum memilih.",
  },
  {
    emoji: "🖨️",
    title: "Pilih Jumlah Print",
    desc: "Tentukan berapa lembar cetak yang kamu inginkan untuk kenangan lebih banyak.",
  },
  {
    emoji: "💰",
    title: "Payment Session",
    desc: "Selesaikan pembayaran via QRIS atau metode pilihanmu. Cepat dan aman.",
  },
  {
    emoji: "📸",
    title: "Review & Filter",
    desc: "Ambil foto, cek hasilnya, dan tambahkan filter yang kamu suka sebelum cetak.",
  },
  {
    emoji: "🎉",
    title: "Print & Download",
    desc: "Ambil cetakanmu dan scan QR code untuk download softfile ke HP kamu.",
  },
];

/** Returns true when a hex color is light (luminance > 0.5) */
function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

// ─── Step Style Components ──────────────────────────────────────────────────────

/** Style: "card" — horizontal scroll, adaptive cards with emoji (default) */
function StepsCard({ accentColor, cardBg, cardBorder, textPrimary, textSecondary, bgColor }: {
  accentColor: string; cardBg: string; cardBorder: string;
  textPrimary: string; textSecondary: string; bgColor: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "clamp(6px,1vw,14px)", width: "100%" }}>
      {STEPS.map((step, i) => (
        <div key={i} style={{
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
          borderRadius: "clamp(10px,1.5vw,20px)", padding: "clamp(10px,1.5vw,22px) clamp(6px,1vw,14px)", gap: "0.4vw",
          backgroundColor: cardBg, border: `1.5px solid ${cardBorder}`,
        }}>
          <div style={{
            width: "clamp(18px,2.5vw,36px)", height: "clamp(18px,2.5vw,36px)", borderRadius: "50%", flexShrink: 0,
            backgroundColor: accentColor, color: bgColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "clamp(9px,1.2vw,18px)", fontWeight: 900,
          }}>{i + 1}</div>
          <span style={{ fontSize: "clamp(20px,3vw,48px)" }}>{step.emoji}</span>
          <p style={{ fontWeight: 900, fontSize: "clamp(10px,1.2vw,18px)", color: textPrimary, lineHeight: 1.3 }}>{step.title}</p>
          <p style={{ fontSize: "clamp(9px,0.9vw,14px)", color: textSecondary, lineHeight: 1.4 }}>{step.desc}</p>
        </div>
      ))}
    </div>
  );
}

/** Style: "minimal" — 3-col white grid, colored circle numbers, clean text */
function StepsMinimal({ accentColor }: { accentColor: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "clamp(10px,1.5vw,20px)", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {STEPS.map((step, i) => (
          <div key={i} style={{
            padding: "clamp(10px,2vw,28px) clamp(8px,1.5vw,20px)", display: "flex", alignItems: "center", gap: "clamp(6px,1vw,14px)",
            background: Math.floor(i / 3) % 2 === 1 ? "#fef9e7" : "white",
            borderRight: i % 3 < 2 ? "1px solid #e5e7eb" : "none",
            borderBottom: i < 3 ? "1px solid #e5e7eb" : "none",
          }}>
            <div style={{
              width: "clamp(22px,3.5vw,48px)", height: "clamp(22px,3.5vw,48px)", borderRadius: "50%", flexShrink: 0,
              backgroundColor: accentColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "clamp(10px,1.5vw,20px)", fontWeight: 900, color: "white",
            }}>{i + 1}</div>
            <p style={{ fontWeight: 800, fontSize: "clamp(10px,1.4vw,20px)", color: "#111827", lineHeight: 1.3 }}>{step.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const COLORFUL_CELL_BG = ["#bae6fd", "#fda4af", "#e9d5ff", "#bbf7d0", "#fed7aa", "#a5f3fc"];

/** Style: "colorful" — pastel-colored cells with large emoji */
function StepsColorful() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "clamp(4px,0.7vw,10px)" }}>
      {STEPS.map((step, i) => (
        <div key={i} style={{
          backgroundColor: COLORFUL_CELL_BG[i % COLORFUL_CELL_BG.length],
          borderRadius: "clamp(10px,1.5vw,20px)", padding: "clamp(10px,2vw,28px) clamp(6px,1vw,14px)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(4px,0.7vw,10px)", textAlign: "center",
        }}>
          <span style={{ fontSize: "clamp(22px,3.5vw,52px)" }}>{step.emoji}</span>
          <p style={{ fontWeight: 800, fontSize: "clamp(10px,1.4vw,20px)", color: "#1f2937", lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );
}

/** Style: "columns" — horizontal columns per step, uppercase text */
function StepsColumns({ textPrimary, cardBorder }: { textPrimary: string; cardBorder: string }) {
  return (
    <div style={{ display: "flex", width: "100%" }}>
      {STEPS.map((step, i) => (
        <div key={i} style={{
          flex: 1, padding: "clamp(10px,1.5vw,22px) clamp(4px,0.5vw,8px)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(6px,1vw,14px)", textAlign: "center",
          borderRight: i < STEPS.length - 1 ? `1px solid ${cardBorder}` : "none",
        }}>
          <span style={{ fontSize: "clamp(20px,3.5vw,52px)" }}>{step.emoji}</span>
          <p style={{ fontWeight: 900, fontSize: "clamp(9px,1.1vw,16px)", color: textPrimary, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );
}

const BOLD_CELL_BG = ["#7c3aed", "#db2777", "#0891b2", "#ea580c", "#dc2626", "#16a34a"];

/** Style: "bold" — vivid colored cells, large white circle numbers, ALL CAPS */
function StepsBold() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
      {STEPS.map((step, i) => (
        <div key={i} style={{
          backgroundColor: BOLD_CELL_BG[i % BOLD_CELL_BG.length],
          padding: "clamp(12px,2.2vw,32px) clamp(8px,1.2vw,18px)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(6px,1vw,14px)", textAlign: "center",
        }}>
          <div style={{
            width: "clamp(28px,4.5vw,64px)", height: "clamp(28px,4.5vw,64px)", borderRadius: "50%", backgroundColor: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "clamp(11px,1.9vw,28px)", fontWeight: 900, color: BOLD_CELL_BG[i % BOLD_CELL_BG.length],
          }}>{i + 1}</div>
          <p style={{ fontWeight: 900, fontSize: "clamp(9px,1.3vw,18px)", color: "white", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.3 }}>{step.title}</p>
        </div>
      ))}
    </div>
  );
}

export function TutorialScreen({ booth, onStart, onBack, prefsOverride }: TutorialScreenProps) {
  const prefs = getEffectivePrefs(booth, prefsOverride);
  const { accentColor } = booth;

  const bgColor = prefs.tutorialBackgroundColor ?? prefs.backgroundColor;
  const bgStyle: React.CSSProperties =
    prefs.tutorialBackgroundType === "image" && prefs.tutorialBackgroundImageUrl
      ? { backgroundImage: `url(${prefs.tutorialBackgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: bgColor };

  const light   = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.90)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.50)";
  const cardBg        = light ? "rgba(0,0,0,0.05)"  : "rgba(255,255,255,0.10)";
  const cardBorder    = light ? "rgba(0,0,0,0.10)"  : "rgba(255,255,255,0.12)";

  return (
    <div className="relative h-full select-none overflow-hidden" style={bgStyle}>

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute rounded-full p-3 active:scale-95 transition-transform shadow-lg"
          style={{
            left: "2%",
            top: "2%",
            backgroundColor: light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.2)",
            color: textPrimary,
            zIndex: 20,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
      )}

      {/* Header teks — absolutely positioned, draggable in editor */}
      <div
        style={{
          position:   "absolute",
          left:       `${prefs.tutorialHeaderX}%`,
          top:        `${prefs.tutorialHeaderY}%`,
          transform:  "translate(-50%, -50%)",
          zIndex:     5,
          textAlign:  "center",
          fontFamily: prefs.tutorialHeaderFont === "inherit" ? undefined : prefs.tutorialHeaderFont,
          fontSize:   prefs.tutorialHeaderSize,
          fontWeight: 900,
          color:      prefs.tutorialHeaderColor,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {prefs.tutorialHeaderText}
      </div>

      {/* Step cards block — absolutely positioned, draggable in editor */}
      <div
        style={{
          position:  "absolute",
          left:      `${prefs.tutorialStepsX}%`,
          top:       `${prefs.tutorialStepsY}%`,
          width:     `${prefs.tutorialStepsWidth}%`,
          transform: "translate(-50%, -50%)",
          zIndex:    5,
        }}
      >
        {prefs.tutorialStyle === "minimal" ? (
          <StepsMinimal accentColor={accentColor} />
        ) : prefs.tutorialStyle === "colorful" ? (
          <StepsColorful />
        ) : prefs.tutorialStyle === "columns" ? (
          <StepsColumns textPrimary={textPrimary} cardBorder={cardBorder} />
        ) : prefs.tutorialStyle === "bold" ? (
          <StepsBold />
        ) : (
          <StepsCard accentColor={accentColor} cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} bgColor={bgColor} />
        )}
      </div>

      {/* CTA button — absolutely positioned, draggable in editor */}
      <button
        onClick={onStart}
        className="absolute rounded-2xl text-xl font-black active:scale-95 transition-transform shadow-lg"
        style={{
          left:             `${prefs.tutorialCtaX}%`,
          top:              `${prefs.tutorialCtaY}%`,
          width:            `${prefs.tutorialCtaWidth}%`,
          transform:        "translate(-50%, -50%)",
          backgroundColor:  prefs.tutorialCtaColor,
          color:            bgColor,
          paddingTop:       "1rem",
          paddingBottom:    "1rem",
          zIndex:           10,
        }}
      >
        {prefs.tutorialCtaText}
      </button>
    </div>
  );
}

