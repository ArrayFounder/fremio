// ============================================
// FIREBASE - DISABLED (Using VPS Authentication)
// ============================================
// This file is kept for backward compatibility
// All auth now uses VPS JWT via AuthContext

// Check if Firebase credentials are configured
const isFirebaseCredentialsAvailable = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID
);

import { BACKEND_MODE, currentBackendMode } from './backend.js';

// VPS Mode check
const isVPSMode = currentBackendMode === BACKEND_MODE.VPS;

// Firebase is disabled in VPS mode
export const isFirebaseConfigured = false;

// Null exports for backward compatibility
export const auth = null;
export const db = null;
export const storage = null;

if (isVPSMode) {
  console.log('🔧 VPS Mode: Firebase disabled, using VPS JWT Auth');
} else if (!isFirebaseCredentialsAvailable) {
  console.warn('⚠️ Firebase credentials not configured');
}

export default null;
