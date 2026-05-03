import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeImportedSlots } from "@/lib/fremioSlots";
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
  let frameCategoryOverrides: Record<string, string> = {};
  let boothCustomCategories: string[] = [];
  let welcomeScreenPrefs: Record<string, unknown> | null = null;
  if (boothId) {
    const booth = await prisma.boothConfig.findUnique({
      where:  { id: boothId, operatorId: session.user.id },
      select: { allowedFrameIds: true, welcomeScreenPrefs: true },
    });
    if (booth) {
      allowedFrameIds = booth.allowedFrameIds;
      welcomeScreenPrefs = (booth.welcomeScreenPrefs as Record<string, unknown> | null) ?? null;

      const rawOverrides = welcomeScreenPrefs?.frameCategoryOverrides;
      if (rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)) {
        frameCategoryOverrides = Object.fromEntries(
          Object.entries(rawOverrides as Record<string, unknown>)
            .filter(([k, v]) => typeof k === "string" && typeof v === "string" && v.trim().length > 0)
            .map(([k, v]) => [k, String(v)])
        );
      }

      const rawCustom = welcomeScreenPrefs?.boothCustomCategories;
      if (Array.isArray(rawCustom)) {
        boothCustomCategories = Array.from(
          new Set(
            rawCustom
              .map((v) => (typeof v === "string" ? v.trim() : ""))
              .filter(Boolean)
          )
        );
      }
    }
  }

  // Hanya tampilkan frame yang diimport dari fremio.id (prefix fremio_sb_)
  // Seed frames (frame-*) dan custom user frames disembunyikan dari library
  const rawFrames = await prisma.frame.findMany({
    where:   { isActive: true, id: { startsWith: "fremio_sb_" } },
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
      slots:        true,
    },
  });

  const frames = rawFrames.map((f) => {
    const override = frameCategoryOverrides[f.id];
    const effectiveCategory = override && override.trim().length > 0 ? override : f.category;
    const maxCaptures = Number(f.maxCaptures ?? 1);
    const normalizedSlots = f.id.startsWith("fremio_")
      ? normalizeImportedSlots(f.slots ?? null, Number.isFinite(maxCaptures) ? maxCaptures : 1, {
          canvasWidth: f.canvasWidth,
          canvasHeight: f.canvasHeight,
        })
      : f.slots;
    return {
      ...f,
      slots: normalizedSlots,
      sourceCategory: f.category,
      category: effectiveCategory,
    };
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      frames,
      allowedFrameIds,  // kosong [] = semua frame aktif untuk booth itu
      frameCategoryOverrides,
      boothCustomCategories,
    },
  });
}

// ─── POST /api/dashboard/frames — buat frame baru ─────────────────────────────

const CreateFrameSchema = z.object({
  name:        z.string().min(1).max(100),
  category:    z.enum(["AESTHETIC","KOREAN","VINTAGE","MINIMALIST","BIRTHDAY","WEDDING","GRADUATION","SEASONAL","CUSTOM"]),
  thumbnailUrl: z.string().default(""),
  assetUrl:    z.string().default(""),
  aspectRatio: z.string().default("2:3"),
  canvasWidth: z.number().int().positive().default(1080),
  canvasHeight: z.number().int().positive().default(1920),
  isPremium:   z.boolean().default(false),
  sortOrder:   z.number().int().default(0),
  captureMode: z.enum(["single","duplicate"]).default("single"),
  maxCaptures: z.number().int().min(1).max(12).default(1),
  slots:       z.array(z.object({
    id:           z.string().optional(),
    top:          z.number(),
    left:         z.number(),
    width:        z.number(),
    height:       z.number(),
    photoIndex:   z.number().int().min(0),
    borderRadius: z.number().default(0),
    rotation:     z.number().optional(),
    zIndex:       z.number().optional(),
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

  // Auto-add new frame to all booths that have an explicit allowedFrameIds list
  // (empty list means "all enabled"; non-empty means only listed IDs are shown)
  try {
    const userBooths = await prisma.boothConfig.findMany({
      where: { operatorId: session.user.id },
      select: { id: true, allowedFrameIds: true },
    });
    await Promise.all(
      userBooths
        .filter((b) => b.allowedFrameIds.length > 0 && !b.allowedFrameIds.includes(frame.id))
        .map((b) =>
          prisma.boothConfig.update({
            where: { id: b.id },
            data:  { allowedFrameIds: [...b.allowedFrameIds, frame.id] },
          })
        )
    );
  } catch (_) {
    // Non-critical — frame is already saved; booths can be updated manually
  }

  return NextResponse.json<ApiResponse>({ success: true, data: frame }, { status: 201 });
}
