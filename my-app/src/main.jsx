import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
import "./styles/editorFonts.css";
import "./i18n/index.js";

// ─── Runtime polyfills for older iOS Safari (13–14) ───────────────────────────
// esbuild transforms syntax (?.  ??  etc.) but does NOT polyfill runtime APIs.
// Array.at – added Safari 15.4 / iOS 15.4
if (!Array.prototype.at) {
  Array.prototype.at = function at(index) {
    const n = Math.trunc(index) || 0;
    const i = n >= 0 ? n : this.length + n;
    return i >= 0 && i < this.length ? this[i] : undefined;
  };
}
// String.at – same release as Array.at
if (!String.prototype.at) {
  String.prototype.at = function at(index) {
    const n = Math.trunc(index) || 0;
    const i = n >= 0 ? n : this.length + n;
    return i >= 0 && i < this.length ? this[i] : undefined;
  };
}
// String.replaceAll – added Safari 13.1 / iOS 13.4; missing on iOS 13.0–13.3
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function replaceAll(search, replace) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
      return this.replace(search, replace);
    }
    return this.split(String(search)).join(typeof replace === 'function' ? replace : String(replace));
  };
}
// Object.hasOwn – added Safari 15.4
if (!Object.hasOwn) {
  Object.hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
}
// ─────────────────────────────────────────────────────────────────────────────

// App version for debugging cache issues
console.log('🚀 Fremio App v14 - Build:', new Date().toISOString().slice(0, 10));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter
        basename={(import.meta.env.BASE_URL || "/").replace(/\/+$/, "/")}
      >
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
