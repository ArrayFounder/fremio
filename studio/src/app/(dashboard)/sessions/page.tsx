"use client";

import { useRef, useState } from "react";
import useSWR from "swr";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tx {
  id: string; amount: number; method: string; status: string;
  paidAt: string | null; createdAt: string;
  boothName: string; frameName: string; midtransOrderId: string | null;
}
interface TxData {
  transactions: Tx[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIDR(n: number) { return "Rp" + n.toLocaleString("id-ID"); }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, "0");
  const mo  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const yr  = d.getFullYear();
  const hh  = d.getHours().toString().padStart(2, "0");
  const mm  = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${mo} ${yr}, ${hh}:${mm}`;
}
function toYYYYMMDD(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ─── Status badge (Midtrans style) ───────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  SUCCESS:   "bg-green-500",
  PENDING:   "bg-blue-500",
  FAILED:    "bg-red-500",
  CANCELLED: "bg-red-400",
  EXPIRED:   "bg-gray-400",
};
const STATUS_BG: Record<string, string> = {
  SUCCESS:   "bg-green-50  text-green-700",
  PENDING:   "bg-blue-50   text-blue-700",
  FAILED:    "bg-red-50    text-red-600",
  CANCELLED: "bg-red-50    text-red-500",
  EXPIRED:   "bg-gray-100  text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Settlement", PENDING: "Pending",
  FAILED: "Failed", CANCELLED: "Cancelled", EXPIRED: "Expired",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BG[status] ?? "bg-gray-100 text-gray-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] ?? "bg-gray-400"}`}/>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Short method name ────────────────────────────────────────────────────────

function methodLabel(m: string) {
  const MAP: Record<string, string> = {
    QRIS: "QRIS", GOPAY: "GoPay", DANA: "DANA",
    SHOPEEPAY: "ShopeePay", BANK_TRANSFER: "Bank Transfer",
    CREDIT_CARD: "Credit Card",
  };
  return MAP[m] ?? m;
}

// ─── Preset date shortcuts ────────────────────────────────────────────────────

