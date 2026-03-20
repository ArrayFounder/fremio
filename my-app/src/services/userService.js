import { supabase, isSupabaseConfigured } from "../config/supabase";
import api from "./api";

// LocalStorage key for fallback
const USERS_STORAGE_KEY = "fremio_all_users";

// User Roles
export const USER_ROLES = {
  ADMIN: "admin",
  KREATOR: "kreator",
  USER: "user",
};

/**
 * User Management Service - SUPABASE VERSION
 * For admin operations on user accounts
 */

/**
 * Get all users (admin only)
 * @returns {Promise<Array>} Array of users
 */
export async function getAllUsers() {
  try {
    console.log("🔍 getAllUsers called - attempting backend API...");

    // Try backend API first
    try {
      console.log("🌐 Calling backend API: GET /users");
      const response = await api.get("/users");
      console.log("✅ Backend API response:", response);

      if (response && response.users) {
        console.log(
          "📊 getAllUsers - Backend API:",
          response.users.length,
          "users",
        );
        return response.users.map((u) => ({
          id: u.id,
          uid: u.id,
          email: u.email,
          name: u.display_name || u.email?.split("@")[0],
          displayName: u.display_name,
          role: u.role || "user",
          status: u.status || "active",
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at,
        }));
      }
    } catch (apiError) {
      console.error("❌ Backend API failed:", apiError);
      console.error("❌ Error details:", apiError.message, apiError.stack);
    }

    // Fallback to Supabase
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      console.log("📊 getAllUsers - LocalStorage mode:", users.length, "users");
      return users;
    }

    const { data, error } = await supabase
      .from("fremio_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Supabase failed, using LocalStorage:", error.message);
      return getUsersFromLocalStorage();
    }

    // Map to standard format
    const users = (data || []).map((u) => ({
      id: u.id,
      uid: u.uid,
      email: u.email,
      name: u.name || u.display_name,
      displayName: u.display_name,
      role: u.role || "user",
      status: u.status || "active",
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
      updatedAt: u.updated_at,
    }));

    console.log("📊 getAllUsers - Supabase mode:", users.length, "users");
    return users;
  } catch (error) {
    console.error("Error fetching all users:", error);
    return getUsersFromLocalStorage();
  }
}

/**
 * Get user registration stats (admin only)
 */
export async function getUserStats() {
  try {
    const response = await api.get("/users/stats");
    if (response && response.success) {
      return response;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return null;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      return users.find((u) => u.id === userId || u.uid === userId) || null;
    }

    const { data, error } = await supabase
      .from("fremio_users")
      .select("*")
      .or(`id.eq.${userId},uid.eq.${userId}`)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      uid: data.uid,
      email: data.email,
      name: data.name || data.display_name,
      displayName: data.display_name,
      role: data.role,
      status: data.status,
      createdAt: data.created_at,
      lastLoginAt: data.last_login_at,
    };
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(userId, newRole, adminId) {
  try {
    if (!Object.values(USER_ROLES).includes(newRole)) {
      return { success: false, message: "Invalid role" };
    }

    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return { success: false, message: "User not found" };

      users[index].role = newRole;
      users[index].updatedAt = new Date().toISOString();
      saveUsersToLocalStorage(users);
      return { success: true, message: `User role updated to ${newRole}` };
    }

    const { error } = await supabase
      .from("fremio_users")
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw error;
    return { success: true, message: `User role updated to ${newRole}` };
  } catch (error) {
    console.error("Error updating user role:", error);
    return {
      success: false,
      message: error.message || "Failed to update role",
    };
  }
}

/**
 * Ban user (admin only)
 */
export async function banUser(userId, adminId, reason = "") {
  try {
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return { success: false, message: "User not found" };

      users[index].status = "banned";
      users[index].banReason = reason;
      users[index].updatedAt = new Date().toISOString();
      saveUsersToLocalStorage(users);
      return { success: true, message: "User banned successfully" };
    }

    const { error } = await supabase
      .from("fremio_users")
      .update({
        status: "banned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw error;
    return { success: true, message: "User banned successfully" };
  } catch (error) {
    console.error("Error banning user:", error);
    return { success: false, message: error.message || "Failed to ban user" };
  }
}

/**
 * Unban user (admin only)
 */
export async function unbanUser(userId, adminId) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return { success: false, message: "User not found" };

      users[index].status = "active";
      users[index].banReason = null;
      users[index].updatedAt = new Date().toISOString();
      saveUsersToLocalStorage(users);
      return { success: true, message: "User unbanned successfully" };
    }

    const { error } = await supabase
      .from("fremio_users")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw error;
    return { success: true, message: "User unbanned successfully" };
  } catch (error) {
    console.error("Error unbanning user:", error);
    return { success: false, message: error.message || "Failed to unban user" };
  }
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(userId, adminId) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      const filtered = users.filter((u) => u.id !== userId);
      saveUsersToLocalStorage(filtered);
      return { success: true, message: "User deleted successfully" };
    }

    const { error } = await supabase
      .from("fremio_users")
      .delete()
      .eq("id", userId);

    if (error) throw error;
    return { success: true, message: "User deleted successfully" };
  } catch (error) {
    console.error("Error deleting user:", error);
    return {
      success: false,
      message: error.message || "Failed to delete user",
    };
  }
}

