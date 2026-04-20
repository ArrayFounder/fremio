import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadPhoto, buildPhotoKey } from "@/lib/r2";
import type { ApiResponse } from "@/types";

// POST /api/photos — upload foto dari booth (dipanggil booth UI / agent)
// Menyimpan URL foto ke BoothSession.photoUrl
export async function POST(req: Request) {
  const formData  = await req.formData();
  const sessionId = formData.get("sessionId") as string;
  const file      = formData.get("photo") as File | null;

  if (!sessionId || !file) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "sessionId dan photo wajib diisi" },
      { status: 422 }
    );
  }

  const session = await prisma.boothSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });

  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Sesi tidak ditemukan" },
      { status: 404 }
    );
  }

  const key       = buildPhotoKey(sessionId, Date.now());
  const buffer    = Buffer.from(await file.arrayBuffer());
  const publicUrl = await uploadPhoto(key, buffer, file.type);

  const updated = await prisma.boothSession.update({
    where: { id: sessionId },
    data:  { photoUrl: publicUrl },
    select: { id: true, photoUrl: true, status: true },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: updated }, { status: 201 });
}
