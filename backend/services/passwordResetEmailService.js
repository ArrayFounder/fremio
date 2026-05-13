import nodemailer from "nodemailer";

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function getEmailConfig() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "fremioid@gmail.com";
  const pass = process.env.SMTP_PASS || "";
  const secure = parseBool(process.env.SMTP_SECURE, port === 465);
  const fromEmail = process.env.SMTP_FROM_EMAIL || "fremioid@gmail.com";
  const fromName = process.env.SMTP_FROM_NAME || "Fremio";

  return {
    host,
    port,
    user,
    pass,
    secure,
    fromEmail,
    fromName,
  };
}

export function isPasswordResetEmailConfigured() {
  const cfg = getEmailConfig();
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.fromEmail);
}

function buildTransporter() {
  const cfg = getEmailConfig();
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });
}

function renderHtml({ displayName, resetLink }) {
  const name = displayName || "Pengguna Fremio";
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:640px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 12px">Reset Password Fremio</h2>
    <p>Halo ${name},</p>
    <p>Kami menerima permintaan untuk reset password akun Anda.</p>
    <p style="margin:24px 0">
      <a href="${resetLink}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
        Reset Password
      </a>
    </p>
    <p>Atau buka link ini secara manual:</p>
    <p style="word-break:break-all"><a href="${resetLink}">${resetLink}</a></p>
    <p>Link ini berlaku selama 1 jam.</p>
    <p>Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
    <p style="font-size:12px;color:#6b7280">Fremio Support</p>
  </div>
  `;
}

export async function sendPasswordResetEmail({ toEmail, displayName, resetLink }) {
  if (!isPasswordResetEmailConfigured()) {
    return {
      success: false,
      error: "SMTP belum dikonfigurasi",
      code: "SMTP_NOT_CONFIGURED",
    };
  }

  const cfg = getEmailConfig();
  const transporter = buildTransporter();

  try {
    await transporter.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: toEmail,
      subject: "Reset Password Akun Fremio",
      text: `Halo ${displayName || "Pengguna Fremio"},\n\nBuka link berikut untuk reset password Anda (berlaku 1 jam):\n${resetLink}\n\nJika Anda tidak meminta reset password, abaikan email ini.`,
      html: renderHtml({ displayName, resetLink }),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Gagal mengirim email",
      code: "SMTP_SEND_FAILED",
    };
  }
}

export default {
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
};