type Preset = "today" | "7d" | "30d" | "mtd";
function presetRange(p: Preset): [string, string] {
  const today = new Date();
  const t = toYYYYMMDD(today);
  if (p === "today") return [t, t];
  if (p === "7d")    return [toYYYYMMDD(addDays(today, -6)), t];
  if (p === "30d")   return [toYYYYMMDD(addDays(today, -29)), t];
  return [toYYYYMMDD(new Date(today.getFullYear(), today.getMonth(), 1)), t];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const today30 = toYYYYMMDD(addDays(new Date(), -29));
  const todayStr = toYYYYMMDD(new Date());

  const [from,      setFrom]      = useState(today30);
  const [to,        setTo]        = useState(todayStr);
  const [status,    setStatus]    = useState("");
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Build query
  const params = new URLSearchParams({ from, to, page: String(page), limit: "20" });
  if (status) params.set("status", status);
  const key = `/api/dashboard/transactions?${params}`;
  const { data, isLoading } = useSWR<{ success: boolean; data: TxData }>(key);

  const txs        = data?.data?.transactions ?? [];
  const pagination = data?.data?.pagination;

  // Client-side search filter on Order ID / booth name
  const filtered = search.trim()
    ? txs.filter((t) =>
        (t.midtransOrderId ?? "").toLowerCase().includes(search.toLowerCase()) ||
        t.boothName.toLowerCase().includes(search.toLowerCase())
      )
    : txs;

  // Active filter tags
  const tags: { label: string; clear: () => void }[] = [
    { label: `Date range : ${from} - ${to}`, clear: () => { setFrom(today30); setTo(todayStr); setPage(1); } },
    ...(status ? [{ label: `Status : ${STATUS_LABEL[status] ?? status}`, clear: () => { setStatus(""); setPage(1); } }] : []),
  ];

  function applyPreset(p: Preset) {
    const [f, t] = presetRange(p);
    setFrom(f); setTo(t); setPage(1); setFilterOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Transaction List</h1>
          <button
            onClick={() => {
              const rows = [
                ["Date", "Order ID", "Booth", "Frame", "Channel", "Status", "Amount"].join(","),
                ...filtered.map((t) =>
                  [fmtDate(t.paidAt ?? t.createdAt), t.midtransOrderId ?? t.id, t.boothName, t.frameName, methodLabel(t.method), STATUS_LABEL[t.status] ?? t.status, t.amount].join(",")
                ),
              ].join("\n");
              const blob = new Blob([rows], { type: "text/csv" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href = url; a.download = `transactions-${from}-${to}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3v10m0 0l-3-3m3 3l3-3M3 17h14" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export
          </button>
        </div>

        {/* ── Filter row ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Status dropdown */}
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
            >
              <option value="">Filter status</option>
              {["SUCCESS","PENDING","FAILED","CANCELLED","EXPIRED"].map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>

            {/* Search */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px] border border-gray-200 rounded-xl px-3 py-2.5 bg-white">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="9" r="6"/><path d="M15 15l3 3" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={search}
                placeholder="Cari Order ID atau nama booth..."
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm text-gray-700 outline-none placeholder:text-gray-300"
              />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-sm text-gray-600">
              <input type="date" value={from} max={to}
                onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                className="outline-none text-sm text-gray-700 w-32"/>
              <span className="text-gray-300">—</span>
              <input type="date" value={to} min={from}
                onChange={(e) => { setTo(e.target.value); setPage(1); }}
                className="outline-none text-sm text-gray-700 w-32"/>
              {from !== today30 || to !== todayStr ? (
                <button onClick={() => { setFrom(today30); setTo(todayStr); setPage(1); }}
                  className="text-gray-400 hover:text-gray-600 ml-1">✕</button>
              ) : null}
            </div>

            {/* Quick presets */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                More filter
              </button>
              {filterOpen && (
                <div className="absolute z-20 left-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
                  <p className="px-4 pt-3 pb-1 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Quick range</p>
                  {(["today","7d","30d","mtd"] as Preset[]).map((p) => {
                    const LABEL = { today:"Today", "7d":"Last 7 Days", "30d":"Last 30 Days", mtd:"This Month" };
                    return (
                      <button key={p} onClick={() => applyPreset(p)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        {LABEL[p]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Active filter tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {pagination && (
                <span className="text-sm text-gray-500">
                  Showing <span className="font-semibold text-primary-700">{pagination.total} results</span>
                </span>
              )}
              <span className="text-gray-300">|</span>
              <button onClick={() => { setFrom(today30); setTo(todayStr); setStatus(""); setSearch(""); setPage(1); }}
                className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2">
                Clear filter
              </button>
              {tags.map((tag) => (
                <span key={tag.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-600 font-medium">
                  {tag.label}
                  <button onClick={tag.clear} className="text-gray-400 hover:text-gray-700 leading-none">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["DATE & TIME","ORDER ID","BOOTH","CHANNEL","STATUS","AMOUNT","FRAME"].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({length:7}).map((_,j)=>(
                        <td key={j} className="px-5 py-4">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{width: j===1?"140px":j===0?"120px":"80px"}}/>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-gray-300 text-sm">
                      Tidak ada transaksi untuk filter ini
                    </td>
                  </tr>
                ) : filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                      {fmtDate(t.paidAt ?? t.createdAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono text-gray-700">
                        {t.midtransOrderId ? t.midtransOrderId.slice(0, 22) + "…" : t.id.slice(0, 12) + "…"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{t.boothName}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{methodLabel(t.method)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={t.status}/></td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 whitespace-nowrap">{fmtIDR(t.amount)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[160px] truncate">{t.frameName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Pagination ── */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 bg-white">
              ← Sebelumnya
            </button>
            <span className="text-sm text-gray-500 px-2">{page} / {pagination.pages}</span>
            <button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 bg-white">
              Berikutnya →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
