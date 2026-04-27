import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const schema = z.object({
  phone:        z.string().min(8).max(20),
  downloadUrl:  z.string().url(),
  boothConfigId: z.string().min(1),
  boothName:    z.string().optional(),
});

// Normalize Indonesian phone number to international format (62xxx)
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0"))  return "62" + digits.slice(1);
  return "62" + digits;
}

// POST /api/delivery/send-whatsapp
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiResponse>({ success: false, error: "Body harus JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { phone, downloadUrl, boothConfigId, boothName } = parsed.data;

  // Ambil Fonnte token dari booth welcomeScreenPrefs
  const booth = await prisma.boothConfig.findUnique({
    where:  { id: boothConfigId },
    select: { welcomeScreenPrefs: true, boothName: true },
  });

  if (!booth) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  }

  const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
  const fonnteToken = prefs?.deliveryFonnteToken as string | undefined;

  if (!fonnteToken) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Fonnte token belum dikonfigurasi oleh operator" },
      { status: 400 }
    );
  }

  const target = normalizePhone(phone);
  const waMessage = prefs?.deliveryWaMessage as string | undefined;
  const message = waMessage
    ? waMessage.replace(/\[url\]/gi, downloadUrl)
    : `Hai, terimakasih telah datang ke photobox kami. Hasil bisa kamu buka di link berikut ${downloadUrl}`;

  const form = new URLSearchParams();
  form.set("target",  target);
  form.set("message", message);
  form.set("countryCode", "62");

  let fonnteRes: Response;
  try {
    fonnteRes = await fetch("https://api.fonnte.com/send", {
      method:  "POST",
      headers: {
        "Authorization": fonnteToken,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Gagal terhubung ke Fonnte. Cek koneksi internet server." },
      { status: 502 }
    );
  }

  const result = await fonnteRes.json().catch(() => ({})) as Record<string, unknown>;

  if (!fonnteRes.ok || result.status === false) {
    const detail = (result.message as string) ?? `HTTP ${fonnteRes.status}`;
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Fonnte error: ${detail}` },
      { status: 502 }
    );
  }

  return NextResponse.json<ApiResponse>({ success: true, data: { target, sent: true } });
}