/**
 * Save user to Supabase (for registration/login)
 */
export async function saveUserToSupabase(userData) {
  if (!isSupabaseConfigured || !supabase) {
    console.log("Supabase not configured, saving to localStorage");
    return saveUserToStorage(userData);
  }

  try {
    // Check if user exists by email
    const { data: existing } = await supabase
      .from("fremio_users")
      .select("*")
      .eq("email", userData.email)
      .single();

    const userToSave = {
      uid: userData.uid,
      email: userData.email,
      name: userData.name || userData.displayName,
      display_name: userData.displayName || userData.name,
      role: userData.role || "user",
      status: userData.status || "active",
      last_login_at: userData.lastLoginAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // Update existing user
      const { error } = await supabase
        .from("fremio_users")
        .update(userToSave)
        .eq("email", userData.email);

      if (error) throw error;
      console.log("✅ User updated in Supabase:", userData.email);
    } else {
      // Insert new user
      userToSave.created_at = userData.createdAt || new Date().toISOString();
      const { error } = await supabase.from("fremio_users").insert(userToSave);

      if (error) throw error;
      console.log("✅ New user saved to Supabase:", userData.email);
    }

    return userToSave;
  } catch (error) {
    console.error("Error saving user to Supabase:", error);
    // Fallback to localStorage
    return saveUserToStorage(userData);
  }
}

/**
 * Get users by role
 */
export async function getUsersByRole(role) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      return users.filter((u) => u.role === role);
    }

    const { data, error } = await supabase
      .from("fremio_users")
      .select("*")
      .eq("role", role)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((u) => ({
      id: u.id,
      uid: u.uid,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      createdAt: u.created_at,
    }));
  } catch (error) {
    console.error("Error fetching users by role:", error);
    return [];
  }
}

/**
 * Get users by status
 */
export async function getUsersByStatus(status) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      const users = getUsersFromLocalStorage();
      return users.filter((u) => u.status === status);
    }

    const { data, error } = await supabase
      .from("fremio_users")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((u) => ({
      id: u.id,
      uid: u.uid,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      createdAt: u.created_at,
    }));
  } catch (error) {
    console.error("Error fetching users by status:", error);
    return [];
  }
}

// ============ LocalStorage Helpers ============

function getUsersFromLocalStorage() {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Try current user
    const currentUser = localStorage.getItem("fremio_user");
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      const initialUser = {
        id: userData.uid || `user_${Date.now()}`,
        email: userData.email,
        name: userData.displayName || userData.email?.split("@")[0] || "",
        role: USER_ROLES.USER,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      saveUsersToLocalStorage([initialUser]);
      return [initialUser];
    }

    return [];
  } catch (error) {
    console.error("Error reading users from localStorage:", error);
    return [];
  }
}

function saveUsersToLocalStorage(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Error saving users to localStorage:", error);
  }
}

/**
 * Save user to localStorage
 */
export function saveUserToStorage(userData) {
  try {
    const users = getUsersFromLocalStorage();
    const existingIndex = users.findIndex(
      (u) => u.email === userData.email || u.id === userData.id,
    );

    const userToSave = {
      id: userData.id || userData.uid || `user_${Date.now()}`,
      email: userData.email,
      name: userData.name || userData.displayName || "",
      role: userData.role || USER_ROLES.USER,
      status: userData.status || "active",
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex !== -1) {
      users[existingIndex] = { ...users[existingIndex], ...userToSave };
    } else {
      users.push(userToSave);
    }

    saveUsersToLocalStorage(users);
    return userToSave;
  } catch (error) {
    console.error("Error saving user:", error);
    return null;
  }
}

export default {
  getAllUsers,
  getUserById,
  updateUserRole,
  banUser,
  unbanUser,
  deleteUser,
  saveUserToSupabase,
  getUsersByRole,
  getUsersByStatus,
  saveUserToStorage,
  USER_ROLES,
};
