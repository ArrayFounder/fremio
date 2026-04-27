import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudioManagedFramesConfig } from "@/lib/studioManagedFrames";
import { normalizeImportedSlots } from "@/lib/fremioSlots";
import { z } from "zod";
import type { ApiResponse } from "@/types";

const SlotSchema = z.object({
  id:           z.string().optional(),
  top:          z.number(),
  left:         z.number(),
  width:        z.number(),
  height:       z.number(),
  photoIndex:   z.number().int().min(0),
  borderRadius: z.number().default(0),
  zIndex:       z.number().optional(),
  rotation:     z.number().optional(),
});

const FrameItemSchema = z.object({
  fremioId:     z.string(),
  name:         z.string().min(1).max(200),
  category:     z.enum(["AESTHETIC","KOREAN","VINTAGE","MINIMALIST","BIRTHDAY","WEDDING","GRADUATION","SEASONAL","CUSTOM"]),
  thumbnailUrl: z.string().url(),
  assetUrl:     z.string().url(),
  /** URL overlay PNG dekorasi (stiker, watermark) — digambar SETELAH foto */
  overlayUrl:   z.string().url().nullable().optional(),
  /** Mode foto: "single" (default) | "duplicate" */
  captureMode:  z.enum(["single", "duplicate"]).optional(),
  aspectRatio:  z.string().default("9:16"),
  canvasWidth:  z.number().int().positive().default(1080),
  canvasHeight: z.number().int().positive().default(1920),
  maxCaptures:  z.number().int().min(1).max(12).default(1),
  isPremium:    z.boolean().default(false),
  slots:        z.array(SlotSchema).nullable().default(null),
});

const ImportSchema = z.object({
  frames: z.array(FrameItemSchema).min(1).max(200),
  boothId: z.string().optional(),
});

// POST /api/dashboard/frames/import
// Bulk-import frame katalog studio-booth dari fremio.id ke studio DB
export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { frames, boothId } = parsed.data;

  const managedConfig = await getStudioManagedFramesConfig();
  const allowedIdsSet = new Set(managedConfig.allowedFrameIds);
  const whitelistActive =
    managedConfig.enforceWhitelist || managedConfig.allowedFrameIds.length > 0;
  const framesToImport = whitelistActive
    ? frames.filter((f) => allowedIdsSet.has(f.fremioId))
    : frames;

  if (framesToImport.length === 0) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: whitelistActive
          ? "Tidak ada frame yang diizinkan admin untuk studio"
          : "Tidak ada frame untuk diimport",
      },
      { status: 400 }
    );
  }

  const results = await Promise.allSettled(
    framesToImport.map((f) => {
      const normalizedSlots = normalizeImportedSlots(f.slots, f.maxCaptures);
      return prisma.frame.upsert({
        where: { id: `fremio_sb_${f.fremioId}` },
        update: {
          // Selalu update semua field (biar maxCaptures dan slots ikut update)
          name:         f.name,
          thumbnailUrl: f.thumbnailUrl,
          assetUrl:     f.assetUrl,
          overlayUrl:   f.overlayUrl ?? null,
          canvasWidth:  f.canvasWidth,
          canvasHeight: f.canvasHeight,
          maxCaptures:  f.maxCaptures,
          slots:        normalizedSlots,
          isActive:     true,
        },
        create: {
          id:           `fremio_sb_${f.fremioId}`,
          name:         f.name,
          category:     f.category as never,
          thumbnailUrl: f.thumbnailUrl,
          assetUrl:     f.assetUrl,
          overlayUrl:   f.overlayUrl ?? null,
          captureMode:  f.captureMode ?? "single",
          aspectRatio:  f.aspectRatio,
          canvasWidth:  f.canvasWidth,
          canvasHeight: f.canvasHeight,
          isPremium:    f.isPremium,
          isActive:     true,
          designerId:   null,
          maxCaptures:  f.maxCaptures,
          slots:        normalizedSlots,
        },
      })
    })
  );

  const imported = results.filter((r) => r.status === "fulfilled").length;
  const failed   = results.filter((r) => r.status === "rejected").length;

  // Jika ada boothId + booth punya allowedFrameIds spesifik, tambahkan frame yang baru diimport
  if (boothId && imported > 0) {
    const successIds = results
      .map((r, i) => (r.status === "fulfilled" ? `fremio_sb_${framesToImport[i].fremioId}` : null))
      .filter(Boolean) as string[];
    const booth = await prisma.boothConfig.findFirst({
      where: { id: boothId, operatorId: session.user.id },
      select: { allowedFrameIds: true },
    });
    if (booth && booth.allowedFrameIds.length > 0) {
      const toAdd = successIds.filter((id) => !booth.allowedFrameIds.includes(id));
      if (toAdd.length > 0) {
        await prisma.boothConfig.update({
          where: { id: boothId },
          data: { allowedFrameIds: { push: toAdd } },
        });
      }
    }
  }

  return NextResponse.json<ApiResponse>({
    success: true,
    data: { imported, failed, total: framesToImport.length },
  });
}
