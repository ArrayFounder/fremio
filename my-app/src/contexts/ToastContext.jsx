import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { ToastContainer } from "../components/common/Toast.jsx";

const ToastContext = createContext(null);

let globalToastCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastTimeoutsRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    const timeout = toastTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (typeOrOptions, messageArg) => {
      // Support both showToast({type,message}) and showToast("success", "msg")
      const opts =
        typeof typeOrOptions === "string"
          ? { type: typeOrOptions, message: messageArg }
          : typeOrOptions || {};
      const {
        type = "info",
        title,
        message,
        duration = 4000,
        action,
        persistent = false,
      } = opts;
      const id = ++globalToastCounter;

      const toast = {
        id,
        type,
        title,
        message,
        duration,
        action,
        persistent,
      };

      setToasts((prev) => [...prev, toast]);

      if (!persistent && duration > 0) {
        const timeout = setTimeout(() => {
          removeToast(id);
        }, duration);
        toastTimeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [removeToast]
  );

  const success = useCallback(
    (message, options = {}) => {
      return showToast({
        type: "success",
        message,
        ...options,
      });
    },
    [showToast]
  );

  const error = useCallback(
    (message, options = {}) => {
      return showToast({
        type: "error",
        message,
        duration: 6000,
        ...options,
      });
    },
    [showToast]
  );

  const warning = useCallback(
    (message, options = {}) => {
      return showToast({
        type: "warning",
        message,
        duration: 5000,
        ...options,
      });
    },
    [showToast]
  );

  const info = useCallback(
    (message, options = {}) => {
      return showToast({
        type: "info",
        message,
        ...options,
      });
    },
    [showToast]
  );

  const clearAll = useCallback(() => {
    toastTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    toastTimeoutsRef.current.clear();
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        success,
        error,
        warning,
        info,
        removeToast,
        clearAll,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
