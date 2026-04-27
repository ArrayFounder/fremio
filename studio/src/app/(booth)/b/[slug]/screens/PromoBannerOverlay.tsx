"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PromoBannerOverlayProps {
  banners:      { imageUrl: string }[];
  slideSeconds: number;
  onDismiss:    () => void;
}

/**
 * Full-screen promo banner overlay untuk IdleScreen.
 * Muncul setelah booth idle beberapa saat; klik di mana saja untuk tutup.
 */
export function PromoBannerOverlay({ banners, slideSeconds, onDismiss }: PromoBannerOverlayProps) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fade-in saat mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Auto-slide
  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIdx(i => (i + 1) % banners.length);
    }, slideSeconds * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length, slideSeconds]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 300); // tunggu fade-out selesai
  }, [onDismiss]);

  if (banners.length === 0) return null;

  const current = banners[idx];

  return (
    <div
      onClick={handleDismiss}
      style={{
        position:   "absolute",
        inset:      0,
        zIndex:     50,
        cursor:     "pointer",
        opacity:    visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* Banner image — full cover */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={idx}
        src={current.imageUrl}
        alt={`Promo banner ${idx + 1}`}
        draggable={false}
        style={{
          position:          "absolute",
          inset:             0,
          width:             "100%",
          height:            "100%",
          objectFit:         "cover",
          animation:         "promoBannerFadeIn 0.5s ease",
        }}
      />

      {/* Dot indicator (hanya jika lebih dari 1 banner) */}
      {banners.length > 1 && (
        <div style={{
          position:       "absolute",
          bottom:         "3%",
          left:           "50%",
          transform:      "translateX(-50%)",
          display:        "flex",
          gap:            "8px",
          alignItems:     "center",
        }}>
          {banners.map((_, i) => (
            <div
              key={i}
              style={{
                width:        i === idx ? 24 : 8,
                height:       8,
                borderRadius: 4,
                background:   i === idx ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)",
                transition:   "all 0.3s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* "Ketuk untuk melanjutkan" hint */}
      <div style={{
        position:      "absolute",
        bottom:        "8%",
        left:          "50%",
        transform:     "translateX(-50%)",
        background:    "rgba(0,0,0,0.45)",
        color:         "rgba(255,255,255,0.85)",
        fontSize:      "clamp(10px, 1.8vmin, 16px)",
        padding:       "6px 18px",
        borderRadius:  "100px",
        whiteSpace:    "nowrap",
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
        letterSpacing: "0.02em",
      }}>
        Ketuk untuk melanjutkan
      </div>

      <style>{`
        @keyframes promoBannerFadeIn {
          from { opacity: 0; transform: scale(1.02); }
          to   { opacity: 1; transform: scale(1);    }
        }
      `}</style>
    </div>
  );
}
