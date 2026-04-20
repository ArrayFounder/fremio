import { NavLink, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import logoSalem from "../assets/logo-salem.png";

/* ─────────────────────────────────────────
   Fremio Studio — Landing page untuk
   pemilik bisnis photobox offline.
   Route: /studio
───────────────────────────────────────── */

const COLOR = {
  primary: "#7c3aed",
  primaryDark: "#5b21b6",
  accent: "#f59e0b",
  accentLight: "#fde68a",
  dark: "#0f0a1e",
  darkCard: "#1a1030",
  darkBorder: "#2d1f4e",
  textMuted: "#a78bfa",
  white: "#ffffff",
  pink: "#ec4899",
};

const s = {
  // Layout helpers
  container: { maxWidth: 1100, margin: "0 auto", padding: "0 24px" },
  row: { display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center" },
  col: { flex: "1 1 320px" },

  // Typography
  badge: {
    display: "inline-block",
    background: "rgba(124,58,237,0.18)",
    border: "1px solid rgba(124,58,237,0.4)",
    color: COLOR.textMuted,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase",
    padding: "6px 16px",
    borderRadius: 999,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: "clamp(1.75rem, 3.5vw, 2.8rem)",
    fontWeight: 900,
    lineHeight: 1.2,
    marginBottom: 16,
    color: COLOR.white,
  },
  sectionSub: {
    fontSize: "clamp(1rem, 2vw, 1.15rem)",
    lineHeight: 1.8,
    color: "#c4b5fd",
    marginBottom: 0,
  },
};

/* ── Reusable card ── */
function FeatureCard({ icon, title, desc }) {
  return (
    <div
      style={{
        background: COLOR.darkCard,
        border: `1px solid ${COLOR.darkBorder}`,
        borderRadius: 20,
        padding: "28px 28px 24px",
        flex: "1 1 280px",
        transition: "transform .2s, box-shadow .2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 16px 48px rgba(124,58,237,0.25)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontSize: 18, fontWeight: 800, color: COLOR.white, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#c4b5fd", margin: 0 }}>{desc}</p>
    </div>
  );
}

/* ── Step card ── */
function StepCard({ num, title, desc }) {
  return (
    <div style={{ flex: "1 1 200px", textAlign: "center" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #7c3aed, #ec4899)",
          color: "#fff",
          fontWeight: 900,
          fontSize: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          boxShadow: "0 4px 20px rgba(124,58,237,0.45)",
        }}
      >
        {num}
      </div>
      <h4 style={{ fontWeight: 800, fontSize: 17, color: COLOR.white, marginBottom: 8 }}>{title}</h4>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#c4b5fd", margin: 0 }}>{desc}</p>
    </div>
  );
}

/* ── Pain card ── */
function PainCard({ emoji, text }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: 14,
        padding: "16px 20px",
        flex: "1 1 240px",
      }}
    >
      <span style={{ fontSize: 24, flexShrink: 0 }}>{emoji}</span>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#fca5a5", margin: 0 }}>{text}</p>
    </div>
  );
}

/* ── Comparison row ── */
function CmpRow({ label, without, withFremio }) {
  return (
    <tr>
      <td style={{ padding: "14px 16px", fontSize: 14, color: "#c4b5fd", fontWeight: 600 }}>{label}</td>
      <td style={{ padding: "14px 16px", textAlign: "center", fontSize: 13, color: "#fca5a5" }}>{without}</td>
      <td
        style={{
          padding: "14px 16px",
          textAlign: "center",
          fontSize: 13,
          color: "#86efac",
          background: "rgba(124,58,237,0.1)",
        }}
      >
        {withFremio}
      </td>
    </tr>
  );
}

