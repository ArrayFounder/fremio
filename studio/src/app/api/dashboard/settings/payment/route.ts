import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

function toGatewayStatus(operator: {
  paymentGateway?: string | null;
  midtransServerKey: string | null;
  midtransClientKey: string | null;
  xenditSecretKey: string | null;
  xenditPublicKey: string | null;
  dokuClientId: string | null;
  dokuSecretKey: string | null;
}) {
  return {
    paymentGateway: operator.paymentGateway || "MIDTRANS",
    hasServerKey: !!operator.midtransServerKey,
    hasClientKey: !!operator.midtransClientKey,
    serverKeyPreview: operator.midtransServerKey ? operator.midtransServerKey.slice(0, 12) + "••••••••" : null,
    clientKeyPreview: operator.midtransClientKey ? operator.midtransClientKey.slice(0, 12) + "••••••••" : null,
    hasXenditSecretKey: !!operator.xenditSecretKey,
    hasXenditPublicKey: !!operator.xenditPublicKey,
    xenditSecretPreview: operator.xenditSecretKey ? operator.xenditSecretKey.slice(0, 16) + "••••••••" : null,
    xenditPublicPreview: operator.xenditPublicKey ? operator.xenditPublicKey.slice(0, 16) + "••••••••" : null,
    hasDokuClientId: !!operator.dokuClientId,
    hasDokuSecretKey: !!operator.dokuSecretKey,
    dokuClientIdPreview: operator.dokuClientId ? operator.dokuClientId.slice(0, 12) + "••••••••" : null,
    dokuSecretPreview: operator.dokuSecretKey ? operator.dokuSecretKey.slice(0, 12) + "••••••••" : null,
  };
}

const paymentSchema = z.object({
  midtransServerKey: z.string().min(1).max(200).nullable().optional(),
  midtransClientKey: z.string().min(1).max(200).nullable().optional(),
  xenditSecretKey:   z.string().min(1).max(300).nullable().optional(),
  xenditPublicKey:   z.string().min(1).max(300).nullable().optional(),
  dokuClientId:      z.string().min(1).max(200).nullable().optional(),
  dokuSecretKey:     z.string().min(1).max(300).nullable().optional(),
  paymentGateway:    z.enum(["MIDTRANS", "XENDIT", "DOKU"]).optional(),
});

// GET /api/dashboard/settings/payment — cek apakah key sudah diset (tanpa expose nilainya)
export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: session.user.id },
  });
  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Not found" }, { status: 404 });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: toGatewayStatus(operator),
  });
}

// PATCH /api/dashboard/settings/payment — simpan/hapus Midtrans keys
export async function PATCH(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiResponse>({ success: false, error: "Body harus JSON" }, { status: 400 });
  }

  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { midtransServerKey, midtransClientKey, xenditSecretKey, xenditPublicKey, dokuClientId, dokuSecretKey, paymentGateway } = parsed.data;

  // Validasi format key Midtrans (opsional tapi helpful)
  if (midtransServerKey && !midtransServerKey.startsWith("Mid-server-") && !midtransServerKey.startsWith("SB-Mid-server-")) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Server Key tidak valid. Format: Mid-server-... atau SB-Mid-server-..." },
      { status: 422 }
    );
  }
  if (midtransClientKey && !midtransClientKey.startsWith("Mid-client-") && !midtransClientKey.startsWith("SB-Mid-client-")) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Client Key tidak valid. Format: Mid-client-... atau SB-Mid-client-..." },
      { status: 422 }
    );
  }

  if (dokuClientId && !dokuClientId.startsWith("BRN-")) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "DOKU Client ID tidak valid. Gunakan Client ID dari dashboard DOKU (format BRN-...)." },
      { status: 422 }
    );
  }

  if (dokuSecretKey && !dokuSecretKey.startsWith("SK-")) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "DOKU Secret Key tidak valid. Gunakan Active Secret Key (prefix SK-...), bukan API Key (doku_key_...)." },
      { status: 422 }
    );
  }

  // Build update object — hanya field yang dikirim (undefined = tidak diubah)
  const updateData: Record<string, string | null> = {};
  if (midtransServerKey !== undefined) updateData.midtransServerKey = midtransServerKey;
  if (midtransClientKey !== undefined) updateData.midtransClientKey = midtransClientKey;
  if (xenditSecretKey   !== undefined) updateData.xenditSecretKey   = xenditSecretKey;
  if (xenditPublicKey   !== undefined) updateData.xenditPublicKey   = xenditPublicKey;
  if (dokuClientId      !== undefined) updateData.dokuClientId      = dokuClientId;
  if (dokuSecretKey     !== undefined) updateData.dokuSecretKey     = dokuSecretKey;
  if (paymentGateway    !== undefined) updateData.paymentGateway    = paymentGateway;

  await prisma.operator.update({
    where: { id: session.user.id },
    data:  updateData,
  });

  const operator = await prisma.operator.findUnique({
    where: { id: session.user.id },
  });

  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Not found" }, { status: 404 });

  return NextResponse.json<ApiResponse>({ success: true, data: toGatewayStatus(operator) });
}
