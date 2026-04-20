import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { createPortal } from "react-dom";

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS = {
  success: {
    bg: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    iconBg: "rgba(255, 255, 255, 0.2)",
  },
  error: {
    bg: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    iconBg: "rgba(255, 255, 255, 0.2)",
  },
  warning: {
    bg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    iconBg: "rgba(255, 255, 255, 0.2)",
  },
  info: {
    bg: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    iconBg: "rgba(255, 255, 255, 0.2)",
  },
};

export function Toast({ toast, onClose }) {
  const Icon = TOAST_ICONS[toast.type] || Info;
  const colors = TOAST_COLORS[toast.type] || TOAST_COLORS.info;

  useEffect(() => {
    if (!toast.persistent) {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, toast.duration || 4000);

      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        position: "relative",
        background: colors.bg,
        borderRadius: "16px",
        padding: "16px 20px",
        boxShadow:
          "0 20px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1) inset",
        maxWidth: "420px",
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          background: colors.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={24} color="white" strokeWidth={2.5} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingTop: "2px" }}>
        {toast.title && (
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "white",
              marginBottom: "4px",
              lineHeight: 1.3,
            }}
          >
            {toast.title}
          </div>
        )}
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "rgba(255, 255, 255, 0.95)",
            lineHeight: 1.4,
          }}
        >
          {toast.message}
        </div>

        {/* Action Button */}
        {toast.action && (
          <button
            onClick={() => {
              toast.action.onClick();
              onClose(toast.id);
            }}
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "rgba(255, 255, 255, 0.25)",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.35)";
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.25)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close Button */}
      <button
        onClick={() => onClose(toast.id)}
        style={{
          flexShrink: 0,
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          border: "none",
          background: "rgba(255, 255, 255, 0.15)",
          color: "white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
        }}
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

export function ToastContainer({ toasts, onClose }) {
  const content = (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 14000,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <Toast toast={toast} onClose={onClose} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}

// Mobile optimized position
export function ToastContainerMobile({ toasts, onClose }) {
  const content = (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        left: "16px",
        right: "16px",
        zIndex: 14000,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <Toast toast={toast} onClose={onClose} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}

export default ToastContainer;
