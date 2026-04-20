import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const updateSchema = z.object({
  businessName: z.string().min(2, "Nama bisnis minimal 2 karakter").trim().optional(),
  logoUrl:      z.string().url("URL logo tidak valid").nullable().optional(),
});

// GET /api/dashboard/settings — data profil + subscription info
export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where:  { id: session.user.id },
    select: {
      id:                 true,
      email:              true,
      businessName:       true,
      subscriptionTier:   true,
      subscriptionExpiry: true,
      isActive:           true,
      createdAt:          true,
    },
  });

  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Operator tidak ditemukan" }, { status: 404 });

  return NextResponse.json<ApiResponse>({ success: true, data: operator });
}

// PATCH /api/dashboard/settings — update profil bisnis
export async function PATCH(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const updated = await prisma.operator.update({
    where:  { id: session.user.id },
    data:   parsed.data,
    select: { id: true, email: true, businessName: true, subscriptionTier: true, subscriptionExpiry: true },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: updated });
}
