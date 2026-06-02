import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/frames — list frame yang tersedia (public read)
export async function GET() {
  const frames = await prisma.frame.findMany({
    where:   { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: frames });
}
