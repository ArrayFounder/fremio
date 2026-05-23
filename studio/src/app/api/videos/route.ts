import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadPhoto, buildVideoKey } from "@/lib/r2";
import type { ApiResponse } from "@/types";

// POST /api/videos — upload video Live Mode dari booth
// Browser merekam dalam WebM container (VP8/VP9/H.264), disimpan sebagai .webm.
// Menyimpan URL video ke BoothSession.videoUrl
export async function POST(req: Request) {
  const formData  = await req.formData();
  const sessionId = formData.get("sessionId") as string;
  const file      = formData.get("video") as File | null;

  console.log("[POST /api/videos] sessionId =", sessionId, "file =", file ? `File(${file.name}, ${file.size} bytes)` : null);

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

  console.log("[POST /api/videos] session found:", session?.id, "status:", session?.status);

  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Sesi tidak ditemukan" },
      { status: 404 }
    );
  }

  const key       = buildVideoKey(sessionId);
  const buffer    = Buffer.from(await file.arrayBuffer());
  console.log("[POST /api/videos] uploading buffer:", buffer.length, "bytes, key:", key);
  const publicUrl = await uploadPhoto(key, buffer, "video/webm");
  console.log("[POST /api/videos] upload done, publicUrl:", publicUrl);

  const updated = await prisma.boothSession.update({
    where: { id: sessionId },
    data:  { videoUrl: publicUrl },
    select: { id: true, videoUrl: true },
  });
  console.log("[POST /api/videos] updated session videoUrl:", updated.videoUrl);

  return NextResponse.json<ApiResponse>({ success: true, data: { videoUrl: updated.videoUrl } }, { status: 201 });
}
