import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// GET /api/public/frames — list frame yang tersedia untuk publik (fremio.id static app)
// No authentication required
export async function GET() {
  try {
    const frames = await prisma.frame.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id:           true,
        name:         true,
        category:     true,
        thumbnailUrl: true,
        aspectRatio:  true,
        maxCaptures:  true,
        captureMode:  true,
      },
    });

    return NextResponse.json<ApiResponse>({ success: true, data: frames });
  } catch (error) {
    console.error("[api/public/frames] Error:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch frames" },
      { status: 500 }
    );
  }
}