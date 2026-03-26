/**
 * Fremio Designer Terms of Service
 * This file is the authoritative source for Designer TOS content.
 * Rendered both as a standalone modal and stored as acceptance evidence.
 */
import React from "react";

export const TOS_VERSION = "1.0";
export const TOS_DATE = "2026-03-26";

export const TOS_CONTENT = `Fremio Designer Agreement (Short Version — Final)

Dengan mendaftar sebagai Designer di Fremio, kamu menyetujui bahwa:

1. Orisinalitas adalah wajib
Semua desain yang kamu upload adalah milikmu sendiri, atau kamu memiliki izin resmi untuk menggunakannya.

2. Tanggung jawab ada di kamu
Segala risiko, termasuk klaim copyright atau masalah hukum atas desain yang kamu upload, menjadi tanggung jawabmu sepenuhnya, bukan Fremio.

3. Fremio dapat melakukan takedown
Fremio berhak menghapus atau menonaktifkan konten kapan saja jika terindikasi melanggar aturan, hak pihak lain, atau hukum yang berlaku.

4. Penggunaan font & aset
Fremio menyediakan tools dengan font yang sudah memiliki lisensi. Jika kamu menggunakan font atau aset dari luar, maka elemen tersebut harus sudah menjadi bagian dari desain final (bukan file terpisah), dan kamu bertanggung jawab memastikan lisensinya valid untuk penggunaan komersial dan distribusi.

5. Lisensi ke Fremio
Dengan mengunggah desain, kamu memberikan kepada Fremio lisensi non-eksklusif, bebas royalti, dan berlaku global untuk menampilkan, menggunakan, mendistribusikan, serta mempromosikan karyamu dalam platform.

6. Penggunaan dalam ekosistem Fremio
Kamu setuju bahwa desain yang kamu unggah dapat digunakan, ditampilkan, dan diadaptasi oleh pengguna lain, termasuk designer lain, sebagai bagian dari fitur dan layanan di dalam Fremio. Kamu tetap memiliki hak cipta atas karyamu.

7. Kepemilikan hak cipta
Hak cipta atas desain tetap menjadi milikmu sebagai Designer. Namun, lisensi yang kamu berikan kepada Fremio tetap berlaku sesuai ketentuan ini.

8. Penghapusan & penghentian akun
Kamu dapat menghentikan partisipasi dan menghapus desain dari Fremio kapan saja. Namun, penghapusan hanya berlaku untuk penggunaan ke depan dan tidak berlaku surut. Konten yang telah digunakan atau diakses sebelum penghapusan tetap dapat digunakan dalam platform untuk menjaga pengalaman pengguna dan operasional layanan.

9. Konten harus aman & legal
Konten tidak boleh mengandung unsur ilegal, pornografi, ujaran kebencian, atau meniru/menyesatkan identitas brand atau pihak lain.

Persetujuan
Dengan melanjutkan, kamu menyetujui Terms & Conditions lengkap Fremio.
☑️ Saya setuju dan siap bertanggung jawab atas desain yang saya upload.`;

const SECTIONS = [
  {
    num: "1",
    title: "Orisinalitas adalah wajib",
    body: "Semua desain yang kamu upload adalah milikmu sendiri, atau kamu memiliki izin resmi untuk menggunakannya.",
  },
  {
    num: "2",
    title: "Tanggung jawab ada di kamu",
    body: "Segala risiko, termasuk klaim copyright atau masalah hukum atas desain yang kamu upload, menjadi tanggung jawabmu sepenuhnya, bukan Fremio.",
  },
  {
    num: "3",
    title: "Fremio dapat melakukan takedown",
    body: "Fremio berhak menghapus atau menonaktifkan konten kapan saja jika terindikasi melanggar aturan, hak pihak lain, atau hukum yang berlaku.",
  },
  {
    num: "4",
    title: "Penggunaan font & aset",
    body: "Fremio menyediakan tools dengan font yang sudah memiliki lisensi. Jika kamu menggunakan font atau aset dari luar, maka elemen tersebut harus sudah menjadi bagian dari desain final (bukan file terpisah), dan kamu bertanggung jawab memastikan lisensinya valid untuk penggunaan komersial dan distribusi.",
  },
  {
    num: "5",
    title: "Lisensi ke Fremio",
    body: "Dengan mengunggah desain, kamu memberikan kepada Fremio lisensi non-eksklusif, bebas royalti, dan berlaku global untuk menampilkan, menggunakan, mendistribusikan, serta mempromosikan karyamu dalam platform.",
  },
  {
    num: "6",
    title: "Penggunaan dalam ekosistem Fremio",
    body: "Kamu setuju bahwa desain yang kamu unggah dapat digunakan, ditampilkan, dan diadaptasi oleh pengguna lain, termasuk designer lain, sebagai bagian dari fitur dan layanan di dalam Fremio. Kamu tetap memiliki hak cipta atas karyamu.",
  },
  {
    num: "7",
    title: "Kepemilikan hak cipta",
    body: "Hak cipta atas desain tetap menjadi milikmu sebagai Designer. Namun, lisensi yang kamu berikan kepada Fremio tetap berlaku sesuai ketentuan ini.",
  },
  {
    num: "8",
    title: "Penghapusan & penghentian akun",
    body: "Kamu dapat menghentikan partisipasi dan menghapus desain dari Fremio kapan saja. Namun, penghapusan hanya berlaku untuk penggunaan ke depan dan tidak berlaku surut. Konten yang telah digunakan atau diakses sebelum penghapusan tetap dapat digunakan dalam platform untuk menjaga pengalaman pengguna dan operasional layanan.",
  },
  {
    num: "9",
    title: "Konten harus aman & legal",
    body: "Konten tidak boleh mengandung unsur ilegal, pornografi, ujaran kebencian, atau meniru/menyesatkan identitas brand atau pihak lain.",
  },
];