/* ── Testimonial ── */
function Quote({ name, business, city, text }) {
  return (
    <div
      style={{
        background: COLOR.darkCard,
        border: `1px solid ${COLOR.darkBorder}`,
        borderRadius: 20,
        padding: 28,
        flex: "1 1 280px",
      }}
    >
      <p style={{ fontSize: 15, lineHeight: 1.8, color: "#e2d9f7", fontStyle: "italic", marginBottom: 20 }}>
        &ldquo;{text}&rdquo;
      </p>
      <div>
        <p style={{ fontWeight: 700, fontSize: 14, color: COLOR.white, margin: "0 0 2px" }}>{name}</p>
        <p style={{ fontSize: 12, color: COLOR.textMuted, margin: 0 }}>
          {business} · {city}
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════ */
const navCss = `
  .fs-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 48px;
    background: rgba(15,10,30,0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid rgba(124,58,237,0.18);
  }
  .fs-nav-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
  }
  .fs-nav-logo {
    height: 28px;
    width: auto;
    filter: brightness(0) invert(1);
  }
  .fs-nav-tag {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #a78bfa;
    background: rgba(124,58,237,0.15);
    border: 1px solid rgba(124,58,237,0.3);
    padding: 3px 10px;
    border-radius: 100px;
  }
  .fs-nav-cta {
    font-size: 14px;
    font-weight: 700;
    color: #c4b5fd;
    background: none;
    border: 1.5px solid rgba(124,58,237,0.45);
    padding: 8px 22px;
    border-radius: 100px;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }
  .fs-nav-cta:hover {
    background: #7c3aed;
    color: #fff;
    border-color: #7c3aed;
  }
  @media (max-width: 600px) {
    .fs-nav { padding: 14px 20px; }
    .fs-nav-tag { display: none; }
  }
`;

export default function FremioStudio() {
  const navigate = useNavigate();
  // Page sengaja disembunyikan dari publik — tidak diindex search engine
  useEffect(() => {
    // Inject noindex so crawlers will not index this page
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    meta.setAttribute("data-studio-guard", "true");
    document.head.appendChild(meta);
    return () => {
      document.head
        .querySelectorAll('[data-studio-guard="true"]')
        .forEach((el) => el.remove());
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: COLOR.dark,
        color: COLOR.white,
        overflowX: "hidden",
      }}
    >
      <style>{navCss}</style>

      {/* ── NAVBAR ── */}
      <nav className="fs-nav">
        <NavLink to="/" className="fs-nav-brand">
          <img src={logoSalem} alt="Fremio" className="fs-nav-logo" />
          <span className="fs-nav-tag">Studio</span>
        </NavLink>
        <a href="#cta" className="fs-nav-cta">
          Mulai Gratis
        </a>
      </nav>
      {/* ════════════════════════════════
          § HERO
      ════════════════════════════════ */}
      <section
        style={{
          position: "relative",
          background:
            "linear-gradient(160deg, #0f0a1e 0%, #1e0a3c 40%, #2d0a4e 70%, #0f0a1e 100%)",
          padding: "120px 24px 80px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        {/* Decorative glow orbs */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "-120px",
            left: "50%",
            transform: "translateX(-50%)",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: "-60px",
            right: "10%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", maxWidth: 820, margin: "0 auto" }}>
          <span style={s.badge}>✦ Fremio Studio ✦</span>

          <h1
            style={{
              fontSize: "clamp(2.2rem, 6vw, 4rem)",
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: 24,
              background: "linear-gradient(135deg, #fff 30%, #c4b5fd 60%, #f9a8d4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Software Photobox Siap Pakai<br />
            <span style={{ color: COLOR.accent }}>— Dengan Branding Kamu Sendiri.</span>
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
              lineHeight: 1.8,
              color: "#c4b5fd",
              maxWidth: 640,
              margin: "0 auto 36px",
            }}
          >
            Fremio Studio adalah platform software photobox white-label untuk pemilik bisnis
            booth foto offline. Jalankan sesi foto dengan tampilan brand kamu, frame eksklusif,
            dan manajemen bisnis — tanpa perlu coding.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
            <a
              href="#cta"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 17,
                padding: "16px 40px",
                borderRadius: 999,
                textDecoration: "none",
                boxShadow: "0 8px 32px rgba(124,58,237,0.5)",
                transition: "opacity .15s",
              }}
            >
              Mulai Gratis Sekarang →
            </a>
            <a
              href="#how-it-works"
              style={{
                display: "inline-block",
                background: "transparent",
                color: "#c4b5fd",
                fontWeight: 700,
                fontSize: 17,
                padding: "16px 36px",
                borderRadius: 999,
                textDecoration: "none",
                border: "1.5px solid rgba(196,181,253,0.35)",
                transition: "background .15s",
              }}
            >
              Lihat Cara Kerjanya
            </a>
          </div>

          {/* Trust bar */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "12px 32px",
              marginTop: 48,
              fontSize: 13,
              color: "#a78bfa",
              fontWeight: 600,
            }}
          >
            {["✓ Setup dalam 15 menit", "✓ Tanpa biaya developer", "✓ Custom logo & frame", "✓ Trial gratis 14 hari"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § PROBLEM — PAIN POINTS
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: "#0d0820" }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={s.badge}>Kenapa Pemilik Photobox Perlu Ini?</span>
            <h2 style={s.sectionTitle}>
              Bisnis photobox offline kamu<br />tumbuh — tapi softwarenya ketinggalan?
            </h2>
            <p style={{ ...s.sectionSub, maxWidth: 600, margin: "0 auto" }}>
              Banyak owner photobox masih pakai software lawas, tampilan generik, atau bahkan
              software bajakan. Ini masalah nyata yang bikin bisnis stuck.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <PainCard emoji="😤" text="Software photobox yang ada tampilannya tidak menarik — customer kurang puas, repeat order rendah." />
            <PainCard emoji="💸" text="Beli software custom dari developer lokal bisa jutaan rupiah — belum termasuk biaya maintenance." />
            <PainCard emoji="🎨" text="Tidak ada frame eksklusif dengan logo / tema bisnis kamu sendiri. Branding terlihat amatir." />
            <PainCard emoji="📉" text="Tidak ada laporan sesi, tidak tahu berapa foto yang diambil, tidak ada data untuk optimasi bisnis." />
            <PainCard emoji="🔧" text="Upgrade fitur butuh waktu lama — harus tunggu developer yang sibuk dan terkadang menghilang." />
            <PainCard emoji="🌐" text="Customer tidak bisa langsung download foto ke HP — pengalaman yang tidak memuaskan di era digital." />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § WHAT IS FREMIO STUDIO
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: COLOR.dark }}>
        <div style={s.container}>
          <div style={{ ...s.row, gap: 48 }}>
            {/* Left: Text */}
            <div style={s.col}>
              <span style={s.badge}>Apa Itu Fremio Studio?</span>
              <h2 style={s.sectionTitle}>
                Software photobox profesional.<br />
                <span style={{ color: "#f9a8d4" }}>Identitas bisnis kamu, sepenuhnya.</span>
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.8, color: "#c4b5fd", marginBottom: 24 }}>
                <strong style={{ color: "#fff" }}>Fremio Studio</strong> adalah solusi software-as-a-service
                (SaaS) untuk pemilik bisnis photobox offline. Dengan Fremio Studio, kamu mendapatkan
                platform foto booth yang berjalan di browser — bisa digunakan di tablet, laptop, atau
                layar sentuh — dengan logo, warna, dan frame bermerek bisnis kamu.
              </p>
              <p style={{ fontSize: 16, lineHeight: 1.8, color: "#c4b5fd", marginBottom: 32 }}>
                Pelanggan kamu cukup duduk di depan layar, pilih gaya foto, dan langsung berfoto
                dengan tampilan yang konsisten dengan brand booth kamu. Foto langsung bisa diunduh
                ke HP lewat QR code — pengalaman premium, tanpa cetak wajib.
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[
                  "White-label penuh",
                  "Berjalan di browser",
                  "Tidak perlu install",
                  "Update otomatis",
                  "Support 7 hari",
                ].map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: "rgba(124,58,237,0.15)",
                      border: "1px solid rgba(124,58,237,0.35)",
                      color: "#c4b5fd",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 999,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Mock UI card */}
            <div style={{ ...s.col, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  background: "linear-gradient(160deg, #1a1030, #2d1a4e)",
                  border: "1px solid #3d2a6e",
                  borderRadius: 24,
                  padding: 32,
                  width: "100%",
                  maxWidth: 420,
                  boxShadow: "0 24px 80px rgba(124,58,237,0.3)",
                }}
              >
                {/* Mock browser bar */}
                <div
                  style={{
                    background: "#0d0820",
                    borderRadius: 10,
                    padding: "10px 16px",
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  <span
                    style={{
                      flex: 1,
                      background: "#1a1030",
                      borderRadius: 6,
                      padding: "4px 12px",
                      fontSize: 12,
                      color: "#7c3aed",
                      marginLeft: 8,
                      fontWeight: 600,
                    }}
                  >
                    studio.fremio.id/[nama-booth-kamu]
                  </span>
                </div>

                {/* Mock studio UI */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      background: "linear-gradient(135deg, #7c3aed22, #ec489922)",
                      border: "2px dashed #7c3aed44",
                      borderRadius: 16,
                      padding: "40px 20px",
                      marginBottom: 16,
                      position: "relative",
                    }}
                  >
                    <p style={{ fontSize: 13, color: "#a78bfa", margin: "0 0 8px" }}>LOGO BOOTH KAMU</p>
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                        borderRadius: 16,
                        margin: "0 auto 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 28,
                        boxShadow: "0 4px 16px rgba(124,58,237,0.5)",
                      }}
                    >
                      📸
                    </div>
                    <p style={{ fontWeight: 800, fontSize: 18, color: "#fff", margin: "0 0 4px" }}>
                      &ldquo;StarBooth Jakarta&rdquo;
                    </p>
                    <p style={{ fontSize: 12, color: "#a78bfa", margin: 0 }}>Pilih frame favoritmu</p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {["🌸 Aesthetic", "🖤 B&W", "✨ Glitter"].map((f) => (
                      <div
                        key={f}
                        style={{
                          background: "#0d0820",
                          border: "1px solid #3d2a6e",
                          borderRadius: 10,
                          padding: "10px 4px",
                          fontSize: 11,
                          color: "#c4b5fd",
                          textAlign: "center",
                          cursor: "pointer",
                        }}
                      >
                        {f}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: 16,
                      background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                      borderRadius: 10,
                      padding: "12px",
                      fontWeight: 700,
                      fontSize: 14,
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    📷 Mulai Foto Sekarang
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § HOW IT WORKS
      ════════════════════════════════ */}
      <section id="how-it-works" style={{ padding: "80px 24px", background: "#0d0820" }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <span style={s.badge}>Cara Kerja</span>
            <h2 style={s.sectionTitle}>
              Setup dalam 15 menit.<br />Langsung bisnis.
            </h2>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center" }}>
            <StepCard
              num="1"
              title="Daftar & Setup Akun"
              desc="Buat akun Fremio Studio, masukkan nama booth, upload logo, dan pilih warna brand kamu. No coding sama sekali."
            />
            {/* Arrow */}
            <div style={{ display: "flex", alignItems: "center", color: "#7c3aed", fontSize: 24, flexShrink: 0, alignSelf: "center" }}>
              →
            </div>
            <StepCard
              num="2"
              title="Upload Frame & Atur Tampilan"
              desc="Pilih dari ribuan frame Fremio atau upload frame custom dengan logo bisnis kamu. Atur tema warna sesuai identitas booth."
            />
            {/* Arrow */}
            <div style={{ display: "flex", alignItems: "center", color: "#7c3aed", fontSize: 24, flexShrink: 0, alignSelf: "center" }}>
              →
            </div>
            <StepCard
              num="3"
              title="Buka Browser di Booth, Mulai Sesi"
              desc="Buka link studio kamu di tablet atau laptop booth. Customer langsung bisa foto dengan tampilan bermerek booth kamu."
            />
            {/* Arrow */}
            <div style={{ display: "flex", alignItems: "center", color: "#7c3aed", fontSize: 24, flexShrink: 0, alignSelf: "center" }}>
              →
            </div>
            <StepCard
              num="4"
              title="Customer Download via QR"
              desc="Setelah sesi, QR code muncul otomatis. Customer scan → foto langsung tersimpan ke galeri HP mereka. Premium experience."
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § FEATURES
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: COLOR.dark }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <span style={s.badge}>Fitur Unggulan</span>
            <h2 style={s.sectionTitle}>
              Semua yang kamu butuhkan<br />
              <span style={{ color: "#f9a8d4" }}>untuk jalankan bisnis photobox modern.</span>
            </h2>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <FeatureCard
              icon="🎨"
              title="White-Label Penuh"
              desc="Tampilkan logo, nama booth, dan warna brand kamu. Customer tidak tahu ini pakai Fremio — yang mereka tahu hanya brand kamu."
            />
            <FeatureCard
              icon="🖼️"
              title="Frame Eksklusif & Custom"
              desc="Akses ratusan frame premium Fremio atau upload frame desain sendiri. Buat tema seasonal, kolaborasi brand, atau paket event."
            />
            <FeatureCard
              icon="📱"
              title="Download QR Otomatis"
              desc="Foto langsung bisa diunduh via QR code ke HP customer. Tidak perlu kabel, email, atau AirDrop — cepat, simple, wow."
            />
            <FeatureCard
              icon="📊"
              title="Dashboard Analitik"
              desc="Lihat berapa sesi per hari, frame paling populer, dan tren kunjungan. Data real-time untuk optimasi bisnis kamu."
            />
            <FeatureCard
              icon="🔧"
              title="Mode Kiosk & Fullscreen"
              desc="Tampilkan Fremio Studio dalam mode kiosk fullscreen di tablet — pengalaman bersih tanpa distraksi browser."
            />
            <FeatureCard
              icon="⚡"
              title="Multi-Booth Support"
              desc="Punya lebih dari satu unit booth? Kelola semua dari satu dashboard. Masing-masing bisa punya branding berbeda."
            />
            <FeatureCard
              icon="🌙"
              title="Mode Malam & Custom Theme"
              desc="Atur tampilan antarmuka sesuai ambiance booth kamu — dark, light, atau custom gradient warna brand."
            />
            <FeatureCard
              icon="🔗"
              title="Link Booth Unik"
              desc="Setiap booth mendapat URL unik: fremio.id/[nama-booth]. Mudah diakses, mudah diingat customer."
            />
            <FeatureCard
              icon="🛡️"
              title="Update Otomatis Selamanya"
              desc="Fremio terus diperbarui — fitur baru, perbaikan bug, peningkatan kecepatan. Kamu tidak perlu bayar extra untuk update."
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § COMPARISON TABLE
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: "#0d0820" }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={s.badge}>Perbandingan</span>
            <h2 style={s.sectionTitle}>
              Fremio Studio vs Alternatif Lain
            </h2>
            <p style={{ ...s.sectionSub, maxWidth: 560, margin: "0 auto" }}>
              Lihat sendiri kenapa ratusan owner photobox memilih Fremio Studio.
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: COLOR.darkCard,
                borderRadius: 20,
                overflow: "hidden",
                border: `1px solid ${COLOR.darkBorder}`,
              }}
            >
              <thead>
                <tr style={{ background: "#1a0e34" }}>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: 13, color: "#a78bfa", fontWeight: 700 }}>
                    Aspek
                  </th>
                  <th style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "#fca5a5", fontWeight: 700 }}>
                    Tanpa Fremio Studio
                  </th>
                  <th
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      fontSize: 13,
                      color: "#86efac",
                      fontWeight: 700,
                      background: "rgba(124,58,237,0.15)",
                    }}
                  >
                    ✨ Dengan Fremio Studio
                  </th>
                </tr>
              </thead>
              <tbody>
                <CmpRow label="Biaya Awal" without="Rp 5–25 juta (custom dev)" withFremio="Mulai Rp 299rb/bulan" />
                <CmpRow label="Setup Time" without="2–8 minggu" withFremio="15 menit" />
                <CmpRow label="Custom Branding" without="Butuh developer" withFremio="Self-service, langsung jadi" />
                <CmpRow label="Update Fitur" without="Bayar extra di-develop ulang" withFremio="Otomatis, gratis selamanya" />
                <CmpRow label="Download Foto (HP)" without="Manual, tidak praktis" withFremio="QR Code otomatis" />
                <CmpRow label="Analitik Bisnis" without="Tidak ada" withFremio="Dashboard real-time" />
                <CmpRow label="Support" without="Tergantung developer" withFremio="Tim Fremio 7 hari" />
                <CmpRow label="Multi-Booth" without="Bayar ulang tiap booth" withFremio="Kelola semua dari 1 akun" />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § USE CASES
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: COLOR.dark }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={s.badge}>Cocok Untuk</span>
            <h2 style={s.sectionTitle}>
              Fremio Studio dirancang untuk<br />semua jenis bisnis booth foto.
            </h2>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {[
              { icon: "🏬", title: "Photobox Mall & Ritel", desc: "Setup booth di mal, minimarket, atau toko oleh-oleh dengan software yang terlihat premium dan konsisten." },
              { icon: "🎪", title: "Event Organizer", desc: "Sediakan station foto di wedding, konser, pameran, wisuda, atau gathering perusahaan dengan branding event-specific." },
              { icon: "☕", title: "Kafe & Restoran", desc: "Tambah revenue stream dari booth foto di kafe. Foto customer langsung bisa share ke Instagram — promosi gratis buat kamu." },
              { icon: "🏨", title: "Hotel & Venue", desc: "Tingkatkan pengalaman tamu dengan in-house photo booth yang branded sesuai identitas properti kamu." },
              { icon: "🎓", title: "Sekolah & Kampus", desc: "Solusi foto wisuda, prom night, atau open day dengan custom frame dan watermark nama institusi." },
              { icon: "💼", title: "Brand Activation", desc: "Tim marketing brand besar? Gunakan Fremio Studio untuk aktivasi offline dengan frame co-branded dan data insight." },
            ].map((uc) => (
              <FeatureCard key={uc.title} icon={uc.icon} title={uc.title} desc={uc.desc} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § TESTIMONIALS
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: "#0d0820" }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={s.badge}>Kata Mereka</span>
            <h2 style={s.sectionTitle}>Owner photobox sudah merasakan perbedaannya.</h2>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <Quote
              name="Dinda Maharani"
              business="SnapNest Studio"
              city="Surabaya"
              text="Sebelum Fremio Studio kami pakai software bajakan yang sering crash. Sekarang customer langsung download via QR, mereka bilang 'wah keren banget!' — repeat visit naik drastis."
            />
            <Quote
              name="Rizky Firmansyah"
              business="FotoBooth.id"
              city="Bandung"
              text="Saya punya 3 unit booth di 3 mal berbeda. Dulu manage-nya ribet banget. Sekarang tinggal buka satu dashboard dan semuanya keliatan. Custom frame per booth juga bisa — brand kita jadi lebih profesional."
            />
            <Quote
              name="Kezia Tanoto"
              business="Kilas Studio"
              city="Jakarta"
              text="Paling suka fitur analitiknya. Saya jadi tau frame mana yang paling disukai customer, jam berapa paling ramai, dan bisa optimasi strategi event. ROI balik dalam 2 minggu pertama."
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § PRICING TEASER
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: COLOR.dark }}>
        <div style={s.container}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <span style={s.badge}>Harga</span>
            <h2 style={s.sectionTitle}>
              Transparan. Terjangkau.<br />
              <span style={{ color: "#fde68a" }}>Tidak ada biaya tersembunyi.</span>
            </h2>
            <p style={{ ...s.sectionSub, maxWidth: 500, margin: "0 auto" }}>
              Coba gratis 14 hari — tidak perlu kartu kredit. Upgrade kapan saja sesuai pertumbuhan bisnis kamu.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
            {/* Starter */}
            <div
              style={{
                background: COLOR.darkCard,
                border: `1px solid ${COLOR.darkBorder}`,
                borderRadius: 24,
                padding: 36,
                flex: "1 1 260px",
                maxWidth: 320,
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 12px" }}>
                Starter
              </p>
              <p style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
                Rp 299rb
              </p>
              <p style={{ fontSize: 13, color: "#a78bfa", marginBottom: 28 }}>/bulan · 1 booth</p>
              <ul style={{ textAlign: "left", padding: 0, margin: "0 0 28px", listStyle: "none" }}>
                {[
                  "1 booth aktif",
                  "White-label branding",
                  "Akses frame Fremio",
                  "QR download foto",
                  "Dashboard dasar",
                  "Support email",
                ].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#c4b5fd", padding: "6px 0", borderBottom: "1px solid #2d1f4e" }}>
                    ✓ {f}
                  </li>
                ))}
              </ul>
              <a
                href="#cta"
                style={{
                  display: "block",
                  background: "transparent",
                  border: "2px solid #7c3aed",
                  color: "#c4b5fd",
                  fontWeight: 700,
                  fontSize: 15,
                  padding: "12px",
                  borderRadius: 12,
                  textDecoration: "none",
                  transition: "background .15s",
                }}
              >
                Coba Gratis 14 Hari
              </a>
            </div>

            {/* Pro — highlighted */}
            <div
              style={{
                background: "linear-gradient(160deg, #2d1a4e, #1a1030)",
                border: "2px solid #7c3aed",
                borderRadius: 24,
                padding: 36,
                flex: "1 1 260px",
                maxWidth: 320,
                textAlign: "center",
                position: "relative",
                boxShadow: "0 16px 60px rgba(124,58,237,0.35)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -14,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  padding: "5px 18px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                }}
              >
                ✦ Paling Populer
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#f9a8d4", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 12px" }}>
                Pro
              </p>
              <p style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
                Rp 699rb
              </p>
              <p style={{ fontSize: 13, color: "#a78bfa", marginBottom: 28 }}>/bulan · hingga 3 booth</p>
              <ul style={{ textAlign: "left", padding: 0, margin: "0 0 28px", listStyle: "none" }}>
                {[
                  "Hingga 3 booth aktif",
                  "White-label + custom domain",
                  "Frame eksklusif + upload custom",
                  "QR download + share IG link",
                  "Analitik lengkap",
                  "Mode kiosk fullscreen",
                  "Priority support",
                ].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#e2d9f7", padding: "6px 0", borderBottom: "1px solid #3d2a6e" }}>
                    ✓ {f}
                  </li>
                ))}
              </ul>
              <a
                href="#cta"
                style={{
                  display: "block",
                  background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  padding: "12px",
                  borderRadius: 12,
                  textDecoration: "none",
                  boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
                }}
              >
                Coba Gratis 14 Hari
              </a>
            </div>

            {/* Enterprise */}
            <div
              style={{
                background: COLOR.darkCard,
                border: `1px solid ${COLOR.darkBorder}`,
                borderRadius: 24,
                padding: 36,
                flex: "1 1 260px",
                maxWidth: 320,
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 12px" }}>
                Enterprise
              </p>
              <p style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
                Custom
              </p>
              <p style={{ fontSize: 13, color: "#a78bfa", marginBottom: 28 }}>unlimited booth · SLA</p>
              <ul style={{ textAlign: "left", padding: 0, margin: "0 0 28px", listStyle: "none" }}>
                {[
                  "Booth unlimited",
                  "Custom domain penuh",
                  "API integration",
                  "Dedicated account manager",
                  "SLA 99.9% uptime",
                  "Custom contract & invoicing",
                ].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#c4b5fd", padding: "6px 0", borderBottom: "1px solid #2d1f4e" }}>
                    ✓ {f}
                  </li>
                ))}
              </ul>
              <a
                href="https://wa.me/6282111222333?text=Halo%20Fremio%2C%20saya%20ingin%20tanya%20tentang%20Enterprise%20Studio"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  background: "transparent",
                  border: "2px solid #7c3aed",
                  color: "#c4b5fd",
                  fontWeight: 700,
                  fontSize: 15,
                  padding: "12px",
                  borderRadius: 12,
                  textDecoration: "none",
                }}
              >
                Hubungi Tim Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § FAQ
      ════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: "#0d0820" }}>
        <div style={{ ...s.container, maxWidth: 760 }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={s.badge}>FAQ</span>
            <h2 style={s.sectionTitle}>Pertanyaan yang sering ditanya.</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                q: "Apakah customer saya perlu install aplikasi?",
                a: "Tidak sama sekali. Fremio Studio berjalan 100% di browser — tablet atau laptop booth kamu cukup buka link studio, dan sesi foto bisa langsung dimulai. Customer juga hanya perlu scan QR untuk download.",
              },
              {
                q: "Bisa pakai hardware apa saja?",
                a: "Fremio Studio berjalan di semua tablet modern (iPad, Android), laptop, atau PC dengan browser Chrome/Edge terbaru. Tidak perlu hardware khusus — kamera webcam atau kamera built-in tablet sudah cukup.",
              },
              {
                q: "Bagaimana cara upload frame dengan logo booth saya?",
                a: "Dari dashboard Studio, kamu bisa upload file PNG transparan (dengan ukuran standar yang kami sediakan). Frame akan otomatis tersedia di booth kamu. Tidak perlu skill desain — kami juga menyediakan template frame siap pakai.",
              },
              {
                q: "Apakah ada batasan jumlah foto per sesi?",
                a: "Tidak ada batasan. Semua paket mengizinkan sesi foto tak terbatas selama masih dalam periode langganan aktif.",
              },
              {
                q: "Bagaimana dengan privasi data foto customer?",
                a: "Foto customer tidak disimpan di server Fremio secara permanen. Foto tersedia untuk download selama sesi (via QR), setelah itu data dihapus otomatis. Kami compliant dengan standar privasi data.",
              },
              {
                q: "Apakah saya bisa trial sebelum berlangganan?",
                a: "Ya! Semua paket tersedia dengan trial gratis 14 hari penuh — tidak perlu kartu kredit. Kamu bisa explore semua fitur sebelum memutuskan untuk berlangganan.",
              },
            ].map(({ q, a }) => (
              <details
                key={q}
                style={{
                  background: COLOR.darkCard,
                  border: `1px solid ${COLOR.darkBorder}`,
                  borderRadius: 14,
                  padding: "20px 24px",
                  cursor: "pointer",
                }}
              >
                <summary
                  style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#e2d9f7",
                    cursor: "pointer",
                    listStyle: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {q}
                  <span style={{ color: "#7c3aed", fontSize: 20, flexShrink: 0, marginLeft: 16 }}>+</span>
                </summary>
                <p style={{ fontSize: 15, lineHeight: 1.8, color: "#c4b5fd", margin: "16px 0 0" }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          § CTA FINAL
      ════════════════════════════════ */}
      <section
        id="cta"
        style={{
          padding: "100px 24px",
          background: "linear-gradient(135deg, #1e0a3c 0%, #2d1a4e 50%, #1a0e34 100%)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, rgba(124,58,237,0.25) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: 680, margin: "0 auto" }}>
          <span style={s.badge}>Mulai Hari Ini</span>
          <h2
            style={{
              fontSize: "clamp(2rem, 5vw, 3.2rem)",
              fontWeight: 900,
              lineHeight: 1.15,
              marginBottom: 20,
              background: "linear-gradient(135deg, #fff 30%, #c4b5fd 70%, #f9a8d4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Tingkatkan bisnis photobox kamu<br />ke level berikutnya.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.8, color: "#c4b5fd", marginBottom: 40 }}>
            Bergabung dengan ratusan owner photobox Indonesia yang sudah menjalankan bisnis
            lebih profesional, lebih efisien, dan lebih menguntungkan bersama Fremio Studio.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 32 }}>
            <NavLink
              to="/register"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #7c3aed, #ec4899)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 18,
                padding: "18px 48px",
                borderRadius: 999,
                textDecoration: "none",
                boxShadow: "0 8px 40px rgba(124,58,237,0.5)",
              }}
            >
              Mulai Trial Gratis 14 Hari →
            </NavLink>
            <a
              href="https://wa.me/6282111222333?text=Halo%20Fremio%2C%20saya%20mau%20tanya%20tentang%20Fremio%20Studio%20untuk%20bisnis%20photobox%20saya"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                background: "transparent",
                color: "#c4b5fd",
                fontWeight: 700,
                fontSize: 18,
                padding: "18px 40px",
                borderRadius: 999,
                textDecoration: "none",
                border: "1.5px solid rgba(196,181,253,0.35)",
              }}
            >
              💬 Chat WhatsApp
            </a>
          </div>

          <p style={{ fontSize: 13, color: "#7c3aed", fontWeight: 600 }}>
            ✓ Tidak perlu kartu kredit &nbsp;·&nbsp; ✓ Setup 15 menit &nbsp;·&nbsp; ✓ Batalkan kapan saja
          </p>
        </div>
      </section>

      {/* ════════════════════════════════
          § FOOTER MINI
      ════════════════════════════════ */}
      <div
        style={{
          background: "#080514",
          padding: "28px 24px",
          textAlign: "center",
          borderTop: "1px solid #1a1030",
        }}
      >
        <NavLink to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontWeight: 900, fontSize: 20, color: "#7c3aed" }}>fremio</span>
          <span style={{ fontWeight: 900, fontSize: 20, color: "#ec4899" }}>studio</span>
        </NavLink>
        <p style={{ fontSize: 13, color: "#6b5a8e", marginTop: 8 }}>
          © {new Date().getFullYear()} Fremio · Semua hak dilindungi ·{" "}
          <NavLink to="/about-us" style={{ color: "#6b5a8e" }}>Tentang Kami</NavLink>
          {" "}·{" "}
          <NavLink to="/help-center" style={{ color: "#6b5a8e" }}>Bantuan</NavLink>
        </p>
      </div>
    </div>
  );
}
