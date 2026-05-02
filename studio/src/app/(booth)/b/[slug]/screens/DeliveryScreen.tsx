"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateDownloadQR } from "@/lib/frameEngine";
import { getAdaptiveColors } from "../colorUtils";
import { detectPaperSize, getPaperSizeByName } from "../paperSize";
import type { BoothConfigData } from "../types";

interface DeliveryScreenProps {
  booth:        BoothConfigData;
  sessionId?:   string;
  downloadUrl:  string;
  photoUrl?:    string;   // URL foto final untuk dicetak (opsional)
  printerName?: string;   // printer dari BoothHardwareSettings
  /** Jumlah cetak yang dipilih customer — untuk auto-print otomatis */
  printCount?:  number;
  /** Canvas dimensions dari frame yang dipilih — untuk deteksi paper size */
  canvasWidth?:  number;
  canvasHeight?: number;
  /** Override ukuran kertas manual dari BoothSetupScreen (null = auto-detect) */
  paperSizeOverride?: string | null;
  onDone:       () => void;
}

const AUTO_RESET_SECONDS = 120;
const TRIAL_ONLY_MODE = true;

/**
 * DELIVERY SCREEN — Tampilkan QR code untuk download foto.
 * Auto-print sesuai jumlah yang dipilih customer (tanpa tombol cetak manual).
 * Auto-reset ke IDLE setelah AUTO_RESET_SECONDS detik tanpa interaksi.
 */
