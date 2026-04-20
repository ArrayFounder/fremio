import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const paymentSchema = z.object({
  midtransServerKey: z.string().min(1).max(200).nullable(),
  midtransClientKey: z.string().min(1).max(200).nullable(),
});

// GET /api/dashboard/settings/payment — cek apakah key sudah diset (tanpa expose nilainya)
export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where:  { id: session.user.id },
    select: { midtransServerKey: true, midtransClientKey: true },
  });
  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Not found" }, { status: 404 });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      // Jangan kembalikan key asli — hanya beri tahu apakah sudah diset dan preview 8 karakter
      hasServerKey:      !!operator.midtransServerKey,
      hasClientKey:      !!operator.midtransClientKey,
      serverKeyPreview:  operator.midtransServerKey
        ? operator.midtransServerKey.slice(0, 12) + "••••••••"
        : null,
      clientKeyPreview:  operator.midtransClientKey
        ? operator.midtransClientKey.slice(0, 12) + "••••••••"
        : null,
    },
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

  const { midtransServerKey, midtransClientKey } = parsed.data;

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

  await prisma.operator.update({
    where: { id: session.user.id },
    data:  { midtransServerKey, midtransClientKey },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: { updated: true } });
}
