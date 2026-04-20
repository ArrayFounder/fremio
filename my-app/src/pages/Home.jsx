import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { trackUserSession, trackFunnelEvent } from "../services/analyticsService";
import { useSEO } from "../hooks/useSEO.js";
import { useTranslation } from "react-i18next";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  useSEO({
    title: t("home.seo_title"),
    description: t("home.seo_description"),
    keywords: "fremio, photo booth online, photobox online, photobooth online, photobox virtual, frame foto online, bingkai foto online, selfie frame, foto dengan frame, photo booth indonesia, photo booth gratis",
    canonical: "https://fremio.id/",
  });

  // Track user visit on Home page
  useEffect(() => {
    const trackVisit = async () => {
      try {
        console.log("🏠 Home: Tracking visit...");
        await trackUserSession();
        console.log("✅ Home: Session tracked");
        await trackFunnelEvent("visit");
        console.log("✅ Home: Visit event tracked");
      } catch (error) {
        console.error("❌ Home: Tracking error:", error);
      }
    };
    trackVisit();
  }, []);

  return (
    <>
      {/* ======= HERO (/#home) ======= */}
      <section
        id="home"
        className="hero-fremio"
        style={{ scrollMarginTop: "64px" }}
      >
        {/* Dekorasi sudut – di luar container agar tidak menimpa teks */}
        <CameraIcon className="deco deco-tl" />
        <FilmIcon className="deco deco-tr" />
        <FilmIcon className="deco deco-bl" />
        <CameraIcon className="deco deco-br" />

        <div className="container">
          <div className="hero-grid">
            <h1 className="hero-h1">
              {t("home.hero_h1_line1")}<br />
              <span className="accent">{t("home.hero_h1_line2")}</span>
            </h1>

            <p className="hero-sub">
              {t("home.hero_sub")}
            </p>

            <div className="cta-group">
              <NavLink to="/shares" className="cta-share">
                {t("home.cta_share")}
              </NavLink>
              <NavLink to="/frames" className="cta-primary">
                {t("home.cta_frames")}
              </NavLink>
              <NavLink
                to={"/create"}
                className="cta-secondary"
              >
                {t("home.cta_create")}
              </NavLink>
              <NavLink to="/designer" className="cta-tertiary">
                {t("home.cta_designer")}
              </NavLink>
            </div>
          </div>
        </div>
      </section>

      {/* ======= STATS (Fremio Dalam Angka) ======= */}
      <div className="home-stats-strip">
        <span className="home-stats-label">Fremio dalam angka</span>
        <div className="home-stats-items">
          <div className="home-stats-item">
            <span className="home-stats-num">10M+</span>
            <span className="home-stats-desc">Awareness</span>
          </div>
          <div className="home-stats-item">
            <span className="home-stats-num">1M+</span>
            <span className="home-stats-desc">Pengguna dari berbagai negara</span>
            <span className="home-stats-sub">🇮🇩 Indonesia &nbsp;·&nbsp; 🇲🇾 Malaysia &nbsp;·&nbsp; 🇸🇬 Singapura &nbsp;·&nbsp; 🇹🇭 Thailand &nbsp;·&nbsp; 🇵🇭 Filipina &nbsp;·&nbsp; 🇯🇵 Jepang &nbsp;·&nbsp; 🇺🇸 Amerika Serikat &nbsp;·&nbsp; 🇬🇧 Inggris &nbsp;·&nbsp; 🇫🇷 Prancis</span>
          </div>
        </div>
      </div>

      {/* ======= ABOUT (/#about) ======= */}
      <section
        id="about"
        className="about-section"
        style={{ scrollMarginTop: "64px" }}
      >
        <div className="container">
          <div className="about-content">
            {/* Cinematic Title */}
            <div className="about-header fade-in-up">
              <span className="about-overline">{t("home.about_overline")}</span>
              <h2 className="about-title">
                <span className="about-title-main">{t("home.about_title")}</span>
              </h2>
            </div>

            {/* Story Block */}
            <div className="about-story">
              <div className="story-quote fade-in-up delay-1">"</div>
              <p className="about-text fade-in-up delay-2"
                dangerouslySetInnerHTML={{ __html: t("home.story_p1") }}
              />
              <p className="about-text about-text-fade fade-in-up delay-3"
                dangerouslySetInnerHTML={{ __html: t("home.story_p2") }}
              />
              <p className="about-closing fade-in-up delay-4">
                {t("home.story_closing")}
              </p>
            </div>

            {/* Minimal Divider */}
            <div className="about-divider fade-in-up delay-5">
              <span></span>
              <span className="divider-dot">◆</span>
              <span></span>
            </div>

            {/* Vision & Mission - Refined */}
            <div className="mv-grid">
              <div className="mv-card fade-in-up delay-5">
                <span className="mv-label">{t("home.vision_label")}</span>
                <p>{t("home.vision_text")}</p>
              </div>

              <div className="mv-card fade-in-up delay-6">
                <span className="mv-label">{t("home.mission_label")}</span>
                <p>{t("home.mission_text")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>


    </>
  );
}

/* ====== Ikon dekor ====== */
function CameraIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="6" y="18" width="52" height="36" rx="6" fill="currentColor" opacity="0.85" />
      <circle cx="32" cy="36" r="11" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="32" cy="36" r="6" fill="#fff" opacity="0.6" />
      <rect x="22" y="10" width="20" height="10" rx="3" fill="currentColor" />
      <circle cx="50" cy="26" r="3" fill="#fff" opacity="0.7" />
    </svg>
  );
}
function FilmIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="14" width="36" height="36" rx="4" fill="currentColor" />
      <rect x="18" y="22" width="12" height="12" fill="#fff" />
      <rect x="34" y="22" width="4" height="12" fill="#fff" />
      <rect x="18" y="38" width="12" height="4" fill="#fff" />
      <rect x="48" y="20" width="6" height="24" rx="2" fill="currentColor" />
      <circle cx="51" cy="24" r="1.6" fill="#fff" />
      <circle cx="51" cy="40" r="1.6" fill="#fff" />
    </svg>
  );
}
