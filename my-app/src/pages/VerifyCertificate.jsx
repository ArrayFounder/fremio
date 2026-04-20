import { useParams } from "react-router-dom";
import cert0001 from "../assets/certificate/FR-DSG-2026-0001.png";
import cert0002 from "../assets/certificate/FR-DSG-2026-0002.png";
import cert0003 from "../assets/certificate/FR-DSG-2026-0003.png";

const CERTIFICATES = {
  "FR-DSG-2026-0001": cert0001,
  "FR-DSG-2026-0002": cert0002,
  "FR-DSG-2026-0003": cert0003,
};

export default function VerifyCertificate() {
  const { certId } = useParams();
  const certImage = CERTIFICATES[certId?.toUpperCase()];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 60%, #fef9ee 100%)",
      padding: "24px",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: "20px",
        padding: "40px 32px",
        maxWidth: certImage ? "700px" : "480px",
        width: "100%",
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.1)",
        border: "2px solid #f59e0b",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎖️</div>
        <div style={{
          fontSize: "11px", fontWeight: "700", letterSpacing: "2px",
          color: "#b45309", textTransform: "uppercase", marginBottom: "6px",
        }}>
          Fremio Designer Certificate
        </div>
        <h1 style={{
          fontSize: "22px", fontWeight: "900", color: "#92400e",
          margin: "0 0 4px",
        }}>
          Sertifikat Penghargaan
        </h1>
        <p style={{ fontSize: "12px", color: "#b45309", margin: "0 0 24px" }}>
          fremio.id · {certId}
        </p>

        {certImage ? (
          <img
            src={certImage}
            alt={`Sertifikat ${certId}`}
            style={{
              width: "100%",
              borderRadius: "12px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              border: "1px solid #fde68a",
            }}
          />
        ) : (
          <div style={{
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "12px",
            padding: "20px",
            color: "#92400e",
            fontSize: "13px",
            lineHeight: 1.6,
          }}>
            Sertifikat dengan ID <strong>{certId}</strong> tidak ditemukan.
          </div>
        )}
      </div>
    </div>
  );
}

