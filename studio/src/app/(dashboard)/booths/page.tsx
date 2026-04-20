"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booth {
  id: string; boothName: string; slug: string; pricePerSession: number;
  printPricePerSheet: number;
  sessionDurationSeconds: number; printEnabled: boolean; isActive: boolean;
  primaryColor: string; accentColor: string;
  timerTutorialSeconds:    number;
  timerFrameSelectSeconds: number;
  timerPrintCountSeconds:  number;
  timerPaymentSeconds:     number;
  timerCameraSeconds:      number;
  timerPreviewSeconds:     number;
  timerDeliverySeconds:    number;
  _count?: { sessions: number };
}

interface Voucher {
  id:            string;
  code:          string;
  type:          "FREE" | "FIXED" | "PERCENT";
  discountValue: number;
  maxUses:       number | null;
  usedCount:     number;
  isActive:      boolean;
  createdAt:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIDR(n: number) { return "Rp " + n.toLocaleString("id-ID"); }

function isLightColor(hex: string): boolean {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  } catch { return true; }
}

// ─── Screen Preview ───────────────────────────────────────────────────────────

const SCREENS = [
  { id: "idle",       label: "Welcome"         },
  { id: "tutorial",   label: "Cara Pakai"       },
  { id: "paymethod",  label: "Metode Bayar"     },
  { id: "frame",      label: "Pilih Frame"      },
  { id: "printcount", label: "Jumlah Cetak"     },
  { id: "payment",    label: "Pembayaran QRIS"  },
  { id: "camera",     label: "Kamera"           },
  { id: "preview",    label: "Preview & Filter" },
  { id: "delivery",   label: "Hasil & QR"       },
] as const;

// Iframe scaled down to fit the card container.
// Booth fills the full viewport — typically landscape 16:9.
const IFRAME_W = 1280;  // native booth width (px)
const IFRAME_H = 720;   // native booth height (px)

