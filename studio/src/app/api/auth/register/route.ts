import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { ApiResponse } from "@/types";

const schema = z.object({
  email:        z.string().email().toLowerCase().trim(),
  password:     z.string().min(8),
  businessName: z.string().min(2).trim(),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiResponse>({ success: false, error: "Request harus JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input tidak valid", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { email, password, businessName } = parsed.data;

  const existing = await prisma.operator.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Email sudah terdaftar" },
      { status: 409 }
    );
  }

  const hashed   = await bcrypt.hash(password, 12);
  const operator = await prisma.operator.create({
    data: { email, password: hashed, businessName },
    select: { id: true, email: true, businessName: true },
  });

  return NextResponse.json<ApiResponse>({ success: true, data: operator }, { status: 201 });
}
