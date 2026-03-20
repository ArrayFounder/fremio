import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { Link, useNavigate } from "react-router-dom";
import paymentService from "../services/paymentService.js";
import "../styles/profile.css";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [membershipDays, setMembershipDays] = useState(null);

  useEffect(() => {
    paymentService
      .getAccess()
      .then((res) => {
        if (res?.success && res?.hasAccess && res?.data?.accessEnd) {
          const end = new Date(res.data.accessEnd);
          const now = new Date();
          const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
          setMembershipDays(days > 0 ? days : 0);
        } else {
          setMembershipDays(0);
        }
      })
      .catch(() => setMembershipDays(null));
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  // Derive readable identity pieces
  const fullName =
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    (user?.email ? user.email.split("@")[0] : "User");

  const firstName = user?.firstName || fullName.split(" ")[0] || "-";
  const lastName =
    user?.lastName || fullName.split(" ").slice(1).join(" ") || "-";
  const username =
    user?.username ||
    (user?.email
      ? user.email.split("@")[0]
      : fullName.replace(/\s+/g, "").toLowerCase());
  const email = user?.email || "-";
  const phone = user?.phone || user?.phoneNumber || "-";
  const bio = user?.bio || "-";
  const registered = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";

  const initials =
    (fullName || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  // Get profile photo from localStorage (UID first, email fallback)
  const profilePhoto =
    localStorage.getItem(`profilePhoto_${user?.uid}`) ||
    localStorage.getItem(`profilePhoto_${user?.email}`);

  return (
    <section className="profile-page">
      <div className="profile-shell container">
        {/* Header */}
        <div className="profile-header">
          <div
            className="profile-avatar"
            aria-hidden
            style={{
              background: profilePhoto ? `url(${profilePhoto})` : "#d9d9d9",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!profilePhoto && <span>{initials}</span>}
          </div>
          <h1 className="profile-title">{fullName}</h1>
        </div>

        <div className="profile-body">
          {/* Sidebar (static for now - reference look) */}
          <aside className="profile-sidebar" aria-label="Profile navigation">
            <nav>
              <a className="nav-item active" href="#profile">
                My Profile
              </a>
              <Link className="nav-item" to="/settings">
                Settings
              </Link>
              <Link className="nav-item" to="/drafts">
                Drafts
              </Link>
            </nav>
            <button className="nav-logout" onClick={handleLogout}>
              Logout
            </button>
          </aside>

          {/* Content */}
          <main className="profile-content" id="profile">
            <h2 className="section-title">My Profile</h2>
            <div className="profile-details">
              <div className="profile-row">
                <div className="label">Registration Date</div>
                <div className="value">{registered}</div>
              </div>
              <div className="profile-row">
                <div className="label">Status Member</div>
                <div className="value">
                  {membershipDays === null ? (
                    "-"
                  ) : membershipDays > 0 ? (
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>
                      Aktif &mdash; {membershipDays} hari lagi
                    </span>
                  ) : (
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>
                      Tidak aktif
                    </span>
                  )}
                </div>
              </div>
              <div className="profile-row">
                <div className="label">First Name</div>
                <div className="value">{firstName}</div>
              </div>
              <div className="profile-row">
                <div className="label">Last Name</div>
                <div className="value">{lastName}</div>
              </div>
              <div className="profile-row">
                <div className="label">Username</div>
                <div className="value">{username}</div>
              </div>
              <div className="profile-row">
                <div className="label">Email</div>
                <div className="value">{email}</div>
              </div>
              <div className="profile-row">
                <div className="label">Phone Number</div>
                <div className="value">{phone}</div>
              </div>
              <div className="profile-row">
                <div className="label">Bio</div>
                <div className="value">{bio}</div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
