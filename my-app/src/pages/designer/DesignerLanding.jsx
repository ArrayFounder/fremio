import { useNavigate } from "react-router-dom";

const C = {
  bg: "#0f0704",
  bgDeep: "#1a0c09",
  accent: "#e0b7a9",
  accentMid: "#c89585",
  accentDark: "#a07060",
  gold: "#d4a853",
  cream: "#fdf7f4",
  textMuted: "rgba(255,255,255,0.6)",
  textFaint: "rgba(255,255,255,0.35)",
  border: "rgba(224,183,169,0.18)",
  borderMid: "rgba(224,183,169,0.35)",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  .dl-root {
    min-height: 100vh;
    background: ${C.bgDeep};
    color: #fff;
    font-family: 'Inter', sans-serif;
    overflow-x: hidden;
  }

  /* === NAVBAR === */
  .dl-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 48px;
    background: linear-gradient(180deg, rgba(15,7,4,0.95) 0%, rgba(15,7,4,0) 100%);
  }
  .dl-nav-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dl-nav-logo {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: ${C.cream};
  }
  .dl-nav-tag {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: ${C.accent};
    background: rgba(224,183,169,0.12);
    border: 1px solid ${C.border};
    padding: 3px 10px;
    border-radius: 100px;
  }
  .dl-nav-login {
    font-size: 14px;
    font-weight: 500;
    color: ${C.accent};
    background: none;
    border: 1.5px solid ${C.borderMid};
    padding: 8px 20px;
    border-radius: 100px;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }
  .dl-nav-login:hover {
    background: rgba(224,183,169,0.1);
    border-color: ${C.accent};
  }

  /* === HERO === */
  .dl-hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    padding: 120px 48px 80px;
    overflow: hidden;
  }
  .dl-hero-inner {
    position: relative;
    z-index: 10;
    max-width: 620px;
  }
  .dl-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: ${C.gold};
    margin-bottom: 28px;
  }
  .dl-badge-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: ${C.gold};
    box-shadow: 0 0 8px ${C.gold};
    animation: pulse-dot 2s infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.7); }
  }
  .dl-title {
    font-size: clamp(42px, 6vw, 72px);
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -2px;
    margin: 0 0 8px;
    color: #fff;
  }
  .dl-title-accent {
    color: ${C.accent};
    font-style: italic;
  }
  .dl-title-line2 {
    display: block;
    font-size: clamp(40px, 5.5vw, 66px);
    font-weight: 300;
    letter-spacing: -1px;
    color: ${C.cream};
    opacity: 0.9;
  }
  .dl-subtitle {
    font-size: clamp(16px, 1.8vw, 18px);
    font-weight: 400;
    line-height: 1.7;
    color: ${C.textMuted};
    margin: 28px 0 44px;
    max-width: 520px;
  }
  .dl-subtitle strong {
    color: ${C.accent};
    font-weight: 600;
  }
  .dl-cta-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .dl-btn-main {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: ${C.accent};
    color: #1a0c09;
    font-size: 16px;
    font-weight: 700;
    padding: 16px 36px;
    border-radius: 100px;
    border: none;
    cursor: pointer;
    transition: all 0.25s;
    letter-spacing: -0.2px;
  }
  .dl-btn-main:hover {
    background: ${C.cream};
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(224,183,169,0.3);
  }
  .dl-btn-main svg {
    transition: transform 0.2s;
  }
  .dl-btn-main:hover svg {
    transform: translateX(4px);
  }
  .dl-btn-ghost {
    font-size: 14px;
    color: ${C.textMuted};
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 0.2s;
    padding: 0;
  }
  .dl-btn-ghost:hover {
    color: ${C.accent};
  }

  /* === BG ART: FLOATING FRAMES === */
  .dl-bg-art {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .dl-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.35;
  }
  .dl-orb-1 {
    width: 600px; height: 600px;
    right: -100px; top: -100px;
    background: radial-gradient(circle, #8b3a2a, transparent);
  }
  .dl-orb-2 {
    width: 400px; height: 400px;
    right: 200px; bottom: -50px;
    background: radial-gradient(circle, #c89585, transparent);
    opacity: 0.2;
  }
  .dl-orb-3 {
    width: 300px; height: 300px;
    left: -80px; bottom: 100px;
    background: radial-gradient(circle, #d4a853, transparent);
    opacity: 0.15;
  }
  /* Decorative frames (photo frame mockups) */
  .dl-frame-wrap {
    position: absolute;
    right: 6vw;
    top: 50%;
    transform: translateY(-50%);
    width: 400px;
    height: 480px;
  }
  .dl-photo-frame {
    position: absolute;
    border-radius: 8px;
    border: 2px solid;
    overflow: hidden;
  }
  .dl-photo-frame::after {
    content: '';
    position: absolute;
    inset: 0;
    background: inherit;
    opacity: 0.08;
  }
  .dl-pf-1 {
    width: 240px; height: 300px;
    top: 40px; left: 120px;
    border-color: rgba(224,183,169,0.4);
    background: linear-gradient(145deg, #3d1a0f 0%, #6b2e1e 40%, #c4875a 100%);
    animation: float-a 6s ease-in-out infinite;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .dl-pf-2 {
    width: 180px; height: 220px;
    top: 180px; left: 10px;
    border-color: rgba(212,168,83,0.3);
    background: linear-gradient(155deg, #1e0f08 0%, #5c3020 50%, #a87040 100%);
    transform: rotate(-8deg);
    animation: float-b 7s ease-in-out infinite;
    box-shadow: 0 16px 50px rgba(0,0,0,0.4);
    opacity: 0.85;
  }
  .dl-pf-3 {
    width: 140px; height: 170px;
    top: 10px; left: 20px;
    border-color: rgba(200,149,133,0.25);
    background: linear-gradient(120deg, #2e1510 0%, #7a3e2a 60%, #b87050 100%);
    transform: rotate(5deg);
    animation: float-c 8s ease-in-out infinite;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    opacity: 0.6;
  }
  .dl-pf-4 {
    width: 100px; height: 120px;
    bottom: 20px; right: 10px;
    border-color: rgba(224,183,169,0.2);
    background: linear-gradient(160deg, #2a1108 0%, #803b28 70%, #d08060 100%);
    transform: rotate(-4deg);
    animation: float-d 9s ease-in-out infinite;
    opacity: 0.5;
  }
  /* Frame overlay with inner mat */
  .dl-pf-mat {
    position: absolute;
    inset: 10px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px;
    pointer-events: none;
  }
  @keyframes float-a {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-16px) rotate(0.5deg); }
  }
  @keyframes float-b {
    0%, 100% { transform: translateY(0px) rotate(-8deg); }
    50% { transform: translateY(-12px) rotate(-7deg); }
  }
  @keyframes float-c {
    0%, 100% { transform: translateY(0px) rotate(5deg); }
    50% { transform: translateY(-8px) rotate(5.5deg); }
  }
  @keyframes float-d {
    0%, 100% { transform: translateY(0px) rotate(-4deg); }
    50% { transform: translateY(-10px) rotate(-3.5deg); }
  }
  /* Subtle grid overlay */
  .dl-grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(224,183,169,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(224,183,169,0.03) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  /* Divider line */
  .dl-divider {
    border: none;
    border-top: 1px solid ${C.border};
    margin: 0 48px;
    opacity: 0.5;
  }

  /* === SOCIAL PROOF STRIP === */
  .dl-strip {
    padding: 32px 48px;
    display: flex;
    align-items: center;
    gap: 40px;
    flex-wrap: wrap;
  }
  .dl-strip-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: ${C.textFaint};
    font-weight: 500;
    white-space: nowrap;
  }
  .dl-strip-items {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
  }
  .dl-strip-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dl-strip-num {
    font-size: 22px;
    font-weight: 800;
    color: ${C.accent};
    letter-spacing: -0.5px;
  }
  .dl-strip-desc {
    font-size: 12px;
    color: ${C.textMuted};
  }

  /* === FEATURES === */
  .dl-features {
    padding: 80px 48px;
  }
  .dl-features-header {
    text-align: center;
    margin-bottom: 56px;
  }
  .dl-features-eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: ${C.accentMid};
    margin-bottom: 14px;
  }
  .dl-features-title {
    font-size: clamp(28px, 3vw, 38px);
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 1.2;
    color: #fff;
    margin: 0;
  }
  .dl-features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 960px;
    margin: 0 auto;
  }
  .dl-feat-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid ${C.border};
    border-radius: 16px;
    padding: 36px 28px;
    transition: all 0.25s;
  }
  .dl-feat-card:hover {
    background: rgba(224,183,169,0.06);
    border-color: ${C.borderMid};
    transform: translateY(-4px);
  }
  .dl-feat-icon {
    width: 48px; height: 48px;
    border-radius: 12px;
    background: rgba(224,183,169,0.1);
    border: 1px solid ${C.border};
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    font-size: 22px;
  }
  .dl-feat-title {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 10px;
    letter-spacing: -0.3px;
  }
  .dl-feat-desc {
    font-size: 14px;
    line-height: 1.65;
    color: ${C.textMuted};
    margin: 0;
  }

  /* === QUOTE SECTION === */
  .dl-quote-section {
    padding: 0 48px 80px;
  }
  .dl-quote-inner {
    background: linear-gradient(135deg, rgba(160,112,95,0.12) 0%, rgba(212,168,83,0.08) 100%);
    border: 1px solid rgba(224,183,169,0.2);
    border-radius: 20px;
    padding: 60px 64px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .dl-quote-inner::before {
    content: '"';
    position: absolute;
    top: -20px; left: 40px;
    font-size: 180px;
    font-weight: 900;
    color: rgba(224,183,169,0.06);
    line-height: 1;
    pointer-events: none;
  }
  .dl-quote-text {
    font-size: clamp(20px, 2.5vw, 28px);
    font-weight: 300;
    line-height: 1.55;
    color: ${C.cream};
    font-style: italic;
    max-width: 680px;
    margin: 0 auto 24px;
    letter-spacing: -0.3px;
  }
  .dl-quote-text strong {
    font-weight: 700;
    color: ${C.accent};
    font-style: normal;
  }
  .dl-quote-author {
    font-size: 13px;
    color: ${C.textFaint};
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* === BOTTOM CTA === */
  .dl-bottom-cta {
    padding: 100px 48px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .dl-bottom-cta::before {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 600px; height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(160,112,95,0.15) 0%, transparent 70%);
    pointer-events: none;
  }
  .dl-bottom-title {
    font-size: clamp(32px, 4vw, 52px);
    font-weight: 800;
    letter-spacing: -2px;
    line-height: 1.1;
    color: #fff;
    margin: 0 0 16px;
  }
  .dl-bottom-sub {
    font-size: 17px;
    color: ${C.textMuted};
    margin: 0 0 44px;
    line-height: 1.6;
  }
  .dl-bottom-cta-btns {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    flex-wrap: wrap;
  }

  /* === FOOTER === */
  .dl-footer {
    padding: 24px 48px;
    border-top: 1px solid ${C.border};
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  .dl-footer-back {
    font-size: 13px;
    color: ${C.textFaint};
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: color 0.2s;
  }
  .dl-footer-back:hover {
    color: ${C.accent};
  }
  .dl-footer-copy {
    font-size: 12px;
    color: ${C.textFaint};
  }

  /* === RESPONSIVE === */
  @media (max-width: 900px) {
    .dl-nav { padding: 18px 24px; }
    .dl-hero { padding: 100px 24px 64px; min-height: auto; }
    .dl-frame-wrap { display: none; }
    .dl-features { padding: 60px 24px; }
    .dl-features-grid { grid-template-columns: 1fr; gap: 16px; }
    .dl-quote-section { padding: 0 24px 64px; }
    .dl-quote-inner { padding: 40px 28px; }
    .dl-quote-inner::before { display: none; }
    .dl-bottom-cta { padding: 80px 24px; }
    .dl-strip { padding: 28px 24px; gap: 24px; }
    .dl-divider { margin: 0 24px; }
    .dl-footer { padding: 20px 24px; }
  }
  @media (max-width: 600px) {
    .dl-nav-tag { display: none; }
    .dl-cta-group { align-items: stretch; }
    .dl-btn-main { justify-content: center; }
    .dl-strip-items { gap: 20px; }
    .dl-bottom-cta-btns { flex-direction: column; align-items: stretch; }
    .dl-bottom-cta-btns .dl-btn-main { width: 100%; justify-content: center; }
  }
`;

export default function DesignerLanding() {
  const navigate = useNavigate();

  return (
    <div className="dl-root">
      <style>{css}</style>

      {/* ── NAVBAR ── */}
      <nav className="dl-nav">
        <div className="dl-nav-brand">
          <span className="dl-nav-logo">fremio</span>
          <span className="dl-nav-tag">Designer Program</span>
        </div>
        <button className="dl-nav-login" onClick={() => navigate("/designer/login")}>
          Masuk
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="dl-hero">
        {/* Background art */}
        <div className="dl-bg-art">
          <div className="dl-grid-overlay" />
          <div className="dl-orb dl-orb-1" />
          <div className="dl-orb dl-orb-2" />
          <div className="dl-orb dl-orb-3" />

          {/* Floating photo frame mockups */}
          <div className="dl-frame-wrap">
            <div className="dl-photo-frame dl-pf-3">
              <div className="dl-pf-mat" />
            </div>
            <div className="dl-photo-frame dl-pf-2">
              <div className="dl-pf-mat" />
            </div>
            <div className="dl-photo-frame dl-pf-1">
              <div className="dl-pf-mat" />
            </div>
            <div className="dl-photo-frame dl-pf-4">
              <div className="dl-pf-mat" />
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="dl-hero-inner">
          <div className="dl-badge">
            <span className="dl-badge-dot" />
            Fremio Designer Program
          </div>

          <h1 className="dl-title">
            Karyamu{" "}
            <span className="dl-title-accent">Lebih</span>
            <span className="dl-title-line2">dari Sekadar Desain.</span>
          </h1>

          <p className="dl-subtitle">
            Di Fremio, setiap frame yang kamu rancang menjadi{" "}
            <strong>wadah kenangan tak ternilai</strong> jutaan keluarga
            Indonesia — dari momen pertama hingga momen terakhir yang ingin
            mereka abadikan selamanya.
          </p>

          <div className="dl-cta-group">
            <button
              className="dl-btn-main"
              onClick={() => navigate("/designer/login")}
            >
              Mulai Sekarang
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="dl-btn-ghost"
              onClick={() => navigate("/designer/login")}
            >
              Sudah punya akun? Masuk di sini
            </button>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <hr className="dl-divider" />
      <div className="dl-strip">
        <span className="dl-strip-label">Fremio dalam angka</span>
        <div className="dl-strip-items">
          <div className="dl-strip-item">
            <span className="dl-strip-num">50K+</span>
            <span className="dl-strip-desc">Foto dicetak setiap bulan</span>
          </div>
          <div className="dl-strip-item">
            <span className="dl-strip-num">120+</span>
            <span className="dl-strip-desc">Kota di seluruh Indonesia</span>
          </div>
          <div className="dl-strip-item">
            <span className="dl-strip-num">100%</span>
            <span className="dl-strip-desc">Royalti untuk desainer</span>
          </div>
          <div className="dl-strip-item">
            <span className="dl-strip-num">∞</span>
            <span className="dl-strip-desc">Kenangan yang tercipta</span>
          </div>
        </div>
      </div>
      <hr className="dl-divider" />

      {/* ── FEATURES ── */}
      <section className="dl-features">
        <div className="dl-features-header">
          <p className="dl-features-eyebrow">Mengapa bergabung</p>
          <h2 className="dl-features-title">
            Tempat terbaik bagi desainer
            <br />
            yang ingin karyanya berarti
          </h2>
        </div>
        <div className="dl-features-grid">
          <div className="dl-feat-card">
            <div className="dl-feat-icon">🖼️</div>
            <h3 className="dl-feat-title">Frame yang Hadir di Ribuan Acara</h3>
            <p className="dl-feat-desc">
              Desain kamu dipakai langsung di photobooth pernikahan, wisuda,
              ulang tahun, dan momen spesial lain di seluruh pelosok
              Indonesia. Karya nyata, dampak nyata.
            </p>
          </div>
          <div className="dl-feat-card">
            <div className="dl-feat-icon">💰</div>
            <h3 className="dl-feat-title">Royalti Setiap Kali Dicetak</h3>
            <p className="dl-feat-desc">
              Setiap kali frame karyamu digunakan, kamu mendapatkan royalti.
              Desain sekali, hasilkan terus — bahkan saat kamu sedang tidur.
            </p>
          </div>
          <div className="dl-feat-card">
            <div className="dl-feat-icon">🎨</div>
            <h3 className="dl-feat-title">Kreativitas Tanpa Batas</h3>
            <p className="dl-feat-desc">
              Editor frame Fremio dirancang khusus untuk desainer profesional.
              Ekspresikan gaya visualmu sendiri, buat template yang mencerminkan
              identitasmu sebagai seniman.
            </p>
          </div>
        </div>
      </section>

      {/* ── QUOTE SECTION ── */}
      <div className="dl-quote-section">
        <div className="dl-quote-inner">
          <p className="dl-quote-text">
            Desain bukan hanya soal estetika — ini soal{" "}
            <strong>memberi ruang bagi emosi manusia</strong> untuk tinggal
            di sebuah foto dan dikenang hingga generasi berikutnya.
          </p>
          <span className="dl-quote-author">Fremio Designer Philosophy</span>
        </div>
      </div>

      {/* ── BOTTOM CTA ── */}
      <section className="dl-bottom-cta">
        <h2 className="dl-bottom-title">
          Siap memberi warna
          <br />
          pada kenangan Indonesia?
        </h2>
        <p className="dl-bottom-sub">
          Bergabunglah bersama desainer terbaik Fremio.
          <br />
          Karyamu menanti untuk dikenang.
        </p>
        <div className="dl-bottom-cta-btns">
          <button
            className="dl-btn-main"
            onClick={() => navigate("/designer/login")}
          >
            Daftar sebagai Designer
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="dl-footer">
        <a href="/" className="dl-footer-back">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2L4 7l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Kembali ke Fremio.id
        </a>
        <span className="dl-footer-copy">© 2025 Fremio · All rights reserved</span>
      </footer>
    </div>
  );
}
