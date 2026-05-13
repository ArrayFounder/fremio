"use client";

import { useState, useEffect } from "react";
import type { BoothConfigData, FrameData, VoucherInfo } from "../types";

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

interface PrintCountScreenProps {
  booth:    BoothConfigData;
  frame:    FrameData;
  /** Voucher yang sudah divalidasi (opsional — hanya pada flow VOUCHER) */
  voucher?: VoucherInfo | null;
  onSelect: (count: number) => void;
  onBack?:  () => void;
}

const MIN = 1;
const MAX = 10;

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export function PrintCountScreen({ booth, frame, voucher, onSelect, onBack }: PrintCountScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.printCountBgColor as string | undefined ?? primaryColor;
  const [count, setCount] = useState(1);
  const isPortrait = useIsPortrait();

  const light         = isLightColor(bgColor);
  const textPrimary   = light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)";
  const textSecondary = light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)";
  const surfaceBg     = light ? "rgba(0,0,0,0.06)"  : "rgba(255,255,255,0.10)";
  const surfaceBorder = light ? "rgba(0,0,0,0.10)"  : "rgba(255,255,255,0.14)";
  const btnTextColor  = isLightColor(accentColor) ? "rgba(0,0,0,0.80)" : "white";

  // Hitung harga:
  // - Harga dasar (sudah termasuk 1 print) = pricePerSession
  // - Voucher hanya mengurangi harga dasar
  // - Print tambahan (lembar ke-2 dst) = (count-1) × printPricePerSheet
  const baseAfterDiscount = voucher
    ? Math.max(0, booth.pricePerSession - voucher.discountAmount)
    : booth.pricePerSession;
  const extraPrintCost = (count - 1) * booth.printPricePerSheet;
  const total = baseAfterDiscount + extraPrintCost;

  const hasDiscount = !!voucher && voucher.discountAmount > 0;

  const px = isPortrait ? "px-5" : "px-8";
  const py = isPortrait ? "py-4" : "py-8";

  return (
    <div
      className={`flex flex-col h-full ${px} ${py} select-none`}
      style={{ backgroundColor: bgColor }}
    >
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
      
      {/* Header — compact */}
      <div className={`${isPortrait ? "mb-3" : "mb-6"}`}>
        <h2
          className="font-black text-center"
          style={{ color: textPrimary, fontSize: isPortrait ? "clamp(18px,4vmin,28px)" : "2rem" }}
        >
          Pilih Jumlah Print
        </h2>
        {/* Frame badge kecil */}
        <div className="flex items-center justify-center gap-2 mt-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frame.thumbnailUrl} alt="" className="rounded-lg object-contain"
            style={{ height: isPortrait ? 28 : 36, width: "auto", maxWidth: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }} />
          <p style={{ color: textSecondary, fontSize: isPortrait ? 12 : 13 }}>
            <span style={{ color: textPrimary, fontWeight: 700 }}>{frame.name}</span>
            {" · "}{frame.maxCaptures} foto
          </p>
        </div>
      </div>

      {/* Stepper — compact */}
      <div className="flex items-center justify-center gap-6 shrink-0"
        style={{ marginBottom: isPortrait ? 12 : 24 }}>
        <button
          onClick={() => setCount(c => Math.max(MIN, c - 1))}
          className="active:scale-90 transition-transform flex items-center justify-center rounded-full font-black"
          style={{
            width: "clamp(44px,8vmin,64px)", height: "clamp(44px,8vmin,64px)",
            fontSize: "clamp(20px,4vmin,32px)",
            backgroundColor: surfaceBg, border: `1.5px solid ${surfaceBorder}`, color: textPrimary,
            opacity: count <= MIN ? 0.3 : 1,
          }}
          disabled={count <= MIN}
        >−</button>

        <div className="flex flex-col items-center" style={{ minWidth: "clamp(60px,12vmin,100px)" }}>
          <span className="font-black leading-none"
            style={{ fontSize: "clamp(48px,10vmin,80px)", color: textPrimary }}>
            {count}
          </span>
          <span style={{ color: textSecondary, fontSize: "clamp(11px,2vmin,15px)", fontWeight: 600 }}>lembar</span>
        </div>

        <button
          onClick={() => setCount(c => Math.min(MAX, c + 1))}
          className="active:scale-90 transition-transform flex items-center justify-center rounded-full font-black"
          style={{
            width: "clamp(44px,8vmin,64px)", height: "clamp(44px,8vmin,64px)",
            fontSize: "clamp(20px,4vmin,32px)",
            backgroundColor: surfaceBg, border: `1.5px solid ${surfaceBorder}`, color: textPrimary,
            opacity: count >= MAX ? 0.3 : 1,
          }}
          disabled={count >= MAX}
        >+</button>
      </div>

      {/* Rincian harga — compact card */}
      <div className="flex flex-col rounded-2xl overflow-hidden shrink-0"
        style={{ backgroundColor: surfaceBg, border: `1px solid ${surfaceBorder}` }}>

        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: `1px solid ${surfaceBorder}` }}>
          <p style={{ color: textSecondary, fontSize: 12 }}>
            Sesi{count === 1 ? " + 1 print" : ""}
          </p>
          {hasDiscount ? (
            <div className="flex items-center gap-1.5">
              <span style={{ color: textSecondary, fontSize: 11, textDecoration: "line-through" }}>
                Rp {booth.pricePerSession.toLocaleString("id-ID")}
              </span>
              <span style={{ color: accentColor, fontWeight: 700, fontSize: 12 }}>
                Rp {baseAfterDiscount.toLocaleString("id-ID")}
              </span>
            </div>
          ) : (
            <p style={{ color: textPrimary, fontWeight: 600, fontSize: 12 }}>
              Rp {booth.pricePerSession.toLocaleString("id-ID")}
            </p>
          )}
        </div>

        {count > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: `1px solid ${surfaceBorder}` }}>
            <p style={{ color: textSecondary, fontSize: 12 }}>
              +{count - 1} print (Rp {booth.printPricePerSheet.toLocaleString("id-ID")}/lbr)
            </p>
            <p style={{ color: textPrimary, fontWeight: 600, fontSize: 12 }}>
              Rp {extraPrintCost.toLocaleString("id-ID")}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <p style={{ color: textSecondary, fontSize: 12, fontWeight: 600 }}>Total</p>
          <p className="font-black"
            style={{ fontSize: "clamp(18px,3.5vmin,26px)", color: total === 0 ? "#4ade80" : accentColor }}>
            {total === 0 ? "GRATIS" : `Rp ${total.toLocaleString("id-ID")}`}
          </p>
        </div>
      </div>

      {/* Spacer kecil */}
      <div className="flex-1" style={{ minHeight: isPortrait ? 8 : 16 }} />

      {/* CTA */}
      <button
        onClick={() => onSelect(count)}
        className="w-full rounded-2xl font-black active:scale-95 transition-transform shadow-lg shrink-0"
        style={{
          backgroundColor: accentColor, color: btnTextColor,
          padding: isPortrait ? "14px 0" : "20px 0",
          fontSize: isPortrait ? "clamp(14px,3vmin,18px)" : "1.125rem",
        }}
      >
        Lanjut ke Pembayaran →
      </button>
    </div>
  );
}
