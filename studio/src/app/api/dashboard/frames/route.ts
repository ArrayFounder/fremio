import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { ApiResponse } from "@/types";

// GET /api/dashboard/frames
// Kembalikan semua frame aktif dari marketplace + tandai mana yang sudah
// ada di allowedFrameIds booth tertentu (optional ?boothId= query param)

export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const boothId = searchParams.get("boothId");

  // Ambil allowedFrameIds dari booth jika ada
  let allowedFrameIds: string[] = [];
  if (boothId) {
    const booth = await prisma.boothConfig.findUnique({
      where:  { id: boothId, operatorId: session.user.id },
      select: { allowedFrameIds: true },
    });
    if (booth) allowedFrameIds = booth.allowedFrameIds;
  }

  const frames = await prisma.frame.findMany({
    where:   { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id:           true,
      name:         true,
      category:     true,
      thumbnailUrl: true,
      assetUrl:     true,
      isPremium:    true,
      designerId:   true,
      aspectRatio:  true,
      canvasWidth:  true,
      canvasHeight: true,
      maxCaptures:  true,
      captureMode:  true,
    },
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      frames,
      allowedFrameIds,  // kosong [] = semua frame aktif untuk booth itu
    },
  });
}

// ─── POST /api/dashboard/frames — buat frame baru ─────────────────────────────

const CreateFrameSchema = z.object({
  name:        z.string().min(1).max(100),
  category:    z.enum(["AESTHETIC","KOREAN","VINTAGE","MINIMALIST","BIRTHDAY","WEDDING","GRADUATION","SEASONAL","CUSTOM"]),
  thumbnailUrl: z.string().url(),
  assetUrl:    z.string().url(),
  aspectRatio: z.string().default("2:3"),
  canvasWidth: z.number().int().positive().default(1080),
  canvasHeight: z.number().int().positive().default(1920),
  isPremium:   z.boolean().default(false),
  sortOrder:   z.number().int().default(0),
  maxCaptures: z.number().int().min(1).max(12).default(1),
  slots:       z.array(z.object({
    id:           z.string().optional(),
    top:          z.number(),
    left:         z.number(),
    width:        z.number(),
    height:       z.number(),
    photoIndex:   z.number().int().min(0),
    borderRadius: z.number().default(0),
  })).nullable().default(null),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateFrameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const frame = await prisma.frame.create({
    data: {
      ...parsed.data,
      slots:      parsed.data.slots ?? undefined,
      isActive:   true,
      designerId: session.user.id,
    },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: frame }, { status: 201 });
}