/**
 * DesignerTOSModal — inline modal overlay for showing TOS during registration.
 * Props: onClose (fn), onAgree (fn)
 * Designer must scroll to the bottom before the agree button is enabled.
 */
export function DesignerTOSModal({ onClose, onAgree }) {
  const [scrolledToBottom, setScrolledToBottom] = React.useState(false);
  const bodyRef = React.useRef(null);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    // Allow 20px tolerance
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setScrolledToBottom(true);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.headerTitle}>Fremio Designer Agreement</div>
            <div style={S.headerMeta}>Versi {TOS_VERSION} · Berlaku sejak {TOS_DATE}</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Scroll hint */}
        {!scrolledToBottom && (
          <div style={S.scrollHint}>↓ Scroll ke bawah untuk membaca seluruh ketentuan</div>
        )}

        {/* Intro */}
        <div style={S.body} ref={bodyRef} onScroll={handleScroll}>
          <p style={S.intro}>
            Dengan mendaftar sebagai Designer di Fremio, kamu menyetujui seluruh ketentuan berikut:
          </p>

          {/* Sections */}
          {SECTIONS.map((sec) => (
            <div key={sec.num} style={S.section}>
              <div style={S.sectionTitle}>
                <span style={S.sectionNum}>{sec.num}</span>
                {sec.title}
              </div>
              <p style={S.sectionBody}>{sec.body}</p>
            </div>
          ))}

          {/* Agreement */}
          <div style={S.agreementBox}>
            <div style={S.agreementTitle}>Persetujuan</div>
            <p style={S.agreementText}>
              Dengan melanjutkan, kamu menyetujui Terms &amp; Conditions lengkap Fremio.
            </p>
            <div style={S.agreementCheck}>☑️ Saya setuju dan siap bertanggung jawab atas desain yang saya upload.</div>
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Tutup</button>
          {onAgree && (
            <button
              style={{ ...S.agreeBtn, opacity: scrolledToBottom ? 1 : 0.45, cursor: scrolledToBottom ? "pointer" : "not-allowed" }}
              onClick={() => { if (scrolledToBottom) { onAgree(); onClose(); } }}
              disabled={!scrolledToBottom}
              title={!scrolledToBottom ? "Scroll ke bawah dulu untuk menyetujui" : ""}
            >
              {scrolledToBottom ? "Saya Setuju" : "Scroll ke bawah dulu ↓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "20px",
  },
  box: {
    background: "#fff",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "600px",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "24px 28px 16px",
    borderBottom: "1px solid #f0ece8",
    flexShrink: 0,
  },
  headerTitle: { fontSize: "17px", fontWeight: "800", color: "#1a1a2e" },
  headerMeta: { fontSize: "12px", color: "#9ca3af", marginTop: "2px" },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    color: "#9ca3af",
    padding: "2px 6px",
    lineHeight: 1,
  },
  scrollHint: {
    background: "#fef3c7",
    borderBottom: "1px solid #fde68a",
    color: "#92400e",
    fontSize: "12px",
    fontWeight: "600",
    padding: "8px 28px",
    textAlign: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 28px",
  },
  intro: {
    fontSize: "14px",
    color: "#555",
    marginBottom: "20px",
    lineHeight: 1.6,
  },
  section: {
    marginBottom: "18px",
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontWeight: "700",
    fontSize: "14px",
    color: "#1a1a2e",
    marginBottom: "6px",
  },
  sectionNum: {
    width: "22px",
    height: "22px",
    background: "#e0b7a9",
    color: "#6b2c12",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "800",
    flexShrink: 0,
  },
  sectionBody: {
    fontSize: "13px",
    color: "#555",
    lineHeight: 1.65,
    margin: "0 0 0 32px",
  },
  agreementBox: {
    marginTop: "20px",
    padding: "16px 20px",
    background: "#fdf0eb",
    borderRadius: "10px",
    border: "1px solid rgba(200,120,80,0.2)",
  },
  agreementTitle: { fontWeight: "800", fontSize: "14px", color: "#1a1a2e", marginBottom: "6px" },
  agreementText: { fontSize: "13px", color: "#444", margin: "0 0 8px", lineHeight: 1.6 },
  agreementCheck: { fontSize: "13px", fontWeight: "600", color: "#7a3e28" },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    padding: "16px 28px",
    borderTop: "1px solid #f0ece8",
    flexShrink: 0,
  },
  cancelBtn: {
    padding: "9px 20px",
    background: "#f5f5f5",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    color: "#444",
    fontWeight: "500",
  },
  agreeBtn: {
    padding: "9px 20px",
    background: "#e0b7a9",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    color: "#1a0c09",
    fontWeight: "700",
  },
};
