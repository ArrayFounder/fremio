import { useState, useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getUnreadMessagesCount } from "../services/contactMessageService";
import { getAffiliateStats } from "../services/affiliateService";
import {
  LayoutDashboard,
  FileImage,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Upload,
  Shield,
  FolderOpen,
  BarChart3,
  Mail,
  Handshake,
  PanelLeftClose,
  PanelLeft,
  Shapes,
  Crown,
  Palette,
  Wallet,
  Link2,
} from "lucide-react";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Sidebar collapsed by default, saved in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("adminSidebarCollapsed");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingAffiliates, setPendingAffiliates] = useState(0);

  // Save sidebar preference
  useEffect(() => {
    localStorage.setItem("adminSidebarCollapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const loadCounts = async () => {
      const [messagesCount, affiliateStats] = await Promise.all([
        getUnreadMessagesCount(),
        getAffiliateStats(),
      ]);
      setUnreadCount(messagesCount);
      setPendingAffiliates(affiliateStats.pending);
    };
    loadCounts();

    const interval = setInterval(loadCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const menuItems = [
    { path: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/admin/frames", icon: FileImage, label: "Manage Frames" },
    { path: "/admin/upload-frame", icon: Upload, label: "Upload Frame" },
    { path: "/admin/frame-creator", icon: Shapes, label: "Frame Creator" },
    { path: "/admin/users", icon: Users, label: "Users" },
    { path: "/admin/categories", icon: FolderOpen, label: "Categories" },
    { path: "/admin/analytics", icon: BarChart3, label: "Analytics" },
    {
      path: "/admin/messages",
      icon: Mail,
      label: "Messages",
      badge: unreadCount,
    },
    {
      path: "/admin/affiliates",
      icon: Handshake,
      label: "Affiliates",
      badge: pendingAffiliates,
    },
    { path: "/admin/maintenance", icon: Shield, label: "Maintenance" },
    { path: "/admin/subscribers", icon: Crown, label: "Subscribers" },
    { path: "/admin/designer-submissions", icon: Palette, label: "Designer Submissions" },
    { path: "/admin/designer-wallets", icon: Wallet, label: "Designer Wallets" },
    { path: "/admin/share-links", icon: Link2, label: "Share Links" },
    { path: "/admin/settings", icon: Settings, label: "Settings" },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
      }}
    >
      {/* Overlay when sidebar is open */}
      {!sidebarCollapsed && (
        <div
          onClick={() => setSidebarCollapsed(true)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            zIndex: 40,
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      {/* Sidebar - Popup/Collapsible */}
      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "256px",
          backgroundColor: "white",
          borderRight: "1px solid #e5e7eb",
          boxShadow: sidebarCollapsed ? "none" : "4px 0 20px rgba(0,0,0,0.15)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          transform: sidebarCollapsed ? "translateX(-100%)" : "translateX(0)",
          transition: "transform 0.3s ease, box-shadow 0.3s ease",
        }}
      >
        {/* Logo Section */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: "bold",
                fontSize: "18px",
              }}
            >
              F
            </div>
            <div>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "16px",
                  color: "#111827",
                }}
              >
                Fremio
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                Admin Panel
              </div>
            </div>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            style={{
              padding: "8px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            title="Close sidebar"
          >
            <PanelLeftClose size={20} color="#6b7280" />
          </button>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: "16px 12px",
            overflowY: "auto",
          }}
        >
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarCollapsed(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                marginBottom: "4px",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "500",
                transition: "all 0.2s",
                background: isActive(item.path)
                  ? "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)"
                  : "transparent",
                color: isActive(item.path) ? "white" : "#374151",
                boxShadow: isActive(item.path)
                  ? "0 2px 4px rgba(0,0,0,0.1)"
                  : "none",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: isActive(item.path) ? "#ffffff" : "#ef4444",
                    color: isActive(item.path) ? "#ec4899" : "white",
                    borderRadius: "12px",
                    padding: "2px 8px",
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    minWidth: "20px",
                    textAlign: "center",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* User Section */}
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "6px",
              }}
            >
              <Shield size={14} color="#8b5cf6" />
              <span
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  fontWeight: "500",
                }}
              >
                Administrator
              </span>
            </div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "#111827",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name || user?.email}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px",
              border: "none",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "white",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
            }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area - Full width now */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginLeft: 0,
          transition: "margin-left 0.3s ease",
        }}
      >
        {/* Top Header */}
        <header
          className="admin-top-header"
          style={{
            backgroundColor: "white",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            zIndex: 30,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              padding: "0 16px",
              height: "64px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              maxWidth: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Menu Toggle Button - Always visible */}
              <button
                onClick={toggleSidebar}
                style={{
                  padding: "10px",
                  border: "1px solid #e5e7eb",
                  background: sidebarCollapsed ? "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)" : "#f9fafb",
                  cursor: "pointer",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  boxShadow: sidebarCollapsed ? "0 2px 8px rgba(236, 72, 153, 0.3)" : "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                title={sidebarCollapsed ? "Open menu" : "Close menu"}
              >
                {sidebarCollapsed ? (
                  <PanelLeft size={20} color="white" />
                ) : (
                  <PanelLeftClose size={20} color="#374151" />
                )}
              </button>
              
              {/* Logo when sidebar is collapsed */}
              {sidebarCollapsed && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold",
                      fontSize: "14px",
                    }}
                  >
                    F
                  </div>
                  <span style={{ fontWeight: "600", color: "#111827", fontSize: "15px" }}>
                    Fremio
                  </span>
                </div>
              )}
              
              <h1
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: "#111827",
                  margin: 0,
                  marginLeft: sidebarCollapsed ? "16px" : "0",
                  paddingLeft: sidebarCollapsed ? "16px" : "0",
                  borderLeft: sidebarCollapsed ? "1px solid #e5e7eb" : "none",
                }}
              >
                {menuItems.find((item) => item.path === location.pathname)?.label || "Admin Panel"}
              </h1>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                backgroundColor: "#f5f3ff",
                borderRadius: "8px",
                border: "1px solid #e9d5ff",
              }}
            >
              <Shield size={16} color="#8b5cf6" />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#7c3aed",
                }}
              >
                {user?.name || "Admin"}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            backgroundColor: "#f9fafb",
          }}
        >
          <Outlet />
        </main>

        {/* Footer */}
        <footer
          style={{
            backgroundColor: "white",
            borderTop: "1px solid #e5e7eb",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "12px",
              color: "#6b7280",
            }}
          >
            <div>© 2024 Fremio Admin Panel</div>
            <div style={{ display: "flex", gap: "16px" }}>
              <a
                href="#"
                style={{
                  color: "#6b7280",
                  textDecoration: "none",
                  fontWeight: "500",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ec4899")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
              >
                Help
              </a>
              <a
                href="#"
                style={{
                  color: "#6b7280",
                  textDecoration: "none",
                  fontWeight: "500",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ec4899")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
              >
                Docs
              </a>
              <a
                href="#"
                style={{
                  color: "#6b7280",
                  textDecoration: "none",
                  fontWeight: "500",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ec4899")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
              >
                Settings
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
