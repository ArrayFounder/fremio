import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";

/**
 * Landing page khusus SEO untuk semua keyword photobox/photobooth
 * Target: photobox online, photobooth online, fotobox online, dll.
 */
export default function PhotoboxOnline() {
  useSEO({
    title: "Photobox Online Gratis - Photo Booth Virtual Terbaik Indonesia | Fremio",
    description:
      "Fremio: photobox online gratis tanpa download aplikasi. Template aesthetic, korean photobooth, photobox couple, wedding, ulang tahun, ramadan. Bisa dari HP langsung!",
    keywords:
      "photobox online, photobooth online, fotobox online, foto box online, foto booth online, photobox gratis, photobooth gratis, photobox aesthetic, korean photobooth, photobox couple, photobox wedding, photobox ulang tahun, photobox ramadan",
    canonical: "https://fremio.id/photobox-online",
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#1e1b4b" }}>

      {/* ── HERO ── */}
      <section style={{
        background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #db2777 100%)",
        color: "#fff",
        padding: "80px 24px 60px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 14, letterSpacing: 3, opacity: 0.8, marginBottom: 12, textTransform: "uppercase" }}>
          ✦ Photobox Online Gratis ✦
        </p>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 900, lineHeight: 1.15, marginBottom: 20 }}>
          Photobox &amp; Photo Booth Online<br />
          <span style={{ color: "#f9a8d4" }}>Terbaik di Indonesia</span>
        </h1>
        <p style={{ fontSize: "clamp(1rem, 2.5vw, 1.25rem)", opacity: 0.9, maxWidth: 640, margin: "0 auto 32px" }}>
          Buat foto ala photobox mall langsung dari HP atau laptop — gratis, tanpa download aplikasi, tanpa watermark.
        </p>
        <NavLink
          to="/frames"
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#7c3aed",
            fontWeight: 700,
            fontSize: 18,
            padding: "14px 36px",
            borderRadius: 50,
            textDecoration: "none",
          }}
        >
          Coba Photobox Online Sekarang →
        </NavLink>
      </section>

      {/* ── KEYWORD CLUSTER: Apa itu photobox ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 24px" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 800, marginBottom: 16 }}>
          Apa itu Photobox Online?
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.8, marginBottom: 16 }}>
          <strong>Photobox online</strong> (juga dikenal sebagai <em>photobooth online</em>, <em>fotobox online</em>,
          <em> foto box online</em>, atau <em>foto booth digital</em>) adalah layanan foto booth virtual
          yang bisa kamu akses langsung dari browser — <strong>tanpa download aplikasi apapun</strong>.
          Cukup buka <strong>fremio.id</strong> di HP atau PC, izinkan akses kamera, pilih frame, dan foto!
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.8, marginBottom: 16 }}>
          Berbeda dari photobox fisik di mall yang perlu antre dan bayar koin,
          <strong> photobox online di Fremio</strong> bisa dipakai kapan saja, di mana saja,
          benar-benar <strong>gratis tanpa watermark</strong>.
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.8 }}>
          Fremio adalah alternatif photobox mahal yang lengkap: ada template <em>photobox aesthetic</em>,
          <em> korean photobooth</em>, <em>photobox hitam putih (black and white)</em>,
          <em> photobox vintage</em>, <em>photobox retro</em>, <em>photobox minimalis</em>,
          <em> photobox tumblr</em>, <em>photobox instagramable</em>, hingga <em>photobox 90s</em>.
        </p>
      </section>

      {/* ── FITUR GRID ── */}
      <section style={{ background: "#f5f3ff", padding: "60px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 800, marginBottom: 40, textAlign: "center" }}>
            Kenapa Pilih Fremio untuk Photobox Online?
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
          }}>
            {[
              { icon: "📱", title: "Photobox dari HP", desc: "Photobox online yang bisa dipakai langsung dari browser HP — Chrome, Safari, tanpa install apapun." },
              { icon: "🎨", title: "Ratusan Template Aesthetic", desc: "Frame photobox aesthetic, korean photobooth, vintage, monochrome, minimalis, couple, wedding, dan lebih banyak lagi." },
              { icon: "⬛", title: "Photobox Hitam Putih", desc: "Template photobox black and white, photobox monochrome, dan photobox strip 4 kotak seperti di mal Korea." },
              { icon: "💑", title: "Photobox Couple & Wedding", desc: "Template khusus photobox couple, photobox wedding, photobox ulang tahun, photobox ramadan, dan photobox lebaran." },
              { icon: "🆓", title: "Gratis Tanpa Watermark", desc: "Photobox online gratis tanpa watermark. Download foto resolusi tinggi langsung ke HP atau PC." },
              { icon: "🏢", title: "Untuk Bisnis & Event", desc: "Custom photobox untuk brand activation, sewa photobooth online, photobox untuk acara, event, dan promosi perusahaan." },
            ].map((f) => (
              <div key={f.title} style={{
                background: "#fff",
                borderRadius: 16,
                padding: "28px 24px",
                boxShadow: "0 2px 12px rgba(124,58,237,0.08)",
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.7, opacity: 0.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KEYWORD CLUSTER: Semua nama photobox ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 24px" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 800, marginBottom: 16 }}>
          Photobox, Photobooth, Fotobox — Semua Ada di Fremio
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.8, marginBottom: 16 }}>
          Apapun yang kamu cari — <strong>photobox</strong>, <strong>photobooth</strong>,
          <strong> fotobox</strong>, <strong>foto box</strong>, <strong>foto booth</strong>,
          <strong> potobooth</strong>, <strong>potobox</strong>, <strong>poto box</strong>,
          <strong> phtobox</strong>, <strong>photobok</strong>, <strong>photoboot</strong> —
          semuanya merujuk pada hal yang sama dan semua ada di <strong>Fremio</strong>!
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.8, marginBottom: 16 }}>
          Fremio adalah platform <strong>photobox online terbaik di Indonesia</strong> yang menyediakan:
        </p>
        <ul style={{ fontSize: 17, lineHeight: 2, paddingLeft: 24 }}>
          <li>Photobox online tanpa download aplikasi</li>
          <li>Photobooth online gratis tanpa watermark</li>
          <li>Fotobox digital dari HP atau laptop</li>
          <li>Template photobox aesthetic &amp; kekinian</li>
          <li>Korean photobooth / photobox Korea style</li>
          <li>Photobox 4 kotak strip seperti di mall</li>
          <li>Photobox couple, wedding, ulang tahun</li>
          <li>Photobox ramadan &amp; lebaran</li>
          <li>Photobox custom untuk bisnis &amp; event</li>
          <li>Sewa photobooth online untuk brand activation</li>
          <li>Bikin photobox / buat photobooth sendiri</li>
          <li>Edit photobox online langsung di browser</li>
        </ul>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: "#f5f3ff", padding: "60px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 800, marginBottom: 40, textAlign: "center" }}>
            Pertanyaan Umum tentang Photobox Online
          </h2>
          {[
            {
              q: "Apakah photobox online di Fremio benar-benar gratis?",
              a: "Ya! Fremio menyediakan photobox online gratis tanpa watermark. Kamu bisa pakai ratusan frame aesthetic, foto langsung dari kamera, dan download hasilnya tanpa biaya. Ada juga pilihan premium untuk frame-frame eksklusif.",
            },
            {
              q: "Apakah bisa pakai photobox dari HP tanpa aplikasi?",
              a: "Bisa! Fremio adalah photobox online yang bisa dipakai langsung dari browser HP (Chrome/Safari) tanpa download atau install aplikasi apapun. Cukup buka fremio.id dan langsung mulai.",
            },
            {
              q: "Ada template korean photobooth di Fremio?",
              a: "Ada banyak! Fremio punya template photobox aesthetic bergaya Korea — photobox hitam putih (black & white), photobox 4 kotak strip, photobox monochrome, photobox vintage, dan masih banyak lagi.",
            },
            {
              q: "Bisa bikin photobox untuk couple, wedding, atau event?",
              a: "Tentu! Ada template photobox couple, photobox wedding, photobox ulang tahun, photobox ramadan, dan photobox lebaran. Untuk event atau bisnis, tersedia custom frame dan paket sewa photobooth online.",
            },
            {
              q: "Apa bedanya photobox online dengan photobox di mall?",
              a: "Photobox di mall memerlukan kehadiran fisik dan biaya. Photobox online Fremio bisa dipakai kapan saja dari rumah, gratis, langsung dari HP — hasilnya sama keren, bahkan lebih banyak pilihan template.",
            },
            {
              q: "Apakah Fremio bisa untuk brand activation atau promosi bisnis?",
              a: "Ya! Fremio tersedia untuk kebutuhan photobox untuk event, brand activation, sewa photobooth online, white label photobooth, dan custom photobox untuk perusahaan. Hubungi tim Fremio untuk info lebih lanjut.",
            },
          ].map((item) => (
            <details key={item.q} style={{
              background: "#fff",
              borderRadius: 12,
              padding: "20px 24px",
              marginBottom: 12,
              boxShadow: "0 1px 8px rgba(124,58,237,0.07)",
              cursor: "pointer",
            }}>
              <summary style={{ fontSize: 17, fontWeight: 700, listStyle: "none", display: "flex", justifyContent: "space-between" }}>
                {item.q} <span style={{ color: "#7c3aed" }}>＋</span>
              </summary>
              <p style={{ fontSize: 16, lineHeight: 1.75, marginTop: 12, opacity: 0.8 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA BOTTOM ── */}
      <section style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #db2777 100%)",
        color: "#fff",
        padding: "60px 24px",
        textAlign: "center",
      }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, marginBottom: 16 }}>
          Siap Bikin Photobox Online?
        </h2>
        <p style={{ fontSize: 18, opacity: 0.9, marginBottom: 32 }}>
          Gratis · Dari HP · Tanpa Download · Tanpa Watermark
        </p>
        <NavLink
          to="/frames"
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#7c3aed",
            fontWeight: 700,
            fontSize: 18,
            padding: "14px 36px",
            borderRadius: 50,
            textDecoration: "none",
          }}
        >
          Mulai Sekarang di fremio.id →
        </NavLink>
      </section>

    </div>
  );
}
