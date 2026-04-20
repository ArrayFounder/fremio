"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import useSWR, { mutate as globalMutate } from "swr";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Frame {
  id: string; name: string; category: string; thumbnailUrl: string;
  assetUrl: string; isPremium: boolean; aspectRatio: string;
  designerId?: string | null; captureMode?: string | null;
}
interface Booth { id: string; boothName: string; allowedFrameIds: string[] }
interface FrameApiData { frames: Frame[]; allowedFrameIds: string[] }

interface FremioFrame {
  fremioId: string; studioId: string; name: string;
  category: string; fremioCategory: string;
  thumbnailUrl: string; assetUrl: string; overlayUrl: string | null;
  aspectRatio: string; canvasWidth: number; canvasHeight: number;
  maxCaptures: number; isPremium: boolean; alreadyImported: boolean;
  isDeactivated: boolean;
  slots: unknown[] | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  AESTHETIC: "Aesthetic", KOREAN: "Korean", VINTAGE: "Vintage",
  MINIMALIST: "Minimalis", BIRTHDAY: "Ulang Tahun", WEDDING: "Wedding",
  GRADUATION: "Wisuda", SEASONAL: "Seasonal", CUSTOM: "Custom",
};

const CATEGORIES = ["AESTHETIC","KOREAN","VINTAGE","MINIMALIST","BIRTHDAY","WEDDING","GRADUATION","SEASONAL","CUSTOM"] as const;

// ─── Import dari Fremio.id Modal ─────────────────────────────────────────────

const FREMIO_CATEGORY_LABEL: Record<string, string> = {
  AESTHETIC: "Aesthetic", KOREAN: "Korean", VINTAGE: "Vintage",
  MINIMALIST: "Minimalis", BIRTHDAY: "Ulang Tahun", WEDDING: "Wedding",
  GRADUATION: "Wisuda", SEASONAL: "Seasonal", CUSTOM: "Custom",
};