function BoothScreenPreview({ slug, screenId }: { slug: string; screenId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setScale(el.clientWidth / IFRAME_W);
    });
    observer.observe(el);
    setScale(el.clientWidth / IFRAME_W);
    return () => observer.disconnect();
  }, []);

  const src = `https://studio.fremio.id/b/${slug}?preview=${screenId}`;

  return (
    <div
      ref={containerRef}
      style={{
        width:         "100%",
        aspectRatio:   `${IFRAME_W}/${IFRAME_H}`,
        overflow:      "hidden",
        borderRadius:  14,
        position:      "relative",
        boxShadow:     "0 2px 12px rgba(0,0,0,0.10)",
      }}
    >
      <iframe
        src={src}
        title={screenId}
        scrolling="no"
        allow="camera; microphone"
        style={{
          width:           IFRAME_W,
          height:          IFRAME_H,
          border:          "none",
          transform:       `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents:   "none",
          display:         "block",
        }}
      />
    </div>
  );
}

// ─── Tool Card ────────────────────────────────────────────────────────────────

function ToolCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  );
}

// ─── Voucher Card ─────────────────────────────────────────────────────────────

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  FREE:    "Gratis 100%",
  FIXED:   "Potongan Harga",
  PERCENT: "Diskon %",
};

function VoucherCard({ boothId, pricePerSession }: { boothId: string; pricePerSession: number }) {
  const { data, mutate } = useSWR<{ success: boolean; data: Voucher[] }>(
    `/api/dashboard/vouchers?boothConfigId=${boothId}`
  );
  const vouchers = data?.data ?? [];

  const [code,          setCode]          = useState("");
  const [type,          setType]          = useState<"FREE" | "FIXED" | "PERCENT">("FIXED");
  const [typeOpen,      setTypeOpen]      = useState(false);
  const [value,         setValue]         = useState("");
  const [maxUses,       setMaxUses]       = useState("");
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState("");
  const typeDropRef = useRef<HTMLDivElement>(null);

  // Close type dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (typeDropRef.current && !typeDropRef.current.contains(e.target as Node)) setTypeOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  async function handleCreate() {
    const codeUp = code.trim().toUpperCase();
    if (!codeUp) return setErr("Kode tidak boleh kosong");
    if (type !== "FREE" && !value) return setErr("Isi nilai diskon");
    setSaving(true); setErr("");
    const res = await fetch("/api/dashboard/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boothConfigId: boothId,
        code:          codeUp,
        type,
        discountValue: type === "FREE" ? 0 : Number(value),
        maxUses:       maxUses ? Number(maxUses) : null,
      }),
    });
    const json = await res.json();
    if (!json.success) { setErr(json.error ?? "Gagal"); } else {
      setCode(""); setValue(""); setMaxUses(""); setType("FIXED");
      mutate();
    }
    setSaving(false);
  }

  async function handleToggle(v: Voucher) {
    await fetch(`/api/dashboard/vouchers/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus voucher ini?")) return;
    await fetch(`/api/dashboard/vouchers/${id}`, { method: "DELETE" });
    mutate();
  }

  function describeVoucher(v: Voucher) {
    if (v.type === "FREE")    return "Gratis 100%";
    if (v.type === "PERCENT") return `Diskon ${v.discountValue}%`;
    return `Potongan Rp ${v.discountValue.toLocaleString("id-ID")}`;
  }

  return (
    <ToolCard title="Voucher">
      {/* Form tambah voucher */}
      <div className="space-y-3 mb-4">
        {/* Baris 1 — Kode voucher, full width, centered */}
        <input
          type="text"
          placeholder="KODE VOUCHER"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }}
          maxLength={50}
          className={`${inputCls} w-full text-center font-mono uppercase tracking-widest !text-base !py-3 !px-4`}
        />

        {/* Baris 2 — Jenis | Besar potongan | Maks pakai */}
        <div className="flex gap-2 items-center">
          {/* Custom jenis dropdown — fremio style */}
          <div ref={typeDropRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setTypeOpen((o) => !o)}
              className="flex items-center gap-1.5 h-full px-3 py-3 rounded-xl border border-primary-300 bg-primary-50 text-primary-800 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-primary-100 active:bg-primary-200"
            >
              {type === "FREE" ? "🎁 Gratis" : type === "FIXED" ? "✂️ Pot. Rp" : "🏷️ Diskon %"}
              <svg className={`w-3 h-3 transition-transform ${typeOpen ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {typeOpen && (
              <div className="absolute z-20 top-full mt-1 left-0 bg-white rounded-xl border border-primary-200 shadow-lg overflow-hidden min-w-[140px]">
                {([
                  { val: "FREE",    label: "🎁 Gratis 100%"   },
                  { val: "FIXED",   label: "✂️ Potongan Rp"   },
                  { val: "PERCENT", label: "🏷️ Diskon %"      },
                ] as const).map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setType(val); setErr(""); setValue(""); setTypeOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary-50
                      ${type === val ? "bg-primary-100 text-primary-900 font-semibold" : "text-gray-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {type === "FIXED"   && <span className="text-sm font-semibold text-gray-500 shrink-0">Rp</span>}
            <input
              type="number"
              min={1}
              max={type === "PERCENT" ? 100 : undefined}
              placeholder={
                type === "FREE"      ? "—"
                : type === "PERCENT" ? "Besar diskon (%)"
                : "Besar potongan (Rp)"
              }
              disabled={type === "FREE"}
              value={value}
              onChange={(e) => { setValue(e.target.value); setErr(""); }}
              className={`${inputCls} !text-sm !py-3 !px-3 w-full disabled:bg-gray-50 disabled:text-gray-300`}
            />
            {type === "PERCENT" && <span className="text-sm font-semibold text-gray-500 shrink-0">%</span>}
          </div>

          <input
            type="number"
            min={1}
            placeholder="Maksimal penggunaan"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className={`${inputCls} !text-xs !py-3 !px-3 !w-52 shrink-0`}
            title="Batas pemakaian. Kosongkan = tak terbatas"
          />
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <button
          onClick={handleCreate}
          disabled={saving || !code.trim()}
          className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "+ Buat Voucher"}
        </button>
      </div>

      {/* Daftar voucher */}
      {vouchers.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Belum ada voucher</p>
      ) : (
        <ul className="space-y-2">
          {vouchers.map((v) => (
            <li key={v.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${v.isActive ? "border-gray-100 bg-gray-50" : "border-gray-100 bg-gray-100 opacity-60"}`}>
              <span className="font-mono text-xs font-bold text-gray-800 tracking-wider flex-shrink-0">{v.code}</span>
              <span className="flex-1 text-xs text-gray-500 truncate">{describeVoucher(v)}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {v.usedCount}{v.maxUses ? `/${v.maxUses}` : ""}×
              </span>
              <button
                onClick={() => handleToggle(v)}
                className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-semibold transition-colors ${v.isActive ? "bg-green-50 text-green-700" : "bg-gray-200 text-gray-500"}`}
                title={v.isActive ? "Nonaktifkan" : "Aktifkan"}
              >{v.isActive ? "Aktif" : "Nonaktif"}</button>
              <button
                onClick={() => handleDelete(v.id)}
                className="shrink-0 text-red-400 hover:text-red-600 text-sm"
                title="Hapus voucher"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}



const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300";

export default function BoothsPage() {
  const { data, isLoading, mutate } = useSWR<{ success: boolean; data: Booth[] }>("/api/dashboard/booths");
  const booths = data?.data ?? [];

  // Auto-create: one attempt per mount
  const createAttempted = useRef(false);
  useEffect(() => {
    if (!isLoading && !createAttempted.current && data && booths.length === 0) {
      createAttempted.current = true;
      const suffix = Math.random().toString(36).slice(2, 6);
      fetch("/api/dashboard/booths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boothName: "Booth Saya",
          slug: `booth-${suffix}`,
          pricePerSession: 25000,
          printPricePerSheet: 10000,
          sessionDurationSeconds: 300,
          printEnabled: false,
          primaryColor: "#ffffff",
          accentColor: "#deb7a9",
        }),
      }).then(() => mutate());
    }
  }, [isLoading, data, booths.length, mutate]);

  const booth = booths[0] ?? null;

  // Carousel state


  // Local color state for live preview
  const [localPrimary, setLocalPrimary] = useState(booth?.primaryColor ?? "#ffffff");
  const [localAccent,  setLocalAccent]  = useState(booth?.accentColor  ?? "#deb7a9");
  useEffect(() => {
    if (booth) { setLocalPrimary(booth.primaryColor); setLocalAccent(booth.accentColor); }
  }, [booth?.primaryColor, booth?.accentColor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inline edit states
  const [editName,       setEditName]       = useState<string | null>(null);
  const [editPrice,      setEditPrice]      = useState<string | null>(null);
  const [editPrintPrice, setEditPrintPrice] = useState<string | null>(null);
  const [editDuration,   setEditDuration]   = useState<string | null>(null);
  const [editTimerKey,   setEditTimerKey]   = useState<string | null>(null); // which timer is being edited
  const [editTimerVal,   setEditTimerVal]   = useState<string>("");
  const [saving,         setSaving]         = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);

  const saveBooth = async (key: string, patch: Partial<Booth>) => {
    if (!booth) return;
    setSaving(key);
    await fetch(`/api/dashboard/booths/${booth.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
    await mutate();
    setSaving(null);
  };

  const handleCopy = async () => {
    if (!booth) return;
    const url = `https://studio.fremio.id/b/${booth.slug}`;
    try { await navigator.clipboard.writeText(url); } catch {
      const el = document.createElement("textarea");
      el.value = url; document.body.appendChild(el);
      el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading || !data || (data && booths.length === 0 && !createAttempted.current) || !booth) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="h-7 w-44 bg-gray-100 rounded-xl animate-pulse" />
        <div className="bg-white rounded-2xl border border-gray-100 h-72 animate-pulse" />
        <div className="h-12 bg-gray-100 rounded-xl animate-pulse w-48 mx-auto" />
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const boothUrl        = `https://studio.fremio.id/b/${booth.slug}`;
  const accentIsLight   = isLightColor(booth.accentColor);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {editName !== null ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editName.trim()) { saveBooth("name", { boothName: editName.trim() }); setEditName(null); }
                  if (e.key === "Escape") setEditName(null);
                }}
                className="text-2xl font-bold text-gray-900 border-b-2 border-primary-300 outline-none bg-transparent w-full"
              />
              <button
                onClick={() => { if (editName.trim()) saveBooth("name", { boothName: editName.trim() }); setEditName(null); }}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-primary-900 text-white font-semibold"
              >Simpan</button>
              <button onClick={() => setEditName(null)} className="shrink-0 text-xs px-2 py-1.5 rounded-lg border text-gray-500">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{booth.boothName}</h1>
              <button onClick={() => setEditName(booth.boothName)} className="text-gray-400 hover:text-gray-600 text-base" title="Ubah nama booth">✏️</button>
            </div>
          )}
          <p className="text-gray-400 text-sm mt-1">studio.fremio.id/b/{booth.slug}</p>
        </div>
        <span className={`shrink-0 mt-1 px-3 py-1 rounded-full text-xs font-bold ${booth.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {booth.isActive ? "Aktif" : "Nonaktif"}
        </span>
      </div>

      {/* ── Preview Strip ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Preview Tampilan Booth</h2>
        <div
          className="flex flex-row gap-3 overflow-x-auto pb-2"
          style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
        >
          {SCREENS.map((screen) => (
            <div
              key={screen.id}
              className="flex flex-col items-center gap-2 flex-shrink-0"
              style={{ width: 220, scrollSnapAlign: "start" }}
            >
              <BoothScreenPreview slug={booth.slug} screenId={screen.id} />
              <span className="text-xs text-gray-500 font-medium text-center leading-tight">{screen.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sesuaikan Desain ─────────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <a
          href={`/editor/booth/${booth.id}`}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: booth.accentColor, color: accentIsLight ? "#111827" : "#ffffff" }}
        >
          🎨 Sesuaikan Desain
        </a>
      </div>

      {/* ── Tools Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Link Booth */}
        <ToolCard title="Link Booth">
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 mb-2.5">
            <span className="flex-1 text-xs text-gray-500 truncate">{boothUrl}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{ background: copied ? "#dcfce7" : "#f3f4f6", color: copied ? "#16a34a" : "#374151" }}
            >{copied ? "✓ Disalin" : "Salin Link"}</button>
            <a
              href={boothUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-center bg-primary-900 text-white hover:bg-primary-800 transition-colors"
            >Buka Booth ↗</a>
          </div>
        </ToolCard>

        {/* Status */}
        <ToolCard title="Status Booth">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">{booth.isActive ? "Booth Aktif" : "Booth Nonaktif"}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {booth.isActive ? "Dapat menerima sesi baru" : "Tidak menerima sesi baru"}
              </p>
            </div>
            <button
              onClick={() => saveBooth("isActive", { isActive: !booth.isActive })}
              disabled={saving === "isActive"}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${booth.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}
            >{booth.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
          </div>
          <p className="text-xs text-gray-400 mt-3">{booth._count?.sessions ?? 0} sesi selesai</p>
        </ToolCard>

        {/* Harga Photobox (base price) */}
        <ToolCard title="Harga Photobox + 1 Print">
          {editPrice !== null ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 shrink-0">Rp</span>
                <input autoFocus type="number" min={1000} step={1000} value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)} className={inputCls} />
              </div>
              <p className="text-xs text-gray-400">Harga dasar sesi termasuk 1 lembar cetak.</p>
              <div className="flex gap-2">
                <button onClick={() => { saveBooth("price", { pricePerSession: Number(editPrice) }); setEditPrice(null); }}
                  className="flex-1 py-2 rounded-xl bg-primary-900 text-white text-xs font-bold">Simpan</button>
                <button onClick={() => setEditPrice(null)}
                  className="flex-1 py-2 rounded-xl border text-gray-500 text-xs">Batal</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900">{fmtIDR(booth.pricePerSession)}</p>
                <p className="text-xs text-gray-400">termasuk 1 lembar cetak</p>
              </div>
              <button onClick={() => setEditPrice(String(booth.pricePerSession))}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50">Ubah</button>
            </div>
          )}
        </ToolCard>

        {/* Harga Print Tambahan */}
        <ToolCard title="Harga Print Tambahan / Lembar">
          {editPrintPrice !== null ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 shrink-0">Rp</span>
                <input autoFocus type="number" min={0} step={1000} value={editPrintPrice}
                  onChange={(e) => setEditPrintPrice(e.target.value)} className={inputCls} />
              </div>
              <p className="text-xs text-gray-400">Dikenakan untuk lembar ke-2 dan seterusnya. Set 0 jika tidak ada biaya tambahan.</p>
              <div className="flex gap-2">
                <button onClick={() => { saveBooth("printPricePerSheet", { printPricePerSheet: Number(editPrintPrice) }); setEditPrintPrice(null); }}
                  className="flex-1 py-2 rounded-xl bg-primary-900 text-white text-xs font-bold">Simpan</button>
                <button onClick={() => setEditPrintPrice(null)}
                  className="flex-1 py-2 rounded-xl border text-gray-500 text-xs">Batal</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900">{fmtIDR(booth.printPricePerSheet)}</p>
                <p className="text-xs text-gray-400">per lembar tambahan (lembar ke-2 dst)</p>
              </div>
              <button onClick={() => setEditPrintPrice(String(booth.printPricePerSheet))}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50">Ubah</button>
            </div>
          )}
        </ToolCard>

        {/* Timer Per Tahap */}
        <ToolCard title="Timer Per Tahap">
          {(() => {
            const TIMER_STAGES: { key: keyof Booth; label: string }[] = [
              { key: "timerTutorialSeconds",    label: "Tutorial + Metode Bayar" },
              { key: "timerFrameSelectSeconds", label: "Pilih Frame" },
              { key: "timerPrintCountSeconds",  label: "Jumlah Cetak" },
              { key: "timerPaymentSeconds",     label: "Pembayaran" },
              { key: "timerCameraSeconds",      label: "Sesi Foto" },
              { key: "timerPreviewSeconds",     label: "Preview & Filter" },
              { key: "timerDeliverySeconds",    label: "QR & Pengiriman" },
            ];
            return (
              <div className="space-y-2">
                {TIMER_STAGES.map(({ key, label }) => {
                  const rawSecs = (booth[key] as number) ?? 0;
                  const isEditing = editTimerKey === key;
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-600 flex-1">{label}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            type="number" min={0} max={60} step={0.5}
                            value={editTimerVal}
                            onChange={(e) => setEditTimerVal(e.target.value)}
                            className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300 text-right"
                          />
                          <span className="text-xs text-gray-400 shrink-0">mnt</span>
                          <button
                            onClick={() => {
                              const secs = Math.round(parseFloat(editTimerVal) * 60);
                              saveBooth(key, { [key]: secs } as Partial<Booth>);
                              setEditTimerKey(null);
                            }}
                            className="px-2 py-1 rounded-lg bg-primary-900 text-white text-[10px] font-bold"
                          >✓</button>
                          <button onClick={() => setEditTimerKey(null)}
                            className="px-2 py-1 rounded-lg border text-gray-400 text-[10px]">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-800 tabular-nums">
                            {rawSecs === 0 ? <span className="text-gray-300">—</span> : `${rawSecs >= 60 ? Math.floor(rawSecs / 60) + " mnt" : ""}${rawSecs % 60 !== 0 ? (rawSecs >= 60 ? " " : "") + (rawSecs % 60) + " dtk" : ""}`}
                          </span>
                          <button
                            onClick={() => {
                              setEditTimerKey(key);
                              setEditTimerVal(rawSecs === 0 ? "" : String(rawSecs / 60));
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                          >Ubah</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[10px] text-gray-400 pt-1">Isi 0 untuk menonaktifkan timer pada tahap tersebut.</p>
              </div>
            );
          })()}
        </ToolCard>

        {/* Warna Booth */}
        <ToolCard title="Warna Booth">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input type="color" value={localPrimary}
                onChange={(e) => setLocalPrimary(e.target.value)}
                onBlur={(e) => saveBooth("primaryColor", { primaryColor: e.target.value })}
                className="h-9 w-9 rounded-lg cursor-pointer border border-gray-200" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Warna Utama</p>
                <p className="text-xs text-gray-400">{localPrimary}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="color" value={localAccent}
                onChange={(e) => setLocalAccent(e.target.value)}
                onBlur={(e) => saveBooth("accentColor", { accentColor: e.target.value })}
                className="h-9 w-9 rounded-lg cursor-pointer border border-gray-200" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Warna Aksen</p>
                <p className="text-xs text-gray-400">{localAccent}</p>
              </div>
            </div>
          </div>
        </ToolCard>

        {/* Cetak Foto */}
        <ToolCard title="Cetak Foto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">{booth.printEnabled ? "Cetak Aktif" : "Cetak Nonaktif"}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {booth.printEnabled ? "Opsi cetak tersedia untuk pengunjung" : "Tanpa cetak fisik"}
              </p>
            </div>
            <button
              onClick={() => saveBooth("print", { printEnabled: !booth.printEnabled })}
              disabled={saving === "print"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${booth.printEnabled ? "bg-green-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${booth.printEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </ToolCard>

        {/* Voucher */}
        <div className="sm:col-span-2">
          <VoucherCard boothId={booth.id} pricePerSession={booth.pricePerSession} />
        </div>

      </div>
    </div>
  );
}

