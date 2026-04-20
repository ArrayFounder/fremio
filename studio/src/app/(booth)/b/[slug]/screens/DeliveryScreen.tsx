"use client";

import { useEffect, useRef, useState } from "react";
import { generateDownloadQR } from "@/lib/frameEngine";
import { getAdaptiveColors } from "../colorUtils";
import { detectPaperSize } from "../paperSize";
import type { BoothConfigData } from "../types";

interface DeliveryScreenProps {
  booth:        BoothConfigData;
  downloadUrl:  string;
  photoUrl?:    string;   // URL foto final untuk dicetak (opsional)
  printerName?: string;   // printer dari BoothHardwareSettings
  /** Jumlah cetak yang dipilih customer — untuk auto-print otomatis */
  printCount?:  number;
  /** Canvas dimensions dari frame yang dipilih — untuk deteksi paper size */
  canvasWidth?:  number;
  canvasHeight?: number;
  onDone:       () => void;
}

const AUTO_RESET_SECONDS = 120;

/**
 * Chrome allows mixed-content requests to http://localhost from HTTPS pages,
 * so we always try reaching the local agent regardless of protocol/hostname.
 */
function canUseLocalAgent(): boolean {
  return typeof window !== "undefined";
}

/**
 * DELIVERY SCREEN — Tampilkan QR code untuk download foto.
 * Auto-print sesuai jumlah yang dipilih customer (tanpa tombol cetak manual).
 * Auto-reset ke IDLE setelah AUTO_RESET_SECONDS detik tanpa interaksi.
 */
