// ============================================
// UNIFIED AUTH SERVICE
// Switches between Firebase and VPS based on config
// ============================================

import { isVPSMode, VPS_API_URL } from '../config/backend';

// VPS API Client
class VPSAuthClient {
  constructor() {
    this.baseUrl = VPS_API_URL;
  }

  getToken() {
    return localStorage.getItem('fremio_token') || localStorage.getItem('auth_token');
  }

  setToken(token) {
    localStorage.setItem('fremio_token', token);
    localStorage.setItem('auth_token', token); // backward compat
  }

  removeToken() {
    localStorage.removeItem('fremio_token');
    localStorage.removeItem('auth_token');
  }

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }

    return data;
  }

  async register(email, password, displayName = '') {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName })
    });

    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('current_user', JSON.stringify(data.user));
    }

    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('current_user', JSON.stringify(data.user));
    }

    return data;
  }

  async googleLogin(credential) {
    const data = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });

    if (data.token) {
      this.setToken(data.token);
      localStorage.setItem('current_user', JSON.stringify(data.user));
    }

    return data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore logout API errors
    }
    this.removeToken();
    localStorage.removeItem('current_user');
  }

  async getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const data = await this.request('/auth/me');
      localStorage.setItem('current_user', JSON.stringify(data));
      return data;
    } catch (error) {
      this.removeToken();
      localStorage.removeItem('current_user');
      return null;
    }
  }

  getCachedUser() {
    const cached = localStorage.getItem('current_user');
    return cached ? JSON.parse(cached) : null;
  }

  isLoggedIn() {
    return !!this.getToken();
  }

  isAdmin() {
    const user = this.getCachedUser();
    return user?.role === 'admin';
  }
}

// Firebase Auth Client (wrapper around existing Firebase auth)
class FirebaseAuthClient {
  async register(email, password, displayName = '') {
    // This is handled by AuthContext.jsx
    throw new Error('Use AuthContext.register() for Firebase mode');
  }

  async login(email, password) {
    // This is handled by AuthContext.jsx
    throw new Error('Use AuthContext.authenticateUser() for Firebase mode');
  }

  async logout() {
    // This is handled by AuthContext.jsx
    throw new Error('Use AuthContext.logout() for Firebase mode');
  }

  getCurrentUser() {
    const user = localStorage.getItem('fremio_user');
    return user ? JSON.parse(user) : null;
  }

  isLoggedIn() {
    return !!this.getCurrentUser();
  }

  isAdmin() {
    const user = this.getCurrentUser();
    return user?.role === 'admin';
  }
}

// Create the appropriate client based on mode
const authClient = isVPSMode() ? new VPSAuthClient() : new FirebaseAuthClient();

// Unified auth service
const unifiedAuthService = {
  // Register (VPS only - Firebase uses AuthContext)
  async register(email, password, displayName) {
    if (isVPSMode()) {
      return await authClient.register(email, password, displayName);
    }
    throw new Error('Use AuthContext for Firebase registration');
  },

  // Login (VPS only - Firebase uses AuthContext)
  async login(email, password) {
    if (isVPSMode()) {
      return await authClient.login(email, password);
    }
    throw new Error('Use AuthContext for Firebase login');
  },

  // Google Login (VPS only)
  async googleLogin(credential) {
    if (isVPSMode()) {
      return await authClient.googleLogin(credential);
    }
    throw new Error('Google login not available in Firebase mode');
  },

  // Logout
  async logout() {
    if (isVPSMode()) {
      return await authClient.logout();
    }
    throw new Error('Use AuthContext for Firebase logout');
  },

  // Get current user
  getCurrentUser() {
    return authClient.getCurrentUser?.() || authClient.getCachedUser?.();
  },

  // Check if logged in
  isLoggedIn() {
    return authClient.isLoggedIn();
  },

  // Check if admin
  isAdmin() {
    return authClient.isAdmin();
  },

  // Get auth token (VPS only)
  getToken() {
    if (isVPSMode()) {
      return authClient.getToken();
    }
    return null;
  },

  // Check backend mode
  isVPSMode() {
    return isVPSMode();
  }
};

export default unifiedAuthService;
export { VPSAuthClient, FirebaseAuthClient };
