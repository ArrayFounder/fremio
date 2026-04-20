"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EditorSlot {
  id:           string;
  top:          number;  // 0–1 dari tinggi canvas
  left:         number;  // 0–1 dari lebar canvas
  width:        number;  // 0–1 dari lebar canvas
  height:       number;  // 0–1 dari tinggi canvas
  photoIndex:   number;
  borderRadius: number;
}

type Handle = "nw" | "ne" | "sw" | "se";
type DragState =
  | { kind: "move";   slotId: string; startX: number; startY: number; origTop: number; origLeft: number }
  | { kind: "resize"; slotId: string; handle: Handle; startX: number; startY: number; orig: EditorSlot }
  | null;

const SLOT_COLORS = ["#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#f97316","#84cc16","#e11d48"];

const CATEGORIES = [
  { value: "MINIMALIST",  label: "Minimalis" },
  { value: "AESTHETIC",   label: "Aesthetic" },
  { value: "KOREAN",      label: "Korean" },
  { value: "VINTAGE",     label: "Vintage" },
  { value: "BIRTHDAY",    label: "Ulang Tahun" },
  { value: "WEDDING",     label: "Wedding" },
  { value: "GRADUATION",  label: "Wisuda" },
  { value: "SEASONAL",    label: "Seasonal" },
  { value: "CUSTOM",      label: "Custom" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SlotCanvas
// ─────────────────────────────────────────────────────────────────────────────

function SlotCanvas({
  overlayUrl,
  slots,
  canvasW,
  canvasH,
  onSlotsChange,
}: {
  overlayUrl:    string;
  slots:         EditorSlot[];
  canvasW:       number;
  canvasH:       number;
  onSlotsChange: (s: EditorSlot[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<DragState>(null);
  const slotsRef     = useRef(slots);

  useEffect(() => { slotsRef.current = slots; }, [slots]);

  const getXY = (e: MouseEvent | React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    };
  };

  const startMove = (e: React.MouseEvent, slot: EditorSlot) => {
    e.stopPropagation(); e.preventDefault();
    const { x, y } = getXY(e);
    dragRef.current = { kind: "move", slotId: slot.id, startX: x, startY: y, origTop: slot.top, origLeft: slot.left };
  };

  const startResize = (e: React.MouseEvent, slot: EditorSlot, handle: Handle) => {
    e.stopPropagation(); e.preventDefault();
    const { x, y } = getXY(e);
    dragRef.current = { kind: "resize", slotId: slot.id, handle, startX: x, startY: y, orig: { ...slot } };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { x, y } = getXY(e);
      const current  = slotsRef.current;

      if (drag.kind === "move") {
        const dx = x - drag.startX, dy = y - drag.startY;
        onSlotsChange(current.map(s => s.id !== drag.slotId ? s : {
          ...s,
          left: Math.max(0, Math.min(1 - s.width,  drag.origLeft + dx)),
          top:  Math.max(0, Math.min(1 - s.height, drag.origTop  + dy)),
        }));
      } else {
        const dx = x - drag.startX, dy = y - drag.startY;
        const o = drag.orig;
        let { top, left, width, height } = o;
        switch (drag.handle) {
          case "nw": left = o.left + dx; top = o.top + dy; width = o.width - dx; height = o.height - dy; break;
          case "ne": top  = o.top  + dy; width = o.width + dx; height = o.height - dy; break;
          case "sw": left = o.left + dx; width = o.width - dx; height = o.height + dy; break;
          case "se": width = o.width + dx; height = o.height + dy; break;
        }
        width  = Math.max(0.04, width);
        height = Math.max(0.04, height);
        left   = Math.max(0, Math.min(1 - width,  left));
        top    = Math.max(0, Math.min(1 - height, top));
        onSlotsChange(current.map(s => s.id !== drag.slotId ? s : { ...s, top, left, width, height }));
      }
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSlot = (id: string) =>
    onSlotsChange(slots.filter(s => s.id !== id).map((s, i) => ({ ...s, photoIndex: i })));

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-checkerboard select-none"
      style={{ aspectRatio: `${canvasW} / ${canvasH}`, backgroundImage: "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px" }}
    >
      {/* Overlay frame */}
      {overlayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={overlayUrl.startsWith("https://fremio.id") ? `/api/proxy-image?url=${encodeURIComponent(overlayUrl)}` : overlayUrl}
          alt="Frame overlay"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
          crossOrigin="anonymous"
        />
      )}

      {/* Slots */}
      {slots.map((slot, idx) => {
        const color = SLOT_COLORS[idx % SLOT_COLORS.length];
        return (
          <div
            key={slot.id}
            className="absolute group cursor-move border-2 flex items-center justify-center"
            style={{
              top:             `${slot.top    * 100}%`,
              left:            `${slot.left   * 100}%`,
              width:           `${slot.width  * 100}%`,
              height:          `${slot.height * 100}%`,
              borderColor:     color,
              backgroundColor: `${color}33`,
              zIndex:          5,
              borderRadius:    slot.borderRadius,
            }}
            onMouseDown={(e) => startMove(e, slot)}
          >
            {/* Number badge */}
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black shadow-md pointer-events-none"
              style={{ backgroundColor: color }}
            >
              {idx + 1}
            </span>

            {/* Delete button */}
            <button
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs
                         hidden group-hover:flex items-center justify-center z-20 leading-none"
              onClick={(e) => { e.stopPropagation(); deleteSlot(slot.id); }}
            >
              ×
            </button>

            {/* Resize handles */}
            {(["nw","ne","sw","se"] as Handle[]).map((h) => (
              <div
                key={h}
                className="absolute w-3.5 h-3.5 rounded-full border-2 border-white z-20"
                style={{
                  backgroundColor: color,
                  cursor:          `${h}-resize`,
                  top:    h.startsWith("n") ? -5  : undefined,
                  bottom: h.startsWith("s") ? -5  : undefined,
                  left:   h.endsWith("w")   ? -5  : undefined,
                  right:  h.endsWith("e")   ? -5  : undefined,
                }}
                onMouseDown={(e) => startResize(e, slot, h)}
              />
            ))}
          </div>
        );
      })}

      {/* Empty state */}
      {slots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="text-center text-gray-400 bg-white/80 rounded-xl px-6 py-4">
            <div className="text-3xl mb-1">📐</div>
            <p className="text-sm font-medium">Klik "+ Tambah Area Foto"<br/>untuk menentukan posisi foto</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FrameEditorPage
// ─────────────────────────────────────────────────────────────────────────────

export default function FrameEditorPage() {
  const router = useRouter();

  const [name,       setName]       = useState("");
  const [category,   setCategory]   = useState("MINIMALIST");
  const [isPremium,  setIsPremium]  = useState(false);
  const [overlayUrl, setOverlayUrl] = useState("");
  const [inputUrl,   setInputUrl]   = useState("");
  const [canvasW,    setCanvasW]    = useState(1080);
  const [canvasH,    setCanvasH]    = useState(1920);
  const [slots,      setSlots]      = useState<EditorSlot[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleSlotsChange = useCallback((s: EditorSlot[]) => setSlots(s), []);

  const addSlot = () => {
    const idx = slots.length;
    const offset = idx * 0.03;
    setSlots([...slots, {
      id:           `slot_${Date.now()}`,
      top:          Math.min(0.05 + offset, 0.6),
      left:         Math.min(0.05 + offset, 0.5),
      width:        0.4,
      height:       0.3,
      photoIndex:   idx,
      borderRadius: 0,
    }]);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError("Nama frame wajib diisi"); return; }
    if (!overlayUrl.trim()) { setError("URL overlay PNG wajib diisi"); return; }
    if (slots.length === 0) { setError("Minimal 1 area foto harus ditambahkan"); return; }

    setSaving(true);
    try {
      const res  = await fetch("/api/dashboard/frames", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:         name.trim(),
          category,
          thumbnailUrl: overlayUrl.trim(),
          assetUrl:     overlayUrl.trim(),
          aspectRatio:  `${canvasW}:${canvasH}`,
          canvasWidth:  canvasW,
          canvasHeight: canvasH,
          isPremium,
          maxCaptures:  slots.length,
          slots:        slots.map(({ id: _id, ...rest }) => rest),
          sortOrder:    0,
        }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        router.push("/frames");
      } else {
        setError(json.error ?? "Gagal menyimpan frame");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-50">
      <div className="max-w-7xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/frames")}
            className="text-primary-700 hover:text-primary-900 text-sm font-medium flex items-center gap-1"
          >
            ← Kembali
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary-900">Buat Frame Baru</h1>
            <p className="text-sm text-gray-500">Upload overlay PNG lalu tentukan area foto</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── Left panel: Settings ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4 sticky top-6">

            {/* Nama */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nama Frame *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Contoh: Birthday Pastel Strip"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                           focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none"
              />
            </div>

            {/* Kategori */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Kategori</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                           focus:ring-2 focus:ring-primary-400 outline-none"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* URL Overlay */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Overlay PNG *</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="https://example.com/frame.png"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:ring-2 focus:ring-primary-400 outline-none"
                />
                <button
                  onClick={() => { setOverlayUrl(inputUrl); }}
                  className="px-3 py-2 bg-primary-100 text-primary-800 rounded-xl text-sm
                             font-semibold hover:bg-primary-200 whitespace-nowrap"
                >
                  Load
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">File PNG transparan. Bisa dari fremio.id/uploads/overlays/...</p>
            </div>

            {/* Canvas size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Lebar (px)</label>
                <input
                  type="number"
                  value={canvasW}
                  onChange={e => setCanvasW(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tinggi (px)</label>
                <input
                  type="number"
                  value={canvasH}
                  onChange={e => setCanvasH(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => { setCanvasW(1080); setCanvasH(1920); }} className="px-2 py-1 bg-gray-100 rounded-lg hover:bg-gray-200">9:16 Portrait</button>
              <button onClick={() => { setCanvasW(1920); setCanvasH(1080); }} className="px-2 py-1 bg-gray-100 rounded-lg hover:bg-gray-200">16:9 Landscape</button>
              <button onClick={() => { setCanvasW(1080); setCanvasH(1080); }} className="px-2 py-1 bg-gray-100 rounded-lg hover:bg-gray-200">1:1 Square</button>
            </div>

            {/* Premium */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPremium}
                onChange={e => setIsPremium(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">Frame Premium</span>
            </label>

            {/* Slots */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-semibold text-gray-700">Area Foto</span>
                  <span className="ml-2 text-xs bg-primary-100 text-primary-800 rounded-full px-2 py-0.5 font-bold">
                    {slots.length} foto
                  </span>
                </div>
                <button
                  onClick={addSlot}
                  className="px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-bold
                             hover:bg-primary-900 active:scale-95 transition-transform"
                >
                  + Tambah Area
                </button>
              </div>

              {slots.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 text-center">
                  Belum ada area foto. Klik "+ Tambah Area" lalu seret dan resize di canvas.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {slots.map((slot, idx) => (
                    <div key={slot.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                        style={{ backgroundColor: SLOT_COLORS[idx % SLOT_COLORS.length] }}
                      >
                        {idx + 1}
                      </div>
                      <span className="text-xs text-gray-500 flex-1 font-mono">
                        {(slot.left*100).toFixed(0)},{(slot.top*100).toFixed(0)} · {(slot.width*100).toFixed(0)}×{(slot.height*100).toFixed(0)}%
                      </span>
                      <button
                        onClick={() => setSlots(slots.filter(s => s.id !== slot.id).map((s, i) => ({ ...s, photoIndex: i })))}
                        className="text-red-400 hover:text-red-600 text-base leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 bg-primary-900 text-white rounded-xl font-black text-sm
                         hover:bg-primary-800 active:scale-95 transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Menyimpan…
                </span>
              ) : "💾 Simpan Frame"}
            </button>
          </div>

          {/* ── Right panel: Canvas editor ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Canvas Editor</h2>
              <p className="text-xs text-gray-400">
                Seret area untuk pindahkan · Tarik sudut untuk resize · Hover → × untuk hapus
              </p>
            </div>

            <div className="max-w-sm mx-auto lg:max-w-none">
              {overlayUrl ? (
                <SlotCanvas
                  overlayUrl={overlayUrl}
                  slots={slots}
                  canvasW={canvasW}
                  canvasH={canvasH}
                  onSlotsChange={handleSlotsChange}
                />
              ) : (
                <div
                  className="w-full max-w-sm mx-auto bg-gray-50 border-2 border-dashed border-gray-200
                             rounded-xl flex items-center justify-center"
                  style={{ aspectRatio: `${canvasW} / ${canvasH}` }}
                >
                  <div className="text-center text-gray-400 p-6">
                    <div className="text-5xl mb-3">🖼️</div>
                    <p className="text-sm font-medium text-gray-600">Masukkan URL overlay PNG</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Bisa dari fremio.id atau URL lain yang berisi PNG transparan
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-800 font-semibold mb-1">💡 Tips</p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                <li>• Area foto berwarna = posisi tempat foto customer akan dimasukkan</li>
                <li>• Urutan nomor = urutan foto yang diambil (foto 1 masuk ke area 1, dst.)</li>
                <li>• Overlay frame PNG akan ditampilkan DI ATAS foto saat compositing</li>
                <li>• Frame dari fremio.id bisa dipakai langsung — salin URL overlay-nya</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
