"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import useSWR, { mutate as globalMutate } from "swr";
import { normalizeImportedSlots, type NormalizedSlot } from "@/lib/fremioSlots";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booth {
  id: string; boothName: string; slug: string; pricePerSession: number;
  printPricePerSheet: number;
  sessionDurationSeconds: number; printEnabled: boolean; isActive: boolean;
  primaryColor: string; accentColor: string;
  welcomeScreenPrefs?: Record<string, unknown> | null;
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
  { id: "idle",       label: "Layar Sambut"   },
  { id: "tutorial",   label: "Tutorial"        },
  { id: "paymethod",  label: "Metode Bayar"    },
  { id: "frame",      label: "Pilih Frame"     },
  { id: "printcount", label: "Jumlah Print"    },
  { id: "payment",    label: "Pembayaran QRIS" },
  { id: "preview",    label: "Hasil & Filter"  },
  { id: "delivery",   label: "Hasil Akhir"     },
] as const;

// Iframe scaled down to fit the card container.
// Booth fills the full viewport — typically landscape 16:9.
const IFRAME_W = 1280;  // native booth width (px)
const IFRAME_H = 720;   // native booth height (px)

function BoothScreenPreview({ slug, screenId }: { slug: string; screenId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const screenLabel = SCREENS.find((s) => s.id === screenId)?.label ?? screenId;
  const needsCameraBlackout = screenId === "preview";

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
        border:        "1px solid #eaded8",
        background:    "#111",
      }}
    >
      <iframe
        src={src}
        title={screenId}
        scrolling="no"
        allow="camera 'none'; microphone 'none'"
        style={{
          width:           IFRAME_W,
          height:          IFRAME_H,
          border:          "none",
          transform:       `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents:   "none",
          display:         "block",
          background:      "#111",
        }}
      />

      {needsCameraBlackout && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 16,
            color: "#d1d5db",
          }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">Kamera Dimatikan Di Dashboard</p>
            <p className="mt-1 text-sm font-semibold">{screenLabel}</p>
            <p className="mt-1 text-xs opacity-80">Layar stream dibuat hitam agar kamera tidak aktif di halaman Booths.</p>
          </div>
        </div>
      )}
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

// ─── Promo Banner Card ────────────────────────────────────────────────────────

interface PromoBanner { imageUrl: string; }

function secsToMmSs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function mmSsToSecs(str: string): number {
  const [m, s] = str.split(":").map(Number);
  return (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
}

function PromoBannerCard({ boothId }: { boothId: string }) {
  const { data, mutate } = useSWR<{ success: boolean; data: { promoBanners: PromoBanner[]; promoDelaySeconds: number; promoSlideSeconds: number } }>(
    `/api/dashboard/booths/${boothId}/promo-banners`
  );

  const banners      = data?.data?.promoBanners ?? [];
  const [uploading,  setUploading]  = useState(false);
  const [delay,      setDelay]      = useState("");
  const [slide,      setSlide]      = useState("");
  const [savingTime, setSavingTime] = useState(false);
  const [saveErr,    setSaveErr]    = useState("");
  const [saveOk,     setSaveOk]     = useState(false);
  const initialized = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync from server ONCE on first load only — don't overwrite user edits on re-fetch
  useEffect(() => {
    if (data?.data && !initialized.current) {
      initialized.current = true;
      setDelay(secsToMmSs(data.data.promoDelaySeconds ?? 60));
      setSlide(secsToMmSs(data.data.promoSlideSeconds ?? 10));
    }
  }, [data]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("image", file);
      await fetch(`/api/dashboard/booths/${boothId}/promo-banners`, { method: "POST", body: fd });
    }
    setUploading(false);
    mutate();
  }

  async function handleDelete(imageUrl: string) {
    if (!confirm("Hapus banner ini?")) return;
    await fetch(`/api/dashboard/booths/${boothId}/promo-banners`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    mutate();
  }

  async function handleSaveTimers() {
    setSavingTime(true); setSaveErr(""); setSaveOk(false);
    try {
      const res = await fetch(`/api/dashboard/booths/${boothId}/promo-banners`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoDelaySeconds: mmSsToSecs(delay), promoSlideSeconds: mmSsToSecs(slide) }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Gagal menyimpan");
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      // reset initialized so inputs sync to confirmed server values on next fetch
      initialized.current = false;
      mutate();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Gagal menyimpan");
    }
    setSavingTime(false);
  }

  return (
    <ToolCard title="Banner Promosi">
      <p className="text-xs text-gray-400 mb-3">
        Banner PNG/JPG yang muncul otomatis saat layar idle tidak diklik.
      </p>

      {/* Timer settings */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] text-gray-400 block mb-0.5">Muncul setelah (mm:ss)</label>
          <input
            type="text" pattern="\d{2}:\d{2}" placeholder="01:00"
            value={delay} onChange={(e) => setDelay(e.target.value)}
            className={`${inputCls} !text-xs !py-2 font-mono`}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 block mb-0.5">Ganti banner setiap (mm:ss)</label>
          <input
            type="text" pattern="\d{2}:\d{2}" placeholder="00:10"
            value={slide} onChange={(e) => setSlide(e.target.value)}
            className={`${inputCls} !text-xs !py-2 font-mono`}
          />
        </div>
      </div>
      <button
        onClick={handleSaveTimers} disabled={savingTime}
        className="w-full py-1.5 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-50 mb-1"
      >
        {savingTime ? "Menyimpan…" : saveOk ? "✓ Tersimpan" : "Simpan Timer"}
      </button>
      {saveErr && <p className="text-xs text-red-500 mb-3">{saveErr}</p>}
      {!saveErr && <div className="mb-3" />}

      {/* Upload */}
      <input
        ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg"
        multiple className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
      <button
        onClick={() => fileInputRef.current?.click()} disabled={uploading}
        className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 transition-colors disabled:opacity-50 mb-3"
      >
        {uploading ? "Mengupload…" : "+ Upload Banner (PNG/JPG)"}
      </button>

      {/* Banner list */}
      {banners.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Belum ada banner</p>
      ) : (
        <ul className="space-y-2">
          {banners.map((b, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.imageUrl} alt={`Banner ${i + 1}`} className="h-12 w-20 object-cover rounded-lg bg-gray-100 shrink-0" />
              <span className="flex-1 text-xs text-gray-500 truncate">Banner {i + 1}</span>
              <button
                onClick={() => handleDelete(b.imageUrl)}
                className="shrink-0 text-red-400 hover:text-red-600 text-sm"
                title="Hapus banner"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

// ─── Payment Gateway Card ─────────────────────────────────────────────────────

interface GatewayStatus {
  hasServerKey: boolean; hasClientKey: boolean;
  serverKeyPreview: string | null; clientKeyPreview: string | null;
  hasXenditSecretKey: boolean; hasXenditPublicKey: boolean;
  xenditSecretPreview: string | null; xenditPublicPreview: string | null;
  hasDokuClientId: boolean; hasDokuSecretKey: boolean;
  dokuClientIdPreview: string | null; dokuSecretPreview: string | null;
}

type GatewayTab = "midtrans" | "xendit" | "doku";

const GW_TABS: { id: GatewayTab; label: string; emoji: string }[] = [
  { id: "midtrans", label: "Midtrans", emoji: "🏦" },
  { id: "xendit",   label: "Xendit",   emoji: "💸" },
  { id: "doku",     label: "Doku",     emoji: "💰" },
];

const gwInputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300 font-mono";

function PaymentGatewayCard() {
  const { data: gwData, mutate: mutateGw } = useSWR<{ success: boolean; data: GatewayStatus }>("/api/dashboard/settings/payment");
  const gw = gwData?.data;

  const [tab, setTab] = useState<GatewayTab>("midtrans");

  const [mtServerKey, setMtServerKey] = useState("");
  const [mtClientKey, setMtClientKey] = useState("");
  const [xdSecretKey, setXdSecretKey] = useState("");
  const [xdPublicKey, setXdPublicKey] = useState("");
  const [dkClientId,  setDkClientId]  = useState("");
  const [dkSecretKey, setDkSecretKey] = useState("");

  const [saving,  setSaving]  = useState(false);
  const [saveOk,  setSaveOk]  = useState(false);
  const [saveErr, setSaveErr] = useState("");

  async function save(payload: Record<string, string | null>) {
    setSaving(true); setSaveErr(""); setSaveOk(false);
    try {
      const res  = await fetch("/api/dashboard/settings/payment", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify(payload),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Gagal menyimpan");
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      mutateGw();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function remove(nullPayload: Record<string, null>) {
    if (!confirm("Hapus API keys gateway ini?")) return;
    await save(nullPayload);
  }

  const activeStatus = tab === "midtrans"
    ? (gw?.hasServerKey || gw?.hasClientKey)
    : tab === "xendit"
      ? (gw?.hasXenditSecretKey || gw?.hasXenditPublicKey)
      : (gw?.hasDokuClientId || gw?.hasDokuSecretKey);

  return (
    <ToolCard title="Payment Gateway">
      <div className="space-y-4">
        <p className="text-xs text-gray-400">Hubungkan payment gateway agar pembayaran cashless langsung masuk ke rekening kamu.</p>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {GW_TABS.map((t) => {
            const isActive = tab === t.id;
            const hasKey = t.id === "midtrans"
              ? (gw?.hasServerKey || gw?.hasClientKey)
              : t.id === "xendit"
                ? (gw?.hasXenditSecretKey || gw?.hasXenditPublicKey)
                : (gw?.hasDokuClientId || gw?.hasDokuSecretKey);
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSaveErr(""); setSaveOk(false); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isActive ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
                {hasKey && <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Status badge */}
        {gw && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
            activeStatus
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}>
            <span>{activeStatus ? "✅" : "⚠️"}</span>
            <span>
              {activeStatus
                ? `${GW_TABS.find(t => t.id === tab)?.label} aktif — uang langsung masuk ke rekening kamu`
                : `${GW_TABS.find(t => t.id === tab)?.label} belum dikonfigurasi`}
            </span>
          </div>
        )}

        {/* Midtrans */}
        {tab === "midtrans" && (
          <div className="space-y-3">
            {gw?.hasServerKey && (
              <div className="text-xs border border-gray-200 rounded-xl p-3 space-y-1">
                <p className="font-semibold text-gray-400 uppercase tracking-wide mb-2">Key tersimpan</p>
                <div className="flex justify-between"><span className="text-gray-500">Server Key</span><code className="bg-gray-100 px-2 py-0.5 rounded">{gw.serverKeyPreview}</code></div>
                <div className="flex justify-between"><span className="text-gray-500">Client Key</span><code className="bg-gray-100 px-2 py-0.5 rounded">{gw.clientKeyPreview}</code></div>
                <button onClick={() => remove({ midtransServerKey: null, midtransClientKey: null })} className="text-red-500 hover:text-red-700 underline mt-1">Hapus keys</button>
              </div>
            )}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Server Key</label>
                <input type="password" autoComplete="off" className={gwInputCls}
                  placeholder={gw?.hasServerKey ? "Isi untuk mengganti" : "Mid-server-XXXXXXXXXXXXXXXX"}
                  value={mtServerKey} onChange={(e) => setMtServerKey(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Client Key</label>
                <input type="password" autoComplete="off" className={gwInputCls}
                  placeholder={gw?.hasClientKey ? "Isi untuk mengganti" : "Mid-client-XXXXXXXXXXXXXXXX"}
                  value={mtClientKey} onChange={(e) => setMtClientKey(e.target.value)} />
              </div>
              <p className="text-xs text-gray-400">Dapatkan di <a href="https://dashboard.midtrans.com" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">dashboard.midtrans.com</a> → Settings → Access Keys</p>
            </div>
            {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
            {saveOk  && <p className="text-xs text-green-600">✓ Tersimpan</p>}
            <button onClick={() => save({ midtransServerKey: mtServerKey || null, midtransClientKey: mtClientKey || null })} disabled={saving || (!mtServerKey && !mtClientKey)}
              className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40">
              {saving ? "Menyimpan…" : "Simpan Midtrans Keys"}
            </button>
          </div>
        )}

        {/* Xendit */}
        {tab === "xendit" && (
          <div className="space-y-3">
            {gw?.hasXenditSecretKey && (
              <div className="text-xs border border-gray-200 rounded-xl p-3 space-y-1">
                <p className="font-semibold text-gray-400 uppercase tracking-wide mb-2">Key tersimpan</p>
                <div className="flex justify-between"><span className="text-gray-500">Secret Key</span><code className="bg-gray-100 px-2 py-0.5 rounded">{gw.xenditSecretPreview}</code></div>
                {gw.hasXenditPublicKey && <div className="flex justify-between"><span className="text-gray-500">Public Key</span><code className="bg-gray-100 px-2 py-0.5 rounded">{gw.xenditPublicPreview}</code></div>}
                <button onClick={() => remove({ xenditSecretKey: null, xenditPublicKey: null })} className="text-red-500 hover:text-red-700 underline mt-1">Hapus keys</button>
              </div>
            )}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Secret Key</label>
                <input type="password" autoComplete="off" className={gwInputCls}
                  placeholder={gw?.hasXenditSecretKey ? "Isi untuk mengganti" : "xnd_production_XXXXXXXXXXXXXXXX"}
                  value={xdSecretKey} onChange={(e) => setXdSecretKey(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Public Key (opsional)</label>
                <input type="password" autoComplete="off" className={gwInputCls}
                  placeholder={gw?.hasXenditPublicKey ? "Isi untuk mengganti" : "xnd_public_production_XXXXXXXX"}
                  value={xdPublicKey} onChange={(e) => setXdPublicKey(e.target.value)} />
              </div>
              <p className="text-xs text-gray-400">Dapatkan di <a href="https://dashboard.xendit.co/settings/developers" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">dashboard.xendit.co</a> → Settings → Developers → API Keys</p>
            </div>
            {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
            {saveOk  && <p className="text-xs text-green-600">✓ Tersimpan</p>}
            <button onClick={() => save({ xenditSecretKey: xdSecretKey || null, xenditPublicKey: xdPublicKey || null })} disabled={saving || !xdSecretKey}
              className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40">
              {saving ? "Menyimpan…" : "Simpan Xendit Keys"}
            </button>
          </div>
        )}

        {/* Doku */}
        {tab === "doku" && (
          <div className="space-y-3">
            {gw?.hasDokuClientId && (
              <div className="text-xs border border-gray-200 rounded-xl p-3 space-y-1">
                <p className="font-semibold text-gray-400 uppercase tracking-wide mb-2">Key tersimpan</p>
                <div className="flex justify-between"><span className="text-gray-500">Client ID</span><code className="bg-gray-100 px-2 py-0.5 rounded">{gw.dokuClientIdPreview}</code></div>
                {gw.hasDokuSecretKey && <div className="flex justify-between"><span className="text-gray-500">Secret Key</span><code className="bg-gray-100 px-2 py-0.5 rounded">{gw.dokuSecretPreview}</code></div>}
                <button onClick={() => remove({ dokuClientId: null, dokuSecretKey: null })} className="text-red-500 hover:text-red-700 underline mt-1">Hapus keys</button>
              </div>
            )}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Client ID</label>
                <input type="password" autoComplete="off" className={gwInputCls}
                  placeholder={gw?.hasDokuClientId ? "Isi untuk mengganti" : "BRN-XXXX-XXXXXXXXXXXXXXXXXX"}
                  value={dkClientId} onChange={(e) => setDkClientId(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Secret Key</label>
                <input type="password" autoComplete="off" className={gwInputCls}
                  placeholder={gw?.hasDokuSecretKey ? "Isi untuk mengganti" : "SK-XXXXXXXXXXXXXXXXXXXXXXXX"}
                  value={dkSecretKey} onChange={(e) => setDkSecretKey(e.target.value)} />
              </div>
              <p className="text-xs text-gray-400">Dapatkan di <a href="https://dashboard.doku.com" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">dashboard.doku.com</a> → My Projects → API Keys</p>
            </div>
            {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
            {saveOk  && <p className="text-xs text-green-600">✓ Tersimpan</p>}
            <button onClick={() => save({ dokuClientId: dkClientId || null, dokuSecretKey: dkSecretKey || null })} disabled={saving || !dkClientId}
              className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40">
              {saving ? "Menyimpan…" : "Simpan Doku Keys"}
            </button>
          </div>
        )}
      </div>
    </ToolCard>
  );
}

// ─── Payment Method Card ──────────────────────────────────────────────────────

const ALL_PAYMENT_METHODS = [
  { id: "TICKET",   emoji: "🎫", label: "Scan Ticket",  desc: "Tiket yang dibeli sebelumnya" },
  { id: "CASHLESS", emoji: "💳", label: "Cashless / QRIS", desc: "QRIS, GoPay, OVO, e-wallet" },
  { id: "VOUCHER",  emoji: "🏷️", label: "Voucher",      desc: "Kode voucher diskon / gratis" },
  { id: "CASH",     emoji: "💵", label: "Bayar Tunai (Cash)", desc: "Bayar ke kasir — sesi langsung aktif, tanpa payment screen" },
] as const;

function PaymentMethodCard({ boothId }: { boothId: string }) {
  const { data: allBooths, mutate } = useSWR<{ success: boolean; data: Array<{ id: string; welcomeScreenPrefs?: Record<string, unknown> | null }> }>(
    "/api/dashboard/booths"
  );

  const [enabled, setEnabled] = useState<Set<string>>(new Set(["TICKET", "CASHLESS", "VOUCHER", "CASH"]));
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    const booth = allBooths?.data?.find((b) => b.id === boothId);
    if (booth === undefined) return;
    initialized.current = true;
    const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
    const saved = prefs?.enabledPaymentMethods as string[] | undefined;
    setEnabled(new Set(saved ?? ["TICKET", "CASHLESS", "VOUCHER", "CASH"]));
  }, [allBooths, boothId]);

  useEffect(() => {
    initialized.current = false;
  }, [boothId]);

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr("");
    setSaveOk(false);
    try {
      const booth = allBooths?.data?.find((b) => b.id === boothId);
      const existing = (booth?.welcomeScreenPrefs ?? {}) as Record<string, unknown>;
      const merged = { ...existing, enabledPaymentMethods: Array.from(enabled) };

      const res = await fetch(`/api/dashboard/booths/${boothId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeScreenPrefs: merged }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Gagal menyimpan");
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      initialized.current = false;
      mutate();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Gagal menyimpan");
    }
    setSaving(false);
  }

  return (
    <ToolCard title="Metode Pembayaran">
      <div className="space-y-3">
        <p className="text-xs text-gray-400">Pilih metode yang tersedia untuk customer di booth kamu.</p>

        {ALL_PAYMENT_METHODS.map((m) => (
          <div key={m.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{m.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{m.label}</p>
                <p className="text-[11px] text-gray-400">{m.desc}</p>
              </div>
            </div>
            <button
              onClick={() => toggle(m.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${enabled.has(m.id) ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}
            >
              {enabled.has(m.id) ? "Aktif" : "Nonaktif"}
            </button>
          </div>
        ))}

        {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
        {saveOk && <p className="text-xs text-green-600">✓ Tersimpan</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40"
        >
          {saving ? "Menyimpan..." : "Simpan Metode Pembayaran"}
        </button>
      </div>
    </ToolCard>
  );
}

// ─── Frame Library Types & Helpers ───────────────────────────────────────────

const FRAME_CATS = [
  "AESTHETIC",
  "KIDS",
  "WEDDING",
  "GRADUATION",
  "BIRTHDAY",
  "CORPORATE",
  "SEASONAL",
  "OTHER",
] as const;

const FRAME_CAT_LABEL: Record<string, string> = {
  AESTHETIC: "Aesthetic",
  KIDS: "Anak",
  WEDDING: "Wedding",
  GRADUATION: "Graduation",
  BIRTHDAY: "Birthday",
  CORPORATE: "Corporate",
  SEASONAL: "Seasonal",
  OTHER: "Lainnya",
};

interface LibFrame {
  id: string;
  name: string;
  category: string;
  sourceCategory?: string;
  thumbnailUrl: string;
  designerId?: string | null;
  isPremium?: boolean;
  captureMode?: "single" | "duplicate";
  canvasWidth?: number | null;
  canvasHeight?: number | null;
  maxCaptures?: number;
  slots?: unknown[] | null;
}

function getLibFrameSize(frame: LibFrame): "STORY" | "4R" | "2R" {
  const w = Number(frame.canvasWidth ?? 0);
  const h = Number(frame.canvasHeight ?? 0);
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio <= 0.62) return "STORY";   // 9:16 = 0.5625
    if (ratio <= 0.695) return "4R";     // portrait 4R (4×6" ≈ 0.667)
    if (ratio <= 0.78) return "2R";      // portrait 2R (2.5×3.5" ≈ 0.714)
  }
  return "4R"; // landscape or default
}

function getLibFrameAspectStyle(frame: LibFrame): React.CSSProperties {
  const w = Number(frame.canvasWidth ?? 0);
  const h = Number(frame.canvasHeight ?? 0);
  if (w > 0 && h > 0) return { aspectRatio: `${w} / ${h}` };
  const size = getLibFrameSize(frame);
  if (size === "STORY") return { aspectRatio: "9 / 16" };
  if (size === "2R") return { aspectRatio: "2 / 3" };
  return { aspectRatio: "2 / 3" };
}

function SlotOverlay({ slots }: { slots: NormalizedSlot[] }) {
  if (slots.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {slots.map((slot, idx) => (
        <div
          key={`${slot.photoIndex}-${idx}`}
          className="absolute border border-white/80 bg-black/20"
          style={{
            left: `${slot.left * 100}%`,
            top: `${slot.top * 100}%`,
            width: `${slot.width * 100}%`,
            height: `${slot.height * 100}%`,
          }}
        >
          <div className="absolute left-1 top-1 h-5 w-5 rounded-full bg-black/70 text-[10px] font-bold text-white flex items-center justify-center">
            {idx + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

interface FremioFrame {
  fremioId: string; studioId: string; name: string;
  category: string; fremioCategory: string;
  thumbnailUrl: string; assetUrl: string; overlayUrl: string | null;
  aspectRatio: string; canvasWidth: number; canvasHeight: number;
  maxCaptures: number; isPremium: boolean; alreadyImported: boolean;
  isDeactivated: boolean;
  slots: unknown[] | null;
}

const FREMIO_CATEGORY_LABEL: Record<string, string> = {
  AESTHETIC: "Aesthetic", KOREAN: "Korean", VINTAGE: "Vintage",
  MINIMALIST: "Minimalis", BIRTHDAY: "Ulang Tahun", WEDDING: "Wedding",
  GRADUATION: "Wisuda", SEASONAL: "Seasonal", CUSTOM: "Custom",
};

function ImportFremioModal({
  onClose,
  onImported,
  boothId,
}: {
  onClose: () => void;
  onImported: () => void;
  boothId: string;
}) {
  const [frames, setFrames]       = useState<FremioFrame[] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<{ imported: number; failed: number } | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard/frames/import-preview?boothId=${encodeURIComponent(boothId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setFrames(json.data);
        else setError(json.error ?? "Gagal mengambil frame");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [boothId]);

  const allCats = frames ? ["ALL", ...Array.from(new Set(frames.map((f) => f.category)))] : ["ALL"];

  const visible = (frames ?? []).filter((f) => {
    if (filterCat !== "ALL" && f.category !== filterCat) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selectAll = () => setSelected(new Set(visible.filter((f) => !f.alreadyImported).map((f) => f.fremioId)));
  const clearAll  = () => setSelected(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0 || !frames) return;
    setImporting(true);
    const toImport = frames.filter((f) => selected.has(f.fremioId));
    const res = await fetch("/api/dashboard/frames/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames: toImport, boothId }),
    });
    const json = await res.json();
    setImporting(false);
    if (json.success) {
      setResult(json.data);
      onImported();
    } else {
      setError(json.error ?? "Import gagal");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import Frame dari Fremio.id</h2>
            {frames && <p className="text-xs text-gray-400 mt-0.5">{frames.length} frame 4R tersedia · {frames.filter((f) => f.alreadyImported).length} sudah aktif</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {!result && (
          <div className="px-6 py-3 border-b flex-shrink-0 flex flex-wrap gap-2 items-center">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari frame…"
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 flex-1 min-w-[160px]"
            />
            <div className="flex gap-1.5 flex-wrap">
              {allCats.map((cat) => (
                <button key={cat} onClick={() => setFilterCat(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    filterCat === cat ? "bg-primary-100 text-primary-900" : "bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}>
                  {cat === "ALL" ? "Semua" : FREMIO_CATEGORY_LABEL[cat] ?? cat}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2 items-center text-xs">
              <button onClick={selectAll} className="text-primary-700 hover:underline">Pilih Semua</button>
              <span className="text-gray-300">|</span>
              <button onClick={clearAll} className="text-gray-500 hover:underline">Hapus Pilihan</button>
              <span className="text-gray-400 font-medium">{selected.size} dipilih</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {Array.from({ length: 24 }).map((_, i) => <div key={i} className="aspect-[2/3] bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : error ? (
            <p className="text-red-500 text-sm text-center py-8">{error}</p>
          ) : result ? (
            <div className="text-center py-12">
              <p className="text-5xl mb-3">✅</p>
              <p className="text-xl font-bold text-gray-900">{result.imported} frame berhasil diimport!</p>
              {result.failed > 0 && <p className="text-sm text-red-500 mt-1">{result.failed} gagal</p>}
              <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800">Tutup</button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {visible.map((f) => {
                const isSel = selected.has(f.fremioId);
                return (
                  <div key={f.fremioId} onClick={() => !f.alreadyImported && toggleSelect(f.fremioId)}
                    className={["relative rounded-xl border overflow-hidden transition-all",
                      f.alreadyImported ? "opacity-50 cursor-default border-gray-100"
                        : isSel ? "cursor-pointer border-primary-700 ring-2 ring-primary-700/30"
                        : "cursor-pointer border-gray-100 hover:border-primary-400"].join(" ")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.thumbnailUrl} alt={f.name} className="w-full aspect-[2/3] object-cover" loading="lazy" />
                    {isSel && !f.alreadyImported && (
                      <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-primary-900 flex items-center justify-center text-white text-xs font-bold">✓</div>
                    )}
                    {f.alreadyImported && (
                      <div className="absolute top-1.5 right-1.5 h-6 px-1.5 rounded-full bg-green-500 flex items-center text-white text-[10px] font-bold">✓ Ada</div>
                    )}
                    <div className="p-2">
                      <p className="text-[11px] font-semibold text-gray-800 truncate leading-tight">{f.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{f.fremioCategory}</p>
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && <p className="col-span-full text-center text-gray-400 py-8">Tidak ada frame ditemukan.</p>}
            </div>
          )}
        </div>

        {!result && (
          <div className="px-6 py-4 border-t flex-shrink-0 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
            <button onClick={handleImport} disabled={importing || selected.size === 0}
              className="flex-1 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold disabled:opacity-60">
              {importing ? "Mengimpor..." : `Import${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Delivery Card ───────────────────────────────────────────────────────────

const DELIVERY_CHANNELS = [
  { id: "DOWNLOAD", label: "Link Download" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "EMAIL", label: "Email" },
] as const;

function DeliveryCard({ boothId }: { boothId: string }) {
  const { data: allBooths, mutate } = useSWR<{ success: boolean; data: Array<{ id: string; welcomeScreenPrefs?: Record<string, unknown> | null }> }>(
    "/api/dashboard/booths"
  );


// ─── Frame Library Types & Helpers ───────────────────────────────────────────

const FRAME_CATS = [
  "AESTHETIC",
  "KIDS",
  "WEDDING",
  "GRADUATION",
  "BIRTHDAY",
  "CORPORATE",
  "SEASONAL",
  "OTHER",
] as const;

const FRAME_CAT_LABEL: Record<string, string> = {
  AESTHETIC: "Aesthetic",
  KIDS: "Anak",
  WEDDING: "Wedding",
  GRADUATION: "Graduation",
  BIRTHDAY: "Birthday",
  CORPORATE: "Corporate",
  SEASONAL: "Seasonal",
  OTHER: "Lainnya",
};

interface LibFrame {
  id: string;
  name: string;
  category: string;
  thumbnailUrl: string;
  designerId?: string | null;
  isPremium?: boolean;
  captureMode?: "single" | "duplicate";
  canvasWidth?: number | null;
  canvasHeight?: number | null;
}

function getLibFrameSize(frame: LibFrame): "STORY" | "4R" | "2R" {
  const w = Number(frame.canvasWidth ?? 0);
  const h = Number(frame.canvasHeight ?? 0);
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio <= 0.62) return "STORY";   // 9:16 = 0.5625
    if (ratio <= 0.695) return "4R";     // portrait 4R (4×6" ≈ 0.667)
    if (ratio <= 0.78) return "2R";      // portrait 2R (2.5×3.5" ≈ 0.714)
  }
  return "4R"; // landscape or default
}

function getLibFrameAspectStyle(frame: LibFrame): React.CSSProperties {
  const w = Number(frame.canvasWidth ?? 0);
  const h = Number(frame.canvasHeight ?? 0);
  if (w > 0 && h > 0) return { aspectRatio: `${w} / ${h}` };
  const size = getLibFrameSize(frame);
  if (size === "STORY") return { aspectRatio: "9 / 16" };
  if (size === "2R") return { aspectRatio: "2 / 3" };
  return { aspectRatio: "2 / 3" };
}
  const [enabled, setEnabled] = useState<Set<string>>(new Set(["DOWNLOAD", "WHATSAPP", "EMAIL"]));
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    const booth = allBooths?.data?.find((b) => b.id === boothId);
    if (booth === undefined) return;
    initialized.current = true;
    const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
    const saved = prefs?.deliveryChannels as string[] | undefined;
    setEnabled(new Set(saved ?? ["DOWNLOAD", "WHATSAPP", "EMAIL"]));
  }, [allBooths, boothId]);

  useEffect(() => {
    initialized.current = false;
  }, [boothId]);

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr("");
    setSaveOk(false);
    try {
      const booth = allBooths?.data?.find((b) => b.id === boothId);
      const existing = (booth?.welcomeScreenPrefs ?? {}) as Record<string, unknown>;
      const merged = { ...existing, deliveryChannels: Array.from(enabled) };

      const res = await fetch(`/api/dashboard/booths/${boothId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeScreenPrefs: merged }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Gagal menyimpan");
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      initialized.current = false;
      mutate();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Gagal menyimpan");
    }
    setSaving(false);
  }

  return (
    <ToolCard title="Pengiriman & Hasil Foto">
      <div className="space-y-3">
        <p className="text-xs text-gray-400">Atur channel pengiriman hasil foto ke customer.</p>

        {DELIVERY_CHANNELS.map((c) => (
          <div key={c.id} className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">{c.label}</p>
            <button
              onClick={() => toggle(c.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${enabled.has(c.id) ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}
            >
              {enabled.has(c.id) ? "Aktif" : "Nonaktif"}
            </button>
          </div>
        ))}

        {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
        {saveOk && <p className="text-xs text-green-600">✓ Tersimpan</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40"
        >
          {saving ? "Menyimpan..." : "Simpan Pengaturan Pengiriman"}
        </button>
      </div>
    </ToolCard>
  );
}

function SocialMediaCard({ boothId }: { boothId: string }) {
  const { data: allBooths, mutate } = useSWR<{ success: boolean; data: Array<{ id: string; welcomeScreenPrefs?: Record<string, unknown> | null }> }>(
    "/api/dashboard/booths"
  );

  const [instagramUsername, setInstagramUsername] = useState("");
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [ctaText, setCtaText] = useState("Ikuti kami");
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const initialized = useRef(false);

  const normalizeUsername = useCallback((value: string, platform: "instagram" | "tiktok") => {
    let clean = value.trim();
    if (!clean) return "";

    clean = clean.replace(/^https?:\/\/(www\.)?/i, "");
    if (platform === "instagram") clean = clean.replace(/^instagram\.com\//i, "");
    if (platform === "tiktok") clean = clean.replace(/^tiktok\.com\//i, "");

    const parts = clean.split("/").filter(Boolean);
    clean = parts.length > 0 ? parts[parts.length - 1] : "";
    clean = clean.replace(/^@+/, "");

    return clean;
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    const booth = allBooths?.data?.find((b) => b.id === boothId);
    if (booth === undefined) return;
    initialized.current = true;
    const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
    setInstagramUsername(
      typeof prefs?.instagramUrl === "string"
        ? normalizeUsername(prefs.instagramUrl, "instagram")
        : ""
    );
    setTiktokUsername(
      typeof prefs?.tiktokUrl === "string"
        ? normalizeUsername(prefs.tiktokUrl, "tiktok")
        : ""
    );
    setCtaText(typeof prefs?.socialCtaText === "string" ? prefs.socialCtaText : "Ikuti kami");
  }, [allBooths, boothId, normalizeUsername]);

  useEffect(() => {
    initialized.current = false;
  }, [boothId]);

  async function handleSave() {
    setSaving(true);
    setSaveErr("");
    setSaveOk(false);
    try {
      const booth = allBooths?.data?.find((b) => b.id === boothId);
      const existing = (booth?.welcomeScreenPrefs ?? {}) as Record<string, unknown>;
      const cleanInstagram = normalizeUsername(instagramUsername, "instagram");
      const cleanTiktok = normalizeUsername(tiktokUsername, "tiktok");
      const merged = {
        ...existing,
        instagramUrl: cleanInstagram ? `https://instagram.com/${cleanInstagram}` : null,
        tiktokUrl: cleanTiktok ? `https://tiktok.com/@${cleanTiktok}` : null,
        socialCtaText: ctaText.trim() || "Ikuti kami",
      };

      const res = await fetch(`/api/dashboard/booths/${boothId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeScreenPrefs: merged }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Gagal menyimpan");
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      initialized.current = false;
      mutate();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Gagal menyimpan");
    }
    setSaving(false);
  }

  return (
    <ToolCard title="Sosial Media (Halaman Download)">
      <div className="space-y-3">
        <p className="text-xs text-gray-400">
          Tampilkan tombol Instagram dan TikTok di halaman hasil download QR customer.
        </p>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Teks CTA (Call to Action)</label>
          <input
            type="text"
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            placeholder="Ikuti kami"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Username Instagram</label>
          <input
            type="text"
            value={instagramUsername}
            onChange={(e) => setInstagramUsername(e.target.value)}
            placeholder="username"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Username TikTok</label>
          <input
            type="text"
            value={tiktokUsername}
            onChange={(e) => setTiktokUsername(e.target.value)}
            placeholder="username"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
        {saveOk && <p className="text-xs text-green-600">✓ Tersimpan</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40"
        >
          {saving ? "Menyimpan..." : "Simpan Pengaturan Sosial Media"}
        </button>
      </div>
    </ToolCard>
  );
}

function AddFrameModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", category: "AESTHETIC", thumbnailUrl: "", assetUrl: "", aspectRatio: "2:3", canvasWidth: 1200, canvasHeight: 1800, isPremium: false, sortOrder: 0 });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/dashboard/frames", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, canvasWidth: Number(form.canvasWidth), canvasHeight: Number(form.canvasHeight), sortOrder: Number(form.sortOrder) }) });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Gagal"); setLoading(false); return; }
      onCreated(); onClose();
    } catch { setError("Network error"); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Tambah Frame Baru</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Frame *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" placeholder="Cth: Aesthetic White Border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none">
              {FRAME_CATS.map(c => <option key={c} value={c}>{FRAME_CAT_LABEL[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Thumbnail *</label>
            <input required type="url" value={form.thumbnailUrl} onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Asset (Overlay PNG) *</label>
            <input required type="url" value={form.assetUrl} onChange={e => setForm(f => ({ ...f, assetUrl: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" placeholder="https://..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rasio</label>
              <input value={form.aspectRatio} onChange={e => setForm(f => ({ ...f, aspectRatio: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" placeholder="2:3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lebar (px)</label>
              <input type="number" value={form.canvasWidth} onChange={e => setForm(f => ({ ...f, canvasWidth: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tinggi (px)</label>
              <input type="number" value={form.canvasHeight} onChange={e => setForm(f => ({ ...f, canvasHeight: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isPremium} onChange={e => setForm(f => ({ ...f, isPremium: e.target.checked }))} className="h-4 w-4 rounded text-primary-900" />
            <span className="text-sm font-medium text-gray-700">Frame Premium</span>
          </label>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold disabled:opacity-60">{loading ? "Menyimpan…" : "Tambah Frame"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lib Frame Card ───────────────────────────────────────────────────────────

function LibFrameCard({
  frame,
  editable,
  onDisable,
  onDelete,
  currentUserId,
  currentCategory,
  categoryChoices,
  onCategoryChange,
  onDeleteCategory,
  canDeleteCategory,
}: {
  frame: LibFrame;
  editable: boolean;
  onDisable: () => void;
  onDelete: () => void;
  currentUserId?: string;
  currentCategory: string;
  categoryChoices: string[];
  onCategoryChange: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  canDeleteCategory: (category: string) => boolean;
}) {
  const isOwned     = frame.designerId === currentUserId;
  const [categoryOpen, setCategoryOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!categoryOpen) return;
    const handleOutside = (ev: MouseEvent) => {
      if (!categoryMenuRef.current) return;
      if (!categoryMenuRef.current.contains(ev.target as Node)) {
        setCategoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [categoryOpen]);
  return (
    <div className={`bg-white rounded-2xl border border-primary-900 ring-2 ring-primary-900/20 overflow-visible transition-all group relative ${categoryOpen ? "z-40" : "z-0"}`}>
      <div className="relative rounded-t-2xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.thumbnailUrl} alt={frame.name} className="w-full object-cover" style={getLibFrameAspectStyle(frame)} loading="lazy" />
        {editable && <button className="absolute top-2 right-2 h-7 w-7 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-bold shadow hover:bg-red-600 transition-colors" onClick={e => { e.stopPropagation(); onDisable(); }} title="Nonaktifkan dari katalog aktif">✕</button>}
        {editable && isOwned && (
          <a
            href={`/frames/editor?editFrameId=${frame.id}&frameName=${encodeURIComponent(frame.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Edit frame ini di Studio"
            className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-600 text-white text-[10px] font-bold shadow hover:bg-purple-700 transition-colors"
          >
            ✏️ Edit
          </a>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-gray-800 truncate">{frame.name}</p>
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <span>{FRAME_CAT_LABEL[frame.category] ?? frame.category}</span>
          {(() => {
            const sz = getLibFrameSize(frame);
            if (sz === "STORY") return <span className="ml-auto text-blue-500 font-semibold">Story</span>;
            if (sz === "4R")    return <span className="ml-auto text-purple-500 font-semibold">4R</span>;
            if (sz === "2R")    return <span className="ml-auto text-green-500 font-semibold">2R</span>;
            return null;
          })()}
        </p>
        {editable && (
          <div className="mt-1.5 relative" ref={categoryMenuRef}>
            <p className="text-[10px] font-semibold text-gray-500 mb-1">Kategori Booth</p>
            <button
              type="button"
              onClick={() => setCategoryOpen((v) => !v)}
              className="w-full flex items-center justify-between rounded-xl border border-primary-300 bg-primary-50 px-2 py-1.5 text-[10px] font-bold text-primary-800 hover:bg-primary-100 transition-colors"
            >
              <span className="truncate">{FRAME_CAT_LABEL[currentCategory] ?? currentCategory}</span>
              <span className={`text-[9px] transition-transform ${categoryOpen ? "rotate-180" : ""}`}>▾</span>
            </button>

            {categoryOpen && (
              <div className="absolute z-[120] mt-1 w-full rounded-xl border border-primary-200 bg-white shadow-xl overflow-hidden">
                <div className="max-h-44 overflow-y-auto py-1">
                  {categoryChoices.map((cat) => {
                    const active = currentCategory === cat;
                    const removable = canDeleteCategory(cat);
                    return (
                      <div key={cat} className={`flex items-center ${active ? "bg-primary-50" : ""}`}>
                        <button
                          type="button"
                          onClick={() => {
                            onCategoryChange(cat);
                            setCategoryOpen(false);
                          }}
                          className={`flex-1 text-left px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                            active ? "text-primary-900" : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {FRAME_CAT_LABEL[cat] ?? cat}
                        </button>
                        {removable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCategory(cat);
                            }}
                            className="mr-1 h-5 w-5 rounded-full bg-red-50 text-red-500 text-[10px] font-bold hover:bg-red-100"
                            title="Hapus kategori kosong"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Frame Selection Card (per Booth) ────────────────────────────────────────

function FrameSelectionCard({ boothId }: { boothId: string }) {
  const { data: session } = useSession();
  const { data: frameData, isLoading, mutate } = useSWR<{ success: boolean; data: { frames: LibFrame[]; allowedFrameIds: string[]; boothCustomCategories?: string[]; frameCategoryOverrides?: Record<string, string>; welcomeScreenPrefs?: Record<string, unknown> | null } }>(
    `/api/dashboard/frames?boothId=${boothId}`
  );

  const frames      = frameData?.data?.frames ?? [];
  const rawAllowed  = frameData?.data?.allowedFrameIds ?? [];
  const rawCustomCategories = frameData?.data?.boothCustomCategories ?? [];
  const currentPrefs = (frameData?.data?.welcomeScreenPrefs ?? {}) as Record<string, unknown>;
  const [localAllowed,    setLocalAllowed]    = useState<string[] | null>(null);
  const [filterCategory,  setFilterCategory]  = useState("ALL");
  const [localCategoryByFrame, setLocalCategoryByFrame] = useState<Record<string, string> | null>(null);
  const [localCustomCategories, setLocalCustomCategories] = useState<string[] | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [isAdjusting,     setIsAdjusting]     = useState(false);

  useEffect(() => {
    setLocalAllowed(null);
    setFilterCategory("ALL");
    setLocalCategoryByFrame(null);
    setLocalCustomCategories(null);
    setIsAdjusting(false);
  }, [boothId]);

  const allowed    = localAllowed ?? rawAllowed;
  const customCategories = localCustomCategories ?? rawCustomCategories;
  const allEnabled = allowed.length === 0;

  const toggleFrame = (id: string) => {
    setLocalAllowed((prev) => {
      const base      = prev ?? rawAllowed;
      const effective = base.length === 0 ? frames.map((f) => f.id) : [...base];
      const has       = effective.includes(id);
      const next      = has ? effective.filter((x) => x !== id) : [...effective, id];
      return next.length === frames.length ? [] : next;
    });
  };

  const startAdjust = () => {
    if (localAllowed === null) {
      setLocalAllowed(rawAllowed.length === 0 ? frames.map((f) => f.id) : [...rawAllowed]);
    }
    if (localCategoryByFrame === null) {
      setLocalCategoryByFrame(Object.fromEntries(frames.map((f) => [f.id, f.category])));
    }
    if (localCustomCategories === null) {
      setLocalCustomCategories([...rawCustomCategories]);
    }
    setIsAdjusting(true);
  };

  const cancelAdjust = () => {
    setLocalAllowed(null);
    setLocalCategoryByFrame(null);
    setLocalCustomCategories(null);
    setIsAdjusting(false);
  };

  const addCategory = () => {
    const raw = window.prompt("Nama kategori baru untuk booth ini:", "");
    const next = (raw ?? "").trim();
    if (!next) return;
    setLocalCustomCategories((prev) => {
      const base = prev ?? rawCustomCategories;
      if (base.some((c) => c.toLowerCase() === next.toLowerCase())) return base;
      return [...base, next];
    });
  };

  const removeCategory = (category: string) => {
    if (!window.confirm(`Hapus kategori \"${category}\"?`)) return;
    setLocalCustomCategories((prev) => {
      const base = prev ?? rawCustomCategories;
      return base.filter((c) => c.toLowerCase() !== category.toLowerCase());
    });
    if (filterCategory === category) {
      setFilterCategory("ALL");
    }
  };

  const setFrameCategory = (frameId: string, category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    setLocalCategoryByFrame((prev) => {
      const base = prev ?? Object.fromEntries(frames.map((f) => [f.id, f.category]));
      return { ...base, [frameId]: trimmed };
    });

    setLocalCustomCategories((prev) => {
      const base = prev ?? rawCustomCategories;
      if (FRAME_CATS.includes(trimmed as (typeof FRAME_CATS)[number])) return base;
      if (base.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return base;
      return [...base, trimmed];
    });
  };

  const handleSave = async () => {
    if (localAllowed === null && localCategoryByFrame === null && localCustomCategories === null) return;

    const finalAllowed = localAllowed ?? rawAllowed;
    const finalCategoryByFrame = localCategoryByFrame ?? Object.fromEntries(frames.map((f) => [f.id, f.category]));
    const finalCustomCategories = Array.from(
      new Set((localCustomCategories ?? rawCustomCategories).map((c) => c.trim()).filter(Boolean))
    );

    const nextOverrides: Record<string, string> = {};
    for (const frame of frames) {
      const baseCategory = frame.sourceCategory ?? frame.category;
      const nextCategory = (finalCategoryByFrame[frame.id] ?? frame.category).trim();
      if (nextCategory && nextCategory !== baseCategory) {
        nextOverrides[frame.id] = nextCategory;
      }
    }

    setSaving(true);
    await fetch(`/api/dashboard/booths/${boothId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowedFrameIds: finalAllowed,
        welcomeScreenPrefs: {
          ...currentPrefs,
          frameCategoryOverrides: nextOverrides,
          boothCustomCategories: finalCustomCategories,
        },
      }),
    });
    setSaving(false);
    setLocalAllowed(null);
    setLocalCategoryByFrame(null);
    setLocalCustomCategories(null);
    setIsAdjusting(false);
    mutate();
    globalMutate(`/api/dashboard/frames?boothId=${boothId}`);
  };

  const handleDelete = async (frameId: string) => {
    if (!confirm("Hapus frame ini dari library?")) return;
    await fetch(`/api/dashboard/frames/${frameId}`, { method: "DELETE" });
    mutate();
  };

  // Only allow 4R frames - filter out 2R and Story Instagram
  const frameCategory = (f: LibFrame) => (localCategoryByFrame?.[f.id] ?? f.category);
  const filtered = frames.filter((f) => getLibFrameSize(f) === "4R");
  const activeFrames = allEnabled
    ? filtered
    : filtered.filter((f) => allowed.includes(f.id));
  const categoryOrder = new Map<string, number>(FRAME_CATS.map((cat, idx) => [cat, idx]));
  const categoryRank = (cat: string) => categoryOrder.get(cat) ?? Number.MAX_SAFE_INTEGER;
  const sortCategories = (cats: string[]) =>
    [...cats].sort((a, b) => {
      const aRank = categoryRank(a);
      const bRank = categoryRank(b);
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b, "id");
    });
  const activeCategorySet = new Set(activeFrames.map((f) => frameCategory(f)));
  const activeCategoryCounts = activeFrames.reduce((acc, frame) => {
    const cat = frameCategory(frame);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categoryOptions = [
    "ALL",
    ...sortCategories(Array.from(activeCategorySet)),
  ];
  const frameCategoryChoices = sortCategories(Array.from(new Set([...customCategories, ...Array.from(activeCategorySet)])));
  const canDeleteCategory = (category: string) =>
    customCategories.some((c) => c.toLowerCase() === category.toLowerCase()) &&
    (activeCategoryCounts[category] ?? 0) === 0;
  const visibleFrames = activeFrames
    .filter((f) => filterCategory === "ALL" || frameCategory(f) === filterCategory)
    .sort((a, b) => {
      const aRank = categoryRank(frameCategory(a));
      const bRank = categoryRank(frameCategory(b));
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name, "id");
    });
  const activeCount = activeFrames.length;

  return (
    <ToolCard title="Frame yang Digunakan">
      {showImportModal && (
        <ImportFremioModal
          onClose={() => setShowImportModal(false)}
          onImported={() => { mutate(); globalMutate(`/api/dashboard/frames?boothId=${boothId}`); }}
          boothId={boothId}
        />
      )}
      {showAddModal && (
        <AddFrameModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { mutate(); globalMutate(`/api/dashboard/frames?boothId=${boothId}`); }}
        />
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => setShowImportModal(true)} className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary-900 text-xs font-bold hover:bg-primary-100 border border-primary-200">
          🌐 Import dari Fremio.id
        </button>
        <a href="/frames/editor" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-900 text-xs font-bold hover:bg-purple-100 border border-purple-200">
          ✏️ Buat Frame Sendiri
        </a>
        {!isAdjusting ? (
          <button onClick={startAdjust} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 text-xs font-bold hover:bg-amber-100 border border-amber-200 ml-auto">
            ⚙️ Sesuaikan
          </button>
        ) : (
          <>
            <button onClick={addCategory} disabled={saving} className="px-3 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-900 text-xs font-bold hover:bg-primary-100 disabled:opacity-60 ml-auto">
              ＋ Tambah Kategori
            </button>
            <button onClick={cancelAdjust} disabled={saving} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 disabled:opacity-60 ml-auto">
              Batal
            </button>
            <button onClick={handleSave} disabled={saving || (localAllowed === null && localCategoryByFrame === null && localCustomCategories === null)} className="px-3 py-1.5 rounded-lg bg-primary-900 text-white text-xs font-bold disabled:opacity-60">
              {saving ? "Menyimpan…" : "💾 Simpan Perubahan"}
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {isLoading
          ? "Memuat frame…"
          : isAdjusting
            ? `${activeCount} dari ${filtered.length} frame 4R aktif · Klik tombol close pada frame untuk menonaktifkan, lalu simpan perubahan`
            : `${activeCount} dari ${filtered.length} frame 4R aktif · Frame nonaktif disembunyikan dari katalog aktif`}
      </p>

      {/* Category filter */}
      {categoryOptions.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {categoryOptions.map((cat) => {
              const active = filterCategory === cat;
              const label = cat === "ALL" ? "Semua Kategori" : (FRAME_CAT_LABEL[cat] ?? cat);
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className="transition-all duration-200 rounded-full font-semibold text-xs"
                  style={{
                    padding: "6px 14px",
                    background: active ? "#c49a8e" : "transparent",
                    color:      active ? "#fff" : "#4a302b",
                    fontWeight: active ? 700 : 600,
                    boxShadow:  active ? "0 2px 8px rgba(196,154,142,0.35)" : "none",
                    border: active ? "1px solid #c49a8e" : "1px solid #eaded8",
                  }}
                >
                  {label}
                </button>
              );
            })}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[2/3] bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : visibleFrames.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-4xl mb-2">🖼️</p>
          <p className="text-gray-500 text-sm font-semibold mb-1">Tidak ada frame pada kategori ini.</p>
          <p className="text-gray-400 text-xs">Pilih kategori lain atau aktifkan frame yang dibutuhkan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {visibleFrames.map((frame) => (
            <LibFrameCard
              key={frame.id} frame={frame} editable={isAdjusting}
              onDisable={() => toggleFrame(frame.id)}
              onDelete={() => handleDelete(frame.id)}
              currentUserId={session?.user?.id}
              currentCategory={frameCategory(frame)}
              categoryChoices={frameCategoryChoices}
              onCategoryChange={(cat) => setFrameCategory(frame.id, cat)}
              onDeleteCategory={removeCategory}
              canDeleteCategory={canDeleteCategory}
            />
          ))}
        </div>
      )}
    </ToolCard>
  );
}

// ─── Create Booth Modal ──────────────────────────────────────────────────────

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "booth";
}

function CreateBoothModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name,    setName]    = useState("");
  const [slug,    setSlug]    = useState("");
  const [slugCustom, setSlugCustom] = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const displaySlug = slugCustom ? slug : (name ? slugify(name) + "-" + Math.random().toString(36).slice(2,5) : "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nama booth wajib diisi"); return; }
    setLoading(true); setError("");
    const suffix = Math.random().toString(36).slice(2, 5);
    const finalSlug = slugCustom ? slug : (slugify(name) + "-" + suffix);
    const res = await fetch("/api/dashboard/booths", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boothName: name.trim(),
        slug: finalSlug,
        pricePerSession: 25000,
        printPricePerSheet: 10000,
        sessionDurationSeconds: 300,
        printEnabled: false,
        primaryColor: "#ffffff",
        accentColor: "#deb7a9",
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setLoading(false);
      setError(json.error ?? "Gagal membuat booth");
      return;
    }
    const newBoothId: string = json.data.id;

    // Auto-set allowedFrameIds to 4R frames only
    try {
      const framesRes  = await fetch("/api/dashboard/frames");
      const framesJson = await framesRes.json();
      if (framesJson.success) {
        const allFrames: LibFrame[] = framesJson.data?.frames ?? [];
        const fourRIds = allFrames.filter((f) => getLibFrameSize(f) === "4R").map((f) => f.id);
        if (fourRIds.length > 0) {
          await fetch(`/api/dashboard/booths/${newBoothId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ allowedFrameIds: fourRIds }),
          });
        }
      }
    } catch {
      // non-fatal
    }

    setLoading(false);
    onCreated(newBoothId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Tambah Booth Baru</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nama Booth / Lokasi</label>
            <input
              autoFocus
              type="text"
              placeholder="contoh: Kafe Bandung, Mall Jakarta Lt.2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          {name && (
            <p className="text-xs text-gray-400">URL booth: <span className="font-mono text-gray-600">studio.fremio.id/b/{displaySlug}</span></p>
          )}
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={loading || !name.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-900 hover:bg-primary-800 disabled:opacity-50 transition-colors">
              {loading ? "Membuat..." : "Buat Booth"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BoothsPage() {
  const { data, isLoading, mutate } = useSWR<{ success: boolean; data: Booth[] }>("/api/dashboard/booths");
  const booths = data?.data ?? [];

  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      }).then((r) => r.json()).then((json) => { if (json.success) { mutate(); setSelectedBoothId(json.data.id); } });
    }
  }, [isLoading, data, booths.length, mutate]);

  const booth = (selectedBoothId ? booths.find((b) => b.id === selectedBoothId) : null) ?? booths[0] ?? null;

  // Carousel state


  // Inline edit states
  const [editName,       setEditName]       = useState<string | null>(null);
  const [editPrice,      setEditPrice]      = useState<string | null>(null);
  const [editPrintPrice, setEditPrintPrice] = useState<string | null>(null);
  const [editDuration,   setEditDuration]   = useState<string | null>(null);
  const [editTimerKey,   setEditTimerKey]   = useState<string | null>(null); // which timer is being edited
  const [editTimerVal,   setEditTimerVal]   = useState<string>("");
  const [editPaperSheets, setEditPaperSheets] = useState<string | null>(null);
  const [saving,         setSaving]         = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(Array.from({ length: 6 }, () => ""));
  const [pinActiveIndex, setPinActiveIndex] = useState(0);
  const [pinDirty, setPinDirty] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSaved, setPinSaved] = useState(false);
  const pinInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const focusPinField = useCallback((index: number) => {
    const el = pinInputRefs.current[index];
    if (!el) return;
    el.focus();
    el.select();
    setPinActiveIndex(index);
  }, []);

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

  const savePaperSheetsRemaining = async (nextValue: number) => {
    if (!booth) return;
    setSaving("paperSheetsRemaining");

    const prefs = (booth.welcomeScreenPrefs as Record<string, unknown> | null) ?? {};
    await fetch(`/api/dashboard/booths/${booth.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        welcomeScreenPrefs: {
          ...prefs,
          paperSheetsRemaining: Math.max(0, Math.floor(nextValue)),
        },
      }),
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

  const scrollToToolsCategory = useCallback((categoryId: string) => {
    const target = document.getElementById(categoryId);
    if (!target) return;

    const scrollContainer = document.querySelector('[data-dashboard-scroll="true"]') as HTMLElement | null;
    if (!scrollContainer) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const topOffset = 76;
    const nextTop = targetRect.top - containerRect.top + scrollContainer.scrollTop - topOffset;
    scrollContainer.scrollTo({ top: Math.max(nextTop, 0), behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!booth) return;
    const prefs = (booth.welcomeScreenPrefs as Record<string, unknown> | null) ?? {};
    const nextEnabled = Boolean(prefs.boothAccessPinEnabled);
    const nextPin = typeof prefs.boothAccessPin === "string" ? prefs.boothAccessPin : "";
    setPinEnabled(nextEnabled);
    setPinDigits(Array.from({ length: 6 }, (_, i) => nextPin[i] ?? ""));
    setPinActiveIndex(0);
    setPinDirty(false);
    setPinError("");
    setPinSaved(false);
  }, [booth?.id, booth?.welcomeScreenPrefs]);

  const handlePinDigitChange = useCallback((index: number, rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, "");
    if (digitsOnly.length === 0) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      setPinActiveIndex(index);
      setPinDirty(true);
      setPinSaved(false);
      setPinError("");
      return;
    }

    if (digitsOnly.length > 1) {
      let cursor = index;
      setPinDigits((prev) => {
        const next = [...prev];
        for (const char of digitsOnly) {
          if (cursor >= 6) break;
          next[cursor] = char;
          cursor += 1;
        }
        return next;
      });
      setPinDirty(true);
      setPinSaved(false);
      setPinError("");
      setTimeout(() => focusPinField(Math.min(cursor, 5)), 0);
      return;
    }

    setPinDigits((prev) => {
      const next = [...prev];
      next[index] = digitsOnly;
      return next;
    });
    setPinDirty(true);
    setPinSaved(false);
    setPinError("");
    setTimeout(() => focusPinField(index < 5 ? index + 1 : 5), 0);
  }, [focusPinField]);

  const handlePinKeyDown = useCallback((index: number, key: string) => {
    if (key === "ArrowLeft") {
      if (index > 0) setTimeout(() => focusPinField(index - 1), 0);
      return;
    }
    if (key === "ArrowRight") {
      if (index < 5) setTimeout(() => focusPinField(index + 1), 0);
      return;
    }
    if (key !== "Backspace" && key !== "Delete") return;

    if (pinDigits[index]) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      setTimeout(() => focusPinField(index), 0);
    } else if (index > 0) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
      setTimeout(() => focusPinField(index - 1), 0);
    }
    setPinDirty(true);
    setPinSaved(false);
    setPinError("");
  }, [focusPinField, pinDigits]);

  const handlePinDelete = useCallback(() => {
    const idx = pinActiveIndex;
    if (pinDigits[idx]) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[idx] = "";
        return next;
      });
      setTimeout(() => focusPinField(idx), 0);
    } else if (idx > 0) {
      setPinDigits((prev) => {
        const next = [...prev];
        next[idx - 1] = "";
        return next;
      });
      setTimeout(() => focusPinField(idx - 1), 0);
    }
    setPinDirty(true);
    setPinSaved(false);
    setPinError("");
  }, [focusPinField, pinActiveIndex, pinDigits]);

  const handleSaveAccessPin = async () => {
    const pinCode = pinDigits.join("");
    if (!booth) return;
    if (pinEnabled && !/^\d{6}$/.test(pinCode)) {
      setPinError("PIN harus 6 digit angka.");
      return;
    }

    setPinSaving(true);
    setPinError("");
    setPinSaved(false);
    try {
      const prefs = (booth.welcomeScreenPrefs as Record<string, unknown> | null) ?? {};
      const res = await fetch(`/api/dashboard/booths/${booth.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcomeScreenPrefs: {
            ...prefs,
            boothAccessPinEnabled: pinEnabled,
            boothAccessPin: pinEnabled ? pinCode : null,
          },
        }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Gagal menyimpan PIN akses.");
      await mutate();
      setPinDirty(false);
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 2000);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Gagal menyimpan PIN akses.");
    } finally {
      setPinSaving(false);
    }
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
  const paperSheetsRemainingRaw = Number((booth.welcomeScreenPrefs as Record<string, unknown> | null)?.paperSheetsRemaining ?? 0);
  const paperSheetsRemaining = Number.isFinite(paperSheetsRemainingRaw) ? Math.max(0, Math.floor(paperSheetsRemainingRaw)) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {showCreateModal && (
        <CreateBoothModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => { mutate(); setSelectedBoothId(id); setShowCreateModal(false); }}
        />
      )}

      {/* ── Booth selector + Tambah Booth ──────────────────────────────────── */}
      {booths.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {booths.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBoothId(b.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                booth?.id === b.id
                  ? "bg-primary-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-primary-400"
              }`}
            >
              {b.boothName}
            </button>
          ))}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:text-primary-700 transition-colors"
          >
            + Tambah Booth
          </button>
        </div>
      )}

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

      {/* ── Quick Scroll to Tool Categories ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lompat ke Tools</p>
          <span className="text-[11px] text-gray-400">Klik untuk scroll otomatis</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => scrollToToolsCategory("tools-akses")}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50"
          >
            Akses Booth
          </button>
          <button
            onClick={() => scrollToToolsCategory("tools-operasional")}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50"
          >
            Operasional
          </button>
          <button
            onClick={() => scrollToToolsCategory("tools-monetisasi")}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50"
          >
            Monetisasi
          </button>
          <button
            onClick={() => scrollToToolsCategory("tools-konten")}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50"
          >
            Konten & Engagement
          </button>
        </div>
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

      {/* ── Tools Categories ─────────────────────────────────────────────────── */}

      <section id="tools-akses" className="space-y-3 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Akses Booth</h2>
          <span className="text-[11px] text-gray-400">Kontrol akses link dan status</span>
        </div>
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

        {/* Akses Booth (PIN) */}
        <ToolCard title="Akses Booth (PIN 6 Digit)">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Kunci akses link booth</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Saat aktif, user harus memasukkan PIN sebelum masuk ke booth.
                </p>
              </div>
              <button
                onClick={() => { setPinEnabled((v) => !v); setPinDirty(true); setPinSaved(false); setPinError(""); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${pinEnabled ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${pinEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">PIN Akses</label>
              <div className="flex items-center justify-center gap-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { pinInputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    disabled={!pinEnabled}
                    value={pinDigits[idx] ?? ""}
                    onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" || e.key === "Delete") {
                        e.preventDefault();
                        handlePinKeyDown(idx, e.key);
                        return;
                      }
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        handlePinKeyDown(idx, e.key);
                      }
                    }}
                    onFocus={() => setPinActiveIndex(idx)}
                    className="h-11 w-10 rounded-xl border border-gray-200 text-center text-lg font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary-300 disabled:bg-gray-50 disabled:text-gray-300"
                  />
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Gunakan tepat 6 angka. Contoh: 391274</p>
            </div>

            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            {pinSaved && <p className="text-xs text-green-600">✓ PIN akses tersimpan</p>}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePinDelete}
                disabled={!pinEnabled}
                className="w-full py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold disabled:opacity-40"
              >
                Hapus
              </button>
              <button
                onClick={handleSaveAccessPin}
                disabled={pinSaving || !pinDirty}
                className="w-full py-2 rounded-xl bg-primary-900 text-white text-xs font-bold disabled:opacity-40"
              >
                {pinSaving ? "Menyimpan…" : "Simpan PIN"}
              </button>
            </div>
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

        </div>
      </section>

      <section id="tools-operasional" className="space-y-3 pt-1 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Operasional Booth</h2>
          <span className="text-[11px] text-gray-400">Harga, timer, dan pengelolaan cetak</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

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

        {/* Cetak Foto */}
        <ToolCard title="Cetak Foto">
          <div className="space-y-3">
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

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Sisa Kertas</p>
              {editPaperSheets !== null ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    step={1}
                    value={editPaperSheets}
                    onChange={(e) => setEditPaperSheets(e.target.value)}
                    className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                  <span className="text-xs text-gray-500">lembar</span>
                  <button
                    onClick={() => {
                      const parsed = Number(editPaperSheets);
                      const safe = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
                      savePaperSheetsRemaining(safe);
                      setEditPaperSheets(null);
                    }}
                    disabled={saving === "paperSheetsRemaining"}
                    className="px-3 py-1.5 rounded-lg bg-primary-900 text-white text-xs font-bold"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => setEditPaperSheets(null)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{paperSheetsRemaining} lembar</p>
                  <button
                    onClick={() => setEditPaperSheets(String(paperSheetsRemaining))}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-white"
                  >
                    Ubah
                  </button>
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-gray-400">Akan berkurang otomatis 1 setiap cetak berhasil.</p>
            </div>
          </div>
        </ToolCard>

        </div>
      </section>

      <section id="tools-monetisasi" className="space-y-3 pt-1 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Monetisasi</h2>
          <span className="text-[11px] text-gray-400">Pengaturan payment dan promo</span>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <PaymentGatewayCard />
          <PaymentMethodCard boothId={booth.id} />
          <VoucherCard boothId={booth.id} pricePerSession={booth.pricePerSession} />
        </div>
      </section>

      <section id="tools-konten" className="space-y-3 pt-1 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Konten & Engagement</h2>
          <span className="text-[11px] text-gray-400">Frame, banner, dan distribusi hasil</span>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <FrameSelectionCard boothId={booth.id} />
          <PromoBannerCard boothId={booth.id} />
          <DeliveryCard boothId={booth.id} />
          <SocialMediaCard boothId={booth.id} />
        </div>
      </section>

    </div>
  );
}

