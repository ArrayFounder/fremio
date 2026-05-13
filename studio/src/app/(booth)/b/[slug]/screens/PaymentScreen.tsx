"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { usePaymentPolling } from "../hooks/usePaymentPolling";
import type { BoothConfigData } from "../types";

interface PaymentScreenProps {
  booth:        BoothConfigData;
  orderId:      string;
  sessionId:    string;
  qrImageUrl:   string | null;
  qrString:     string | null;
  snapToken:    string | null;
  snapClientKey: string | null;
  snapRedirectUrl: string | null;
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
  snapToken,
  snapClientKey,
  snapRedirectUrl,
  amount,
  expiresAt,
  onPaid,
  onCancel,
}: PaymentScreenProps) {
  const { primaryColor } = booth;
  const [simulating, setSimulating]   = useState(false);
  const [qrDataUrl, setQrDataUrl]     = useState<string | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const snapOpenedRef                 = useRef(false);
  const snapPaidRef                   = useRef(false);  // track successful payment

  // ── Snap: load script + auto-open popup ─────────────────────────────────
  useEffect(() => {
    if (!snapToken || snapOpenedRef.current) return;

    const clientKey = snapClientKey ?? process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
    const redirectUrl = snapRedirectUrl ?? "";
    const isProduction = redirectUrl.includes("app.midtrans.com")
      ? true
      : redirectUrl.includes("app.sandbox.midtrans.com")
        ? false
        : process.env.NEXT_PUBLIC_MIDTRANS_ENV === "production";
    const snapSrc = isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";

    if (!clientKey) {
      console.error("[PaymentScreen] Snap client key kosong");
      onCancel();
      return;
    }

    async function handleSnapSuccess() {
      snapPaidRef.current = true;
      // Verifikasi + aktifkan session di server sebelum lanjut ke kamera
      try {
        const res  = await fetch("/api/payment/snap-activate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ orderId }),
        });
        const json = await res.json();
        if (json.success) {
          onPaid(sessionId);
        } else {
          console.error("[snap-activate] gagal:", json.error);
          // Tetap lanjutkan — mungkin webhook sudah mengaktifkan sesi
          onPaid(sessionId);
        }
      } catch (err) {
        console.error("[snap-activate] network error:", err);
        // Tetap lanjutkan agar user tidak terjebak
        onPaid(sessionId);
      }
    }

    function openSnap() {
      snapOpenedRef.current = true;
      setSnapLoading(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).snap.embed(snapToken, {
        embedId: "snap-container",
        onSuccess: () => { void handleSnapSuccess(); },
        onPending: () => { /* tetap polling */ },
        onError:   () => { /* embed — tidak ada close button yang trigger redirect */ },
        onClose:   () => { /* embed — tidak ada close button */ },
      });
    }

    setSnapLoading(true);
    Array.from(document.querySelectorAll('script[src*="midtrans.com/snap/snap.js"]')).forEach((el) => el.remove());
    const script = document.createElement("script");
    script.src = snapSrc;
    script.setAttribute("data-client-key", clientKey);
    script.onload  = openSnap;
    script.onerror = () => { setSnapLoading(false); onCancel(); };
    document.head.appendChild(script);

    return () => {
      // Jangan remove script — mungkin sudah dibersihkan oleh Snap
    };
  }, [snapToken, snapClientKey, snapRedirectUrl, sessionId, onPaid, onCancel]);

  // Render qrString → data URL jika qrImageUrl tidak tersedia (Xendit)
  useEffect(() => {
    if (qrImageUrl || !qrString) return;
    QRCode.toDataURL(qrString, { width: 300, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [qrImageUrl, qrString]);

  // Polling
  usePaymentPolling(orderId, onPaid, onCancel);

  const isSandbox = snapToken
    ? (snapRedirectUrl?.includes("sandbox") ?? false)
    : process.env.NEXT_PUBLIC_MIDTRANS_ENV !== "production";

  // ── QR / Snap embed ─────────────────────────────────────────────────────
  const QrContent = snapToken ? (
    <div
      id="snap-container"
      className="rounded-3xl overflow-hidden"
      style={{ width: "420px", minHeight: "520px", backgroundColor: "white" }}
    >
      {snapLoading && (
        <div className="flex items-center justify-center" style={{ width: "420px", height: "520px" }}>
          <span className="text-gray-400 text-sm animate-pulse">Memuat pembayaran…</span>
        </div>
      )}
    </div>
  ) : (
    <div className="flex flex-col items-center gap-4 rounded-3xl p-6" style={{ backgroundColor: "white" }}>
      {qrImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrImageUrl} alt="QRIS" className="w-64 h-64 object-contain"
             onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="QRIS" className="w-64 h-64 object-contain" />
      ) : (
        <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-xl">
          <span className="text-gray-400 text-sm animate-pulse">Memuat QR…</span>
        </div>
      )}
      <div className="text-center">
        <p className="text-gray-400 text-xs">Total Pembayaran</p>
        <p className="font-black text-gray-900 text-2xl">Rp {amount.toLocaleString("id-ID")}</p>
      </div>
    </div>
  );

  const QRIS_WALLETS = [
    { name: "GoPay",      bg: "#00AED6" },
    { name: "OVO",        bg: "#4C3494" },
    { name: "Dana",       bg: "#118EEA" },
    { name: "ShopeePay", bg: "#EE4D2D" },
    { name: "LinkAja",   bg: "#CC0000" },
    { name: "BCA",       bg: "#005DAA" },
    { name: "BNI",       bg: "#EB5B1E" },
    { name: "BRI",       bg: "#00529B" },
    { name: "Mandiri",   bg: "#003087" },
    { name: "BSI",       bg: "#2D8654" },
    { name: "CIMB",      bg: "#C8102E" },
    { name: "Permata",   bg: "#0066B3" },
    { name: "SeaBank",   bg: "#FF6600" },
  ];

  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 select-none"
         style={{ backgroundColor: primaryColor }}>
      {QrContent}

      {/* Bank / e-wallet logos */}
      <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: "white", width: snapToken ? "420px" : "320px" }}>
        <p className="text-gray-400 text-xs font-medium mb-3 text-center uppercase tracking-wider">Pembayaran Melalui</p>
        <div className="flex flex-wrap justify-center gap-2">
          {QRIS_WALLETS.map((b) => (
            <span
              key={b.name}
              className="px-3 py-1.5 rounded-full text-white text-xs font-semibold"
              style={{ backgroundColor: b.bg }}
            >
              {b.name}
            </span>
          ))}
        </div>
      </div>

      {/* Simulasi bayar — sandbox only */}
      {isSandbox && (
        <button disabled={simulating}
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
                className="px-6 py-3 rounded-2xl text-sm font-bold text-gray-900 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 transition-colors">
          {simulating ? "Memproses…" : "⚡ Simulasi Bayar (Testing)"}
        </button>
      )}
    </div>
  );
}
