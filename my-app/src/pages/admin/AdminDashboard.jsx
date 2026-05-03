import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import "../../styles/admin.css";
import {
  Users,
  FileImage,
  TrendingUp,
  Globe,
  ChevronDown,
  ChevronUp,
  Wrench,
  Crown,
  Palette,
  Wallet,
  Link2,
  CalendarCheck2,
  GalleryVerticalEnd,
} from "lucide-react";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [fremioExpanded, setFremioExpanded] = useState(true);
  const [studioExpanded, setStudioExpanded] = useState(true);

  // Minimal init: just wait briefly so UI doesn't flash empty
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600 mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Dashboard only shows domain action panels. Stats & tables live in their own pages via sidebar.

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, #fdf7f4 0%, #fff 50%, #f7f1ed 100%)",
        minHeight: "100vh",
        padding: "32px 0 48px",
      }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 16px" }}>
        {/* Domain Navigation — Two main panels */}
        <section style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {/* fremio.id Panel */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ecdeda",
                borderRadius: "14px",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setFremioExpanded(v => !v)}
                style={{
                  width: "100%",
                  padding: "20px 24px",
                  border: "none",
                  borderBottom: fremioExpanded ? "1px solid #f3ebe8" : "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                    }}
                  >
                    <Globe size={22} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#333" }}>
                      fremio.id
                    </h2>
                    <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#6b6b6b" }}>
                      Frame platform, users, analytics
                    </p>
                  </div>
                </div>
                {fremioExpanded ? <ChevronUp size={20} color="#999" /> : <ChevronDown size={20} color="#999" />}
              </button>

              {fremioExpanded && (
                <div
                  style={{
                    padding: "20px 24px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <ActionButton
                    icon={<FileImage size={20} />}
                    label="Manage Frames"
                    description="View and manage frames"
                    onClick={() => navigate("/admin/frames")}
                    highlight={true}
                  />
                  <ActionButton
                    icon={<Users size={20} />}
                    label="Users"
                    description="Manage user accounts"
                    onClick={() => navigate("/admin/users")}
                  />
                  <ActionButton
                    icon={<TrendingUp size={20} />}
                    label="Analytics"
                    description="Platform statistics"
                    onClick={() => navigate("/admin/analytics")}
                  />
                  <ActionButton
                    icon={<Wrench size={20} />}
                    label="Maintenance"
                    description="System maintenance"
                    onClick={() => navigate("/admin/maintenance")}
                  />
                  <ActionButton
                    icon={<Crown size={20} />}
                    label="Subscribers"
                    description="Paid subscribers"
                    onClick={() => navigate("/admin/subscribers")}
                  />
                  <ActionButton
                    icon={<Palette size={20} />}
                    label="Designer Submissions"
                    description="Designer applications"
                    onClick={() => navigate("/admin/designer-submissions")}
                  />
                  <ActionButton
                    icon={<Wallet size={20} />}
                    label="Designer Wallets"
                    description="Payouts & balances"
                    onClick={() => navigate("/admin/designer-wallets")}
                  />
                  <ActionButton
                    icon={<Link2 size={20} />}
                    label="Share Links"
                    description="Manage share URLs"
                    onClick={() => navigate("/admin/share-links")}
                  />
                  <ActionButton
                    icon={<CalendarCheck2 size={20} />}
                    label="Event Submissions"
                    description="Event applications"
                    onClick={() => navigate("/admin/event-submissions")}
                  />
                </div>
              )}
            </div>

            {/* studio.fremio.id Panel */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ecdeda",
                borderRadius: "14px",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setStudioExpanded(v => !v)}
                style={{
                  width: "100%",
                  padding: "20px 24px",
                  border: "none",
                  borderBottom: studioExpanded ? "1px solid #f3ebe8" : "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                    }}
                  >
                    <GalleryVerticalEnd size={22} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#333" }}>
                      studio.fremio.id
                    </h2>
                    <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#6b6b6b" }}>
                      Photo booth & studio control
                    </p>
                  </div>
                </div>
                {studioExpanded ? <ChevronUp size={20} color="#999" /> : <ChevronDown size={20} color="#999" />}
              </button>

              {studioExpanded && (
                <div
                  style={{
                    padding: "20px 24px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <ActionButton
                    icon={<GalleryVerticalEnd size={20} />}
                    label="Studio Booth Control"
                    description="Manage studio booths"
                    onClick={() => navigate("/admin/studio-booths")}
                  />
                  <ActionButton
                    icon={<Users size={20} />}
                    label="Studio Owners"
                    description="Booth operators & tiers"
                    onClick={() => navigate("/admin/studio-owners")}
                    highlight={true}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  onClick,
  badge = false,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#ffffff",
        border: "1px solid #ecdeda",
        borderRadius: "14px",
        padding: "20px",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {badge && value > 0 && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "#ef4444",
            color: "white",
            borderRadius: "12px",
            padding: "4px 10px",
            fontSize: "0.75rem",
            fontWeight: "700",
            animation: "pulse 2s infinite",
          }}
        >
          NEW
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            background: color,
            color: "white",
            padding: "10px",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <h3
        style={{
          fontSize: "28px",
          fontWeight: "800",
          color: "#222",
          margin: "0 0 4px",
        }}
      >
        {value}
      </h3>
      <p
        style={{
          fontSize: "14px",
          fontWeight: "700",
          color: "#333",
          margin: "0 0 2px",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "#6b6b6b",
          margin: 0,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

// Mini Stat Card Component
function MiniStatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "#faf6f5",
        border: "1px solid #f0e4e0",
        borderRadius: "10px",
        padding: "16px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: "12px",
          color: "#6b6b6b",
          margin: "0 0 6px",
          fontWeight: "600",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "24px",
          fontWeight: "800",
          color: color,
          margin: 0,
        }}
      >
        {value}
      </p>
    </div>
  );
}

// Action Button Component
function ActionButton({
  icon,
  label,
  description,
  onClick,
  highlight = false,
  badge = 0,
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "16px",
        borderRadius: "10px",
        border: highlight ? "2px solid #e0b7a9" : "1px solid #ecdeda",
        background: highlight
          ? "linear-gradient(135deg, #fff5f2 0%, #ffffff 100%)"
          : "#ffffff",
        textAlign: "left",
        cursor: "pointer",
        transition: "all 0.2s",
        width: "100%",
        boxShadow: highlight ? "0 4px 12px rgba(224, 183, 169, 0.2)" : "none",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = highlight
          ? "linear-gradient(135deg, #fff0ec 0%, #fef9f7 100%)"
          : "#faf6f5";
        e.currentTarget.style.borderColor = "#e0b7a9";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow =
          "0 6px 16px rgba(224, 183, 169, 0.25)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = highlight
          ? "linear-gradient(135deg, #fff5f2 0%, #ffffff 100%)"
          : "#ffffff";
        e.currentTarget.style.borderColor = highlight ? "#e0b7a9" : "#ecdeda";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = highlight
          ? "0 4px 12px rgba(224, 183, 169, 0.2)"
          : "none";
      }}
    >
      {badge > 0 && (
        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "#ef4444",
            color: "white",
            borderRadius: "12px",
            padding: "4px 8px",
            fontSize: "0.7rem",
            fontWeight: "700",
            minWidth: "20px",
            textAlign: "center",
          }}
        >
          {badge}
        </div>
      )}
      <div
        style={{
          color: highlight ? "#e0b7a9" : "var(--accent, #e0b7a9)",
          flexShrink: 0,
          marginTop: "2px",
          background: highlight ? "#e0b7a9" : "transparent",
          padding: highlight ? "8px" : "0",
          borderRadius: highlight ? "8px" : "0",
        }}
      >
        <div style={{ color: highlight ? "white" : "#e0b7a9" }}>{icon}</div>
      </div>
      <div>
        <p
          style={{
            fontWeight: "700",
            color: highlight ? "#e0b7a9" : "#222",
            margin: "0 0 4px",
            fontSize: "15px",
          }}
        >
          {label}
          {highlight && (
            <span
              style={{
                marginLeft: "8px",
                fontSize: "11px",
                fontWeight: "600",
                background: "#e0b7a9",
                color: "white",
                padding: "2px 8px",
                borderRadius: "6px",
              }}
            >
              NEW
            </span>
          )}
        </p>
        <p
          style={{
            fontSize: "13px",
            color: "#6b6b6b",
            margin: 0,
          }}
        >
          {description}
        </p>
      </div>
    </button>
  );
}
