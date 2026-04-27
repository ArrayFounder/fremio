import { NextResponse } from "next/server";
import { uploadPhoto, buildRawPhotoKey } from "@/lib/r2";
import type { ApiResponse } from "@/types";

// POST /api/raw-photos — upload foto mentah per-capture (tanpa frame)
// Input: FormData { sessionId, photo (File), index (number) }
// Returns: { photoUrl: string }
export async function POST(req: Request) {
  const formData  = await req.formData();
  const sessionId = formData.get("sessionId") as string | null;
  const file      = formData.get("photo") as File | null;
  const indexStr  = formData.get("index") as string | null;

  if (!sessionId || !file) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "sessionId dan photo wajib diisi" },
      { status: 422 }
    );
  }

  const index  = indexStr !== null ? parseInt(indexStr, 10) : 0;
  const key    = buildRawPhotoKey(sessionId, isNaN(index) ? 0 : index);
  const buffer = Buffer.from(await file.arrayBuffer());
  const publicUrl = await uploadPhoto(key, buffer, file.type);

  return NextResponse.json<ApiResponse>(
    { success: true, data: { photoUrl: publicUrl } },
    { status: 201 }
  );
}
