import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { ApiResponse } from "@/types";

// PATCH /api/dashboard/frames/[id] — update field tertentu (captureMode, dll)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const schema = z.object({
    captureMode: z.enum(["single", "duplicate"]).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json<ApiResponse>({ success: false, error: "Invalid data" }, { status: 400 });

  await prisma.frame.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json<ApiResponse>({ success: true, data: null });
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