export function DeliveryScreen({ booth, sessionId, downloadUrl, photoUrl, printerName, printCount = 1, canvasWidth, canvasHeight, paperSizeOverride, onDone }: DeliveryScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.deliveryBgColor as string | undefined ?? primaryColor;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(bgColor);
  const [seconds, setSeconds]       = useState(AUTO_RESET_SECONDS);
  const [qrDataUrl, setQrDataUrl]   = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"pending" | "printing" | "airprint" | "done" | "error" | "unavailable">(
    booth.printEnabled && photoUrl ? "pending" : "unavailable"
  );

  // Delivery channels from booth prefs
  const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
  const channels = (prefs?.deliveryChannels as string[]) ?? ["DOWNLOAD", "WHATSAPP", "EMAIL"];
  const waEnabled = channels.includes("WHATSAPP");
  const emailEnabled = channels.includes("EMAIL");

  // WA / Email send states
  const [waNumber, setWaNumber] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  const [emailAddress, setEmailAddress] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Gunakan override ukuran kertas jika diset, atau auto-detect dari dimensi frame
  const paperSize = (paperSizeOverride ? getPaperSizeByName(paperSizeOverride) : null)
    ?? detectPaperSize(canvasWidth ?? 1080, canvasHeight ?? 1920);

  const printTriggeredRef = useRef(false);
  const paperUsageReportedRef = useRef(false);
  const mobilePrintAwaitingGestureRef = useRef(false);

  const isMobileOrTablet = typeof navigator !== "undefined" &&
    (/ipad|iphone|ipod/i.test(navigator.userAgent) ||
     /android/i.test(navigator.userAgent) ||
     (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  const reportSuccessfulPrint = useCallback(async () => {
    if (!sessionId || paperUsageReportedRef.current) return;

    const storageKey = `fremio_paper_usage_reported_${sessionId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1") {
      paperUsageReportedRef.current = true;
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/print-success`, { method: "POST" });
      if (res.ok) {
        paperUsageReportedRef.current = true;
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(storageKey, "1");
          } catch {
            // Ignore storage quota issues; backend has already been notified.
          }
        }
      }
    } catch {
      // Best-effort tracking; printing flow should not fail because of this.
    }
  }, [sessionId]);

  const triggerSystemPrint = useCallback(() => {
    if (!photoUrl) return;

    mobilePrintAwaitingGestureRef.current = false;
    setPrintStatus("airprint");

    document.getElementById("fremio-print-style")?.remove();
    document.getElementById("fremio-print-photo")?.remove();

    const styleEl = document.createElement("style");
    styleEl.id = "fremio-print-style";
    styleEl.textContent = `
      @media print {
        @page { size: ${paperSize.cssPageSize}; margin: 0; }
        body > *:not(#fremio-print-photo) { display: none !important; visibility: hidden !important; }
        #fremio-print-photo {
          display: flex !important; visibility: visible !important;
          position: fixed !important; inset: 0;
          align-items: center; justify-content: center;
          background: #fff;
        }
        #fremio-print-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
      }
    `;
    document.head.appendChild(styleEl);

    const printDiv = document.createElement("div");
    printDiv.id = "fremio-print-photo";
    printDiv.style.cssText = "display:none;";

    const printImg = document.createElement("img");
    printImg.src = photoUrl;
    printImg.alt = "Print Photo";
    printDiv.appendChild(printImg);
    document.body.appendChild(printDiv);

    const cleanup = () => {
      styleEl.remove();
      printDiv.remove();
      setPrintStatus("done");
      void reportSuccessfulPrint();
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }, [paperSize.cssPageSize, photoUrl, reportSuccessfulPrint]);


  // ─── Auto-print on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!booth.printEnabled || !photoUrl || printTriggeredRef.current) return;
    printTriggeredRef.current = true;

    const doPrint = async () => {
      setPrintStatus("printing");

      // Android/iPad/iPhone perlu user gesture untuk membuka sheet print.
      if (isMobileOrTablet) {
        mobilePrintAwaitingGestureRef.current = true;
        setPrintStatus("airprint");
        return;
      }

      // Desktop/Windows app: gunakan native system print (tanpa agent).
      triggerSystemPrint();
    };

    doPrint().catch((err) => {
      console.error("[DeliveryScreen] Auto-print error:", err);
      setPrintStatus("error");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileOrTablet, paperSize.heightMm, paperSize.name, paperSize.widthMm, photoUrl, printCount, printerName, reportSuccessfulPrint, triggerSystemPrint]);

  // ─── Generate QR code via frameEngine ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    generateDownloadQR(downloadUrl, {
      size:       240,
      darkColor:  "#000000",
      lightColor: "#ffffff",
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(console.error);

    return () => { cancelled = true; };
  }, [downloadUrl]);

  // ─── Countdown auto-reset ─────────────────────────────────────────────────
  useEffect(() => {
    if (seconds <= 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, onDone]);

  const printStatusLabel = () => {
    if (printStatus === "printing") return `🖨️ Mencetak ${printCount} lembar (${paperSize.name})… mohon tunggu`;
    if (printStatus === "airprint" && mobilePrintAwaitingGestureRef.current) return "📲 Tap tombol Cetak Foto untuk membuka print Mopria";
    if (printStatus === "airprint") return `📲 Pilih printer di sheet yang muncul → tap Print`;
    if (printStatus === "done")     return `✅ Cetak ${printCount} lembar (${paperSize.name}) selesai`;
    if (printStatus === "error")    return "⚠️ Gagal mencetak. Coba lagi.";
    return null;
  };

  const handleMobileAutoPrintGesture = useCallback(() => {
    if (!isMobileOrTablet || !mobilePrintAwaitingGestureRef.current || !photoUrl) return;
    triggerSystemPrint();
  }, [isMobileOrTablet, photoUrl, triggerSystemPrint]);

  const handleSendWhatsApp = useCallback(async () => {
    if (!waNumber.trim() || !downloadUrl) return;
    setWaSending(true);
    setWaError(null);
    setWaSent(false);
    try {
      const res = await fetch("/api/delivery/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: waNumber.trim(),
          downloadUrl,
          boothConfigId: booth.id,
          boothName: booth.boothName,
        }),
      });
      const json = await res.json().catch(() => ({ success: false, error: "Gagal kirim." }));
      if (!json.success) {
        setWaError(json.error ?? "Gagal kirim ke WhatsApp.");
      } else {
        setWaSent(true);
        setWaNumber("");
      }
    } catch {
      setWaError("Gagal kirim ke WhatsApp. Cek koneksi.");
    }
    setWaSending(false);
  }, [waNumber, downloadUrl, booth.id, booth.boothName]);

  const handleSendEmail = useCallback(async () => {
    if (!emailAddress.trim() || !downloadUrl) return;
    setEmailSending(true);
    setEmailError(null);
    setEmailSent(false);
    try {
      const res = await fetch("/api/delivery/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailAddress.trim(),
          downloadUrl,
          boothName: booth.boothName,
          boothConfigId: booth.id,
        }),
      });
      const json = await res.json().catch(() => ({ success: false, error: "Gagal kirim." }));
      if (!json.success) {
        setEmailError(json.error ?? "Gagal kirim ke Email.");
      } else {
        setEmailSent(true);
        setEmailAddress("");
      }
    } catch {
      setEmailError("Gagal kirim ke Email. Cek koneksi.");
    }
    setEmailSending(false);
  }, [emailAddress, downloadUrl, booth.boothName, booth.id]);

  return (
    <div
      className="flex flex-col h-full items-center gap-6 overflow-y-auto py-8 px-6 select-none"
      style={{ backgroundColor: bgColor }}
      onPointerUp={handleMobileAutoPrintGesture}
    >
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold" style={{ color: textPrimary }}>{(booth.welcomeScreenPrefs as Record<string, unknown> | null)?.deliveryHeaderText as string | undefined ?? "Foto Siap Diunduh"}</h2>
        <p className="text-sm mt-1" style={{ color: textSecondary }}>Scan QR di bawah dengan kameramu</p>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-4">
        {TRIAL_ONLY_MODE && (
          <div className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-300">
            Trial · Link QR 5 Menit
          </div>
        )}

        <div className="bg-white rounded-3xl p-4 shadow-2xl">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR Code Download"
              className="block"
              style={{ width: 240, height: 240 }}
            />
          ) : (
            <div className="w-60 h-60 flex items-center justify-center text-gray-400 text-sm">
              Memuat QR…
            </div>
          )}
        </div>

        {/* URL teks (fallback) */}
        <p className="text-xs text-center max-w-xs break-all" style={{ color: textTertiary }}>
          {downloadUrl}
        </p>

        {TRIAL_ONLY_MODE && (
          <p className="text-[11px] text-center max-w-xs" style={{ color: textTertiary }}>
            Scan QR lalu upgrade subscription di halaman link untuk mengaktifkan akses 24 jam.
          </p>
        )}
      </div>

      {/* WhatsApp input */}
      {waEnabled && (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              value={waNumber}
              onChange={(e) => { setWaNumber(e.target.value); setWaError(null); setWaSent(false); }}
              placeholder="Nomor WhatsApp (08xx...)"
              className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold outline-none border"
              style={{ borderColor: surfaceBorder, background: surfaceBg, color: textPrimary }}
              disabled={waSending}
            />
            <button
              onClick={handleSendWhatsApp}
              disabled={waSending || !waNumber.trim()}
              className="px-4 py-3 rounded-2xl text-sm font-bold disabled:opacity-40 active:scale-95 transition-transform"
              style={{ backgroundColor: accentColor, color: primaryColor }}
            >
              {waSending ? "Mengirim..." : "Kirim WA"}
            </button>
          </div>
          {waError && <p className="text-xs text-red-300 text-center">{waError}</p>}
          {waSent && <p className="text-xs text-green-300 text-center">✓ Link hasil foto terkirim ke WhatsApp!</p>}
        </div>
      )}

      {/* Email input */}
      {emailEnabled && (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          <div className="flex gap-2">
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => { setEmailAddress(e.target.value); setEmailError(null); setEmailSent(false); }}
              placeholder="Alamat email"
              className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold outline-none border"
              style={{ borderColor: surfaceBorder, background: surfaceBg, color: textPrimary }}
              disabled={emailSending}
            />
            <button
              onClick={handleSendEmail}
              disabled={emailSending || !emailAddress.trim()}
              className="px-4 py-3 rounded-2xl text-sm font-bold disabled:opacity-40 active:scale-95 transition-transform"
              style={{ backgroundColor: accentColor, color: primaryColor }}
            >
              {emailSending ? "Mengirim..." : "Kirim Email"}
            </button>
          </div>
          {emailError && <p className="text-xs text-red-300 text-center">{emailError}</p>}
          {emailSent && <p className="text-xs text-green-300 text-center">✓ Link hasil foto terkirim ke Email!</p>}
        </div>
      )}

      {/* Countdown + tombol */}
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <p className="text-sm" style={{ color: textTertiary }}>
          Layar reset otomatis dalam{" "}
          <span className="font-bold" style={{ color: accentColor }}>{seconds}</span>
          {" "}detik
        </p>

        <button
          onClick={onDone}
          style={{ backgroundColor: accentColor, color: primaryColor }}
          className="w-full py-5 rounded-3xl text-2xl font-black active:scale-95 transition-transform"
        >
          Selesai ✓
        </button>

        {/* Status cetak otomatis */}
        {printStatus !== "unavailable" && (
          <div
            className="w-full py-3 rounded-2xl text-sm font-semibold text-center"
            style={{
              color:           printStatus === "error"   ? "#fca5a5"
                             : printStatus === "done"    ? accentColor
                             : textSecondary,
              border:          `1px solid ${surfaceBorder}`,
              backgroundColor: surfaceBg,
            }}
          >
            {printStatusLabel()}
          </div>
        )}
      </div>
    </div>
  );
}
