import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions/[id]/complete
//
// Dipanggil booth UI setelah foto berhasil diupload ke R2 oleh browser.
// Menerima: multipart/form-data { frameId?: string, photoUrl: string, videoUrl?: string }
// Returns: { photoUrl, videoUrl, qrCode, downloadUrl }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await prisma.boothSession.findUnique({
    where: { id: params.id },
  });

  if (!session) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Sesi tidak ditemukan" },
      { status: 404 }
    );
  }

  if (session.status !== "ACTIVE") {
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Sesi berstatus ${session.status}, bukan ACTIVE` },
      { status: 409 }
    );
  }

  const form     = await req.formData();
  const photoUrl = (form.get("photoUrl") as string | null) ?? session.photoUrl;
  const requestedFrameId = (form.get("frameId") as string | null) ?? session.frameId;
  const videoUrl = (form.get("videoUrl") as string | null) ?? session.videoUrl ?? null;

  if (!photoUrl) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "photoUrl wajib dikirim" },
      { status: 422 }
    );
  }

  // Buat qrCode unik untuk halaman download customer
  const { randomUUID } = await import("crypto");
  const qrCode  = randomUUID();
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://studio.fremio.id";

  let safeFrameId: string | null | undefined = undefined;
  if (requestedFrameId) {
    const existingFrame = await prisma.frame.findUnique({
      where: { id: requestedFrameId },
      select: { id: true },
    });
    safeFrameId = existingFrame?.id ?? null;
  }

  const updated = await prisma.boothSession.update({
    where: { id: params.id },
    data: {
      status:      "COMPLETED",
      photoUrl,
      frameId:     safeFrameId,
      videoUrl:    videoUrl ?? undefined,
      qrCode,
      completedAt: new Date(),
    },
  });

  return NextResponse.json<ApiResponse>({
    success: true,
    data: {
      photoUrl:    updated.photoUrl,
      videoUrl:    updated.videoUrl ?? null,
      qrCode:      updated.qrCode,
      downloadUrl: `${appUrl}/download/${qrCode}`,
    },
  });
}