export function DeliveryScreen({ booth, downloadUrl, photoUrl, printerName, printCount = 1, canvasWidth, canvasHeight, onDone }: DeliveryScreenProps) {
  const { primaryColor, accentColor } = booth;
  const { textPrimary, textSecondary, textTertiary, surfaceBg, surfaceBorder } = getAdaptiveColors(primaryColor);
  const [seconds, setSeconds]       = useState(AUTO_RESET_SECONDS);
  const [qrDataUrl, setQrDataUrl]   = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"pending" | "printing" | "airprint" | "done" | "error" | "unavailable">(
    booth.printEnabled && photoUrl ? "pending" : "unavailable"
  );

  // Deteksi paper size dari frame dimensions
  const paperSize = detectPaperSize(canvasWidth ?? 1080, canvasHeight ?? 1920);
  const [email, setEmail]           = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus]   = useState<"idle" | "sent" | "error">("idle");

  const printTriggeredRef = useRef(false);

  // ─── Send email handler ───────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (!email || emailSending || emailStatus === "sent") return;
    setEmailSending(true);
    const fullEmail = `${email.trim()}@gmail.com`;
    try {
      const res = await fetch("/api/delivery/send-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: fullEmail, downloadUrl, boothName: booth.boothName }),
      });
      const body = await res.json() as { success: boolean };
      setEmailStatus(body.success ? "sent" : "error");
    } catch {
      setEmailStatus("error");
    } finally {
      setEmailSending(false);
    }
  };

  // ─── Auto-print on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!booth.printEnabled || !photoUrl || printTriggeredRef.current) return;
    printTriggeredRef.current = true;

    // Detect iOS/iPadOS/Android — skip local agent, go straight to print dialog
    const isIOS = typeof navigator !== "undefined" &&
      (/ipad|iphone|ipod/i.test(navigator.userAgent) ||
       /android/i.test(navigator.userAgent) ||
       (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    const triggerAirPrint = () => {
      setPrintStatus("airprint");

      // Preload image before opening dialog
      const img = new window.Image();
      img.onload = () => {
        // Inject print-only stylesheet — hides everything except the photo
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
        printDiv.innerHTML = `<img src="${photoUrl}" />`;
        document.body.appendChild(printDiv);

        const cleanup = () => {
          styleEl.remove();
          printDiv.remove();
          window.removeEventListener("afterprint", cleanup);
          setPrintStatus("done");
        };
        window.addEventListener("afterprint", cleanup);

        window.print();
      };
      img.onerror = () => {
        // Print anyway even if preload fails
        window.print();
        setPrintStatus("done");
      };
      img.src = photoUrl;
    };

    const doPrint = async () => {
      setPrintStatus("printing");

      // iOS/iPad → langsung AirPrint, skip local agent
      if (isIOS) { triggerAirPrint(); return; }

      // Desktop: coba local agent dulu (silent print)
      if (canUseLocalAgent()) {
        const printBody = JSON.stringify({
          imageUrl:    photoUrl,
          printerName: printerName ?? null,
          copies:      printCount,
          paperSize:   paperSize.name,
          paperWidthMm:  paperSize.widthMm,
          paperHeightMm: paperSize.heightMm,
        });
        try {
          let res: Response;
          try {
            res = await fetch("https://127.0.0.1:3002/print", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    printBody,
              signal:  AbortSignal.timeout(5000),
            });
          } catch {
            res = await fetch("http://127.0.0.1:3002/print", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    printBody,
              signal:  AbortSignal.timeout(5000),
            });
          }
          if (res.ok) { setPrintStatus("done"); return; }
          else        { console.warn("[DeliveryScreen] Agent print failed:", await res.text()); }
        } catch {
          // agent tidak aktif, fallback ke AirPrint
        }
      }

      // Fallback desktop: AirPrint / window.print()
      triggerAirPrint();
    };

    doPrint().catch((err) => {
      console.error("[DeliveryScreen] Auto-print error:", err);
      setPrintStatus("error");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrl]);

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
    if (printStatus === "printing") return `🖨️ Menyiapkan cetak (${paperSize.name})…`;
    if (printStatus === "airprint") return `📲 Pilih printer AirPrint → tap Print`;
    if (printStatus === "done")     return `✅ Cetak ${printCount} lembar (${paperSize.name}) selesai`;
    if (printStatus === "error")    return "⚠️ Gagal mencetak";
    return null;
  };

  return (
    <div
      className="flex flex-col h-full items-center justify-between py-10 px-6 select-none"
      style={{ backgroundColor: primaryColor }}
    >
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold" style={{ color: textPrimary }}>Foto Siap Diunduh</h2>
        <p className="text-sm mt-1" style={{ color: textSecondary }}>Scan QR di bawah dengan kameramu</p>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-4">
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
      </div>

      {/* Email section */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        <p className="text-sm text-center font-medium" style={{ color: textSecondary }}>
          Kirim link ke email kamu
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={email}
            onChange={(e) => { setEmail(e.target.value.replace(/@.*/, "")); setEmailStatus("idle"); }}
            placeholder="namakamu"
            disabled={emailStatus === "sent"}
            className="flex-1 rounded-xl px-4 py-3 text-sm outline-none min-w-0"
            style={{
              backgroundColor: surfaceBg,
              border: `1px solid ${emailStatus === "error" ? "#ef4444" : surfaceBorder}`,
              color: textPrimary,
            }}
          />
          <span
            className="text-sm font-semibold select-none whitespace-nowrap"
            style={{ color: "#111827" }}
          >
            @gmail.com
          </span>
          <button
            onClick={handleSendEmail}
            disabled={!email.trim() || emailSending || emailStatus === "sent"}
            className="px-4 py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-50 active:scale-95"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            {emailSending ? "⌛" : emailStatus === "sent" ? "✓" : "Kirim"}
          </button>
        </div>
        {emailStatus === "sent" && (
          <p className="text-xs text-center" style={{ color: accentColor }}>✓ Link berhasil dikirim ke {email.trim()}@gmail.com</p>
        )}
        {emailStatus === "error" && (
          <p className="text-xs text-center" style={{ color: "#ef4444" }}>Gagal kirim. Coba lagi.</p>
        )}
      </div>

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

        {/* Refresh countdown on tap */}
        <button
          onClick={() => setSeconds(AUTO_RESET_SECONDS)}
          className="text-sm underline underline-offset-4 active:opacity-60"
          style={{ color: textTertiary }}
        >
          Reset timer
        </button>
      </div>
    </div>
  );
}
