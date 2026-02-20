import React, { createContext, useContext, useState, useEffect } from "react";
import userStorage from "../utils/userStorage";

const AuthContext = createContext();

// VPS API Base URL
const API_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * 100% VPS Authentication Context
 * Uses JWT tokens stored in localStorage
 * NO Firebase dependency
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const storedToken = localStorage.getItem("fremio_token");
        const storedUser = localStorage.getItem("fremio_user");

        if (storedToken && storedUser) {
          const userData = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(userData);
          console.log("✅ Restored user session:", userData.email);

          // Verify token is still valid by calling /me endpoint
          try {
            const response = await fetch(`${API_URL}/auth/me`, {
              headers: {
                Authorization: `Bearer ${storedToken}`,
              },
            });

            if (response.ok) {
              const freshUserData = await response.json();
              // Update user data with fresh data from server
              const updatedUser = {
                ...userData,
                id: freshUserData.id,
                displayName: freshUserData.displayName || userData.displayName,
                role: freshUserData.role || userData.role,
                photoUrl: freshUserData.photoUrl || userData.photoUrl,
              };
              setUser(updatedUser);
              localStorage.setItem("fremio_user", JSON.stringify(updatedUser));
              console.log("✅ Token verified, user data refreshed");
            } else {
              // Token is invalid, clear auth
              console.warn("⚠️ Token expired or invalid, clearing session");
              clearAuth();
            }
          } catch (error) {
            // API might be unavailable, keep using cached data
            console.warn("⚠️ Could not verify token, using cached data");
          }
        }
      } catch (error) {
        console.error("Error loading stored auth:", error);
        clearAuth();
      } finally {
        setLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  // Clear all auth data
  const clearAuth = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("fremio_token");
    localStorage.removeItem("fremio_user");
  };

  // Save auth data
  const saveAuth = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("fremio_token", authToken);
    localStorage.setItem("fremio_user", JSON.stringify(userData));
  };

  /**
   * Register new user via VPS API
   * Auto-login setelah registrasi berhasil
   */
  async function register(userData) {
    try {
      const { email, password, firstName, lastName, displayName } = userData;

      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          displayName:
            displayName ||
            `${firstName || ""} ${lastName || ""}`.trim() ||
            email.split("@")[0],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || data.message || data.errors?.[0]?.msg || "Registration failed",
        };
      }

      console.log("✅ User registered successfully:", data.user.email);

      // Auto-login: simpan token dan user data
      if (data.token && data.user) {
        const newUser = {
          id: data.user.id,
          uid: data.user.id,
          email: data.user.email,
          displayName: data.user.displayName,
          role: data.user.role,
        };
        
        saveAuth(newUser, data.token);
        console.log("✅ Auto-login successful after registration");
      }

      return {
        success: true,
        message: data.message || "Registrasi berhasil!",
        user: data.user,
      };
    } catch (error) {
      console.error("❌ Registration error:", error);
      return {
        success: false,
        message: error.message || "Network error. Please check your connection.",
      };
    }
  }

  /**
   * Login user via VPS API
   */
  async function authenticateUser(email, password) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      // Check if user needs to set password (status 202)
      if (response.status === 202 && data.requirePasswordSetup) {
        console.log("🔑 User needs to set password:", email);
        return {
          success: false,
          requirePasswordSetup: true,
          email: data.email,
          tempToken: data.tempToken,
          message: data.message || "Silakan buat password baru"
        };
      }

      if (!response.ok) {
        return {
          success: false,
          message: data.error || "Email atau password salah",
        };
      }

      // Save auth data
      const userData = {
        id: data.user.id,
        uid: data.user.id, // For backward compatibility
        email: data.user.email,
        displayName: data.user.displayName,
        role: data.user.role,
        photoUrl: data.user.photoUrl,
      };

      saveAuth(userData, data.token);
      console.log("✅ User logged in:", userData.email);

      return {
        success: true,
        message: data.message || "Login berhasil",
        user: userData,
      };
    } catch (error) {
      console.error("❌ Login error:", error);
      return {
        success: false,
        message: "Network error. Periksa koneksi internet Anda.",
      };
    }
  }

  /**
   * Login function (for direct user object)
   */
  function login(userData, authToken = null) {
    if (authToken) {
      saveAuth(userData, authToken);
    } else {
      setUser(userData);
      localStorage.setItem("fremio_user", JSON.stringify(userData));
    }
  }

  /**
   * Logout user
   */
  async function logout() {
    try {
      clearAuth();
      userStorage.clearUserData();
      console.log("✅ User logged out successfully");
    } catch (error) {
      console.error("❌ Logout error:", error);
      throw error;
    }
  }

  /**
   * Update user profile via VPS API
   */
  async function updateUser(updatedData) {
    try {
      if (!token) {
        // Fallback: just update locally
        const updatedUser = { ...user, ...updatedData };
        setUser(updatedUser);
        localStorage.setItem("fremio_user", JSON.stringify(updatedUser));
        return { success: true };
      }

      const response = await fetch(`${API_URL}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedData),
      });

      const data = await response.json();

      if (!response.ok) {
        // Still update locally even if API fails
        const updatedUser = { ...user, ...updatedData };
        setUser(updatedUser);
        localStorage.setItem("fremio_user", JSON.stringify(updatedUser));
        console.warn("⚠️ API update failed, updated locally");
        return { success: true, message: "Profile updated locally" };
      }

      // Update local user data
      const updatedUser = { ...user, ...updatedData };
      setUser(updatedUser);
      localStorage.setItem("fremio_user", JSON.stringify(updatedUser));

      console.log("✅ Profile updated successfully");
      return { success: true, message: "Profile berhasil diupdate" };
    } catch (error) {
      console.error("❌ Update profile error:", error);
      // Fallback: update locally
      const updatedUser = { ...user, ...updatedData };
      setUser(updatedUser);
      localStorage.setItem("fremio_user", JSON.stringify(updatedUser));
      return { success: true, message: "Profile updated locally" };
    }
  }

  /**
   * Change password via VPS API
   */
  async function changePassword(currentPassword, newPassword) {
    try {
      if (!token) {
        return { success: false, message: "Anda belum login" };
      }

      const response = await fetch(`${API_URL}/auth/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || "Gagal mengubah password",
        };
      }

      console.log("✅ Password changed successfully");
      return { success: true, message: "Password berhasil diubah" };
    } catch (error) {
      console.error("❌ Change password error:", error);
      return { success: false, message: "Network error" };
    }
  }

  /**
   * Reset password (request reset email)
   * Note: This requires email service to be configured on VPS
   */
  async function resetPassword(email) {
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || "Gagal mengirim email reset",
        };
      }

      console.log("✅ Password reset email sent");
      return {
        success: true,
        message: "Instruksi reset password telah dikirim ke email Anda",
      };
    } catch (error) {
      console.error("❌ Reset password error:", error);
      // For now, just show a message that this feature is not available
      return {
        success: false,
        message: "Fitur reset password belum tersedia. Silakan hubungi admin.",
      };
    }
  }

  /**
   * Get auth headers for API requests
   */
  function getAuthHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const isAuthenticated = !!user;
  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        register,
        authenticateUser,
        updateUser,
        changePassword,
        resetPassword,
        getAuthHeaders,
        isAuthenticated,
        isAdmin,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
