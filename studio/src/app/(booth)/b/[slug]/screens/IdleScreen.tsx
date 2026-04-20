"use client";

import type { BoothConfigData, WelcomeScreenPrefs } from "../types";

interface IdleScreenProps {
  booth:     BoothConfigData;
  onStart:   () => void;
  isLoading: boolean;
  /** Override prefs — dipakai editor untuk real-time preview */
  prefsOverride?: WelcomeScreenPrefs | null;
}

/** Default values saat welcomeScreenPrefs null */
export function getEffectivePrefs(booth: BoothConfigData, override?: WelcomeScreenPrefs | null): WelcomeScreenPrefs {
  const stored = override ?? (booth.welcomeScreenPrefs as WelcomeScreenPrefs | null);
  return {
    backgroundType:     stored?.backgroundType     ?? "color",
    backgroundColor:    stored?.backgroundColor    ?? booth.primaryColor,
    backgroundImageUrl: stored?.backgroundImageUrl ?? null,
    ctaText:            stored?.ctaText            ?? "✨ Mulai Foto",
    ctaColor:           stored?.ctaColor           ?? booth.accentColor,
    ctaX:               stored?.ctaX               ?? 50,
    ctaY:               stored?.ctaY               ?? 75,
    ctaWidth:           stored?.ctaWidth           ?? 75,
    logoX:              stored?.logoX              ?? 50,
    logoY:              stored?.logoY              ?? 50,
    logoWidth:          stored?.logoWidth          ?? 40,
    tutorialStepsX:     stored?.tutorialStepsX     ?? 50,
    tutorialStepsY:     stored?.tutorialStepsY     ?? 42,
    tutorialStepsWidth: stored?.tutorialStepsWidth ?? 92,
    tutorialHeaderText:  stored?.tutorialHeaderText  ?? "Tutorial",
    tutorialHeaderX:     stored?.tutorialHeaderX     ?? 50,
    tutorialHeaderY:     stored?.tutorialHeaderY     ?? 10,
    tutorialHeaderSize:  stored?.tutorialHeaderSize  ?? 28,
    tutorialHeaderFont:  stored?.tutorialHeaderFont  ?? "inherit",
    tutorialHeaderColor: stored?.tutorialHeaderColor ?? booth.accentColor,
    tutorialCtaX:       stored?.tutorialCtaX       ?? 50,
    tutorialCtaY:       stored?.tutorialCtaY       ?? 82,
    tutorialCtaWidth:   stored?.tutorialCtaWidth   ?? 72,
    tutorialCtaText:    stored?.tutorialCtaText    ?? "Mulai Sekarang →",
    tutorialCtaColor:   stored?.tutorialCtaColor   ?? booth.accentColor,
    tutorialBackgroundType:     stored?.tutorialBackgroundType     ?? "color",
    tutorialBackgroundColor:    stored?.tutorialBackgroundColor    ?? booth.primaryColor,
    tutorialBackgroundImageUrl: stored?.tutorialBackgroundImageUrl ?? null,
    tutorialStyle:              stored?.tutorialStyle              ?? "card",
    paymentBgColor:    stored?.paymentBgColor    ?? booth.primaryColor,
    paymentHeaderText: stored?.paymentHeaderText ?? "Pilih Metode Pembayaran",
    paymentStyle:      (stored?.paymentStyle as "card" | "minimal" | "colorful" | "columns" | "bold") ?? "card",
  };
}

/**
 * IDLE SCREEN — Layar standby booth.
 * Menampilkan nama booth dan tombol "Mulai Foto".
 */
export function IdleScreen({ booth, onStart, isLoading, prefsOverride }: IdleScreenProps) {
  const prefs = getEffectivePrefs(booth, prefsOverride);

  const bgStyle: React.CSSProperties =
    prefs.backgroundType === "image" && prefs.backgroundImageUrl
      ? { backgroundImage: `url(${prefs.backgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: prefs.backgroundColor };

  return (
    <div
      className="relative flex flex-col h-full items-center justify-between py-16 px-8 select-none overflow-hidden"
      style={bgStyle}
    >
      {/* Logo Fremio — posisi absolut sesuai prefs */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-fremio.png"
        alt="Fremio"
        draggable={false}
        style={{
          position:  "absolute",
          left:      `${prefs.logoX}%`,
          top:       `${prefs.logoY}%`,
          width:     `${prefs.logoWidth}%`,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* CTA button — posisi absolut sesuai prefs */}
      <button
        onClick={onStart}
        disabled={isLoading}
        style={{
          position:         "absolute",
          left:             `${prefs.ctaX}%`,
          top:              `${prefs.ctaY}%`,
          transform:        "translate(-50%, -50%)",
          backgroundColor:  isLoading ? `${prefs.ctaColor}88` : prefs.ctaColor,
          color:            prefs.backgroundColor,
          width:            `${prefs.ctaWidth}%`,
          zIndex:           10,
        }}
        className="py-10 rounded-3xl text-4xl font-black tracking-tight
                   transition-all duration-200 active:scale-95 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-3">
            <span className="inline-block h-6 w-6 rounded-full border-4 border-current
                             border-t-transparent animate-spin" />
            Memproses…
          </span>
        ) : (
          prefs.ctaText
        )}
      </button>
    </div>
  );
}

