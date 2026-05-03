"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

const PRICE_PER_CREDIT = 300_000;

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function PricingPage() {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const total = quantity * PRICE_PER_CREDIT;

  const handlePay = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payment/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal membuat pembayaran");
      }

      // Midtrans Snap popup
      if (typeof window !== "undefined" && (window as any).snap) {
        (window as any).snap.pay(data.data.snapToken, {
          onSuccess: () => { window.location.href = "/dashboard?payment=success"; },
          onPending: () => { window.location.href = "/dashboard?payment=pending"; },
          onError:   () => { setError("Pembayaran gagal. Coba lagi."); setLoading(false); },
          onClose:   () => { setLoading(false); },
        });
      } else {
        setError("Midtrans Snap belum siap. Refresh halaman.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [quantity]);

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Midtrans Snap script */}
      <script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? ""}
      />

      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8 md:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-black/70 hover:text-black">
            ← Kembali
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            Login
          </Link>
        </header>

        <section className="mt-10">
          <p className="inline-flex rounded-full border border-black/20 bg-[#DEB6A9]/40 px-4 py-1 text-xs font-bold uppercase tracking-[0.14em] text-black/80">
            Pricing
          </p>
          <h1 className="mt-4 text-3xl font-black md:text-4xl">Paket Fremio Studio</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-black/70 md:text-base">
            Beli kredit untuk mengaktifkan booth tanpa watermark trial. 1 kredit = 1 booth.
          </p>
        </section>

        <section className="mt-8">
          <article className="max-w-md rounded-3xl border border-black/10 bg-[#DEB6A9] p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/70">Kredit Booth</p>
            <p className="mt-2 text-4xl font-black">{formatRupiah(PRICE_PER_CREDIT)}</p>
            <p className="mt-1 text-sm font-semibold text-black/70">per 1 kredit = 1 booth tanpa watermark</p>

            <ul className="mt-5 space-y-2 text-sm text-black/80">
              <li>• 1 booth aktif tanpa watermark</li>
              <li>• Semua frame dari fremio.id</li>
              <li>• Akses fitur PIN booth</li>
              <li>• Dashboard booth & frame</li>
            </ul>

            {/* Counter jumlah kredit */}
            <div className="mt-6 flex items-center gap-4">
              <p className="text-sm font-bold text-black/70">Jumlah Booth:</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || loading}
                  className="h-9 w-9 rounded-full bg-black text-white text-lg font-bold hover:opacity-80 disabled:opacity-40 transition"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center text-lg font-black">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  disabled={loading}
                  className="h-9 w-9 rounded-full bg-black text-white text-lg font-bold hover:opacity-80 disabled:opacity-40 transition"
                >
                  +
                </button>
              </div>
            </div>

            {/* Harga total */}
            <div className="mt-4 rounded-2xl bg-white/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-black/70">{quantity} kredit × {formatRupiah(PRICE_PER_CREDIT)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-black/70">Total</span>
                <span className="text-2xl font-black">{formatRupiah(total)}</span>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-600 font-medium">{error}</p>}

            <button
              onClick={handlePay}
              disabled={loading}
              className="mt-5 w-full inline-flex justify-center rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Memuat..." : `Bayar ${formatRupiah(total)}`}
            </button>
          </article>
        </section>
      </div>
    </main>
  );
}
