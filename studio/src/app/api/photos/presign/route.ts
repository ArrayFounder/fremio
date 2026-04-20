import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

// GET /api/photos/presign — tidak digunakan dalam mode local storage
export async function GET(): Promise<Response> {
  return NextResponse.json<ApiResponse>(
    { success: false, error: "Presigned upload tidak tersedia dalam mode penyimpanan lokal. Gunakan POST /api/photos." },
    { status: 410 }
  );
}
