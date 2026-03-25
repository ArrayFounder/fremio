import { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  PlusSquare,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

const SIDEBAR_W = 240;
const SIDEBAR_W_COLLAPSED = 64;

// Fremio brand colors
const C = {
  bg: "#fdf7f4",
  bgAlt: "#fff",
  border: "#ecdeda",
  accent: "#e0b7a9",
  accentDark: "#c89585",
  accentLight: "#f5e6e0",
  accentXLight: "#fdf0eb",
  text: "#4a302b",
  textMuted: "#9b7b73",
  textLight: "#c4a39b",
  sidebarBg: "#fff",
  activeText: "#c07055",
  activeBg: "#fdf0eb",
  activeBorder: "#e0b7a9",
};

export default function DesignerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // Desktop: collapsed state. Mobile: open/close drawer
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const user = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("designer_user") ||
        localStorage.getItem("fremio_user") ||
        "{}"
      );
    } catch {
      return {};
    }
  })();

  const handleLogout = () => {
    localStorage.removeItem("designer_token");
    localStorage.removeItem("designer_user");
    localStorage.removeItem("fremio_token");
    localStorage.removeItem("fremio_user");
    navigate("/designer/login");
  };

  const menuItems = [
    { path: "/designer/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/designer/editor", icon: PlusSquare, label: "Buat Frame Baru" },
    { path: "/designer/notifications", icon: Bell, label: "Notifikasi" },
  ];

  const isActive = (path) =>
    location.pathname === path ||
    (path !== "/designer/editor" && location.pathname.startsWith(path + "/"));

  const sidebarWidth = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;

  const SidebarContent = ({ isMobile = false }) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Brand header */}
      <div
        style={{
          padding: collapsed && !isMobile ? "20px 0" : "20px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed && !isMobile ? "center" : "space-between",
          gap: "10px",
        }}
      >
        {(!collapsed || isMobile) && (
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#fff", fontWeight: "800", fontSize: "14px" }}>F</span>
            </div>
            <div>
              <div style={{ fontWeight: "800", fontSize: "15px", color: C.text, letterSpacing: "-0.3px" }}>
                Fremio
              </div>
              <div style={{ fontSize: "10px", color: C.textMuted, fontWeight: "500" }}>
                Designer Studio
              </div>
            </div>
          </Link>
        )}
        {collapsed && !isMobile && (
          <Link to="/" style={{ textDecoration: "none" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#fff", fontWeight: "800", fontSize: "14px" }}>F</span>
            </div>
          </Link>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: C.textMuted }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* User info */}
      {(!collapsed || isMobile) && (user.displayName || user.email) && (
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${C.border}`,
            background: C.accentXLight,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: "700",
              fontSize: "15px",
              marginBottom: "8px",
            }}
          >
            {(user.displayName || user.email || "D")[0].toUpperCase()}
          </div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: C.text, lineHeight: 1.3 }}>
            {user.displayName || user.email?.split("@")[0]}
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>Designer</div>
        </div>
      )}
      {collapsed && !isMobile && (user.displayName || user.email) && (
        <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: "700",
              fontSize: "13px",
            }}
          >
            {(user.displayName || user.email || "D")[0].toUpperCase()}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              title={collapsed && !isMobile ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: collapsed && !isMobile ? 0 : "10px",
                justifyContent: collapsed && !isMobile ? "center" : "flex-start",
                padding: collapsed && !isMobile ? "10px 0" : "10px 12px",
                borderRadius: "10px",
                textDecoration: "none",
                color: active ? C.activeText : C.textMuted,
                background: active ? C.activeBg : "transparent",
                marginBottom: "2px",
                fontSize: "13.5px",
                fontWeight: active ? "600" : "500",
                transition: "all 0.15s",
                borderLeft: active && !collapsed ? `3px solid ${C.activeBorder}` : "3px solid transparent",
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: "10px 10px 16px", borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={handleLogout}
          title={collapsed && !isMobile ? "Keluar" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: collapsed && !isMobile ? 0 : "10px",
            justifyContent: collapsed && !isMobile ? "center" : "flex-start",
            width: "100%",
            padding: collapsed && !isMobile ? "10px 0" : "10px 12px",
            background: "transparent",
            border: "none",
            color: "#c07055",
            cursor: "pointer",
            borderRadius: "10px",
            fontSize: "13.5px",
            fontWeight: "500",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#fef2ed"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <LogOut size={18} strokeWidth={2} />
          {(!collapsed || isMobile) && <span>Keluar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* ── Desktop Sidebar ── */}
      <aside
        style={{
          width: `${sidebarWidth}px`,
          background: C.sidebarBg,
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 100,
          transition: "width 0.25s ease",
          overflow: "hidden",
        }}
        className="designer-sidebar-desktop"
      >
        <SidebarContent />

        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            position: "absolute",
            top: "22px",
            right: "-13px",
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: C.bgAlt,
            border: `1.5px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 110,
            color: C.textMuted,
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            transition: "all 0.2s",
          }}
          title={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>
      </aside>

      {/* ── Mobile Drawer ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(74, 48, 43, 0.35)",
            zIndex: 199,
          }}
        />
      )}
      <aside
        style={{
          width: `${SIDEBAR_W}px`,
          background: C.sidebarBg,
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "fixed",
          top: 0,
          left: mobileOpen ? 0 : `-${SIDEBAR_W}px`,
          height: "100vh",
          zIndex: 200,
          transition: "left 0.25s ease",
          overflow: "hidden",
        }}
        className="designer-sidebar-mobile"
      >
        <SidebarContent isMobile />
      </aside>

      {/* ── Main content ── */}
      <div
        style={{
          flex: 1,
          marginLeft: `${sidebarWidth}px`,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          transition: "margin-left 0.25s ease",
        }}
        className="designer-main"
      >
        {/* Top bar */}
        <header
          style={{
            height: "54px",
            background: C.bgAlt,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: "12px",
            position: "sticky",
            top: 0,
            zIndex: 50,
            boxShadow: "0 1px 3px rgba(74,48,43,0.06)",
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="designer-hamburger"
            onClick={() => setMobileOpen(true)}
            style={{
              display: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: C.textMuted,
              borderRadius: "6px",
            }}
          >
            <Menu size={22} />
          </button>

          {/* Breadcrumb-style page title */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: C.textLight }}>Fremio</span>
            <span style={{ fontSize: "12px", color: C.textLight }}>/</span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: C.text }}>
              {menuItems.find((m) => isActive(m.path))?.label || "Designer"}
            </span>
          </div>

          {/* User pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 10px 5px 6px",
              background: C.accentXLight,
              borderRadius: "999px",
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: "700",
                fontSize: "11px",
                flexShrink: 0,
              }}
            >
              {(user.displayName || user.email || "D")[0].toUpperCase()}
            </div>
            <span style={{ fontSize: "12px", color: C.text, fontWeight: "500", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.email}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: "24px" }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .designer-sidebar-desktop { display: none !important; }
          .designer-main { margin-left: 0 !important; transition: none !important; }
          .designer-hamburger { display: flex !important; }
        }
        @media (min-width: 769px) {
          .designer-sidebar-mobile { display: none !important; }
          .designer-hamburger { display: none !important; }
        }
        .designer-sidebar-desktop nav a:hover {
          background: ${C.accentXLight} !important;
          color: ${C.activeText} !important;
        }
      `}</style>
    </div>
  );
}
