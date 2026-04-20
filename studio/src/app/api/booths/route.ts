import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBoothSchema } from "@/lib/validations/booth";
import type { ApiResponse } from "@/types";

// GET /api/booths — list semua booth milik operator yang login
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const booths = await prisma.boothConfig.findMany({
    where:   { operatorId: session.user.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: booths });
}

// POST /api/booths — buat booth baru
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const parsed = createBoothSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // TODO: cek limit booth sesuai tier subscription sebelum create

  const booth = await prisma.boothConfig.create({
    data: {
      boothName: parsed.data.name,
      slug: parsed.data.slug,
      primaryColor: parsed.data.primaryColor,
      accentColor: parsed.data.accentColor,
      operatorId: session.user.id,
    },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: booth }, { status: 201 });
}
