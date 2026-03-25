import { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  PlusSquare,
  Bell,
  LogOut,
  Menu,
  X,
  Palette,
} from "lucide-react";

export default function DesignerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("designer_user") || localStorage.getItem("fremio_user") || "{}");
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

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "240px",
          background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 100,
          transition: "left 0.3s ease",
        }}
        className={`designer-sidebar${sidebarOpen ? " open" : ""}`}
      >
        {/* Brand */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Palette size={24} color="#a78bfa" />
            <div>
              <div style={{ fontWeight: "800", fontSize: "16px", color: "#fff" }}>Designer</div>
              <div style={{ fontSize: "11px", color: "#a78bfa" }}>Fremio Studio</div>
            </div>
          </div>
          {user.displayName && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: "#cdd" }}>
              👋 Halo, <strong>{user.displayName || user.email}</strong>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 12px" }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: active ? "#fff" : "#a0aec0",
                  background: active ? "rgba(167, 139, 250, 0.2)" : "transparent",
                  marginBottom: "4px",
                  fontSize: "14px",
                  fontWeight: active ? "600" : "400",
                  transition: "all 0.2s",
                  borderLeft: active ? "3px solid #a78bfa" : "3px solid transparent",
                }}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              color: "#fc8181",
              cursor: "pointer",
              borderRadius: "8px",
              fontSize: "14px",
              textAlign: "left",
            }}
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
        />
      )}

      {/* Main */}
      <div style={{ flex: 1, marginLeft: "240px", display: "flex", flexDirection: "column" }}
           className="designer-main">
        {/* Top bar */}
        <header style={{
          height: "56px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: "16px",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          <button
            className="designer-menu-btn"
            onClick={() => setSidebarOpen(true)}
            style={{
              display: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <Menu size={22} />
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: "13px", color: "#666" }}>
            {user.email}
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: "24px" }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .designer-sidebar { left: -240px !important; }
          .designer-sidebar.open { left: 0 !important; }
          .designer-main { margin-left: 0 !important; }
          .designer-menu-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .designer-sidebar { left: 0 !important; }
          .designer-menu-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}
