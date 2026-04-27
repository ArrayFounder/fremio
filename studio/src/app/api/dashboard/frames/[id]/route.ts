import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { ApiResponse } from "@/types";

// GET /api/dashboard/frames/[id] — get single frame data for editing
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const frame = await prisma.frame.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      category: true,
      thumbnailUrl: true,
      assetUrl: true,
      aspectRatio: true,
      canvasWidth: true,
      canvasHeight: true,
      isPremium: true,
      maxCaptures: true,
      captureMode: true,
      slots: true,
      designerId: true,
      isActive: true,
    },
  });

  if (!frame) return NextResponse.json<ApiResponse>({ success: false, error: "Frame not found" }, { status: 404 });

  // Allow access if user owns the frame or if it's a system frame (designerId = null)
  const isOwner = frame.designerId === session.user.id;
  const isSystemFrame = frame.designerId === null;

  if (!isOwner && !isSystemFrame) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json<ApiResponse>({ success: true, data: frame });
}

// PATCH /api/dashboard/frames/[id] — update field tertentu (captureMode, dll)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const schema = z.object({
    name:         z.string().min(1).max(100).optional(),
    category:     z.enum(["AESTHETIC","KOREAN","VINTAGE","MINIMALIST","BIRTHDAY","WEDDING","GRADUATION","SEASONAL","CUSTOM"]).optional(),
    thumbnailUrl: z.string().optional(),
    assetUrl:     z.string().optional(),
    aspectRatio:  z.string().optional(),
    canvasWidth:  z.number().int().positive().optional(),
    canvasHeight: z.number().int().positive().optional(),
    isPremium:    z.boolean().optional(),
    sortOrder:    z.number().int().optional(),
    maxCaptures:  z.number().int().min(1).max(12).optional(),
    captureMode:  z.enum(["single", "duplicate"]).optional(),
    slots:        z.any().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json<ApiResponse>({ success: false, error: "Invalid data" }, { status: 400 });

  const frame = await prisma.frame.findUnique({ where: { id: params.id } });
  if (!frame) return NextResponse.json<ApiResponse>({ success: false, error: "Frame not found" }, { status: 404 });

  // Frame milik designer: hanya pemilik yang boleh edit semua field.
  // Frame imported dari fremio.id (designerId = null): operator boleh update slots/captureMode/maxCaptures.
  const SLOT_FIELDS = new Set(["slots", "captureMode", "maxCaptures"]);
  const requestedFields = Object.keys(parsed.data);
  const isSlotOnlyUpdate = requestedFields.every((k) => SLOT_FIELDS.has(k));

  if (frame.designerId !== null && frame.designerId !== session.user.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Forbidden" }, { status: 403 });
  }
  if (frame.designerId === null && !isSlotOnlyUpdate) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Hanya slots/captureMode yang boleh diubah untuk frame ini" }, { status: 403 });
  }

  const updated = await prisma.frame.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json<ApiResponse>({ success: true, data: updated });
}

// DELETE /api/dashboard/frames/[id] — hapus/nonaktifkan frame
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  // Hanya hapus frame yang dibuat oleh operator ini
  const frame = await prisma.frame.findUnique({ where: { id: params.id } });
  if (!frame) return NextResponse.json<ApiResponse>({ success: false, error: "Frame not found" }, { status: 404 });
  if (frame.designerId !== session.user.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Forbidden" }, { status: 403 });
  }

  await prisma.frame.update({ where: { id: params.id }, data: { isActive: false } });

  return NextResponse.json<ApiResponse>({ success: true, data: null });
}
