import {
  forwardRef,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { Rnd } from "react-rnd";
import { motion as Motion } from "framer-motion";
import { UploadCloud } from "lucide-react";
import trashIcon from "../../assets/create-icon/create-trash.png";
import duplicateIcon from "../../assets/create-icon/create-duplicate.png";
import lockIcon from "../../assets/create-icon/create-lock.png";
import unlockIcon from "../../assets/create-icon/create-unlock.png";
import rotateIcon from "../../assets/create-icon/rotate.png";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_ELEMENT_MIN,
  BACKGROUND_MIN_SHORT_SIDE,
} from "./canvasConstants.js";
import { buildSlotMaps } from "../../utils/slotSystem.js";
const HOLD_THRESHOLD_MS = 350;
const formatRadius = (value, fallback) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}px`;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return `${fallback}px`;
};

const parseNumeric = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const getElementBorderRadius = (element) => {
  switch (element.type) {
    case "shape":
    case "photo":
    case "upload":
      return formatRadius(element.data?.borderRadius, 24);
    case "background-photo":
      return formatRadius(element.data?.borderRadius, 0);
    case "text":
      return "18px";
    default:
      return "0px";
  }
};
const DRAG_THRESHOLD_PX = 6;
const DEFAULT_RESIZE_CONFIG = {
  top: true,
  right: true,
  bottom: true,
  left: true,
  topRight: true,
  bottomRight: true,
  bottomLeft: true,
  topLeft: true,
};

// Text elements: no top/bottom middle handles (they only reflow text, not scale font)
const TEXT_RESIZE_CONFIG = {
  top: false,
  right: true,
  bottom: false,
  left: true,
  topRight: true,
  bottomRight: true,
  bottomLeft: true,
  topLeft: true,
};

const buildResizeHandleStyles = (scale) => {
  const safeScale = Math.max(scale, 0.24);
  const salemColor = "#f7a998";

  const dotSize = Math.min(Math.max(Math.round(16 / safeScale), 14), 28);
  const lineThickness = Math.min(Math.max(Math.round(8 / safeScale), 8), 14);
  const lineLength = Math.min(Math.max(Math.round(30 / safeScale), 28), 50);

  const sharedDot = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    border: `${Math.max(1, Math.round(1.5 / safeScale))}px solid ${salemColor}`,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    borderRadius: "50%",
    cursor: "pointer",
    opacity: 1,
    touchAction: "manipulation",
    pointerEvents: "auto",
    zIndex: 9999,
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  };

  const sharedLine = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    border: "none",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    borderRadius: `${lineThickness}px`,
    cursor: "pointer",
    opacity: 1,
    touchAction: "manipulation",
    pointerEvents: "auto",
    zIndex: 9999,
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  };

  return {
    top: {
      ...sharedLine,
      width: `${lineLength}px`,
      height: `${lineThickness}px`,
      left: "50%",
      top: 0,
      transform: "translate(-50%, -50%)",
      cursor: "ns-resize",
    },
    bottom: {
      ...sharedLine,
      width: `${lineLength}px`,
      height: `${lineThickness}px`,
      left: "50%",
      bottom: 0,
      transform: "translate(-50%, 50%)",
      cursor: "ns-resize",
    },
    left: {
      ...sharedLine,
      width: `${lineThickness}px`,
      height: `${lineLength}px`,
      top: "50%",
      left: 0,
      transform: "translate(-50%, -50%)",
      cursor: "ew-resize",
    },
    right: {
      ...sharedLine,
      width: `${lineThickness}px`,
      height: `${lineLength}px`,
      top: "50%",
      right: 0,
      transform: "translate(50%, -50%)",
      cursor: "ew-resize",
    },
    topLeft: {
      ...sharedDot,
      width: `${dotSize}px`,
      height: `${dotSize}px`,
      top: 0,
      left: 0,
      transform: "translate(-50%, -50%)",
      cursor: "nwse-resize",
    },
    topRight: {
      ...sharedDot,
      width: `${dotSize}px`,
      height: `${dotSize}px`,
      top: 0,
      right: 0,
      transform: "translate(50%, -50%)",
      cursor: "nesw-resize",
    },
    bottomRight: {
      ...sharedDot,
      width: `${dotSize}px`,
      height: `${dotSize}px`,
      bottom: 0,
      right: 0,
      transform: "translate(50%, 50%)",
      cursor: "nwse-resize",
    },
    bottomLeft: {
      ...sharedDot,
      width: `${dotSize}px`,
      height: `${dotSize}px`,
      bottom: 0,
      left: 0,
      transform: "translate(-50%, 50%)",
      cursor: "nesw-resize",
    },
  };
};

// Measures the natural wrapped height of a text element at given font/width
const TEXT_BOX_PADDING = 8;
const measureTextHeight = (text, fontFamily, fontSize, containerWidth) => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `500 ${fontSize}px "${fontFamily}"`;
    const availableWidth = Math.max(10, containerWidth - TEXT_BOX_PADDING * 2);
    const lineHeight = fontSize * 1.3;
    const paragraphs = (text || '').split('\n');
    let totalLines = 0;
    for (const para of paragraphs) {
      if (!para.trim()) { totalLines++; continue; }
      const words = para.split(/\s+/);
      let lineWidth = 0;
      let lines = 1;
      for (const word of words) {
        const w = ctx.measureText(word).width;
        const sw = ctx.measureText(' ').width;
        if (lineWidth > 0 && lineWidth + sw + w > availableWidth) {
          lines++;
          lineWidth = w;
        } else {
          lineWidth = lineWidth > 0 ? lineWidth + sw + w : w;
        }
      }
      totalLines += lines;
    }
    return Math.ceil(totalLines * lineHeight) + TEXT_BOX_PADDING * 2;
  } catch {
    return null;
  }
};

const getElementStyle = (element, isSelected) => {
  switch (element.type) {
    case "text":
      return {
        fontFamily: element.data?.fontFamily ?? "Inter",
        fontSize: `${element.data?.fontSize ?? 24}px`,
        color: element.data?.color ?? "#111827",
        fontWeight: element.data?.fontWeight ?? 500,
        textAlign: element.data?.align ?? "left",
        whiteSpace: "pre-wrap",
        lineHeight: 1.25,
        display: "flex",
        alignItems: "center",
        justifyContent:
          element.data?.align === "left"
            ? "flex-start"
            : element.data?.align === "right"
            ? "flex-end"
            : "center",
        padding: "8px 8px",
        borderRadius: "18px",
        backgroundColor: isSelected ? "rgba(255,255,255,0.65)" : "transparent",
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
      };
    case "shape": {
      const strokeWidth = Number(element.data?.strokeWidth ?? 0);
      const hasStroke = Boolean(element.data?.stroke) && strokeWidth > 0;
      const shapeType = element.data?.shapeType || 'rectangle';
      
      // For non-rectangular shapes, we use transparent background and render SVG
      const isRectangular = shapeType === 'rectangle';
      const isCircle = shapeType === 'circle';
      
      return {
        background: isRectangular || isCircle ? (element.data?.fill ?? "#f4d3c2") : "transparent",
        backgroundColor: isRectangular || isCircle ? (element.data?.fill ?? "#f4d3c2") : "transparent",
        borderRadius: isCircle ? '50%' : (isRectangular ? `${element.data?.borderRadius ?? 24}px` : '0'),
        border: (isRectangular || isCircle) && hasStroke
          ? `${strokeWidth}px solid ${element.data.stroke}`
          : "none",
        overflow: "visible",
      };
    }
    case "upload":
    case "photo":
    case "background-photo": {
      const strokeWidth = Number(element.data?.strokeWidth ?? 0);
      const hasStroke = Boolean(element.data?.stroke) && strokeWidth > 0;
      const baseRadius =
        element.data?.borderRadius ??
        (element.type === "background-photo" ? 0 : 24);

      const rotationDegrees = Number.isFinite(element?.rotation)
        ? element.rotation
        : 0;

      // Use transparent background if image exists for upload, otherwise use placeholder color
      const hasImage = element.data?.image;
      const baseBackground =
        element.type === "background-photo"
          ? element.data?.fill ?? "transparent"
          : hasImage
          ? "transparent"
          : element.data?.fill ?? "#dbeafe";

      return {
        borderRadius: `${baseRadius}px`,
        border: hasStroke
          ? `${strokeWidth}px solid ${element.data.stroke}`
          : "none",
        background: baseBackground,
        backgroundColor: baseBackground,
        backgroundImage: "none",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      };
    }
    default:
      return {};
  }
};

const createInteractionState = () => ({
  pointerActive: false,
  hadDrag: false,
  didTriggerTap: false,
  hadHold: false,
  holdTimer: null,
  totalDistance: 0,
  startX: null,
  startY: null,
  rndRef: null,
  isDragging: false,
  isResizing: false,
  dragStartClientX: null,
  dragStartClientY: null,
  dragStartElementX: null,
  dragStartElementY: null,
  isPinching: false,
  pinchStartDistance: null,
  pinchStartWidth: null,
  pinchStartHeight: null,
  pinchStartX: null,
  pinchStartY: null,
});

const resetRndPosition = (meta) => {
  if (!meta?.rndRef) {
    return;
  }
  const nextX = typeof meta.startX === "number" ? meta.startX : null;
  const nextY = typeof meta.startY === "number" ? meta.startY : null;
  if (nextX === null || nextY === null) {
    return;
  }
  if (typeof meta.rndRef.updatePosition === "function") {
    meta.rndRef.updatePosition({ x: nextX, y: nextY });
  }
};

// Applies element.rotation to the Rnd DOM node after react-draggable sets its
// transform: translate(x, y), so we override it with translate(x,y) rotate(θ)
// keeping the rotation centre at the element's visual centre.
function useRndRotation(rndRef, rotation, x, y, width, height) {
  useLayoutEffect(() => {
    if (!rndRef.current) return;
    const instance = rndRef.current;
    // react-rnd stores the nodeRef it passes to react-draggable as
    // instance.resizableElement.current — this is the actual DOM node on which
    // react-draggable sets transform: translate(x, y).
    // (instance.resizable is the re-resizable component instance, whose DOM
    //  node is .resizable, not .element — so we must NOT use .resizable.element)
    const dom = instance?.resizableElement?.current;
    if (!dom) return;
    const deg = Number.isFinite(rotation) ? rotation : 0;
    dom.style.transformOrigin = `${width / 2}px ${height / 2}px`;
    if (deg) {
      dom.style.transform = `translate(${x}px, ${y}px) rotate(${deg}deg)`;
    }
    // when deg === 0, let react-draggable's own translate() be the sole transform
  });
}

// Wrapper around Rnd that applies rotation correctly around the element's
// visual centre by overriding react-draggable's transform after each render.
const RotatableRnd = forwardRef(function RotatableRnd(
  { rotation, elementX, elementY, elementWidth, elementHeight, rndRef: externalRef, ...rndProps },
  _ref
) {
  const localRef = useRef(null);
  const combinedRef = (instance) => {
    localRef.current = instance;
    if (typeof externalRef === "function") externalRef(instance);
    else if (externalRef) externalRef.current = instance;
  };
  useRndRotation(localRef, rotation, elementX, elementY, elementWidth, elementHeight);
  return <Rnd ref={combinedRef} {...rndProps} />;
});

const ElementContent = forwardRef(
  (
    {
      element,
      isSelected,
      isEditing,
      editingValue,
      onTextChange,
      onTextBlur,
      textInputRef,
      resolvedSlotNumber,
    },
    ref
  ) => {
    // For photo slots, use custom styling (don't override with getElementStyle background)
    const shouldUseCustomPhotoStyle = element.type === "photo";

    const style = shouldUseCustomPhotoStyle
      ? {
          width: "100%",
          height: "100%",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Border radius from element data if exists
          borderRadius: `${element.data?.borderRadius ?? 24}px`,
        }
      : {
          width: "100%",
          height: "100%",
          ...getElementStyle(element, isSelected),
        };

    if (element.type === "text") {
      if (isEditing) {
        return (
          <textarea
            ref={textInputRef}
            value={editingValue}
            onChange={(e) => onTextChange(e.target.value)}
            onBlur={onTextBlur}
            autoFocus
            className="canvas-text-editor"
            style={{
              ...style,
              resize: "none",
              border: "none",
              outline: "none",
              background: "rgba(255,255,255,0.95)",
              cursor: "text",
              overflow: "hidden",
              // Reset flex/selection props that don't apply to textarea and break iOS
              display: "block",
              alignItems: undefined,
              justifyContent: undefined,
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        );
      }
      return <div style={style}>{element.data?.text ?? "Teks"}</div>;
    }

    if (element.type === "shape") {
      const shapeType = element.data?.shapeType || 'rectangle';
      const fill = element.data?.fill ?? "#f4d3c2";
      const stroke = element.data?.stroke;
      const strokeWidth = Number(element.data?.strokeWidth ?? 0);
      const hasStroke = Boolean(stroke) && strokeWidth > 0;
      
      // Rectangle and circle use CSS, others use SVG
      if (shapeType === 'rectangle' || shapeType === 'circle') {
        return <div style={style} />;
      }
      
      // SVG shapes
      const svgProps = {
        width: "100%",
        height: "100%",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        style: { display: 'block' }
      };
      
      const shapeProps = {
        fill: fill,
        stroke: hasStroke ? stroke : "none",
        strokeWidth: hasStroke ? (strokeWidth / Math.min(element.width, element.height) * 100) : 0,
      };
      
      let svgContent;
      switch (shapeType) {
        case 'triangle':
          svgContent = <polygon points="50,5 95,95 5,95" {...shapeProps} />;
          break;
        case 'star':
          svgContent = <polygon points="50,5 61,40 98,40 68,62 79,97 50,75 21,97 32,62 2,40 39,40" {...shapeProps} />;
          break;
        case 'heart':
          svgContent = <path d="M50,88 C20,60 5,40 5,25 C5,10 20,5 35,5 C45,5 50,15 50,15 C50,15 55,5 65,5 C80,5 95,10 95,25 C95,40 80,60 50,88 Z" {...shapeProps} />;
          break;
        case 'hexagon':
          svgContent = <polygon points="50,3 93,25 93,75 50,97 7,75 7,25" {...shapeProps} />;
          break;
        case 'diamond':
          svgContent = <polygon points="50,5 95,50 50,95 5,50" {...shapeProps} />;
          break;
        case 'pentagon':
          svgContent = <polygon points="50,5 97,38 79,95 21,95 3,38" {...shapeProps} />;
          break;
        case 'octagon':
          svgContent = <polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" {...shapeProps} />;
          break;
        case 'arrow-right':
          svgContent = <polygon points="5,30 60,30 60,10 95,50 60,90 60,70 5,70" {...shapeProps} />;
          break;
        case 'arrow-up':
          svgContent = <polygon points="50,5 90,40 70,40 70,95 30,95 30,40 10,40" {...shapeProps} />;
          break;
        case 'cross':
          svgContent = <polygon points="35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35" {...shapeProps} />;
          break;
        case 'line-horizontal':
          svgContent = <rect x="0" y="45" width="100" height="10" {...shapeProps} />;
          break;
        case 'line-vertical':
          svgContent = <rect x="45" y="0" width="10" height="100" {...shapeProps} />;
          break;
        default:
          return <div style={style} />;
      }
      
      return (
        <div style={{ ...style, background: 'transparent', backgroundColor: 'transparent' }}>
          <svg {...svgProps}>{svgContent}</svg>
        </div>
      );
    }

    if (element.type === "upload") {
      const isCapturedOverlay = element.data?.__capturedOverlay === true;
      const hasImage = element.data?.image && element.data.image.length > 50;
      const imageTooLarge = element.data?._imageTooLarge === true;
      
      console.log("🖼️ Upload element rendering:", {
        id: element.id?.slice(0, 8),
        width: element.width,
        height: element.height,
        hasImage,
        imageTooLarge,
        imageUrl: element.data?.image?.substring(0, 120),
      });
      
      return (
        <div
          style={style}
          className={
            isCapturedOverlay ? "captured-photo-overlay-content" : undefined
          }
          data-captured-overlay={isCapturedOverlay ? "true" : undefined}
          data-export-allow={isCapturedOverlay ? "photo-overlay" : undefined}
        >
          {hasImage && !imageTooLarge ? (
            <img
              src={element.data.image}
              alt="Unggahan"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "fill",
                pointerEvents: "none",
                display: "block",
              }}
              draggable={false}
              onError={(e) => {
                console.error("❌ Failed to load upload image:", element.id?.slice(0, 8), "src:", element.data.image?.substring(0, 80));
                // Show a fallback placeholder instead of hiding
                const parent = e.target.parentElement;
                e.target.style.display = "none";
                if (parent && !parent.querySelector('.upload-error-placeholder')) {
                  const placeholder = document.createElement('div');
                  placeholder.className = 'upload-error-placeholder';
                  placeholder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(254,202,202,0.3);border:2px dashed rgba(239,68,68,0.5);color:#991b1b;font-size:11px;text-align:center;padding:8px;';
                  placeholder.textContent = '⚠️ Gambar gagal dimuat';
                  parent.appendChild(placeholder);
                }
              }}
            />
          ) : (
            <div 
              className="text-xs font-medium uppercase tracking-widest"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: imageTooLarge ? "rgba(254, 202, 202, 0.3)" : "rgba(226, 232, 240, 0.5)",
                border: imageTooLarge ? "2px dashed rgba(239, 68, 68, 0.5)" : "2px dashed rgba(148, 163, 184, 0.5)",
                color: imageTooLarge ? "#991b1b" : "#64748b",
                padding: "8px",
                textAlign: "center",
              }}
            >
              <UploadCloud size={24} style={{ marginBottom: "4px", opacity: 0.5 }} />
              {element.data?.label ?? "Unggahan"}
            </div>
          )}
        </div>
      );
    }

    if (element.type === "background-photo") {
      return (
        <div style={{ ...style, position: "relative" }} ref={ref}>
          {element.data?.image ? (
            <img
              src={element.data.image}
              alt="Background"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "fill",
                pointerEvents: "none",
                display: "block",
              }}
              draggable={false}
            />
          ) : (
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {element.data?.label ?? "Background"}
            </div>
          )}
        </div>
      );
    }

    if (element.type === "photo") {
      // Photo slot: Dummy placeholder that shows position & size for real photos later
      // This is the "recipe" that Editor will use to place real captured photos
      const slotNumber =
        (resolvedSlotNumber ?? element.data?.slotNumber) || element.data?.label || null;

      const rotationDegrees = Number.isFinite(element?.rotation)
        ? element.rotation
        : 0;

      return (
        <div
          style={{
            ...style,
            background: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
            position: "relative",
          }}
          className="h-full w-full creator-photo-placeholder"
          data-photo-placeholder="true"
        >
          {/* Dashed border */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              border: "2px dashed rgb(129 140 248 / 0.7)",
              borderRadius: "inherit",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          />

          {/* Camera icon placeholder */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              color: "rgb(165 180 252 / 0.4)",
              pointerEvents: "none",
              width: "40%",
              height: "40%",
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>

          {/* Slot number (large centered) or small pill label */}
          {typeof slotNumber === 'number' ? (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 1,
            }}>
              <span style={{
                fontSize: `${Math.round(Math.min(element.width, element.height) * 0.5)}px`,
                fontWeight: 900,
                color: "rgb(99 102 241 / 0.45)",
                lineHeight: 0.85,
                userSelect: "none",
                letterSpacing: "-0.02em",
                fontFamily: "system-ui, -apple-system, sans-serif",
                transform: "translateY(-5%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {slotNumber}
              </span>
            </div>
          ) : (
            <div
              style={{
                position: "relative",
                zIndex: 1,
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.9)",
                backdropFilter: "blur(4px)",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "rgb(79 70 229)",
                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
                pointerEvents: "none",
                border: "1px solid rgb(199 210 254)",
              }}
            >
              📷 {slotNumber ?? "Area Foto"}
            </div>
          )}

          {/* Selection indicator */}
          {isSelected && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                border: "2px solid rgb(99 102 241)",
                borderRadius: "inherit",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      );
    }

    return <div className="h-full w-full rounded-lg bg-white/80" />;
  }
);

function CanvasPreviewComponent({
  elements,
  selectedElementId,
  canvasBackground,
  aspectRatio = "9:16",
  previewConstraints = null,
  onSelect,
  onUpdate,
  onBringToFront,
  onRemove,
  onDuplicate,
  onToggleLock,
  onResizeUpload,
  isBackgroundLocked = false,
  onToggleBackgroundLock,
  onResetBackground,
  passthroughFrameOverlayPointerEvents = false,
}) {
  // State for text editing mode
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [showBackgroundToolbar, setShowBackgroundToolbar] = useState(false);
  const [hoveredElementId, setHoveredElementId] = useState(null);
  const textInputRef = useRef(null);
  const editingTextIdRef = useRef(null);
  const editingTextValueRef = useRef("");
  // Lock previewScale while editing text to prevent iOS keyboard resize from shrinking canvas
  const lockedScaleRef = useRef(null);
  const backgroundTouchRef = useRef(null);
  const interactionMetaRef = useRef(new Map());
  const backgroundInteractionRef = useRef(createInteractionState());

  const rotateGestureRef = useRef({
    isActive: false,
    elementId: null,
    pointerId: null,
    startY: 0,
    startRotation: 0,
    rafId: null,
    pendingRotation: null,
    suppressClickUntil: 0,
    // 1 when button is on the right (default), -1 when on the left
    directionSign: 1,
  });

  // Vertical drag sensitivity: drag down => clockwise (positive degrees)
  const ROTATE_DEG_PER_PX = 0.45;
  const ROTATE_BUTTON_SIZE = 64;
  const ROTATE_BUTTON_GAP = 12;
  const ROTATE_BUTTON_OFFSET = ROTATE_BUTTON_SIZE + ROTATE_BUTTON_GAP;

  const scheduleRotationUpdate = useCallback(
    (elementId, nextRotation) => {
      if (!elementId || typeof onUpdate !== "function") {
        return;
      }
      const meta = rotateGestureRef.current;
      meta.pendingRotation = nextRotation;
      if (meta.rafId != null) {
        return;
      }
      meta.rafId = requestAnimationFrame(() => {
        meta.rafId = null;
        const pending = meta.pendingRotation;
        meta.pendingRotation = null;
        if (pending == null) {
          return;
        }
        onUpdate(elementId, { rotation: pending });
      });
    },
    [onUpdate]
  );

  const beginRotateGesture = useCallback(
    (event, element, placeLeft = false) => {
      if (!element?.id) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const meta = rotateGestureRef.current;
      meta.isActive = true;
      meta.elementId = element.id;
      meta.pointerId = event.pointerId;
      meta.startY = Number(event.clientY) || 0;
      meta.startRotation = Number(element.rotation) || 0;
      meta.pendingRotation = null;
      // When button is on the left, drag-down should rotate counter-clockwise
      meta.directionSign = placeLeft ? -1 : 1;

      try {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      } catch {
        // no-op
      }
    },
    []
  );

  const updateRotateGesture = useCallback(
    (event) => {
      const meta = rotateGestureRef.current;
      if (!meta.isActive) {
        return;
      }
      if (meta.pointerId != null && event.pointerId !== meta.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const dy = (Number(event.clientY) || 0) - (Number(meta.startY) || 0);
      const sign = meta.directionSign ?? 1;
      const nextRotation =
        (Number(meta.startRotation) || 0) + dy * sign * ROTATE_DEG_PER_PX;
      scheduleRotationUpdate(meta.elementId, nextRotation);
    },
    [scheduleRotationUpdate]
  );

  const endRotateGesture = useCallback(
    (event) => {
      const meta = rotateGestureRef.current;
      if (!meta.isActive) {
        return;
      }
      if (meta.pointerId != null && event.pointerId !== meta.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      try {
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {
        // no-op
      }

      meta.isActive = false;
      meta.elementId = null;
      meta.pointerId = null;
      meta.startY = 0;
      meta.startRotation = 0;
      meta.pendingRotation = null;

      // Prevent the synthetic click after pointer-up from selecting
      // whatever is behind the floating rotate button.
      meta.suppressClickUntil =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) +
        350;

      if (meta.rafId != null) {
        cancelAnimationFrame(meta.rafId);
        meta.rafId = null;
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleClickCapture = (event) => {
      const meta = rotateGestureRef.current;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (meta.suppressClickUntil && now < meta.suppressClickUntil) {
        meta.suppressClickUntil = 0;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      }
    };

    window.addEventListener("click", handleClickCapture, true);
    return () => {
      window.removeEventListener("click", handleClickCapture, true);
    };
  }, []);

  // Handler untuk memulai edit teks (double-click)
  const handleDoubleClickText = (element) => {
    if (element.type === "text") {
      // Lock scale SYNCHRONOUSLY before React re-renders and before iOS keyboard fires resize
      lockedScaleRef.current = previewScale;
      editingTextIdRef.current = element.id;
      editingTextValueRef.current = element.data?.text ?? "";
      setEditingTextId(element.id);
      setEditingTextValue(element.data?.text ?? "");
      // Focus textarea after state update
      setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus();
          textInputRef.current.select();
        }
      }, 10);
    }
  };

  // Handler untuk mengubah teks
  const handleTextChange = useCallback((value) => {
    editingTextValueRef.current = value;
    setEditingTextValue(value);
  }, []);

  const finishTextEditing = useCallback(
    ({ commit } = { commit: true }) => {
      const currentEditingId = editingTextIdRef.current;

      if (commit && currentEditingId) {
        onUpdate(currentEditingId, {
          data: { text: editingTextValueRef.current },
        });
      }

      lockedScaleRef.current = null;
      editingTextIdRef.current = null;
      editingTextValueRef.current = "";
      setEditingTextId(null);
      setEditingTextValue("");
    },
    [onUpdate]
  );

  // Handler untuk selesai edit (blur)
  const handleTextBlur = useCallback(() => {
    finishTextEditing({ commit: true });
  }, [finishTextEditing]);

  const stopToolbarInteraction = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const runToolbarAction = useCallback((event, action) => {
    stopToolbarInteraction(event);
    action?.();
  }, [stopToolbarInteraction]);

  // Reset editing saat element berubah
  useEffect(() => {
    if (selectedElementId !== editingTextId) {
      finishTextEditing({ commit: true });
    }
  }, [selectedElementId, editingTextId, finishTextEditing]);

  const clearHoldTimer = (meta) => {
    if (meta?.holdTimer) {
      clearTimeout(meta.holdTimer);
      meta.holdTimer = null;
    }
  };

  const startHoldTimer = (meta) => {
    clearHoldTimer(meta);
    meta.hadHold = false;
    if (typeof window === "undefined") {
      return;
    }
    meta.holdTimer = window.setTimeout(() => {
      meta.hadHold = true;
      resetRndPosition(meta);
    }, HOLD_THRESHOLD_MS);
  };

  useEffect(() => {
    const elementIds = new Set(elements.map((element) => element.id));
    interactionMetaRef.current.forEach((meta, key) => {
      if (!elementIds.has(key)) {
        clearHoldTimer(meta);
        interactionMetaRef.current.delete(key);
      }
    });
  }, [elements]);

  useEffect(
    () => () => {
      interactionMetaRef.current.forEach((meta) => clearHoldTimer(meta));
      clearHoldTimer(backgroundInteractionRef.current);
    },
    []
  );

  const getInteractionMeta = (id) => {
    if (!interactionMetaRef.current.has(id)) {
      interactionMetaRef.current.set(id, createInteractionState());
    }
    return interactionMetaRef.current.get(id);
  };

  const sortedElements = useMemo(() => {
    const sorted = [...elements].sort(
      (a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1)
    );
    console.log("🎨 [CanvasPreview] sortedElements:", {
      total: sorted.length,
      elements: sorted.map((el) => ({
        id: el.id?.slice(0, 8),
        type: el.type,
        zIndex: el.zIndex,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
      })),
    });
    return sorted;
  }, [elements]);

  const canvasDimensions = useMemo(() => {
    const defaultDimensions = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

    if (typeof aspectRatio !== "string") {
      return defaultDimensions;
    }

    const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
    const ratioWidth =
      Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : null;
    const ratioHeight =
      Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : null;

    if (!ratioWidth || !ratioHeight) {
      return defaultDimensions;
    }

    if (ratioHeight >= ratioWidth) {
      const height = Math.round((CANVAS_WIDTH * ratioHeight) / ratioWidth);
      return { width: CANVAS_WIDTH, height };
    }

    const width = Math.round((CANVAS_HEIGHT * ratioWidth) / ratioHeight);
    return { width, height: CANVAS_HEIGHT };
  }, [aspectRatio]);

  const resolvedPhotoSlotNumbers = useMemo(() => {
    const photoElements = (Array.isArray(elements) ? elements : []).filter(
      (element) => element?.type === "photo"
    );

    if (photoElements.length === 0) return {};

    const slots = photoElements.map((element) => ({
      left: parseNumeric(element?.x, 0) / Math.max(canvasDimensions.width, 1),
      top: parseNumeric(element?.y, 0) / Math.max(canvasDimensions.height, 1),
      width: parseNumeric(element?.width, 0) / Math.max(canvasDimensions.width, 1),
      height: parseNumeric(element?.height, 0) / Math.max(canvasDimensions.height, 1),
    }));

    const { slotNumberMap } = buildSlotMaps(slots);
    const byElementId = {};

    photoElements.forEach((element, index) => {
      const existing = Number(element?.data?.slotNumber);
      if (Number.isFinite(existing) && existing > 0) {
        byElementId[element.id] = existing;
        return;
      }
      byElementId[element.id] = slotNumberMap[index] ?? index + 1;
    });

    return byElementId;
  }, [elements, canvasDimensions.width, canvasDimensions.height]);

  const { maxWidth, maxHeight } = useMemo(() => {
    if (!previewConstraints) {
      return {
        maxWidth: canvasDimensions.width,
        maxHeight: canvasDimensions.height,
      };
    }

    return {
      maxWidth: previewConstraints.maxWidth ?? canvasDimensions.width,
      maxHeight: previewConstraints.maxHeight ?? canvasDimensions.height,
    };
  }, [previewConstraints, canvasDimensions.width, canvasDimensions.height]);

  const previewScale = useMemo(() => {
    const scaleX = maxWidth / canvasDimensions.width;
    const scaleY = maxHeight / canvasDimensions.height;
    const scale = Math.min(scaleX, scaleY, 1);
    console.log("📏 [CanvasPreview] previewScale calculated:", {
      canvasDimensions,
      maxWidth,
      maxHeight,
      scaleX,
      scaleY,
      previewScale: scale,
    });
    return scale;
  }, [maxWidth, maxHeight, canvasDimensions.width, canvasDimensions.height]);

  // Freeze the visual render scale while a text element is being edited,
  // so that iOS keyboard resize does not cause the canvas to shrink mid-edit.
  // Scale is locked SYNCHRONOUSLY in handleDoubleClickText (before any re-render)
  // and released in handleTextBlur / selection-change effect.

  const effectiveScale = lockedScaleRef.current !== null
    ? lockedScaleRef.current
    : previewScale;

  const scaledSize = useMemo(
    () => ({
      width: canvasDimensions.width * effectiveScale,
      height: canvasDimensions.height * effectiveScale,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasDimensions.width, canvasDimensions.height, effectiveScale]
  );

  const clampBackgroundPosition = (width, height, x, y) => {
    // Background photo must always COVER the entire canvas
    // This means photo edges must be at or beyond canvas edges

    // For X axis:
    // - If photo wider than canvas: can shift left (negative x) or stay at 0
    // - Photo's left edge can be at most at x=0 (aligned with canvas left)
    // - Photo's right edge must be at least at canvasWidth (x + width >= canvasWidth)
    //   → x >= canvasWidth - width

    let minX, maxX;
    if (width >= canvasDimensions.width) {
      // Photo is wider than canvas
      minX = canvasDimensions.width - width; // Can shift left (negative value)
      maxX = 0; // Can't shift right beyond 0
    } else {
      // Photo is narrower than canvas - center it (shouldn't happen with cover mode)
      minX = maxX = Math.round((canvasDimensions.width - width) / 2);
    }

    // For Y axis: same logic
    let minY, maxY;
    if (height >= canvasDimensions.height) {
      // Photo is taller than canvas
      minY = canvasDimensions.height - height; // Can shift up (negative value)
      maxY = 0; // Can't shift down beyond 0
    } else {
      // Photo is shorter than canvas - center it (shouldn't happen with cover mode)
      minY = maxY = Math.round((canvasDimensions.height - height) / 2);
    }

    console.log("[clampBackgroundPosition]", {
      input: { width, height, x, y },
      canvas: {
        width: canvasDimensions.width,
        height: canvasDimensions.height,
      },
      limits: { minX, maxX, minY, maxY },
    });

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  const backgroundMeta = backgroundInteractionRef.current;

  const handleBackgroundPointerDown = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    backgroundMeta.pointerActive = true;
    backgroundMeta.hadDrag = false;
    backgroundMeta.didTriggerTap = false;
    backgroundMeta.hadHold = false;
    startHoldTimer(backgroundMeta);
    onSelect("background", { interaction: "pointerdown" });
  };

  const handleBackgroundPointerUp = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (!backgroundMeta.pointerActive) {
      return;
    }
    backgroundMeta.pointerActive = false;
    clearHoldTimer(backgroundMeta);
    if (backgroundMeta.hadHold) {
      backgroundMeta.hadHold = false;
      return;
    }
    backgroundMeta.didTriggerTap = true;
    onSelect("background", { interaction: "tap" });
  };

  const handleBackgroundPointerCancel = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    backgroundMeta.pointerActive = false;
    backgroundMeta.hadDrag = false;
    backgroundMeta.didTriggerTap = false;
    backgroundMeta.hadHold = false;
    clearHoldTimer(backgroundMeta);
  };

  const handleBackgroundClick = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (backgroundMeta.didTriggerTap) {
      backgroundMeta.didTriggerTap = false;
      return;
    }
    // Toggle background toolbar visibility
    setShowBackgroundToolbar(prev => !prev);
    onSelect("background", { interaction: "tap" });
  };

  // Hide background toolbar when an element is selected
  useEffect(() => {
    if (selectedElementId && selectedElementId !== "background") {
      setShowBackgroundToolbar(false);
    }
  }, [selectedElementId]);

  // Add native touch event listeners for background photo
  // Ultra-smooth pinch-to-zoom using CSS transforms
  useEffect(() => {
    const backgroundElement = elements.find(
      (el) => el.type === "background-photo"
    );
    if (!backgroundElement || !backgroundElement.id) {
      return;
    }

    const meta = getInteractionMeta(backgroundElement.id);
    let gestureState = null;
    let cleanupFn = null;
    let isMounted = true;

    // Setup with a delay to ensure Rnd is mounted
    const timer = setTimeout(() => {
      if (!isMounted) return;

      const elementDom = backgroundTouchRef.current;
      if (!elementDom) {
        console.warn("❌ Background element DOM not found for touch listeners");
        return;
      }

      console.log("✅ Touch listeners attached to background photo");

      const handleTouchStart = (e) => {
        // Prevent double handling from React synthetic events
        e.stopImmediatePropagation();
        console.log("👆 Touch start:", e.touches.length, "fingers");

        // Pinch: 2 fingers
        if (e.touches.length === 2) {
          e.preventDefault();
          e.stopPropagation();

          const touch1 = e.touches[0];
          const touch2 = e.touches[1];

          const startDistance = Math.hypot(
            touch1.clientX - touch2.clientX,
            touch1.clientY - touch2.clientY
          );

          gestureState = {
            type: "pinch",
            startDistance,
            startWidth: backgroundElement.width,
            startHeight: backgroundElement.height,
            startX: backgroundElement.x,
            startY: backgroundElement.y,
            currentScale: 1,
          };

          elementDom.style.willChange = "transform";
          meta.pointerActive = false;
          meta.isDragging = false;

          console.log("🤏 Pinch started");
        }
        // Drag: 1 finger
        else if (e.touches.length === 1) {
          e.preventDefault();
          e.stopPropagation();

          const touch = e.touches[0];

          gestureState = {
            type: "drag",
            startClientX: touch.clientX,
            startClientY: touch.clientY,
            startX: backgroundElement.x,
            startY: backgroundElement.y,
          };

          elementDom.style.willChange = "transform";

          console.log("👉 Drag started");
        }
      };

      const handleTouchMove = (e) => {
        if (!gestureState) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        // Pinch zoom
        if (gestureState.type === "pinch" && e.touches.length === 2) {
          const touch1 = e.touches[0];
          const touch2 = e.touches[1];

          const currentDistance = Math.hypot(
            touch1.clientX - touch2.clientX,
            touch1.clientY - touch2.clientY
          );

          const scale = currentDistance / gestureState.startDistance;
          gestureState.currentScale = scale;

          // Calculate pinch center NOW (realtime - this is the key!)
          const centerX = (touch1.clientX + touch2.clientX) / 2;
          const centerY = (touch1.clientY + touch2.clientY) / 2;

          const canvasEl = document.getElementById("creator-canvas");
          if (!canvasEl) return;

          const canvasRect = canvasEl.getBoundingClientRect();
          const pinchCenterX = (centerX - canvasRect.left) / previewScale;
          const pinchCenterY = (centerY - canvasRect.top) / previewScale;

          // Calculate new dimensions
          const aspectRatio =
            backgroundElement.data?.imageAspectRatio ||
            gestureState.startWidth / gestureState.startHeight;
          const newWidth = gestureState.startWidth * scale;
          const newHeight = newWidth / aspectRatio;

          // Calculate where pinch center is INSIDE the ORIGINAL element (at start)
          const relativeX =
            (pinchCenterX - gestureState.startX) / gestureState.startWidth;
          const relativeY =
            (pinchCenterY - gestureState.startY) / gestureState.startHeight;

          // Keep pinch center at the same position
          const newX = pinchCenterX - newWidth * relativeX;
          const newY = pinchCenterY - newHeight * relativeY;

          // Store final values
          gestureState.finalWidth = newWidth;
          gestureState.finalHeight = newHeight;
          gestureState.finalX = newX;
          gestureState.finalY = newY;

          // Calculate transform
          const translateX = newX - gestureState.startX;
          const translateY = newY - gestureState.startY;

          // Apply CSS transform
          elementDom.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
          elementDom.style.transformOrigin = "0 0";
        }
        // Drag
        else if (gestureState.type === "drag" && e.touches.length === 1) {
          const touch = e.touches[0];

          const deltaX =
            (touch.clientX - gestureState.startClientX) / previewScale;
          const deltaY =
            (touch.clientY - gestureState.startClientY) / previewScale;

          // Store final position
          gestureState.finalX = gestureState.startX + deltaX;
          gestureState.finalY = gestureState.startY + deltaY;

          // Apply CSS transform
          elementDom.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        }
      };

      const handleTouchEnd = (e) => {
        if (!gestureState) return;

        console.log("✋ Touch end:", gestureState.type);

        // Use pre-calculated final values
        let finalUpdate = null;

        if (gestureState.type === "pinch") {
          finalUpdate = {
            width: gestureState.finalWidth,
            height: gestureState.finalHeight,
            x: gestureState.finalX,
            y: gestureState.finalY,
          };
        } else if (gestureState.type === "drag") {
          finalUpdate = {
            x: gestureState.finalX,
            y: gestureState.finalY,
          };
        }

        // Update state
        if (finalUpdate) {
          if (
            typeof finalUpdate.x === "number" &&
            typeof finalUpdate.y === "number"
          ) {
            meta.startX = finalUpdate.x;
            meta.startY = finalUpdate.y;
            if (meta?.rndRef?.updatePosition) {
              meta.rndRef.updatePosition({
                x: finalUpdate.x,
                y: finalUpdate.y,
              });
            }
          }

          if (
            typeof finalUpdate.width === "number" &&
            typeof finalUpdate.height === "number"
          ) {
            meta.startWidth = finalUpdate.width;
            meta.startHeight = finalUpdate.height;
            if (meta?.rndRef?.updateSize) {
              meta.rndRef.updateSize({
                width: finalUpdate.width,
                height: finalUpdate.height,
              });
            }
          }

          if (elementDom) {
            elementDom.style.transform = "";
            elementDom.style.transformOrigin = "";
            elementDom.style.willChange = "";
          }

          onUpdate(backgroundElement.id, finalUpdate);
        }

        gestureState = null;
        meta.pointerActive = false;
        meta.isDragging = false;
      };

      elementDom.addEventListener("touchstart", handleTouchStart, {
        passive: false,
        capture: true,
      });
      elementDom.addEventListener("touchmove", handleTouchMove, {
        passive: false,
        capture: true,
      });
      elementDom.addEventListener("touchend", handleTouchEnd, {
        passive: false,
        capture: true,
      });
      elementDom.addEventListener("touchcancel", handleTouchEnd, {
        passive: false,
        capture: true,
      });

      // Store cleanup function
      cleanupFn = () => {
        if (!elementDom) return;
        elementDom.removeEventListener("touchstart", handleTouchStart, {
          capture: true,
        });
        elementDom.removeEventListener("touchmove", handleTouchMove, {
          capture: true,
        });
        elementDom.removeEventListener("touchend", handleTouchEnd, {
          capture: true,
        });
        elementDom.removeEventListener("touchcancel", handleTouchEnd, {
          capture: true,
        });
        console.log("🔴 Touch listeners removed");
      };
    }, 100);

    // Cleanup
    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (typeof cleanupFn === "function") {
        cleanupFn();
      }
    };
  }, [elements, previewScale, onUpdate, getInteractionMeta]);

  return (
    <div
      className="create-preview__canvas-wrapper"
      style={{
        width: `${scaledSize.width}px`,
        height: `${scaledSize.height}px`,
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Background Toolbar - appears above canvas when background is clicked */}
      {showBackgroundToolbar && selectedElementId === "background" && (
        <div
          style={{
            position: "absolute",
            top: "-60px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "10px",
            zIndex: 10001,
            pointerEvents: "auto",
          }}
        >
          {/* Lock/Unlock Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleBackgroundLock?.();
            }}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: isBackgroundLocked
                ? "linear-gradient(135deg, #f7a998 0%, #e89985 100%)"
                : "#ffffff",
              border: "3px solid #f7a998",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: isBackgroundLocked
                ? "0 4px 12px rgba(247, 169, 152, 0.4)"
                : "0 2px 8px rgba(0, 0, 0, 0.15)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title={isBackgroundLocked ? "Buka Kunci Background" : "Kunci Background"}
          >
            <img
              src={isBackgroundLocked ? lockIcon : unlockIcon}
              alt={isBackgroundLocked ? "Locked" : "Unlocked"}
              style={{ width: "28px", height: "28px" }}
            />
          </button>

          {/* Reset/Delete Background Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isBackgroundLocked) {
                onResetBackground?.();
                setShowBackgroundToolbar(false);
              }
            }}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: isBackgroundLocked ? "#e5e7eb" : "#ffffff",
              border: "3px solid #f7a998",
              cursor: isBackgroundLocked ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
              transition: "all 0.2s ease",
              opacity: isBackgroundLocked ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isBackgroundLocked) e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title={isBackgroundLocked ? "Background Terkunci" : "Reset Background"}
            disabled={isBackgroundLocked}
          >
            <img
              src={trashIcon}
              alt="Reset Background"
              style={{ width: "28px", height: "28px" }}
            />
          </button>
        </div>
      )}

      <Motion.div
        key={`canvas-${aspectRatio}-${canvasDimensions.width}-${canvasDimensions.height}`}
        id="creator-canvas"
        className="relative mx-auto overflow-hidden shadow-[0_42px_90px_rgba(58,38,32,0.28)]"
        style={{
          background: canvasBackground,
          border: "none",
          outline: "4px solid rgba(92, 62, 48, 0.65)",
          outlineOffset: "-4px",
          boxShadow:
            "0 42px 90px rgba(58,38,32,0.28), 0 0 0 2px rgba(255,255,255,0.18) inset",
          borderRadius: 0,
          width: `${canvasDimensions.width}px`,
          height: `${canvasDimensions.height}px`,
          position: "absolute",
          top: "50%",
          left: "50%",
          overflow: "hidden",
          touchAction: "none",
          userSelect: "none",
          transform: `translate(-50%, -50%) scale(${effectiveScale})`,
          transformOrigin: "50% 50%",
        }}
        onPointerDown={handleBackgroundPointerDown}
        onTouchStart={handleBackgroundPointerDown}
        onPointerUp={handleBackgroundPointerUp}
        onTouchEnd={handleBackgroundPointerUp}
        onPointerCancel={handleBackgroundPointerCancel}
        onTouchCancel={handleBackgroundPointerCancel}
        onClick={handleBackgroundClick}
        onWheel={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
      >
        {sortedElements.map((element) => {
          // Debug ALL elements to see their sizes
          console.log(`� [Rnd] Element ${element.type}:`, {
            id: element.id?.slice(0, 8),
            width: element.width,
            height: element.height,
            x: element.x,
            y: element.y,
            zIndex: element.zIndex,
          });
          const isSelected = selectedElementId === element.id;
          const isBackgroundPhoto = element.type === "background-photo";
          const isHovered = hoveredElementId === element.id;
          const backgroundAspectRatio = isBackgroundPhoto
            ? Number(element.data?.imageAspectRatio) > 0
              ? Number(element.data?.imageAspectRatio)
              : element.width > 0 && element.height > 0
              ? element.width / element.height
              : 1
            : 1;
          const safeAspectRatio =
            backgroundAspectRatio > 0 ? backgroundAspectRatio : 1;

          // Check if upload element has aspect ratio
          const isUploadElement = element.type === "upload";
          const uploadAspectRatio =
            isUploadElement && element.data?.imageAspectRatio
              ? element.data.imageAspectRatio
              : null;

          const baseClassName = isBackgroundPhoto
            ? "transition-colors"
            : "border border-transparent transition-colors";

          const isCapturedOverlayElement =
            element.type === "upload" &&
            (element.data?.__capturedOverlay === true ||
              (passthroughFrameOverlayPointerEvents && element.data?.__isOverlay === true));
          const elementClassName = [
            baseClassName,
            "creator-element",
            `creator-element--type-${element.type}`,
            isCapturedOverlayElement ? "creator-element--captured-overlay" : "",
            isSelected ? "creator-element--selected" : "",
          ]
            .filter(Boolean)
            .join(" ");

          // For background photo: calculate minimum size to COVER canvas
          // Image must always fill the entire canvas
          const canvasAspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
          const backgroundMinWidth = isBackgroundPhoto
            ? safeAspectRatio > canvasAspectRatio
              ? Math.round(CANVAS_HEIGHT * safeAspectRatio) // wider image - height = canvas, width > canvas
              : CANVAS_WIDTH // taller/same image - width = canvas
            : DEFAULT_ELEMENT_MIN;
          const backgroundMinHeight = isBackgroundPhoto
            ? safeAspectRatio > canvasAspectRatio
              ? CANVAS_HEIGHT // wider image - height = canvas
              : Math.round(CANVAS_WIDTH / safeAspectRatio) // taller/same image - width = canvas, height > canvas
            : DEFAULT_ELEMENT_MIN;

          const meta = getInteractionMeta(element.id);
          const elementBorderRadius = getElementBorderRadius(element);

          const handlePointerDown = (event) => {
            // Debug logging
            if (isBackgroundPhoto && event.touches) {
              console.log("[Background Photo PointerDown]", {
                touchCount: event.touches.length,
                isBackgroundPhoto,
                eventType: event.type,
              });
            }

            if (meta.pointerActive || meta.isResizing) {
              return;
            }

            const targetClassList = event.target?.classList;
            // Use closest() so we catch: our react-rnd-handle divs, the
            // creator-resize-wrapper, AND re-resizable's own internal wrapper
            // which sits BETWEEN them and is the actual event.target when
            // clicking the visible handle dot/bar.
            const isHandle = Boolean(
              event.target?.closest?.(
                '[class*="react-rnd-handle"], [class*="creator-resize-wrapper"]'
              ) ||
              (targetClassList &&
                Array.from(targetClassList).some(
                  (className) =>
                    className.includes("react-rnd-handle") ||
                    className.includes("creator-resize-wrapper")
                ))
            );

            if (isHandle) {
              event.stopPropagation();
              return;
            }

            event.stopPropagation();
            // NOTE: do NOT call event.preventDefault() here — re-resizable uses
            // mousedown/mousemove/mouseup events, and preventDefault() on pointerdown
            // blocks the browser from synthesizing those mouse compatibility events,
            // which breaks resize handle dragging entirely.

            // Background photo touch events handled by native listener
            // Skip React event handlers to avoid conflicts
            if (isBackgroundPhoto && event.touches) {
              return;
            }

            const clientX = event.touches?.[0]?.clientX ?? event.clientX;
            const clientY = event.touches?.[0]?.clientY ?? event.clientY;

            meta.pointerActive = true;
            meta.hadDrag = false;
            meta.didTriggerTap = false;
            meta.hadHold = false;
            meta.totalDistance = 0;
            meta.startX = element.x;
            meta.startY = element.y;
            meta.isDragging = false;
            meta.isResizing = false;
            meta.dragStartClientX = clientX;
            meta.dragStartClientY = clientY;
            meta.dragStartElementX = element.x;
            meta.dragStartElementY = element.y;

            // DISABLED: Auto bring-to-front on click
            // User must explicitly use layer control buttons to change z-index
            // This gives users full control over layering

            if (!isSelected) {
              onSelect(element.id, { interaction: "pointerdown" });
              // Keep pointer tracking active so element can be dragged immediately
              // on first interaction after selection.
            }

            startHoldTimer(meta);
          };

          const handlePointerMove = (event) => {
            if (meta.isResizing || element.isLocked) {
              return;
            }

            // Background photo touch events handled by native listener
            if (isBackgroundPhoto && event.touches) {
              return;
            }

            if (!meta.pointerActive) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            const clientX = event.touches?.[0]?.clientX ?? event.clientX;
            const clientY = event.touches?.[0]?.clientY ?? event.clientY;

            if (
              meta.dragStartClientX === null ||
              meta.dragStartClientY === null
            ) {
              return;
            }

            const rawDeltaX = (clientX - meta.dragStartClientX) / previewScale;
            const rawDeltaY = (clientY - meta.dragStartClientY) / previewScale;

            const deltaX = rawDeltaX;
            const deltaY = rawDeltaY;

            const totalDelta = Math.abs(deltaX) + Math.abs(deltaY);
            meta.totalDistance = totalDelta;

            if (!meta.hadDrag && totalDelta >= DRAG_THRESHOLD_PX) {
              meta.hadDrag = true;
              meta.didTriggerTap = false;
              meta.isDragging = true;
              clearHoldTimer(meta);
            }

            if (meta.isDragging) {
              const newX = meta.dragStartElementX + deltaX;
              const newY = meta.dragStartElementY + deltaY;

              if (isBackgroundPhoto) {
                // Background photo: completely free - can go anywhere
                onUpdate(element.id, { x: newX, y: newY });
              } else {
                // Regular elements: must stay within canvas bounds
                const clampedX = Math.max(
                  0,
                  Math.min(canvasDimensions.width - element.width, newX)
                );
                const clampedY = Math.max(
                  0,
                  Math.min(canvasDimensions.height - element.height, newY)
                );
                onUpdate(element.id, { x: clampedX, y: clampedY });
              }
            }
          };

          const handlePointerUp = (event) => {
            event.stopPropagation();
            clearHoldTimer(meta);

            // End pinch gesture
            if (meta.isPinching) {
              meta.isPinching = false;
              meta.pinchStartDistance = null;
              meta.pinchStartWidth = null;
              meta.pinchStartHeight = null;
              meta.pinchStartX = null;
              meta.pinchStartY = null;
              return;
            }

            if (!meta.pointerActive) {
              return;
            }

            if (meta.hadDrag || meta.isDragging) {
              meta.pointerActive = false;
              meta.hadDrag = false;
              meta.isDragging = false;
              meta.totalDistance = 0;
              meta.isResizing = false;
              return;
            }

            meta.pointerActive = false;

            if (meta.hadHold) {
              meta.hadHold = false;
              meta.totalDistance = 0;
              meta.isResizing = false;
              return;
            }

            meta.didTriggerTap = true;
            meta.totalDistance = 0;
            meta.isResizing = false;
          };

          const handlePointerCancel = (event) => {
            event.stopPropagation();
            meta.pointerActive = false;
            meta.hadDrag = false;
            meta.didTriggerTap = false;
            meta.hadHold = false;
            meta.totalDistance = 0;
            meta.isDragging = false;
            meta.isResizing = false;
            meta.isPinching = false;
            meta.pinchStartDistance = null;
            meta.pinchStartWidth = null;
            meta.pinchStartHeight = null;
            meta.pinchStartX = null;
            meta.pinchStartY = null;
            resetRndPosition(meta);
            clearHoldTimer(meta);
          };

          const handleClick = (event) => {
            event.stopPropagation();
            if (meta.didTriggerTap) {
              meta.didTriggerTap = false;
              return;
            }
            onSelect(element.id, { interaction: "tap" });
          };

          // Handle wheel event for background photo zoom (desktop)
          const handleWheel = (event) => {
            if (!isBackgroundPhoto || !isSelected) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            const delta = -event.deltaY;
            // Increased zoom sensitivity for smoother feel
            const zoomFactor = delta > 0 ? 1.1 : 0.9;

            // Maintain aspect ratio - smooth calculation
            const aspectRatio =
              element.data?.imageAspectRatio || element.width / element.height;
            const finalWidth = element.width * zoomFactor;
            const finalHeight = finalWidth / aspectRatio;

            // Get mouse position relative to canvas
            const rect = event.currentTarget.getBoundingClientRect();
            const mouseX = (event.clientX - rect.left) / previewScale;
            const mouseY = (event.clientY - rect.top) / previewScale;

            // Calculate new position to zoom towards mouse
            const scaleChange = finalWidth / element.width;
            const newX = element.x - (mouseX - element.x) * (scaleChange - 1);
            const newY = element.y - (mouseY - element.y) * (scaleChange - 1);

            onUpdate(element.id, {
              width: finalWidth,
              height: finalHeight,
              x: newX,
              y: newY,
            });
          };

          // Compute text font size from both width and height ratios
          const computeTextFontSize = (nextWidth, nextHeight) => {
            // Left/right side handles: only reflow text, don't scale font
            if (meta.resizeDirection === 'left' || meta.resizeDirection === 'right') return null;
            if (
              !Number.isFinite(meta.resizeStartWidth) ||
              meta.resizeStartWidth <= 0 ||
              !Number.isFinite(meta.resizeStartFontSize)
            ) return null;
            const widthRatio = nextWidth / meta.resizeStartWidth;
            // Height ratio is linear: height 2x → font 2x (natural vertical feel)
            // Width ratio is quadratic: width 2x → font 4x (aggressive horizontal scaling)
            const heightScale = Number.isFinite(meta.resizeStartHeight) && meta.resizeStartHeight > 0
              ? nextHeight / meta.resizeStartHeight
              : 1;
            const scale = Math.max(Math.pow(widthRatio, 2), heightScale);
            return Math.round(Math.min(140, Math.max(8, meta.resizeStartFontSize * scale)));
          };

          const applyResizeUpdate = (ref, position, finalizeTextHeight = false) => {
            if (!ref) {
              return;
            }
            const nextWidth = parseFloat(ref.style.width);
            const nextHeight = parseFloat(ref.style.height);
            if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
              return;
            }

            const update = {
              width: nextWidth,
              height: nextHeight,
              x: position.x,
              y: position.y,
            };

            if (element.type === 'text') {
              const newFontSize = computeTextFontSize(nextWidth, nextHeight);
              if (newFontSize !== null) {
                update.data = { fontSize: newFontSize };
                if (finalizeTextHeight) {
                  // On release only: auto-fit height to measured text content
                  const measuredHeight = measureTextHeight(
                    element.data?.text || '',
                    element.data?.fontFamily || 'Inter',
                    newFontSize,
                    nextWidth
                  );
                  if (measuredHeight) {
                    update.height = measuredHeight;
                  }
                } else {
                  // During drag: do NOT override height — react-rnd tracks it internally.
                  // Overriding mid-drag resets rnd's baseline causing a huge jump on release.
                  return onUpdate(element.id, { data: { fontSize: newFontSize } });
                }
              }
            }

            onUpdate(element.id, update);
          };

          return (
            <RotatableRnd
              key={element.id}
              rotation={element.rotation}
              elementX={element.x}
              elementY={element.y}
              elementWidth={element.width}
              elementHeight={element.height}
              rndRef={(instance) => { meta.rndRef = instance; }}
              data-element-id={element.id}
              data-element-type={element.type}
              data-element-width={element.width}
              data-element-height={element.height}
              data-element-zindex={
                Number.isFinite(element.zIndex) ? element.zIndex : undefined
              }
              size={{ width: element.width, height: element.height }}
              position={{ x: element.x, y: element.y }}
              bounds="parent"
              scale={effectiveScale}
              enableResizing={
                isSelected && !isBackgroundPhoto
                  ? (element.type === 'text' ? TEXT_RESIZE_CONFIG : DEFAULT_RESIZE_CONFIG)
                  : false
              }
              disableDragging={true}
              resizeHandleStyles={
                isSelected && !isBackgroundPhoto
                  ? buildResizeHandleStyles(effectiveScale)
                  : undefined
              }
              resizeHandleWrapperClassName="creator-resize-wrapper"
              resizeHandleComponent={{
                top: <div className="react-rnd-handle react-rnd-handle-top" data-export-ignore="true" />,
                right: (
                  <div className="react-rnd-handle react-rnd-handle-right" data-export-ignore="true" />
                ),
                bottom: (
                  <div className="react-rnd-handle react-rnd-handle-bottom" data-export-ignore="true" />
                ),
                left: (
                  <div className="react-rnd-handle react-rnd-handle-left" data-export-ignore="true" />
                ),
                topRight: (
                  <div className="react-rnd-handle react-rnd-handle-topRight" data-export-ignore="true" />
                ),
                bottomRight: (
                  <div className="react-rnd-handle react-rnd-handle-bottomRight" data-export-ignore="true" />
                ),
                bottomLeft: (
                  <div className="react-rnd-handle react-rnd-handle-bottomLeft" data-export-ignore="true" />
                ),
                topLeft: (
                  <div className="react-rnd-handle react-rnd-handle-topLeft" data-export-ignore="true" />
                ),
              }}
              onResizeStart={(e, dir) => {
                if (e?.nativeEvent) {
                  e.nativeEvent.stopPropagation();
                  e.nativeEvent.preventDefault();
                }
                e?.stopPropagation?.();
                e?.preventDefault?.();
                meta.isResizing = true;
                meta.resizeDirection = dir;
                meta.pointerActive = false;
                meta.hadDrag = false;
                meta.isDragging = false;
                meta.hadHold = false;
                meta.didTriggerTap = false;
                clearHoldTimer(meta);
                if (element.type === 'text') {
                  meta.resizeStartWidth = element.width;
                  meta.resizeStartHeight = element.height;
                  meta.resizeStartFontSize = element.data?.fontSize ?? 24;
                }
                if (!isSelected) {
                  onSelect(element.id, { interaction: "resize-start" });
                }
              }}
              onResize={(_, __, ref, ___, position) => {
                if (!meta.isResizing) {
                  return;
                }
                // false = don't override height during drag (prevents snap jump on release)
                applyResizeUpdate(ref, position, false);
              }}
              onDragStart={(event) => {
                if (meta.isResizing) {
                  if (event?.nativeEvent) {
                    event.nativeEvent.stopPropagation();
                    event.nativeEvent.preventDefault();
                  }
                  event?.stopPropagation?.();
                  event?.preventDefault?.();
                  return false;
                }
                meta.hadHold = false;
                meta.didTriggerTap = false;
                meta.isDragging = false;
                meta.hadDrag = false;
                meta.totalDistance = 0;
                clearHoldTimer(meta);
                if (typeof event?.stopPropagation === "function") {
                  event.stopPropagation();
                }
                onSelect(element.id, { interaction: "drag" });
              }}
              onDrag={(event, data) => {
                if (meta.isResizing) {
                  if (event?.nativeEvent) {
                    event.nativeEvent.stopPropagation();
                    event.nativeEvent.preventDefault();
                  }
                  event?.stopPropagation?.();
                  event?.preventDefault?.();
                  return false;
                }
                meta.totalDistance +=
                  Math.abs(data.deltaX) + Math.abs(data.deltaY);
                if (!meta.hadDrag && meta.totalDistance >= DRAG_THRESHOLD_PX) {
                  meta.hadDrag = true;
                  meta.didTriggerTap = false;
                  meta.isDragging = true;
                }
              }}
              onDragStop={(_, data) => {
                if (meta.isResizing) {
                  meta.pointerActive = false;
                  meta.hadDrag = false;
                  meta.didTriggerTap = false;
                  meta.hadHold = false;
                  meta.totalDistance = 0;
                  meta.isDragging = false;
                  return false;
                }
                const totalDelta =
                  Math.abs((meta.startX ?? data.x) - data.x) +
                  Math.abs((meta.startY ?? data.y) - data.y);
                const didDrag = meta.hadDrag || totalDelta >= 1;
                meta.pointerActive = false;
                meta.hadDrag = false;
                meta.didTriggerTap = false;
                meta.hadHold = false;
                meta.totalDistance = 0;
                meta.isDragging = false;
                meta.isResizing = false;
                clearHoldTimer(meta);
                if (!didDrag) {
                  resetRndPosition(meta);
                  return;
                }
                // All elements update freely - no clamp for background photo
                onUpdate(element.id, { x: data.x, y: data.y });
                meta.startX = data.x;
                meta.startY = data.y;
              }}
              onResizeStop={(_, __, ref, delta, position) => {
                if (!meta.isResizing) {
                  return;
                }

                // true = apply measured height on release for text elements
                applyResizeUpdate(ref, position, true);

                // Resize upload image from original for quality (only once when done)
                if (isUploadElement && onResizeUpload) {
                  const nextWidth = parseFloat(ref.style.width);
                  const nextHeight = parseFloat(ref.style.height);
                  if (
                    Number.isFinite(nextWidth) &&
                    Number.isFinite(nextHeight)
                  ) {
                    onResizeUpload(element.id, nextWidth, nextHeight);
                  }
                }

                meta.isResizing = false;
                meta.pointerActive = false;
                meta.hadDrag = false;
                meta.isDragging = false;
              }}
              minWidth={DEFAULT_ELEMENT_MIN}
              minHeight={DEFAULT_ELEMENT_MIN}
              dragMomentum={false}
              lockAspectRatio={
                isBackgroundPhoto
                  ? backgroundAspectRatio
                  : uploadAspectRatio
                  ? uploadAspectRatio
                  : false
              }
              enableUserSelectHack={false}
              dragGrid={[1, 1]}
              resizeGrid={[1, 1]}
              style={{
                zIndex: element.zIndex,
                boxShadow: "none",
                position: "absolute",
                borderRadius: elementBorderRadius,
                backgroundColor: "transparent",
                touchAction: isBackgroundPhoto ? "none" : "auto",
                pointerEvents: isCapturedOverlayElement 
                  ? "none" 
                  : (isBackgroundPhoto && !isSelected) 
                    ? "none" 
                    : "auto",
              }}
              className={elementClassName}
              onPointerDown={isBackgroundPhoto ? undefined : handlePointerDown}
              onTouchStart={isBackgroundPhoto ? undefined : handlePointerDown}
              onPointerMove={isBackgroundPhoto ? undefined : handlePointerMove}
              onTouchMove={isBackgroundPhoto ? undefined : handlePointerMove}
              onPointerUp={isBackgroundPhoto ? undefined : handlePointerUp}
              onTouchEnd={isBackgroundPhoto ? undefined : handlePointerUp}
              onPointerCancel={
                isBackgroundPhoto ? undefined : handlePointerCancel
              }
              onTouchCancel={
                isBackgroundPhoto ? undefined : handlePointerCancel
              }
              onClick={isBackgroundPhoto ? undefined : handleClick}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClickText(element);
              }}
              onWheel={handleWheel}
              onMouseEnter={() => setHoveredElementId(element.id)}
              onMouseLeave={() => setHoveredElementId(null)}
            >
              {isHovered && !isSelected && (
                <div
                  data-export-ignore="true"
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    border: '10px solid #e0b7a9',
                    borderRadius: 0,
                    pointerEvents: 'none',
                    zIndex: -1,
                  }}
                />
              )}
              {isSelected && !isBackgroundPhoto && (
                <div
                  data-export-ignore="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    border: "10px solid #f7a998",
                    borderRadius: 0,
                    pointerEvents: "none",
                    zIndex: -1,
                  }}
                />
              )}
              <ElementContent
                element={element}
                isSelected={isSelected}
                isEditing={editingTextId === element.id}
                editingValue={editingTextValue}
                onTextChange={handleTextChange}
                onTextBlur={handleTextBlur}
                textInputRef={textInputRef}
                resolvedSlotNumber={resolvedPhotoSlotNumbers[element.id]}
                ref={isBackgroundPhoto ? backgroundTouchRef : null}
              />
              {/* Toolbar: outside rotating wrapper so buttons stay upright */}
              {isSelected && !isBackgroundPhoto && (
                <>
                  <div
                    data-export-ignore="true"
                    style={{
                      position: "absolute",
                      // Dynamic positioning: show below if element is near top, otherwise show above
                      ...(element.y < 100 
                        ? { 
                            bottom: -76,
                            top: 'auto'
                          } 
                        : { 
                            top: -76,
                            bottom: 'auto'
                          }
                      ),
                      left: "50%",
                      transform: "translateX(-50%)",
                      display: "flex",
                      gap: "12px",
                      zIndex: 10000,
                      pointerEvents: "auto",
                    }}
                  >
                    <button
                      onPointerDown={stopToolbarInteraction}
                      onMouseDown={stopToolbarInteraction}
                      onTouchStart={stopToolbarInteraction}
                      onClick={(e) => runToolbarAction(e, () => onToggleLock?.(element.id))}
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "14px",
                        background: element.isLocked
                          ? "linear-gradient(135deg, #f7a998 0%, #e89985 100%)"
                          : "#ffffff",
                        border: element.isLocked
                          ? "2px solid #f7a998"
                          : "2px solid #f7a998",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: element.isLocked
                          ? "0 4px 12px rgba(247, 169, 152, 0.4)"
                          : "0 2px 8px rgba(0, 0, 0, 0.15)",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.transform = "scale(1.1)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.transform = "scale(1)")
                      }
                    >
                      <img
                        src={element.isLocked ? lockIcon : unlockIcon}
                        alt={element.isLocked ? "Locked" : "Unlocked"}
                        style={{ width: "36px", height: "36px" }}
                      />
                    </button>
                    <button
                      onPointerDown={stopToolbarInteraction}
                      onMouseDown={stopToolbarInteraction}
                      onTouchStart={stopToolbarInteraction}
                      onClick={(e) => runToolbarAction(e, () => onDuplicate?.(element.id))}
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "14px",
                        background: "#ffffff",
                        border: "3px solid #f7a998",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                        transition: "transform 0.2s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.transform = "scale(1.1)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.transform = "scale(1)")
                      }
                    >
                      <img
                        src={duplicateIcon}
                        alt="Duplicate"
                        style={{ width: "36px", height: "36px" }}
                      />
                    </button>

                    <button
                      onPointerDown={stopToolbarInteraction}
                      onMouseDown={stopToolbarInteraction}
                      onTouchStart={stopToolbarInteraction}
                      onClick={(e) => runToolbarAction(e, () => onRemove?.(element.id))}
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "14px",
                        background: "#ffffff",
                        border: "3px solid #f7a998",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                        transition: "transform 0.2s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.transform = "scale(1.1)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.transform = "scale(1)")
                      }
                    >
                      <img
                        src={trashIcon}
                        alt="Delete"
                        style={{ width: "36px", height: "36px" }}
                      />
                    </button>
                  </div>

                  {!isBackgroundPhoto && (() => {
                    const wouldOverflowRight =
                      Number(element.x) + Number(element.width) + ROTATE_BUTTON_OFFSET >
                      CANVAS_WIDTH;
                    const wouldOverflowLeft =
                      Number(element.x) - ROTATE_BUTTON_OFFSET < 0;

                    const placeLeft = wouldOverflowRight && !wouldOverflowLeft;

                    return (
                      <button
                        data-export-ignore="true"
                        title="Tahan & geser atas/bawah untuk rotate"
                        aria-label="Rotate"
                        style={{
                          position: "absolute",
                          top: "50%",
                          transform: "translateY(-50%)",
                          ...(placeLeft
                            ? { left: `-${ROTATE_BUTTON_OFFSET}px` }
                            : { right: `-${ROTATE_BUTTON_OFFSET}px` }),
                          width: `${ROTATE_BUTTON_SIZE}px`,
                          height: `${ROTATE_BUTTON_SIZE}px`,
                          borderRadius: "14px",
                          background: "#ffffff",
                          border: "3px solid #f7a998",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                          transition: "transform 0.2s ease",
                          pointerEvents: "auto",
                          touchAction: "none",
                          zIndex: 10001,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.transform =
                            "translateY(-50%) scale(1.1)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.transform = "translateY(-50%)")
                        }
                        onPointerDown={(e) => beginRotateGesture(e, element, placeLeft)}
                        onPointerMove={updateRotateGesture}
                        onPointerUp={endRotateGesture}
                        onPointerCancel={endRotateGesture}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <img
                          src={rotateIcon}
                          alt="Rotate"
                          draggable={false}
                          style={{ width: "34px", height: "34px" }}
                        />
                      </button>
                    );
                  })()}
                </>
              )}
              {isSelected && isBackgroundPhoto && (
                <div
                  data-export-ignore="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    border: "3px solid #f7a998",
                    borderRadius: 0,
                    pointerEvents: "none",
                    zIndex: -1,
                  }}
                />
              )}
            </RotatableRnd>
          );
        })}
      </Motion.div>
    </div>
  );
}

export default memo(CanvasPreviewComponent);