function ImportFremioModal({ onClose, onImported, boothId }: { onClose: () => void; onImported: () => void; boothId?: string }) {
  const [frames, setFrames]         = useState<FremioFrame[] | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [filterCat, setFilterCat]   = useState("ALL");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState<{ imported: number; failed: number } | null>(null);

  // Fetch frames on mount
  useEffect(() => {
    fetch(`/api/dashboard/frames/import-preview${boothId ? `?boothId=${encodeURIComponent(boothId)}` : ""}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) { setFrames(json.data); }
        else { setError(json.error ?? "Gagal"); }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const allCats = frames ? ["ALL", ...Array.from(new Set(frames.map((f) => f.category)))] : ["ALL"];

  const visible = (frames ?? []).filter((f) => {
    if (filterCat !== "ALL" && f.category !== filterCat) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.fremioCategory.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(visible.filter((f) => !f.alreadyImported).map((f) => f.fremioId)));
  const clearAll  = () => setSelected(new Set());

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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import Frame dari Fremio.id</h2>
            {frames && <p className="text-xs text-gray-400 mt-0.5">{frames.length} frame 4R tersedia · {frames.filter((f) => f.alreadyImported).length} sudah aktif{frames.filter((f) => f.isDeactivated).length > 0 ? ` · ${frames.filter((f) => f.isDeactivated).length} nonaktif` : ""}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Controls */}
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
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors
                    ${filterCat === cat ? "bg-primary-100 text-primary-900" : "bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-300"}`}>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="aspect-[9/16] bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="text-red-500 text-sm text-center py-8">{error}</p>
          ) : result ? (
            <div className="text-center py-12">
              <p className="text-5xl mb-3">✅</p>
              <p className="text-xl font-bold text-gray-900">{result.imported} frame berhasil diimport!</p>
              {result.failed > 0 && <p className="text-sm text-red-500 mt-1">{result.failed} gagal</p>}
              <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800">
                Tutup
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {visible.map((f) => {
                const isSel = selected.has(f.fremioId);
                return (
                  <div
                    key={f.fremioId}
                    onClick={() => !f.alreadyImported && toggleSelect(f.fremioId)}
                    className={[
                      "relative rounded-xl border overflow-hidden transition-all",
                      f.alreadyImported
                        ? "opacity-50 cursor-default border-gray-100"
                        : isSel
                          ? "cursor-pointer border-primary-700 ring-2 ring-primary-700/30"
                          : "cursor-pointer border-gray-100 hover:border-primary-400",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.thumbnailUrl} alt={f.name} className="w-full aspect-[9/16] object-cover" loading="lazy" />
                    {isSel && !f.alreadyImported && (
                      <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-primary-900 flex items-center justify-center text-white text-xs font-bold">✓</div>
                    )}
                    {f.alreadyImported && (
                      <div className="absolute top-1.5 right-1.5 h-6 px-1.5 rounded-full bg-green-500 flex items-center text-white text-[10px] font-bold">✓ Ada</div>
                    )}
                    {f.isDeactivated && !isSel && (
                      <div className="absolute top-1.5 right-1.5 h-6 px-1.5 rounded-full bg-yellow-400 flex items-center text-white text-[10px] font-bold">Nonaktif</div>
                    )}
                    {f.isPremium && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-accent-500 text-white">Pro</span>
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

        {/* Footer */}
        {!result && !loading && (
          <div className="px-6 py-4 border-t flex-shrink-0 flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400">✓ Ada = sudah dipakai · <span className="text-yellow-500">Nonaktif</span> = bisa diaktifkan kembali</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Batal</button>
              <button onClick={handleImport} disabled={selected.size === 0 || importing}
                className="px-5 py-2 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 disabled:opacity-50">
                {importing ? "Mengimport…" : `Import ${selected.size} Frame`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Frame Modal ──────────────────────────────────────────────────────────

function AddFrameModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "", category: "AESTHETIC", thumbnailUrl: "", assetUrl: "",
    aspectRatio: "2:3", canvasWidth: 1200, canvasHeight: 1800,
    isPremium: false, sortOrder: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, canvasWidth: Number(form.canvasWidth), canvasHeight: Number(form.canvasHeight), sortOrder: Number(form.sortOrder) }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Gagal"); setLoading(false); return; }
      onCreated();
      onClose();
    } catch {
      setError("Network error");
    }
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
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
              placeholder="Cth: Aesthetic White Border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Thumbnail *</label>
            <input required type="url" value={form.thumbnailUrl} onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
              placeholder="https://..." />
            <p className="text-xs text-gray-400 mt-1">Preview kecil frame (JPG/PNG)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL Asset (Overlay PNG) *</label>
            <input required type="url" value={form.assetUrl} onChange={e => setForm(f => ({ ...f, assetUrl: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
              placeholder="https://..." />
            <p className="text-xs text-gray-400 mt-1">PNG transparan yang ditampilkan di atas foto</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rasio</label>
              <input value={form.aspectRatio} onChange={e => setForm(f => ({ ...f, aspectRatio: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
                placeholder="2:3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lebar (px)</label>
              <input type="number" value={form.canvasWidth} onChange={e => setForm(f => ({ ...f, canvasWidth: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tinggi (px)</label>
              <input type="number" value={form.canvasHeight} onChange={e => setForm(f => ({ ...f, canvasHeight: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isPremium} onChange={e => setForm(f => ({ ...f, isPremium: e.target.checked }))}
                className="h-4 w-4 rounded text-primary-900" />
              <span className="text-sm font-medium text-gray-700">Frame Premium</span>
            </label>
            <div className="flex-1 text-right">
              <label className="text-sm font-medium text-gray-700 mr-2">Urutan</label>
              <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                className="w-20 border border-gray-300 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 disabled:opacity-60">
              {loading ? "Menyimpan…" : "Tambah Frame"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Frame Card ───────────────────────────────────────────────────────────────

function FrameCard({
  frame, enabled, onToggle, onDelete, onCaptureModeChange, currentUserId,
}: { frame: Frame; enabled: boolean; onToggle: () => void; onDelete: () => void; onCaptureModeChange: (mode: "single" | "duplicate") => void; currentUserId?: string }) {
  const isOwned = frame.designerId === currentUserId;
  const isDuplicate = frame.captureMode === "duplicate";
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden cursor-pointer transition-all group relative
      ${enabled ? "border-primary-900 ring-2 ring-primary-900/20" : "border-gray-100 hover:border-gray-300"}`}
      onClick={onToggle}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.thumbnailUrl} alt={frame.name} className="w-full aspect-[2/3] object-cover" loading="lazy" />
        {enabled ? (
          /* Tombol hapus dari pilihan — selalu terlihat saat frame aktif */
          <button
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary-900 flex items-center justify-center text-white text-sm font-bold shadow hover:bg-red-500 transition-colors"
            onClick={e => { e.stopPropagation(); onToggle(); }}
            title="Keluarkan dari booth"
          >✓</button>
        ) : (
          <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/80 hidden group-hover:flex items-center justify-center text-gray-400 text-sm border border-gray-200">+</div>
        )}
        {frame.isPremium && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold bg-accent-500 text-white">Pro</span>
        )}
        {isOwned && (
          <button
            className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-red-500 text-white text-xs hidden group-hover:flex items-center justify-center shadow hover:bg-red-600"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Hapus frame dari library"
          >✕</button>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-800 truncate">{frame.name}</p>
        <p className="text-xs text-gray-400">{CATEGORY_LABEL[frame.category] ?? frame.category}</p>
        {/* Toggle duplicate mode */}
        <button
          className={`mt-2 w-full text-xs py-1 rounded-lg font-semibold border transition-colors ${
            isDuplicate
              ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
              : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"
          }`}
          onClick={e => { e.stopPropagation(); onCaptureModeChange(isDuplicate ? "single" : "duplicate"); }}
          title={isDuplicate ? "Mode Duplikat aktif — klik untuk nonaktifkan" : "Aktifkan Mode Duplikat"}
        >
          {isDuplicate ? "🔄 Duplikat" : "○ Single"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FramesPage() {
  const { data: boothData } = useSWR<{ success: boolean; data: Booth[] }>("/api/dashboard/booths");
  const { data: session }   = useSession();
  const booths = boothData?.data ?? [];

  const [selectedBooth, setSelectedBooth] = useState<string>("");
  const [filterCat, setFilterCat]         = useState<string>("ALL");
  const [saving, setSaving]               = useState(false);
  const [showAdd, setShowAdd]             = useState(false);
  const [showImport, setShowImport]       = useState(false);

  const boothId = selectedBooth || booths[0]?.id;

  const { data: frameData, isLoading, mutate } = useSWR<{ success: boolean; data: FrameApiData }>(
    boothId ? `/api/dashboard/frames?boothId=${boothId}` : "/api/dashboard/frames"
  );

  const frames         = frameData?.data?.frames ?? [];
  // allowedFrameIds: [] means ALL frames enabled; otherwise only listed IDs
  const rawAllowed     = frameData?.data?.allowedFrameIds ?? [];
  const [localAllowed, setLocalAllowed] = useState<string[] | null>(null);
  const allowed        = localAllowed ?? rawAllowed;
  const allEnabled     = allowed.length === 0;

  const isEnabled = (id: string) => allEnabled || allowed.includes(id);

  const toggleFrame = (id: string) => {
    if (!boothId) return;
    setLocalAllowed((prev) => {
      const base = prev ?? rawAllowed;
      // Jika semua aktif (base kosong), mulai dari semua ID dikurangi yang ditoggle
      const effective = base.length === 0 ? frames.map((f) => f.id) : [...base];
      const has = effective.includes(id);
      const next = has ? effective.filter((x) => x !== id) : [...effective, id];
      // Jika semua terpilih, simpan sebagai kosong (= semua)
      return next.length === frames.length ? [] : next;
    });
  };

  const handleSave = async () => {
    if (!boothId || localAllowed === null) return;
    setSaving(true);
    await fetch(`/api/dashboard/booths/${boothId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedFrameIds: localAllowed }),
    });
    setSaving(false);
    setLocalAllowed(null);
    mutate();
    globalMutate(`/api/dashboard/frames?boothId=${boothId}`);
  };

  const handleDelete = async (frameId: string) => {
    if (!confirm("Hapus frame ini?")) return;
    await fetch(`/api/dashboard/frames/${frameId}`, { method: "DELETE" });
    mutate();
  };

  const handleCaptureModeChange = async (frameId: string, mode: "single" | "duplicate") => {
    await fetch(`/api/dashboard/frames/${frameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captureMode: mode }),
    });
    mutate();
  };

  const categories = ["ALL", ...Array.from(new Set(frames.map((f) => f.category)))];
  const filtered   = (filterCat === "ALL" ? frames : frames.filter((f) => f.category === filterCat))
    .filter((f) => isEnabled(f.id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {showImport && (
        <ImportFremioModal
          onClose={() => setShowImport(false)}
          onImported={() => { mutate(); globalMutate("/api/dashboard/frames"); }}
          boothId={boothId}
        />
      )}
      {showAdd && (
        <AddFrameModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { mutate(); globalMutate("/api/dashboard/frames"); }}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Frame Library</h1>
          <p className="text-gray-400 text-sm mt-1">Pilih frame yang tampil di setiap booth</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setShowImport(true)}
            className="px-4 py-2.5 rounded-xl bg-primary-100 text-primary-900 text-sm font-bold hover:bg-primary-200 border border-primary-200">
            🌐 Import dari Fremio.id
          </button>
          <a href="/frames/editor"
            className="px-4 py-2.5 rounded-xl bg-purple-100 text-purple-900 text-sm font-bold hover:bg-purple-200 border border-purple-200">
            ✏️ Buat Frame Sendiri
          </a>
          <button onClick={() => setShowAdd(true)}
            className="px-5 py-2.5 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-amber-600 shadow">
            + Tambah Frame
          </button>
          {localAllowed !== null && (
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-primary-900 text-white text-sm font-bold hover:bg-primary-800 disabled:opacity-60">
              {saving ? "Menyimpan…" : "💾 Simpan Perubahan"}
            </button>
          )}
        </div>
      </div>

      {/* Pilih booth */}
      {booths.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {booths.map((b) => (
            <button key={b.id} onClick={() => { setSelectedBooth(b.id); setLocalAllowed(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors
                ${(boothId === b.id) ? "bg-primary-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary-400"}`}>
              {b.boothName}
            </button>
          ))}
        </div>
      )}

      {/* Filter kategori */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${filterCat === cat ? "bg-primary-100 text-primary-800" : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"}`}>
            {cat === "ALL" ? "Semua" : CATEGORY_LABEL[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Info */}
      {!isLoading && boothId && (
        <p className="text-xs text-gray-400">
          Menampilkan {filtered.length} frame aktif.
          {" "}Klik ✓ untuk menonaktifkan · Import atau tambah frame baru untuk menambah pilihan.
        </p>
      )}

      {/* Grid frame */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">🖼️</p>
          <p className="text-gray-500 font-semibold mb-1">Belum ada frame aktif.</p>
          <p className="text-gray-400 text-sm">Import frame dari Fremio.id atau tambah frame baru.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filtered.map((frame) => (
            <FrameCard key={frame.id} frame={frame} enabled={isEnabled(frame.id)}
              onToggle={() => toggleFrame(frame.id)}
              onDelete={() => handleDelete(frame.id)}
              onCaptureModeChange={(mode) => handleCaptureModeChange(frame.id, mode)}
              currentUserId={session?.user?.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
