"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateDownloadQR } from "@/lib/frameEngine";
import { getAdaptiveColors } from "../colorUtils";
import { detectPaperSize, getPaperSizeByName } from "../paperSize";
import type { BoothConfigData } from "../types";

declare global {
  interface Window {
    fremioBooth?: {
      getBridgeStatus?: () => Promise<unknown>;
      agentStatus: () => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      agentCapture: () => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
      agentPreview: () => Promise<{ ok: boolean; base64?: string; mimeType?: string; error?: string }>;
      agentPreviewStreamUrl?: (cacheKey?: string | number) => string;
      agentPrint: (job: unknown) => Promise<{ ok: boolean; payload?: unknown; error?: string }>;
    };
  }
}

interface DeliveryScreenProps {
  booth:        BoothConfigData;
  sessionId?:   string;
  downloadUrl:  string;
  photoUrl?:    string;   // URL foto final untuk dicetak (opsional)
  printImageDataUrl?: string; // data URL foto final lokal untuk silent print
  printerName?: string;   // printer dari BoothHardwareSettings
  /** Jumlah cetak yang dipilih customer — untuk auto-print otomatis */
  printCount?:  number;
  /** Canvas dimensions dari frame yang dipilih — untuk deteksi paper size */
  canvasWidth?:  number;
  canvasHeight?: number;
  /** Override ukuran kertas manual dari BoothSetupScreen (null = auto-detect) */
  paperSizeOverride?: string | null;
  /** Timer dari BoothClient (sumber yang sama dengan timer kanan atas) */
  timerSecondsLeft?: number | null;
  onDone:       () => void;
}

/**
 * DELIVERY SCREEN — Tampilkan QR code untuk download foto.
 * Auto-print sesuai jumlah yang dipilih customer (tanpa tombol cetak manual).
 * Countdown reset mengikuti timer Delivery dari BoothClient (sumber yang sama dengan timer kanan atas).
 */
