import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const updateSchema = z.object({
  boothName:              z.string().min(2).trim().optional(),
  slug:                   z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Slug hanya boleh huruf kecil, angka, dan tanda hubung").optional(),
  pricePerSession:        z.number().int().min(1000).optional(),
  printPricePerSheet:     z.number().int().min(0).optional(),
  sessionDurationSeconds: z.number().int().min(60).max(1800).optional(),
  printEnabled:           z.boolean().optional(),
  primaryColor:           z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor:            z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive:               z.boolean().optional(),
  allowedFrameIds:        z.array(z.string()).optional(),
  welcomeScreenPrefs:     z.record(z.unknown()).optional().nullable(),
  timerTutorialSeconds:    z.number().int().min(0).max(3600).optional(),
  timerFrameSelectSeconds: z.number().int().min(0).max(3600).optional(),
  timerPrintCountSeconds:  z.number().int().min(0).max(3600).optional(),
  timerPaymentSeconds:     z.number().int().min(0).max(3600).optional(),
  timerCameraSeconds:      z.number().int().min(0).max(3600).optional(),
  timerPreviewSeconds:     z.number().int().min(0).max(3600).optional(),
  timerDeliverySeconds:    z.number().int().min(0).max(3600).optional(),
  photoSessionMode:        z.enum(["live_view", "fullscreen"]).optional(),
});

// Pastikan booth milik operator yang login, sekaligus kembalikan data booth
async function getOwnedBooth(boothId: string, operatorId: string) {
  const b = await prisma.boothConfig.findUnique({
    where: { id: boothId },
    select: { operatorId: true, primaryColor: true, welcomeScreenPrefs: true, slugUpdatedAt: true } as any,
  }) as any;
  if (!b || b.operatorId !== operatorId) return null;
  return b;
}

// PATCH /api/dashboard/booths/[id]
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const current = await getOwnedBooth(params.id, session.user.id);
  if (!current) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  }

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // Cek batasan 1 hari untuk perubahan slug
  if (parsed.data.slug) {
    const lastChange = (current as any).slugUpdatedAt;
    if (lastChange) {
      const now = new Date();
      const lastChangeDate = new Date(lastChange);
      const diffHours = (now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        const remaining = Math.ceil(24 - diffHours);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: `Link booth hanya bisa diubah 1 kali per hari. Tunggu ${remaining} jam lagi.`,
        }, { status: 429 });
      }
    }
  }

  const { welcomeScreenPrefs, ...rest } = parsed.data;
  const updateData: Prisma.BoothConfigUpdateInput = { ...rest };

  // Jika slug diubah, catat waktu perubahan
  if (parsed.data.slug) {
    (updateData as Prisma.BoothConfigUpdateInput & { slugUpdatedAt?: Date }).slugUpdatedAt = new Date();
  }
  if (welcomeScreenPrefs !== undefined) {
    // Caller explicitly set welcomeScreenPrefs
    updateData.welcomeScreenPrefs = welcomeScreenPrefs === null
      ? Prisma.JsonNull
      : (welcomeScreenPrefs as Prisma.InputJsonValue);
  } else if (parsed.data.primaryColor && parsed.data.primaryColor !== current.primaryColor) {
    // primaryColor changed — sync backgroundColor in welcomeScreenPrefs if it matched old primaryColor
    const existingPrefs = current.welcomeScreenPrefs as Record<string, unknown> | null;
    if (existingPrefs && existingPrefs.backgroundColor === current.primaryColor) {
      updateData.welcomeScreenPrefs = {
        ...existingPrefs,
        backgroundColor: parsed.data.primaryColor,
      } as Prisma.InputJsonValue;
    }
  }

  const updated = await prisma.boothConfig.update({
    where: { id: params.id },
    data:  updateData,
  });

  return NextResponse.json<ApiResponse>({ success: true, data: updated });
}

// DELETE /api/dashboard/booths/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  if (!(await getOwnedBooth(params.id, session.user.id))) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Booth tidak ditemukan" }, { status: 404 });
  }

  // Soft-delete: set isActive = false agar data sesi tetap terjaga
  await prisma.boothConfig.update({ where: { id: params.id }, data: { isActive: false } });

  return NextResponse.json<ApiResponse>({ success: true, data: null });
}
