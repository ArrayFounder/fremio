import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSnapToken } from "@/lib/midtrans";
import type { ApiResponse } from "@/types";

const CREDIT_PRICE_IDR = 300_000;

// ─── POST /api/payment/credits ───────────────────────────────────────────────
// Beli kredit (poin) via Midtrans Snap.
// Body: { quantity: number }  — 1 kredit = 1 booth tanpa watermark
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: { quantity?: number };
  try { body = await req.json(); } catch { body = {}; }

  const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const amount   = quantity * CREDIT_PRICE_IDR;
  const orderId  = `FREMIO-CREDIT-${session.user.id}-${Date.now()}`;

  try {
    const { snapToken } = await createSnapToken({
      orderId,
      amount,
      description: `Beli ${quantity} Kredit Booth Fremio Studio`,
      email: session.user.email ?? undefined,
      name:  session.user.name  ?? undefined,
    });

    // Simpan transaksi kredit pending
    await prisma.creditPurchase.create({
      data: {
        operatorId: session.user.id,
        quantity,
        amount,
        midtransOrderId: orderId,
      },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { snapToken, orderId, amount, quantity },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ApiResponse>({ success: false, error: message }, { status: 500 });
  }
}
