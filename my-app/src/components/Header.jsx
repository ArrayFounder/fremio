// src/components/Header.jsx
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useHeaderBranding } from "../contexts/HeaderBrandingContext.jsx";
import defaultLogotype from "../assets/logotype.png";
import logoSalem from "../assets/logo-salem.png";
import burgerBarIcon from "../assets/burger-bar.png";
import homeIcon from "../assets/page-icon/page-home.png";
import pricingIcon from "../assets/page-icon/pricing.png";
import framesIcon from "../assets/page-icon/page-frames.png";
import createIcon from "../assets/page-icon/page-create.png";
import shareIcon from "../assets/page-icon/page-share.png";
import eventIcon from "../assets/page-icon/page-event.png";
import profileIcon from "../assets/page-icon/page-profile.png";
import settingsIcon from "../assets/page-icon/page-settings.png";
import logoutIcon from "../assets/page-icon/logout.png";

export default function Header() {
  const { branding } = useHeaderBranding();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const headerRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const { isAuthenticated, user, logout } = useAuth();

  // Get profile photo - try multiple keys for compatibility
  const getProfilePhoto = () => {
    if (!user) return null;

    // Try Firebase UID first (new system)
    if (user.uid) {
      const photoByUid = localStorage.getItem(`profilePhoto_${user.uid}`);
      if (photoByUid) return photoByUid;
    }

    // Fallback to email (old system)
    if (user.email) {
      const photoByEmail = localStorage.getItem(`profilePhoto_${user.email}`);
      if (photoByEmail) {
        // Migrate to UID-based key if user has UID
        if (user.uid) {
          localStorage.setItem(`profilePhoto_${user.uid}`, photoByEmail);
          console.log("✅ Migrated profile photo from email to UID");
        }
        return photoByEmail;
      }
    }

    return null;
  };

  const profilePhoto = getProfilePhoto();

  // Get user initials for fallback
  const getInitials = () => {
    if (!user) return "U";
    const first = user.firstName?.charAt(0) || "";
    const last = user.lastName?.charAt(0) || "";
    return (
      (first + last).toUpperCase() || user.name?.charAt(0)?.toUpperCase() || "U"
    );
  };

  // Active state untuk section di homepage
  const isHomeActive = pathname === "/" && (hash === "" || hash === "#home");

  // Tutup panel saat route berubah / klik di luar
  useEffect(() => {
    setOpen(false);
    setProfileDropdownOpen(false);
    setMenuOpen(false);
  }, [pathname, hash]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDoc(e) {
      if (!headerRef.current) return;
      if (!headerRef.current.contains(e.target)) {
        setOpen(false);
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // Elevation on scroll (pertahankan dari kode lama)
  useEffect(() => {
    const el = headerRef.current;
    const onScroll = () => {
      if (!el) return;
      el.classList.toggle("elev", window.scrollY > 6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: false });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = () => {
    logout();
    setProfileDropdownOpen(false);
    navigate("/");
  };

  const toggleProfileDropdown = (e) => {
    e.stopPropagation();
    setProfileDropdownOpen((prev) => !prev);
  };

  const effectiveLogoSrc = branding?.logoSrc || logoSalem;
  const effectiveHeaderBg = branding?.headerColor || null;
  const effectiveGroupLogoSrc = branding?.logoSrc || defaultLogotype;

  // Group mode: standalone branded header — no Fremio logo, no nav
  if (branding?.groupMode) {
    return (
      <header
        ref={headerRef}
        className="site-header"
        style={{
          background: effectiveHeaderBg || "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px",
          minHeight: "72px",
        }}
      >
        {effectiveGroupLogoSrc ? (
          <img
            src={effectiveGroupLogoSrc}
            alt="Logo"
            style={{ maxHeight: "56px", maxWidth: "240px", objectFit: "contain" }}
          />
        ) : null}
      </header>
    );
  }

  return (
    <>
      <header
        ref={headerRef}
        className={`site-header ${open ? "open" : ""}`}
        style={effectiveHeaderBg ? { background: effectiveHeaderBg } : undefined}
      >
        <div className="container header-bar">
          {/* Left: Logo */}
          <Link
            to="/"
            className="logo"
            style={{ textDecoration: "none", cursor: "pointer" }}
          >
            <img src={effectiveLogoSrc} alt="Fremio Logo" className="logo-image" />
          </Link>

          {/* Center: Nav */}
          <nav className="main-nav">
            {/* Home & About: tetap hash-section */}
            <Link
              to="/#home"
              className={"nav-link" + (isHomeActive ? " active" : "")}
            >
              <img src={homeIcon} alt="" className="nav-icon" />
              <span>Home</span>
            </Link>

            {/* Route pages */}
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <img src={pricingIcon} alt="" className="nav-icon" />
              <span>Membership</span>
            </NavLink>
            <NavLink
              to="/frames"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <img src={framesIcon} alt="" className="nav-icon" />
              <span>Frames</span>
            </NavLink>
            <NavLink
              to="/create"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <img src={createIcon} alt="" className="nav-icon" />
              <span>Create</span>
            </NavLink>
            <NavLink
              to="/shares"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <img src={shareIcon} alt="" className="nav-icon" />
              <span>Share</span>
            </NavLink>
            <NavLink
              to="/event"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <img src={eventIcon} alt="" className="nav-icon" />
              <span>Event</span>
            </NavLink>
          </nav>

          {/* Right: Action */}
          <div className="header-actions">
            {isAuthenticated ? (
              <div style={{ position: "relative" }} ref={profileDropdownRef}>
                <button
                  onClick={toggleProfileDropdown}
                  className="btn-login"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "6px 16px 6px 6px",
                    borderRadius: "999px",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(224, 183, 169, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {/* Profile Photo or Initials */}
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: profilePhoto
                        ? `url(${profilePhoto})`
                        : "#E0B7A9",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: 600,
                      fontSize: "14px",
                      flexShrink: 0,
                    }}
                  >
                    {!profilePhoto && <span>{getInitials()}</span>}
                  </div>

                  {/* Username */}
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>
                    {user?.displayName ||
                      user?.firstName ||
                      user?.name ||
                      user?.email?.split("@")[0] ||
                      "Profile"}
                  </span>
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      background: "white",
                      borderRadius: "12px",
                      boxShadow:
                        "0 10px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)",
                      minWidth: "200px",
                      padding: "8px",
                      zIndex: 1000,
                      border: "1px solid rgba(224, 183, 169, 0.2)",
                    }}
                  >
                    {/* Profile Option */}
                    <Link
                      to="/profile"
                      onClick={() => setProfileDropdownOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 16px",
                        borderRadius: "8px",
                        textDecoration: "none",
                        color: "#333",
                        transition: "all 0.2s",
                        fontSize: "14px",
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(224, 183, 169, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <img
                        src={profileIcon}
                        alt=""
                        style={{ width: "18px", height: "18px" }}
                      />
                      <span>Profile</span>
                    </Link>

                    {/* Settings Option */}
                    <Link
                      to="/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 16px",
                        borderRadius: "8px",
                        textDecoration: "none",
                        color: "#333",
                        transition: "all 0.2s",
                        fontSize: "14px",
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(224, 183, 169, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <img
                        src={settingsIcon}
                        alt=""
                        style={{ width: "18px", height: "18px" }}
                      />
                      <span>Settings</span>
                    </Link>

                    {/* Divider */}
                    <div
                      style={{
                        height: "1px",
                        background: "rgba(224, 183, 169, 0.2)",
                        margin: "8px 0",
                      }}
                    />

                    {/* Logout Option */}
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background: "transparent",
                        color: "#dc2626",
                        transition: "all 0.2s",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(220, 38, 38, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <img
                        src={logoutIcon}
                        alt=""
                        style={{ width: "18px", height: "18px" }}
                      />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <NavLink to="/login" className="btn-login">
                Login/Register
              </NavLink>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <img
              src={burgerBarIcon}
              alt="Menu"
              className="menu-toggle-icon"
              draggable={false}
            />
          </button>
        </div>
      </header>

      {/* Overlay untuk menggelapkan background saat menu mobile terbuka */}
      <div
        className={`mobile-menu-overlay ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Mobile menu */}
      <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
        {/* Logo di dalam menu */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid rgba(224, 183, 169, 0.2)",
          }}
        >
          <img src={effectiveLogoSrc} alt="Fremio Logo" style={{ height: "32px" }} />
        </div>

        <nav className="mobile-nav">
          <Link
            to="/#home"
            className={"nav-link" + (isHomeActive ? " active" : "")}
          >
            <img src={homeIcon} alt="" className="nav-icon" />
            <span>Home</span>
          </Link>
          <NavLink
            to="/pricing"
            className={({ isActive }) =>
              "nav-link" + (isActive ? " active" : "")
            }
            onClick={() => setMenuOpen(false)}
          >
            <img src={pricingIcon} alt="" className="nav-icon" />
            <span>Membership</span>
          </NavLink>
          <NavLink
            to="/frames"
            className={({ isActive }) =>
              "nav-link" + (isActive ? " active" : "")
            }
          >
            <img src={framesIcon} alt="" className="nav-icon" />
            <span>Frames</span>
          </NavLink>
          <NavLink
            to="/create"
            className={({ isActive }) =>
              "nav-link" + (isActive ? " active" : "")
            }
            onClick={() => setMenuOpen(false)}
          >
            <img src={createIcon} alt="" className="nav-icon" />
            <span>Create</span>
          </NavLink>
          <NavLink
            to="/shares"
            className={({ isActive }) =>
              "nav-link" + (isActive ? " active" : "")
            }
            onClick={() => setMenuOpen(false)}
          >
            <img src={shareIcon} alt="" className="nav-icon" />
            <span>Share</span>
          </NavLink>
          <NavLink
            to="/event"
            className={({ isActive }) =>
              "nav-link" + (isActive ? " active" : "")
            }
            onClick={() => setMenuOpen(false)}
          >
            <img src={eventIcon} alt="" className="nav-icon" />
            <span>Event</span>
          </NavLink>
        </nav>

        {isAuthenticated ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              padding: "0 24px",
              width: "100%",
            }}
          >
            <NavLink
              to="/profile"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
              style={{ width: "100%" }}
            >
              <img
                src={profileIcon}
                alt=""
                style={{ width: "22px", height: "22px" }}
              />
              <span>Profile</span>
            </NavLink>

            <NavLink
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
              style={{ width: "100%" }}
            >
              <img
                src={settingsIcon}
                alt=""
                style={{ width: "22px", height: "22px" }}
              />
              <span>Settings</span>
            </NavLink>

            <div
              style={{
                height: "1px",
                background: "rgba(224, 183, 169, 0.2)",
                margin: "8px 0",
              }}
            />

            <button
              onClick={() => {
                setMenuOpen(false);
                handleLogout();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "#dc2626",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              <img
                src={logoutIcon}
                alt=""
                style={{ width: "22px", height: "22px" }}
              />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="btn-login mobile">
            Login/Register
          </NavLink>
        )}
      </div>
    </>
  );
}
