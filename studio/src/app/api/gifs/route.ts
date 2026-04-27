import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadPhoto, buildGifKey } from "@/lib/r2";
import type { ApiResponse } from "@/types";

// POST /api/gifs — upload animated GIF slideshow dari booth
// Menyimpan URL GIF ke BoothSession.gifUrl
export async function POST(req: Request) {
  const formData  = await req.formData();
  const sessionId = formData.get("sessionId") as string;
  const file      = formData.get("gif") as File | null;

  if (!sessionId || !file) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "sessionId dan gif wajib diisi" },
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

  const key       = buildGifKey(sessionId);
  const buffer    = Buffer.from(await file.arrayBuffer());
  const publicUrl = await uploadPhoto(key, buffer, "image/gif");

  const updated = await prisma.boothSession.update({
    where: { id: sessionId },
    data:  { gifUrl: publicUrl },
    select: { id: true, gifUrl: true },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: { gifUrl: updated.gifUrl } }, { status: 201 });
}
