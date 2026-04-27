import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const TRIAL_ONLY_MODE = true;

const schema = z.object({
  boothConfigId: z.string().min(1),
  frameId:       z.string().optional(),
  printCount:    z.number().int().min(1).max(10).default(1),
});

// POST /api/sessions/cash
// Buat sesi langsung tanpa pembayaran digital (operator terima uang tunai sendiri).
// Sesi langsung ACTIVE seperti voucher gratis.
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

  const { boothConfigId, frameId, printCount } = parsed.data;

  const booth = await prisma.boothConfig.findUnique({
    where:   { id: boothConfigId, isActive: true },
    include: {
      operator: {
        select: { id: true, subscriptionExpiry: true, isActive: true },
      },
    },
  });

  if (!booth) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  }
  if (
    !booth.operator.isActive ||
    (!TRIAL_ONLY_MODE &&
      booth.operator.subscriptionExpiry &&
      booth.operator.subscriptionExpiry < new Date())
  ) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Operator tidak aktif" }, { status: 403 });
  }

  // Verifikasi enabledPaymentMethods mengizinkan CASH
  const prefs = booth.welcomeScreenPrefs as Record<string, unknown> | null;
  // CASH selalu aktif — tidak perlu cek enabledPaymentMethods

  const sessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const qrCode    = `DL-${sessionId.toUpperCase().slice(0, 16)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

  await prisma.boothSession.create({
    data: {
      id:            sessionId,
      boothConfigId,
      frameId:       frameId ?? null,
      status:        "ACTIVE",       // langsung aktif — bayar tunai ke operator
      qrCode,
      expiresAt,
    },
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: { sessionId, qrCode },
  });
}
