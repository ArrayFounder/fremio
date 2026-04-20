import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";

const schema = z.object({
  email:       z.string().email(),
  downloadUrl: z.string().url(),
  boothName:   z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  // Validasi env vars
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { success: false, error: "Email service belum dikonfigurasi." },
      { status: 503 }
    );
  }

  // Validasi input
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "Input tidak valid." }, { status: 400 });
  }

  const { email, downloadUrl, boothName } = body;
  const displayName = boothName ?? "Fremio Photobox";

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Foto Kamu Siap!</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">📸 ${displayName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 24px;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#111827;">Foto kamu siap diunduh!</h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Terima kasih sudah menggunakan ${displayName}. Klik tombol di bawah untuk mengunduh foto kamu.
              </p>
              <a href="${downloadUrl}"
                 style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;
                        font-size:16px;font-weight:700;padding:16px 36px;border-radius:12px;
                        letter-spacing:0.2px;">
                ⬇️ Unduh Foto Sekarang
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;word-break:break-all;">
                Atau buka link ini: <a href="${downloadUrl}" style="color:#6366f1;">${downloadUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:12px;color:#d1d5db;">
                Powered by <strong>Fremio</strong> — studio.fremio.id
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    await transporter.sendMail({
      from:    `"${displayName}" <${gmailUser}>`,
      to:      email,
      subject: `📸 Foto kamu dari ${displayName} siap diunduh!`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-email] nodemailer error:", err);
    return NextResponse.json(
      { success: false, error: "Gagal mengirim email. Coba lagi." },
      { status: 500 }
    );
  }
}
