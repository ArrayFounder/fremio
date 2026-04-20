import { useState, useEffect } from "react";
import { Wallet, Phone, Info, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from "lucide-react";

const C = {
  bg: "#fdf7f4",
  bgAlt: "#fff",
  border: "#ecdeda",
  accent: "#e0b7a9",
  accentDark: "#c89585",
  accentLight: "#f5e6e0",
  accentXLight: "#fdf0eb",
  text: "#4a302b",
  textMuted: "#9b7b73",
  textLight: "#c4a39b",
  activeText: "#c07055",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  red: "#dc2626",
  redBg: "#fef2f2",
  redBorder: "#fecaca",
};

const PAYMENT_METHODS = [
  { id: "dana", label: "DANA", color: "#118EEA", bgColor: "#e8f4fd" },
  { id: "gopay", label: "GoPay", color: "#00AED6", bgColor: "#e6f7fa" },
];

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export default function DesignerWallet() {
  const [activeMethod, setActiveMethod] = useState("dana");
  const [phoneNumbers, setPhoneNumbers] = useState({ dana: "", gopay: "" });
  const [savedNumbers, setSavedNumbers] = useState({ dana: "", gopay: "" });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [openSection, setOpenSection] = useState(null);

  const token =
    localStorage.getItem("designer_token") ||
    localStorage.getItem("fremio_token");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/designer/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const loaded = {
          dana: data.dana_number || "",
          gopay: data.gopay_number || "",
        };
        setPhoneNumbers(loaded);
        setSavedNumbers(loaded);
      })
      .catch(() => {});
  }, [token]);

  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, "");
    return digits.startsWith("0") ? digits : digits ? "0" + digits : "";
  };

  const handleChange = (method, val) => {
    const formatted = formatPhone(val);
    if (formatted.length <= 15) {
      setPhoneNumbers((prev) => ({ ...prev, [method]: formatted }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`${API_BASE}/designer/wallet`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dana_number: phoneNumbers.dana,
          gopay_number: phoneNumbers.gopay,
        }),
      });
      if (!res.ok) throw new Error();
      setSavedNumbers({ ...phoneNumbers });
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3500);
    }
  };

  const hasChanges =
    phoneNumbers.dana !== savedNumbers.dana ||
    phoneNumbers.gopay !== savedNumbers.gopay;

  const faqSections = [
    {
      id: "what",
      title: "Apa Itu Royalty Pool?",
      content: (
        <>
          <p style={{ margin: "0 0 12px 0" }}>
            Royalty Pool adalah sistem pembagian penghasilan yang digunakan
            Fremio untuk memberikan kompensasi kepada desainer secara adil dan
            proporsional.
          </p>
          <p style={{ margin: "0 0 12px 0" }}>
            Setiap bulan, Fremio mengalokasikan sejumlah dana ke dalam pool —
            dana ini kemudian dibagikan kepada seluruh desainer berdasarkan
            seberapa banyak frame mereka digunakan oleh pengguna dalam periode
            tersebut. Semakin sering frame-mu dipilih dan dipakai pengguna,
            semakin besar porsi yang kamu dapatkan dari pool bulan itu.
          </p>
          <p style={{ margin: 0 }}>
            Dengan sistem ini, penghasilanmu tidak ditentukan oleh harga jual
            tetap, melainkan oleh seberapa besar kontribusi nyata frame-mu
            terhadap pengalaman pengguna di Fremio.
          </p>
        </>
      ),
    },
    {
      id: "requirements",
      title: "Syarat Keikutsertaan Royalty Pool",
      content: (
        <>
          <p style={{ margin: "0 0 14px 0" }}>
            Royalty Pool Fremio dibagikan setiap bulan kepada desainer yang
            frame-nya aktif digunakan oleh pengguna. Namun, tidak semua frame
            otomatis masuk dalam perhitungan — ada syarat yang perlu kamu
            pahami sebelum mulai.
          </p>

          <div
            style={{
              background: C.accentXLight,
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "14px",
              borderLeft: `3px solid ${C.accentDark}`,
            }}
          >
            <div
              style={{
                fontWeight: "700",
                fontSize: "13px",
                color: C.text,
                marginBottom: "6px",
              }}
            >
              Originalitas Aset
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: C.textMuted, lineHeight: 1.6 }}>
              Hanya frame yang seluruh elemen desainnya merupakan karya
              orisinal milik desainer yang akan diikutsertakan dalam Royalty
              Pool. Ini mencakup ilustrasi, grafis, tipografi kustom, tekstur,
              dan elemen visual lainnya yang kamu buat sendiri dari nol.
            </p>
            <p
              style={{
                margin: "8px 0 0 0",
                fontSize: "13px",
                color: C.textMuted,
                lineHeight: 1.6,
              }}
            >
              Frame yang mengandung aset dari pihak ketiga — termasuk elemen
              dari platform desain lain, aset berbayar maupun gratis yang
              bukan milikmu, atau elemen yang tidak dapat diverifikasi
              keasliannya — tidak akan dihitung dalam pembagian royalti.
            </p>
          </div>

          <div
            style={{
              background: "#fef2f2",
              borderRadius: "10px",
              padding: "14px 16px",
              borderLeft: `3px solid ${C.red}`,
            }}
          >
            <div
              style={{
                fontWeight: "700",
                fontSize: "13px",
                color: C.red,
                marginBottom: "6px",
              }}
            >
              Konsekuensi Pelanggaran
            </div>
            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: "13px",
                color: "#6b2020",
                lineHeight: 1.6,
              }}
            >
              Jika ditemukan bahwa frame yang disubmit mengandung aset yang
              bukan milik desainer, baik melalui review tim Fremio maupun
              laporan dari pengguna lain, maka:
            </p>
            <ul
              style={{
                margin: "0 0 8px 0",
                paddingLeft: "18px",
                fontSize: "13px",
                color: "#6b2020",
                lineHeight: 1.8,
              }}
            >
              <li>Frame akan langsung diturunkan dari platform</li>
              <li>
                Seluruh royalti yang telah terakumulasi dari frame tersebut
                akan hangus
              </li>
              <li>
                Pelanggaran berulang dapat mengakibatkan penangguhan akun
                desainer secara permanen
              </li>
            </ul>
            <p style={{ margin: 0, fontSize: "12px", color: "#9b2c2c", fontStyle: "italic" }}>
              Fremio berhak melakukan peninjauan ulang terhadap frame yang
              sudah aktif kapan saja.
            </p>
          </div>
        </>
      ),
    },
    {
      id: "launch",
      title: "Catatan Peluncuran Sistem",
      content: (
        <>
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                fontWeight: "700",
                fontSize: "13px",
                color: "#92400e",
                marginBottom: "6px",
              }}
            >
              🗓️ Royalty Pool Perdana — Akhir Mei 2026
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "#78350f", lineHeight: 1.6 }}>
              Sistem desainer Fremio saat ini masih dalam tahap awal. Sebagai
              bagian dari peluncuran perdana, Royalty Pool pertama akan
              dibagikan pada akhir Mei 2026.
            </p>
          </div>
          <p style={{ margin: "0 0 10px 0" }}>
            Meskipun pembagian baru dilakukan di akhir Mei, perhitungan
            royalti tetap dihitung sejak pertama kali frame-mu dipublikasikan
            — artinya setiap penggunaan frame oleh pengguna sejak hari pertama
            sudah tercatat dan akan ikut diperhitungkan dalam pembagian perdana
            ini.
          </p>
          <p style={{ margin: 0 }}>
            Seluruh frame orisinal yang sudah aktif dan memenuhi syarat
            sebelum tanggal pembagian akan otomatis diikutsertakan. Kami
            mengundangmu untuk mulai berkarya dari sekarang — semakin banyak
            frame-mu digunakan pengguna, semakin besar bagianmu dari pool.{" "}
            ✨
          </p>
        </>
      ),
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        padding: "28px 20px 60px",
        maxWidth: "680px",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Wallet size={18} color="#fff" />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: "800",
                color: C.text,
                letterSpacing: "-0.4px",
              }}
            >
              Wallet
            </h1>
            <p style={{ margin: 0, fontSize: "12px", color: C.textMuted }}>
              Kelola metode pembayaran royalti-mu
            </p>
          </div>
        </div>
      </div>

      {/* Payment Methods Card */}
      <div
        style={{
          background: C.bgAlt,
          borderRadius: "16px",
          border: `1px solid ${C.border}`,
          padding: "20px",
          marginBottom: "20px",
          boxShadow: "0 1px 4px rgba(74,48,43,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <Phone size={16} color={C.accentDark} />
          <span
            style={{ fontWeight: "700", fontSize: "14px", color: C.text }}
          >
            Nomor Pembayaran
          </span>
        </div>

        {/* Method tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "18px",
            background: C.accentXLight,
            borderRadius: "10px",
            padding: "4px",
          }}
        >
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMethod(m.id)}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "13px",
                transition: "all 0.18s",
                background:
                  activeMethod === m.id ? C.bgAlt : "transparent",
                color: activeMethod === m.id ? m.color : C.textMuted,
                boxShadow:
                  activeMethod === m.id
                    ? "0 1px 4px rgba(74,48,43,0.10)"
                    : "none",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Active method input */}
        {PAYMENT_METHODS.map((m) => {
          if (m.id !== activeMethod) return null;
          const isFilled = phoneNumbers[m.id].length >= 9;
          return (
            <div key={m.id}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: C.textMuted,
                  marginBottom: "6px",
                  letterSpacing: "0.3px",
                  textTransform: "uppercase",
                }}
              >
                Nomor {m.label}
              </label>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: m.color,
                    pointerEvents: "none",
                  }}
                >
                  +62
                </div>
                <input
                  type="tel"
                  value={
                    phoneNumbers[m.id]
                      ? phoneNumbers[m.id].startsWith("0")
                        ? phoneNumbers[m.id].slice(1)
                        : phoneNumbers[m.id]
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    handleChange(m.id, "0" + raw);
                  }}
                  placeholder="81234567890"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "12px 14px 12px 52px",
                    border: `1.5px solid ${isFilled ? m.color + "80" : C.border}`,
                    borderRadius: "10px",
                    fontSize: "15px",
                    color: C.text,
                    background: isFilled ? m.bgColor : C.bgAlt,
                    outline: "none",
                    transition: "border-color 0.18s, background 0.18s",
                    letterSpacing: "0.5px",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = m.color;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = isFilled
                      ? m.color + "80"
                      : C.border;
                  }}
                />
              </div>
              {savedNumbers[m.id] && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    marginTop: "6px",
                    fontSize: "12px",
                    color: C.green,
                  }}
                >
                  <CheckCircle size={12} />
                  <span>Tersimpan: +62{savedNumbers[m.id].slice(1)}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{
            marginTop: "18px",
            width: "100%",
            padding: "12px",
            border: "none",
            borderRadius: "10px",
            background:
              saving || !hasChanges
                ? C.border
                : `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            color: saving || !hasChanges ? C.textLight : "#fff",
            fontWeight: "700",
            fontSize: "14px",
            cursor: saving || !hasChanges ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {saving ? "Menyimpan..." : "Simpan Nomor"}
        </button>

        {/* Status feedback */}
        {saveStatus === "success" && (
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              background: C.greenBg,
              border: `1px solid ${C.greenBorder}`,
              borderRadius: "8px",
              fontSize: "13px",
              color: C.green,
              fontWeight: "500",
            }}
          >
            <CheckCircle size={14} />
            Nomor pembayaran berhasil disimpan!
          </div>
        )}
        {saveStatus === "error" && (
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              background: C.redBg,
              border: `1px solid ${C.redBorder}`,
              borderRadius: "8px",
              fontSize: "13px",
              color: C.red,
              fontWeight: "500",
            }}
          >
            <AlertCircle size={14} />
            Gagal menyimpan. Coba lagi beberapa saat.
          </div>
        )}
      </div>

      {/* Info notice */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          padding: "12px 14px",
          background: C.accentXLight,
          border: `1px solid ${C.accent}`,
          borderRadius: "10px",
          marginBottom: "28px",
          fontSize: "12px",
          color: C.textMuted,
          lineHeight: 1.6,
        }}
      >
        <Info size={14} style={{ flexShrink: 0, marginTop: "2px", color: C.accentDark }} />
        <span>
          Nomor ini digunakan untuk pengiriman royalti melalui DANA atau
          GoPay. Pastikan nomor yang kamu masukkan aktif dan terdaftar pada
          aplikasi pembayaran tersebut.
        </span>
      </div>

      {/* Royalty Pool Info */}
      <div style={{ marginBottom: "8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "20px",
              background: `linear-gradient(to bottom, ${C.accent}, ${C.accentDark})`,
              borderRadius: "2px",
            }}
          />
          <h2
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: "800",
              color: C.text,
              letterSpacing: "-0.3px",
            }}
          >
            Royalty Pool — Ketentuan & Info
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {faqSections.map((section) => {
            const isOpen = openSection === section.id;
            return (
              <div
                key={section.id}
                style={{
                  background: C.bgAlt,
                  borderRadius: "12px",
                  border: `1px solid ${isOpen ? C.accent : C.border}`,
                  overflow: "hidden",
                  transition: "border-color 0.18s",
                  boxShadow: "0 1px 3px rgba(74,48,43,0.05)",
                }}
              >
                <button
                  onClick={() =>
                    setOpenSection(isOpen ? null : section.id)
                  }
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "15px 16px",
                    background: isOpen ? C.accentXLight : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.18s",
                  }}
                >
                  <span
                    style={{
                      fontWeight: "700",
                      fontSize: "13px",
                      color: isOpen ? C.activeText : C.text,
                    }}
                  >
                    {section.title}
                  </span>
                  {isOpen ? (
                    <ChevronUp size={16} color={C.accentDark} />
                  ) : (
                    <ChevronDown size={16} color={C.textLight} />
                  )}
                </button>
                {isOpen && (
                  <div
                    style={{
                      padding: "4px 16px 16px",
                      fontSize: "13px",
                      color: C.textMuted,
                      lineHeight: 1.7,
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ paddingTop: "12px" }}>{section.content}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
