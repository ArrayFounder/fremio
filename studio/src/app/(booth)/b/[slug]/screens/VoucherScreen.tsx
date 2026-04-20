"use client";

import { useState } from "react";
import type { BoothConfigData, VoucherInfo } from "../types";
import { getAdaptiveColors } from "../colorUtils";

interface VoucherScreenProps {
  booth:    BoothConfigData;
  onApply:  (voucher: VoucherInfo) => void;
  onBack:   () => void;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function VoucherScreen({ booth, onApply, onBack }: VoucherScreenProps) {
  const [code,      setCode]      = useState("");
  const [status,    setStatus]    = useState<"idle" | "loading" | "valid" | "error">("idle");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [info,      setInfo]      = useState<VoucherInfo | null>(null);

  const accent  = booth.accentColor  || "#d4a017";
  const primary = booth.primaryColor || "#0a1a4a";
  const colors  = getAdaptiveColors(primary);

  // Adaptive input border color based on bg lightness
  const idleBorder = colors.light ? "2.5px solid rgba(0,0,0,0.25)" : "2.5px solid rgba(255,255,255,0.4)";

  async function handleValidate() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setStatus("loading");
    setErrorMsg("");
    setInfo(null);

    try {
      const res = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boothConfigId: booth.id, code: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setStatus("error");
        setErrorMsg(json.error ?? "Voucher tidak valid");
        return;
      }
      const d = json.data as Omit<VoucherInfo, "code">;
      setInfo({ ...d, code: trimmed });
      setStatus("valid");
    } catch {
      setStatus("error");
      setErrorMsg("Terjadi kesalahan. Coba lagi.");
    }
  }

  function handleConfirm() {
    if (!info) return;
    onApply(info);
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5vw",
    padding: "3vw 5vw",
    background: primary,
    fontFamily: "inherit",
    overflow: "hidden",
  };

  return (
    <div style={containerStyle}>
      <style>{`
        .voucher-input::placeholder { color: ${colors.light ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.45)"}; }
        .voucher-input:-webkit-autofill { -webkit-text-fill-color: ${colors.textPrimary}; }
      `}</style>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "4vw", marginBottom: "0.5vw" }}>🏷️</div>
        <h2 style={{ color: colors.textPrimary, fontWeight: 800, fontSize: "2.2vw", margin: 0 }}>
          Masukkan Kode Voucher
        </h2>
        <p style={{ color: colors.textSecondary, fontSize: "1.2vw", marginTop: "0.4vw" }}>
          Harga photobox (termasuk 1 print): {formatRupiah(booth.pricePerSession)}
        </p>
        <p style={{ color: colors.textSecondary, fontSize: "1.0vw", marginTop: "0.2vw" }}>
          Print tambahan: {formatRupiah(booth.printPricePerSheet)}/lembar
        </p>
      </div>

      {/* Input Area */}
      <div style={{ width: "100%", maxWidth: "60vw", display: "flex", flexDirection: "column", gap: "1vw" }}>
        <div style={{ display: "flex", gap: "1vw" }}>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (status !== "idle") { setStatus("idle"); setInfo(null); }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleValidate(); }}
            placeholder="CONTOH: DISKON50"
            maxLength={50}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="voucher-input"
            style={{
              flex: 1,
              padding: "1.2vw 1.5vw",
              borderRadius: "1vw",
              border: status === "error"   ? "2px solid #f87171"
                    : status === "valid"   ? "2px solid #4ade80"
                    : idleBorder,
              background: colors.surfaceBg,
              color: colors.textPrimary,
              fontSize: "1.8vw",
              fontWeight: 700,
              letterSpacing: "0.1em",
              outline: "none",
              caretColor: colors.textPrimary,
            }}
          />
          <button
            onClick={handleValidate}
            disabled={!code.trim() || status === "loading"}
            style={{
              padding: "0 2.5vw",
              borderRadius: "1vw",
              background: !code.trim() ? colors.surfaceDark : accent,
              color: !code.trim() ? colors.textSecondary : "white",
              fontWeight: 800,
              fontSize: "1.5vw",
              border: "none",
              cursor: !code.trim() ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
              opacity: status === "loading" ? 0.7 : 1,
              flexShrink: 0,
            }}
          >
            {status === "loading" ? "..." : "Cek"}
          </button>
        </div>

        {/* Error */}
        {status === "error" && (
          <div style={{
            background: "rgba(239,68,68,0.15)",
            border: "1.5px solid #f87171",
            borderRadius: "0.8vw",
            padding: "0.8vw 1.5vw",
            color: "#fca5a5",
            fontSize: "1.2vw",
            textAlign: "center",
          }}>
            ❌ {errorMsg}
          </div>
        )}

        {/* Valid Voucher Info */}
        {status === "valid" && info && (
          <div style={{
            background: "rgba(74,222,128,0.12)",
            border: "2px solid #4ade80",
            borderRadius: "1vw",
            padding: "1.2vw 1.5vw",
            display: "flex",
            flexDirection: "column",
            gap: "0.8vw",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
              <span style={{ fontSize: "2.5vw" }}>🎉</span>
              <div>
                <p style={{ color: "#4ade80", fontWeight: 800, fontSize: "1.5vw", margin: 0 }}>
                  Voucher Valid!
                </p>
                <p style={{ color: colors.textSecondary, fontSize: "1.1vw", margin: 0 }}>
                  {info.type === "FREE"
                    ? "Kamu dapat foto GRATIS 🎊"
                    : info.type === "PERCENT"
                    ? `Diskon ${info.discountValue}% (hemat ${formatRupiah(info.discountAmount)})`
                    : `Potongan ${formatRupiah(info.discountAmount)}`}
                </p>
              </div>
            </div>

            {/* Price summary */}
            <div style={{
              background: colors.surfaceBg,
              borderRadius: "0.8vw",
              padding: "0.8vw 1.2vw",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div style={{ color: colors.textSecondary, fontSize: "1.1vw" }}>
                <div>Harga photobox: <span style={{ textDecoration: "line-through" }}>{formatRupiah(booth.pricePerSession)}</span></div>
                <div>Diskon: <span style={{ color: "#4ade80" }}>-{formatRupiah(info.discountAmount)}</span></div>
                {booth.printPricePerSheet > 0 && (
                  <div style={{ marginTop: "0.3vw", fontSize: "1vw" }}>
                    Print tambahan: {formatRupiah(booth.printPricePerSheet)}/lembar
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ color: colors.textSecondary, fontSize: "1vw", margin: 0 }}>Harga photobox setelah diskon</p>
                <p style={{
                  color: info.finalAmount === 0 ? "#4ade80" : colors.textPrimary,
                  fontWeight: 800,
                  fontSize: "2vw",
                  margin: 0,
                }}>
                  {info.finalAmount === 0 ? "GRATIS" : formatRupiah(info.finalAmount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "1.5vw" }}>
        <button
          onClick={onBack}
          style={{
            padding: "1vw 2.5vw",
            borderRadius: "1vw",
            background: colors.surfaceDark,
            color: colors.textPrimary,
            fontWeight: 700,
            fontSize: "1.5vw",
            border: `1px solid ${colors.surfaceBorder}`,
            cursor: "pointer",
          }}
        >
          ← Kembali
        </button>

        {status === "valid" && info && (
          <button
            onClick={handleConfirm}
            style={{
              padding: "1vw 3vw",
              borderRadius: "1vw",
              background: accent,
              color: "white",
              fontWeight: 800,
              fontSize: "1.5vw",
              border: "none",
              cursor: "pointer",
            }}
          >
            {info.finalAmount === 0 ? "🎊 Lanjut Pilih Jumlah Print!" : `Pakai Voucher → Hemat ${formatRupiah(info.discountAmount)}`}
          </button>
        )}
      </div>
    </div>
  );
}
