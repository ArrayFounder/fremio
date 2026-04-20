import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
import "./styles/editorFonts.css";
import "./i18n/index.js";

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
