// ============================================
// SUPABASE - DISABLED (Using VPS PostgreSQL)
// ============================================
// This file is kept for backward compatibility
// All data now stored in VPS PostgreSQL

import { BACKEND_MODE, currentBackendMode } from './backend.js';

// VPS Mode check
const isVPSMode = currentBackendMode === BACKEND_MODE.VPS;

// Check if Supabase is configured (for backward compatibility)
export const isSupabaseConfigured = false;

// Firebase is also disabled
export const isFirebaseConfigured = false;

// Use VPS for everything
export const useSupabase = false;
export const useFirebase = false;
export const useVPS = true;

// Null Supabase client
const supabase = null;

if (isVPSMode) {
  console.log('🔧 VPS Mode: Supabase disabled, using VPS PostgreSQL');
}

export { supabase };
export default supabase;
