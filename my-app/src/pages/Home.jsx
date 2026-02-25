import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { trackUserSession, trackFunnelEvent } from "../services/analyticsService";
import frame1 from "../assets/frame1_ramadan.png";
import frame2 from "../assets/frame2_ramadan.png";
import frame3 from "../assets/frame3_ramadan.png";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [heroVariant, setHeroVariant] = useState('A');

  // A/B Test: Determine variant on first load
  useEffect(() => {
    const storedVariant = localStorage.getItem('heroVariant');
    if (storedVariant) {
      setHeroVariant(storedVariant);
    } else {
      // Random 50/50 split
      const variant = Math.random() < 0.5 ? 'A' : 'B';
      setHeroVariant(variant);
      localStorage.setItem('heroVariant', variant);
    }
  }, []);

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

  const currentHero = {
    headline: (
      <>
        Rayakan indahnya momen di{" "}
        <span className="accent">Bulan Ramadan</span>.
      </>
    ),
    subCopy: "Bersama Fremio, simpan hangatnya Ramadan untuk dikenang selamanya.",
    cta: "Abadikan Ramadanmu"
  };

  return (
    <>
      {/* ======= HERO (/#home) ======= */}
      <section
        id="home"
        className="hero-fremio"
        style={{ scrollMarginTop: "64px" }}
      >
        {/* Ramadan deco */}
        <CrescentIcon className="rmd-crescent" />
        <StarIcon className="rmd-star rmd-star-1" />
        <StarIcon className="rmd-star rmd-star-2" />
        <StarIcon className="rmd-star rmd-star-3" />
        <div className="container">
          <div className="hero-grid">
            {/* LEFT */}
            <div className="hero-left">
              <h1 className="hero-h1">
                {currentHero.headline}
              </h1>

              <p className="hero-sub">
                {currentHero.subCopy}
              </p>

              <NavLink
                to="/frames"
                className="cta-pink"
              >
                {currentHero.cta}
              </NavLink>

              {/* dekorasi */}
              <LanternIcon className="deco cam-tl" />
              <FilmIcon className="deco film-tc" />
              <LanternIcon className="deco cam-bl" />
              <FilmIcon className="deco film-bc" />
            </div>

            {/* RIGHT – kolase */}
            <div className="hero-right">
              <img
                src={frame3}
                alt="Contoh frame utama"
                className="shot main"
              />
              <img src={frame2} alt="Contoh frame kiri" className="shot left" />
              <img
                src={frame1}
                alt="Contoh frame kanan"
                className="shot right"
              />
            </div>
          </div>
        </div>
      </section>

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
              <span className="about-overline">— fremio journey —</span>
              <h2 className="about-title">
                <span className="about-title-main">Momen yang Kita Lewatkan</span>
              </h2>
            </div>

            {/* Story Block */}
            <div className="about-story">
              <div className="story-quote fade-in-up delay-1">"</div>
              <p className="about-text fade-in-up delay-2">
                Suatu hari kamu akan melihat ke belakang dan menyadari bahwa bukan <em>momen besar</em> yang paling penting, tapi <em>momen sehari-hari</em> yang mungkin biasa saja—tawa keluarga, candaan teman, tatapan lembut pasangan.
              </p>
              <p className="about-text about-text-fade fade-in-up delay-3">
                Suatu hari rumah akan terasa sepi. Tempat favoritmu terasa hambar. Yang paling penting adalah: <strong>apakah kamu benar-benar ada di sana</strong> saat itu semua terjadi?
              </p>
              <p className="about-closing fade-in-up delay-4">
                — Mari berada di sana, bersama —
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
                <span className="mv-label">Vision</span>
                <p>
                  Setiap orang punya cerita yang layak dirayakan. Fremio hadir sebagai teman dalam setiap cerita unik yang terjadi sehari-hari.
                </p>
              </div>

              <div className="mv-card fade-in-up delay-6">
                <span className="mv-label">Mission</span>
                <p>
                  Menyediakan frame yang pas untuk ceritamu setiap bulannya—agar momen kecil terasa istimewa.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ====== Ikon dekor ====== */
function LanternIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 80" fill="none" aria-hidden="true">
      <line x1="32" y1="0" x2="32" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <rect x="18" y="10" width="28" height="5" rx="2" fill="currentColor"/>
      <rect x="14" y="15" width="36" height="44" rx="8" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="2"/>
      <line x1="14" y1="37" x2="50" y2="37" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
      <line x1="32" y1="15" x2="32" y2="59" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
      <rect x="18" y="59" width="28" height="5" rx="2" fill="currentColor"/>
      <line x1="26" y1="64" x2="38" y2="64" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="32" cy="37" r="5" fill="currentColor" opacity="0.5"/>
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
function CrescentIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path
        d="M75,18 A46,46 0 1,0 75,102 A30,30 0 1,1 75,18 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <polygon points="92,14 94.5,21 102,21 96,25.5 98.5,32.5 92,28 85.5,32.5 88,25.5 82,21 89.5,21" fill="currentColor" />
    </svg>
  );
}
function StarIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon
        points="12,2 13.8,8.2 20,8.2 15,12 17,18 12,14.5 7,18 9,12 4,8.2 10.2,8.2"
        fill="currentColor"
      />
    </svg>
  );
}