export function DeliveryScreen({ booth, sessionId, downloadUrl, photoUrl, printImageDataUrl, printerName, printCount = 1, canvasWidth, canvasHeight, paperSizeOverride, timerSecondsLeft = null, onDone }: DeliveryScreenProps) {
  const { primaryColor, accentColor } = booth;
  const bgColor = (booth.welcomeScreenPrefs as Record<string, unknown> | null)?.deliveryBgColor as string | undefined ?? primaryColor;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(bgColor);
  const isTrialBooth = booth.showTrialWatermark === true;
  const [qrDataUrl, setQrDataUrl]   = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"pending" | "printing" | "airprint" | "done" | "error" | "unavailable">(
    booth.printEnabled && photoUrl ? "pending" : "unavailable"
  );

  // Delivery channels from booth prefs
  const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
  const channels = (prefs?.deliveryChannels as string[]) ?? ["DOWNLOAD", "WHATSAPP", "EMAIL"];
  const waEnabled = channels.includes("WHATSAPP");
  const emailEnabled = channels.includes("EMAIL");
  const waMode = (prefs?.deliveryWaMode as "API" | "SHARE") ?? "SHARE";
  const waMessageTemplate = (prefs?.deliveryWaMessage as string) ?? "Hai, terimakasih telah datang ke photobox kami. Hasil foto bisa kamu buka di link berikut [url]";

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

  const printImageSource = printImageDataUrl || photoUrl;

  const triggerSystemPrint = useCallback(async () => {
    if (!printImageSource) return;

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
    printImg.src = printImageSource;
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
    if (!printImg.complete || printImg.naturalWidth === 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Timeout memuat gambar untuk print")), 10000);
        printImg.onload = () => {
          window.clearTimeout(timer);
          resolve();
        };
        printImg.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error("Gagal memuat gambar untuk print"));
        };
      });
    }
    window.print();
  }, [paperSize.cssPageSize, printImageSource, reportSuccessfulPrint]);


  // ─── Auto-print on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!booth.printEnabled || !printImageSource || printTriggeredRef.current) return;
    printTriggeredRef.current = true;

    const doPrint = async () => {
      setPrintStatus("printing");

      // ── 1. Coba silent print via IPC Electron (booth-windows-app) ──
      if (window.fremioBooth?.agentPrint) {
        try {
          const ipcRes = await window.fremioBooth.agentPrint({
            image: printImageSource,
            printerName: printerName || undefined,
            copies: printCount,
            paperWidthMm: paperSize.widthMm,
            paperHeightMm: paperSize.heightMm,
          });
          if (ipcRes.ok) {
            setPrintStatus("done");
            void reportSuccessfulPrint();
            return;
          }
        } catch {
          // IPC print gagal → fallback
        }
      }

      // ── 2. Coba silent print via direct local agent (browser desktop) ──
      const fetchWithTimeout = (url: string, ms: number) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      };

      const agentCandidates = [
        "http://127.0.0.1:7432",
        "http://localhost:7432",
        "http://127.0.0.1:3002",
        "http://localhost:3002",
      ];

      for (const base of agentCandidates) {
        try {
          const statusRes = await fetchWithTimeout(`${base}/status`, 1200);
          if (!statusRes.ok) continue;
          const printRes = await fetch(`${base}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: photoUrl,
              image: printImageSource,
              printerName: printerName || undefined,
              copies: printCount,
              paperWidthMm: paperSize.widthMm,
              paperHeightMm: paperSize.heightMm,
            }),
          });
          if (printRes.ok) {
            setPrintStatus("done");
            void reportSuccessfulPrint();
            return;
          }
        } catch {
          // agent tidak tersedia di base ini, coba berikutnya
        }
      }

      // ── 3. Fallback: mobile/tablet masih perlu gesture ──
      if (isMobileOrTablet) {
        mobilePrintAwaitingGestureRef.current = true;
        setPrintStatus("airprint");
        return;
      }

      // ── 3. Desktop: jangan buka print dialog jika silent print gagal ──
      setPrintStatus("error");
    };

    doPrint().catch((err) => {
      console.error("[DeliveryScreen] Auto-print error:", err);
      setPrintStatus("error");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileOrTablet, paperSize.heightMm, paperSize.name, paperSize.widthMm, photoUrl, printCount, printerName, printImageSource, reportSuccessfulPrint, triggerSystemPrint]);

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
    void triggerSystemPrint();
  }, [isMobileOrTablet, photoUrl, triggerSystemPrint]);

  // Helper: normalize phone number (08xxx -> 628xxx)
  const normalizePhone = (phone: string): string => {
    let cleaned = phone.trim().replace(/\s/g, "").replace(/[-+]/g, "");
    // Convert 08xx to 628xx
    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.slice(1);
    }
    // Ensure starts with 62
    if (!cleaned.startsWith("62")) {
      cleaned = "62" + cleaned;
    }
    return cleaned;
  };

  const handleSendWhatsApp = useCallback(async () => {
    if (!waNumber.trim() || !downloadUrl) return;
    
    const normalizedPhone = normalizePhone(waNumber.trim());
    
    // Mode SHARE: open wa.me link
    if (waMode === "SHARE") {
      const message = waMessageTemplate.replace(/\[url\]/g, downloadUrl);
      const waUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank");
      setWaSent(true);
      setWaNumber("");
      return;
    }
    
    // Mode API: send via Fonnte
    setWaSending(true);
    setWaError(null);
    setWaSent(false);
    try {
      const res = await fetch("/api/delivery/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizedPhone,
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
  }, [waNumber, downloadUrl, booth.id, booth.boothName, waMode, waMessageTemplate]);

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
        {isTrialBooth && (
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

        <p className="text-[11px] text-center max-w-xs" style={{ color: textTertiary }}>
          {isTrialBooth
            ? "Scan QR lalu upgrade subscription di halaman link untuk mengaktifkan akses 24 jam."
            : "Link QR aktif 24 jam untuk akun PRO/ENTERPRISE."}
        </p>
      </div>

      {/* WhatsApp input */}
      {waEnabled && (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          <p className="text-[10px] text-center" style={{ color: textTertiary }}>
            Mode: {waMode === "SHARE" ? "Buka WhatsApp dengan pesan" : "Kirim otomatis via API"}
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              value={waNumber}
              onChange={(e) => { setWaNumber(e.target.value); setWaError(null); setWaSent(false); }}
              placeholder="08xx... (otomatis jadi 628xx)"
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
              {waMode === "SHARE" ? "Kirim ke WhatsApp" : waSending ? "Mengirim..." : "Kirim WA"}
            </button>
          </div>
          {waError && <p className="text-xs text-red-300 text-center">{waError}</p>}
          {waSent && (
            <p className="text-xs text-center" style={{ color: accentColor }}>
              {waMode === "SHARE" ? "✓ WhatsApp terbuka! Tinggal kirim foto hasil sesi." : "✓ Link hasil foto terkirim ke WhatsApp!"}
            </p>
          )}
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
        {typeof timerSecondsLeft === "number" && (
          <p className="text-sm" style={{ color: textTertiary }}>
            Layar reset otomatis dalam{" "}
            <span className="font-bold" style={{ color: accentColor }}>{timerSecondsLeft}</span>
            {" "}detik
          </p>
        )}

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
