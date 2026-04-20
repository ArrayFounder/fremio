"use client";

import { useEffect, useState } from "react";
import { usePaymentPolling } from "../hooks/usePaymentPolling";
import { getAdaptiveColors } from "../colorUtils";
import type { BoothConfigData } from "../types";

interface PaymentScreenProps {
  booth:        BoothConfigData;
  orderId:      string;
  sessionId:    string;
  qrImageUrl:   string | null;
  qrString:     string | null;
  amount:       number;
  expiresAt:    Date | null;
  onPaid:       (sessionId: string) => void;
  onCancel:     () => void;
}

/**
 * PAYMENT SCREEN — Menampilkan QR Midtrans dan countdown 5 menit.
 * Polling status pembayaran setiap 3 detik.
 * Otomatis kembali ke IDLE jika waktu habis.
 */
export function PaymentScreen({
  booth,
  orderId,
  sessionId,
  qrImageUrl,
  qrString,
  amount,
  expiresAt,
  onPaid,
  onCancel,
}: PaymentScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);
  const [simulating, setSimulating]   = useState(false);

  // Countdown
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!expiresAt) return 300;
    const diff = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() =>
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          onCancel(); // waktu habis → balik ke IDLE
          return 0;
        }
        return s - 1;
      }), 1000
    );
    return () => clearInterval(id);
  }, []);                               // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  usePaymentPolling(orderId, onPaid, onCancel);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secs = String(secondsLeft % 60).padStart(2, "0");
  const urgent = secondsLeft <= 60;

  return (
    <div
      className="flex flex-col h-full items-center justify-between py-10 px-6 select-none"
      style={{ backgroundColor: primaryColor }}
    >
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold" style={{ color: textPrimary }}>Pembayaran QRIS</h2>
        <p className="text-sm mt-1" style={{ color: textSecondary }}>
          Scan QR di bawah dengan aplikasi dompet digital
        </p>
      </div>

      {/* QR Code */}
      <div
        className="flex flex-col items-center gap-4 rounded-3xl p-6"
        style={{ backgroundColor: "white" }}
      >
        {qrImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrImageUrl}
            alt="QRIS"
            className="w-56 h-56 object-contain"
            onError={(e) => {
              // Fallback jika qrImageUrl gagal load — render qrString sebagai teks QR
              e.currentTarget.style.display = "none";
            }}
          />
        ) : qrString ? (
          /* Fallback teks QR jika image tidak tersedia */
          <div className="w-56 h-56 flex items-center justify-center bg-gray-100 rounded-xl">
            <p className="text-xs text-gray-500 text-center break-all p-2">{qrString}</p>
          </div>
        ) : (
          <div className="w-56 h-56 flex items-center justify-center">
            <span className="text-gray-400 animate-pulse">Memuat QR…</span>
          </div>
        )}

        {/* Nominal */}
        <div className="text-center">
          <p className="text-gray-500 text-sm">Total Pembayaran</p>
          <p className="text-3xl font-black text-gray-900">
            Rp {amount.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Countdown + instruksi */}
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs uppercase tracking-wider" style={{ color: textSecondary }}>Sisa Waktu</p>
          <p
            className="text-5xl font-black tabular-nums"
            style={{ color: urgent ? "#f87171" : accentColor }}
          >
            {mins}:{secs}
          </p>
          {urgent && (
            <p className="text-red-400 text-sm font-medium animate-pulse">
              Segera selesaikan pembayaran!
            </p>
          )}
        </div>

        {/* Instruksi singkat */}
        <p className="text-xs text-center" style={{ color: textSecondary }}>
          GoPay · OVO · Dana · BCA Mobile · Semua QRIS
        </p>

        {/* Tombol batalkan */}
        <button
          onClick={onCancel}
          className="w-full py-4 rounded-2xl text-lg font-semibold
                     active:scale-95 transition-colors"
          style={{ color: textSecondary, border: `1px solid ${surfaceBorder}`, backgroundColor: surfaceBg }}
        >
          Batalkan
        </button>

        {/* ── Simulasi bayar (testing only) ── */}
        {process.env.NEXT_PUBLIC_MIDTRANS_ENV !== "production" && (
          <button
            disabled={simulating}
            onClick={async () => {
              setSimulating(true);
              try {
                const res  = await fetch("/api/payment/simulate-paid", {
                  method:  "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-agent-token": "ff03c6abc48b938e47846267d347f490ab1a0c3cb1476b5c2a16ce0099a0b590",
                  },
                  body: JSON.stringify({ sessionId }),
                });
                const body = await res.json();
                if (body.success) onPaid(sessionId);
              } catch (e) {
                console.error("Simulate paid error:", e);
              } finally {
                setSimulating(false);
              }
            }}
            className="w-full py-3 rounded-2xl text-sm font-bold text-primary-900
                       bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 transition-colors"
          >
            {simulating ? "Memproses…" : "⚡ Simulasi Bayar (Testing)"}
          </button>
        )}
      </div>
    </div>
  );
}
