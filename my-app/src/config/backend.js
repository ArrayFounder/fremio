// ============================================
// BACKEND CONFIGURATION
// Switch between Firebase and VPS Backend
// ============================================

// Backend modes
export const BACKEND_MODE = {
  FIREBASE: 'firebase',
  VPS: 'vps',
  HYBRID: 'hybrid'  // Auth: Firebase, Data: VPS
};

// Get current backend mode from environment or default
// Set VITE_BACKEND_MODE=vps in .env to use VPS backend
const getBackendMode = () => {
  const mode = String(import.meta.env.VITE_BACKEND_MODE || '').trim();
  if (mode) return mode.toLowerCase();

  // Runtime fallback when env vars weren't injected into the build
  if (typeof window !== 'undefined' && window.location) {
    const hostname = String(window.location.hostname || '').toLowerCase();

    if (hostname.endsWith('fremio.id') || hostname.endsWith('pages.dev')) {
      return BACKEND_MODE.VPS;
    }
  }

  return BACKEND_MODE.FIREBASE;
};

export const currentBackendMode = getBackendMode();

// VPS API Configuration
// IMPORTANT:
// - In development, default to relative /api so localhost never accidentally hits production
//   (Vite dev server should proxy /api -> local backend)
// - In production Cloudflare Pages, VITE_API_URL must be set. If it's not, fall back to
//   the known production API domain so payment/pending endpoints still work.
const resolveVpsApiUrl = () => {
  const explicit = String(import.meta.env.VITE_API_URL || "").trim();
  if (explicit) return explicit;

  // Runtime fallback (when env vars weren't injected into the build)
  if (typeof window !== "undefined" && window.location) {
    const hostname = String(window.location.hostname || "").toLowerCase();

    // Local development
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "/api";
    }

    // Fremio production domain uses relative /api (reverse proxy on same host)
    if (hostname.endsWith("fremio.id")) {
      return "/api";
    }

    // Cloudflare Pages preview does NOT proxy /api
    if (hostname.endsWith("pages.dev")) {
      return "https://api.fremio.id/api";
    }
  }

  return "/api";
};

export const VPS_API_URL = resolveVpsApiUrl();

/**
 * Resolve the public base URL for uploaded assets (e.g. frame images).
 * In production the frontend is on Cloudflare Pages (fremio.id) while uploads
 * live on the API server (api.fremio.id). Using a relative path like
 * `/uploads/...` would incorrectly point to Cloudflare Pages.
 *
 * IMPORTANT: This MUST evaluate at runtime in the browser. Vite/esbuild will
 * try to constant-fold pure functions during the build. We intentionally
 * access `window.location` inside a try/catch (which esbuild treats as impure)
 * to prevent inlining.
 */
export function getUploadsBaseUrl() {
  try {
    // This try/catch prevents esbuild from constant-folding
    const hostname = window.location.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return ''; // relative is fine for local dev
    }

    if (hostname.endsWith('fremio.id')) {
      return ''; // Serve from same domain in production
    }

    if (hostname.endsWith('pages.dev')) {
      return 'https://api.fremio.id'; // Preview needs API host for uploads
    }
  } catch (_) {
    // SSR or build-time — fall through
  }

  return '';
}

// Backward compat — kept as empty string, all call sites should use getUploadsBaseUrl()
export const UPLOADS_BASE_URL = '';

// Check if using VPS
export const isVPSMode = () => {
  return currentBackendMode === BACKEND_MODE.VPS;
};

// Check if using Firebase
export const isFirebaseMode = () => {
  return currentBackendMode === BACKEND_MODE.FIREBASE;
};

// Check if using Hybrid (Firebase Auth + VPS Data)
export const isHybridMode = () => {
  return currentBackendMode === BACKEND_MODE.HYBRID;
};

// Log current mode on startup
console.log(`🔧 Backend Mode: ${currentBackendMode.toUpperCase()}`);
if (isVPSMode()) {
  console.log(`📡 VPS API URL: ${VPS_API_URL}`);
}

export default {
  BACKEND_MODE,
  currentBackendMode,
  VPS_API_URL,
  isVPSMode,
  isFirebaseMode,
  isHybridMode
};
