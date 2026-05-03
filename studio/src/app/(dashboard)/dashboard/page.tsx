"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  sessionsToday: number; sessionsTotal: number;
  revenueToday: number;  revenueTotal: number;
  activeBooths: number;
  recentSessions: { id: string; boothName: string; frameName: string; completedAt: string; photoUrl: string | null }[];
  popularFrames: { frameId: string; count: number; name: string; thumbnailUrl: string }[];
  boothBreakdown: { id: string; boothName: string; revenue: number; sessions: number }[];
}

interface AnalyticsData {
  series: { date: string; [method: string]: number | string }[];
  methods: string[];
  totalVolume: number;
  totalCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIDR(n: number) { return "Rp " + n.toLocaleString("id-ID"); }
function fmtIDRShort(n: number) {
  if (n >= 1_000_000) return "Rp " + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "jt";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
  return String(n);
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
function toYYYYMMDD(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function shortDate(iso: string) { const [, m, dd] = iso.split("-"); return `${dd}/${m}`; }

// ─── Chart colours ────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  QRIS: "#e0b7a9", GOPAY: "#f5c030", BANK_TRANSFER: "#8f5040",
  DANA: "#cc9580", SHOPEEPAY: "#c07055", CREDIT_CARD: "#4a302b", OTHER: "#d1c5be",
};
function colorFor(m: string, i: number) {
  return METHOD_COLORS[m] ?? ["#e0b7a9","#f5c030","#c07055","#8f5040","#cc9580","#4a302b"][i % 6];
}

// ─── Preset ranges ────────────────────────────────────────────────────────────

type Preset = "today" | "7d" | "30d" | "mtd";
function presetRange(p: Preset): [string, string] {
  const today = new Date();
  const t = toYYYYMMDD(today);
  if (p === "today") return [t, t];
  if (p === "7d")    return [toYYYYMMDD(addDays(today, -6)), t];
  if (p === "30d")   return [toYYYYMMDD(addDays(today, -29)), t];
  return [toYYYYMMDD(new Date(today.getFullYear(), today.getMonth(), 1)), t];
}
const PRESET_LABELS: Record<Preset, string> = {
  today: "Today", "7d": "Last 7 Days", "30d": "Last 30 Days", mtd: "This Month",
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4 text-xs">
          <span style={{ color: p.color }} className="font-medium">{p.dataKey}</span>
          <span className="text-gray-600">{fmtIDRShort(p.value ?? 0)}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-2 pt-1 flex justify-between text-xs font-semibold text-gray-700">
        <span>Total</span><span>{fmtIDRShort(total)}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [preset, setPreset]  = useState<Preset>("7d");
  const [dropOpen, setDropOpen] = useState(false);
  const [from, to] = useMemo(() => presetRange(preset), [preset]);

  const { data: ov, isLoading: ovLoading } = useSWR<{ success: boolean; data: OverviewData }>(
    "/api/dashboard/overview", { refreshInterval: 60_000 }
  );
  const { data: an, isLoading: anLoading } = useSWR<{ success: boolean; data: AnalyticsData }>(
    `/api/dashboard/analytics?from=${from}&to=${to}`, { refreshInterval: 60_000 }
  );

  const d   = ov?.data;
  const an_ = an?.data;

  const rangeLabel = useMemo(() => {
    const fmt = (s: string) => {
      const [y, m, dd] = s.split("-");
      const mo = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][Number(m)-1];
      return `${Number(dd)} ${mo} ${y}`;
    };
    return from === to ? fmt(from) : `${fmt(from)} - ${fmt(to)}`;
  }, [from, to]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {!ovLoading && d && d.activeBooths === 0 && (
          <div className="rounded-2xl bg-primary-900 text-white p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="text-3xl shrink-0">📖</div>
            <div className="flex-1">
              <p className="font-bold">Mulai dari sini!</p>
              <p className="text-white/60 text-sm mt-0.5">Belum ada booth aktif. Ikuti panduan setup untuk mengkonfigurasi fotobox kamu.</p>
            </div>
<<<<<<< HEAD
            <Link href="/setup" className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm text-primary-900 whitespace-nowrap" style={{ backgroundColor: "#d4a017" }}>
              Lihat Panduan →
=======
            <Link href="/booths" className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm text-primary-900 whitespace-nowrap" style={{ backgroundColor: "#d4a017" }}>
              Buka Booth →
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
            </Link>
          </div>
        )}

        {/* ── Summary ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-700">Summary</h2>
          </div>
          <div className="px-6 py-5 flex flex-wrap gap-8">
            {ovLoading ? (
              <><div className="h-14 w-44 bg-gray-100 rounded-xl animate-pulse"/><div className="h-14 w-32 bg-gray-100 rounded-xl animate-pulse"/></>
            ) : d ? (
              <>
                <div className="pr-8 border-r border-gray-100">
                  <p className="text-3xl font-black text-gray-900">{fmtIDR(an_?.totalVolume ?? d.revenueTotal)}</p>
                  <p className="text-xs font-semibold text-blue-500 mt-0.5">Total Volume</p>
                  <p className="text-[11px] text-gray-400 italic">Month to Date</p>
                </div>
                <div>
                  <p className="text-3xl font-black text-gray-900">{an_?.totalCount ?? d.sessionsTotal}</p>
                  <p className="text-xs font-semibold text-gray-500 mt-0.5">Total Transaction</p>
                  <p className="text-[11px] text-gray-400 italic">Month to Date</p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Transaction Volume Chart ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-gray-700">Transaction Volume</h2>
            <div className="relative">
              <button
                onClick={() => setDropOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <span className="text-gray-400">📅</span>
                <span>{rangeLabel}</span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${dropOpen ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {dropOpen && (
                <div className="absolute z-20 right-0 top-full mt-1 bg-gray-800 text-white rounded-xl shadow-xl overflow-hidden min-w-[165px]">
                  <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Show stats for:</p>
                  {(["today","7d","30d","mtd"] as Preset[]).map((p) => (
                    <button key={p} onClick={() => { setPreset(p); setDropOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-700 ${preset === p ? "font-bold text-white" : "text-gray-300"}`}>
                      {PRESET_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="px-2 py-5">
            {anLoading ? (
              <div className="h-72 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin"/>
              </div>
            ) : !an_?.series?.length ? (
              <div className="h-72 flex items-center justify-center text-gray-300 text-sm">Belum ada data transaksi</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={an_.series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    {an_.methods.map((m, i) => (
                      <linearGradient key={m} id={`grad-${m}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={colorFor(m,i)} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={colorFor(m,i)} stopOpacity={0.0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false}/>
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={fmtIDRShort} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={56}/>
                  <Tooltip content={<ChartTooltip />}/>
                  <Legend formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16 }}/>
                  {an_.methods.map((m, i) => (
                    <Area key={m} type="monotone" dataKey={m}
                      stroke={colorFor(m,i)} strokeWidth={2.5}
                      fill={`url(#grad-${m})`}
                      dot={{ r: 4, fill: colorFor(m,i), stroke: "white", strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Pendapatan per Cabang ────────────────────────────────────────── */}
        {!ovLoading && d && d.boothBreakdown && d.boothBreakdown.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-700">Pendapatan per Cabang</h2>
              <a href="/sessions" className="text-xs text-primary-600 hover:underline">Lihat transaksi →</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider">Booth / Lokasi</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Pendapatan</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sesi Selesai</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-wider">Avg/Sesi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {d.boothBreakdown.map((b, i) => {
                    const maxRevenue = d.boothBreakdown[0]?.revenue ?? 1;
                    const pct = maxRevenue > 0 ? Math.round((b.revenue / maxRevenue) * 100) : 0;
                    const avg = b.sessions > 0 ? Math.round(b.revenue / b.sessions) : 0;
                    return (
                      <tr key={b.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-gray-300 w-4 text-center">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{b.boothName}</p>
                              <div className="mt-1 h-1.5 w-full max-w-[140px] rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full rounded-full bg-primary-400" style={{ width: `${pct}%` }}/>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm font-bold text-gray-900 whitespace-nowrap">{fmtIDR(b.revenue)}</td>
                        <td className="px-5 py-3.5 text-right text-sm text-gray-600">{b.sessions.toLocaleString("id-ID")}</td>
                        <td className="px-5 py-3.5 text-right text-sm text-gray-500 whitespace-nowrap">{b.sessions > 0 ? fmtIDR(avg) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Recent + Popular ─────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-800">Sesi Terbaru</h2>
              <Link href="/sessions" className="text-xs text-primary-600 hover:underline">Lihat semua</Link>
            </div>
            {ovLoading ? (
              <div className="p-5 space-y-3">{Array.from({length:3}).map((_,i)=><div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse"/>)}</div>
            ) : !d?.recentSessions.length ? (
              <p className="px-5 py-8 text-center text-gray-300 text-sm">Belum ada sesi</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {d.recentSessions.map((s)=>(
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    {s.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.photoUrl} alt="" className="h-10 w-7 object-cover rounded-lg shrink-0"/>
                      : <div className="h-10 w-7 bg-gray-100 rounded-lg shrink-0"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.boothName}</p>
                      <p className="text-xs text-gray-400 truncate">{s.frameName} · {s.completedAt ? fmtDate(s.completedAt) : "—"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-800">Frame Terpopuler</h2>
              <Link href="/frames" className="text-xs text-primary-600 hover:underline">Kelola frame</Link>
            </div>
            {ovLoading ? (
              <div className="p-5 space-y-3">{Array.from({length:3}).map((_,i)=><div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse"/>)}</div>
            ) : !d?.popularFrames.length ? (
              <p className="px-5 py-8 text-center text-gray-300 text-sm">Belum ada data frame</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {d.popularFrames.map((f,i)=>(
                  <li key={f.frameId} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-sm font-black text-gray-300 w-5 text-center">{i+1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.thumbnailUrl} alt="" className="h-10 w-7 object-cover rounded-lg shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                      <p className="text-xs text-gray-400">{f.count}× dipakai</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
