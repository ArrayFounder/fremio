import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadPhoto, buildVideoKey } from "@/lib/r2";
import type { ApiResponse } from "@/types";

// POST /api/videos — upload video Live Mode dari booth (WebM dari MediaRecorder)
// Menyimpan URL video ke BoothSession.videoUrl
export async function POST(req: Request) {
  const formData  = await req.formData();
  const sessionId = formData.get("sessionId") as string;
  const file      = formData.get("video") as File | null;

  if (!sessionId || !file) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "sessionId dan video wajib diisi" },
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

  const key       = buildVideoKey(sessionId, file.type || "video/webm");
  const buffer    = Buffer.from(await file.arrayBuffer());
  const publicUrl = await uploadPhoto(key, buffer, file.type || "video/webm");

  const updated = await prisma.boothSession.update({
    where: { id: sessionId },
    data:  { videoUrl: publicUrl },
    select: { id: true, videoUrl: true },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: { videoUrl: updated.videoUrl } }, { status: 201 });
}
