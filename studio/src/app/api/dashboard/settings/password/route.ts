import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/types";

const schema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
  newPassword:     z.string().min(8, "Password baru minimal 8 karakter"),
});

// POST /api/dashboard/settings/password — ganti password
export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const operator = await prisma.operator.findUnique({
    where:  { id: session.user.id },
    select: { password: true },
  });
  if (!operator) return NextResponse.json<ApiResponse>({ success: false, error: "Operator tidak ditemukan" }, { status: 404 });

  if (!operator.password) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Akun ini tidak memiliki password. Gunakan Google Sign-in." },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, operator.password);
  if (!valid) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Password saat ini tidak sesuai" },
      { status: 400 }
    );
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.operator.update({ where: { id: session.user.id }, data: { password: hashed } });

  return NextResponse.json<ApiResponse>({ success: true, data: null });
}
