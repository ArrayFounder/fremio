// Temporary Simple Guards for LocalStorage Mode
// This bypasses role checking for easy admin UI testing

import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function RoleGuard({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // In localStorage mode, allow all authenticated users
  return children;
}

export function AdminOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has admin role (from localStorage)
  const isAdmin = user.role === 'admin';
  
  if (!isAdmin) {
    // For testing: allow access anyway, just show warning
    console.warn('⚠️ Not admin, but allowing access for testing');
    return children; // Comment this line to enforce admin-only
    // return <Navigate to="/home" replace />; // Uncomment to enforce
  }

  return children;
}

export function KreatorOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is kreator or admin
  const canCreate = user.role === 'kreator' || user.role === 'admin';
  
  if (!canCreate) {
    console.warn('⚠️ Not kreator, but allowing access for testing');
    return children; // Comment this line to enforce kreator-only
    // return <Navigate to="/home" replace />; // Uncomment to enforce
  }

  return children;
}

export function UserOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function DesignerOnly({ children }) {
  // Read auth from localStorage directly (designer uses same JWT storage)
  const storedUser = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("designer_user") ||
          localStorage.getItem("fremio_user") ||
          "null"
      );
    } catch {
      return null;
    }
  })();

  const token =
    localStorage.getItem("designer_token") ||
    localStorage.getItem("fremio_token");

  if (!token || !storedUser) {
    return <Navigate to="/designer/login" replace />;
  }

  const role = storedUser?.role;
  if (role !== "designer" && role !== "admin") {
    return <Navigate to="/designer/login" replace />;
  }

  return children;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600 mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
