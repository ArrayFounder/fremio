import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, ChevronDown, Lock, Unlock } from "lucide-react";
import ColorPicker from "./ColorPicker.jsx";
import { EDITOR_FONT_FAMILIES } from "../../config/editorFonts.js";
import "./PropertiesPanel.css";

const panelVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const Section = ({ title, children }) => (
  <div className="space-y-5 rounded-[24px] border border-[#e0b7a9]/15 bg-gradient-to-br from-white via-white/95 to-[#fdf7f4]/40 p-6 shadow-[0_8px_24px_rgba(224,183,169,0.1),0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-sm">
    <h4 className="bg-gradient-to-r from-[#e0b7a9] to-[#c89585] bg-clip-text text-sm font-bold uppercase tracking-wider text-transparent">
      {title}
    </h4>
    <div className="space-y-4 text-sm text-slate-600">{children}</div>
  </div>
);

const CollapsibleSection = ({ title, children, isOpen, onToggle }) => {
  return (
    <div 
      style={{
        width: '100%',
        display: 'block',
        boxSizing: 'border-box',
        borderRadius: '16px',
        background: 'linear-gradient(to bottom right, #ffffff, #fefcfb, rgba(253, 247, 244, 0.8))',
        boxShadow: isOpen 
          ? '0 4px 20px rgba(224, 183, 169, 0.18)' 
          : '0 2px 12px rgba(224, 183, 169, 0.1)',
        overflow: 'hidden',
        transition: 'all 0.3s ease-out',
        border: isOpen ? '1px solid rgba(224, 183, 169, 0.25)' : '1px solid rgba(224, 183, 169, 0.08)'
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: isOpen 
            ? 'linear-gradient(to right, rgba(253, 247, 244, 0.6), rgba(247, 235, 229, 0.4))' 
            : 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.3s ease-out'
        }}
      >
        <h4 style={{
          fontSize: '14px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: isOpen ? '#c89585' : '#5a3d38',
          margin: 0,
          transition: 'color 0.3s ease'
        }}>
          {title}
        </h4>
        <motion.div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: isOpen ? 'rgba(224, 183, 169, 0.2)' : 'rgba(224, 183, 169, 0.1)',
            transition: 'background 0.3s ease'
          }}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronDown 
            size={16} 
            style={{ color: isOpen ? '#c89585' : '#d4a99a' }}
            strokeWidth={2.5} 
          />
        </motion.div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ 
              duration: 0.25, 
              ease: [0.4, 0, 0.2, 1],
              opacity: { duration: 0.2 }
            }}
            style={{ width: '100%', overflow: 'hidden' }}
          >
            <div style={{ 
              width: '100%', 
              padding: '4px 18px 18px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontSize: '14px',
              color: '#64748b'
            }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InputRow = ({ label, children }) => (
  <label className="flex w-full flex-col gap-3 text-xs font-bold text-slate-500">
    <span className="uppercase tracking-[0.2em] text-[#e0b7a9]">{label}</span>
    {children}
  </label>
);

export default function PropertiesPanel({
  selectedElement,
  canvasBackground,
  onBackgroundChange,
  onUpdateElement,
  onDeleteElement,
  clearSelection,
  onSelectBackgroundPhoto = () => {},
  onFitBackgroundPhoto = () => {},
  backgroundPhoto = null,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  canvasAspectRatio,
  onCanvasAspectRatioChange,
  showCanvasSizeMode = false,
  isBackgroundLocked = false,
  onToggleBackgroundLock = () => {},
  gradientColor1 = '#667eea',
  gradientColor2 = '#764ba2',
  setGradientColor1 = () => {},
  setGradientColor2 = () => {},
  pendingPhotoTool = false,
  onConfirmAddPhoto = () => {},
  onCancelPhotoTool = () => {},
}) {
  // Local state for dimension inputs
  const [localWidth, setLocalWidth] = useState("");
  const [localHeight, setLocalHeight] = useState("");
  
  // State to control which dropdown is open (only one at a time)
  const [openDropdown, setOpenDropdown] = useState(null);

  // Update local state when selectedElement changes
  useEffect(() => {
    if (selectedElement) {
      setLocalWidth(Math.round(selectedElement.width ?? 0).toString());
      setLocalHeight(Math.round(selectedElement.height ?? 0).toString());
    }
  }, [selectedElement?.id, selectedElement?.width, selectedElement?.height]);
  
  // Reset to first dropdown when element changes
  useEffect(() => {
    if (selectedElement?.type === 'background-photo') {
      setOpenDropdown('foto-background');
    } else if (selectedElement) {
      setOpenDropdown('dimensi');
    } else {
      setOpenDropdown('upload-background');
    }
  }, [selectedElement?.id]);

  const applyDimension = (dimension, value) => {
    if (!selectedElement) return;
    
    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue <= 0) {
      // Reset to current value if invalid
      if (dimension === "width") {
        setLocalWidth(Math.round(selectedElement.width ?? 60).toString());
      } else {
        setLocalHeight(Math.round(selectedElement.height ?? 60).toString());
      }
      return;
    }

    const finalValue = Math.max(60, Math.round(numericValue));
    onUpdateElement(selectedElement.id, {
      [dimension]: finalValue,
    });
    
    // Update local state with final value
    if (dimension === "width") {
      setLocalWidth(finalValue.toString());
    } else {
      setLocalHeight(finalValue.toString());
    }
  };

  const handleDimensionInput = (dimension, rawValue) => {
    if (!selectedElement || typeof rawValue === "undefined") {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const nextValue = Math.round(
      numericValue > 0 ? numericValue : selectedElement[dimension]
    );
    const minFallback = 60;
    onUpdateElement(selectedElement.id, {
      [dimension]: Math.max(minFallback, nextValue),
    });
  };

  const renderSharedControls = () => (
    <>
      <CollapsibleSection 
        title="Dimensi" 
        isOpen={openDropdown === 'dimensi'}
        onToggle={() => setOpenDropdown(openDropdown === 'dimensi' ? null : 'dimensi')}
      >
        <div className="grid grid-cols-2 gap-3">
          <InputRow label="Lebar">
            <input
              type="number"
              className="rounded-2xl border-2 border-[#e0b7a9]/20 bg-white px-4 py-3 text-slate-700 shadow-[0_2px_8px_rgba(224,183,169,0.08)] transition-all focus:border-[#e0b7a9]/50 focus:shadow-[0_4px_12px_rgba(224,183,169,0.15)] focus:outline-none"
              value={localWidth}
              onChange={(e) => setLocalWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  applyDimension("width", localWidth);
                  e.target.blur();
                }
              }}
              onBlur={() => applyDimension("width", localWidth)}
            />
          </InputRow>
          <InputRow label="Tinggi">
            <input
              type="number"
              className="rounded-2xl border-2 border-[#e0b7a9]/20 bg-white px-4 py-3 text-slate-700 shadow-[0_2px_8px_rgba(224,183,169,0.08)] transition-all focus:border-[#e0b7a9]/50 focus:shadow-[0_4px_12px_rgba(224,183,169,0.15)] focus:outline-none"
              value={localHeight}
              onChange={(e) => setLocalHeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  applyDimension("height", localHeight);
                  e.target.blur();
                }
              }}
              onBlur={() => applyDimension("height", localHeight)}
            />
          </InputRow>
        </div>
      </CollapsibleSection>
    </>
  );

  const renderTextControls = () => (
    <CollapsibleSection 
      title="Pengaturan Teks" 
      isOpen={openDropdown === 'pengaturan-teks'}
      onToggle={() => setOpenDropdown(openDropdown === 'pengaturan-teks' ? null : 'pengaturan-teks')}
    >
      <InputRow label="Isi Teks">
        <textarea
          rows={3}
          className="min-h-[100px] rounded-2xl border-2 border-[#e0b7a9]/20 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_2px_8px_rgba(224,183,169,0.08)] transition-all focus:border-[#e0b7a9]/50 focus:shadow-[0_4px_12px_rgba(224,183,169,0.15)] focus:outline-none"
          value={selectedElement.data?.text ?? ""}
          onChange={(event) =>
            onUpdateElement(selectedElement.id, {
              data: { text: event.target.value },
            })
          }
        />
      </InputRow>
      <InputRow label="Font">
        <select
          className="w-full rounded-2xl border-2 border-[#e0b7a9]/35 bg-gradient-to-br from-white to-[#fdf7f4]/50 px-4 py-3 text-sm font-semibold text-[#4a302b] shadow-[0_4px_12px_rgba(224,183,169,0.15)] transition-all hover:border-[#d4a99a] hover:shadow-[0_6px_16px_rgba(224,183,169,0.25)] focus:border-[#d4a99a] focus:shadow-[0_6px_20px_rgba(224,183,169,0.3)] focus:outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23e0b7a9%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-12"
          value={selectedElement.data?.fontFamily ?? 'Inter'}
          onChange={(event) =>
            onUpdateElement(selectedElement.id, {
              data: { fontFamily: event.target.value },
            })
          }
        >
          {EDITOR_FONT_FAMILIES.map((font) => (
            <option key={font} value={font} style={{ fontFamily: font }}>
              {font}
            </option>
          ))}
        </select>
      </InputRow>
      <div className="grid grid-cols-2 gap-3">
        <InputRow label="Ukuran">
          <input
            type="range"
            min={12}
            max={64}
            value={selectedElement.data?.fontSize ?? 24}
            onChange={(event) =>
              onUpdateElement(selectedElement.id, {
                data: { fontSize: Number(event.target.value) },
              })
            }
          />
          <div className="text-xs font-semibold text-slate-500">
            {selectedElement.data?.fontSize ?? 24}px
          </div>
        </InputRow>
        <InputRow label="Warna">
          <ColorPicker
            value={selectedElement.data?.color ?? "#1F2933"}
            onChange={(nextColor) =>
              onUpdateElement(selectedElement.id, {
                data: { color: nextColor },
              })
            }
          />
        </InputRow>
      </div>
      <InputRow label="Perataan">
        <div className="grid grid-cols-3 gap-3">
          {["left", "center", "right"].map((align) => (
            <button
              key={align}
              type="button"
              onClick={() =>
                onUpdateElement(selectedElement.id, {
                  data: { align },
                })
              }
              className={`rounded-2xl px-4 py-3 text-sm font-bold capitalize transition-all ${
                selectedElement.data?.align === align
                  ? "bg-gradient-to-r from-[#e0b7a9] to-[#d4a99a] text-white shadow-[0_4px_12px_rgba(224,183,169,0.3)]"
                  : "border-2 border-[#e0b7a9]/20 bg-white text-slate-600 shadow-[0_2px_6px_rgba(0,0,0,0.04)] hover:border-[#e0b7a9]/40 hover:bg-[#fdf7f4]/50 hover:shadow-[0_4px_12px_rgba(224,183,169,0.15)]"
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </InputRow>
    </CollapsibleSection>
  );

  // Shape types for shape picker
  const shapeTypes = [
    { id: 'rectangle', label: 'Kotak', icon: '▬' },
    { id: 'circle', label: 'Lingkaran', icon: '●' },
    { id: 'triangle', label: 'Segitiga', icon: '▲' },
    { id: 'star', label: 'Bintang', icon: '★' },
    { id: 'heart', label: 'Hati', icon: '♥' },
    { id: 'diamond', label: 'Belah Ketupat', icon: '◆' },
    { id: 'hexagon', label: 'Segi Enam', icon: '⬡' },
    { id: 'pentagon', label: 'Segi Lima', icon: '⬠' },
    { id: 'octagon', label: 'Segi Delapan', icon: '⯃' },
    { id: 'arrow-right', label: 'Panah Kanan', icon: '➤' },
    { id: 'arrow-up', label: 'Panah Atas', icon: '▲' },
    { id: 'cross', label: 'Plus', icon: '✚' },
  ];

  const renderShapeTypeControls = () => (
    <CollapsibleSection 
      title="Pilih Bentuk" 
      isOpen={openDropdown === 'pilih-bentuk'}
      onToggle={() => setOpenDropdown(openDropdown === 'pilih-bentuk' ? null : 'pilih-bentuk')}
    >
      <div className="grid grid-cols-4 gap-2">
        {shapeTypes.map((shape) => {
          const isSelected = (selectedElement.data?.shapeType || 'rectangle') === shape.id;
          return (
            <button
              key={shape.id}
              type="button"
              onClick={() => onUpdateElement(selectedElement.id, { data: { shapeType: shape.id } })}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
                isSelected
                  ? "bg-gradient-to-br from-[#e0b7a9] to-[#d4a99a] text-white shadow-lg ring-2 ring-[#d4a99a]/50"
                  : "bg-white border-2 border-[#e0b7a9]/20 text-slate-600 hover:border-[#e0b7a9]/40 hover:bg-[#fdf7f4]/50"
              }`}
              title={shape.label}
            >
              <span className="text-2xl leading-none">{shape.icon}</span>
              <span className="text-[9px] mt-1 font-medium truncate w-full text-center">{shape.label}</span>
            </button>
          );
        })}
      </div>
    </CollapsibleSection>
  );

  const renderFillControls = ({ showBorderRadius = true } = {}) => (
    <CollapsibleSection 
      title="Warna & Bentuk" 
      isOpen={openDropdown === 'warna-bentuk'}
      onToggle={() => setOpenDropdown(openDropdown === 'warna-bentuk' ? null : 'warna-bentuk')}
    >
      <InputRow label="Warna Isi">
        <ColorPicker
          value={selectedElement.data?.fill ?? "#F4D3C2"}
          onChange={(nextColor) =>
            onUpdateElement(selectedElement.id, {
              data: { fill: nextColor },
            })
          }
        />
      </InputRow>
      {showBorderRadius && (
        <InputRow label="Radius">
          <input
            type="range"
            min={0}
            max={120}
            value={selectedElement.data?.borderRadius ?? 24}
            onChange={(event) =>
              onUpdateElement(selectedElement.id, {
                data: { borderRadius: Number(event.target.value) },
              })
            }
          />
        </InputRow>
      )}
    </CollapsibleSection>
  );

  // Render hanya border radius (untuk photo/area foto)
  const renderBorderRadiusControls = () => (
    <CollapsibleSection 
      title="Kelengkungan Sudut" 
      isOpen={openDropdown === 'border-radius'}
      onToggle={() => setOpenDropdown(openDropdown === 'border-radius' ? null : 'border-radius')}
    >
      <InputRow label="Radius">
        <input
          type="range"
          min={0}
          max={120}
          value={selectedElement.data?.borderRadius ?? 24}
          onChange={(event) =>
            onUpdateElement(selectedElement.id, {
              data: { borderRadius: Number(event.target.value) },
            })
          }
        />
        <div className="text-xs font-semibold text-slate-500">
          {Math.round(selectedElement.data?.borderRadius ?? 24)}px
        </div>
      </InputRow>
    </CollapsibleSection>
  );

  const renderOutlineControls = ({ defaultColor = "#d9b9ab", maxWidth = 24 } = {}) => {
    const currentWidth = Number(selectedElement.data?.strokeWidth ?? 0);
    const fallbackColor =
      typeof selectedElement.data?.stroke === "string" && selectedElement.data.stroke.length > 0
        ? selectedElement.data.stroke
        : defaultColor;

    return (
      <CollapsibleSection 
        title="Outline" 
        isOpen={openDropdown === 'outline'}
        onToggle={() => setOpenDropdown(openDropdown === 'outline' ? null : 'outline')}
      >
        <InputRow label="Ketebalan">
          <input
            type="range"
            min={0}
            max={maxWidth}
            value={currentWidth}
            onChange={(event) => {
              const nextWidth = Number(event.target.value);
              if (!Number.isFinite(nextWidth)) {
                return;
              }
              const updates = {
                strokeWidth: Math.max(0, nextWidth),
              };
              if (nextWidth > 0 && !selectedElement.data?.stroke) {
                updates.stroke = fallbackColor;
              }
              onUpdateElement(selectedElement.id, { data: updates });
            }}
          />
          <div className="text-xs font-semibold text-slate-500">
            {Math.round(currentWidth)}px
          </div>
        </InputRow>
        <InputRow label="Warna Outline">
          <ColorPicker
            value={fallbackColor}
            onChange={(nextColor) =>
              onUpdateElement(selectedElement.id, {
                data: { stroke: nextColor },
              })
            }
          />
        </InputRow>
      </CollapsibleSection>
    );
  };

  const renderImageControls = () => (
    <CollapsibleSection 
      title="Gambar" 
      isOpen={openDropdown === 'gambar'}
      onToggle={() => setOpenDropdown(openDropdown === 'gambar' ? null : 'gambar')}
    >
      <InputRow label="Objek Fit">
        <select
          className="w-full rounded-2xl border-2 border-[#e0b7a9]/35 bg-gradient-to-br from-white to-[#fdf7f4]/50 px-4 py-3 text-sm font-semibold text-[#4a302b] shadow-[0_4px_12px_rgba(224,183,169,0.15)] transition-all hover:border-[#d4a99a] hover:shadow-[0_6px_16px_rgba(224,183,169,0.25)] focus:border-[#d4a99a] focus:shadow-[0_6px_20px_rgba(224,183,169,0.3)] focus:outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23e0b7a9%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-12"
          value={selectedElement.data?.objectFit ?? "contain"}
          onChange={(event) =>
            onUpdateElement(selectedElement.id, {
              data: { objectFit: event.target.value },
            })
          }
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
        </select>
      </InputRow>
      {selectedElement.data?.image && (
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50/90 px-3 py-2 text-xs font-semibold text-rose-600"
          onClick={() =>
            onUpdateElement(selectedElement.id, {
              data: { image: null },
            })
          }
        >
          <X size={14} /> Hapus gambar
        </button>
      )}
    </CollapsibleSection>
  );

  const renderBackgroundPhotoControls = () => (
    <CollapsibleSection 
      title="Foto Background" 
      isOpen={openDropdown === 'foto-background'}
      onToggle={() => setOpenDropdown(openDropdown === 'foto-background' ? null : 'foto-background')}
    >
      <InputRow label="Mode Isi">
        <select
          className="w-full rounded-2xl border-2 border-[#e0b7a9]/35 bg-gradient-to-br from-white to-[#fdf7f4]/50 px-4 py-3 text-sm font-semibold text-[#4a302b] shadow-[0_4px_12px_rgba(224,183,169,0.15)] transition-all hover:border-[#d4a99a] hover:shadow-[0_6px_16px_rgba(224,183,169,0.25)] focus:border-[#d4a99a] focus:shadow-[0_6px_20px_rgba(224,183,169,0.3)] focus:outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23e0b7a9%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-12"
          value={selectedElement.data?.objectFit ?? "contain"}
          onChange={(event) =>
            onUpdateElement(selectedElement.id, {
              data: { objectFit: event.target.value },
            })
          }
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
        </select>
      </InputRow>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              const uploadEvent = new CustomEvent(
                "creator:request-background-upload"
              );
              window.dispatchEvent(uploadEvent);
            }
          }}
          className="flex items-center justify-center gap-3 rounded-2xl border-2 border-[#e0b7a9]/40 bg-gradient-to-r from-[#f7e3da] to-[#f1cfc0] px-5 py-3 text-sm font-semibold text-[#4a302b] shadow-[0_6px_16px_rgba(224,183,169,0.25)] transition-all hover:translate-y-[-2px] hover:shadow-[0_12px_26px_rgba(224,183,169,0.35)]"
        >
          Ganti foto background
        </button>
        <button
          type="button"
          onClick={() => onFitBackgroundPhoto?.()}
          className="flex items-center justify-center gap-3 rounded-2xl border-2 border-[#e0b7a9]/40 bg-white px-5 py-3 text-sm font-semibold text-[#4a302b] shadow-[0_4px_12px_rgba(224,183,169,0.18)] transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_24px_rgba(224,183,169,0.24)]"
        >
          Sesuaikan ke kanvas
        </button>
        {selectedElement.data?.image && (
          <button
            type="button"
            onClick={() => {
              onDeleteElement(selectedElement.id);
              clearSelection();
            }}
            className="flex items-center justify-center gap-3 rounded-2xl border-2 border-red-200/50 bg-gradient-to-r from-red-50 to-red-100/60 px-5 py-3 text-sm font-semibold text-red-600 shadow-[0_4px_12px_rgba(239,68,68,0.18)] transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_22px_rgba(239,68,68,0.25)]"
          >
            <X size={14} /> Hapus foto background
          </button>
        )}
      </div>
    </CollapsibleSection>
  );

  const renderEmptyState = () => (
    <motion.div
      variants={panelVariant}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-[#e0b7a9]/15 bg-gradient-to-br from-white/95 via-white/90 to-[#fdf7f4]/50 p-8 text-center text-sm text-slate-500 shadow-[0_12px_32px_rgba(224,183,169,0.12)] backdrop-blur-sm"
    >
      <p className="font-semibold text-slate-600">
        Pilih elemen di kanvas untuk mengubah properti di sini.
      </p>
      <p className="text-xs font-medium text-[#e0b7a9]">
        💡 Tip: klik tombol Background untuk mengganti warna dasar kanvas.
      </p>
    </motion.div>
  );

  if (selectedElement === "background") {
    return (
      <motion.div
        variants={panelVariant}
        initial="hidden"
        animate="visible"
        className="flex h-full w-full flex-col gap-3"
      >
        {/* Lock Background Button */}
        <div className="w-full px-4 py-3">
          <button
            type="button"
            onClick={onToggleBackgroundLock}
            className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-all duration-200 ${
              isBackgroundLocked
                ? "bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-2 border-red-300 hover:from-red-100 hover:to-red-200"
                : "bg-gradient-to-r from-green-50 to-green-100 text-green-700 border-2 border-green-300 hover:from-green-100 hover:to-green-200"
            }`}
            style={{ fontSize: '14px' }}
          >
            {isBackgroundLocked ? (
              <>
                <Lock size={18} />
                <span>Background Terkunci</span>
              </>
            ) : (
              <>
                <Unlock size={18} />
                <span>Kunci Background</span>
              </>
            )}
          </button>
        </div>

        {/* Upload Background - Collapsible */}
        <CollapsibleSection 
          title="Upload Background" 
          isOpen={openDropdown === 'upload-background'}
          onToggle={() => setOpenDropdown(openDropdown === 'upload-background' ? null : 'upload-background')}
        >
          <div className="flex flex-col items-center gap-4" style={{ margin: '16px 0' }}>
            <button
              type="button"
              id="upload-bg-btn-v4-final"
              data-version="4.0"
              data-timestamp={Date.now()}
              onClick={() => {
                if (selectedElement !== "background") return;
                if (typeof window !== "undefined") {
                  const uploadEvent = new CustomEvent(
                    "creator:request-background-upload"
                  );
                  window.dispatchEvent(uploadEvent);
                }
              }}
              style={{
                padding: '12px 16px',
                fontSize: '14px',
                minHeight: '44px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #f5e5df 0%, #ecddd5 50%, #e8d4c9 100%)',
                color: '#4a302b',
                border: '1px solid rgba(224, 183, 169, 0.3)',
                borderRadius: '14px',
                boxShadow: '0 3px 12px rgba(224, 183, 169, 0.15)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              className="group relative overflow-hidden upload-bg-v4"
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 5px 16px rgba(224, 183, 169, 0.25)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #ecddd5 0%, #e8d4c9 50%, #e0c5b8 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 3px 12px rgba(224, 183, 169, 0.15)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #f5e5df 0%, #ecddd5 50%, #e8d4c9 100%)';
              }}
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              
              <span style={{ fontSize: '16px' }}>📷</span>
              <span className="relative z-10">Unggah Background</span>
            </button>
            
            {backgroundPhoto && (
              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => onSelectBackgroundPhoto?.()}
                  style={{
                    padding: '14px 20px',
                    fontSize: '15px'
                  }}
                  className="w-full flex items-center justify-center rounded-xl border-2 border-[#e0b7a9]/40 bg-white text-[#4a302b] font-medium shadow-sm transition-all duration-200 hover:bg-[#fdf7f4] hover:border-[#e0b7a9]/60 hover:shadow-md"
                >
                  Edit foto background
                </button>
                <button
                  type="button"
                  onClick={() => onFitBackgroundPhoto?.()}
                  style={{
                    padding: '14px 20px',
                    fontSize: '15px'
                  }}
                  className="w-full flex items-center justify-center rounded-xl border-2 border-[#e0b7a9]/40 bg-white text-[#4a302b] font-medium shadow-sm transition-all duration-200 hover:bg-[#fdf7f4] hover:border-[#e0b7a9]/60 hover:shadow-md"
                >
                  Sesuaikan ke kanvas
                </button>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Warna Latar - Collapsible */}
        <CollapsibleSection 
          title="Warna Latar" 
          isOpen={openDropdown === 'warna-latar'}
          onToggle={() => setOpenDropdown(openDropdown === 'warna-latar' ? null : 'warna-latar')}
        >
          <div className="flex flex-col gap-3">
            {(() => {
              const isGradient = canvasBackground?.startsWith('linear-gradient') || canvasBackground?.startsWith('radial-gradient');
              const solidColor = isGradient ? '#ffffff' : (canvasBackground || '#ffffff');
              
              return (
                <>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onBackgroundChange(solidColor)}
                      className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                        !isGradient
                          ? 'bg-purple-100 text-purple-700 border-2 border-purple-500'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      type="button"
                      onClick={() => onBackgroundChange('linear-gradient(135deg, #667eea 0%, #764ba2 100%)')}
                      className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                        isGradient
                          ? 'bg-purple-100 text-purple-700 border-2 border-purple-500'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                  
                  {isGradient ? (
                    <div className="flex flex-col gap-3">
                      {/* Gradient Preview */}
                      <div 
                        className="h-20 rounded-xl border-2 border-slate-200 shadow-md"
                        style={{ 
                          background: `linear-gradient(135deg, ${gradientColor1} 0%, ${gradientColor2} 100%)` 
                        }}
                      />
                      
                      {/* Color Point 1 */}
                      <div className="flex flex-col gap-1.5">
                        <div className="text-xs font-semibold text-slate-600">Warna Titik 1:</div>
                        <ColorPicker 
                          value={gradientColor1} 
                          onChange={(newColor) => {
                            setGradientColor1(newColor);
                            onBackgroundChange(`linear-gradient(135deg, ${newColor} 0%, ${gradientColor2} 100%)`);
                          }} 
                        />
                      </div>
                      
                      {/* Color Point 2 */}
                      <div className="flex flex-col gap-1.5">
                        <div className="text-xs font-semibold text-slate-600">Warna Titik 2:</div>
                        <ColorPicker 
                          value={gradientColor2} 
                          onChange={(newColor) => {
                            setGradientColor2(newColor);
                            onBackgroundChange(`linear-gradient(135deg, ${gradientColor1} 0%, ${newColor} 100%)`);
                          }} 
                        />
                      </div>
                      
                      {/* Quick Presets */}
                      <div className="text-xs font-semibold text-slate-700 mt-1">Quick Presets:</div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { name: 'Purple', c1: '#667eea', c2: '#764ba2' },
                          { name: 'Ocean', c1: '#667eea', c2: '#0093E9' },
                          { name: 'Sunset', c1: '#f093fb', c2: '#f5576c' },
                          { name: 'Forest', c1: '#11998e', c2: '#38ef7d' },
                          { name: 'Pink', c1: '#FA8BFF', c2: '#2BD2FF' },
                          { name: 'Gold', c1: '#FFB75E', c2: '#ED8F03' },
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => {
                              setGradientColor1(preset.c1);
                              setGradientColor2(preset.c2);
                              onBackgroundChange(`linear-gradient(135deg, ${preset.c1} 0%, ${preset.c2} 100%)`);
                            }}
                            className="relative h-14 rounded-lg overflow-hidden ring-1 ring-slate-200 hover:ring-purple-300 transition-all"
                            style={{ background: `linear-gradient(135deg, ${preset.c1} 0%, ${preset.c2} 100%)` }}
                          >
                            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white drop-shadow-md whitespace-nowrap">
                              {preset.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ColorPicker value={solidColor} onChange={onBackgroundChange} />
                  )}
                </>
              );
            })()}
          </div>
        </CollapsibleSection>

        {/* Ukuran Canvas - Collapsible */}
        <CollapsibleSection 
          title="Ukuran Canvas" 
          isOpen={openDropdown === 'ukuran-canvas'}
          onToggle={() => setOpenDropdown(openDropdown === 'ukuran-canvas' ? null : 'ukuran-canvas')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: "Story Instagram", ratio: "9:16", desc: "1080 × 1920", icon: "📱" },
                { label: "Instagram Feeds", ratio: "4:5", desc: "1080 × 1350", icon: "📷" },
                { label: "Photostrip", ratio: "2:3", desc: "1200 × 1800", icon: "🎞️" },
                { label: "2R", ratio: "1:3", desc: "600 × 1800", icon: "🖼️" },
              ].map((preset) => {
                const isSelected = canvasAspectRatio === preset.ratio;
                return (
                  <button
                    key={preset.ratio}
                    onClick={() => onCanvasAspectRatioChange?.(preset.ratio)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '14px',
                      border: isSelected 
                        ? '2px solid #d4a99a' 
                        : '1px solid rgba(224, 183, 169, 0.15)',
                      background: isSelected 
                        ? 'linear-gradient(135deg, #fdf7f4 0%, #f7ebe5 50%, #f1dfd6 100%)'
                        : 'linear-gradient(135deg, #ffffff 0%, #fefcfb 100%)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.25s ease',
                      boxShadow: isSelected 
                        ? '0 4px 16px rgba(212, 169, 154, 0.25), inset 0 1px 0 rgba(255,255,255,0.8)' 
                        : '0 2px 8px rgba(224, 183, 169, 0.08)',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.border = '1px solid rgba(224, 183, 169, 0.35)';
                        e.currentTarget.style.background = 'linear-gradient(135deg, #fefcfb 0%, #fdf7f4 100%)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(224, 183, 169, 0.15)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.border = '1px solid rgba(224, 183, 169, 0.15)';
                        e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #fefcfb 100%)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(224, 183, 169, 0.08)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>{preset.icon}</span>
                        <div>
                          <div style={{ 
                            fontWeight: isSelected ? 700 : 600, 
                            fontSize: '14px',
                            color: isSelected ? '#4a302b' : '#5a3d38',
                            marginBottom: '2px'
                          }}>
                            {preset.label}
                          </div>
                          <div style={{ 
                            fontSize: '12px', 
                            color: isSelected ? '#c89585' : '#9ca3af',
                            fontWeight: 500
                          }}>
                            {preset.desc}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #e0b7a9 0%, #d4a99a 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(212, 169, 154, 0.4)'
                        }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Current Ratio Display */}
            <div style={{
              background: 'linear-gradient(135deg, #fdf7f4 0%, #f7ebe5 50%, #f1dfd6 100%)',
              borderRadius: '14px',
              padding: '14px 16px',
              border: '1px solid rgba(224, 183, 169, 0.2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#c89585',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '4px'
              }}>
                Rasio Saat Ini
              </div>
              <div style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#4a302b',
                letterSpacing: '-0.02em'
              }}>
                {canvasAspectRatio}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </motion.div>
    );
  }

  // Canvas Size Mode - Show when canvas size tool is active
  if (showCanvasSizeMode) {
    return (
      <motion.div
        variants={panelVariant}
        initial="hidden"
        animate="visible"
        className="flex h-full w-full flex-col gap-3"
      >
        {/* Ukuran Canvas Section */}
        <CollapsibleSection 
          title="Ukuran Canvas" 
          isOpen={true}
          onToggle={() => {}}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: "Story Instagram", ratio: "9:16", desc: "1080 × 1920", icon: "📱" },
                { label: "Instagram Feeds", ratio: "4:5", desc: "1080 × 1350", icon: "📷" },
                { label: "Photostrip", ratio: "2:3", desc: "1200 × 1800", icon: "🎞️" },
                { label: "2R", ratio: "1:3", desc: "600 × 1800", icon: "🖼️" },
              ].map((preset) => {
                const isSelected = canvasAspectRatio === preset.ratio;
                return (
                  <button
                    key={preset.ratio}
                    onClick={() => onCanvasAspectRatioChange?.(preset.ratio)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '14px',
                      border: isSelected 
                        ? '2px solid #d4a99a' 
                        : '1px solid rgba(224, 183, 169, 0.15)',
                      background: isSelected 
                        ? 'linear-gradient(135deg, #fdf7f4 0%, #f7ebe5 50%, #f1dfd6 100%)'
                        : 'linear-gradient(135deg, #ffffff 0%, #fefcfb 100%)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.25s ease',
                      boxShadow: isSelected 
                        ? '0 4px 16px rgba(212, 169, 154, 0.25), inset 0 1px 0 rgba(255,255,255,0.8)' 
                        : '0 2px 8px rgba(224, 183, 169, 0.08)',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.border = '1px solid rgba(224, 183, 169, 0.35)';
                        e.currentTarget.style.background = 'linear-gradient(135deg, #fefcfb 0%, #fdf7f4 100%)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(224, 183, 169, 0.15)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.border = '1px solid rgba(224, 183, 169, 0.15)';
                        e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #fefcfb 100%)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(224, 183, 169, 0.08)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>{preset.icon}</span>
                        <div>
                          <div style={{ 
                            fontWeight: isSelected ? 700 : 600, 
                            fontSize: '14px',
                            color: isSelected ? '#4a302b' : '#5a3d38',
                            marginBottom: '2px'
                          }}>
                            {preset.label}
                          </div>
                          <div style={{ 
                            fontSize: '12px', 
                            color: isSelected ? '#c89585' : '#9ca3af',
                            fontWeight: 500
                          }}>
                            {preset.desc}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #e0b7a9 0%, #d4a99a 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(212, 169, 154, 0.4)'
                        }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Current Ratio Display */}
            <div style={{
              background: 'linear-gradient(135deg, #fdf7f4 0%, #f7ebe5 50%, #f1dfd6 100%)',
              borderRadius: '14px',
              padding: '14px 16px',
              border: '1px solid rgba(224, 183, 169, 0.2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#c89585',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '4px'
              }}>
                Rasio Saat Ini
              </div>
              <div style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#4a302b',
                letterSpacing: '-0.02em'
              }}>
                {canvasAspectRatio}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </motion.div>
    );
  }

  // Pending Photo Tool Mode - Show confirmation panel before adding photo area
  if (pendingPhotoTool) {
    return (
      <motion.div
        variants={panelVariant}
        initial="hidden"
        animate="visible"
        className="flex h-full w-full flex-col gap-3"
      >
        <CollapsibleSection 
          title="Area Foto" 
          isOpen={true}
          onToggle={() => {}}
        >
          <div className="flex flex-col gap-4">
            {/* Description */}
            <div className="bg-gradient-to-br from-[#fdf7f4] to-[#f5e5df] rounded-xl p-4 border border-[#e0b7a9]/20">
              <p className="text-sm text-slate-600 leading-relaxed">
                Area Foto adalah tempat dimana foto yang diambil di halaman <strong>TakeMoment</strong> akan ditampilkan dalam frame.
              </p>
            </div>
            
            {/* Grid Selection */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold uppercase tracking-wider text-[#e0b7a9]">
                Pilih Layout Grid
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { rows: 1, cols: 1, label: "1×1" },
                  { rows: 2, cols: 1, label: "2×1" },
                  { rows: 2, cols: 2, label: "2×2" },
                  { rows: 3, cols: 2, label: "3×2" },
                ].map((grid) => (
                  <button
                    key={grid.label}
                    type="button"
                    onClick={() => onConfirmAddPhoto(grid.rows, grid.cols)}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-[#e0b7a9]/30 bg-white p-3 transition-all hover:border-[#e0b7a9] hover:bg-[#fdf7f4] hover:shadow-md active:scale-95"
                  >
                    {/* Grid Preview */}
                    <div 
                      className="grid gap-0.5 w-10 h-12 p-0.5"
                      style={{
                        gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
                        gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
                      }}
                    >
                      {Array.from({ length: grid.rows * grid.cols }).map((_, i) => (
                        <div
                          key={i}
                          className="bg-[#d1e3f0] rounded-sm border border-[#a8c8e0]"
                        />
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-slate-600">{grid.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs text-blue-700 font-medium">
                💡 <strong>Tips:</strong> Pilih layout grid untuk menambahkan beberapa area foto sekaligus dengan susunan simetris.
              </p>
            </div>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={onCancelPhotoTool}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-95"
            >
              <X size={16} />
              Batal
            </button>
          </div>
        </CollapsibleSection>
      </motion.div>
    );
  }

  if (!selectedElement) {
    return renderEmptyState();
  }

  return (
    <motion.div
      variants={panelVariant}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col gap-3"
    >
      {selectedElement.type === "text" && renderTextControls()}

      {selectedElement.type === "shape" &&
        <>
          {renderShapeTypeControls()}
          {renderFillControls({ showBorderRadius: (selectedElement.data?.shapeType || 'rectangle') === 'rectangle' })}
          {renderOutlineControls({ defaultColor: "#d9b9ab", maxWidth: 32 })}
        </>}

      {selectedElement.type === "photo" && (
        <>
          {renderBorderRadiusControls()}
        </>
      )}

      {selectedElement.type === "upload" && (
        <>
          {renderImageControls()}
          {renderFillControls({ showBorderRadius: true })}
          {renderOutlineControls({ defaultColor: "#f4f4f4", maxWidth: 24 })}
        </>
      )}

      {selectedElement.type === "background-photo" &&
        renderBackgroundPhotoControls()}

      {/* Dimensi - dipindahkan ke bawah */}
      {selectedElement.type !== "background-photo" && renderSharedControls()}

      <button
        type="button"
        onClick={() => {
          onDeleteElement(selectedElement.id);
          clearSelection();
        }}
        className="mt-auto flex items-center justify-center gap-3 rounded-2xl border-2 border-red-200/50 bg-gradient-to-r from-red-50 to-red-100/50 px-5 py-4 text-sm font-bold text-red-600 shadow-[0_4px_12px_rgba(239,68,68,0.15)] transition-all hover:border-red-300 hover:bg-gradient-to-r hover:from-red-100 hover:to-red-100 hover:shadow-[0_6px_16px_rgba(239,68,68,0.25)] active:scale-95"
      >
        <Trash2 size={18} strokeWidth={2.5} /> Hapus Element
      </button>
    </motion.div>
  );
}
