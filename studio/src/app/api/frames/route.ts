import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/frames — list frame yang tersedia untuk operator
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // TODO: gabungkan frame publik Fremio + frame custom operator
  const frames = await prisma.frame.findMany({
    where:   { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: frames });
}
